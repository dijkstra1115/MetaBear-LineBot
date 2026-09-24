export const SCENE_DURATIONS = [6000, 9000, 9000, 8000];
export const SCENE_STARTS = [0, 6000, 15000, 24000];
export const TOTAL_DURATION = 32000;
export const TIMING = {
  zoomIn: 6000,
  focused: 7200,
  drop: 8000,
  half: 14000,
  near: 19000,
  trigger: 22500,
  zoomOut: 26000,
  panorama: 27500,
};
export const EXAMPLE = Object.freeze({
  entry: 100,
  quantity: 5,
  margin: 100,
  maintenanceRate: 0.005,
});
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
    mode: ["position", "loss", "liquidation", "result"][scene],
  };
}
// Simplified linear isolated long: no fees, funding, extra margin or tier deduction.
export function liquidationMetrics(mark, example = EXAMPLE) {
  const { entry, quantity, margin, maintenanceRate } = example;
  if (
    ![mark, entry, quantity, margin, maintenanceRate].every(Number.isFinite) ||
    mark <= 0 ||
    entry <= 0 ||
    quantity <= 0 ||
    margin <= 0 ||
    maintenanceRate < 0 ||
    maintenanceRate >= 1
  )
    throw new RangeError("Invalid linear isolated-contract inputs");
  const notional = quantity * entry;
  const pnl = quantity * (mark - entry);
  const equity = margin + pnl;
  const maintenance = quantity * mark * maintenanceRate;
  const buffer = equity - maintenance;
  const liquidationPrice =
    (notional - margin) / (quantity * (1 - maintenanceRate));
  return {
    mark,
    notional,
    leverage: notional / margin,
    pnl,
    loss: Math.max(0, -pnl),
    equity,
    maintenance,
    buffer,
    liquidationPrice,
    marketDrop: (entry - mark) / entry,
    marginLoss: -pnl / margin,
    theoreticalZeroPrice: entry - margin / quantity,
    triggered: buffer <= 1e-9,
  };
}
export function createLiquidationStory() {
  const threshold = liquidationMetrics(EXAMPLE.entry).liquidationPrice;
  return {
    example: EXAMPLE,
    quotes: [
      { at: 0, mark: 100 },
      { at: TIMING.drop, mark: 95 },
      { at: TIMING.half, mark: 90 },
      { at: TIMING.near, mark: 85 },
      { at: TIMING.trigger, mark: threshold },
    ],
  };
}
export function liquidationSnapshot(story, playhead) {
  const visible = story.quotes.filter((q) => q.at <= playhead);
  // Stop on the first liquidation trigger; the dotted zero-margin level is never an executed continuation.
  const triggerIndex = visible.findIndex(
    (q) => liquidationMetrics(q.mark, story.example).triggered,
  );
  const quotes =
    triggerIndex < 0 ? visible : visible.slice(0, triggerIndex + 1);
  const quote = quotes.at(-1) ?? story.quotes[0];
  return {
    playhead,
    quote,
    quotes,
    ...story.example,
    ...liquidationMetrics(quote.mark, story.example),
  };
}
export const formatClock = (time) =>
  `00:${String(Math.min(32, Math.floor(time / 1000))).padStart(2, "0")}`;
export const money = (n) => n.toFixed(Number.isInteger(n) ? 0 : 2);
export const percent = (n) =>
  (n * 100).toFixed(Math.abs(n * 100 - Math.round(n * 100)) < 1e-8 ? 0 : 1);
