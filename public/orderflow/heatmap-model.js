import { Market } from "./engine.js";

export const SCENE_DURATIONS = [6000, 8000, 11000, 5000];
export const SCENE_STARTS = [0, 6000, 14000, 25000];
export const TOTAL_DURATION = 30000;
export const PRICES = [104, 103, 102, 101, 100, 99, 98];
export const TIMING = {
  zoomIn: 6000,
  focused: 7200,
  add: 9000,
  fill: 14000,
  cancel: 19500,
  zoomOut: 25000,
  panorama: 26700,
};
export const clamp = (v) => Math.max(0, Math.min(1, v));
export function ease(v) {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
}

const TIME_MAP = [
  [0, 0],
  [1200, 0],
  [3000, 8000],
  [4000, 16000],
  [5000, 20000],
  [6000, 24000],
  [9000, 30000],
  [14000, 40000],
  [19500, 50000],
  [25000, 60000],
  [30000, 60000],
];
export function scenePosition(scene, elapsed, reduced = false) {
  const playhead =
    SCENE_STARTS[scene] +
    Math.max(0, Math.min(SCENE_DURATIONS[scene], elapsed));
  let time = 60000;
  for (let i = 1; i < TIME_MAP.length; i++) {
    const [end, to] = TIME_MAP[i],
      [start, from] = TIME_MAP[i - 1];
    if (playhead <= end) {
      time = from + (to - from) * clamp((playhead - start) / (end - start));
      break;
    }
  }
  return {
    scene,
    elapsed,
    playhead,
    time,
    reduced,
    mode: ["unfold", "depth", "change", "overview"][scene],
  };
}

export function createHeatmapStory() {
  const market = new Market();
  Object.assign(market, {
    orders: [],
    trades: [],
    history: [],
    events: [],
    price: null,
    time: 0,
    id: 0,
  });
  for (const [price, size] of [
    [100, 30],
    [99, 45],
    [98, 20],
  ])
    market.add("buy", price, size);
  for (const [price, size] of [
    [101, 20],
    [102, 40],
    [103, 25],
    [104, 15],
  ])
    market.add("sell", price, size);
  const frames = [],
    trades = [],
    events = [];
  const save = (at) => {
    const bids = market.book("buy"),
      asks = market.book("sell");
    frames.push({
      at,
      price: market.price,
      bids,
      asks,
      rows: PRICES.map((price) => ({
        price,
        size: [...bids, ...asks].find((r) => r.price === price)?.size ?? 0,
        side: price >= 101 ? "sell" : "buy",
      })),
    });
  };
  save(0);
  let added;
  const operations = [
    { at: 8000, playedAt: 3000, kind: "trade", side: "sell", size: 8 },
    { at: 16000, playedAt: 4000, kind: "trade", side: "buy", size: 10 },
    { at: 20000, playedAt: 5000, kind: "trade", side: "buy", size: 10 },
    {
      at: 30000,
      playedAt: TIMING.add,
      kind: "add",
      side: "sell",
      size: 40,
      price: 102,
    },
    { at: 40000, playedAt: TIMING.fill, kind: "trade", side: "buy", size: 25 },
    {
      at: 50000,
      playedAt: TIMING.cancel,
      kind: "cancel",
      side: "sell",
      size: 40,
      price: 102,
    },
  ];
  for (const op of operations) {
    if (op.kind === "add") added = market.add(op.side, op.price, op.size, true);
    else if (op.kind === "cancel") {
      if (!added || added.remaining !== op.size || !market.cancel(added.id))
        throw Error("Heatmap cancellation must remove exactly the added order");
    } else {
      const result = market.execute({
        side: op.side,
        size: op.size,
        own: false,
      });
      if (result.filled !== op.size)
        throw Error("Heatmap example has insufficient depth");
      for (const fill of result.fills)
        trades.push({
          at: op.at,
          playedAt: op.playedAt,
          side: fill.side,
          size: fill.size,
          price: fill.price,
        });
    }
    events.push({ ...op, price: op.price ?? market.price });
    save(op.at);
  }
  return { frames, trades, events };
}

export function heatmapSnapshot(story, time) {
  const frame = story.frames.findLast((f) => f.at <= time) ?? story.frames[0];
  const trades = story.trades.filter((t) => t.at <= time);
  const bands = [];
  for (let i = 0; i < story.frames.length; i++) {
    const f = story.frames[i],
      end = Math.min(time, story.frames[i + 1]?.at ?? time);
    if (f.at >= end) continue;
    for (const row of f.rows)
      if (row.size > 0) bands.push({ ...row, start: f.at, end });
  }
  return {
    ...frame,
    time,
    trades,
    bands,
    event: story.events.findLast((e) => e.at <= time) ?? null,
    volume: trades.reduce((n, t) => n + t.size, 0),
  };
}

export function formatClock(time) {
  const seconds = Math.min(60, Math.floor(time / 1000));
  return seconds === 60
    ? "14:31:00"
    : `14:30:${String(seconds).padStart(2, "0")}`;
}
