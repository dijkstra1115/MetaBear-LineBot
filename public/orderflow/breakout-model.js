import { Market } from "./engine.js";
export const SCENE_DURATIONS = [4000, 8500, 11500, 11000];
export const SCENE_STARTS = [0, 4000, 12500, 24000];
export const TOTAL_DURATION = 35000;
export const TIMING = {
  zoomIn: 4000,
  focused: 5500,
  reset: 5500,
  thinBreak: 14000,
  deepBreak: 20000,
  compare: 24000,
  zoomOut: 28000,
  panorama: 30000,
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
    mode: ["same-break", "depth", "execute", "compare"][scene],
  };
}
function makeMarket(id, depth, operations) {
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
  market.add("sell", 101, 1);
  market.add("sell", 102, depth);
  market.add("sell", 103, 20);
  // A shared, completed starting print establishes 101. It is context before
  // the measured comparison, not part of either displayed incoming buy total.
  const seed = market.execute({ side: "buy", size: 1, own: false }).fills[0];
  const fills = [],
    frames = [];
  const save = (at) =>
    frames.push({
      at,
      price: market.price,
      bids: market.book("buy"),
      asks: market.book("sell"),
    });
  save(0);
  for (const op of operations) {
    const result = market.execute({ side: "buy", size: op.size, own: false });
    if (result.filled !== op.size)
      throw Error("Breakout example has insufficient depth");
    fills.push(
      ...result.fills.map((fill) => ({
        at: op.at,
        price: fill.price,
        size: fill.size,
        side: fill.side,
      })),
    );
    save(op.at);
  }
  return {
    id,
    depth,
    seed: { price: seed.price, size: seed.size, side: seed.side },
    fills,
    frames,
  };
}
export function createBreakoutStory() {
  return {
    level: 102,
    markets: [
      makeMarket("A", 60, [
        { at: 7000, size: 20 },
        { at: 12000, size: 20 },
        { at: 17000, size: 20 },
        { at: TIMING.deepBreak, size: 5 },
      ]),
      makeMarket("B", 10, [
        { at: 8500, size: 5 },
        { at: 11500, size: 5 },
        { at: TIMING.thinBreak, size: 5 },
      ]),
    ],
  };
}
export function marketSnapshot(market, time) {
  const trades = market.fills.filter((fill) => fill.at <= time);
  const frame =
    market.frames.findLast((frame) => frame.at <= time) ?? market.frames[0];
  const tape = [market.seed, ...trades];
  return {
    ...frame,
    id: market.id,
    depth: market.depth,
    trades,
    latest: trades.at(-1) ?? null,
    volume: trades.reduce((sum, fill) => sum + fill.size, 0),
    remaining102: frame.asks.find((row) => row.price === 102)?.size ?? 0,
    remaining103: frame.asks.find((row) => row.price === 103)?.size ?? 0,
    candle: {
      open: market.seed.price,
      high: Math.max(...tape.map((fill) => fill.price)),
      low: Math.min(...tape.map((fill) => fill.price)),
      close: frame.price,
    },
    broke: frame.price > 102,
  };
}
export function breakoutSnapshot(story, playhead) {
  return {
    preview: playhead < TIMING.reset,
    markets: story.markets.map((market) => marketSnapshot(market, playhead)),
  };
}
