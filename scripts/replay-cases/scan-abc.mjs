// Runs strategies A (01 failed auction), B (02 support hold or flip) and C (03 trend pullback)
// over the archive datasets with fixed lesson thresholds, then looks for one continuous stretch
// where every trade the three strategies took is shown, for the short "bot replay" format
// (motion/replays/2026-02-15-short/BRIEF.md). Internal research: the counts are not for publishing.
//
//   node scripts/replay-cases/scan-abc.mjs
//
// Writes .data/orderflow/replay-cases/abc-trades.json and abc-windows.json.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fromArchive, readingsAt } from "../../public/lab/orderflow/metrics.js";
import { dayProfiles, findFailedAuctions } from "../../public/lab/orderflow/strategy-failed-auction.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const OUT = new URL("../../.data/orderflow/replay-cases/", import.meta.url);
await mkdir(OUT, { recursive: true });
const MIN = 60_000;
const TF = 5 * MIN;
const DAY = 86_400_000;
const HOLD = 24 * 3600_000;

// Thresholds come from the lessons (docs/*-LESSON-PLAN.md) and strategy A's P; they are fixed
// before looking for stretches and never tuned per stretch.
const B = {
  zonePct: 0.0015, // "at the level" (A's absorbZonePct)
  absorbRatio: 1.5,
  absorbMinQty: 50,
  confirmBars: 6, // the hold must show within 30 minutes of the touch
  acceptBars: 2, // a flip needs two closes beyond the level
  retestBars: 12, // and a re-test within an hour
  stopBufferPct: 0.001,
  targetR: 1, // lesson target one: 1.0 R
};
const C = {
  lookback: 48, // the push makes a 4-hour high
  pushBars: 12, // the push starts at the lowest low of the 12 bars before
  minPushPct: 0.006,
  pushVolume: 1.2, // push volume vs the 48 bars before it
  maxPullback: 8,
  pullVolume: 0.6, // pullback volume vs the push
  maxRetrace: 0.618, // of the push, in price
  cvdGiveBack: 0.5, // of the push's delta
  stopBufferPct: 0.0005,
  targetR: 1,
};

const sets = [".data/orderflow/btcusdt-oos.json", ".data/orderflow/btcusdt-90d.json"].map(async (f) => JSON.parse(await readFile(root + f, "utf8")));
const [oos, recent] = await Promise.all(sets);
const tick = recent.tick;
const seen = new Set();
const rows = [...oos.bars, ...recent.bars].filter((r) => !seen.has(r[0]) && seen.add(r[0])).sort((a, b) => a[0] - b[0]);
const readings = fromArchive([...oos.metrics, ...recent.metrics]).sort((a, b) => a[0] - b[0]);
const rowIndex = new Map(rows.map((r, i) => [r[0], i]));

function bars5() {
  const map = new Map();
  for (const [t, o, h, l, c, levels] of rows) {
    const k = Math.floor(t / TF) * TF;
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
  const at = readingsAt(readings);
  for (const b of out) {
    b.delta = b.buy - b.sell;
    b.vol = b.buy + b.sell;
    b.oi = at(b.t + TF)?.[1] ?? null;
  }
  return out;
}
const bars = bars5();

function imbalanceRun(bar, side) {
  const bins = [...bar.levels.keys()].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const bin of bins) {
    const [buy, sell] = bar.levels.get(bin);
    const ok = side === "buy" ? buy >= 1 && buy >= 3 * (bar.levels.get(bin - 1)?.[1] ?? 0) : sell >= 1 && sell >= 3 * (bar.levels.get(bin + 1)?.[0] ?? 0);
    run = ok && prev === bin - 1 ? run + 1 : ok ? 1 : 0;
    prev = bin;
    best = Math.max(best, run);
  }
  return best;
}

function zoneVolume(i, j, lo, hi) {
  let buy = 0, sell = 0;
  for (let k = i; k <= j; k++)
    for (const [bin, [b, s]] of bars[k].levels) {
      const p = bin * tick + tick / 2;
      if (p >= lo && p <= hi) (buy += b), (sell += s);
    }
  return { buy, sell };
}

/** Single target and stop on 1-minute rows from entryT; same minute counts as the stop. */
function simulate(entryT, dir, stop, tp) {
  const up = dir === "long";
  let i = rowIndex.get(entryT);
  if (i == null) return { result: "open" };
  for (; i < rows.length && rows[i][0] < entryT + HOLD; i++) {
    const [t, , h, l] = rows[i];
    if (up ? l <= stop : h >= stop) return { result: "stop", exitT: t + MIN };
    if (up ? h >= tp : l <= tp) return { result: "tp", exitT: t + MIN };
  }
  return { result: "timeout", exitT: rows[Math.min(i, rows.length - 1)][0] };
}

const trades = [];

// A: the existing module. The film shows one target, A's target one (prior-day POC); its
// simulation stops or reaches target one first, the same as ours.
for (const c of findFailedAuctions(rows, tick, readings)) {
  if (!c.plan || !c.sim) continue;
  const res = c.sim.result === "stop" ? "stop" : c.sim.result === "timeout" ? "timeout" : "tp";
  trades.push({
    strat: "A", dir: c.dir, level: c.dir === "long" ? "前日低" : "前日高", levelPrice: c.level,
    signalT: c.plan.entryT - TF, entryT: c.plan.entryT, entry: c.plan.entry, stop: c.plan.stop, tp: c.plan.t1,
    result: res, exitT: res === "tp" ? c.sim.t1T + MIN : c.sim.exitT + (res === "stop" ? MIN : 0),
  });
}

// B: the first arrival of the day at a prior-day level, then either the hold (absorption and a
// close back outside the zone) or the flip (two closes through it, then a failed re-test).
const profiles = dayProfiles(rows, tick);
const LEVELS = [["low", "前日低"], ["val", "前日 VAL"], ["poc", "前日 POC"], ["vah", "前日 VAH"], ["high", "前日高"]];
for (const [key, name] of LEVELS) {
  const touched = new Set();
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const day = Math.floor(b.t / DAY);
    const prior = profiles.get(day - 1);
    if (!prior) continue;
    const L = prior[key];
    const z = L * B.zonePct;
    const prev = bars[i - 1];
    const fromAbove = prev.l > L + z && b.l <= L + z;
    const fromBelow = prev.h < L - z && b.h >= L - z;
    if (!(fromAbove || fromBelow) || touched.has(`${day}|${fromAbove}`)) continue;
    touched.add(`${day}|${fromAbove}`);
    const up = fromAbove; // support when arriving from above
    // Hold: no close beyond the zone, absorption inside it, then a close back away with buyers.
    let done = false;
    let extreme = up ? b.l : b.h;
    for (let j = i; j < Math.min(bars.length, i + B.confirmBars) && !done; j++) {
      const x = bars[j];
      extreme = up ? Math.min(extreme, x.l) : Math.max(extreme, x.h);
      if (up ? x.c < L - z : x.c > L + z) break; // closed through: maybe a flip, below
      const away = up ? x.c > L + z : x.c < L - z;
      if (!away || j === i) continue;
      const v = zoneVolume(i, j, L - z, L + z);
      const hit = up ? v.sell : v.buy;
      const ok = hit >= B.absorbMinQty && hit >= B.absorbRatio * (up ? v.buy : v.sell) && (imbalanceRun(x, up ? "buy" : "sell") >= 2 || (up ? x.delta > 0 : x.delta < 0));
      if (!ok) break;
      const entry = x.c;
      const stop = up ? extreme * (1 - B.stopBufferPct) : extreme * (1 + B.stopBufferPct);
      const tp = entry + (up ? 1 : -1) * B.targetR * Math.abs(entry - stop);
      trades.push({ strat: "B", kind: "hold", dir: up ? "long" : "short", level: name, levelPrice: L, signalT: x.t, entryT: x.t + TF, entry, stop, tp, absorb: Math.round(hit) });
      done = true;
    }
    if (done) continue;
    // Flip: closes through the level, stays there, re-tests it and fails.
    let k = -1;
    for (let j = i; j < Math.min(bars.length, i + B.confirmBars); j++) if (up ? bars[j].c < L - z : bars[j].c > L + z) { k = j; break; }
    if (k < 0) continue;
    let accepted = true;
    for (let j = k + 1; j <= k + B.acceptBars - 1; j++) if (!bars[j] || (up ? bars[j].c >= L : bars[j].c <= L)) accepted = false;
    if (!accepted) continue;
    for (let j = k + B.acceptBars; j < Math.min(bars.length, k + B.acceptBars + B.retestBars); j++) {
      const x = bars[j];
      if (up ? x.c > L + z : x.c < L - z) break; // reclaimed: no flip
      const retest = up ? x.h >= L - z : x.l <= L + z;
      if (!retest) continue;
      const fails = up ? x.c < L && (imbalanceRun(x, "sell") >= 2 || x.delta < 0) : x.c > L && (imbalanceRun(x, "buy") >= 2 || x.delta > 0);
      if (!fails) continue;
      const entry = x.c;
      const stop = up ? x.h * (1 + B.stopBufferPct) : x.l * (1 - B.stopBufferPct);
      const tp = entry + (up ? -1 : 1) * B.targetR * Math.abs(entry - stop);
      trades.push({ strat: "B", kind: "flip", dir: up ? "short" : "long", level: name, levelPrice: L, signalT: x.t, entryT: x.t + TF, entry, stop, tp });
      break;
    }
  }
}

// C: a push to a 4-hour extreme on rising volume, a quiet pullback with lower highs (higher lows
// for shorts) that gives back under half the push's delta while OI does not rise, then the first
// bar that closes through the pullback's last swing with delta on its side.
const avgVol = (i, j) => {
  let s = 0;
  for (let k = i; k <= j; k++) s += bars[k].vol;
  return s / (j - i + 1);
};
for (let k = C.lookback + C.pushBars; k < bars.length - 2; k++) {
  for (const up of [true, false]) {
    const top = bars[k];
    let ext = true;
    for (let j = k - C.lookback; j < k; j++) if (up ? bars[j].h >= top.h : bars[j].l <= top.l) { ext = false; break; }
    if (!ext) continue;
    let s = k - C.pushBars;
    for (let j = k - C.pushBars; j < k; j++) if (up ? bars[j].l < bars[s].l : bars[j].h > bars[s].h) s = j;
    const start = up ? bars[s].l : bars[s].h;
    const end = up ? top.h : top.l;
    const move = Math.abs(end - start);
    if (move / start < C.minPushPct) continue;
    const pushVol = avgVol(s, k);
    if (s - C.lookback < 0 || pushVol < C.pushVolume * avgVol(s - C.lookback, s - 1)) continue;
    let pushDelta = 0;
    for (let j = s; j <= k; j++) pushDelta += bars[j].delta;
    if (up ? pushDelta <= 0 : pushDelta >= 0) continue;
    // Walk the pullback.
    let swing = up ? top.h : top.l; // last lower high / higher low
    let lowest = up ? Infinity : -Infinity;
    let cvd = 0;
    for (let m = k + 1; m < Math.min(bars.length - 1, k + 1 + C.maxPullback + 1); m++) {
      const x = bars[m];
      if (up ? x.h > top.h : x.l < top.l) break; // new extreme: the push continues, not a pullback
      const pulled = m - k - 1; // bars of pullback before x
      if (pulled >= 2) {
        const breaks = up ? x.c > swing && x.delta > 0 : x.c < swing && x.delta < 0;
        if (breaks) {
          const quiet = avgVol(k + 1, m - 1) <= C.pullVolume * pushVol;
          const shallow = Math.abs(end - lowest) <= C.maxRetrace * move;
          const kept = up ? cvd >= -C.cvdGiveBack * pushDelta : cvd <= -C.cvdGiveBack * pushDelta;
          const oiOk = bars[m - 1].oi != null && top.oi != null && bars[m - 1].oi <= top.oi;
          if (quiet && shallow && kept && oiOk) {
            const entry = x.c;
            const stop = up ? lowest * (1 - C.stopBufferPct) : lowest * (1 + C.stopBufferPct);
            const tp = entry + (up ? 1 : -1) * C.targetR * Math.abs(entry - stop);
            trades.push({ strat: "C", dir: up ? "long" : "short", signalT: x.t, entryT: x.t + TF, entry, stop, tp, push: { from: bars[s].t, to: top.t, start, end }, swing });
          }
          break;
        }
      }
      if (pulled >= 1 && (up ? x.h > swing : x.l < swing)) break; // highs must keep falling
      swing = up ? Math.min(swing, x.h) : Math.max(swing, x.l);
      lowest = up ? Math.min(lowest, x.l) : Math.max(lowest, x.h);
      cvd += x.delta;
      if (Math.abs(end - lowest) > C.maxRetrace * move) break;
    }
  }
}

// Simulate B and C, then one position per strategy: a signal while the same strategy is in a
// trade is not taken.
for (const t of trades) if (!t.result) Object.assign(t, simulate(t.entryT, t.dir, t.stop, t.tp));
trades.sort((a, b) => a.entryT - b.entryT);
const busy = {};
const taken = trades.filter((t) => {
  if (t.result === "open" || t.entryT < (busy[t.strat] ?? 0)) return false;
  busy[t.strat] = t.exitT;
  return true;
});
for (const t of taken) t.r = t.result === "stop" ? -1 : t.result === "tp" ? Math.abs(t.tp - t.entry) / Math.abs(t.entry - t.stop) : null;
await writeFile(new URL("abc-trades.json", OUT), JSON.stringify(taken));

const tpe = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
for (const s of ["A", "B", "C"]) {
  const x = taken.filter((t) => t.strat === s);
  console.log(`${s}: ${x.length} trades, tp ${x.filter((t) => t.result === "tp").length}, stop ${x.filter((t) => t.result === "stop").length}, timeout ${x.filter((t) => t.result === "timeout").length}`);
}

// Stretches: consecutive trades (every strategy's, none left out) with 3–5 trades, exactly one
// stop, no timeout, no two positions open at once, all inside 24 hours of chart.
const windows = [];
for (let i = 0; i < taken.length; i++) {
  for (let n = 3; n <= 5 && i + n <= taken.length; n++) {
    const w = taken.slice(i, i + n);
    const from = w[0].entryT - 30 * TF;
    const to = Math.max(...w.map((t) => t.exitT)) + 6 * TF;
    if (to - from > DAY) break;
    if (w.some((t) => t.result === "timeout")) break;
    if (w.some((t, k) => k > 0 && t.entryT < w[k - 1].exitT)) continue;
    // The trade before and after must sit outside the chart, so nothing is hidden.
    if (taken[i - 1] && taken[i - 1].exitT > from) continue;
    if (taken[i + n] && taken[i + n].entryT < to) continue;
    const stops = w.filter((t) => t.result === "stop").length;
    if (stops !== 1) continue;
    windows.push({ from, to, hours: (to - from) / 3600_000, n, strats: [...new Set(w.map((t) => t.strat))].join(""), r: w.reduce((a, t) => a + t.r, 0), trades: w });
  }
}
windows.sort((a, b) => b.strats.length - a.strats.length || b.n - a.n || a.hours - b.hours);
await writeFile(new URL("abc-windows.json", OUT), JSON.stringify(windows, null, 1));
console.log(`\n${windows.length} stretches`);
for (const w of windows.slice(0, 15))
  console.log(`${tpe(w.from)} → ${tpe(w.to)}  ${w.hours.toFixed(1)} h  ${w.n} trades  ${w.strats}  ${w.r.toFixed(2)} R  | ${w.trades.map((t) => `${t.strat}${t.dir === "long" ? "多" : "空"}${t.result === "stop" ? "✗" : "✓"}`).join(" ")}`);
