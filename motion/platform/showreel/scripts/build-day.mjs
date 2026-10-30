// Builds .tape/day.data.json: 9/14 from 11:20 Taipei as second-by-second Binance trades, with the
// day before as history, in the shape the lab's replay mode plays. Same steps as
// scripts/replay-cases/build-case.mjs, written here so nothing lands in public/. Needs
// .data/orderflow and .cache/orderflow (scripts/orderflow-data.mjs writes both). Run from this folder: node scripts/build-day.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { REPO, TAPE } from "./lab-rig.mjs";
import { groupPrints } from "../../../../public/lab/orderflow/bybit.js";
import { fromArchive } from "../../../../public/lab/orderflow/metrics.js";

const MAIN = process.env.MAIN_REPO || REPO; // where .data and .cache live; a worktree points this at the main checkout
const HISTORY = Date.parse("2026-09-13T12:00:00Z");
const START = Date.parse("2026-09-14T11:20:00+08:00");
const END = Date.parse("2026-09-14T21:45:00+08:00");
const DAYS = ["2026-09-13", "2026-09-14"];
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

const rows = [];
const metrics = [];
const seconds = new Map();
const trades = [];
for (const day of DAYS) {
  const raw = JSON.parse(readFileSync(join(MAIN, `.data/orderflow/case-${day}.json`), "utf8"));
  for (const r of raw.bars) if (r[0] >= HISTORY && r[0] < START) rows.push(r);
  metrics.push(...fromArchive(raw.metrics));
  const csv = unzipSingle(readFileSync(join(MAIN, `.cache/orderflow/BTCUSDT-aggTrades-${day}.zip`)));
  let i = 0;
  while (i < csv.length) {
    let j = csv.indexOf(10, i);
    if (j < 0) j = csv.length;
    const line = csv.latin1Slice(i, j);
    i = j + 1;
    if (!line || line.charCodeAt(0) < 48 || line.charCodeAt(0) > 57) continue;
    const c = line.split(",");
    const t = Number(c[5]);
    if (t < HISTORY || t >= END) continue;
    const price = Number(c[1]);
    const qty = Number(c[2]);
    const sell = c[6].trim().toLowerCase() === "true";
    trades.push({ t, price, qty, sell });
    if (t < START) continue;
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
const prints = groupPrints(trades).filter((p) => p[3] >= 5);
const readings = metrics.filter((m) => m[0] >= HISTORY - 86_400_000 && m[0] <= END).sort((a, b) => a[0] - b[0]);
const out = { id: "2026-09-14", symbol: "BTCUSDT", source: "Binance", tick: TICK, history: HISTORY, start: START, end: END, rows, slices, prints, metrics: readings };
writeFileSync(join(TAPE, "day.data.json"), JSON.stringify(out));
console.log(`${rows.length} history minutes, ${slices.length} seconds, ${prints.length} prints, ${(JSON.stringify(out).length / 1e6).toFixed(1)} MB`);
