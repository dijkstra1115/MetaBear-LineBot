export const SCENE_DURATIONS = [7000, 9000, 10000, 6000];
export const SCENE_STARTS = [0, 7000, 16000, 26000];
export const TOTAL_DURATION = 32000;
export const TIMING = {
  zoomIn: 7000,
  focused: 8200,
  first: 9500,
  next: 16000,
  second: 22000,
  zoomOut: 26000,
  panorama: 27600,
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
    mode: ["positions", "positive", "negative", "overview"][scene],
  };
}
// Signed account cash flow, not a margin amount. Positive means received.
export function fundingCashflow({
  quantity,
  mark,
  rate,
  side,
  heldAtSettlement = true,
}) {
  if (
    ![quantity, mark, rate].every(Number.isFinite) ||
    quantity < 0 ||
    mark <= 0 ||
    !["long", "short"].includes(side)
  )
    throw new RangeError("Invalid USDT perpetual funding inputs");
  const notional = quantity * mark;
  const cashflow =
    !heldAtSettlement || quantity === 0 || rate === 0
      ? 0
      : notional * rate * (side === "long" ? -1 : 1);
  return { notional, cashflow };
}
export function createFundingStory() {
  return {
    quantity: 100,
    mark: 100,
    settlements: [
      {
        at: TIMING.first,
        rate: 0.0001,
        label: "第一次結算",
        quantity: 100,
        mark: 100,
      },
      {
        at: TIMING.second,
        rate: -0.0002,
        label: "下一次結算",
        quantity: 100,
        mark: 100,
      },
    ],
  };
}
export function fundingSnapshot(story, playhead) {
  const cycleIndex = playhead >= TIMING.next ? 1 : 0;
  const cycle = story.settlements[cycleIndex];
  const settlements = story.settlements
    .filter((s) => s.at <= playhead)
    .map((s) => ({
      ...s,
      long: fundingCashflow({ ...s, side: "long" }).cashflow,
      short: fundingCashflow({ ...s, side: "short" }).cashflow,
    }));
  const fee = fundingCashflow({ ...cycle, side: "long" });
  return {
    playhead,
    quantity: story.quantity,
    mark: story.mark,
    notional: story.quantity * story.mark,
    cycleIndex,
    cycle,
    rate: cycle.rate,
    amount: Math.abs(fee.cashflow),
    payer: cycle.rate > 0 ? "long" : "short",
    settled: playhead >= cycle.at,
    settlements,
    longNet: settlements.reduce((n, s) => n + s.long, 0),
    shortNet: settlements.reduce((n, s) => n + s.short, 0),
  };
}
export const formatClock = (time) =>
  `00:${String(Math.min(32, Math.floor(time / 1000))).padStart(2, "0")}`;
export const rateLabel = (rate) =>
  `${rate < 0 ? "−" : "+"}${Math.abs(rate * 100).toFixed(2)}%`;
export const signed = (n) =>
  n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
