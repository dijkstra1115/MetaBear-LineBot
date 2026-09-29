export const SCENE_DURATIONS = [6000, 10000, 8000, 6000];
export const SCENE_STARTS = [0, 6000, 16000, 24000];
export const TOTAL_DURATION = 30000;
export const TIMING = {
  zoomIn: 6000,
  focused: 7100,
  rise: 8500,
  fall: 12500,
  zoomOut: 16000,
  panorama: 17400,
  compare: 19500,
  recover: 24500,
};
export const clamp = (n) => Math.max(0, Math.min(1, n));
export const ease = (n) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

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
    mode: ["margin", "exposure", "compare", "result"][scene],
  };
}

// Linear long contract; notional is the entry value, with fees excluded.
export function positionMetrics({
  margin,
  leverage,
  entry = 100,
  price = entry,
}) {
  if (
    ![margin, leverage, entry, price].every(Number.isFinite) ||
    margin <= 0 ||
    leverage <= 0 ||
    entry <= 0 ||
    price <= 0
  )
    throw new RangeError("Positive finite contract inputs are required");
  const notional = margin * leverage;
  const quantity = notional / entry;
  const pnl = quantity * (price - entry);
  return {
    margin,
    leverage,
    entry,
    price,
    notional,
    quantity,
    pnl,
    equity: margin + pnl,
    returnOnMargin: pnl / margin,
  };
}

export function createLeverageStory() {
  return {
    entry: 100,
    quotes: [
      { at: 0, price: 100 },
      { at: TIMING.rise, price: 101 },
      { at: TIMING.fall, price: 99 },
      { at: TIMING.recover, price: 101 },
    ],
  };
}

export function leverageSnapshot(story, playhead) {
  const quote =
    story.quotes.findLast((q) => q.at <= playhead) ?? story.quotes[0];
  const samePosition = playhead >= TIMING.compare;
  return {
    playhead,
    price: quote.price,
    quote,
    samePosition,
    accounts: [
      positionMetrics({
        margin: samePosition ? 500 : 100,
        leverage: 1,
        entry: story.entry,
        price: quote.price,
      }),
      positionMetrics({
        margin: 100,
        leverage: 5,
        entry: story.entry,
        price: quote.price,
      }),
    ],
  };
}

export const formatClock = (time) =>
  `00:${String(Math.min(30, Math.floor(time / 1000))).padStart(2, "0")}`;
