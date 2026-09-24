export const SCENE_DURATIONS = [4000, 9000, 17000, 6000];
export const SCENE_STARTS = [0, 4000, 13000, 30000];
export const TOTAL_DURATION = 36000;
export const TIMING = {
  zoomIn: 4000,
  focused: 5600,
  compare: 7500,
  follow: 13000,
  zoomOut: 30000,
  panorama: 32000,
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
  return { scene, elapsed, playhead, time: playhead, reduced };
}
export function summarize(trades) {
  return {
    trades,
    volume: trades.reduce((n, t) => n + t.size, 0),
    candle: trades.length
      ? {
          open: trades[0].price,
          high: Math.max(...trades.map((t) => t.price)),
          low: Math.min(...trades.map((t) => t.price)),
          close: trades.at(-1).price,
        }
      : null,
  };
}
export function createBreakoutVolumeStory() {
  const tapes = [
    [
      [99, 4],
      [101, 4],
      [98, 4],
      [100, 4],
    ],
    [
      [100, 6],
      [103, 6],
      [99, 6],
      [102, 6],
    ],
    [
      [102, 5],
      [104, 5],
      [101, 4],
      [103, 4],
    ],
    [
      [103, 6],
      [104, 6],
      [101, 5],
      [102, 5],
    ],
    [
      [102, 5],
      [104, 5],
      [101, 5],
      [103, 5],
    ],
    [
      [103, 10],
      [104, 12],
      [106, 20],
      [107, 10],
      [106, 8],
    ],
    [
      [106, 14],
      [107, 12],
      [104, 12],
      [105, 16],
    ],
    [
      [105, 16],
      [103, 10],
      [106, 16],
      [105, 16],
    ],
    [
      [105, 14],
      [107, 14],
      [104, 12],
      [106, 16],
    ],
  ];
  const times = [
    [15000, 16100, 17200, 18300],
    [21000, 22000, 23000, 24000],
    [26300, 27200, 28100, 29000],
  ];
  const bars = tapes.map((tape, index) => ({
    index,
    label: `14:${25 + index}`,
    duration: 60000,
    closeAt: index < 6 ? 0 : [19000, 24700, 29600][index - 6],
    trades: tape.map(([price, size], i) => ({
      price,
      size,
      at: index < 6 ? 0 : times[index - 6][i],
    })),
  }));
  const baseline =
    bars.slice(0, 5).reduce((sum, b) => sum + summarize(b.trades).volume, 0) /
    5;
  return { bars, baseline, level: 104, observationBars: 3, breakoutIndex: 5 };
}
export function breakoutVolumeSnapshot(story, playhead) {
  const bars = story.bars.map((bar) => ({
    ...bar,
    ...summarize(bar.trades.filter((t) => t.at <= playhead)),
    complete: playhead >= bar.closeAt,
  }));
  const observed = bars.slice(6).filter((bar) => bar.complete);
  const passed = observed.filter(
    (bar) => bar.candle.close >= story.level,
  ).length;
  return {
    bars,
    observed,
    passed,
    followVolume: observed.reduce((n, bar) => n + bar.volume, 0),
    followAverage: observed.length
      ? observed.reduce((n, bar) => n + bar.volume, 0) / observed.length
      : null,
    activeIndex: Math.max(
      ...bars.filter((b) => b.trades.length).map((b) => b.index),
    ),
    ratio: bars[story.breakoutIndex].volume / story.baseline,
    qualified:
      observed.length === story.observationBars &&
      passed === story.observationBars,
    totalVolume: bars.reduce((n, b) => n + b.volume, 0),
  };
}
