// Runs strategies A–E (strategies.mjs and A's lab module) over the archive and looks for one
// continuous stretch of N trades for the short replay films. A stretch may use any set of the
// strategies, but every trade those strategies took inside it is shown, and the trades just
// before and after sit off the chart. Internal research: the counts are not for publishing.
//
//   node scripts/replay-cases/scan-strategies.mjs --since 2026-07-21 --n 5 --max-stops 1 --max-hours 36
//
// Writes .data/orderflow/replay-cases/strategy-trades.json and strategy-windows.json.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fromArchive } from "../../public/lab/orderflow/metrics.js";
import { dayProfiles, findFailedAuctions } from "../../public/lab/orderflow/strategy-failed-auction.js";
import { DAY, DEFAULTS_NOTE, MIN, TF, context, findB, findC, findD, findE, simulate } from "./strategies.mjs";

const args = Object.fromEntries(process.argv.slice(2).flatMap((x, i, all) => (x.startsWith("--") ? [[x.slice(2), all[i + 1]]] : [])));
const SINCE = Date.parse(args.since ?? "2026-07-21");
const N = Number(args.n ?? 5);
const MAX_STOPS = Number(args["max-stops"] ?? 1);
const MAX_HOURS = Number(args["max-hours"] ?? 36);
const root = fileURLToPath(new URL("../../", import.meta.url));
const OUT = new URL("../../.data/orderflow/replay-cases/", import.meta.url);
await mkdir(OUT, { recursive: true });

// A month before SINCE warms up the lookbacks, the prior-day levels and the liquidation model.
const sets = await Promise.all([".data/orderflow/btcusdt-oos.json", ".data/orderflow/btcusdt-90d.json"].map(async (f) => JSON.parse(await readFile(root + f, "utf8"))));
const tick = sets[1].tick;
const warm = SINCE - 30 * DAY;
const seen = new Set();
const rows = sets.flatMap((s) => s.bars).filter((r) => r[0] >= warm && !seen.has(r[0]) && seen.add(r[0])).sort((a, b) => a[0] - b[0]);
const readings = fromArchive(sets.flatMap((s) => s.metrics)).filter((r) => r[0] >= warm).sort((a, b) => a[0] - b[0]);
const ctx = context(rows, tick, readings);
const profiles = dayProfiles(rows, tick);

const trades = [];
for (const c of findFailedAuctions(rows, tick, readings)) {
  if (!c.plan) continue;
  trades.push({ strat: "A", dir: c.dir, level: c.dir === "long" ? "前日低" : "前日高", levelPrice: c.level, signalT: c.plan.entryT - TF, entryT: c.plan.entryT, entry: c.plan.entry, stop: c.plan.stop, tp: c.plan.t1 });
}
trades.push(...findB(ctx, profiles), ...findC(ctx), ...findD(ctx), ...findE(ctx));

// Outcomes on 1-minute rows. D's limit fills inside its minute: that minute can only stop it out.
for (const t of trades) {
  if (t.fillMinute) {
    const r = rows[ctx.rowIndex.get(t.entryT)];
    Object.assign(t, r[2] >= t.stop ? { result: "stop", exitT: t.entryT + MIN } : simulate(ctx, t.entryT + MIN, t.dir, t.stop, t.tp, t.entryT));
  } else Object.assign(t, simulate(ctx, t.entryT, t.dir, t.stop, t.tp));
}
// One position per strategy at a time.
trades.sort((a, b) => a.entryT - b.entryT);
const busy = {};
const taken = trades.filter((t) => {
  if (t.entryT < SINCE || t.result === "open" || t.entryT < (busy[t.strat] ?? 0)) return false;
  busy[t.strat] = t.exitT;
  return true;
});
for (const t of taken) t.r = t.result === "stop" ? -1 : t.result === "tp" ? Math.abs(t.tp - t.entry) / Math.abs(t.entry - t.stop) : null;
await writeFile(new URL("strategy-trades.json", OUT), JSON.stringify(taken));

console.log(`trades from ${args.since ?? "2026-07-21"} (internal):`);
for (const s of "ABCDE") {
  const x = taken.filter((t) => t.strat === s);
  console.log(`  ${s}: ${x.length}, tp ${x.filter((t) => t.result === "tp").length}, stop ${x.filter((t) => t.result === "stop").length}, timeout ${x.filter((t) => t.result === "timeout").length}`);
}
for (const line of DEFAULTS_NOTE) console.log(`  ${line}`);

// Stretches, for every set of strategies.
const found = new Map();
for (let mask = 1; mask < 32; mask++) {
  const use = [..."ABCDE"].filter((_, k) => mask & (1 << k));
  const list = taken.filter((t) => use.includes(t.strat));
  for (let i = 0; i + N <= list.length; i++) {
    const w = list.slice(i, i + N);
    if (w.some((t) => t.result === "timeout")) continue;
    if (w.some((t, k) => k > 0 && t.entryT < w[k - 1].exitT)) continue;
    const from = w[0].entryT - 30 * TF;
    const to = Math.max(...w.map((t) => t.exitT)) + 6 * TF;
    if (to - from > MAX_HOURS * 3600_000) continue;
    if (list[i - 1] && list[i - 1].exitT > from) continue;
    if (list[i + N] && list[i + N].entryT < to) continue;
    const stops = w.filter((t) => t.result === "stop").length;
    if (stops > MAX_STOPS) continue;
    const key = w.map((t) => `${t.strat}${t.entryT}`).join();
    const prev = found.get(key);
    // The same trades under more strategies is the stronger claim: more rules ran and none fired.
    if (!prev || use.length > prev.use.length) found.set(key, { from, to, hours: (to - from) / 3600_000, use, stops, r: w.reduce((a, t) => a + t.r, 0), trades: w });
  }
}
const windows = [...found.values()].sort((a, b) => (b.stops === 1) - (a.stops === 1) || b.use.length - a.use.length || a.hours - b.hours);
await writeFile(new URL("strategy-windows.json", OUT), JSON.stringify(windows, null, 1));
const tpe = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
console.log(`\n${windows.length} stretches of ${N} with at most ${MAX_STOPS} stop, ${MAX_HOURS} h of chart at most`);
for (const w of windows.slice(0, 20))
  console.log(`${tpe(w.from)} → ${tpe(w.to)}  ${w.hours.toFixed(1)} h  uses ${w.use.join("")}  ${w.r.toFixed(2)} R  | ${w.trades.map((t) => `${t.strat}${t.dir === "long" ? "多" : "空"}${t.result === "stop" ? "✗" : "✓"}`).join(" ")}`);
