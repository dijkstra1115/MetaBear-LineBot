import { Market, round } from "./engine.js";
import {
  createRevisitStory,
  revisitSnapshot,
  clamp,
  ease,
  mix,
} from "./revisit-model.js";

export const START = 90000;
export const END = 119000;
export const LEVEL = 68420.5;
export const SCENE_DURATIONS = [
  11000, 10500, 11500, 11000, 12500, 11000, 9000, 15500,
];
const add = (at, side, price, size) => ({ at, kind: "add", side, price, size });
const trade = (at, side, size) => ({ at, kind: "trade", side, size });
const schedule = [
  add(90500, "sell", LEVEL, 0.6),
  add(90600, "buy", 68419, 0.2),
  add(90601, "buy", 68418.5, 0.65),
  trade(91500, "buy", 0.2),
  trade(93000, "sell", 0.05),
  trade(94200, "buy", 0.21),
  trade(95500, "buy", 0.25),
  add(96600, "buy", 68420, 0.18),
  trade(97100, "sell", 0.06),
  add(98000, "sell", LEVEL, 0.35),
  trade(99000, "buy", 0.4),
  add(100100, "buy", 68420, 0.2),
  trade(101000, "buy", 0.2),
  add(102000, "sell", LEVEL, 0.5),
  trade(102800, "sell", 0.08),
  trade(103500, "buy", 0.35),
  add(104300, "sell", LEVEL, 0.35),
  trade(105000, "buy", 0.3),
  trade(106000, "sell", 0.1),
  add(106500, "sell", LEVEL, 0.4),
  trade(107000, "buy", 0.4),
  add(108500, "sell", LEVEL, 0.25),
  trade(109000, "sell", 0.14),
  trade(110000, "sell", 0.35),
  trade(111000, "sell", 0.2),
  trade(112000, "sell", 0.18),
  add(112500, "sell", 68419, 0.24),
  trade(113000, "buy", 0.06),
  trade(114000, "sell", 0.12),
  trade(115000, "buy", 0.08),
  add(116000, "buy", 68418.5, 0.2),
  trade(116500, "sell", 0.08),
  add(117200, "sell", 68419, 0.18),
  trade(118000, "buy", 0.06),
  trade(118600, "sell", 0.05),
];

// Continue the same public book and tape at :30, within the same 14:33 candle.
// Every fill is matched to visible depth; the CVD does not generate the price.
export function createDeltaStory() {
  const previous = createRevisitStory();
  const initial = revisitSnapshot(previous, START);
  const market = new Market();
  Object.assign(market, {
    orders: [],
    trades: [],
    history: [],
    events: [],
    price: initial.price,
    time: START,
  });
  for (const [side, rows] of [
    ["buy", initial.bids],
    ["sell", initial.asks],
  ])
    for (const row of rows) market.add(side, row.price, row.size, true);
  const frames = structuredClone(previous.frames);
  const events = structuredClone(previous.events);
  const trades = structuredClone(initial.trades);
  function save(at) {
    const current = trades.filter((t) => t.at >= 60000);
    const prices = [initial.candle.open, ...current.map((t) => t.price)];
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
        candle: {
          open: initial.candle.open,
          high: Math.max(...prices),
          low: Math.min(...prices),
          close: market.price,
          volume: round(current.reduce((s, t) => s + t.size, 0)),
        },
      },
    });
  }
  for (const op of schedule) {
    if (op.kind === "add") {
      const opposite = market.book(op.side === "buy" ? "sell" : "buy")[0];
      if (
        opposite &&
        (op.side === "buy"
          ? op.price >= opposite.price
          : op.price <= opposite.price)
      )
        throw Error(`Crossed quote at ${op.at}`);
      market.add(op.side, op.price, op.size, true);
      events.push({ ...op });
      save(op.at);
      continue;
    }
    let remaining = op.size,
      slice = 0;
    while (remaining > 1e-8) {
      const side = op.side === "buy" ? "sell" : "buy";
      const level = market.book(side)[0];
      if (!level) throw Error(`Missing depth at ${op.at}`);
      const maker = market.orders
        .filter(
          (o) => o.side === side && o.price === level.price && o.visible > 1e-8,
        )
        .sort((a, b) => a.priority - b.priority)[0];
      const result = market.execute({
        side: op.side,
        size: Math.min(remaining, maker.visible),
        own: false,
      });
      if (!result.filled) throw Error(`Missing execution at ${op.at}`);
      for (const fill of result.fills) {
        const t = {
          at: op.at + slice++ * 6,
          side: op.side,
          price: fill.price,
          size: fill.size,
        };
        trades.push(t);
        events.push({ ...t, kind: "trade" });
        save(t.at);
      }
      remaining = round(remaining - result.filled);
    }
  }
  return { frames, events, duration: END };
}

export const deltaSnapshot = revisitSnapshot;

// Exact taker-side fills in a fixed, explicitly labelled window. No candle-
// direction proxy, quote updates, passive counterpart or future fill is counted.
export function totals(state, at, start = START) {
  let buy = 0,
    sell = 0;
  for (const t of state.trades) {
    if (t.at < start || t.at > at) continue;
    if (t.side === "buy") buy = round(buy + t.size);
    else sell = round(sell + t.size);
  }
  return { buy, sell, delta: round(buy - sell) };
}

export function deltaTrace(state, at, start = START) {
  if (at < start) return [];
  const points = [{ at: start, delta: 0 }];
  let value = 0;
  for (const t of state.trades) {
    if (t.at < start || t.at > at) continue;
    value = round(value + (t.side === "buy" ? t.size : -t.size));
    points.push({ at: t.at, delta: value });
  }
  if (points.at(-1).at < at) points.push({ at, delta: value });
  return points;
}

export const passiveSell = (state, price = LEVEL) =>
  state.asks.find((r) => r.price === price)?.size ?? 0;

export function scenePosition(scene, elapsed, reduced = false) {
  const duration = SCENE_DURATIONS[scene];
  const at = Math.max(0, Math.min(duration, elapsed));
  const base = { scene, elapsed: at, progress: at / duration, reduced };
  if (scene === 0)
    return { ...base, time: mix(START, END, at / duration), mode: "preview" };
  if (scene === 1) {
    if (at < 1200)
      return {
        ...base,
        time: reduced ? START : mix(END, START, ease(at / 1200)),
        mode: "rewind",
      };
    return {
      ...base,
      time: mix(START, 94500, clamp((at - 1200) / (duration - 1200))),
      mode: "count",
    };
  }
  if (scene === 2)
    return { ...base, time: mix(94500, 101000, at / duration), mode: "build" };
  if (scene === 3)
    return {
      ...base,
      time: mix(101000, 108000, at / duration),
      mode: "diverge",
    };
  if (scene === 4) {
    if (at < 1200)
      return {
        ...base,
        time: reduced ? 101000 : mix(108000, 101000, ease(at / 1200)),
        mode: "depth-rewind",
      };
    return {
      ...base,
      time: mix(101000, 108000, (at - 1200) / (duration - 1200)),
      mode: "depth",
    };
  }
  if (scene === 5)
    return { ...base, time: mix(108000, 114000, at / duration), mode: "fall" };
  if (scene === 6)
    return { ...base, time: mix(114000, END, at / duration), mode: "positive" };
  if (at < 1200)
    return {
      ...base,
      time: reduced ? START : mix(END, START, ease(at / 1200)),
      mode: "recap-rewind",
    };
  return {
    ...base,
    time: mix(START, END, (at - 1200) / (duration - 1200)),
    mode: "recap",
  };
}
