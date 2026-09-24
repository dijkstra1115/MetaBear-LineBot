export const SCENE_DURATIONS = [6000, 12000, 12000, 6000];
export const SCENE_STARTS = [0, 6000, 18000, 30000];
export const TOTAL_DURATION = 36000;
export const TIMING = {
  zoomIn: 4000,
  focused: 6000,
  reset: 6000,
  open: 8000,
  close: 14000,
  longTransfer: 20000,
  shortTransfer: 26000,
  zoomOut: 31500,
  panorama: 33500,
};
export const CASE_STARTS = [6000, 12000, 18000, 24000];
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
    mode: ["overview", "open-close", "transfer", "overview"][scene],
  };
}
export function positionTotals(positions) {
  const long = Object.values(positions).reduce((n, p) => n + Math.max(0, p), 0),
    short = Object.values(positions).reduce((n, p) => n + Math.max(0, -p), 0);
  return { long, short, oi: long };
}
export function applyContractTrade(positions, trade) {
  const { buyer, seller, size, buyerAction, sellerAction } = trade;
  if (
    buyer === seller ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !Object.values(positions).every(Number.isFinite) ||
    ![buyerAction, sellerAction].every((a) => a === "open" || a === "close")
  )
    throw new RangeError("Invalid contract trade");
  const next = { ...positions },
    buyBefore = next[buyer] ?? 0,
    sellBefore = next[seller] ?? 0;
  if (
    (buyerAction === "close" && buyBefore > -size) ||
    (buyerAction === "open" && buyBefore < 0) ||
    (sellerAction === "close" && sellBefore < size) ||
    (sellerAction === "open" && sellBefore > 0)
  )
    throw new RangeError(
      "Opening and closing flags must match account positions",
    );
  next[buyer] = buyBefore + size;
  next[seller] = sellBefore - size;
  const { long, short } = positionTotals(next);
  if (Math.abs(long - short) > 1e-9)
    throw new RangeError("Contract positions must balance");
  return { positions: next, oi: long, volumeAdded: size };
}
export function createOpenInterestStory() {
  const op = (buyer, seller, buyerAction, sellerAction, price) => ({
    buyer,
    seller,
    buyerAction,
    sellerAction,
    price,
    size: 1,
  });
  const raw = [
    [
      op("A", "B", "open", "open", 100),
      op("C", "D", "open", "open", 101),
      op("E", "A", "open", "close", 99),
      op("A", "E", "open", "close", 100),
    ],
    [
      op("E", "A", "open", "close", 100),
      op("B", "F", "close", "open", 102),
      op("A", "E", "open", "close", 103),
      op("F", "B", "close", "open", 102),
    ],
    [
      op("I", "J", "open", "open", 104),
      op("J", "I", "close", "close", 102),
      op("E", "A", "open", "close", 103),
      op("B", "F", "close", "open", 101),
    ],
    [
      op("G", "C", "open", "close", 101),
      op("D", "H", "close", "open", 103),
      op("C", "G", "open", "close", 104),
      op("H", "D", "close", "open", 102),
    ],
    [
      op("I", "E", "open", "close", 102),
      op("F", "J", "close", "open", 100),
      op("E", "I", "open", "close", 99),
      op("J", "F", "close", "open", 100),
    ],
  ];
  let positions = {},
    cumulativeVolume = 0;
  const history = [],
    bars = [];
  for (const [barIndex, entries] of raw.entries()) {
    const rows = [];
    for (const [tick, entry] of entries.entries()) {
      const before = {
        positions: { ...positions },
        oi: positionTotals(positions).oi,
      };
      const result = applyContractTrade(positions, entry);
      positions = result.positions;
      cumulativeVolume += entry.size;
      const row = {
        ...entry,
        barIndex,
        tick,
        time: barIndex * 60000 + (tick + 1) * 12000,
        before,
        after: { positions: { ...positions }, oi: result.oi },
        delta: result.oi - before.oi,
        cumulativeVolume,
      };
      rows.push(row);
      history.push(row);
    }
    bars.push({
      index: barIndex,
      label: `14:${String(28 + barIndex).padStart(2, "0")}`,
      open: rows[0].price,
      high: Math.max(...rows.map((r) => r.price)),
      low: Math.min(...rows.map((r) => r.price)),
      close: rows.at(-1).price,
      rows,
      oi: rows.at(-1).after.oi,
    });
  }
  const starts = [
    TIMING.open,
    TIMING.close,
    TIMING.longTransfer,
    TIMING.shortTransfer,
  ];
  const labels = ["雙方開新倉", "雙方平倉", "多方換手", "空方換手"];
  const trades = bars[2].rows.map((row, index) => ({
    ...row,
    index,
    at: starts[index],
    caseStart: CASE_STARTS[index],
    label: labels[index],
    buyerLabel: row.buyerAction === "open" ? "開多" : "平空",
    sellerLabel: row.sellerAction === "open" ? "開空" : "平多",
  }));
  return {
    bars,
    history,
    trades,
    selectedBar: 2,
    initial: { ...trades[0].before.positions },
    initialOi: trades[0].before.oi,
  };
}
export function openInterestSnapshot(story, playhead) {
  const replay = playhead >= TIMING.reset && playhead < TIMING.panorama;
  const visible = replay
    ? story.trades.filter((t) => t.at <= playhead)
    : story.trades;
  const latest = visible.at(-1);
  const positions = { ...(latest?.after.positions ?? story.initial) };
  const activeIndex = Math.max(
    0,
    Math.min(
      3,
      CASE_STARTS.findLastIndex((at) => at <= playhead),
    ),
  );
  const active = story.trades[activeIndex];
  const executed = replay ? playhead >= active.at : true;
  return {
    playhead,
    replay,
    positions,
    oi: latest?.after.oi ?? story.initialOi,
    volume: visible.reduce((n, t) => n + t.size, 0),
    trades: visible,
    active,
    activeIndex,
    executed,
    event: latest ?? null,
    bars: story.bars,
    history: story.history,
    initialOi: story.initialOi,
    selectedBar: story.selectedBar,
  };
}
export const positionLabel = (value) =>
  value > 0
    ? `多 ${value} 口`
    : value < 0
      ? `空 ${Math.abs(value)} 口`
      : "無持倉";
export const formatClock = (time) =>
  `00:${String(Math.min(36, Math.floor(time / 1000))).padStart(2, "0")}`;
