import { Market } from "./engine.js";
export const SCENE_DURATIONS = [8000, 10000, 10000, 10000];
export const SCENE_STARTS = [0, 8000, 18000, 28000];
export const TOTAL_DURATION = 38000;
export const TIMING = {
  zoomIn: 3500,
  focused: 7500,
  reset: 8000,
  cancelFirst: 11000,
  cancelSecond: 12500,
  buy: 21500,
  zoomOut: 29000,
  panorama: 33500,
};
export const TARGET_INDEX = 5;
export const PRICES = [104, 103, 102, 101, 100, 99];
export const clamp = (v) => Math.max(0, Math.min(1, v));
export function ease(v) {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
}
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
    mode: ["overview", "withdraw", "trade", "result"][scene],
  };
}
export function candleFromTrades(trades, index = TARGET_INDEX) {
  if (!trades.length) return null;
  return {
    index,
    label: `14:${25 + index}`,
    open: trades[0].price,
    high: Math.max(...trades.map((fill) => fill.price)),
    low: Math.min(...trades.map((fill) => fill.price)),
    close: trades.at(-1).price,
    volume: trades.reduce((n, fill) => n + fill.size, 0),
    trades,
  };
}
export function createWithdrawalStory() {
  const market = new Market();
  Object.assign(market, {
    orders: [],
    trades: [],
    history: [],
    events: [],
    price: null,
    time: 0,
    id: 0,
  });
  market.add("buy", 100, 25);
  market.add("buy", 99, 20);
  market.add("sell", 101, 5);
  const first = market.add("sell", 102, 25, true),
    second = market.add("sell", 103, 30, true);
  market.add("sell", 104, 40);
  const baseline = market.execute({ side: "buy", size: 5, own: false });
  const trades = baseline.fills.map((f) => ({ ...f, playedAt: 0 })),
    frames = [],
    events = [];
  function save(at) {
    frames.push({
      at,
      price: market.price,
      bids: market.book("buy"),
      asks: market.book("sell"),
    });
  }
  save(0);
  for (const [at, order] of [
    [TIMING.cancelFirst, first],
    [TIMING.cancelSecond, second],
  ]) {
    if (!market.cancel(order.id))
      throw Error("Withdrawal story must remove the specified resting order");
    events.push({
      at,
      kind: "cancel",
      price: order.price,
      size: order.remaining,
    });
    save(at);
  }
  const buy = market.execute({ side: "buy", size: 5, own: false });
  trades.push(...buy.fills.map((f) => ({ ...f, playedAt: TIMING.buy })));
  events.push({
    at: TIMING.buy,
    kind: "trade",
    price: buy.fills[0].price,
    size: buy.filled,
  });
  save(TIMING.buy);
  const contextPrices = [
    [98, 99, 97, 99],
    [99, 100, 98, 100],
    [100, 101, 99, 100],
    [100, 102, 100, 101],
    [101, 101, 100, 101],
    null,
    [104, 105, 103, 104],
    [104, 104, 102, 103],
    [103, 105, 103, 105],
    [105, 106, 104, 105],
    [105, 107, 105, 106],
  ];
  const contextBars = contextPrices.map((prices, index) =>
    candleFromTrades(
      prices ? prices.map((price, tick) => ({ price, size: 5, tick })) : trades,
      index,
    ),
  );
  return {
    frames,
    trades,
    events,
    contextBars,
    targetIndex: TARGET_INDEX,
    initialAskSize: 100,
    cancelled: 55,
  };
}
export function withdrawalSnapshot(story, t) {
  const time = Math.max(0, Math.min(TOTAL_DURATION, t));
  const replay = time >= TIMING.reset && time < TIMING.zoomOut;
  // The opening and ending are the same completed history. Only the labelled
  // replay reconstructs events from the selected minute, with no future fills.
  const eventTime = replay ? time : TIMING.buy;
  const frame =
      story.frames.findLast((f) => f.at <= eventTime) ?? story.frames[0],
    trades = story.trades.filter((f) => f.playedAt <= eventTime);
  const target = candleFromTrades(trades);
  const bars = story.contextBars.map((bar, index) =>
    index === story.targetIndex
      ? target
      : replay && index > story.targetIndex
        ? null
        : bar,
  );
  return {
    ...frame,
    time,
    replay,
    eventTime,
    bars,
    targetIndex: story.targetIndex,
    price: replay ? frame.price : story.contextBars.at(-1).close,
    targetPrice: frame.price,
    trades,
    candle: {
      open: target.open,
      high: target.high,
      low: target.low,
      close: target.close,
    },
    volume: target.volume,
    event: replay ? (story.events.findLast((e) => e.at <= time) ?? null) : null,
    cancellations: story.events.filter(
      (e) => e.kind === "cancel" && e.at <= eventTime,
    ),
    bestAsk: frame.asks[0]?.price ?? null,
  };
}
