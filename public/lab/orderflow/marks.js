// Chart marks that stay readable when a bar is busy: large prints merged into one bubble per bar
// and side, and one capsule per bar for its events. Pure functions; app.js draws them.

/**
 * Prints [t, side, price, qty] → one entry per bar and side: count, total, average price.
 * barOf(t) gives the bar index or null.
 */
export function mergePrints(list, barOf) {
  const out = new Map();
  for (const [t, side, price, qty] of list) {
    const i = barOf(t);
    if (i == null) continue;
    const key = `${i}|${side}`;
    const m = out.get(key) ?? { i, side, count: 0, qty: 0, notional: 0 };
    m.count++;
    m.qty += qty;
    m.notional += price * qty;
    out.set(key, m);
  }
  return [...out.values()].map((m) => ({ ...m, price: m.notional / m.qty }));
}

/** Bubble radius for a merged total: grows with the square root, capped so a bar stays visible. */
export const bubbleRadius = (qty) => Math.min(24, 4 + 0.9 * Math.sqrt(qty));

// One-character names for a single event on a bar.
const SHORT = {
  sweep: "掃",
  absorption: "吸",
  divergence: "背",
  stackedRetest: "回",
  breakout: "破",
  print: "單",
  liq: "爆",
  oi: "OI",
  wall: "牆",
  wall_eaten: "牆",
  wall_pulled: "牆",
  spoof: "誘",
  iceberg: "冰",
};

/**
 * One capsule for a bar's events: its short name when alone, the count when several; the side
 * when they agree (up below the bar, down above it), otherwise none (gold, above).
 */
export function eventMark(list) {
  if (!list.length) return null;
  const dirs = new Set(list.map((e) => e.dir ?? null));
  const dir = dirs.size === 1 ? [...dirs][0] : null;
  return { label: list.length === 1 ? (SHORT[list[0].kind] ?? "•") : String(list.length), dir, count: list.length };
}

/** Time left in the forming bar as m:ss (h:mm:ss from an hour). */
export function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
