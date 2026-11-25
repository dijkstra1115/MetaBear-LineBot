// Setup checks for the track record: the conditions MetaBear's recorded opening logic keeps naming
// (訂單塊, FVG, 獵取流動性, EQH/EQL, 吸收), read off the chart at the minute a trade opened. Order
// blocks, FVGs, pivots and EQH/EQL come from smc.mjs, the LuxAlgo Smart Money Concepts rules
// MetaBear trades with. They describe what the chart showed, after the fact; they are not the
// reason a trade was taken. scripts/track-record/validate-setups.mjs measures each check against
// the trades whose logic is on record and against random minutes.
import { runSmc } from "./smc.mjs";

export const MIN = 60_000;
export const TFS = [1, 5, 15, 60];
const SWEEP_WINDOW = { 1: 30, 5: 6, 15: 4, 60: 2 }; // bars: the sweep must be this recent
const SWEEP_LOOK = { 1: 240, 5: 288, 15: 192, 60: 120 }; // bars: how old a swept pivot may be

export const P = {
  zoneTol: 0, // ATR(200) an entry may sit outside an order block or FVG and still count
  nearRisk: 1, // a swept level counts within this many R of the entry…
  nearAtr: 0.3, // …or this many ATR(200)
  spike: 5, // absorption: a minute with this many times the median volume
  swingObs: false, // also check LuxAlgo swing order blocks (off in the indicator by default)
};

function resample(m1, tf) {
  if (tf === 1) return m1;
  const out = [];
  let cur = null;
  for (const b of m1) {
    const t = Math.floor(b.t / (tf * MIN)) * tf * MIN;
    if (!cur || cur.t !== t) out.push((cur = { ...b, t }));
    else {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.v += b.v;
      cur.d = cur.d == null || b.d == null ? null : cur.d + b.d;
    }
  }
  return out;
}

/** Index of the last bar that starts at or before t (−1 if none). */
function barAt(bars, t) {
  let lo = 0;
  let hi = bars.length - 1;
  let k = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].t <= t) {
      k = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return k;
}

/** Runs the indicator once per timeframe, with a snapshot before the bar holding each time. */
export function prepareSetups(m1, times) {
  const tfs = {};
  for (const tf of TFS) {
    const bars = resample(m1, tf);
    const ks = new Set(times.map((t) => barAt(bars, Math.floor(t / MIN) * MIN)).filter((k) => k > 0));
    tfs[tf] = { bars, smc: runSmc(bars, ks, { swingObs: P.swingObs }) };
  }
  return { m1, tfs };
}

const inZone = (p, a, b, tol) => p >= Math.min(a, b) - tol && p <= Math.max(a, b) + tol;

// Liquidity taken: a pivot (LuxAlgo internal or swing) or an EQH/EQL level that price trades
// through for the first time on a recent bar, closing back on the entry's side, near the entry.
function sweep(tf, bars, smc, k, partial, dir, entry, risk, atr) {
  const bar = (j) => (j === k ? partial : bars[j]);
  const beyond = (b, L) => (dir > 0 ? b.l < L : b.h > L);
  const back = (b, L) => (dir > 0 ? b.c >= L : b.c <= L);
  const side = dir > 0 ? "low" : "high";
  const near = Math.max(P.nearRisk * risk, P.nearAtr * atr);
  const levels = [
    ...smc.pivots.filter((p) => p.side === side && p.kind !== "eq").map((p) => ({ level: p.level, idx: p.idx, at: p.at, from: p.kind })),
    ...smc.eqs.filter((e) => e.side === side).map((e) => ({ level: dir > 0 ? Math.min(e.level, e.prev) : Math.max(e.level, e.prev), idx: e.idx, at: e.at, from: "eq" })),
  ].filter((p) => p.at < k && p.idx >= k - SWEEP_LOOK[tf] && Math.abs(entry - p.level) <= near);
  let best = null;
  for (const p of levels) {
    let j = p.idx + 1;
    while (j <= k && !beyond(bar(j), p.level)) j++;
    if (j > k || j <= k - SWEEP_WINDOW[tf] || !back(bar(j), p.level)) continue;
    if (!best || j > best.j || (j === best.j && p.from === "eq")) best = { ...p, j };
  }
  if (!best) return [];
  return [{ kind: "sweep", tf, t: bars[best.j].t, level: best.level, extreme: dir > 0 ? bar(best.j).l : bar(best.j).h, eq: best.from === "eq", from: best.from }];
}

// Absorption: in the last 20 minutes a minute with spike× the median volume of the 3 h before,
// aggressive orders against the trade (when delta is known), a close away from that extreme, and
// no close beyond it since.
function absorption(m1, last, dir, entry, risk) {
  const from = last - 20;
  const vols = m1.slice(Math.max(0, from - 180), from).map((b) => b.v).sort((a, b) => a - b);
  if (vols.length < 60) return [];
  const med = vols[vols.length >> 1] || 1e-9;
  for (let i = last; i > from; i--) {
    const b = m1[i];
    if (b.v < P.spike * med || (b.d != null && dir * b.d >= 0)) continue;
    const ext = dir > 0 ? b.l : b.h;
    if (Math.abs(b.c - ext) < 0.5 * (b.h - b.l)) continue;
    if (Math.abs(ext - entry) > 2 * risk + 3 * (b.h - b.l)) continue;
    let held = true;
    for (let j = i + 1; j <= last && held; j++) held = dir > 0 ? m1[j].c >= b.l : m1[j].c <= b.h;
    if (held) return [{ kind: "absorb", tf: 1, t: b.t, extreme: ext, times: b.v / med, delta: b.d }];
  }
  return [];
}

/** The setups on the chart when a trade opened, from a prepareSetups() that included `at`. */
export function setupsAt(prep, { side, entry, stop, at }) {
  const cut = Math.floor(at / MIN) * MIN;
  const dir = side === "long" ? 1 : -1;
  const risk = Math.abs(entry - stop);
  const last = barAt(prep.m1, cut);
  if (last < 200) return [];
  const found = [];
  for (const tf of TFS) {
    const { bars, smc } = prep.tfs[tf];
    const k = barAt(bars, cut);
    const snap = smc.snapshots.get(k);
    if (!snap || !Number.isFinite(snap.atr)) continue;
    const tol = P.zoneTol * snap.atr;
    const ob = snap.obs.find((o) => o.bias === dir && inZone(entry, o.lo, o.hi, tol));
    if (ob) found.push({ kind: "ob", tf, t: ob.t, lo: Math.min(ob.lo, ob.hi), hi: Math.max(ob.lo, ob.hi), swing: ob.kind === "swing" });
    const fvg = snap.fvgs.find((f) => f.bias === dir && inZone(entry, f.top, f.bottom, tol));
    if (fvg) found.push({ kind: "fvg", tf, t: fvg.t, lo: Math.min(fvg.top, fvg.bottom), hi: Math.max(fvg.top, fvg.bottom) });
    // The bar holding the entry, up to the entry minute.
    const part = prep.m1.slice(barAt(prep.m1, bars[k].t), last + 1);
    const partial = { t: bars[k].t, o: part[0].o, h: Math.max(...part.map((b) => b.h)), l: Math.min(...part.map((b) => b.l)), c: part.at(-1).c };
    found.push(...sweep(tf, bars, smc, k, partial, dir, entry, risk, snap.atr));
  }
  found.push(...absorption(prep.m1, last, dir, entry, risk));
  return found;
}

export const detectSetups = (m1, q) => setupsAt(prepareSetups(m1, [q.at]), q);

/** The label tags a set of findings supports. */
export function tagsOf(found) {
  const tags = new Set();
  const obTfs = new Set();
  for (const f of found) {
    if (f.kind === "sweep") {
      tags.add("sweep");
      if (f.eq) tags.add("eq");
    } else if (f.kind === "ob") {
      tags.add("ob");
      obTfs.add(f.tf);
    } else tags.add(f.kind);
  }
  if (obTfs.size >= 2) tags.add("obOverlap");
  return tags;
}
