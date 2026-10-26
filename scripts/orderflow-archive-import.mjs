// Rebuilds 1-minute footprint bars and large prints from Binance's daily BTCUSDT aggTrades archive
// (data.binance.vision), or OKX's daily trade archive with --ex okx, and imports them into that
// exchange's collector, which treats them as authoritative over its own live minutes. The collectors
// import each new day themselves; this script fills older days.
//
//   npm run lab:orderflow:archive -- --days 30 --api https://metabear.io/api/orderflow/btcusdt
//   npm run lab:orderflow:archive -- --ex okx --days 30 --api https://metabear.io/api/orderflow/btcusdt
//   npm run lab:orderflow:archive -- --m eth --ex okx --days 30 --api https://metabear.io/api/orderflow/ethusdt
//
// The token comes from ORDERFLOW_ADMIN_TOKEN, or from .dev.vars for the local Worker
// (npm run orderflow:dev). Downloads are cached in .data/orderflow/binance/.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { ArchiveDay, PRINT_MIN } from "../public/lab/orderflow/bybit.js";
import { binanceArchiveUrl, parseArchiveLine } from "../public/lab/orderflow/binance.js";
import { marketOf, sized } from "../public/lab/orderflow/markets.js";
import { okxArchiveUrl, parseOkxArchiveLine } from "../public/lab/orderflow/okx.js";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const DAYS = Number(opt("days", 30));
const M = marketOf(opt("m", "btc"));
const API = opt("api", `http://127.0.0.1:8792/api/orderflow/${M.path}`);
const BATCH = 240;
const EX = opt("ex", "binance");
// OKX names its files by Beijing-time day, which starts at 16:00 UTC the day before.
const SOURCES = {
  binance: { url: (day) => binanceArchiveUrl(day, M.symbol), parse: parseArchiveLine, offset: 0 },
  okx: { url: (day) => okxArchiveUrl(day, M.okxInst), parse: (line) => parseOkxArchiveLine(line, M.okxInst, M.okxCt), offset: -8 * 3_600_000 },
};
const source = SOURCES[EX];
if (!source) throw new Error("--ex must be binance or okx");

const root = fileURLToPath(new URL("..", import.meta.url));
const cacheDir = `${root}.data/orderflow/${EX}${M.id === "btc" ? "" : `-${M.id}`}/`;

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
  const file = `${cacheDir}${day}.zip`;
  try {
    if ((await stat(file)).size > 0) return readFile(file);
  } catch {}
  const res = await fetch(source.url(day));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  await writeFile(file, body);
  return body;
}

// Each archive holds one CSV; read it through the central directory because entries may use a data
// descriptor with zero sizes in the local header (as scripts/orderflow-data.mjs does).
function unzipSingle(zip) {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip archive");
  const cd = zip.readUInt32LE(eocd + 16);
  const method = zip.readUInt16LE(cd + 10);
  const size = zip.readUInt32LE(cd + 20);
  const local = zip.readUInt32LE(cd + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + size);
  return method === 0 ? data : inflateRawSync(data);
}

function buildDay(csv) {
  const day = new ArchiveDay(M.tick, sized(M, PRINT_MIN));
  for (let i = 0; i < csv.length; ) {
    let j = csv.indexOf(10, i);
    if (j < 0) j = csv.length;
    const trade = source.parse(csv.latin1Slice(i, j));
    i = j + 1;
    if (trade) day.addTrade(trade);
  }
  return { ...day.take(), trades: day.trades };
}

const auth = await token();
if (!auth) throw new Error("Set ORDERFLOW_ADMIN_TOKEN (or add it to .dev.vars for the local Worker).");
await mkdir(cacheDir, { recursive: true });
// The archive for a UTC day appears early the next day; start from yesterday.
for (let k = DAYS; k >= 1; k--) {
  const day = new Date(Date.now() - k * 86_400_000).toISOString().slice(0, 10);
  let built;
  try {
    built = buildDay(unzipSingle(await download(day)));
  } catch (err) {
    console.log(`${day}: skipped (${err.message})`);
    continue;
  }
  // A collector busy with its own daily import can time out a request; imports are idempotent, so
  // a failed batch is sent again.
  const post = async (body) => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${API}/import?ex=${EX}`, {
        method: "POST",
        headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return;
      const detail = (await res.text()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 120);
      if (attempt >= 4 || res.status < 500) throw new Error(`${day}: import HTTP ${res.status} ${detail}`);
      console.log(`${day}: import HTTP ${res.status}, retrying`);
      await new Promise((r) => setTimeout(r, attempt * 5_000));
    }
  };
  for (let i = 0; i < built.rows.length; i += BATCH) await post({ rows: built.rows.slice(i, i + BATCH) });
  const from = Date.parse(`${day}T00:00:00Z`) + source.offset;
  await post({ prints: built.prints, from, to: from + 86_400_000 });
  console.log(`${day}: ${built.trades.toLocaleString()} trades → ${built.rows.length} bars, ${built.prints.length.toLocaleString()} prints ≥ ${sized(M, PRINT_MIN)} ${M.base}`);
}
