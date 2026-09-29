export const SCENE_DURATIONS = [6000, 8000, 8000, 10000, 10000, 6000];
export const SCENE_STARTS = [0, 6000, 14000, 22000, 32000, 42000];
export const TOTAL_DURATION = 48000;
export const TIMING = {
  zoomIn: 4000, focused: 7000, reset: 7000,
  absorbed: 12800, withdrawal: 13500, breakout: 14000,
  higher: 17000, refill: 23300, highAbsorption: 22000,
  selling: 32000, zoomOut: 42000, panorama: 46000,
};
export const PRESSURE = 104;
export const IMBALANCE_RATIO = 3;
export const clamp = value => Math.max(0, Math.min(1, value));
export const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
export const BAR_RANGES = [
  [-30000, -24000], [-24000, -18000], [-18000, -12000],
  [-12000, -6000], [-6000, 0], [7000, 14000],
  [14000, 22000], [22000, 32000], [32000, 42000],
].map(([startAt, endAt], index) => ({ index, startAt, endAt, label: "14:" + (25 + index) }));
export function scenePosition(scene, elapsed, reduced = false) {
  const playhead = SCENE_STARTS[scene] + Math.max(0, Math.min(SCENE_DURATIONS[scene], elapsed));
  return { scene, elapsed, playhead, time: playhead, reduced, mode: ["overview", "pressure", "breakout", "absorption", "selling", "result"][scene] };
}
export function eventPosition(at, barIndex) {
  const range = BAR_RANGES[barIndex];
  const fraction = clamp((at - range.startAt) / (range.endAt - range.startAt));
  return { barIndex, fraction, x: barIndex + fraction };
}
export function timePosition(at) {
  if (at <= BAR_RANGES[0].startAt) return 0;
  if (at >= BAR_RANGES[8].endAt) return 9;
  const range = BAR_RANGES.find(row => at >= row.startAt && at <= row.endAt);
  return range ? eventPosition(at, range.index).x : 5;
}
export function footprintOf(trades, ratio = IMBALANCE_RATIO) {
  const values = new Map();
  for (const trade of trades) {
    const row = values.get(trade.price) ?? { price: trade.price, bid: 0, ask: 0 };
    row[trade.side === "buy" ? "ask" : "bid"] += trade.size;
    values.set(trade.price, row);
  }
  return [...values.values()].sort((a, b) => b.price - a.price).map(row => {
    const lowerBid = values.get(row.price - 1)?.bid ?? 0;
    const higherAsk = values.get(row.price + 1)?.ask ?? 0;
    return {
      ...row, buy: row.ask, sell: row.bid, volume: row.bid + row.ask,
      buyImbalance: lowerBid > 0 && row.ask >= ratio * lowerBid,
      sellImbalance: higherAsk > 0 && row.bid >= ratio * higherAsk,
      buyRatio: lowerBid ? row.ask / lowerBid : null,
      sellRatio: higherAsk ? row.bid / higherAsk : null,
      buyComparison: lowerBid, sellComparison: higherAsk,
    };
  });
}
export function candleFromTrades(trades, index, closed = true) {
  if (!trades.length) return null;
  const buy = trades.filter(row => row.side === "buy").reduce((sum, row) => sum + row.size, 0);
  const sell = trades.filter(row => row.side === "sell").reduce((sum, row) => sum + row.size, 0);
  return {
    ...BAR_RANGES[index], open: trades[0].price, high: Math.max(...trades.map(row => row.price)),
    low: Math.min(...trades.map(row => row.price)), close: trades.at(-1).price,
    volume: buy + sell, delta: buy - sell, buy, sell, closed, rows: trades,
    footprint: footprintOf(trades), cvd: trades.at(-1).cvd,
  };
}
const keyOf = (side, price) => side + ":" + price;
const bookRows = (book, side) => [...book.values()].filter(row => row.side === side && row.size > 0)
  .sort((a, b) => side === "buy" ? b.price - a.price : a.price - b.price).map(row => ({ ...row }));
export function applyLedgerEvent(book, event) {
  if (!["add", "cancel", "trade"].includes(event.kind) || !["buy", "sell"].includes(event.side) ||
      !Number.isFinite(event.price) || event.price <= 0 || !Number.isFinite(event.size) || event.size <= 0)
    throw new RangeError("Invalid ledger event");
  const restingSide = event.kind === "trade" ? event.side === "buy" ? "sell" : "buy" : event.side;
  const key = keyOf(restingSide, event.price), beforeSize = book.get(key)?.size ?? 0;
  if (event.kind === "trade") {
    const best = bookRows(book, restingSide)[0];
    if (!best || best.price !== event.price) throw new RangeError("Trade must consume the best available opposing quote");
  }
  const afterSize = beforeSize + (event.kind === "add" ? event.size : -event.size);
  if (afterSize < 0) throw new RangeError("Cannot execute or cancel more resting quantity than exists");
  const next = new Map(book);
  if (afterSize) next.set(key, { side: restingSide, bookSide: restingSide === "buy" ? "bid" : "ask", price: event.price, size: afterSize });
  else next.delete(key);
  const bid = bookRows(next, "buy")[0], ask = bookRows(next, "sell")[0];
  if (bid && ask && bid.price >= ask.price) throw new RangeError("Unexecuted book may not be crossed");
  return { book: next, beforeSize, afterSize, restingSide };
}
export function createAbsorptionStory() {
  const raw = [];
  const push = (at, barIndex, kind, side, price, size, note = "") => raw.push({ at, ...eventPosition(at, barIndex), kind, type: kind, side, price, size, note });
  const histories = [
    [[98,4,"buy"],[99,6,"buy"],[98,5,"sell"],[99,5,"buy"]],
    [[99,4,"buy"],[100,5,"buy"],[99,5,"sell"],[100,6,"buy"]],
    [[100,5,"buy"],[102,5,"buy"],[101,5,"sell"],[102,5,"buy"]],
    [[102,5,"buy"],[103,15,"buy"],[103,10,"sell"],[104,60,"buy"],[103,10,"sell"]],
    [[103,10,"buy"],[102,10,"sell"],[103,30,"buy"],[104,60,"buy"],[103,10,"sell"]],
  ];
  for (const [barIndex, values] of histories.entries()) {
    const range = BAR_RANGES[barIndex];
    for (const [index, [price, size, side]] of values.entries()) {
      const at = range.startAt + Math.round((index + 1) * (range.endAt - range.startAt) / (values.length + 1));
      push(at - 100, barIndex, "add", side === "buy" ? "sell" : "buy", price, size, "歷史掛單");
      push(at, barIndex, "trade", side, price, size, "歷史成交");
    }
  }
  const add = (at, bar, side, price, size, note) => push(at, bar, "add", side, price, size, note);
  const trade = (at, bar, side, price, size) => push(at, bar, "trade", side, price, size, "主動" + (side === "buy" ? "買入" : "賣出"));
  add(7000,5,"buy",102,100,"下方掛買");
  add(7000,5,"sell",104,180,"104 掛賣牆");
  add(7000,5,"sell",105,30,"上方掛賣");
  add(7000,5,"sell",106,100,"高位掛賣");
  add(7200,5,"sell",103,10,"103 新掛賣");
  trade(7800,5,"buy",103,10);
  add(8000,5,"buy",103,20,"103 新掛買");
  trade(8300,5,"sell",103,10);
  trade(9200,5,"buy",104,60);
  trade(10600,5,"buy",104,30);
  trade(11800,5,"sell",103,10);
  trade(12800,5,"buy",104,30);
  push(13500,5,"cancel","sell",104,50,"104 撤掉 50");
  trade(14800,6,"buy",104,10);
  add(15100,6,"buy",104,60,"104 新掛買");
  trade(16000,6,"buy",105,30);
  trade(17000,6,"buy",106,20);
  add(17400,6,"buy",105,80,"105 新掛買");
  trade(18000,6,"sell",105,10);
  trade(19200,6,"buy",106,20);
  trade(20500,6,"buy",106,20);
  trade(22800,7,"buy",106,40);
  add(23300,7,"sell",106,120,"106 補入掛賣 120");
  trade(24300,7,"buy",106,70);
  trade(25300,7,"sell",105,10);
  trade(26300,7,"buy",106,50);
  add(27000,7,"sell",106,100,"106 補入掛賣 100");
  trade(28000,7,"buy",106,60);
  trade(29000,7,"sell",105,10);
  trade(30000,7,"buy",106,40);
  add(30700,7,"sell",106,80,"106 補入掛賣 80");
  add(31000,7,"buy",103,70,"下方新掛買");
  trade(32600,8,"buy",106,10);
  trade(33500,8,"sell",105,50);
  add(33800,8,"sell",105,10,"105 新掛賣");
  trade(34100,8,"buy",105,10);
  trade(35000,8,"sell",104,60);
  add(35800,8,"sell",104,10,"104 新掛賣");
  trade(36000,8,"buy",104,10);
  trade(37000,8,"sell",103,70);
  add(37400,8,"sell",103,10,"103 新掛賣");
  trade(38000,8,"buy",103,10);
  trade(39000,8,"sell",102,80);
  trade(40000,8,"sell",102,20);
  raw.sort((a, b) => a.at - b.at);
  let book = new Map(), cvd = 0, volume = 0, price = null;
  const events = raw.map((event, index) => {
    const result = applyLedgerEvent(book, event);
    book = result.book;
    const delta = event.kind === "trade" ? event.size * (event.side === "buy" ? 1 : -1) : 0;
    cvd += delta;
    if (event.kind === "trade") { volume += event.size; price = event.price; }
    return { ...event, id: "event-" + index, delta, cvd, cumulativeVolume: volume, lastPrice: price,
      beforeSize: result.beforeSize, afterSize: result.afterSize, restingSide: result.restingSide,
      bookSide: result.restingSide === "buy" ? "bid" : "ask" };
  });
  const trades = events.filter(event => event.kind === "trade");
  return {
    events, ledger: events, trades, fills: trades, quoteEvents: events.filter(event => event.kind !== "trade"),
    bars: BAR_RANGES.map(range => candleFromTrades(trades.filter(row => row.barIndex === range.index), range.index)),
    barRanges: BAR_RANGES, selectedIndex: 5, pressure: PRESSURE, initialWall: 180, imbalanceRatio: IMBALANCE_RATIO,
  };
}
export function heatHistory(events, effectiveTime) {
  let book = new Map(), priorAt = events[0]?.at ?? effectiveTime;
  let priorX = timePosition(priorAt);
  const heatSegments = [];
  const extend = (at, x) => {
    if (x <= priorX) return;
    for (const row of book.values()) heatSegments.push({ ...row, x0: priorX, x1: x, startAt: priorAt, endAt: at });
  };
  for (const event of events) {
    extend(event.at, event.x);
    book = applyLedgerEvent(book, event).book;
    priorAt = event.at;
    priorX = event.x;
  }
  extend(effectiveTime, timePosition(effectiveTime));
  return { heatSegments, bids: bookRows(book, "buy"), asks: bookRows(book, "sell") };
}
export function absorptionSnapshot(story, playhead) {
  const time = Math.max(0, Math.min(TOTAL_DURATION, playhead));
  const preview = time < TIMING.reset, replay = time >= TIMING.reset && time < TIMING.zoomOut;
  const effectiveTime = preview ? 14000 : Math.min(time, 42000);
  const events = story.events.filter(event => event.at <= effectiveTime);
  const trades = events.filter(event => event.kind === "trade");
  const latestEvent = events.at(-1) ?? null, latestTrade = trades.at(-1) ?? null;
  const bars = BAR_RANGES.map(range => candleFromTrades(trades.filter(row => row.barIndex === range.index), range.index, effectiveTime >= range.endAt));
  const cvdPoints = trades.map(row => ({ id: row.id, x: row.x, fraction: row.fraction, at: row.at, barIndex: row.barIndex, cvd: row.cvd, value: row.cvd, delta: row.delta, price: row.price, side: row.side, size: row.size }));
  const heat = heatHistory(events, effectiveTime);
  const activeBarIndex = preview ? 5 : Math.min(8, effectiveTime < 14000 ? 5 : effectiveTime < 22000 ? 6 : effectiveTime < 32000 ? 7 : 8);
  return {
    time, effectiveTime, preview, replay, bars, trades, events, quoteEvents: events.filter(event => event.kind !== "trade"),
    cvdPoints, cvd: latestTrade?.cvd ?? 0, volume: latestTrade?.cumulativeVolume ?? 0,
    price: latestTrade?.price ?? null, chartPrice: latestTrade?.price ?? null,
    latestEvent, latestTrade, event: latestEvent, latest: latestTrade, ...heat,
    activeBarIndex, selectedIndex: 5, pressure: PRESSURE,
    currentBar: bars[activeBarIndex], footprint: bars[activeBarIndex]?.footprint ?? [],
    barDelta: bars.map(bar => bar?.delta ?? 0),
    cursorX: timePosition(effectiveTime),
  };
}
