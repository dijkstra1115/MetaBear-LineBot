// The structure, order-block, fair-value-gap and EQH/EQL rules of LuxAlgo's "Smart Money Concepts"
// TradingView indicator (© LuxAlgo, licensed CC BY-NC-SA 4.0,
// https://creativecommons.org/licenses/by-nc-sa/4.0/), re-implemented with its default inputs so the
// setups checked on the track record are the ones MetaBear sees on its charts. Internal analysis.
//
// Differences from the indicator: ATR(200) is seeded from fewer bars when the data is shorter than
// 400 bars, and state is read at bar closes (the indicator also redraws inside the forming bar).
const BULL = 1;
const BEAR = -1;

export const SMC_DEFAULTS = {
  internalSize: 5, // internal structure
  swingSize: 50, // swing structure
  eqSize: 3, // EQH/EQL bars confirmation
  eqThreshold: 0.1, // EQH/EQL: within this many ATR(200)
  obShown: 5, // the indicator draws the 5 most recent internal order blocks
  swingObs: false, // swing order blocks are off by default
};

function atrSeries(bars, len = 200) {
  const out = new Array(bars.length).fill(NaN);
  const seed = Math.min(len, Math.max(14, bars.length >> 1));
  let sum = 0;
  let v = NaN;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const p = bars[i - 1];
    const tr = p ? Math.max(b.h - b.l, Math.abs(b.h - p.c), Math.abs(b.l - p.c)) : b.h - b.l;
    if (i < seed) {
      sum += tr;
      if (i === seed - 1) v = sum / seed;
    } else v = (v * (len - 1) + tr) / len; // ta.rma
    out[i] = v;
  }
  return out;
}

const newPivot = () => ({ cur: NaN, crossed: false, idx: -1, seen: NaN });

/**
 * Runs the indicator over `bars` ({t,o,h,l,c}). For every bar index in `checkpoints` it records
 * what was on the chart before that bar opened: the drawn order blocks, the live FVGs and ATR.
 * Also returns every pivot ({kind: internal|swing|eq, side: high|low, level, idx, at}) and every
 * EQH/EQL ({side, level, prev, idx, prevIdx, at}); `at` is the bar on which each was confirmed.
 */
export function runSmc(bars, checkpoints = new Set(), opts = {}) {
  const o = { ...SMC_DEFAULTS, ...opts };
  const n = bars.length;
  const atr = atrSeries(bars);
  const parsedH = new Array(n);
  const parsedL = new Array(n);
  const P = { swingHigh: newPivot(), swingLow: newPivot(), internalHigh: newPivot(), internalLow: newPivot(), equalHigh: newPivot(), equalLow: newPivot() };
  const legs = {};
  const trend = { internal: 0, swing: 0 };
  const obs = { internal: [], swing: [] };
  let fvgs = [];
  let cumDelta = 0;
  const pivots = [];
  const eqs = [];
  const snapshots = new Map();

  // leg(size): 0 bearish, 1 bullish; returns ta.change(leg).
  function legChange(size, i) {
    const s = (legs[size] ??= { leg: 0 });
    const prev = s.leg;
    if (i >= size) {
      let mx = -Infinity;
      let mn = Infinity;
      for (let j = i - size + 1; j <= i; j++) {
        if (bars[j].h > mx) mx = bars[j].h;
        if (bars[j].l < mn) mn = bars[j].l;
      }
      if (bars[i - size].h > mx) s.leg = 0;
      else if (bars[i - size].l < mn) s.leg = 1;
    }
    return s.leg - prev;
  }

  function structure(size, kind, i) {
    const change = legChange(size, i);
    if (!change) return;
    const low = change === 1;
    const p = P[`${kind}${low ? "Low" : "High"}`];
    const level = low ? bars[i - size].l : bars[i - size].h;
    if (kind === "equal" && Math.abs(p.cur - level) < o.eqThreshold * atr[i]) {
      eqs.push({ side: low ? "low" : "high", level, prev: p.cur, idx: i - size, prevIdx: p.idx, at: i });
    }
    p.cur = level;
    p.crossed = false;
    p.idx = i - size;
    pivots.push({ kind: kind === "equal" ? "eq" : kind, side: low ? "low" : "high", level, idx: i - size, at: i });
  }

  function storeOb(p, kind, bias, i) {
    let best = p.idx;
    for (let j = p.idx; j < i; j++) {
      if (bias === BEAR ? parsedH[j] > parsedH[best] : parsedL[j] < parsedL[best]) best = j;
    }
    const list = obs[kind];
    if (list.length >= 100) list.pop();
    list.unshift({ hi: parsedH[best], lo: parsedL[best], t: bars[best].t, idx: best, bias, at: i, kind });
  }

  function display(kind, i) {
    const internal = kind === "internal";
    const c = bars[i].c;
    const c1 = i ? bars[i - 1].c : NaN;
    const hi = internal ? P.internalHigh : P.swingHigh;
    const extraHi = internal ? P.internalHigh.cur !== P.swingHigh.cur : true;
    if (c > hi.cur && c1 <= hi.seen && !hi.crossed && extraHi) {
      hi.crossed = true;
      trend[kind] = BULL;
      if (internal || o.swingObs) storeOb(hi, kind, BULL, i);
    }
    hi.seen = hi.cur;
    const lo = internal ? P.internalLow : P.swingLow;
    const extraLo = internal ? P.internalLow.cur !== P.swingLow.cur : true;
    if (c < lo.cur && c1 >= lo.seen && !lo.crossed && extraLo) {
      lo.crossed = true;
      trend[kind] = BEAR;
      if (internal || o.swingObs) storeOb(lo, kind, BEAR, i);
    }
    lo.seen = lo.cur;
  }

  function mitigate(kind, i) {
    obs[kind] = obs[kind].filter((ob) => !((ob.bias === BEAR && bars[i].h > ob.hi) || (ob.bias === BULL && bars[i].l < ob.lo)));
  }

  for (let i = 0; i < n; i++) {
    if (checkpoints.has(i)) {
      snapshots.set(i, {
        obs: [...obs.internal.slice(0, o.obShown), ...(o.swingObs ? obs.swing.slice(0, o.obShown) : [])],
        fvgs: fvgs.slice(),
        atr: atr[i - 1],
        trend: { ...trend },
      });
    }
    const b = bars[i];
    const highVol = b.h - b.l >= 2 * atr[i];
    parsedH[i] = highVol ? b.l : b.h;
    parsedL[i] = highVol ? b.h : b.l;

    fvgs = fvgs.filter((f) => !((f.bias === BULL && b.l < f.bottom) || (f.bias === BEAR && b.h > f.top)));
    structure(o.swingSize, "swing", i);
    structure(o.internalSize, "internal", i);
    structure(o.eqSize, "equal", i);
    display("internal", i);
    display("swing", i);
    mitigate("internal", i);
    if (o.swingObs) mitigate("swing", i);

    if (i >= 2) {
      const p1 = bars[i - 1];
      const p2 = bars[i - 2];
      const delta = (p1.c - p1.o) / (p1.o * 100);
      cumDelta += Math.abs(delta);
      const threshold = (cumDelta / i) * 2;
      if (b.l > p2.h && p1.c > p2.h && delta > threshold) fvgs.unshift({ top: b.l, bottom: p2.h, bias: BULL, t: p1.t, at: i });
      // As in the indicator, a bearish gap stores top = its lower edge, so it is removed as soon
      // as price trades back into it (a bullish one only once price passes through it).
      if (b.h < p2.l && p1.c < p2.l && -delta > threshold) fvgs.unshift({ top: b.h, bottom: p2.l, bias: BEAR, t: p1.t, at: i });
    }
  }
  return { atr, pivots, eqs, snapshots };
}
