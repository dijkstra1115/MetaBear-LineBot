import { bearPrice, bearSize } from "./bear-market.js";
import { Market, round } from "./engine.js";
import { createWickStory, wickSnapshot } from "./wick-model.js";
import { mappedTime } from "./revisit-model.js";

// Two minutes immediately before wick.html. Times are milliseconds from 14:30.
export const END = 120000;
export const SCENE_DURATIONS = [
  7000, 6000, 7000, 7000, 9500, 15000, 5000, 12000,
];
const add = (at, side, price, size) => ({ at, kind: "add", side, price, size });
const submit = (at, side, size, limit) => ({
  at,
  kind: "submit",
  side,
  size,
  ...(limit ? { limit } : {}),
});
export const schedule = [
  add(2000, "buy", 99, 5),
  add(5000, "sell", 101, 2),
  add(9000, "sell", 110, 1),
  add(12000, "sell", 103, 2),
  submit(16000, "buy", 5, 110),
  add(23000, "sell", 110, 2),
  add(25000, "buy", 103, 5),
  submit(32000, "sell", 2),
  add(38000, "buy", 98, 5),
  submit(40000, "sell", 9),
  add(46000, "sell", 99, 5),
  submit(49000, "buy", 1),
  submit(60000, "buy", 1),
  add(61000, "sell", 101, 5),
  submit(62000, "buy", 4),
  submit(70000, "sell", 1),
  add(80000, "sell", 100, 5),
  submit(90000, "buy", 1),
  submit(110000, "sell", 1),
  submit(119000, "buy", 1),
];

export function createPrimerStory() {
  const market = new Market();
  Object.assign(market, {
    orders: [],
    trades: [],
    history: [],
    events: [],
    price: 100,
    time: 0,
  });
  // The first trade of this minute establishes its open at 100. The book starts empty.
  market.add("buy", 100, 1, true);
  market.execute({ side: "sell", size: 1, own: false });
  const trades = [{ at: 0, side: "sell", price: 100, size: 1, orderAt: 0 }];
  const frames = [],
    events = [];
  let order = null;
  function save(at) {
    frames.push({
      at,
      state: {
        price: market.price,
        bids: market
          .book("buy")
          .map(({ price, size }) => ({ price, size: round(size) })),
        asks: market
          .book("sell")
          .map(({ price, size }) => ({ price, size: round(size) })),
        trades: structuredClone(trades),
        order: order ? structuredClone(order) : null,
      },
    });
  }
  save(0);
  for (const op of schedule) {
    if (op.kind === "add") {
      const opposite = market.book(op.side === "buy" ? "sell" : "buy")[0];
      if (
        opposite &&
        (op.side === "buy"
          ? op.price >= opposite.price
          : op.price <= opposite.price)
      )
        throw Error(`Crossed quote ${op.at}`);
      market.add(op.side, op.price, op.size, true);
      events.push({ ...op });
      save(op.at);
      continue;
    }
    order = { ...op, filled: 0, remaining: op.size, fills: [] };
    events.push({ ...op });
    save(op.at);
    let slice = 0;
    while (order.remaining > 1e-8) {
      const side = op.side === "buy" ? "sell" : "buy";
      const level = market.book(side)[0];
      if (!level) throw Error(`Missing depth ${op.at}`);
      if (
        op.limit &&
        (op.side === "buy" ? level.price > op.limit : level.price < op.limit)
      )
        throw Error("Unfilled scripted limit order");
      const maker = market.orders
        .filter(
          (o) => o.side === side && o.price === level.price && o.visible > 1e-8,
        )
        .sort((a, b) => a.priority - b.priority)[0];
      const makerPriority = maker.priority;
      const result = market.execute({
        side: op.side,
        size: Math.min(order.remaining, maker.visible),
        own: false,
        ...(op.limit ? { type: "limit", price: op.limit } : {}),
      });
      if (result.fills.length !== 1)
        throw Error("Each snapshot must contain one maker fill");
      const fill = result.fills[0];
      const t = {
        at: op.at + ++slice * 6,
        side: op.side,
        price: fill.price,
        size: fill.size,
        orderAt: op.at,
      };
      trades.push(t);
      order.fills.push(t);
      order.filled = round(order.filled + t.size);
      order.remaining = round(order.remaining - t.size);
      events.push({ ...t, kind: "trade", makerPriority });
      save(t.at);
    }
  }
  // Public quote updates bridge to the existing story, never a book replacement.
  // They happen after the last print and do not alter either candle's OHLC.
  const legacy = wickSnapshot(createWickStory(), 0);
  const target = Object.fromEntries(
    ["bids", "asks"].map((key) => [
      key,
      legacy[key].map((row) => ({
        price: bearPrice(row.price),
        size: bearSize(row.size),
      })),
    ]),
  );
  let time = 119500;
  for (const [key, side] of [
    ["bids", "buy"],
    ["asks", "sell"],
  ]) {
    for (const row of market.book(side)) {
      const goal = target[key].find((r) => r.price === row.price)?.size ?? 0;
      let remaining = round(Math.max(0, row.size - goal));
      if (!remaining) continue;
      const size = remaining;
      for (const o of market.orders.filter(
        (o) => o.side === side && o.price === row.price,
      )) {
        const take = Math.min(remaining, o.visible);
        o.visible = round(o.visible - take);
        o.remaining = round(o.remaining - take);
        remaining = round(remaining - take);
      }
      events.push({ at: time, kind: "cancel", side, price: row.price, size });
      save(time++);
    }
  }
  for (const [key, side] of [
    ["bids", "buy"],
    ["asks", "sell"],
  ])
    for (const row of target[key]) {
      const current =
        market.book(side).find((r) => r.price === row.price)?.size ?? 0;
      const size = round(row.size - current);
      if (size <= 0) continue;
      const opposite = market.book(side === "buy" ? "sell" : "buy")[0];
      if (
        opposite &&
        (side === "buy"
          ? row.price >= opposite.price
          : row.price <= opposite.price)
      )
        throw Error("Crossed bridge quote");
      market.add(side, row.price, size, true);
      events.push({ at: time, kind: "add", side, price: row.price, size });
      save(time++);
    }
  return { frames, events, duration: END };
}

export const primerSnapshot = wickSnapshot;

export function candleAt(state, at, start = 0) {
  const end = start + 60000;
  const tape = state.trades.filter(
    (t) => t.at >= start && t.at < end && t.at <= at,
  );
  if (!tape.length) return null;
  const prices = tape.map((t) => t.price);
  return {
    start,
    open: prices[0],
    high: Math.max(...prices),
    low: Math.min(...prices),
    close: prices.at(-1),
    volume: round(tape.reduce((s, t) => s + t.size, 0)),
    closed: at >= end,
  };
}
export function tradeTrace(state, at, start = 0) {
  const points = state.trades
    .filter((t) => t.at >= start && t.at < start + 60000 && t.at <= at)
    .map((t) => ({ at: t.at, price: t.price }));
  const end = Math.min(at, start + 60000);
  if (points.length && points.at(-1).at < end)
    points.push({ at: end, price: points.at(-1).price });
  return points;
}
export function formatPrimerClock(at) {
  const ms = Math.floor(at);
  return `14:${30 + Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, "0")}`;
}
// Slow down each arrival and maker fill, compress the gaps between orders.
// Every beat still advances the same market clock; prices never interpolate.
const SCENE_TIMING = [
  [
    [0, 0],
    [400, 600],
    [2500, 2000],
    [3300, 3600],
    [5800, 5000],
    [7000, 6000],
  ],
  [
    [0, 6000],
    [350, 7600],
    [2000, 9000],
    [2450, 10600],
    [4600, 12000],
    [6000, 14000],
  ],
  [
    [0, 14000],
    [300, 14600],
    [2500, 16000],
    [5800, 16006],
    [7000, 16006],
  ],
  [
    [0, 16006],
    [2600, 16012],
    [5600, 16018],
    [7000, 20000],
  ],
  [
    [0, 20000],
    [250, 21600],
    [1500, 23000],
    [1700, 23600],
    [3200, 25000],
    [3650, 30600],
    [5200, 32000],
    [8000, 32006],
    [9500, 36000],
  ],
  [
    [0, 36000],
    [250, 36600],
    [1600, 38000],
    [1800, 38600],
    [3400, 40000],
    [5300, 40006],
    [7300, 40012],
    [9000, 40018],
    [9250, 44600],
    [10350, 46000],
    [10600, 47600],
    [12000, 49000],
    [13800, 49006],
    [15000, 59000],
  ],
  [
    [0, 59000],
    [3800, 60000],
    [5000, 60000],
  ],
  [
    [0, 60000],
    [1800, 60006],
    [3200, 64000],
    [12000, END],
  ],
];

export function sceneElapsedAt(scene, time) {
  const timing = SCENE_TIMING[scene];
  if (time <= timing[0][1]) return 0;
  for (let i = 1; i < timing.length; i++) {
    const [a, b] = [timing[i - 1], timing[i]];
    if (time <= b[1])
      return a[0] + ((time - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
  }
  return timing.at(-1)[0];
}

export function scenePosition(scene, elapsed, reduced = false) {
  const duration = SCENE_DURATIONS[scene];
  const e = Math.max(0, Math.min(duration, elapsed));
  const modes = [
    "orders",
    "quotes",
    "first-fill",
    "gap",
    "return",
    "body-wick",
    "close",
    "next-minute",
  ];
  return {
    scene,
    elapsed: e,
    progress: e / duration,
    reduced,
    mode: modes[scene],
    time: mappedTime(e, SCENE_TIMING[scene]),
  };
}
