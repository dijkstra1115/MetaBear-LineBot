export const SCENE_DURATIONS = [6000, 9000, 9000, 6000];
export const SCENE_STARTS = [0, 6000, 15000, 24000];
export const TOTAL_DURATION = 30000;
export const TIMING = {
  zoomIn: 6000,
  focused: 7300,
  divergence: 8500,
  reference: 11000,
  return: 14500,
  zoomOut: 24000,
  panorama: 25600,
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
    mode: ["prices", "deviation", "reference", "overview"][scene],
  };
}
// Explicit synthetic observations, not a claimed implementation of an exchange's mark-price algorithm.
// Last price and mark are independently observed series; neither is derived by smoothing the other.
export function createMarkPriceStory() {
  return {
    observations: [
      { at: 0, last: 100, mark: 100 },
      { at: 1800, last: 100.2, mark: 100 },
      { at: 3200, last: 100.2, mark: 100.1 },
      { at: 4600, last: 100.1, mark: 100.05 },
      { at: TIMING.divergence, last: 92, mark: 99.8 },
      { at: TIMING.reference, last: 94.5, mark: 99.5 },
      { at: TIMING.return, last: 99.2, mark: 99.4 },
      { at: 19000, last: 99.6, mark: 99.5 },
      { at: 23500, last: 98.8, mark: 98.9 },
    ],
  };
}
export function markPriceSnapshot(story, playhead) {
  const observations = story.observations.filter((o) => o.at <= playhead);
  const current = observations.at(-1) ?? story.observations[0];
  return {
    playhead,
    observations,
    ...current,
    gap: current.mark - current.last,
    deviated: Math.abs(current.mark - current.last) >= 3,
  };
}
export const money = (n) => n.toFixed(2);
export const formatClock = (time) =>
  `00:${String(Math.min(30, Math.floor(time / 1000))).padStart(2, "0")}`;
