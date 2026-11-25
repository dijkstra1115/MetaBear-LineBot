// One-minute bars around a recorded trade, for the setup detectors: Binance USDⓈ-M klines (with
// taker buy volume, so each bar has its delta) or the saved BingX klines (no delta). Binance
// archives are cached in .cache/orderflow/.
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const DAY = 86_400_000;
const root = new URL("../../", import.meta.url);
const BINANCE = { BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT" };
const BINGX = { BTC: "BTC-USDT", ETH: "ETH-USDT", SOL: "SOL-USDT", GOLD: "NCCOGOLD2USD-USDT" };

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
  return (method === 0 ? data : inflateRawSync(data)).toString("latin1");
}

async function binanceDay(symbol, day) {
  const name = `${symbol}-1m-${day}.zip`;
  const file = new URL(`.cache/orderflow/klines1m-${name}`, root);
  let zip;
  try {
    if ((await stat(file)).size > 0) zip = await readFile(file);
  } catch {}
  if (!zip) {
    const res = await fetch(`https://data.binance.vision/data/futures/um/daily/klines/${symbol}/1m/${name}`);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    zip = Buffer.from(await res.arrayBuffer());
    await mkdir(new URL(".cache/orderflow/", root), { recursive: true });
    await writeFile(file, zip);
  }
  // open_time,open,high,low,close,volume,close_time,quote_volume,count,taker_buy_volume,…
  const bars = [];
  for (const line of unzipSingle(zip).split("\n")) {
    const c = line.split(",");
    if (!/^\d/.test(c[0] ?? "")) continue;
    const v = Number(c[5]);
    const buy = Number(c[9]);
    bars.push({ t: Number(c[0]), o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]), v, d: 2 * buy - v });
  }
  return bars;
}

async function bingxDay(symbol, day) {
  try {
    const rows = JSON.parse(await readFile(new URL(`data/track-record/bingx-1m/${symbol}-${day}.json`, root), "utf8"));
    return rows.map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5], d: null }));
  } catch {
    return [];
  }
}

/** Bars from `from` to `to` (ms) for a card's symbol and source ("Binance" or "BingX"). */
export async function loadBars(symbol, source, from, to) {
  const bars = [];
  for (let d = Math.floor(from / DAY) * DAY; d < to; d += DAY) {
    const day = new Date(d).toISOString().slice(0, 10);
    bars.push(...(source === "Binance" ? await binanceDay(BINANCE[symbol], day) : await bingxDay(BINGX[symbol], day)));
  }
  return bars.filter((b) => b.t >= from && b.t < to).sort((a, b) => a.t - b.t);
}
