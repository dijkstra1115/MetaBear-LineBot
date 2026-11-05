// Builds .tape/case.data.json, the lab replay data for 8/22 (Taipei): minute footprints from the
// evening before as history, then one row per second of Binance trades from 17:40 to 18:50, plus
// prints, OI/funding/premium readings and Binance spot taker flow per minute (現貨 CVD).
// Needs .data/orderflow/btcusdt-aug.json and the cached aggTrades zips, both written by
//   node scripts/orderflow-data.mjs --from 2026-08-21 --to 2026-08-24 --out .data/orderflow/btcusdt-aug.json
// Run from this folder: node scripts/build-case.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { REPO, TAPE } from "./rig.mjs";
import { groupPrints } from "../../../../public/lab/orderflow/bybit.js";
import { fromArchive } from "../../../../public/lab/orderflow/metrics.js";

export const HISTORY = Date.parse("2026-08-21T20:00:00+08:00");
export const START = Date.parse("2026-08-22T17:40:00+08:00");
export const END = Date.parse("2026-08-22T18:50:00+08:00");
const TICK = 10;
const round = (v) => Math.round(v * 1000) / 1000;

function unzipSingle(zip) {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const cd = zip.readUInt32LE(eocd + 16);
  const method = zip.readUInt16LE(cd + 10);
  const size = zip.readUInt32LE(cd + 20);
  const local = zip.readUInt32LE(cd + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const body = zip.subarray(start, start + size);
  return method === 0 ? body : inflateRawSync(body);
}

const raw = JSON.parse(readFileSync(join(REPO, ".data/orderflow/btcusdt-aug.json"), "utf8"));
const rows = raw.bars.filter((r) => r[0] >= HISTORY && r[0] < START);
const metrics = fromArchive(raw.metrics).filter((m) => m[0] >= HISTORY - 86_400_000 && m[0] <= END);
const spot = raw.spot.filter((r) => r[0] >= HISTORY && r[0] < END);
const seconds = new Map();
const trades = [];
for (const day of ["2026-08-21", "2026-08-22"]) {
  const csv = unzipSingle(readFileSync(join(REPO, `.cache/orderflow/BTCUSDT-aggTrades-${day}.zip`)));
  let i = 0;
  while (i < csv.length) {
    let j = csv.indexOf(10, i);
    if (j < 0) j = csv.length;
    const line = csv.latin1Slice(i, j);
    i = j + 1;
    if (!line || line.charCodeAt(0) < 48 || line.charCodeAt(0) > 57) continue;
    const c = line.split(",");
    const t = Number(c[5]);
    if (t < START || t >= END) continue;
    const price = Number(c[1]);
    const qty = Number(c[2]);
    const sell = c[6].trim().toLowerCase() === "true";
    trades.push({ t, price, qty, sell });
    const s = Math.floor(t / 1000) * 1000;
    let b = seconds.get(s);
    if (!b) seconds.set(s, (b = { o: price, h: price, l: price, c: price, levels: new Map() }));
    if (price > b.h) b.h = price;
    if (price < b.l) b.l = price;
    b.c = price;
    const bin = Math.floor(price / TICK);
    const lv = b.levels.get(bin) ?? [0, 0];
    lv[sell ? 1 : 0] += qty;
    b.levels.set(bin, lv);
  }
}
trades.sort((a, b) => a.t - b.t);
const slices = [...seconds.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([s, b]) => [(s - START) / 1000, b.o, b.h, b.l, b.c, [...b.levels.entries()].sort((x, y) => x[0] - y[0]).map(([bin, [buy, sell]]) => [bin, round(buy), round(sell)])]);
// Prints in the replay are grouped from the archive (same millisecond and side): an estimate.
const prints = groupPrints(trades).filter((p) => p[3] >= 5);
const out = { id: "2026-08-22", symbol: "BTCUSDT", source: "Binance", tick: TICK, history: HISTORY, start: START, end: END, rows, slices, prints, metrics, spot };
mkdirSync(TAPE, { recursive: true });
writeFileSync(join(TAPE, "case.data.json"), JSON.stringify(out));
console.log(`${rows.length} history minutes, ${slices.length} seconds, ${prints.length} prints, ${metrics.length} readings, ${spot.length} spot minutes, ${(JSON.stringify(out).length / 1e6).toFixed(1)} MB`);
