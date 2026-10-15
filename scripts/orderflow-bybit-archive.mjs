// Rebuilds 1-minute footprint bars from Bybit's daily BTCUSDT trade archive
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
import { SYMBOL, TICK, addTrade, barRow } from "../public/lab/orderflow/bybit.js";

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
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  let header = true;
  let trades = 0;
  for await (const line of lines) {
    if (header) {
      header = false;
      continue;
    }
    const [ts, , side, size, price] = line.split(",", 5);
    addTrade(bars, { t: Math.round(Number(ts) * 1000), price: Number(price), qty: Number(size), sell: side === "Sell" }, TICK);
    trades++;
  }
  return { rows: [...bars.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => barRow(t, b)), trades };
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
  for (let i = 0; i < built.rows.length; i += BATCH) {
    const res = await fetch(`${API}/import`, {
      method: "POST",
      headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({ rows: built.rows.slice(i, i + BATCH) }),
    });
    if (!res.ok) throw new Error(`${day}: import HTTP ${res.status} ${await res.text()}`);
  }
  console.log(`${day}: ${built.trades.toLocaleString()} trades → ${built.rows.length} bars`);
}
