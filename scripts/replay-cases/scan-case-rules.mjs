// The ten replay cases' reasons (docs/REPLAY-CASES-2026Q3.md) written as three rules, run over the
// archive with only data up to each entry bar. For each case: does its rule reproduce it, and
// which stretch around it can be filmed with every trade the rule took inside (one position at a
// time), leaving out stretches with more losses than wins. Internal research only (VISION 1).
//
//   flip    #1 #8 #9 #10  a prior UTC day's high (low) breaks; a later re-test holds
//   reject  #2 #3 #4 #5   price comes to a prior-day H/L/POC/VAH/VAL or 7-day H/L from one side
//                          (a pierce counts: failed breakout / failed auction) and is pushed back
//   liq     #6 #7         a ≥ 2 % hour runs through one of the liq model's 20 largest clusters
//
// Every rule triggers the same way: within 30 minutes of the touch, a 1-minute bar with ≥ 3 stacked
// imbalances in the trade's direction closing back on the right side → enter at that close; stop
// 0.1 % beyond the extreme since the touch; target the case's R (or --r). After a trigger or a
// 30-minute watch without one, price must move 0.3 % away before the level counts again.
//
//   node scripts/replay-cases/scan-case-rules.mjs [--case 9] [--r 2] [--list] [--json]
//
// --json writes every trade with its outcome at --r (default 2) to
// .data/orderflow/replay-cases/case-rule-trades.json, the input of motion/replays/segments.
import { readFile } from "node:fs/promises";
import { fromArchive } from "../../public/lab/orderflow/metrics.js";
import { buildLiqMap } from "../../public/lab/orderflow/liqmap.js";
import { CASES } from "../../motion/replays/case-shorts/scripts/cases.mjs";

const MIN = 60_000, TF = 5 * MIN, H = 60 * MIN, DAY = 24 * H, TPE = 8 * H;
const RULE = {
  zonePct: 0.0015, // "at the level"
  awayPct: 0.003,
  watchMin: 30,
  stack: 3,
  stopBufferPct: 0.001,
  maxRiskPct: 0.01,
  holdMin: 240,
  // flip
  flipLookbackDays: 10,
  breakPct: 0.001, // a 5-minute close this far through breaks the level
  failPct: 0.003, // a 5-minute close this far back through ends the flip
  minRetestH: 1,
  expireH: 168,
  // reject
  approachMin: 60, // every 1-minute close of the hour before the touch on the approach side
  rejectFailPct: 0.004, // a 5-minute close this far through ends the watch: accepted, not rejected
  valueShare: 0.7,
  // liq
  liqMovePct: 0.02,
  liqClusters: 20,
  liqCooldownMin: 60,
};
const RULE_OF = { 1: "flip", 8: "flip", 9: "flip", 10: "flip", 2: "reject", 3: "reject", 4: "reject", 5: "reject", 6: "liq", 7: "liq" };
const argv = process.argv.slice(2);
const arg = (k) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);

const root = new URL("../../", import.meta.url);
const sets = await Promise.all([".data/orderflow/btcusdt-oos.json", ".data/orderflow/btcusdt-90d.json"].map(async (f) => JSON.parse(await readFile(new URL(f, root), "utf8"))));
const tick = sets[1].tick;
const WARM = Date.parse("2026-06-20T00:00:00Z"); // the liq model accumulates from here (REPLAY-CASES)
const seen = new Set();
const rows = sets.flatMap((s) => s.bars).filter((r) => r[0] >= WARM && !seen.has(r[0]) && seen.add(r[0])).sort((a, b) => a[0] - b[0]);
const readings = fromArchive(sets.flatMap((s) => s.metrics)).filter((r) => r[0] >= WARM).sort((a, b) => a[0] - b[0]);
const bars = rows.map(([t, o, h, l, c, lv]) => ({ t, o, h, l, c, lv }));
const tpe = (ms) => new Date(ms + TPE).toISOString().slice(5, 16).replace("T", " ");
const at = (s) => Date.parse(s.replace(" ", "T") + ":00+08:00");

// Same definition as motion/replays/case-shorts/scripts/extract.mjs.
function stacked(b, long) {
  const m = new Map(b.lv.map(([bin, bu, se]) => [bin, [bu, se]]));
  let run = 0, best = 0;
  for (const bin of [...m.keys()].sort((x, y) => x - y)) {
    const [bu, se] = m.get(bin);
    const ok = long ? bu >= 1 && bu >= 3 * (m.get(bin - 1)?.[1] ?? 0) : se >= 1 && se >= 3 * (m.get(bin + 1)?.[0] ?? 0);
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

// UTC days: high, low and the footprint's value area.
const days = new Map();
for (const b of bars) {
  const d = Math.floor(b.t / DAY);
  let x = days.get(d);
  if (!x) days.set(d, (x = { h: -Infinity, l: Infinity, vol: new Map() }));
  x.h = Math.max(x.h, b.h);
  x.l = Math.min(x.l, b.l);
  for (const [bin, bu, se] of b.lv) x.vol.set(bin, (x.vol.get(bin) ?? 0) + bu + se);
}
for (const x of days.values()) {
  const bins = [...x.vol.keys()].sort((a, b) => a - b), v = bins.map((b) => x.vol.get(b));
  const tot = v.reduce((a, b) => a + b, 0);
  let p = v.indexOf(Math.max(...v)), lo = p, hi = p, acc = v[p];
  while (acc < tot * RULE.valueShare && (lo > 0 || hi < v.length - 1)) {
    const dn = lo > 0 ? v[lo - 1] : -1, up = hi < v.length - 1 ? v[hi + 1] : -1;
    if (up >= dn) acc += v[++hi];
    else acc += v[--lo];
  }
  const mid = (b) => b * tick + tick / 2;
  Object.assign(x, { poc: mid(bins[p]), val: mid(bins[lo]), vah: mid(bins[hi]) });
}

// The liq model's largest clusters on each side at each 5-minute step.
const clusters = new Map();
const largest = (arr, lo) => {
  const top = [];
  for (let i = 0; i < arr.length; i++) if (arr[i] > 0) top.push([arr[i], i]);
  top.sort((a, b) => b[0] - a[0]);
  return top.slice(0, RULE.liqClusters).map(([q, i]) => lo + i * 25 + 12.5);
};
buildLiqMap(rows, tick, readings.map((r) => [r[0], r[1]]), {
  keepSteps: false,
  onStep: (t, _w, { lo, long, short }) => clusters.set(t, { long: largest(long, lo), short: largest(short, lo) }),
});

const trades = [];
function enter(rule, L, b, i, name, run) {
  if (trades.some((x) => x.entryT === b.t && x.long === L.long)) return; // two levels, one trade
  const stop = L.long ? L.ext * (1 - RULE.stopBufferPct) : L.ext * (1 + RULE.stopBufferPct);
  const risk = Math.abs(b.c - stop);
  if (risk / b.c > RULE.maxRiskPct) return;
  trades.push({ rule, long: L.long, name, level: L.price, touchT: L.touchT, extT: L.extT, entryT: b.t, entry: b.c, stop, risk, run, i });
}
// A watch: track the extreme, give up after watchMin, trigger on a stacked close back across.
function watch(rule, L, b, i, name) {
  if (L.long ? b.l <= L.ext : b.h >= L.ext) Object.assign(L, { ext: L.long ? b.l : b.h, extT: b.t });
  if (b.t - L.touchT > RULE.watchMin * MIN) return "timeout";
  const run = stacked(b, L.long);
  if (run >= RULE.stack && (L.long ? b.c > L.price : b.c < L.price)) {
    enter(rule, L, b, i, name, run);
    return "fired";
  }
  return null;
}

let flips = [], rejects = [], liqs = { long: { cool: 0 }, short: { cool: 0 } };
let day = null;
for (let i = 0; i < bars.length; i++) {
  const b = bars[i];
  const d = Math.floor(b.t / DAY);
  if (d !== day) {
    day = d;
    const y = days.get(d - 1);
    if (y) {
      flips.push({ price: y.h, long: true, day: d - 1, state: "intact" }, { price: y.l, long: false, day: d - 1, state: "intact" });
      let wh = -Infinity, wl = Infinity;
      for (let j = 1; j <= 7; j++) { const z = days.get(d - j); if (z) { wh = Math.max(wh, z.h); wl = Math.min(wl, z.l); } }
      // Each level both ways: support when price comes down to it, resistance when it comes up.
      rejects = [["前日高", y.h], ["前日低", y.l], ["前日POC", y.poc], ["前日VAH", y.vah], ["前日VAL", y.val], ["週高", wh], ["週低", wl]].flatMap(([name, price]) =>
        [true, false].map((long) => ({ name, price, long, state: "armed" })),
      );
    }
    flips = flips.filter((L) => L.state !== "done" && d - L.day <= RULE.flipLookbackDays);
  }
  const close5 = (b.t + MIN) % TF === 0;

  for (const L of flips) {
    if (L.state === "done") continue;
    const s = L.long ? 1 : -1, p = L.price;
    if (L.state === "intact") {
      if (close5 && s * (b.c - p) >= RULE.breakPct * p) Object.assign(L, { state: "broken", brokeT: b.t });
      continue;
    }
    if (b.t - L.brokeT > RULE.expireH * H || (close5 && s * (p - b.c) >= RULE.failPct * p)) { L.state = "done"; continue; }
    if (L.state === "broken") {
      if (s * ((L.long ? b.h : b.l) - p) >= RULE.awayPct * p) L.state = "away";
      continue;
    }
    if (L.state === "away") {
      if (b.t - L.brokeT < RULE.minRetestH * H || s * ((L.long ? b.l : b.h) - p) > RULE.zonePct * p) continue;
      Object.assign(L, { state: "watch", touchT: b.t, ext: L.long ? b.l : b.h });
    }
    if (watch("flip", L, b, i, `${new Date(L.day * DAY).toISOString().slice(5, 10)} ${L.long ? "高" : "低"}`)) L.state = "broken";
  }

  for (const L of rejects) {
    const s = L.long ? 1 : -1, p = L.price;
    if (L.state === "cool") {
      if (s * ((L.long ? b.h : b.l) - p) >= RULE.awayPct * p) L.state = "armed";
      continue;
    }
    if (L.state === "armed") {
      if (s * ((L.long ? b.l : b.h) - p) > RULE.zonePct * p || i < RULE.approachMin) continue;
      let from = true;
      for (let j = i - RULE.approachMin; j < i && from; j++) if (s * (bars[j].c - p) <= 0) from = false;
      if (!from) continue;
      Object.assign(L, { state: "watch", touchT: b.t, ext: L.long ? b.l : b.h });
    }
    if (close5 && s * (p - b.c) >= RULE.rejectFailPct * p) { L.state = "cool"; continue; }
    if (watch("reject", L, b, i, L.name)) L.state = "cool";
  }

  for (const long of [true, false]) {
    const L = liqs[long ? "long" : "short"];
    if (L.state === "watch") {
      if (watch("liq", L, b, i, "爆倉叢集")) Object.assign(L, { state: null, cool: b.t + RULE.liqCooldownMin * MIN });
      continue;
    }
    if (b.t < L.cool || i < 60) continue;
    let far = long ? -Infinity : Infinity;
    for (let j = i - 60; j < i; j++) far = long ? Math.max(far, bars[j].h) : Math.min(far, bars[j].l);
    const edge = long ? b.l : b.h;
    if (Math.abs(edge - far) / far < RULE.liqMovePct) continue;
    const snap = clusters.get(Math.floor((b.t - 60 * MIN) / TF) * TF)?.[long ? "long" : "short"] ?? [];
    const hit = snap.filter((c) => (long ? c <= far && c >= edge : c >= far && c <= edge));
    if (!hit.length) continue;
    // The trigger closes back across the run's extreme bar body; the watch's "level" is that body edge.
    Object.assign(L, { state: "watch", long, touchT: b.t, ext: edge, extT: b.t, price: long ? Math.max(b.o, b.c) : Math.min(b.o, b.c) });
  }
  // Keep the liq level at the extreme bar's body as the extreme moves.
  for (const long of [true, false]) {
    const L = liqs[long ? "long" : "short"];
    if (L.state === "watch" && (long ? b.l <= L.ext : b.h >= L.ext)) L.price = long ? Math.max(b.o, b.c) : Math.min(b.o, b.c);
  }
}
trades.sort((a, b) => a.entryT - b.entryT);

function outcome(tr, R) {
  const s = tr.long ? 1 : -1, tp = tr.entry + s * R * tr.risk;
  for (let j = tr.i + 1; j < bars.length && bars[j].t <= tr.entryT + RULE.holdMin * MIN; j++) {
    const b = bars[j];
    if (s * (tr.stop - (tr.long ? b.l : b.h)) >= 0) return { r: -1, t: b.t };
    if (s * ((tr.long ? b.h : b.l) - tp) >= 0) return { r: R, t: b.t };
  }
  const last = bars.findLast((b) => b.t <= tr.entryT + RULE.holdMin * MIN);
  return { r: +((s * (last.c - tr.entry)) / tr.risk).toFixed(2), t: last.t, timeout: true };
}
function single(list, R) {
  const out = [];
  let busy = -Infinity;
  for (const t of list) {
    if (t.entryT <= busy) continue;
    const o = outcome(t, R);
    busy = o.t;
    out.push({ ...t, o });
  }
  return out;
}
const tally = (xs) => ({ w: xs.filter((x) => x.o.r > 0).length, l: xs.filter((x) => x.o.r < 0).length, sum: +xs.reduce((s, x) => s + x.o.r, 0).toFixed(2) });
const line = (x) => `${tpe(x.entryT)} ${x.long ? "多" : "空"} ${x.name} ${Math.round(x.level)} 進 ${x.entry} 損 ${x.stop.toFixed(1)} (${((x.risk / x.entry) * 100).toFixed(2)}%) → ${x.o.r > 0 ? "+" : ""}${x.o.r}R${x.o.timeout ? " 逾時" : ""} ${Math.round((x.o.t - x.entryT) / MIN)}m`;

const pick = arg("case") ? [Number(arg("case"))] : Object.keys(RULE_OF).map(Number);
for (const no of pick) {
  const [id, C] = Object.entries(CASES).find(([, c]) => c.no === no);
  const rule = RULE_OF[no], R = Number(arg("r") ?? C.r), long = C.dir === "long";
  const caseT = at(C.entry);
  const seq = single(trades.filter((t) => t.rule === rule), R);
  // The case is reproduced when the rule enters the same way within 3 minutes of the film's entry.
  const k = seq.findIndex((t) => t.long === long && Math.abs(t.entryT - caseT) <= 3 * MIN);
  console.log(`\n#${no} ${C.title}（${rule}，${R}R）`);
  if (k < 0) {
    const near = trades.filter((t) => t.rule === rule && Math.abs(t.entryT - caseT) < 6 * H);
    console.log(`  沒有重現。案例前後 6 小時規則的單：${near.length ? "" : "無"}`);
    for (const t of near) console.log(`    ${line({ ...t, o: outcome(t, R) })}`);
    continue;
  }
  const c = seq[k];
  console.log(`  重現：${line(c)}${c.entryT !== caseT ? `（片中 ${tpe(caseT)}）` : ""}`);
  const dayK = Math.floor((c.entryT + TPE) / DAY);
  const inDay = seq.filter((t) => Math.floor((t.entryT + TPE) / DAY) === dayK);
  const td = tally(inDay);
  console.log(`  當天（台北）：${td.w} 勝 ${td.l} 負，${td.sum}R ${td.l > td.w ? "✗ 輸多於贏" : "✓"}`);
  // Stretches of consecutive trades within 36 hours that contain the case and do not lose more
  // than they win; prefer ones with a loss in them, then more trades (at most 6, a 30-second
  // short), then the shorter span.
  let best = null;
  for (let a = k; a >= 0 && c.entryT - seq[a].entryT <= 36 * H; a--)
    for (let z = k; z < seq.length && seq[z].entryT - seq[a].entryT <= 36 * H; z++) {
      const xs = seq.slice(a, z + 1), t = tally(xs);
      if (t.l > t.w || xs.length > 6) continue;
      const score = (t.l > 0 ? 100 : 0) + xs.length - (xs.at(-1).o.t - xs[0].entryT) / (100 * DAY);
      if (!best || score > best.score) best = { score, xs, t };
    }
  const { xs, t } = best;
  console.log(`  建議時間段 ${tpe(xs[0].entryT)} → ${tpe(xs.at(-1).o.t)}：${xs.length} 筆，${t.w} 勝 ${t.l} 負，${t.sum}R`);
  for (const x of xs) console.log(`    ${x === c || x.entryT === c.entryT ? "★" : " "} ${line(x)}`);
  const a = seq.indexOf(seq.find((x) => x.entryT === xs[0].entryT)), z = a + xs.length;
  console.log(`  段外：前一筆 ${a > 0 ? line(seq[a - 1]) : "無"}；後一筆 ${seq[z] ? line(seq[z]) : "無"}`);
}
if (argv.includes("--json")) {
  const R = Number(arg("r") ?? 2);
  const out = trades.map(({ i, risk, ...t }) => {
    const o = outcome({ ...t, i, risk }, R);
    return { ...t, tp: +(t.entry + (t.long ? 1 : -1) * R * risk).toFixed(1), stop: +t.stop.toFixed(1), r: R, result: o.timeout ? "timeout" : o.r > 0 ? "tp" : "stop", exitT: o.t, exitR: o.r };
  });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(new URL(".data/orderflow/replay-cases/case-rule-trades.json", root), JSON.stringify(out));
  console.log(`case-rule-trades.json: ${out.length} trades at ${R}R`);
}
if ("list" in Object.fromEntries(argv.map((a) => [a.replace(/^--/, ""), 1]))) {
  for (const rule of ["flip", "reject", "liq"]) {
    const t = tally(single(trades.filter((x) => x.rule === rule && x.entryT >= Date.parse("2026-07-20")), 2));
    console.log(`${rule} 7/20 起一次一筆 2R：${t.w} 勝 ${t.l} 負，${t.sum}R`);
  }
}
