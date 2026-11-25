// Builds a lab replay case (public/lab/orderflow/cases/<id>.data.json) from the BingX 1-minute
// klines saved by fetch-bingx.mjs: the contract the trade was placed on, so its prices are the
// fills', but with no trades behind them, so the case has candles and no footprint. Each minute
// joins the replay when it closes.
//
//   node scripts/track-record/build-bingx-case.mjs --id t-2025-12-30-gold --symbol NCCOGOLD2USD-USDT \
//     --history 2025-12-30T02:00Z --start 2025-12-30T08:20Z --end 2025-12-30T09:20Z
import { readFile, writeFile, mkdir } from "node:fs/promises";

const args = Object.fromEntries(process.argv.slice(2).flatMap((x, i, all) => (x.startsWith("--") ? [[x.slice(2), all[i + 1]]] : [])));
const HISTORY = Date.parse(args.history);
const START = Date.parse(args.start);
const END = Date.parse(args.end);
const SYMBOL = args.symbol;
if (!args.id || !SYMBOL || ![HISTORY, START, END].every(Number.isFinite) || !(HISTORY < START && START < END)) throw new Error("Need --id --symbol --history --start --end");
const NAMES = { "NCCOGOLD2USD-USDT": "黃金（GOLD）", "BTC-USDT": "BTC-USDT", "ETH-USDT": "ETH-USDT", "SOL-USDT": "SOL-USDT" };
const MINUTE = 60_000;
const DAY = 86_400_000;
const root = new URL("../../", import.meta.url);

const klines = [];
for (let d = Math.floor(HISTORY / DAY) * DAY; d < END; d += DAY) {
  const day = new Date(d).toISOString().slice(0, 10);
  try {
    klines.push(...JSON.parse(await readFile(new URL(`data/track-record/bingx-1m/${SYMBOL}-${day}.json`, root), "utf8")));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    console.log(`(no ${SYMBOL} ${day})`); // gold does not trade on weekends
  }
}
klines.sort((a, b) => a[0] - b[0]);
const rows = klines.filter((k) => k[0] >= HISTORY && k[0] < START).map(([t, o, h, l, c]) => [t, o, h, l, c, []]);
// A replay second per closed minute: [seconds from start, o, h, l, c, levels].
const slices = klines.filter((k) => k[0] >= START && k[0] + MINUTE <= END).map(([t, o, h, l, c]) => [(t + MINUTE - 1000 - START) / 1000, o, h, l, c, []]);
const out = {
  id: args.id,
  symbol: SYMBOL,
  source: "BingX",
  label: SYMBOL === "NCCOGOLD2USD-USDT" ? "GOLD" : SYMBOL.replace("-", ""),
  tick: Number(args.tick ?? 0.5),
  history: HISTORY,
  start: START,
  end: END,
  rows,
  slices,
  prints: [],
  metrics: [],
  sourceText: `資料：BingX ${NAMES[SYMBOL] ?? SYMBOL} 永續合約的 1 分鐘 K 線，也就是這筆交易下單的合約；每根 K 棒收盤後出現。交易所沒有提供這段時間的逐筆成交，所以沒有足跡與主動買賣量。這是過去行情的回放，不是即時資料，也不是投資建議。`,
};
const dir = new URL("public/lab/orderflow/cases/", root);
await mkdir(dir, { recursive: true });
const json = JSON.stringify(out);
await writeFile(new URL(`${args.id}.data.json`, dir), json);
console.log(`${args.id}: ${rows.length} history minutes, ${slices.length} replay minutes → ${(json.length / 1e3).toFixed(0)} kB`);
