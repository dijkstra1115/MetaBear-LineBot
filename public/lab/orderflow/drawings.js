// 畫線工具: the visitor's horizontal and trend lines. Points are kept as time and price, not bar
// indices, so a line stays on the same moment across timeframes; lines are saved per market in
// this browser. Pure helpers; app.js does the drawing and the pointer handling.

const KEY = "metabear-orderflow-drawings";
export const HIT_PX = 6; // how close the pointer must be to pick a line
const MAX = 200; // per market, so a stuck click cannot fill storage

const valid = (d) =>
  d &&
  typeof d.id === "string" &&
  ((d.type === "h" && Number.isFinite(d.p)) ||
    (d.type === "t" && [d.a, d.b].every((q) => q && Number.isFinite(q.t) && Number.isFinite(q.p))));

export function loadDrawings(market, storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage.getItem(KEY) ?? "{}");
    return Array.isArray(all[market]) ? all[market].filter(valid).slice(-MAX) : [];
  } catch {
    return [];
  }
}

export function saveDrawings(market, list, storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage.getItem(KEY) ?? "{}");
    all[market] = list.slice(-MAX);
    storage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Private mode or full storage: the lines last until the page closes.
  }
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Fractional bar index of time t on bars (sorted by t, each with t and end); before the first bar
 * or after the last it runs on at one bar per tfMs.
 */
export function indexAt(bars, t, tfMs) {
  if (!bars.length) return 0;
  const last = bars.length - 1;
  if (t < bars[0].t) return (t - bars[0].t) / tfMs;
  if (t >= bars[last].t) return last + (t - bars[last].t) / tfMs;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (bars[m].t <= t) lo = m;
    else hi = m - 1;
  }
  return lo + Math.min(1, (t - bars[lo].t) / (bars[lo].end - bars[lo].t || tfMs));
}

/** The time at fractional bar index i: the inverse of indexAt. */
export function timeAt(bars, i, tfMs) {
  if (!bars.length) return 0;
  const last = bars.length - 1;
  if (i < 0) return bars[0].t + i * tfMs;
  if (i >= last) return bars[last].t + (i - last) * tfMs;
  const k = Math.floor(i);
  return bars[k].t + (i - k) * (bars[k].end - bars[k].t);
}

/** Distance from point (px, py) to the segment a–b. */
export function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const k = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + k * dx), py - (ay + k * dy));
}

/**
 * The line under (x, y), nearest first, within HIT_PX: { id, part } where part is "a" or "b" for a
 * trend line's end (which drags that end) or "line" (which moves the whole line). toX(t) and
 * toY(p) map to screen pixels.
 */
export function hitDrawing(list, x, y, toX, toY) {
  let best = null;
  const consider = (id, part, d) => {
    if (d <= HIT_PX && (!best || d < best.d)) best = { id, part, d };
  };
  for (const d of list) {
    if (d.type === "h") consider(d.id, "line", Math.abs(y - toY(d.p)));
    else {
      const ax = toX(d.a.t);
      const ay = toY(d.a.p);
      const bx = toX(d.b.t);
      const by = toY(d.b.p);
      // Ends win over the line near them, so a short line can still be stretched.
      consider(d.id, "a", Math.hypot(x - ax, y - ay) - 2);
      consider(d.id, "b", Math.hypot(x - bx, y - by) - 2);
      consider(d.id, "line", segmentDistance(x, y, ax, ay, bx, by));
    }
  }
  return best && { id: best.id, part: best.part };
}
