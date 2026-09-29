export const SCENE_DURATIONS = [7000, 6000, 6000, 11000, 6000, 4000];
export const SCENE_STARTS = [0, 7000, 13000, 19000, 30000, 36000];
export const TOTAL_DURATION = 40000;
export const TIMING = {
  zoomIn: 4000,
  focused: 7000,
  reset: 7000,
  breakout: 7000,
  follow: 13000,
  retest: 19000,
  absorption: 22000,
  refill: 23000,
  push: 30000,
  zoomOut: 36000,
  panorama: 39000,
};
export const SUPPORT = 104;
export const IMBALANCE_RATIO = 3;
export const clamp = (value) => Math.max(0, Math.min(1, value));
export const ease = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
export const BAR_RANGES = [
  [-30000, -24000],
  [-24000, -18000],
  [-18000, -12000],
  [-12000, -6000],
  [-6000, 0],
  [7000, 13000],
  [13000, 19000],
  [19000, 22000],
  [22000, 30000],
  [30000, 36000],
].map(([startAt, endAt], index) => ({
  index,
  startAt,
  endAt,
  label: "14:" + (25 + index),
}));
export function scenePosition(scene, elapsed, reduced = false) {
  const playhead =
    SCENE_STARTS[scene] +
    Math.max(0, Math.min(SCENE_DURATIONS[scene], elapsed));
  return {
    scene,
    elapsed,
    playhead,
    time: playhead,
    reduced,
    mode: ["overview", "breakout", "follow", "retest", "push", "result"][scene],
  };
}

export function eventPosition(at, barIndex) {
  const range = BAR_RANGES[barIndex];
  const fraction = clamp((at - range.startAt) / (range.endAt - range.startAt));
  return { barIndex, fraction, x: barIndex + fraction };
}
export function timePosition(at) {
  if (at <= BAR_RANGES[0].startAt) return 0;
  if (at >= BAR_RANGES[9].endAt) return 10;
  const range = BAR_RANGES.find((row) => at >= row.startAt && at <= row.endAt);
  return range ? eventPosition(at, range.index).x : 5;
}
export function footprintOf(trades, ratio = IMBALANCE_RATIO) {
  const values = new Map();
  for (const trade of trades) {
    const row = values.get(trade.price) ?? {
      price: trade.price,
      bid: 0,
      ask: 0,
    };
    row[trade.side === "buy" ? "ask" : "bid"] += trade.size;
    values.set(trade.price, row);
  }
  return [...values.values()]
    .sort((a, b) => b.price - a.price)
    .map((row) => {
      const lowerBid = values.get(row.price - 1)?.bid ?? 0;
      const higherAsk = values.get(row.price + 1)?.ask ?? 0;
      return {
        ...row,
        buy: row.ask,
        sell: row.bid,
        volume: row.bid + row.ask,
        buyImbalance: lowerBid > 0 && row.ask >= ratio * lowerBid,
        sellImbalance: higherAsk > 0 && row.bid >= ratio * higherAsk,
        buyRatio: lowerBid ? row.ask / lowerBid : null,
        sellRatio: higherAsk ? row.bid / higherAsk : null,
        buyComparison: lowerBid,
        sellComparison: higherAsk,
      };
    });
}
export function candleFromTrades(trades, index, closed = true) {
  if (!trades.length) return null;
  const buy = trades
    .filter((row) => row.side === "buy")
    .reduce((sum, row) => sum + row.size, 0);
  const sell = trades
    .filter((row) => row.side === "sell")
    .reduce((sum, row) => sum + row.size, 0);
  return {
    ...BAR_RANGES[index],
    duration: 60000,
    open: trades[0].price,
    high: Math.max(...trades.map((row) => row.price)),
    low: Math.min(...trades.map((row) => row.price)),
    close: trades.at(-1).price,
    volume: buy + sell,
    delta: buy - sell,
    buy,
    sell,
    closed,
    rows: trades,
    footprint: footprintOf(trades),
    cvd: trades.at(-1).cvd,
  };
}
const keyOf = (side, price) => side + ":" + price;
const bookRows = (book, side) =>
  [...book.values()]
    .filter((row) => row.side === side && row.size > 0)
    .sort((a, b) => (side === "buy" ? b.price - a.price : a.price - b.price))
    .map((row) => ({ ...row }));
export function applyLedgerEvent(book, event) {
  if (
    !["add", "cancel", "trade"].includes(event.kind) ||
    !["buy", "sell"].includes(event.side) ||
    !Number.isFinite(event.price) ||
    event.price <= 0 ||
    !Number.isFinite(event.size) ||
    event.size <= 0
  )
    throw new RangeError("Invalid ledger event");
  const restingSide =
    event.kind === "trade"
      ? event.side === "buy"
        ? "sell"
        : "buy"
      : event.side;
  const key = keyOf(restingSide, event.price),
    beforeSize = book.get(key)?.size ?? 0;
  if (event.kind === "trade") {
    const best = bookRows(book, restingSide)[0];
    if (!best || best.price !== event.price)
      throw new RangeError(
        "Trade must consume the best available opposing quote",
      );
  }
  const afterSize =
    beforeSize + (event.kind === "add" ? event.size : -event.size);
  if (afterSize < 0)
    throw new RangeError(
      "Cannot execute or cancel more resting quantity than exists",
    );
  const next = new Map(book);
  if (afterSize)
    next.set(key, {
      side: restingSide,
      bookSide: restingSide === "buy" ? "bid" : "ask",
      price: event.price,
      size: afterSize,
    });
  else next.delete(key);
  const bid = bookRows(next, "buy")[0],
    ask = bookRows(next, "sell")[0];
  if (bid && ask && bid.price >= ask.price)
    throw new RangeError("Unexecuted book may not be crossed");
  return { book: next, beforeSize, afterSize, restingSide };
}
export function createBreakoutVolumeStory() {
  const raw = [];
  const push = (at, barIndex, kind, side, price, size, note = "") =>
    raw.push({
      at,
      ...eventPosition(at, barIndex),
      kind,
      type: kind,
      side,
      price,
      size,
      note,
    });
  const histories = [
    [
      [99, 5, "buy"],
      [101, 5, "buy"],
      [98, 5, "sell"],
      [100, 5, "buy"],
    ],
    [
      [100, 5, "buy"],
      [102, 5, "buy"],
      [99, 5, "sell"],
      [101, 5, "buy"],
    ],
    [
      [101, 5, "buy"],
      [103, 5, "buy"],
      [100, 5, "sell"],
      [102, 5, "buy"],
    ],
    [
      [102, 5, "buy"],
      [104, 5, "buy"],
      [101, 5, "sell"],
      [103, 5, "buy"],
    ],
    [
      [103, 5, "buy"],
      [104, 5, "buy"],
      [102, 5, "sell"],
      [103, 5, "buy"],
    ],
  ];
  for (const [barIndex, values] of histories.entries()) {
    const range = BAR_RANGES[barIndex];
    for (const [index, [price, size, side]] of values.entries()) {
      const at = range.startAt + (index + 1) * 1200;
      push(
        at - 100,
        barIndex,
        "add",
        side === "buy" ? "sell" : "buy",
        price,
        size,
        "歷史掛單",
      );
      push(at, barIndex, "trade", side, price, size, "歷史成交");
    }
  }
  const add = (at, bar, side, price, size, note) =>
    push(at, bar, "add", side, price, size, note);
  const trade = (at, bar, side, price, size) =>
    push(
      at,
      bar,
      "trade",
      side,
      price,
      size,
      "主動" + (side === "buy" ? "買入" : "賣出"),
    );
  add(7000, 5, "buy", 102, 60, "下方掛買");
  add(7000, 5, "sell", 103, 10, "103 掛賣");
  add(7000, 5, "sell", 104, 30, "原壓力104掛賣");
  add(7000, 5, "sell", 105, 30, "105 掛賣");
  add(7000, 5, "sell", 106, 100, "106 掛賣");
  add(7000, 5, "sell", 107, 40, "107 掛賣");
  add(7000, 5, "sell", 108, 40, "108 掛賣");
  add(7000, 5, "sell", 109, 40, "109 掛賣");
  trade(7600, 5, "buy", 103, 10);
  trade(8500, 5, "buy", 104, 30);
  add(8800, 5, "buy", 104, 80, "104 新掛買80");
  trade(9400, 5, "buy", 105, 30);
  trade(10300, 5, "buy", 106, 30);
  add(10800, 5, "buy", 105, 50, "上方新增掛買");
  trade(11400, 5, "sell", 105, 10);
  trade(12200, 5, "buy", 106, 10);
  trade(13600, 6, "buy", 106, 20);
  trade(14300, 6, "sell", 105, 10);
  trade(15000, 6, "buy", 106, 20);
  trade(15800, 6, "sell", 105, 10);
  trade(16600, 6, "buy", 106, 20);
  trade(17800, 6, "buy", 107, 40);
  add(18000, 6, "buy", 106, 30, "106 新掛買");
  add(19000, 7, "sell", 107, 10, "107 新掛賣");
  trade(19200, 7, "buy", 107, 10);
  trade(19800, 7, "sell", 106, 30);
  trade(20500, 7, "sell", 105, 20);
  trade(21300, 7, "sell", 104, 40);
  trade(22600, 8, "sell", 104, 40);
  add(23000, 8, "buy", 104, 100, "104 補入掛買100");
  trade(24000, 8, "sell", 104, 60);
  add(24200, 8, "sell", 105, 20, "105 新掛賣");
  trade(24600, 8, "buy", 105, 20);
  trade(25000, 8, "sell", 104, 40);
  add(25500, 8, "buy", 104, 80, "104 補入掛買80");
  trade(26300, 8, "sell", 104, 50);
  trade(27000, 8, "sell", 104, 30);
  add(27400, 8, "buy", 104, 60, "104 補入掛買60");
  trade(28200, 8, "sell", 104, 20);
  add(30100, 9, "sell", 105, 30, "105 新掛賣");
  add(30100, 9, "sell", 106, 30, "106 新掛賣");
  add(30100, 9, "sell", 107, 30, "107 新掛賣");
  trade(30600, 9, "buy", 105, 30);
  trade(31400, 9, "buy", 106, 30);
  trade(32200, 9, "buy", 107, 30);
  add(32500, 9, "buy", 106, 10, "106 新掛買");
  trade(33000, 9, "sell", 106, 10);
  trade(33800, 9, "buy", 108, 40);
  trade(34800, 9, "buy", 109, 40);
  raw.sort((a, b) => a.at - b.at);
  let book = new Map(),
    cvd = 0,
    volume = 0,
    price = null;
  const events = raw.map((event, index) => {
    const result = applyLedgerEvent(book, event);
    book = result.book;
    const delta =
      event.kind === "trade" ? event.size * (event.side === "buy" ? 1 : -1) : 0;
    cvd += delta;
    if (event.kind === "trade") {
      volume += event.size;
      price = event.price;
    }
    return {
      ...event,
      id: "event-" + index,
      delta,
      cvd,
      cumulativeVolume: volume,
      lastPrice: price,
      beforeSize: result.beforeSize,
      afterSize: result.afterSize,
      restingSide: result.restingSide,
      bookSide: result.restingSide === "buy" ? "bid" : "ask",
    };
  });
  const trades = events.filter((event) => event.kind === "trade");
  const bars = BAR_RANGES.map((range) =>
    candleFromTrades(
      trades.filter((row) => row.barIndex === range.index),
      range.index,
    ),
  );
  return {
    events,
    ledger: events,
    trades,
    fills: trades,
    quoteEvents: events.filter((event) => event.kind !== "trade"),
    bars,
    barRanges: BAR_RANGES,
    selectedIndex: 5,
    breakoutIndex: 5,
    supportIndex: 8,
    level: SUPPORT,
    support: SUPPORT,
    baseline: 20,
    imbalanceRatio: IMBALANCE_RATIO,
  };
}

export function heatHistory(events, effectiveTime) {
  let book = new Map(),
    priorAt = events[0]?.at ?? effectiveTime;
  let priorX = timePosition(priorAt);
  const heatSegments = [];
  const extend = (at, x) => {
    if (x <= priorX) return;
    for (const row of book.values())
      heatSegments.push({
        ...row,
        x0: priorX,
        x1: x,
        startAt: priorAt,
        endAt: at,
      });
  };
  for (const event of events) {
    extend(event.at, event.x);
    book = applyLedgerEvent(book, event).book;
    priorAt = event.at;
    priorX = event.x;
  }
  extend(effectiveTime, timePosition(effectiveTime));
  return {
    heatSegments,
    bids: bookRows(book, "buy"),
    asks: bookRows(book, "sell"),
  };
}
export function breakoutVolumeSnapshot(story, playhead) {
  const time = Math.max(0, Math.min(TOTAL_DURATION, playhead));
  const preview = time < TIMING.reset,
    replay = time >= TIMING.reset && time < TIMING.zoomOut;
  const effectiveTime = preview
    ? TIMING.zoomOut
    : Math.min(time, TIMING.zoomOut);
  const events = story.events.filter((event) => event.at <= effectiveTime);
  const trades = events.filter((event) => event.kind === "trade");
  const latestEvent = events.at(-1) ?? null,
    latestTrade = trades.at(-1) ?? null;
  const bars = BAR_RANGES.map((range) =>
    candleFromTrades(
      trades.filter((row) => row.barIndex === range.index),
      range.index,
      effectiveTime >= range.endAt,
    ),
  );
  const cvdPoints = trades.map((row) => ({
    id: row.id,
    x: row.x,
    fraction: row.fraction,
    at: row.at,
    barIndex: row.barIndex,
    cvd: row.cvd,
    value: row.cvd,
    delta: row.delta,
    price: row.price,
    side: row.side,
    size: row.size,
  }));
  const heat = heatHistory(events, effectiveTime);
  const activeBarIndex =
    preview || time >= TIMING.zoomOut
      ? 9
      : effectiveTime < 13000
        ? 5
        : effectiveTime < 19000
          ? 6
          : effectiveTime < 22000
            ? 7
            : effectiveTime < 30000
              ? 8
              : 9;
  return {
    time,
    effectiveTime,
    preview,
    replay,
    bars,
    trades,
    events,
    quoteEvents: events.filter((event) => event.kind !== "trade"),
    cvdPoints,
    cvd: latestTrade?.cvd ?? 0,
    volume: latestTrade?.cumulativeVolume ?? 0,
    price: latestTrade?.price ?? null,
    chartPrice: latestTrade?.price ?? null,
    latestEvent,
    latestTrade,
    event: latestEvent,
    latest: latestTrade,
    ...heat,
    activeBarIndex,
    selectedIndex: 5,
    currentBar: bars[activeBarIndex],
    footprint: bars[activeBarIndex]?.footprint ?? [],
    barDelta: bars.map((bar) => bar?.delta ?? 0),
    cursorX: timePosition(effectiveTime),
    level: SUPPORT,
    support: SUPPORT,
    baseline: story.baseline,
    ratio: (bars[5]?.volume ?? 0) / story.baseline,
    supportRemaining: heat.bids.find((row) => row.price === SUPPORT)?.size ?? 0,
  };
}
