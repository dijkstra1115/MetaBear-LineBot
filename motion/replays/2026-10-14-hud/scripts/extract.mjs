// 2026-10-14 (Taipei) for the film: 1-minute bars, the prior-day levels as they changed at 08:00,
// and the eleven trades the key-level families took that day with the data behind each entry.
// Run from this folder after scripts/strategy-research/export.mjs and october-list.mjs --merged:
//   node scripts/extract.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fromArchive } from "../../../../public/lab/orderflow/metrics.js";
import { dayProfiles } from "../../../../public/lab/orderflow/strategy-failed-auction.js";
import { context, findB } from "../../../../scripts/replay-cases/strategies.mjs";

const ROOT = new URL("../../../../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, ROOT), "utf8"));
const MIN = 60_000, H = 60 * MIN, DAY = 24 * H, TPE = 8 * H;
const DAY0 = Date.parse("2026-10-14T00:00:00+08:00");
const FROM = DAY0 - 60 * MIN, TO = DAY0 + DAY + 30 * MIN;

const archive = read(".data/orderflow/btcusdt-oct.json");
const tick = archive.tick;
const rows = archive.bars;
const byT = new Map(rows.map((r) => [r[0], r]));

// UTC-day profiles, the same definition as scan-case-rules.mjs (value area 70 %).
function profile(day) {
  const v = new Map();
  let h = -Infinity, l = Infinity;
  for (const r of rows) {
    if (Math.floor(r[0] / DAY) !== day) continue;
    (h = Math.max(h, r[2])), (l = Math.min(l, r[3]));
    for (const [bin, bu, se] of r[5]) v.set(bin, (v.get(bin) ?? 0) + bu + se);
  }
  const bins = [...v.keys()].sort((a, b) => a - b), vol = bins.map((b) => v.get(b)), tot = vol.reduce((a, b) => a + b, 0);
  let p = vol.indexOf(Math.max(...vol)), lo = p, hi = p, acc = vol[p];
  while (acc < tot * 0.7 && (lo > 0 || hi < vol.length - 1)) {
    const dn = lo > 0 ? vol[lo - 1] : -1, up = hi < vol.length - 1 ? vol[hi + 1] : -1;
    if (up >= dn) acc += vol[++hi];
    else acc += vol[--lo];
  }
  const mid = (b) => b * tick + tick / 2;
  return { high: h, low: l, poc: mid(bins[p]), vah: mid(bins[hi]), val: mid(bins[lo]) };
}
const switchT = DAY0 + 8 * H; // 08:00 Taipei is 00:00 UTC: "prior day" moves from 10-12 to 10-13 UTC
const levelSets = [
  { from: FROM, to: switchT, day: "10-12", ...profile(Math.floor(switchT / DAY) - 2) },
  { from: switchT, to: TO, day: "10-13", ...profile(Math.floor(switchT / DAY) - 1) },
];

// Stacked imbalances on one bar, as scan-case-rules.mjs counts them, with the bins of the best run.
function stackedRun(lv, long) {
  const m = new Map(lv.map(([bin, bu, se]) => [bin, [bu, se]]));
  let run = [], best = [];
  for (const bin of [...m.keys()].sort((x, y) => x - y)) {
    const [bu, se] = m.get(bin);
    const ok = long ? bu >= 1 && bu >= 3 * (m.get(bin - 1)?.[1] ?? 0) : se >= 1 && se >= 3 * (m.get(bin + 1)?.[0] ?? 0);
    run = ok ? [...run, bin] : [];
    if (run.length > best.length) best = run;
  }
  return best;
}

const merged = read(".data/orderflow/research/october-merged.json").filter((x) => x.entryT >= DAY0 && x.entryT < DAY0 + DAY);
const signals = read(".data/orderflow/research/case-rule-signals.json");
const readings = fromArchive(archive.metrics).sort((a, b) => a[0] - b[0]);
const bTrades = findB(context(rows, tick, readings), dayProfiles(rows, tick));
const LEVEL = { 前日高: "前日高", 前日低: "前日低", 前日POC: "前日 POC", 前日VAH: "前日 VAH", 前日VAL: "前日 VAL", 週高: "週高", 週低: "週低" };

const trades = merged.map((x, k) => {
  const long = x.dir === "long";
  const base = { n: k + 1, src: x.src, long, entryT: x.entryT, entry: x.entry, stop: x.stop, tp: x.tp, exitT: x.exitT, result: x.result, r: +x.gross.toFixed(2) };
  if (x.src === "B-hold") {
    const b = bTrades.find((t) => t.entryT === x.entryT && t.dir === x.dir);
    // B decides on a 5-minute bar (signalT) and enters at the next bar's open.
    return { ...base, rule: "吸收守住", name: b.level.replace(" ", " "), level: b.levelPrice, signalT: b.signalT, absorb: b.absorb, zone: [b.levelPrice * 0.9985, b.levelPrice * 1.0015], from: long ? "above" : "below" };
  }
  const s = signals.find((y) => y.entryT === x.entryT && y.long === long && y.rule === x.src);
  const bar = byT.get(x.entryT);
  const bins = stackedRun(bar[5], long);
  if (bins.length !== s.run) throw new Error(`trade ${k + 1}: stack ${bins.length} ≠ ${s.run}`);
  return {
    ...base, rule: "關鍵位拒絕", name: LEVEL[s.name], level: s.level, touchT: s.touchT, extT: s.extT, signalT: x.entryT,
    from: long ? "above" : "below", stack: bins.map((b) => b * tick), footprint: bar[5].map(([bin, bu, se]) => [bin * tick, +bu.toFixed(2), +se.toFixed(2)]),
  };
});

const bars = rows.filter((r) => r[0] >= FROM && r[0] < TO).map((r) => r.slice(0, 5));
mkdirSync(new URL("../assets/data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../assets/data/day.json", import.meta.url), JSON.stringify({ day0: DAY0, from: FROM, to: TO, tick, levelSets, trades, bars }));
console.log(`day.json: ${bars.length} bars, ${trades.length} trades`);
for (const t of trades) console.log(`  ${t.n} ${new Date(t.entryT + TPE).toISOString().slice(11, 16)} ${t.long ? "多" : "空"} ${t.name} ${Math.round(t.level)} ${t.stack ? `${t.stack.length} 層` : `吸收 ${t.absorb}`} → ${t.result} ${t.r}R`);
for (const L of levelSets) console.log(`  levels ${L.day}: 高 ${L.high} 低 ${L.low} POC ${L.poc} VAH ${L.vah} VAL ${L.val}`);
