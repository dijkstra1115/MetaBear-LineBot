export const SCENE_DURATIONS = [3500, 11500, 7000, 8000];
export const SCENE_STARTS = [0, 3500, 15000, 22000];
export const TOTAL_DURATION = 30000;
export const TIMING = {
  zoomIn: 3500,
  focused: 4800,
  reset: 4800,
  first: 5800,
  second: 9000,
  third: 12200,
  zoomOut: 17000,
  panorama: 19000,
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
    mode: ["overview", "count", "compare", "read"][scene],
  };
}

export function summarizeTrades(trades) {
  const volume = trades.reduce((sum, trade) => sum + trade.size, 0);
  return {
    trades,
    volume,
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

export function createVolumeStory() {
  // Each completed bar is an independent synthetic one-minute execution tape.
  // Quantity is counted once per matched fill, irrespective of aggressor side.
  const tapes = [
    [
      [100, 10, "buy"],
      [101, 8, "buy"],
      [100, 6, "sell"],
    ],
    [
      [100, 12, "buy"],
      [101, 18, "buy"],
    ],
    [
      [101, 16, "buy"],
      [102, 20, "buy"],
    ],
    [
      [101, 20, "buy"],
      [100, 15, "sell"],
      [102, 25, "buy"],
    ],
    [
      [102, 9, "buy"],
      [101, 6, "sell"],
    ],
  ];
  const fills = tapes[3].map(([price, size, side], i) => ({
    price,
    size,
    side,
    playedAt: [TIMING.first, TIMING.second, TIMING.third][i],
  }));
  const context = tapes.map((tape, i) => ({
    label: `14:${27 + i}`,
    duration: 60000,
    selected: i === 3,
    ...summarizeTrades(
      i === 3
        ? fills
        : tape.map(([price, size, side]) => ({ price, size, side })),
    ),
  }));
  const baseline =
    context.slice(0, 3).reduce((sum, bar) => sum + bar.volume, 0) / 3;
  return { fills, context, baseline, waiting: 80 };
}

export function volumeSnapshot(story, playhead) {
  const trades = story.fills.filter((fill) => fill.playedAt <= playhead);
  return {
    ...summarizeTrades(trades),
    latest: trades.at(-1) ?? null,
    waiting: story.waiting,
    preview: playhead < TIMING.reset,
  };
}
