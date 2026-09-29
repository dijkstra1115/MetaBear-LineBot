export const SCENE_DURATIONS = [4000, 8500, 5500, 12000];
export const SCENE_STARTS = [0, 4000, 12500, 18000];
export const TOTAL_DURATION = 30000;
export const TIMING = {
  zoomIn: 4000,
  focused: 5500,
  formula: 6500,
  firstDelta: 8000,
  zoomOut: 11000,
  panorama: 12500,
  cvd: 18000,
};
export const clamp = (value) => Math.max(0, Math.min(1, value));
export const ease = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
export const signed = (value) =>
  value > 0 ? `+${value}` : String(value).replace("-", "−");
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
    mode: ["footprints", "difference", "deltas", "cumulative"][scene],
  };
}
export function createDeltaConceptStory() {
  // Recorded synthetic executions with known aggressor direction. The lesson
  // reveals calculations on completed minutes; it does not invent live fills.
  const tapes = [
    [
      [101, "buy", 20],
      [101, "sell", 15],
      [102, "buy", 20],
    ],
    [
      [102, "buy", 10],
      [101, "sell", 20],
    ],
    [
      [101, "sell", 10],
      [102, "buy", 25],
    ],
  ];
  let cumulative = 0;
  const minutes = tapes.map((tape, index) => {
    const trades = tape.map(([price, side, size]) => ({ price, side, size }));
    const buy = trades
      .filter((t) => t.side === "buy")
      .reduce((sum, t) => sum + t.size, 0);
    const sell = trades
      .filter((t) => t.side === "sell")
      .reduce((sum, t) => sum + t.size, 0);
    const delta = buy - sell;
    cumulative += delta;
    return {
      label: `14:${30 + index}`,
      endLabel: `14:${31 + index}`,
      duration: 60000,
      trades,
      buy,
      sell,
      volume: buy + sell,
      delta,
      cvd: cumulative,
      rows: [102, 101].map((price) => ({
        price,
        buy: trades
          .filter((t) => t.price === price && t.side === "buy")
          .reduce((sum, t) => sum + t.size, 0),
        sell: trades
          .filter((t) => t.price === price && t.side === "sell")
          .reduce((sum, t) => sum + t.size, 0),
      })),
      candle: {
        open: trades[0].price,
        close: trades.at(-1).price,
        high: Math.max(...trades.map((t) => t.price)),
        low: Math.min(...trades.map((t) => t.price)),
      },
    };
  });
  return {
    minutes,
    resetLabel: "14:30",
    deltaAt: [8000, 13500, 16000],
    cvdAt: [19500, 22500, 25000],
  };
}
export function deltaConceptSnapshot(story, playhead) {
  const deltaCount = story.deltaAt.filter((at) => at <= playhead).length;
  const cvdCount = story.cvdAt.filter((at) => at <= playhead).length;
  return {
    deltaCount,
    cvdCount,
    cvd: cvdCount ? story.minutes[cvdCount - 1].cvd : 0,
    deltas: story.minutes.slice(0, deltaCount).map((minute) => minute.delta),
    points: [
      { label: story.resetLabel, value: 0 },
      ...story.minutes
        .slice(0, cvdCount)
        .map((minute) => ({ label: minute.endLabel, value: minute.cvd })),
    ],
  };
}
