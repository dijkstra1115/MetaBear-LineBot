// Saves BingX perpetual 1-minute klines for every UTC day a recorded trade touches
// (data/track-record/trades.json, from 6 h before the post to 30 h after). The trades were placed
// on BingX, so these are the prices the fills and stops refer to; BingX only serves about a year of
// minutes, so days are kept once fetched and never re-downloaded.
//
//   node scripts/track-record/fetch-bingx.mjs
//   node scripts/track-record/fetch-bingx.mjs --before 72 --only GOLD   # 3 days before, gold only (setup analysis)
//
// Output: data/track-record/bingx-1m/<SYMBOL>-<day>.json, [[open ms, o, h, l, c, volume], …].
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { parseBingxKlines } from "../../public/lab/orderflow/bingx.js";

const MINUTE = 60_000;
const DAY = 86_400_000;
const SYMBOLS = { BTC: "BTC-USDT", ETH: "ETH-USDT", SOL: "SOL-USDT", GOLD: "NCCOGOLD2USD-USDT" };
const i = process.argv.indexOf("--before");
const BEFORE = (i > 0 ? Number(process.argv[i + 1]) : 6) * 3_600_000;
const j = process.argv.indexOf("--only");
const ONLY = j > 0 ? process.argv[j + 1] : null;
const root = new URL("../../", import.meta.url);
const out = new URL("data/track-record/bingx-1m/", root);
const { trades } = JSON.parse(await readFile(new URL("data/track-record/trades.json", root), "utf8"));
await mkdir(out, { recursive: true });

const wanted = new Map(); // "ETH-USDT 2025-12-17" → [symbol, day start]
for (const t of trades) {
  const symbol = SYMBOLS[t.symbol];
  if (!symbol || !t.posted || t.kind === "partner" || (ONLY && t.symbol !== ONLY)) continue;
  const at = Date.parse(t.posted.replace(/\+08:00$/, ":00+08:00"));
  for (let d = Math.floor((at - BEFORE) / DAY) * DAY; d < at + 30 * 3_600_000; d += DAY) wanted.set(`${symbol} ${new Date(d).toISOString().slice(0, 10)}`, [symbol, d]);
}

const exists = (file) => stat(file).then((s) => s.size > 2, () => false);
let saved = 0;
let missing = 0;
for (const [key, [symbol, day]] of [...wanted].sort()) {
  const file = new URL(`${symbol}-${key.split(" ")[1]}.json`, out);
  if (await exists(file)) continue;
  const rows = new Map();
  for (let t = day; t < day + DAY; t += 1000 * MINUTE) {
    const url = `https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${symbol}&interval=1m&startTime=${t}&endTime=${Math.min(day + DAY, t + 1000 * MINUTE) - 1}&limit=1000`;
    let body;
    for (let attempt = 0; ; attempt++) {
      body = await (await fetch(url)).json();
      if (body.code !== 100410 || attempt === 5) break; // rate limited: wait and retry
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
    if (body.code !== 0) throw new Error(`${key}: ${body.code} ${body.msg}`);
    const vol = new Map((body.data ?? []).map((k) => [Number(k.time), Number(k.volume)]));
    for (const r of parseBingxKlines(body.data ?? [])) if (r[0] >= day && r[0] < day + DAY) rows.set(r[0], [...r, vol.get(r[0]) ?? 0]);
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!rows.size) {
    missing++;
    console.log(`${key}: no minutes (past BingX's retention)`);
    continue;
  }
  await writeFile(file, JSON.stringify([...rows.values()].sort((a, b) => a[0] - b[0])));
  saved++;
  console.log(`${key}: ${rows.size} minutes`);
}
console.log(`${saved} days saved, ${missing} days no longer served, ${wanted.size - saved - missing} already on disk`);
