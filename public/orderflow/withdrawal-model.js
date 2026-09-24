import { Market } from "./engine.js";
export const SCENE_DURATIONS = [6000, 12000, 9000, 8000];
export const SCENE_STARTS = [0, 6000, 18000, 27000];
export const TOTAL_DURATION = 35000;
export const TIMING = {
  zoomIn: 6000,
  focused: 7400,
  cancelFirst: 11000,
  cancelSecond: 12500,
  buy: 21500,
  zoomOut: 27000,
  panorama: 29100,
};
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
    mode: ["book", "withdraw", "trade", "result"][scene],
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
  return { frames, trades, events, initialAskSize: 100, cancelled: 55 };
}
export function withdrawalSnapshot(story, t) {
  const frame = story.frames.findLast((f) => f.at <= t) ?? story.frames[0],
    trades = story.trades.filter((f) => f.playedAt <= t);
  return {
    ...frame,
    time: t,
    trades,
    candle: {
      open: trades[0].price,
      high: Math.max(...trades.map((fill) => fill.price)),
      low: Math.min(...trades.map((fill) => fill.price)),
      close: trades.at(-1).price,
    },
    volume: trades.reduce((n, f) => n + f.size, 0),
    event: story.events.findLast((e) => e.at <= t) ?? null,
    cancellations: story.events.filter((e) => e.kind === "cancel" && e.at <= t),
    bestAsk: frame.asks[0]?.price ?? null,
  };
}
