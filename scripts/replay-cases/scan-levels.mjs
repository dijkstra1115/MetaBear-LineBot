// Finds fast reversals at volume-profile levels, prior-day/week extremes and VWAP in the last
// 90 days of Binance BTCUSDT perp 1-minute klines. Internal research: cases are picked after
// the fact (docs/REPLAY-CASES-2026Q3.md). Writes .data/orderflow/replay-cases/events.json.
//
//   node scripts/replay-cases/scan-levels.mjs
import { readFile, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
const DIR = new URL("../../.data/orderflow/replay-cases/", import.meta.url);
await mkdir(DIR, { recursive: true });
const cache = new URL("klines.json", DIR);
const MIN = 60_000, DAY = 86_400_000;
const END = Math.floor(Date.now() / MIN) * MIN;
const START = Math.floor((END - 92 * DAY) / DAY) * DAY; // includes 2 prior days for levels

let k;
try { k = JSON.parse(await readFile(cache, "utf8")); } catch {
  k = [];
  for (let t = START; t < END; ) {
    const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&startTime=${t}&limit=1500`);
    const rows = await r.json();
    if (!rows.length) break;
    for (const x of rows) k.push([x[0], +x[1], +x[2], +x[3], +x[4], +x[5], +x[9]]); // t o h l c vol takerBuy
    t = rows.at(-1)[0] + MIN;
  }
  await writeFile(cache, JSON.stringify(k));
}
console.log("bars", k.length, new Date(k[0][0]).toISOString(), new Date(k.at(-1)[0]).toISOString());

// Per UTC day: high/low, volume profile (bar volume at typical price, $25 bins), VWAP path.
const BIN = 25;
const days = new Map();
for (const [t, o, h, l, c, v] of k) {
  const d = Math.floor(t / DAY);
  let x = days.get(d);
  if (!x) days.set(d, (x = { h: -Infinity, l: Infinity, vol: new Map() }));
  x.h = Math.max(x.h, h); x.l = Math.min(x.l, l);
  const b = Math.floor((h + l + c) / 3 / BIN);
  x.vol.set(b, (x.vol.get(b) ?? 0) + v);
}
for (const x of days.values()) {
  const bins = [...x.vol.keys()].sort((a, b) => a - b), v = bins.map((b) => x.vol.get(b));
  const tot = v.reduce((a, b) => a + b, 0);
  let p = v.indexOf(Math.max(...v)), lo = p, hi = p, acc = v[p];
  while (acc < tot * 0.7 && (lo > 0 || hi < v.length - 1)) {
    const dn = lo > 0 ? v[lo - 1] : -1, up = hi < v.length - 1 ? v[hi + 1] : -1;
    if (up >= dn) acc += v[++hi]; else acc += v[--lo];
  }
  Object.assign(x, { poc: (bins[p] + 0.5) * BIN, val: (bins[lo] + 0.5) * BIN, vah: (bins[hi] + 0.5) * BIN });
}

// Levels in force at minute i: prior day H/L/POC/VAH/VAL, prior-week H/L (7 prior days), today's VWAP.
const firstDay = Math.floor(START / DAY) + 2;
const events = [];
let vwapD = -1, pv = 0, vv = 0;
const vwap = new Array(k.length);
for (let i = 0; i < k.length; i++) {
  const [t, , h, l, c, v] = k[i];
  const d = Math.floor(t / DAY);
  if (d !== vwapD) { vwapD = d; pv = 0; vv = 0; }
  pv += ((h + l + c) / 3) * v; vv += v; vwap[i] = pv / vv;
}
const PRE = 60, POST = 30, HOLD = 240;
for (let i = PRE; i < k.length - HOLD; i++) {
  const [t, , h, l] = k[i];
  const d = Math.floor(t / DAY);
  if (d < firstDay) continue;
  const y = days.get(d - 1);
  if (!y) continue;
  let wh = -Infinity, wl = Infinity;
  for (let j = 1; j <= 7; j++) { const z = days.get(d - j); if (z) { wh = Math.max(wh, z.h); wl = Math.min(wl, z.l); } }
  const levels = [["前日高", y.h], ["前日低", y.l], ["前日POC", y.poc], ["前日VAH", y.vah], ["前日VAL", y.val], ["週高", wh], ["週低", wl]];
  if (Math.floor((t - 30 * MIN) / DAY) === d) levels.push(["VWAP", vwap[i - 1]]);
  for (const side of ["top", "bottom"]) {
    // local extreme: highest high (lowest low) in ±PRE / POST window
    const ext = side === "top" ? h : l;
    let isExt = true;
    for (let j = i - PRE; j <= i + POST && isExt; j++) if (j !== i && (side === "top" ? k[j][2] > ext || (k[j][2] === ext && j < i) : k[j][3] < ext || (k[j][3] === ext && j < i))) isExt = false;
    if (!isExt) continue;
    // approach: move into the extreme over the prior 60 min
    const pre = side === "top" ? Math.min(...k.slice(i - PRE, i).map((x) => x[3])) : Math.max(...k.slice(i - PRE, i).map((x) => x[2]));
    const approach = Math.abs(ext - pre) / pre;
    // reversal: best opposite move within POST minutes, and speed
    let rev = 0, revT = 0;
    for (let j = i + 1; j <= i + POST; j++) {
      const m = side === "top" ? (ext - k[j][3]) / ext : (k[j][2] - ext) / ext;
      if (m > rev) { rev = m; revT = j - i; }
    }
    // hold: extreme not retaken in the next HOLD minutes, and the move kept going
    let held = true, far = 0;
    for (let j = i + 1; j <= i + HOLD; j++) {
      if (side === "top" ? k[j][2] > ext : k[j][3] < ext) { held = false; break; }
      far = Math.max(far, side === "top" ? (ext - k[j][3]) / ext : (k[j][2] - ext) / ext);
    }
    if (!held || rev < 0.008 || approach < 0.005) continue;
    // nearest key level the extreme touched or pierced (within 0.15 % beyond / 0.1 % short)
    const hits = levels
      .map(([name, lv]) => ({ name, lv, gap: side === "top" ? (ext - lv) / lv : (lv - ext) / lv }))
      .filter((x) => x.gap >= -0.001 && x.gap <= 0.004);
    if (!hits.length) continue;
    // taker delta into the extreme (last 15 min) vs after (next 15 min)
    const delta = (a, b) => k.slice(a, b).reduce((s, x) => s + 2 * x[6] - x[5], 0);
    events.push({
      t, side, ext, approach, rev, revT, far, hits,
      dIn: delta(i - 15, i + 1), dOut: delta(i + 1, i + 16),
      volSpike: k[i][5] / (k.slice(i - 60, i).reduce((s, x) => s + x[5], 0) / 60),
    });
  }
}
const tpe = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
// speed-weighted score: big, fast, held reversals at confluence of levels
for (const e of events) e.score = (e.rev * 100) / Math.sqrt(e.revT) + e.far * 30 + (e.hits.length - 1) * 0.3;
events.sort((a, b) => b.score - a.score);
console.log("events", events.length);
for (const e of events.slice(0, 25))
  console.log(
    `${tpe(e.t)} ${e.side === "top" ? "頂" : "底"} ${e.ext.toFixed(0)} | ${e.hits.map((h) => `${h.name} ${h.lv.toFixed(0)} (${(h.gap * 100).toFixed(2)}%)`).join(", ")} | ` +
      `來勢 ${(e.approach * 100).toFixed(1)}% 反轉 ${(e.rev * 100).toFixed(2)}%/${e.revT}m 4h內 ${(e.far * 100).toFixed(1)}% | Δin ${e.dIn.toFixed(0)} Δout ${e.dOut.toFixed(0)} 量比 ${e.volSpike.toFixed(1)}`,
  );
await writeFile(new URL("events.json", DIR), JSON.stringify(events, null, 1));
