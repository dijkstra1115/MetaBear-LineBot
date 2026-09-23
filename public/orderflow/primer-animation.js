import { schedule } from "./primer-model.js";
import { clamp } from "./revisit-model.js";

export function visibleOrder(state, p) {
  let at;
  if (p.scene === 2 || p.scene === 3) at = 16000;
  else if (p.scene === 4 && p.time >= 30600) at = 32000;
  else if (p.scene === 5 && p.time >= 38600)
    at = p.time >= 47600 ? 49000 : 40000;
  if (!at) return null;
  if (state.order?.at === at) return state.order;
  const incoming = schedule.find((op) => op.at === at);
  return { ...incoming, filled: 0, remaining: incoming.size, fills: [] };
}

export function pairingAt(state, p) {
  const order = visibleOrder(state, p);
  if (!order || p.time < order.at || !order.remaining) return null;
  const side = order.side === "buy" ? "sell" : "buy";
  const maker = state[side === "buy" ? "bids" : "asks"][0];
  if (!maker) return null;
  const prior = order.fills.at(-1)?.at ?? order.at;
  return {
    order,
    side,
    maker,
    count: Math.min(maker.size, order.remaining),
    progress: clamp((p.time - prior) / 6),
  };
}

export function transfersAt(time) {
  return schedule
    .filter((op) => op.at < 59000)
    .map((op) => ({ ...op, start: op.at - 1400 }))
    .filter((op) => time > op.start && time < op.at)
    .map((op) => ({ ...op, progress: (time - op.start) / (op.at - op.start) }));
}

export function rowsAt(state, side, scene) {
  const rows = state[side === "buy" ? "bids" : "asks"].slice(0, 3);
  if (side === "sell" && [2, 3].includes(scene)) {
    for (const price of [101, 103, 110])
      if (!rows.some((r) => r.price === price)) rows.push({ price, size: 0 });
  }
  if (
    side === "buy" &&
    scene === 4 &&
    !rows.some((r) => r.price === 103) &&
    state.order?.at === 32000
  )
    rows.push({ price: 103, size: 0 });
  // Keep consumed bid rows in place while the nine-unit sell crosses levels.
  if (side === "buy" && scene === 5)
    for (const price of [103, 99])
      if (!rows.some((r) => r.price === price)) rows.push({ price, size: 0 });
  return rows
    .sort((a, b) => (side === "buy" ? b.price - a.price : a.price - b.price))
    .slice(0, 3);
}
