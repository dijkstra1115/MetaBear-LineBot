import { Market, aggregate } from "./engine.js";

export const SCENE_DURATIONS = [2500, 9000, 9500, 9000];
export const SCENE_STARTS = [0, 2500, 11500, 21000];
export const TOTAL_DURATION = 30000;
export const TIMING = {
  zoomIn: 2500,
  reset: 3550,
  firstFill: 4200,
  read: 21000,
  zoomOut: 27000,
  panorama: 28700,
};
export const clamp = (n) => Math.max(0, Math.min(1, n));
export const ease = (n) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

// Presentation time and market time are separate. All fills, captions and
// highlights share these anchors, including when seeking backwards.
const TIME_MAP = [
  [0, 0],
  [2500, 0],
  [4200, 4000],
  [6700, 9000],
  [9100, 15000],
  [11500, 23000],
  [12000, 25000],
  [12500, 26000],
  [15000, 36000],
  [17100, 47000],
  [19200, 54000],
  [20700, 60000],
  [30000, 60000],
];
function marketTime(playhead) {
  for (let i = 1; i < TIME_MAP.length; i++) {
    const [end, to] = TIME_MAP[i],
      [start, from] = TIME_MAP[i - 1];
    if (playhead <= end)
      return from + (to - from) * clamp((playhead - start) / (end - start));
  }
  return 60000;
}
export function scenePosition(scene, elapsed, reduced = false) {
  const playhead =
    SCENE_STARTS[scene] +
    Math.min(SCENE_DURATIONS[scene], Math.max(0, elapsed));
  return {
    scene,
    elapsed,
    playhead,
    time: marketTime(playhead),
    reduced,
    mode: ["unfold", "record", "accumulate", "read"][scene],
  };
}

const operations = [
  { at: 4000, playedAt: 4200, side: "buy", size: 20 },
  { at: 9000, playedAt: 6700, side: "buy", size: 15 },
  { at: 15000, playedAt: 9100, side: "sell", size: 12 },
  {
    at: 25000,
    playedAt: 12000,
    side: "buy",
    size: 20,
    price: 101,
    kind: "add",
  },
  { at: 26000, playedAt: 12500, side: "sell", size: 8 },
  { at: 36000, playedAt: 15000, side: "buy", size: 10 },
  { at: 47000, playedAt: 17100, side: "sell", size: 4 },
  { at: 54000, playedAt: 19200, side: "buy", size: 5 },
];

export function createFootprintStory() {
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
  market.add("buy", 100, 20);
  market.add("sell", 101, 35);
  market.add("sell", 102, 15);
  const trades = [],
    frames = [];
  const save = (at) =>
    frames.push({ at, bids: market.book("buy"), asks: market.book("sell") });
  save(0);
  for (const op of operations) {
    if (op.kind === "add") market.add(op.side, op.price, op.size);
    else {
      const result = market.execute({
        side: op.side,
        size: op.size,
        own: false,
      });
      if (result.filled !== op.size)
        throw Error("Footprint example has insufficient depth");
      for (const fill of result.fills)
        trades.push({
          at: op.at,
          playedAt: op.playedAt,
          side: fill.side,
          price: fill.price,
          size: fill.size,
        });
    }
    save(op.at);
  }
  // Independent synthetic neighbouring minutes provide the same context in
  // the opening and closing overview. OHLC and cells derive from their tape.
  const tapes = [
    [
      [99, "buy", 8],
      [100, "buy", 12],
      [101, "buy", 9],
      [100, "sell", 10],
      [99, "sell", 13],
      [98, "sell", 11],
      [99, "buy", 7],
      [100, "buy", 6],
    ],
    [
      [100, "buy", 14],
      [101, "buy", 22],
      [102, "buy", 16],
      [103, "buy", 6],
      [102, "sell", 11],
      [101, "sell", 17],
    ],
    null,
    [
      [102, "buy", 18],
      [103, "buy", 25],
      [104, "buy", 12],
      [103, "sell", 10],
      [102, "sell", 9],
      [101, "sell", 7],
      [102, "buy", 11],
      [103, "buy", 14],
    ],
    [
      [103, "buy", 16],
      [104, "buy", 8],
      [103, "sell", 23],
      [102, "sell", 19],
      [101, "sell", 15],
      [100, "sell", 8],
      [101, "buy", 12],
    ],
  ];
  const context = tapes.map((tape, index) => {
    const tapeTrades = tape
      ? tape.map(([price, side, size]) => ({ price, side, size }))
      : trades;
    return {
      label: `14:${28 + index}`,
      selected: index === 2,
      ...summarizeTrades(tapeTrades, true),
    };
  });
  return { trades, frames, context };
}

function summarizeTrades(trades, closed) {
  const first = trades[0],
    last = trades.at(-1);
  const rows = aggregate(trades, 1);
  const candle = first
    ? {
        open: first.price,
        high: Math.max(...trades.map((t) => t.price)),
        low: Math.min(...trades.map((t) => t.price)),
        close: last.price,
        closed,
      }
    : null;
  return { trades, rows, candle, price: last?.price ?? null };
}

export function footprintSnapshot(story, time) {
  const trades = story.trades.filter((t) => t.at <= time && t.at < 60000);
  const frame = story.frames.findLast((f) => f.at <= time) ?? story.frames[0];
  return {
    ...summarizeTrades(trades, time >= 60000),
    bids: frame.bids,
    asks: frame.asks,
  };
}

export function formatClock(time) {
  const seconds = Math.min(60, Math.floor(time / 1000));
  return seconds === 60
    ? "14:31:00"
    : `14:30:${String(seconds).padStart(2, "0")}`;
}
