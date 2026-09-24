import { Market, aggregate } from "./engine.js";
export const SCENE_DURATIONS = [4000, 10000, 12000, 10000];
export const SCENE_STARTS = [0, 4000, 14000, 26000];
export const TOTAL_DURATION = 36000;
export const TIMING = {
  zoomIn: 4000,
  focused: 5500,
  absorbed: 10500,
  empty: 20000,
  higher: 26000,
  zoomOut: 30500,
  panorama: 32500,
};
export const clamp = (value) => Math.max(0, Math.min(1, value));
export const ease = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
export function scenePosition(scene, elapsed, reduced = false) {
  const playhead =
    SCENE_STARTS[scene] +
    Math.min(SCENE_DURATIONS[scene], Math.max(0, elapsed));
  return {
    scene,
    elapsed,
    playhead,
    time: playhead,
    reduced,
    mode: ["question", "consume", "absorb", "release"][scene],
  };
}
export function createAbsorptionStory() {
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
  market.add("buy", 100, 30);
  market.add("sell", 101, 80);
  market.add("sell", 102, 20);
  const fills = [],
    frames = [];
  const save = (at) =>
    frames.push({
      at,
      bids: market.book("buy"),
      asks: market.book("sell"),
      price: market.price,
    });
  save(0);
  const operations = [
    { at: 1800, size: 10 },
    { at: 6500, size: 20 },
    { at: 10500, size: 30 },
    { at: TIMING.empty, size: 20 },
    { at: TIMING.higher, size: 8 },
  ];
  for (const op of operations) {
    const result = market.execute({ side: "buy", size: op.size, own: false });
    if (result.filled !== op.size)
      throw Error("Absorption example has insufficient depth");
    fills.push(
      ...result.fills.map((fill) => ({
        price: fill.price,
        size: fill.size,
        side: fill.side,
        at: op.at,
      })),
    );
    save(op.at);
  }
  return { fills, frames, initialSell: 80, nextSell: 20 };
}
export function absorptionSnapshot(story, time) {
  const trades = story.fills.filter((fill) => fill.at <= time);
  const frame =
    story.frames.findLast((frame) => frame.at <= time) ?? story.frames[0];
  const rows = aggregate(trades, 1);
  return {
    ...frame,
    trades,
    rows,
    latest: trades.at(-1) ?? null,
    volume: trades.reduce((sum, fill) => sum + fill.size, 0),
    remaining101: frame.asks.find((row) => row.price === 101)?.size ?? 0,
    remaining102: frame.asks.find((row) => row.price === 102)?.size ?? 0,
    candle: trades.length
      ? {
          open: trades[0].price,
          close: trades.at(-1).price,
          high: Math.max(...trades.map((fill) => fill.price)),
          low: Math.min(...trades.map((fill) => fill.price)),
        }
      : null,
  };
}
