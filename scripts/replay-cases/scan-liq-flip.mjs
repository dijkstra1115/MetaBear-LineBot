// Finds reversals at estimated liquidation clusters (the lab's own liqmap model, fed by
// Binance 5-min OI from the daily metrics archive) and at support/resistance flip levels.
import { readFile, writeFile, stat } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { buildLiqMap, stepAt, BIN as LBIN } from "../../public/lab/orderflow/liqmap.js";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const DIR = new URL("../../.data/orderflow/replay-cases/", import.meta.url);
await mkdir(DIR, { recursive: true });
const CACHE = fileURLToPath(new URL("../../.cache/orderflow/", import.meta.url));
await mkdir(CACHE, { recursive: true });
const MIN = 60_000, DAY = 86_400_000;
const WARM = Date.parse("2026-06-20T00:00:00Z");

// klines: warm-up month + the cached 92 days
let k = JSON.parse(await readFile(new URL("klines.json", DIR), "utf8"));
let pre;
try { pre = JSON.parse(await readFile(new URL("klines-pre.json", DIR), "utf8")); } catch {
  pre = [];
  for (let t = WARM; t < k[0][0]; ) {
    const rows = await (await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&startTime=${t}&limit=1500`)).json();
    for (const x of rows) if (x[0] < k[0][0]) pre.push([x[0], +x[1], +x[2], +x[3], +x[4], +x[5], +x[9]]);
    t = rows.at(-1)[0] + MIN;
  }
  await writeFile(new URL("klines-pre.json", DIR), JSON.stringify(pre));
}
k = pre.concat(k);

// OI from the metrics archive
function unzipSingle(zip) {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const cd = zip.readUInt32LE(eocd + 16), method = zip.readUInt16LE(cd + 10), size = zip.readUInt32LE(cd + 20), local = zip.readUInt32LE(cd + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + size);
  return method === 0 ? data : inflateRawSync(data);
}
const oi = [];
for (let t = WARM; t < k.at(-1)[0] - DAY; t += DAY) {
  const date = new Date(t).toISOString().slice(0, 10);
  const file = `${CACHE}BTCUSDT-metrics-${date}.zip`;
  let buf;
  try { if ((await stat(file)).size > 0) buf = await readFile(file); } catch {}
  if (!buf) {
    const res = await fetch(`https://data.binance.vision/data/futures/um/daily/metrics/BTCUSDT/BTCUSDT-metrics-${date}.zip`);
    if (!res.ok) { console.log("no metrics", date, res.status); continue; }
    buf = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buf);
  }
  for (const line of unzipSingle(buf).toString("latin1").split("\n")) {
    const c = line.trim().split(",");
    if (!/^\d/.test(c[0] ?? "")) continue;
    oi.push([Date.parse(c[0].replace(" ", "T") + "Z"), +c[2]]);
  }
}
oi.sort((a, b) => a[0] - b[0]);
console.log("klines", k.length, "oi", oi.length, new Date(oi[0][0]).toISOString(), new Date(oi.at(-1)[0]).toISOString());

const rows = k.map(([t, o, h, l, c, v]) => [t, o, h, l, c, [[Math.floor((h + l + c) / 3 / LBIN), v / 2, v / 2]]]);
const wipes = new Map();
const map = buildLiqMap(rows, LBIN, oi, { onStep: (t, w) => wipes.set(t, w) });
const allW = [...wipes.values()].flatMap((w) => [w.wipedLong, w.wipedShort]).filter((x) => x > 0).sort((a, b) => a - b);
const pct = (x) => { let a = 0, b = allW.length; while (a < b) { const m = (a + b) >> 1; if (allW[m] < x) a = m + 1; else b = m; } return a / allW.length; };

// Swing pivots on 1h bars (±12 h), for S/R flips
const H = 3_600_000, hourly = new Map();
for (const [t, , h, l, c] of k) {
  const ht = Math.floor(t / H) * H;
  const x = hourly.get(ht);
  if (!x) hourly.set(ht, { t: ht, h, l, c }); else { x.h = Math.max(x.h, h); x.l = Math.min(x.l, l); x.c = c; }
}
const hb = [...hourly.values()];
const pivots = [];
for (let i = 12; i < hb.length - 12; i++) {
  const w = hb.slice(i - 12, i + 13);
  if (hb[i].h === Math.max(...w.map((x) => x.h))) pivots.push({ t: hb[i].t, p: hb[i].h, kind: "high" });
  if (hb[i].l === Math.min(...w.map((x) => x.l))) pivots.push({ t: hb[i].t, p: hb[i].l, kind: "low" });
}
// confirmed only 12 h after; a flip = later an hourly close ≥0.3 % through it
for (const pv of pivots) {
  pv.known = pv.t + 13 * H;
  const brk = hb.find((x) => x.t > pv.known && (pv.kind === "high" ? x.c > pv.p * 1.003 : x.c < pv.p * 0.997));
  pv.flipT = brk ? brk.t + H : null;
}

const START = Date.parse("2026-07-20T00:00:00Z");
const EXCLUDE = ["2026-08-24T13:46", "2026-08-27T13:48", "2026-08-28T01:33", "2026-09-24T14:53", "2026-10-05T14:09", "2026-10-15T02:28", "2026-10-16T17:34"].map((s) => Date.parse(s + ":00Z"));
const PRE = 60, POST = 30, HOLD = 240;
const events = [];
for (let i = PRE; i < k.length - HOLD; i++) {
  const [t, , h, l] = k[i];
  if (t < START || EXCLUDE.some((x) => Math.abs(x - t) < 12 * H)) continue;
  for (const side of ["top", "bottom"]) {
    const top = side === "top", ext = top ? h : l;
    let isExt = true;
    for (let j = i - PRE; j <= i + POST && isExt; j++) if (j !== i && (top ? k[j][2] > ext || (k[j][2] === ext && j < i) : k[j][3] < ext || (k[j][3] === ext && j < i))) isExt = false;
    if (!isExt) continue;
    let preP = top ? Infinity : -Infinity;
    for (let j = i - PRE; j < i; j++) preP = top ? Math.min(preP, k[j][3]) : Math.max(preP, k[j][2]);
    const approach = Math.abs(ext - preP) / preP;
    let rev = 0, revT = 0;
    for (let j = i + 1; j <= i + POST; j++) { const m = top ? (ext - k[j][3]) / ext : (k[j][2] - ext) / ext; if (m > rev) { rev = m; revT = j - i; } }
    let held = true, far = 0;
    for (let j = i + 1; j <= i + HOLD; j++) {
      if (top ? k[j][2] > ext : k[j][3] < ext) { held = false; break; }
      far = Math.max(far, top ? (ext - k[j][3]) / ext : (k[j][2] - ext) / ext);
    }
    if (!held || rev < 0.007 || approach < 0.005) continue;
    const tags = [];
    // liquidation sweep: estimated longs (for a bottom) / shorts (for a top) wiped in the 5-min steps around the extreme
    let wiped = 0;
    for (let s = Math.floor((t - 10 * MIN) / (5 * MIN)) * 5 * MIN; s <= t + 10 * MIN; s += 5 * MIN) { const w = wipes.get(s); if (w) wiped += top ? w.wipedShort : w.wipedLong; }
    // largest cluster the move ran into, from the snapshot before the run started
    let cluster = null;
    const snap = stepAt(map, t - PRE * MIN);
    if (snap) {
      const arr = top ? snap.short : snap.long;
      const a = Math.floor((Math.min(preP, ext) - map.lo) / LBIN), b = Math.floor((Math.max(preP, ext) - map.lo) / LBIN);
      let best = -1;
      for (let x = a; x <= b; x++) if (arr[x] > (best >= 0 ? arr[best] : 0)) best = x;
      if (best >= 0) {
        // nearby total within ±$150
        let near = 0; for (let x = best - 6; x <= best + 6; x++) near += arr[x] ?? 0;
        cluster = { price: map.lo + best * LBIN + LBIN / 2, qty: near };
      }
    }
    if (wiped > 0 && pct(wiped / 3) > 0.97) tags.push({ name: "爆倉清算", wiped: Math.round(wiped), cluster });
    // S/R flip: a broken pivot retested from the other side (old resistance now support, or vice versa)
    for (const pv of pivots) {
      if (!pv.flipT || pv.flipT > t || t - pv.flipT > 10 * DAY) continue;
      const flipSide = pv.kind === "high" ? "bottom" : "top"; // old high → support, old low → resistance
      if (side !== flipSide) continue;
      const gap = top ? (ext - pv.p) / pv.p : (pv.p - ext) / pv.p;
      if (gap >= -0.0015 && gap <= 0.003) tags.push({ name: pv.kind === "high" ? "壓力轉支撐" : "支撐轉壓力", level: pv.p, pivotT: pv.t, flipT: pv.flipT, gap });
    }
    if (!tags.length) continue;
    const delta = (a, b) => k.slice(a, b).reduce((s, x) => s + 2 * x[6] - x[5], 0);
    events.push({ t, side, ext, approach, rev, revT, far, tags, dIn: delta(i - 15, i + 1), dOut: delta(i + 1, i + 16), volSpike: k[i][5] / (k.slice(i - 60, i).reduce((s, x) => s + x[5], 0) / 60) });
  }
}
const tpe = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
for (const e of events) e.score = (e.rev * 100) / Math.sqrt(e.revT) + e.far * 30 + e.tags.length * 0.3;
events.sort((a, b) => b.score - a.score);
console.log("events", events.length);
for (const e of events.slice(0, 30))
  console.log(
    `${tpe(e.t)} ${e.side === "top" ? "頂" : "底"} ${e.ext.toFixed(0)} | ` +
      e.tags.map((g) => (g.name === "爆倉清算" ? `爆倉清算 ~${g.wiped}顆${g.cluster ? ` 叢集@${g.cluster.price.toFixed(0)}(${g.cluster.qty.toFixed(0)})` : ""}` : `${g.name} ${g.level.toFixed(0)}(樞紐 ${tpe(g.pivotT)}, 突破 ${tpe(g.flipT)})`)).join("; ") +
      ` | 來勢 ${(e.approach * 100).toFixed(1)}% 反轉 ${(e.rev * 100).toFixed(2)}%/${e.revT}m 4h ${(e.far * 100).toFixed(1)}% | Δin ${e.dIn.toFixed(0)} Δout ${e.dOut.toFixed(0)} 量比 ${e.volSpike.toFixed(1)}`,
  );
await writeFile(new URL("events2.json", DIR), JSON.stringify(events, null, 1));
