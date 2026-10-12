// Strategy 01 「掃過前低，收回才算數」 (failed auction), the academy lesson in
// docs/FAILED-AUCTION-LESSON-PLAN.md, written as rules that can be run over real data:
//
//   地點 location   the prior UTC day's low and value area (VAL, POC, VAH)
//   事件 event      a 5-minute bar breaks the prior-day low
//   確認 confirm    OI drops (required), sellers are absorbed at the low, the low is
//                   re-tested with less selling (optional), a close back above VAL
//   執行 execute    no chasing: wait for the re-test of VAL and buyers taking over,
//                   stop below the absorption low, targets POC then VAH
//
// The short side mirrors it at the prior-day high (the lesson teaches the long side).
// Lesson numbers such as "1 below the low" are teaching values; P holds the BTC-scale ones.

export const P = {
  tfMs: 5 * 60_000,
  maxSweepPct: 0.01, // a break deeper than 1 % beyond the level is accepted, not a failed auction
  confirmBars: 18, // confirmations must arrive within 90 minutes of the break
  oiDropPct: 0.001, // OI must fall at least 0.1 % around the break: the top quarter of real breaks (BTC OI is large; the lesson's −19 % is a teaching number)
  absorbZonePct: 0.0015, // "at the low" means within 0.15 % of it
  absorbRatio: 1.5, // aggressive sells at the low ≥ 1.5 × aggressive buys there
  absorbMinQty: 50, // BTC
  retestBars: 12, // after the reclaim, wait up to an hour for the re-test
  retestZonePct: 0.001, // the re-test reaches within 0.1 % of VAL
  stopBufferPct: 0.001, // stop 0.1 % beyond the absorption extreme
  minRewardR: 1, // target one must pay at least 1 R
  imbalanceRatio: 3,
  imbalanceMinQty: 1,
  holdMs: 24 * 3600_000, // trades still open after 24 h are closed at the last price
};

// Looser translation of the same lesson, for more trade opportunities: OI only has to stop
// rising (the lesson's counter-example B is new positions flooding in), lighter absorption,
// longer windows and a smaller first target.
export const LOOSE = {
  oiDropPct: 0,
  absorbRatio: 1.2,
  absorbMinQty: 30,
  confirmBars: 24,
  retestZonePct: 0.002,
  minRewardR: 0.7,
};

const DAY = 86_400_000;

/** Value area of a bin → volume map: grow from the POC toward the heavier side until 70 %. */
function valueArea(volume, tick) {
  const bins = [...volume.keys()].sort((a, b) => a - b);
  if (!bins.length) return null;
  const v = bins.map((b) => volume.get(b));
  const total = v.reduce((a, b) => a + b, 0);
  let poc = 0;
  for (let k = 1; k < v.length; k++) if (v[k] > v[poc]) poc = k;
  let lo = poc;
  let hi = poc;
  let acc = v[poc];
  while (acc < total * 0.7 && (lo > 0 || hi < v.length - 1)) {
    const down = lo > 0 ? v[lo - 1] : -1;
    const up = hi < v.length - 1 ? v[hi + 1] : -1;
    if (up >= down) acc += v[++hi];
    else acc += v[--lo];
  }
  const mid = (b) => b * tick + tick / 2;
  return { poc: mid(bins[poc]), val: mid(bins[lo]), vah: mid(bins[hi]) };
}

/** UTC day → { low, high, poc, val, vah } from 1-minute rows. */
export function dayProfiles(rows, tick) {
  const days = new Map();
  for (const [t, , h, l, , levels] of rows) {
    const d = Math.floor(t / DAY);
    let x = days.get(d);
    if (!x) days.set(d, (x = { low: Infinity, high: -Infinity, volume: new Map() }));
    x.low = Math.min(x.low, l);
    x.high = Math.max(x.high, h);
    for (const [bin, buy, sell] of levels) x.volume.set(bin, (x.volume.get(bin) ?? 0) + buy + sell);
  }
  const out = new Map();
  for (const [d, x] of days) {
    const va = valueArea(x.volume, tick);
    if (va) out.set(d, { low: x.low, high: x.high, ...va });
  }
  return out;
}

/** 1-minute rows → 5-minute bars with merged price levels and the OI at each close. */
function bars5(rows, metrics) {
  const map = new Map();
  for (const [t, o, h, l, c, levels] of rows) {
    const k = Math.floor(t / P.tfMs) * P.tfMs;
    let b = map.get(k);
    if (!b) map.set(k, (b = { t: k, o, h, l, c, buy: 0, sell: 0, levels: new Map() }));
    b.h = Math.max(b.h, h);
    b.l = Math.min(b.l, l);
    b.c = c;
    for (const [bin, buy, sell] of levels) {
      b.buy += buy;
      b.sell += sell;
      const lv = b.levels.get(bin) ?? [0, 0];
      lv[0] += buy;
      lv[1] += sell;
      b.levels.set(bin, lv);
    }
  }
  const out = [...map.values()].sort((a, b) => a.t - b.t);
  let m = 0;
  for (const b of out) {
    b.delta = b.buy - b.sell;
    while (m + 1 < metrics.length && metrics[m + 1][0] <= b.t + P.tfMs) m++;
    b.oi = metrics[m] && metrics[m][0] <= b.t + P.tfMs ? metrics[m][1] : null;
  }
  return out;
}

// Volume traded within [lo, hi] across bars i..j, by side.
function sideVolume(bars, i, j, lo, hi, tick) {
  let buy = 0;
  let sell = 0;
  for (let k = i; k <= j; k++)
    for (const [bin, [b, s]] of bars[k].levels) {
      const p = bin * tick + tick / 2;
      if (p >= lo && p <= hi) {
        buy += b;
        sell += s;
      }
    }
  return { buy, sell };
}

// Longest run of consecutive diagonal imbalances on one side within a bar.
function imbalanceRun(bar, tick, side) {
  const bins = [...bar.levels.keys()].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const bin of bins) {
    const [buy, sell] = bar.levels.get(bin);
    const ok =
      side === "buy"
        ? buy >= P.imbalanceMinQty && buy >= P.imbalanceRatio * (bar.levels.get(bin - 1)?.[1] ?? 0)
        : sell >= P.imbalanceMinQty && sell >= P.imbalanceRatio * (bar.levels.get(bin + 1)?.[0] ?? 0);
    run = ok && prev === bin - 1 ? run + 1 : ok ? 1 : 0;
    prev = bin;
    best = Math.max(best, run);
  }
  return best;
}

// After entry, which comes first on 1-minute rows: the stop or target one; then, with the
// stop moved to entry, does target two come before price returns to entry? Management:
// half off at target one, the rest at target two or back at entry.
function simulate(rows, startT, dir, entry, stop, t1, t2) {
  const up = dir === "long";
  let i = rows.findIndex((r) => r[0] >= startT);
  if (i < 0) return { result: "open" };
  let hitT1 = null;
  for (; i < rows.length && rows[i][0] < startT + P.holdMs; i++) {
    const [t, , h, l, c] = rows[i];
    const stopHit = up ? l <= stop : h >= stop;
    const t1Hit = up ? h >= t1 : l <= t1;
    if (!hitT1) {
      // Same minute: assume the stop came first.
      if (stopHit) return { result: "stop", exitT: t, r: -1 };
      if (t1Hit) hitT1 = t;
      continue;
    }
    const beHit = up ? l <= entry : h >= entry;
    const t2Hit = up ? h >= t2 : l <= t2;
    if (beHit) return { result: "t1", t1T: hitT1, exitT: t };
    if (t2Hit) return { result: "t2", t1T: hitT1, exitT: t };
    void c;
  }
  const last = rows[Math.min(i, rows.length) - 1];
  return hitT1 ? { result: "t1", t1T: hitT1, exitT: last[0] } : { result: "timeout", exitT: last[0], exitPrice: last[4] };
}

/**
 * Finds every setup in the data. Each case records which checks passed, the trade plan and
 * the simulated outcome, so the film can show exactly what the strategy looked at.
 */
export function findFailedAuctions(rows, tick, metrics, { sides = ["long", "short"], params = {} } = {}) {
  const saved = { ...P };
  Object.assign(P, params);
  try {
    return search(rows, tick, metrics, sides);
  } finally {
    Object.assign(P, saved);
  }
}

function search(rows, tick, metrics, sides) {
  const profiles = dayProfiles(rows, tick);
  const bars = bars5(rows, metrics);
  const cases = [];
  for (const dir of sides) {
    const up = dir === "long";
    // One position per side at a time: later breaks of the same level that lead to the same
    // or an overlapping entry are the same trade, not a new one.
    let busyUntil = -Infinity;
    // Only the day's first break counts: once the level has traded through, the stops
    // under it are gone and a later break is a different setup.
    const brokenDays = new Set();
    for (let i = 1; i < bars.length; i++) {
      const b = bars[i];
      const day = Math.floor(b.t / DAY);
      const prior = profiles.get(day - 1);
      if (!prior) continue;
      // 事件: the first break of the prior-day extreme.
      const level = up ? prior.low : prior.high;
      const broke = up ? b.l < level && bars[i - 1].l >= level : b.h > level && bars[i - 1].h <= level;
      if (!broke || brokenDays.has(day)) continue;
      brokenDays.add(day);
      const va = up ? prior.val : prior.vah;
      const c = { dir, sweepT: b.t, day: new Date(day * DAY).toISOString().slice(0, 10), prior, level, va, checks: {} };
      // Walk forward until the reclaim of the value area, or the break is accepted.
      let extreme = up ? b.l : b.h;
      let reclaim = -1;
      let accepted = false;
      for (let j = i; j < Math.min(bars.length, i + P.confirmBars + 1); j++) {
        extreme = up ? Math.min(extreme, bars[j].l) : Math.max(extreme, bars[j].h);
        if (Math.abs(extreme - level) / level > P.maxSweepPct) {
          accepted = true;
          break;
        }
        if (up ? bars[j].c > va && bars[j].c > level : bars[j].c < va && bars[j].c < level) {
          reclaim = j;
          break;
        }
      }
      if (accepted || reclaim < 0) continue;
      c.extreme = extreme;
      c.reclaimT = bars[reclaim].t;
      // 確認 1: OI drops around the break (required).
      const oiBefore = bars[i - 1].oi;
      let oiMin = oiBefore;
      for (let j = i; j <= Math.min(reclaim, i + 3); j++) if (bars[j].oi != null) oiMin = Math.min(oiMin, bars[j].oi);
      c.oi = { before: oiBefore, low: oiMin, change: oiBefore ? (oiMin - oiBefore) / oiBefore : null };
      c.checks.oi = oiBefore != null && (P.oiDropPct > 0 ? oiMin <= oiBefore * (1 - P.oiDropPct) : oiMin < oiBefore);
      // 確認 2: sellers absorbed at the low (buyers at the high for shorts).
      const zone = extreme * P.absorbZonePct;
      const v = sideVolume(bars, i, reclaim, up ? extreme : extreme - zone, up ? extreme + zone : extreme, tick);
      const hit = up ? v.sell : v.buy;
      const against = up ? v.buy : v.sell;
      c.absorb = { aggressor: Math.round(hit), passive: Math.round(against) };
      c.checks.absorb = hit >= P.absorbMinQty && hit >= P.absorbRatio * against;
      // 確認 3 (optional): a later re-test of the extreme with less aggression.
      c.checks.divergence = false;
      for (let j = i + 1; j < reclaim; j++) {
        const near = up ? bars[j].l <= extreme * (1 + P.absorbZonePct) : bars[j].h >= extreme * (1 - P.absorbZonePct);
        if (near && (up ? bars[j].delta > 0.5 * b.delta : bars[j].delta < 0.5 * b.delta) && Math.sign(b.delta) === (up ? -1 : 1)) {
          c.checks.divergence = true;
          c.divergence = { sweepDelta: Math.round(b.delta), retestDelta: Math.round(bars[j].delta), t: bars[j].t };
          break;
        }
      }
      // 確認 4: the reclaim itself.
      c.checks.reclaim = true;
      if (!c.checks.oi || !c.checks.absorb) {
        cases.push({ ...c, outcome: "no-trade" });
        continue;
      }
      // 執行: wait for the re-test of VAL; void if price reaches POC first.
      const stop = up ? extreme * (1 - P.stopBufferPct) : extreme * (1 + P.stopBufferPct);
      const t1 = prior.poc;
      const t2 = up ? prior.vah : prior.val;
      let entryBar = -1;
      for (let j = reclaim + 1; j < Math.min(bars.length, reclaim + 1 + P.retestBars); j++) {
        const x = bars[j];
        if (up ? x.h >= t1 : x.l <= t1) {
          c.void = "到達目標一前沒有回測，不追";
          break;
        }
        if (up ? x.l <= stop : x.h >= stop) {
          c.void = "回測跌破停損區";
          break;
        }
        const retest = up ? x.l <= va * (1 + P.retestZonePct) : x.h >= va * (1 - P.retestZonePct);
        if (!retest) continue;
        const run = imbalanceRun(x, tick, up ? "buy" : "sell");
        const holds = up ? x.c >= level : x.c <= level;
        if (holds && (run >= 2 || (up ? x.delta > 0 : x.delta < 0))) {
          entryBar = j;
          c.entrySignal = run >= 2 ? `${run} 層${up ? "買方" : "賣方"}不平衡` : `Δ ${Math.round(x.delta)}`;
          break;
        }
      }
      if (entryBar < 0) {
        cases.push({ ...c, outcome: c.void ? "void" : "no-retest" });
        continue;
      }
      const entry = bars[entryBar].c;
      const risk = Math.abs(entry - stop);
      const r1 = Math.abs(t1 - entry) / risk;
      const r2 = Math.abs(t2 - entry) / risk;
      c.plan = { entryT: bars[entryBar].t + P.tfMs, entry, stop, t1, t2, risk, r1, r2 };
      if ((up ? t1 <= entry : t1 >= entry) || r1 < P.minRewardR) {
        cases.push({ ...c, outcome: "reward-too-small" });
        continue;
      }
      if (c.plan.entryT <= busyUntil) {
        cases.push({ ...c, outcome: "in-trade" });
        continue;
      }
      const sim = simulate(rows, c.plan.entryT, dir, entry, stop, t1, t2);
      busyUntil = sim.exitT ?? busyUntil;
      c.sim = sim;
      c.outcome = sim.result;
      c.r =
        sim.result === "stop" ? -1 : sim.result === "t2" ? 0.5 * r1 + 0.5 * r2 : sim.result === "t1" ? 0.5 * r1 : (up ? sim.exitPrice - entry : entry - sim.exitPrice) / risk;
      cases.push(c);
    }
  }
  return cases.sort((a, b) => a.sweepT - b.sweepT);
}
