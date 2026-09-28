export const SCENE_DURATIONS = [4000, 9000, 8500, 8500];
export const SCENE_STARTS = [0, 4000, 13000, 21500];
export const TOTAL_DURATION = 30000;
export const TIMING = {
  zoomIn: 4000,
  focused: 5500,
  firstRatio: 8000,
  second: 13000,
  third: 17500,
  zero: 21500,
  zoomOut: 25500,
  panorama: 27500,
};
export const THRESHOLD = 3;
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
    mode: ["overview", "diagonal", "threshold", "settings"][scene],
  };
}
export function compareBuyDiagonal(upper, lower, threshold = THRESHOLD) {
  if (!upper || !lower || upper.price - lower.price !== 1)
    return { ratio: null, pass: false, reason: "missing-adjacent-level" };
  if (lower.sell === 0)
    return { ratio: null, pass: false, reason: "zero-denominator" };
  const ratio = upper.buy / lower.sell;
  return {
    ratio,
    pass: ratio >= threshold,
    reason: ratio >= threshold ? "threshold-met" : "below-threshold",
  };
}
function recordedFootprint(tuples, label, reverse = false) {
  const rows = tuples.map(([price, sell, buy]) => ({ price, sell, buy }));
  const sequence = reverse ? [...rows].reverse() : rows;
  const trades = sequence.flatMap((row) =>
    [
      { price: row.price, size: row.sell, side: "sell" },
      { price: row.price, size: row.buy, side: "buy" },
    ].filter((trade) => trade.size),
  );
  return {
    label,
    rows,
    trades,
    volume: trades.reduce((sum, trade) => sum + trade.size, 0),
    candle: {
      open: trades[0].price,
      close: trades.at(-1).price,
      high: Math.max(...trades.map((trade) => trade.price)),
      low: Math.min(...trades.map((trade) => trade.price)),
    },
  };
}
export function createImbalanceStory() {
  const context = [
    recordedFootprint(
      [
        [100, 12, 14],
        [101, 11, 16],
        [102, 8, 20],
        [103, 7, 9],
        [104, 4, 3],
      ],
      "14:29",
      true,
    ),
    recordedFootprint(
      [
        [100, 10, 5],
        [101, 10, 30],
        [102, 10, 40],
        [103, 0, 15],
        [104, 8, 12],
      ],
      "14:30",
    ),
    recordedFootprint(
      [
        [100, 12, 14],
        [101, 15, 17],
        [102, 18, 21],
        [103, 12, 19],
        [104, 10, 16],
      ],
      "14:31",
    ),
  ];
  const pairs = [101, 102, 103, 104].map((price, index) => {
    const upper = context[1].rows.find((row) => row.price === price),
      lower = context[1].rows.find((row) => row.price === price - 1);
    return {
      upper,
      lower,
      ...compareBuyDiagonal(upper, lower),
      focusAt: [4000, 13000, 17500, 21500][index],
      revealAt: [8000, 15000, 19500, 23500][index],
    };
  });
  return {
    context,
    pairs,
    threshold: THRESHOLD,
    tick: 1,
    zeroPolicy: "skip",
    completed: true,
  };
}
export function imbalanceSnapshot(story, playhead) {
  const index = Math.max(
    0,
    story.pairs.findLastIndex((pair) => pair.focusAt <= playhead),
  );
  const current = story.pairs[index];
  const visited = story.pairs.filter((pair) => pair.revealAt <= playhead);
  return {
    index,
    current,
    visited,
    highlightedPrices: visited
      .filter((pair) => pair.pass)
      .map((pair) => pair.upper.price),
    showComparison: playhead >= current.revealAt && playhead < TIMING.zoomOut,
    completed: story.completed,
    volume: story.context[1].volume,
  };
}
