// Cuts assets/data/<id>.json for one trade (scripts/trades.mjs) from the 1-minute footprint archive
// (.data/orderflow/btcusdt-90d.json): 5-minute bars for the approach, 1-minute footprint bars from
// ten minutes before the extreme until a few minutes after the exit, the trade as the stretch film
// has it (entry, stop, target, result) and its alerts. Run from this folder: node scripts/extract.mjs 2026-09-14-4
import { readFile, writeFile } from "node:fs/promises";
import { CIRCLED, trades } from "./trades.mjs";

const id = process.argv[2];
const T = trades().find((t) => t.id === id);
if (!T) throw new Error(`unknown trade ${id}; e.g. ${trades()[0].id}`);
const MIN = 60_000;
const TF = 5 * MIN;
const long = T.dir === "long";

const raw = JSON.parse(await readFile("../../../.data/orderflow/btcusdt-90d.json", "utf8"));
const tick = raw.tick;
const minute = new Map();
for (const [t, o, h, l, c, lv] of raw.bars) {
  let buy = 0;
  let sell = 0;
  for (const [, b, s] of lv) (buy += b), (sell += s);
  minute.set(t, { t, o, h, l, c, lv, buy, sell, d: buy - sell });
}
const bar = (t) => {
  const b = minute.get(t);
  if (!b) throw new Error(`no 1-minute bar at ${new Date(t).toISOString()}`);
  return b;
};
const range = (a, b) => {
  const out = [];
  for (let t = a; t <= b; t += MIN) out.push(bar(t));
  return out;
};
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

// The extreme the stop sits beyond: the rule's own when it has one, else the highest (short) or
// lowest (long) minute from the touch to the entry.
const touchT = T.touchT ?? T.entryT - 30 * MIN;
let extT = T.extT;
if (!extT) {
  extT = touchT;
  for (const b of range(touchT, T.entryT)) if (long ? b.l < bar(extT).l : b.h > bar(extT).h) extT = b.t;
}
const zoomT = Math.min(Math.floor((Math.min(extT, T.entryT) - 10 * MIN) / TF) * TF, Math.floor((T.entryT - 5 * MIN) / TF) * TF);

// Stacked imbalances in the trade's direction near the entry, framed on the chart when there are any.
function stackedIn(b) {
  const m = new Map(b.lv.map(([bin, bu, se]) => [bin, [bu, se]]));
  let run = 0;
  let best = null;
  for (const b2 of [...m.keys()].sort((x, y) => x - y)) {
    const [bu, se] = m.get(b2);
    const ok = long ? bu >= 1 && bu >= 3 * (m.get(b2 - 1)?.[1] ?? 0) : se >= 1 && se >= 3 * (m.get(b2 + 1)?.[0] ?? 0);
    run = ok ? run + 1 : 0;
    if (run >= 3 && (!best || run > best.run)) best = { run, lo: b2 - run + 1, hi: b2 };
  }
  return best;
}
let stacked = null;
for (let t = T.entryT; t >= Math.max(extT, T.entryT - 5 * MIN) && !stacked; t -= MIN) {
  const s = stackedIn(bar(t));
  if (s) stacked = { t, ...s };
}

// Bars: 5-minute from six hours before the zoom (the fast part starts three hours before it), then
// 1-minute from twenty minutes before the zoom until four minutes after the exit.
const five = [];
for (let t = zoomT - 6 * 3_600_000; t < zoomT; t += TF) {
  const m = range(t, t + 4 * MIN);
  five.push([t, m[0].o, Math.max(...m.map((x) => x.h)), Math.min(...m.map((x) => x.l)), m[4].c, Math.round(sum(m, (x) => x.d))]);
}
const ones = range(zoomT - 20 * MIN, T.exitT + 4 * MIN).map((b) => [b.t, b.o, b.h, b.l, b.c, Math.round(b.d), b.lv.map(([bin, bu, se]) => [bin, +bu.toFixed(1), +se.toFixed(1)])]);
const idx1 = (t) => ones.findIndex((b) => b[0] === t);
const oneFrom = idx1(zoomT);
const metrics = raw.metrics;
const oiAt = (t) => {
  let v = null;
  for (const m of metrics) if (m[0] <= t) v = m[1];
  return v;
};

const minutes = Math.round((T.exitT - T.entryT) / MIN);
const won = T.result === "tp";
const day = new Date(T.entryT + 8 * 3_600_000);
const out = {
  id,
  no: T.k + 1,
  title: `${day.getUTCMonth() + 1}/${day.getUTCDate()} · ${T.rule}`,
  tag: T.rule,
  chip: `${T.range} · 第 ${T.k + 1} 筆`,
  dir: T.dir,
  source: raw.source,
  tick,
  levels: T.levelPrice ? [{ price: T.levelPrice, name: T.level, color: "level" }] : [],
  marks: [],
  five,
  fiveFrom: five.findIndex((b) => b[0] >= zoomT - 3 * 3_600_000),
  ones,
  oneFrom,
  trade: { entry: T.entry, stop: T.stop, tp: T.tp, r: T.r, result: T.result, signal: idx1(T.entryT), exit: idx1(T.exitT), ext: idx1(extT) },
  stacked: stacked && { bar: idx1(stacked.t), lo: stacked.lo * tick, hi: (stacked.hi + 1) * tick },
  // An alert from before the zoom shows on the first slow bar, still stamped with its own time.
  alerts: T.alerts.map((a) => ({ ...a, bar: Math.max(idx1(Math.floor(a.at / MIN) * MIN), oneFrom) })),
  captions: [
    ["zoom", `${CIRCLED[T.k]} 放大成 1 分足跡`],
    ["entry", T.why],
    ["exit", won ? `${minutes} 分鐘 止盈 +${T.r}R` : `${minutes} 分鐘 停損 −1R`],
  ],
  oi: { pre: oiAt(extT - 60 * MIN), ext: oiAt(extT), post: oiAt(extT + 30 * MIN) },
};
for (const a of out.alerts) if (a.bar < 0) throw new Error(`alert outside the 1-minute window: ${a.text}`);
if (out.trade.signal < 0 || out.trade.exit < 0) throw new Error("entry or exit outside the 1-minute window");
await writeFile(`assets/data/${id}.json`, JSON.stringify(out));
const tpe = (ms) => new Date(ms + 8 * 3_600_000).toISOString().slice(5, 16).replace("T", " ");
console.log(`${id}: ${T.dir} @${T.entry} stop ${T.stop} target ${T.tp} → ${T.result} at ${tpe(T.exitT)}, ${minutes} min; ${five.length} five-minute, ${ones.length} one-minute bars`);
