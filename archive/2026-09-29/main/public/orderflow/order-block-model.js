export const SCENE_DURATIONS = [6000, 14000, 11000, 9000];
export const SCENE_STARTS = [0, 6000, 20000, 31000];
export const TOTAL_DURATION = 40000;
export const TIMING = {
  zoomIn: 4000,
  focused: 6000,
  reset: 6000,
  bids: 9000,
  originClose: 18000,
  book: 19500,
  urgency: 20000,
  confirm: 29000,
  lookBack: 31000,
  zone: 32500,
  zoomOut: 35000,
  panorama: 37500,
};
export const clamp = (n) => Math.max(0, Math.min(1, n));
export const ease = (n) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
export function scenePosition(scene, elapsed, reduced = false) {
  const time =
    SCENE_STARTS[scene] +
    Math.max(0, Math.min(SCENE_DURATIONS[scene], elapsed));
  return { scene, elapsed, playhead: time, time, reduced };
}
export function candleFromTrades(rows, index, closed = true) {
  if (!rows.length) return null;
  return {
    index,
    label: `14:${String(26 + index).padStart(2, "0")}`,
    open: rows[0].price,
    high: Math.max(...rows.map((r) => r.price)),
    low: Math.min(...rows.map((r) => r.price)),
    close: rows.at(-1).price,
    volume: rows.reduce((n, r) => n + r.size, 0),
    closed,
    rows,
  };
}
export function detectOrderBlock(bars, impulseIndex, referenceHigh) {
  const impulse = bars.find((b) => b?.index === impulseIndex);
  if (
    !impulse?.closed ||
    impulse.close <= referenceHigh ||
    impulse.close <= impulse.open
  )
    return null;
  const origin = bars.findLast(
    (b) => b?.index < impulseIndex && b.closed && b.close < b.open,
  );
  if (!origin) return null;
  return {
    originIndex: origin.index,
    confirmationIndex: impulse.index,
    low: origin.low,
    high: origin.high,
    referenceHigh,
  };
}
export function createOrderBlockStory() {
  const originIndex = 4,
    impulseIndex = 5;
  const prices = [
    [95, 99, 94, 98],
    [98, 102, 97, 101],
    [101, 105, 100, 104],
    [104, 104, 102, 103],
    [103, 104, 103, 102, 101, 102],
    [102, 103, 104, 105, 106, 107],
    [107, 112, 106, 111],
    [111, 113, 109, 110],
    [110, 115, 109, 114],
    [114, 115, 111, 112],
    [112, 117, 111, 116],
  ];
  const sizes = [
    [4, 3, 12, 18, 20, 3],
    [5, 5, 5, 5, 5, 5],
  ];
  const times = [
    [8000, 8800, 10400, 12800, 15000, 16400],
    [21400, 22600, 23800, 25000, 26200, 27400],
  ];
  const originSides = ["buy", "buy", "sell", "sell", "sell", "buy"];
  const originQuoteTimes = [
    7800,
    8600,
    TIMING.bids,
    TIMING.bids,
    TIMING.bids,
    16200,
  ];
  const quoteEvents = [
    ...prices[originIndex].map((price, tick) => ({
      id: `quote-origin-${tick}`,
      at: originQuoteTimes[tick],
      side: originSides[tick] === "sell" ? "bid" : "ask",
      price,
      size: sizes[0][tick],
      owner: originSides[tick] === "sell" ? "A" : "other",
    })),
    ...prices[impulseIndex].map((price, tick) => ({
      id: `quote-impulse-${tick}`,
      at: TIMING.book,
      side: "ask",
      price,
      size: sizes[1][tick],
      owner: "other",
    })),
  ];
  const history = [];
  const bars = prices.map((values, index) => {
    const selected = index === originIndex || index === impulseIndex;
    const selection = index - originIndex;
    const rows = values.map((price, tick) => {
      const side =
        index === originIndex
          ? originSides[tick]
          : index === impulseIndex || tick === 1 || tick === values.length - 1
            ? "buy"
            : "sell";
      const passive = index === originIndex && side === "sell";
      const row = {
        id: `${index}-${tick}`,
        barIndex: index,
        tick,
        price,
        size: selected ? sizes[selection][tick] : [4, 6, 5, 5][tick],
        side,
        // A is explicitly assigned only to the three resting bid fills and
        // the later six aggressive buys. Other prints do not change A's plan.
        buyer: passive || index === impulseIndex ? "A" : "other",
        seller: "other-seller",
        passive,
        marketTime: index * 60000 + (tick + 1) * (selected ? 8000 : 12000),
        ...(selected
          ? {
              at: times[selection][tick],
              quoteId: `quote-${index === originIndex ? "origin" : "impulse"}-${tick}`,
            }
          : {}),
      };
      history.push(row);
      return row;
    });
    return candleFromTrades(rows, index);
  });
  const referenceHigh = Math.max(
    ...bars.slice(0, originIndex).map((b) => b.high),
  );
  const trades = history.filter((row) => row.at !== undefined);
  const bids = quoteEvents
    .filter((quote) => quote.side === "bid")
    .map((quote) => ({
      price: quote.price,
      initial: quote.size,
      quoteId: quote.id,
      postedAt: quote.at,
    }));
  const asks = quoteEvents
    .filter((quote) => quote.at === TIMING.book)
    .map((quote) => ({
      price: quote.price,
      initial: quote.size,
      quoteId: quote.id,
      // A new sell-side snapshot after the origin minute, not a claim that
      // passive bid fills automatically emptied or lowered the earlier asks.
      postedAt: TIMING.book,
    }));
  return {
    originIndex,
    impulseIndex,
    referenceHigh,
    bars,
    history,
    trades,
    quoteEvents,
    bids,
    asks,
    executionTarget: 80,
  };
}
export function orderBlockSnapshot(story, playhead) {
  const time = Math.max(0, Math.min(TOTAL_DURATION, playhead));
  // Restore the completed context before pulling back. It starts outside the
  // focused crop and is revealed by the camera, never popped in at its end.
  const replay = time >= TIMING.reset && time < TIMING.zoomOut;
  const trades = replay
    ? story.trades.filter((row) => row.at <= time)
    : story.trades;
  const replayBars = story.bars.map((bar) => {
    if (bar.index < story.originIndex) return bar;
    if (bar.index > story.impulseIndex) return null;
    return candleFromTrades(
      trades.filter((row) => row.barIndex === bar.index),
      bar.index,
      time >=
        (bar.index === story.originIndex ? TIMING.originClose : TIMING.confirm),
    );
  });
  const bars = replay ? replayBars : story.bars;
  // Initial panorama is explicitly finished history. Even there, no OB is
  // labelled until the confirmation has been taught in the selected replay.
  const confirmed = time >= TIMING.confirm;
  const zone = confirmed
    ? detectOrderBlock(bars, story.impulseIndex, story.referenceHigh)
    : null;
  const impulseTrades = trades.filter(
    (row) => row.barIndex === story.impulseIndex,
  );
  const passiveTrades = trades.filter(
    (row) => row.buyer === "A" && row.passive,
  );
  const aggressiveTrades = trades.filter(
    (row) => row.buyer === "A" && !row.passive,
  );
  const passiveFilled = passiveTrades.reduce((n, row) => n + row.size, 0);
  const aggressiveFilled = aggressiveTrades.reduce((n, row) => n + row.size, 0);
  const filled = passiveFilled + aggressiveFilled;
  const cost = [...passiveTrades, ...aggressiveTrades].reduce(
    (n, row) => n + row.price * row.size,
    0,
  );
  const execution = {
    target: story.executionTarget,
    passiveFilled,
    aggressiveFilled,
    filled,
    remaining: story.executionTarget - filled,
    phase: replay && time < TIMING.urgency ? "passive" : "aggressive",
    cost,
    averagePrice: filled ? cost / filled : null,
  };
  // Quote creation is separate from execution. The two later 102 asks are
  // genuinely new offers by other sellers, not a price move caused by A's bids.
  const quotes = story.quoteEvents.map((quote) => {
    const posted = !replay || quote.at <= time;
    const filled = trades
      .filter((row) => row.quoteId === quote.id)
      .reduce((n, row) => n + row.size, 0);
    const remaining = posted ? quote.size - filled : 0;
    return { ...quote, posted, remaining, active: posted && remaining > 0 };
  });
  const quoteRemaining = (id) =>
    quotes.find((quote) => quote.id === id).remaining;
  const bids = story.bids.map((bid) => ({
    ...bid,
    remaining: quoteRemaining(bid.quoteId),
  }));
  const asks = story.asks.map((ask) => ({
    ...ask,
    remaining: quoteRemaining(ask.quoteId),
  }));
  return {
    playhead: time,
    replay,
    bars,
    trades,
    quotes,
    bids,
    asks,
    execution,
    originIndex: story.originIndex,
    impulseIndex: story.impulseIndex,
    referenceHigh: story.referenceHigh,
    origin: bars[story.originIndex],
    impulse: bars[story.impulseIndex],
    confirmed,
    zone,
    zoneVisible: Boolean(zone) && time >= TIMING.zone,
    event: replay ? (trades.at(-1) ?? null) : null,
    lastPrice: replay
      ? (trades.at(-1)?.price ?? story.bars[story.originIndex - 1].close)
      : story.bars.at(-1).close,
    originVolume: trades
      .filter((row) => row.barIndex === story.originIndex)
      .reduce((n, row) => n + row.size, 0),
    impulseVolume: impulseTrades.reduce((n, row) => n + row.size, 0),
  };
}
export const formatClock = (time) =>
  `00:${String(Math.floor(Math.max(0, Math.min(TOTAL_DURATION, time)) / 1000)).padStart(2, "0")}`;
