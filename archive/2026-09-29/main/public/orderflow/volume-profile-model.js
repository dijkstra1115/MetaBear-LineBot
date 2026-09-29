export const SCENE_DURATIONS = [4000, 9000, 10000, 7000];
export const SCENE_STARTS = [0, 4000, 13000, 23000];
export const TOTAL_DURATION = 30000;
export const TIMING = {
  zoomIn: 4000,
  focused: 5500,
  firstMove: 6000,
  lastArrival: 21300,
  poc: 23000,
  zoomOut: 24000,
  panorama: 26000,
};
export const PRICES = [103, 102, 101, 100];
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
    mode: ["range", "regroup", "accumulate", "profile"][scene],
  };
}
export function createVolumeProfileStory() {
  const tapes = [
    [
      [100, 10],
      [101, 20],
      [102, 10],
    ],
    [
      [101, 20],
      [102, 20],
      [103, 20],
    ],
    [
      [102, 10],
      [101, 20],
      [100, 10],
    ],
  ];
  const minutes = tapes.map((tape, index) => {
    const trades = tape.map(([price, size]) => ({ price, size }));
    return {
      label: `14:${30 + index}`,
      duration: 60000,
      trades,
      volume: trades.reduce((sum, trade) => sum + trade.size, 0),
      candle: {
        open: trades[0].price,
        close: trades.at(-1).price,
        high: Math.max(...trades.map((t) => t.price)),
        low: Math.min(...trades.map((t) => t.price)),
      },
    };
  });
  const fragments = minutes.flatMap((minute, minuteIndex) =>
    [...minute.trades]
      .sort((a, b) => a.price - b.price)
      .map((trade, index) => ({
        ...trade,
        minuteIndex,
        sourceOffset: [...minute.trades]
          .filter((t) => t.price < trade.price)
          .reduce((sum, t) => sum + t.size, 0),
        id: `m${minuteIndex}-p${trade.price}`,
        depart: TIMING.firstMove + (minuteIndex * 3 + index) * 1800,
        duration: 900,
      })),
  );
  for (const [index, fragment] of fragments.entries())
    fragment.targetOffset = fragments
      .slice(0, index)
      .filter((other) => other.price === fragment.price)
      .reduce((sum, other) => sum + other.size, 0);
  const total = fragments.reduce((sum, fragment) => sum + fragment.size, 0);
  const profile = PRICES.map((price) => ({
    price,
    volume: fragments
      .filter((fragment) => fragment.price === price)
      .reduce((sum, fragment) => sum + fragment.size, 0),
  }));
  const poc = profile.reduce((best, row) =>
    row.volume > best.volume ? row : best,
  );
  return {
    minutes,
    fragments,
    total,
    profile,
    poc,
    range: "14:30–14:33",
    tick: 1,
  };
}
export function volumeProfileSnapshot(story, playhead) {
  const fragments = story.fragments.map((fragment) => ({
    ...fragment,
    owner:
      playhead < fragment.depart
        ? "source"
        : playhead < fragment.depart + fragment.duration
          ? "transit"
          : "profile",
    progress: clamp((playhead - fragment.depart) / fragment.duration),
  }));
  const quantity = (owner) =>
    fragments
      .filter((fragment) => fragment.owner === owner)
      .reduce((sum, fragment) => sum + fragment.size, 0);
  const profile = PRICES.map((price) => ({
    price,
    volume: fragments
      .filter(
        (fragment) => fragment.owner === "profile" && fragment.price === price,
      )
      .reduce((sum, fragment) => sum + fragment.size, 0),
  }));
  return {
    fragments,
    profile,
    total: story.total,
    pending: quantity("source"),
    inTransit: quantity("transit"),
    classified: quantity("profile"),
    pendingByMinute: story.minutes.map((_, index) =>
      fragments
        .filter(
          (fragment) =>
            fragment.owner === "source" && fragment.minuteIndex === index,
        )
        .reduce((sum, fragment) => sum + fragment.size, 0),
    ),
    complete: fragments.every((fragment) => fragment.owner === "profile"),
  };
}
