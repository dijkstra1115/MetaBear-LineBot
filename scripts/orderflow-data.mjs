// Builds the BTC order-flow lab dataset from Binance's public daily archives
// (data.binance.vision, USDⓈ-M futures): aggTrades → 1-minute footprint bars,
// metrics → OI and long/short ratios every 5 minutes; premiumIndexKlines and fundingRate → the
// premium over the index and the settled funding at each reading; spot 1-minute klines → spot
// taker flow per minute (現貨 CVD). The last three are optional: a missing archive is skipped.
//
//   node scripts/orderflow-data.mjs                 # last 3 complete UTC days
//   node scripts/orderflow-data.mjs --days 7
//   node scripts/orderflow-data.mjs --from 2026-10-01 --to 2026-10-03
//   node scripts/orderflow-data.mjs --days 90 --out .data/orderflow/btcusdt-90d.json   # backtests
//
// Archives are cached in .cache/orderflow/; output goes to public/lab/data/.
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { parseSpotKlines } from "../public/lab/orderflow/binance.js";

const SYMBOL = "BTCUSDT";
const TICK = 10; // base price bin in USDT; the page can only merge bins upward
const ARCHIVE = "https://data.binance.vision/data";
const BASE = `${ARCHIVE}/futures/um/daily`;
const root = fileURLToPath(new URL("..", import.meta.url));
const cacheDir = `${root}.cache/orderflow/`;
let outFile = `${root}public/lab/data/${SYMBOL.toLowerCase()}.json`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  const day = 86_400_000;
  // Today's archive is published the next day, so the newest complete day is yesterday.
  const yesterday = Math.floor(Date.now() / day) * day - day;
  const to = args.to ? Date.parse(`${args.to}T00:00:00Z`) : yesterday;
  const from = args.from
    ? Date.parse(`${args.from}T00:00:00Z`)
    : to - (Number(args.days ?? 3) - 1) * day;
  if (args.out) outFile = `${root}${args.out}`;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    throw new Error("Invalid --from/--to/--days");
  }
  const dates = [];
  for (let t = from; t <= to; t += day) dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
}

async function cached(kind, date) {
  const name = `${SYMBOL}-${kind}-${date}.zip`;
  const file = `${cacheDir}${name}`;
  try {
    if ((await stat(file)).size > 0) return readFile(file);
  } catch {}
  const res = await fetch(`${BASE}/${kind}/${SYMBOL}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  await writeFile(file, body);
  return body;
}

// An archive under data.binance.vision/data/<dir>/, cached as <tag>-<name> (spot and premium
// klines share file names); null when it is not published (yet), so the dataset is built without it.
async function optional(tag, dir, name) {
  const file = `${cacheDir}${tag}-${name}`;
  try {
    if ((await stat(file)).size > 0) return unzipSingle(await readFile(file));
  } catch {}
  const res = await fetch(`${ARCHIVE}/${dir}/${name}`);
  if (res.status === 404) {
    process.stdout.write(`(no ${tag}) `);
    return null;
  }
  if (!res.ok) throw new Error(`${tag} ${name}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  await writeFile(file, body);
  return unzipSingle(body);
}

// Each archive holds exactly one CSV; read it through the central directory
// because entries may use a data descriptor with zero sizes in the local header.
function unzipSingle(zip) {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip archive");
  const cd = zip.readUInt32LE(eocd + 16);
  const method = zip.readUInt16LE(cd + 10);
  const size = zip.readUInt32LE(cd + 20);
  const local = zip.readUInt32LE(cd + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + size);
  // A Buffer, not a string: one volatile day of trades can exceed V8's 512 MB string limit.
  return method === 0 ? data : inflateRawSync(data);
}

function* rows(buf) {
  let i = 0;
  while (i < buf.length) {
    let j = buf.indexOf(10, i);
    if (j < 0) j = buf.length;
    const line = buf.latin1Slice(i, j).trim();
    i = j + 1;
    // Newer archives start with a header row; older ones do not.
    if (line && line.charCodeAt(0) >= 48 && line.charCodeAt(0) <= 57) yield line.split(",");
  }
}

const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

function addTrades(csv, bars) {
  // agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker
  for (const r of rows(csv)) {
    const price = Number(r[1]);
    const qty = Number(r[2]);
    const minute = Math.floor(Number(r[5]) / 60_000) * 60_000;
    // Buyer is maker → the seller crossed the spread: aggressive sell.
    const sell = r[6] === "true" || r[6] === "True";
    let bar = bars.get(minute);
    if (!bar) {
      bar = { o: price, h: price, l: price, c: price, levels: new Map() };
      bars.set(minute, bar);
    }
    if (price > bar.h) bar.h = price;
    if (price < bar.l) bar.l = price;
    bar.c = price;
    const bin = Math.floor(price / TICK);
    let level = bar.levels.get(bin);
    if (!level) bar.levels.set(bin, (level = [0, 0]));
    level[sell ? 1 : 0] += qty;
  }
}

function addMetrics(csv, metrics) {
  // create_time,symbol,sum_open_interest,sum_open_interest_value,
  // count_toptrader_long_short_ratio (top accounts), sum_toptrader_long_short_ratio (top positions),
  // count_long_short_ratio (all accounts), sum_taker_long_short_vol_ratio
  for (const r of csv.split("\n").slice(1)) {
    const c = r.trim().split(",");
    if (c.length < 8) continue;
    const t = Date.parse(`${c[0].replace(" ", "T")}Z`);
    if (!Number.isFinite(t)) continue;
    metrics.push([t, round(Number(c[2]), 1), Math.round(Number(c[3])), round(Number(c[5]), 4), round(Number(c[4]), 4), round(Number(c[6]), 4), round(Number(c[7]), 4)]);
  }
}

// premiumIndexKlines / spot klines: open_time,open,high,low,close,volume,close_time,quote_volume,
// count,taker_buy_volume,taker_buy_quote_volume,ignore. A premium minute's close is the premium
// at the end of that minute.
function addPremium(csv, premium) {
  for (const c of rows(csv)) premium.set(Number(c[0]), Number(c[4]));
}

// fundingRate (monthly): calc_time,funding_interval_hours,last_funding_rate.
function addFunding(csv, funding) {
  for (const c of rows(csv)) funding.push([Number(c[0]), Number(c[2])]);
}

const dates = parseArgs(process.argv.slice(2));
await mkdir(cacheDir, { recursive: true });
await mkdir(outFile.slice(0, outFile.lastIndexOf("/") + 1), { recursive: true });

const bars = new Map();
const metrics = [];
const premium = new Map(); // minute open → premium at its close
const spot = [];
const funding = [];
for (const date of dates) {
  process.stdout.write(`${date} aggTrades… `);
  addTrades(unzipSingle(await cached("aggTrades", date)), bars);
  process.stdout.write("metrics… ");
  addMetrics(unzipSingle(await cached("metrics", date)).toString("latin1"), metrics);
  process.stdout.write("premium… ");
  const prem = await optional("premium", `futures/um/daily/premiumIndexKlines/${SYMBOL}/1m`, `${SYMBOL}-1m-${date}.zip`);
  if (prem) addPremium(prem, premium);
  process.stdout.write("spot… ");
  const sp = await optional("spot", `spot/daily/klines/${SYMBOL}/1m`, `${SYMBOL}-1m-${date}.zip`);
  if (sp) spot.push(...parseSpotKlines([...rows(sp)]));
  console.log("ok");
}
// Settled funding is published per month, once the month is over; the month before the first day
// gives the rate in force at the start.
const months = [...new Set([new Date(Date.parse(`${dates[0].slice(0, 7)}-01T00:00:00Z`) - 1).toISOString().slice(0, 7), ...dates.map((d) => d.slice(0, 7))])];
for (const month of months) {
  process.stdout.write(`${month} funding… `);
  const csv = await optional("funding", `futures/um/monthly/fundingRate/${SYMBOL}`, `${SYMBOL}-fundingRate-${month}.zip`);
  if (csv) addFunding(csv, funding);
  console.log("ok");
}
funding.sort((a, b) => a[0] - b[0]);
// Each metrics row is read at its stamp + 5 minutes: the premium at that moment (the close of the
// minute before it) and the last funding settled by then.
metrics.sort((a, b) => a[0] - b[0]);
let f = -1;
for (const row of metrics) {
  const read = row[0] + 5 * 60_000;
  while (f + 1 < funding.length && funding[f + 1][0] <= read) f++;
  const p = premium.get(read - 60_000);
  row.push(f >= 0 ? funding[f][1] : null, p == null ? null : Math.round(p * 1e6) / 1e6);
}

const out = {
  symbol: SYMBOL,
  source: "Binance USDⓈ-M futures public archives (data.binance.vision)",
  tick: TICK,
  bar: 60_000,
  from: dates[0],
  to: dates.at(-1),
  generated: new Date().toISOString(),
  // [time, open, high, low, close, [[bin, buyQty, sellQty], …]]; price = bin × tick
  bars: [...bars.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, b]) => [
      t, b.o, b.h, b.l, b.c,
      [...b.levels.entries()].sort((x, y) => x[0] - y[0]).map(([bin, [buy, sell]]) => [bin, round(buy), round(sell)]),
    ]),
  // [time, OI (BTC), OI (USDT), top-trader position ratio, top-trader account ratio, all-account ratio,
  // taker buy/sell ratio, funding rate, premium over the index] as the archive stamps them: time is
  // the open of a 5-minute period, OI, the ratios, funding and premium are read at its close
  // (time + 5 min), the taker ratio covers the period. The lab reads them through fromArchive() in
  // public/lab/orderflow/metrics.js.
  metrics,
  // Binance spot taker flow per minute: [time, buy, sell, buy USDT, sell USDT] (現貨 CVD).
  spot: spot.sort((a, b) => a[0] - b[0]),
};
const json = JSON.stringify(out);
await writeFile(outFile, json);
console.log(`${out.bars.length} bars, ${out.metrics.length} metric rows, ${out.spot.length} spot minutes, ${premium.size} premium minutes → ${outFile} (${(json.length / 1e6).toFixed(1)} MB)`);
