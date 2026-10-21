// Cuts assets/data/replay.json from the archive: 5-minute bars of the chosen stretch (with five
// hours of history before it), the prior UTC day's high and low at each bar, and the trades that
// scripts/replay-cases/scan-abc.mjs found there. Run from this folder: node scripts/extract.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dayProfiles } from "../../../../public/lab/orderflow/strategy-failed-auction.js";

const FROM = Date.parse("2026-02-14T23:20:00Z"); // 2026-02-15 07:20 Taipei: the stretch's start
const HISTORY = 60; // bars already on the chart when the film starts
const TF = 5 * 60_000;
const DAY = 86_400_000;

const windows = JSON.parse(await readFile("../../../.data/orderflow/replay-cases/abc-windows.json", "utf8"));
const w = windows.find((x) => x.from === FROM);
if (!w) throw new Error("stretch not found: run scripts/replay-cases/scan-abc.mjs");
const raw = JSON.parse(await readFile("../../../.data/orderflow/btcusdt-oos.json", "utf8"));
const start = w.from - HISTORY * TF;
const rows = raw.bars.filter((r) => r[0] >= start - 2 * DAY && r[0] < w.to);
const profiles = dayProfiles(rows, raw.tick);

const bars = new Map();
for (const [t, o, h, l, c, levels] of rows) {
  if (t < start) continue;
  const k = Math.floor(t / TF) * TF;
  let b = bars.get(k);
  const vol = levels.reduce((a, [, buy, sell]) => a + buy + sell, 0);
  if (!b) bars.set(k, (b = [k, o, h, l, c, 0]));
  b[2] = Math.max(b[2], h);
  b[3] = Math.min(b[3], l);
  b[4] = c;
  b[5] += vol;
}
const list = [...bars.values()].sort((a, b) => a[0] - b[0]).map((b) => [b[0], b[1], b[2], b[3], b[4], Math.round(b[5])]);
const prior = list.map(([t]) => {
  const p = profiles.get(Math.floor(t / DAY) - 1);
  return p ? [p.high, p.low] : null;
});
const index = (t) => list.findIndex((b) => b[0] <= t && t < b[0] + TF);
const trades = w.trades.map((t) => ({
  strat: t.strat,
  kind: t.kind ?? null,
  dir: t.dir,
  level: t.level ?? null,
  levelPrice: t.levelPrice ?? null,
  signal: index(t.signalT), // the bar whose close triggers the entry
  exit: index(t.exitT - 60_000), // the bar holding the 1-minute bar that hit the stop or target
  entry: t.entry,
  stop: t.stop,
  tp: t.tp,
  result: t.result,
}));
await writeFile("assets/data/replay.json", JSON.stringify({ symbol: "BTCUSDT", source: raw.source, tf: "5m", history: HISTORY, bars: list, prior, trades }));
const tpe = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
console.log(`${list.length} bars ${tpe(list[0][0])} → ${tpe(list.at(-1)[0])}, high ${Math.max(...list.map((b) => b[2]))}, low ${Math.min(...list.map((b) => b[3]))}`);
console.log("prior-day levels:", [...new Set(prior.map((p) => JSON.stringify(p)))].join(" "));
for (const t of trades) console.log(t.strat, t.dir, t.level, "signal bar", t.signal, "exit bar", t.exit, t.result);
