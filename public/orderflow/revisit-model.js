import { Market, round } from "./engine.js";
import { createWickStory, wickSnapshot } from "./wick-model.js";

export const LEVEL = 68420.5;
export const WINDOW_START = 50000;
export const WINDOW_END = 60000;
export const END = 90000;
export const SCENE_DURATIONS = [
  11000, 10500, 12500, 6500, 14000, 12000, 11500, 9500, 16200,
];
export const BREAK_TIMING = [
  [0, 82000],
  [1000, 82999],
  [1800, 83000],
  [3200, 83005],
  [5000, 83006],
  [6900, 83012],
  [8500, 84000],
  [10500, 84800],
  [11500, 85000],
];
export const clamp = (v) => Math.max(0, Math.min(1, v));
export const ease = (v) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
export const mix = (a, b, t) => a + (b - a) * t;

const add = (at, side, price, size) => ({ at, kind: "add", side, price, size });
const cancel = (at, price, size) => ({
  at,
  kind: "cancel",
  side: "buy",
  price,
  size,
});
const trade = (at, side, size) => ({ at, kind: "trade", side, size });
const schedule = [
  ...[22, 22.5, 23, 23.5, 24].map((n, i) =>
    add(61000 + i, "sell", 68400 + n, i === 4 ? 0.6 : 0.12),
  ),
  trade(62000, "buy", 0.15),
  trade(63000, "buy", 0.3),
  add(63500, "buy", 68422.5, 0.2),
  trade(64100, "sell", 0.04),
  trade(65000, "buy", 0.28),
  add(65500, "buy", 68423.5, 0.3),
  trade(67000, "sell", 0.12),
  trade(68000, "buy", 0.1),
  trade(70000, "sell", 0.3),
  add(70500, "sell", 68423, 0.2),
  add(71000, "buy", 68421.5, 0.25),
  trade(71500, "sell", 0.04),
  trade(72000, "sell", 0.15),
  trade(72500, "buy", 0.06),
  add(73000, "sell", 68422, 0.15),
  trade(74000, "sell", 0.1),
  add(75000, "sell", 68421, 0.2),
  cancel(77000, LEVEL, 0.45),
  cancel(78000, 68420, 1.49),
  cancel(78001, 68419.5, 1.5),
  trade(79000, "sell", 0.1),
  trade(80000, "buy", 0.08),
  cancel(81000, LEVEL, 0.04),
  trade(83000, "sell", 0.3),
  add(84000, "sell", 68420, 0.35),
  trade(84800, "buy", 0.1),
  trade(85700, "sell", 0.14),
  add(86000, "buy", 68419.5, 0.4),
  trade(87000, "buy", 0.08),
  trade(88200, "sell", 0.2),
  add(88600, "sell", 68420, 0.3),
  trade(89400, "buy", 0.06),
];

// Keep the first story's exact public tape and final visible book. No new setup
// masquerades as the same market; subsequent prices are produced by matching.
export function createRevisitStory() {
  const previous = createWickStory();
  const initial = wickSnapshot(previous, WINDOW_END);
  const market = new Market();
  Object.assign(market, {
    orders: [],
    trades: [],
    history: [],
    events: [],
    price: initial.price,
    time: WINDOW_END,
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
    const current = trades.filter((t) => t.at >= WINDOW_END);
    const prices = [initial.price, ...current.map((t) => t.price)];
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
          open: initial.price,
          high: Math.max(...prices),
          low: Math.min(...prices),
          close: market.price,
          volume: round(current.reduce((s, t) => s + t.size, 0)),
        },
      },
    });
  }
  save(WINDOW_END);
  for (const op of schedule) {
    if (op.kind === "add") {
      const opposite = market.book(op.side === "buy" ? "sell" : "buy")[0];
      if (
        op.side === "buy"
          ? op.price >= opposite.price
          : op.price <= opposite.price
      )
        throw Error(`Crossed quote at ${op.at}`);
      market.add(op.side, op.price, op.size, true);
      events.push({ ...op });
      save(op.at);
      continue;
    }
    if (op.kind === "cancel") {
      let remaining = op.size;
      for (const order of market.orders.filter(
        (o) => o.side === op.side && o.price === op.price,
      )) {
        const take = Math.min(remaining, order.visible);
        order.visible = round(order.visible - take);
        order.remaining = round(order.remaining - take);
        remaining = round(remaining - take);
      }
      if (remaining > 1e-8)
        throw Error(`Missing cancellation depth at ${op.at}`);
      events.push({ ...op });
      save(op.at);
      continue;
    }
    let remaining = op.size,
      slice = 0;
    while (remaining > 1e-8) {
      const bookSide = op.side === "buy" ? "sell" : "buy";
      const level = market.book(bookSide)[0];
      if (!level) throw Error(`Missing depth at ${op.at}`);
      const maker = market.orders
        .filter(
          (o) =>
            o.side === bookSide && o.price === level.price && o.visible > 1e-8,
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
      }
      remaining = round(remaining - result.filled);
      save(trades.at(-1).at);
    }
  }
  return { frames, events, previousCandle: initial.candle, duration: END };
}

export const revisitSnapshot = wickSnapshot;

// Exact aggressor-side executions, binned at the native 0.5 USDT tick. These
// are not candle-direction estimates. The selected window never rolls forward.
export function footprint(state, start = WINDOW_START, end = WINDOW_END) {
  const rows = new Map();
  for (const t of state.trades) {
    if (t.at < start || t.at >= end) continue;
    const row = rows.get(t.price) || {
      price: t.price,
      buy: 0,
      sell: 0,
      volume: 0,
    };
    row[t.side] = round(row[t.side] + t.size);
    row.volume = round(row.volume + t.size);
    rows.set(t.price, row);
  }
  return [...rows.values()].sort((a, b) => b.price - a.price);
}

export const passiveAt = (state, price = LEVEL) =>
  state.bids.find((r) => r.price === price)?.size ?? 0;

// Piecewise-constant depth history; each segment ends at the current cursor or
// the next known update, never at a future timestamp. Zero quantity stays dark.
export function depthHistory(story, at, start = 75000, price = LEVEL) {
  if (at <= start) return [];
  const changes = [
    { at: start, size: passiveAt(revisitSnapshot(story, start), price) },
  ];
  for (const frame of story.frames) {
    if (frame.at <= start || frame.at > at) continue;
    const size = passiveAt(frame.state, price);
    if (size !== changes.at(-1).size) changes.push({ at: frame.at, size });
  }
  return changes.map((c, i) => ({ ...c, end: changes[i + 1]?.at ?? at }));
}

// Latest executed price is held until the next fill. Never interpolate a
// diagonal price move, or include a fill beyond the current replay cursor.
export function priceTrace(state, at, start = 75000) {
  if (at < start) return [];
  const initial = state.trades.filter((t) => t.at <= start).at(-1);
  if (!initial) return [];
  const points = [{ at: start, price: initial.price }];
  for (const trade of state.trades) {
    if (trade.at > start && trade.at <= at)
      points.push({ at: trade.at, price: trade.price });
  }
  if (points.at(-1).at < at) points.push({ at, price: points.at(-1).price });
  return points;
}

export function mappedTime(elapsed, timing = BREAK_TIMING) {
  for (let i = 1; i < timing.length; i++) {
    const [a, b] = [timing[i - 1], timing[i]];
    if (elapsed <= b[0])
      return mix(a[1], b[1], clamp((elapsed - a[0]) / (b[0] - a[0])));
  }
  return timing.at(-1)[1];
}

export function scenePosition(scene, elapsed, reduced = false) {
  const duration = SCENE_DURATIONS[scene];
  const at = Math.max(0, Math.min(duration, elapsed));
  const base = { scene, elapsed: at, progress: at / duration, reduced };
  if (scene === 0)
    return { ...base, time: 60000 + (at / duration) * 30000, mode: "preview" };
  if (scene === 1) {
    if (at < 1200)
      return {
        ...base,
        time: reduced ? 50000 : mix(90000, 50000, ease(at / 1200)),
        mode: "rewind",
      };
    if (at < 2800) return { ...base, time: 50000, mode: "approach" };
    return {
      ...base,
      time: mix(50000, 52200, (at - 2800) / (duration - 2800)),
      mode: "first-print",
    };
  }
  if (scene === 2)
    return {
      ...base,
      time: mix(52200, 60000, at / duration),
      mode: "footprint",
    };
  if (scene === 3) return { ...base, time: 60000, mode: "profile" };
  if (scene === 4)
    return { ...base, time: mix(60000, 75000, at / duration), mode: "return" };
  if (scene === 5)
    return { ...base, time: mix(75000, 82000, at / duration), mode: "heatmap" };
  if (scene === 6) return { ...base, time: mappedTime(at), mode: "break" };
  if (scene === 7)
    return { ...base, time: mix(85000, 90000, at / duration), mode: "after" };
  if (at < 1200)
    return {
      ...base,
      time: reduced ? 60000 : mix(90000, 60000, ease(at / 1200)),
      mode: "recap-rewind",
    };
  return {
    ...base,
    time: mix(60000, 90000, (at - 1200) / (duration - 1200)),
    mode: "recap",
  };
}

export function formatClock(time, decimals = true) {
  const minute = 32 + Math.floor(time / 60000);
  const sec = ((time % 60000) / 1000)
    .toFixed(decimals ? 2 : 0)
    .padStart(decimals ? 5 : 2, "0");
  return `14:${minute}:${sec}`;
}
