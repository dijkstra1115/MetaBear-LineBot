// Builds the data file the lab's replay mode plays (public/lab/orderflow/cases/<id>.data.json):
// minute footprint rows before the replay starts, then one row per second of trades during it,
// so the forming bar grows as it did live. Prices and flow are Binance BTCUSDT perpetual.
//
//   node scripts/replay-cases/build-case.mjs --id 2026-09-14 \
//     --history 2026-09-12T12:00Z --start 2026-09-14T12:00Z --end 2026-09-14T14:40Z
//
// Needs, for every UTC day touched, .data/orderflow/case-<day>.json and the cached aggTrades
// archive from `node scripts/orderflow-data.mjs --from <day> --to <day> --out .data/orderflow/case-<day>.json`.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { groupPrints } from "../../public/lab/orderflow/bybit.js";
import { fromArchive } from "../../public/lab/orderflow/metrics.js";

const args = Object.fromEntries(process.argv.slice(2).flatMap((x, i, all) => (x.startsWith("--") ? [[x.slice(2), all[i + 1]]] : [])));
const ms = (s) => Date.parse(s);
const ID = args.id;
const HISTORY = ms(args.history);
const START = ms(args.start);
const END = ms(args.end);
if (!ID || ![HISTORY, START, END].every(Number.isFinite) || !(HISTORY < START && START < END)) throw new Error("Need --id --history --start --end (ISO times, history < start < end)");

const DAY = 86_400_000;
const TICK = 10;
const PRINT_KEEP = 5; // BTC; the lab's smallest useful threshold for a replay
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const data = new URL("../../.data/orderflow/", import.meta.url);
const cache = new URL("../../.cache/orderflow/", import.meta.url);

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

const days = [];
for (let d = Math.floor(HISTORY / DAY) * DAY; d < END; d += DAY) days.push(new Date(d).toISOString().slice(0, 10));

const rows = [];
const metrics = [];
const seconds = new Map(); // second → { o, h, l, c, levels: Map(bin → [buy, sell]) }
const trades = [];
for (const day of days) {
  const raw = JSON.parse(await readFile(new URL(`case-${day}.json`, data), "utf8"));
  if (raw.tick !== TICK) throw new Error(`${day}: tick ${raw.tick}, expected ${TICK}`);
  for (const r of raw.bars) if (r[0] >= HISTORY && r[0] < START) rows.push(r);
  metrics.push(...fromArchive(raw.metrics));
  // agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker
  const csv = unzipSingle(await readFile(new URL(`BTCUSDT-aggTrades-${day}.zip`, cache)));
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
const prints = groupPrints(trades).filter((p) => p[3] >= PRINT_KEEP);
const readings = metrics.filter((m) => m[0] >= HISTORY - DAY && m[0] <= END).sort((a, b) => a[0] - b[0]);

const out = { id: ID, symbol: "BTCUSDT", source: "Binance", tick: TICK, history: HISTORY, start: START, end: END, rows, slices, prints, metrics: readings };
const dir = new URL("../../public/lab/orderflow/cases/", import.meta.url);
await mkdir(dir, { recursive: true });
const json = JSON.stringify(out);
await writeFile(new URL(`${ID}.data.json`, dir), json);
console.log(`${ID}: ${rows.length} history minutes, ${slices.length} replay seconds, ${prints.length} prints ≥ ${PRINT_KEEP} BTC, ${readings.length} readings → ${(json.length / 1e6).toFixed(2)} MB`);
