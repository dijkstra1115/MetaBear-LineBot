import { Market } from "./engine.js";
export const SCENE_DURATIONS = [5000, 6000, 12000, 7000];
export const SCENE_STARTS = [0, 5000, 11000, 23000];
export const TOTAL_DURATION = 30000;
export const TIMING = {
  deepFill: 7200,
  shallowFirst: 13400,
  shallowSecond: 16600,
  shallowThird: 20000,
  zoomOut: 23000,
  panorama: 25000,
};
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
    mode: ["compare", "deep", "shallow", "result"][scene],
  };
}
function experiment(sizes, times) {
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
  const initial = sizes.map((size, i) => ({ price: 101 + i, size }));
  for (const row of initial)
    if (row.size) market.add("sell", row.price, row.size);
  const result = market.execute({ side: "buy", size: 30 });
  return {
    initial,
    fills: result.fills.map((f, i) => ({ ...f, playedAt: times[i] })),
    expected: { filled: result.filled, avg: result.avg },
  };
}
export function createSlippageStory() {
  return {
    quantity: 30,
    reference: 101,
    deep: experiment([40, 25, 25, 30], [TIMING.deepFill]),
    shallow: experiment(
      [5, 15, 0, 20],
      [TIMING.shallowFirst, TIMING.shallowSecond, TIMING.shallowThird],
    ),
  };
}
export function slippageSnapshot(story, playhead) {
  const snapshot = (scenario) => {
    const fills = scenario.fills.filter((fill) => fill.playedAt <= playhead);
    const filled = fills.reduce((n, f) => n + f.size, 0),
      value = fills.reduce((n, f) => n + f.price * f.size, 0);
    const avg = filled ? value / filled : null;
    return {
      fills,
      filled,
      remaining: story.quantity - filled,
      value,
      avg,
      slippage: avg === null ? null : avg - story.reference,
      extraCost: value - filled * story.reference,
      last: fills.at(-1) ?? null,
      asks: scenario.initial.map((row) => ({
        ...row,
        remaining:
          row.size -
          fills
            .filter((f) => f.price === row.price)
            .reduce((n, f) => n + f.size, 0),
      })),
    };
  };
  return {
    deep: snapshot(story.deep),
    shallow: snapshot(story.shallow),
    quantity: story.quantity,
    reference: story.reference,
  };
}
