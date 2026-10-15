// Rebuilds 1-minute footprint bars and large prints from Bybit's daily BTCUSDT trade archive
// (public.bybit.com/trading) and imports them into the order-flow collector, which treats
// them as authoritative over its own live minutes:
//
//   npm run lab:orderflow:bybit -- --days 14
//   npm run lab:orderflow:bybit -- --days 3 --api https://metabear.io/api/orderflow/btcusdt
//
// The token comes from ORDERFLOW_ADMIN_TOKEN, or from .dev.vars for the local Worker
// (npm run orderflow:dev). Downloads are cached in .data/orderflow/bybit/.
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { PRINT_MIN, SYMBOL, TICK, addTrade, barRow, groupPrints } from "../public/lab/orderflow/bybit.js";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const DAYS = Number(opt("days", 14));
const API = opt("api", "http://127.0.0.1:8792/api/orderflow/btcusdt");
const BATCH = 240;

const root = fileURLToPath(new URL("..", import.meta.url));
const cacheDir = `${root}.data/orderflow/bybit/`;

async function token() {
  if (process.env.ORDERFLOW_ADMIN_TOKEN) return process.env.ORDERFLOW_ADMIN_TOKEN;
  try {
    const vars = await readFile(`${root}.dev.vars`, "utf8");
    return vars.match(/^ORDERFLOW_ADMIN_TOKEN=(.+)$/m)?.[1].trim();
  } catch {
    return undefined;
  }
}

async function download(day) {
  const file = `${cacheDir}${SYMBOL}${day}.csv.gz`;
  try {
    if ((await stat(file)).size > 0) return file;
  } catch {}
  const res = await fetch(`https://public.bybit.com/trading/${SYMBOL}/${SYMBOL}${day}.csv.gz`);
  if (!res.ok) throw new Error(`${day}: HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

// Columns: timestamp (seconds), symbol, side (taker), size, price, …
async function buildDay(file) {
  const bars = new Map();
  const prints = [];
  // Fills of one taker order share a timestamp and side (groupPrints); collect each run.
  let run = [];
  const closeRun = () => {
    for (const p of groupPrints(run)) if (p[3] >= PRINT_MIN) prints.push(p);
    run = [];
  };
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  let header = true;
  let trades = 0;
  for await (const line of lines) {
    if (header) {
      header = false;
      continue;
    }
    const [ts, , side, size, price] = line.split(",", 5);
    const trade = { t: Math.round(Number(ts) * 1000), price: Number(price), qty: Number(size), sell: side === "Sell" };
    addTrade(bars, trade, TICK);
    if (run.length && (run[0].t !== trade.t || run[0].sell !== trade.sell)) closeRun();
    run.push(trade);
    trades++;
  }
  closeRun();
  return { rows: [...bars.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => barRow(t, b)), prints, trades };
}

const auth = await token();
if (!auth) throw new Error("Set ORDERFLOW_ADMIN_TOKEN (or add it to .dev.vars for the local Worker).");
await mkdir(cacheDir, { recursive: true });
// The archive for a UTC day appears early the next day; start from yesterday.
for (let k = DAYS; k >= 1; k--) {
  const day = new Date(Date.now() - k * 86_400_000).toISOString().slice(0, 10);
  let built;
  try {
    built = await buildDay(await download(day));
  } catch (err) {
    console.log(`${day}: skipped (${err.message})`);
    continue;
  }
  const post = async (body) => {
    const res = await fetch(`${API}/import`, {
      method: "POST",
      headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${day}: import HTTP ${res.status} ${await res.text()}`);
  };
  for (let i = 0; i < built.rows.length; i += BATCH) await post({ rows: built.rows.slice(i, i + BATCH) });
  // The day's prints replace whatever the collector stored for it.
  const from = Date.parse(`${day}T00:00:00Z`);
  await post({ prints: built.prints, from, to: from + 86_400_000 });
  console.log(`${day}: ${built.trades.toLocaleString()} trades → ${built.rows.length} bars, ${built.prints.length.toLocaleString()} prints ≥ ${PRINT_MIN} BTC`);
}
