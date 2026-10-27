// Cuts assets/data/<id>.json for one case from the 1-minute footprint archive
// (.data/orderflow/case-<UTC day>.json, from scripts/orderflow-data.mjs): 5-minute bars for the
// approach, 1-minute footprint bars around the reversal, the trade, and the measured facts the
// alerts quote. Run from this folder: node scripts/extract.mjs 2026-09-14
import { readFile, writeFile } from "node:fs/promises";
import { CASES } from "./cases.mjs";

const id = process.argv[2];
const C = CASES[id];
if (!C) throw new Error(`unknown case ${id}; one of ${Object.keys(CASES).join(", ")}`);
const MIN = 60_000;
const TF = 5 * MIN;
const at = (s) => Date.parse(s.replace(" ", "T") + ":00+08:00");
const long = C.dir === "long";

let tick = 10;
let source = "";
const minute = new Map();
let metrics = [];
for (const day of C.days) {
  const raw = JSON.parse(await readFile(`../../../.data/orderflow/case-${day}.json`, "utf8"));
  tick = raw.tick;
  source = raw.source;
  metrics = metrics.concat(raw.metrics);
  for (const [t, o, h, l, c, lv] of raw.bars) {
    let buy = 0;
    let sell = 0;
    for (const [, b, s] of lv) {
      buy += b;
      sell += s;
    }
    minute.set(t, { t, o, h, l, c, lv, buy, sell, d: buy - sell });
  }
}
const bar = (t) => {
  const b = minute.get(t);
  if (!b) throw new Error(`no 1-minute bar at ${new Date(t).toISOString()}: fetch that day with scripts/orderflow-data.mjs`);
  return b;
};
const range = (a, b) => {
  const out = [];
  for (let t = a; t <= b; t += MIN) out.push(bar(t));
  return out;
};
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

// The trade: entry A closes the entry bar, the stop sits 0.1 % beyond the extreme, the target is r × risk.
const extT = at(C.ext);
const entryT = at(C.entry);
const ext = long ? bar(extT).l : bar(extT).h;
const entry = bar(entryT).c;
const stop = +(long ? ext * 0.999 : ext * 1.001).toFixed(1);
const risk = Math.abs(entry - stop);
const tp = +(long ? entry + C.r * risk : entry - C.r * risk).toFixed(1);
let exitT = null;
for (let t = entryT + MIN; t < entryT + 240 * MIN; t += MIN) {
  const b = bar(t);
  if (long ? b.l <= stop : b.h >= stop) throw new Error("stop hit before target");
  if (long ? b.h >= tp : b.l <= tp) {
    exitT = t;
    break;
  }
}
if (!exitT) throw new Error("target not reached within 4 hours");

// Measured facts (same definitions as scripts/replay-cases/analyze.mjs).
const level = C.levels[0].price;
const zoneW = ext * 0.0015;
let touch = null;
for (let t = extT - 30 * MIN; t <= extT; t += MIN) {
  const b = bar(t);
  if (long ? b.l <= level + zoneW : b.h >= level - zoneW) {
    touch = t;
    break;
  }
}
const zone = { buy: 0, sell: 0 };
for (const b of range(extT - 15 * MIN, extT + 2 * MIN))
  for (const [bin, bu, se] of b.lv) {
    const p = bin * tick + tick / 2;
    if (long ? p <= ext + zoneW : p >= ext - zoneW) {
      zone.buy += bu;
      zone.sell += se;
    }
  }
// Stacked imbalances in the trade direction: ≥ 3 consecutive bins, each 3:1 against its diagonal.
function stackedIn(b) {
  const m = new Map(b.lv.map(([bin, bu, se]) => [bin, [bu, se]]));
  const bins = [...m.keys()].sort((x, y) => x - y);
  let run = 0;
  let best = null;
  for (const bin of bins) {
    const [bu, se] = m.get(bin);
    const ok = long ? bu >= 1 && bu >= 3 * (m.get(bin - 1)?.[1] ?? 0) : se >= 1 && se >= 3 * (m.get(bin + 1)?.[0] ?? 0);
    run = ok ? run + 1 : 0;
    if (run >= 3 && (!best || run > best.run)) best = { run, lo: bin - run + 1, hi: bin };
  }
  return best;
}
let stacked = null;
for (let t = extT; t <= extT + 30 * MIN; t += MIN) {
  const s = stackedIn(bar(t));
  if (s) {
    stacked = { t, ...s };
    break;
  }
}
const first = bar(extT - 60 * MIN).o;
const facts = {
  ext: extT,
  touch,
  delta15: Math.round(sum(range(extT - 15 * MIN, extT), (x) => x.d)),
  zone: { buy: Math.round(zone.buy), sell: Math.round(zone.sell) },
  stacked,
  approach: (Math.abs(ext - first) / first) * 100,
  extClose: bar(extT).c,
  minutes: Math.round((exitT - entryT) / MIN),
  r: C.r,
};

// Bars: 5-minute from the history mark until the zoom, 1-minute from ten minutes before the
// extreme until a few minutes after the target. The zoom happens on a 5-minute boundary.
const zoomT = Math.floor((extT - 10 * MIN) / TF) * TF;
const five = [];
for (let t = at(C.history); t < zoomT; t += TF) {
  const m = range(t, t + 4 * MIN);
  five.push([t, m[0].o, Math.max(...m.map((x) => x.h)), Math.min(...m.map((x) => x.l)), m[4].c, Math.round(sum(m, (x) => x.d))]);
}
const ones = range(zoomT - 20 * MIN, exitT + 4 * MIN).map((b) => [
  b.t,
  b.o,
  b.h,
  b.l,
  b.c,
  Math.round(b.d),
  b.lv.map(([bin, bu, se]) => [bin, +bu.toFixed(1), +se.toFixed(1)]),
]);
const oiAt = (t) => {
  let v = null;
  for (const m of metrics) if (m[0] <= t) v = m[1];
  return v;
};
const idx1 = (t) => ones.findIndex((b) => b[0] === t);
// An alert from before the zoom shows on the first slow bar, still stamped with its own time.
const alerts = C.alerts(facts).map((a) => ({ ...a, bar: idx1(a.at) < 0 ? -1 : Math.max(idx1(a.at), idx1(zoomT)) }));
for (const a of alerts) if (a.bar < 0) throw new Error(`alert outside the 1-minute window: ${a.text}`);

const out = {
  id,
  no: C.no,
  title: C.title,
  tag: C.tag,
  dir: C.dir,
  source,
  tick,
  levels: C.levels,
  marks: C.marks.map((m) => ({ ...m, bar: five.findIndex((b) => b[0] === at(m.at)) })),
  five,
  fiveFrom: five.findIndex((b) => b[0] >= at(C.from)),
  ones,
  oneFrom: idx1(zoomT),
  trade: { entry, stop, tp, r: C.r, signal: idx1(entryT), exit: idx1(exitT), ext: idx1(extT) },
  stacked: stacked && { bar: idx1(stacked.t), lo: stacked.lo * tick, hi: (stacked.hi + 1) * tick },
  alerts,
  captions: C.captions(facts),
  oi: { pre: oiAt(extT - 60 * MIN), ext: oiAt(extT), post: oiAt(extT + 30 * MIN) },
};
await writeFile(`assets/data/${id}.json`, JSON.stringify(out));
const tpe = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(5, 16).replace("T", " ");
console.log(`${id}: ${five.length} five-minute bars (fast from ${out.fiveFrom}), ${ones.length} one-minute bars (zoom at ${out.oneFrom})`);
console.log(`  ${C.dir} @${entry} stop ${stop} (${((risk / entry) * 100).toFixed(2)}%) target ${tp} → ${tpe(exitT)}, ${facts.minutes} min`);
console.log(`  facts`, JSON.stringify({ ...facts, touch: facts.touch && tpe(facts.touch), ext: tpe(extT), stacked: stacked && { ...stacked, t: tpe(stacked.t) } }));
for (const a of alerts) console.log(`  ${tpe(a.at)} ${a.text}`);
