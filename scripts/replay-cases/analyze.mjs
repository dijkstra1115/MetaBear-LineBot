// Rebuilds the footprint and OI around chosen reversals and derives the reasons and two entries.
// Needs case-<UTC day>.json from scripts/orderflow-data.mjs for each case's day.
//
//   node scripts/replay-cases/analyze.mjs --events events.json --out cases.json "08-24 21:46" "10-05 22:09"
//   node scripts/replay-cases/analyze.mjs --events events2.json --out cases2.json "09-14 21:08"
//
// Keys are Taipei times as printed by the scan scripts.
import { readFile, writeFile } from "node:fs/promises";
const DIR = new URL("../../.data/orderflow/replay-cases/", import.meta.url);
const REPO = new URL("../../.data/orderflow/", import.meta.url);
const MIN = 60_000, DAY = 86_400_000;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv.splice(i, 2)[1] : d; };
const EVENTS = opt("events", "events.json"), OUT = opt("out", "cases.json");
const events = JSON.parse(await readFile(new URL(EVENTS, DIR), "utf8"));
const kl = JSON.parse(await readFile(new URL("klines.json", DIR), "utf8"));
const kIdx = new Map(kl.map((x, i) => [x[0], i]));
const tpe = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(5, 16).replace("T", " ");
const PICK = argv;
const out = [];

for (const key of PICK) {
  const e = events.find((x) => tpe(x.t) === key);
  const day = new Date(e.t).toISOString().slice(0, 10);
  const raw = JSON.parse(await readFile(new URL(`case-${day}.json`, REPO), "utf8"));
  const tick = raw.tick;
  const bars = new Map(raw.bars.map(([t, o, h, l, c, lv]) => {
    let buy = 0, sell = 0;
    for (const [, b, s] of lv) { buy += b; sell += s; }
    return [t, { t, o, h, l, c, lv, buy, sell, d: buy - sell }];
  }));
  const top = e.side === "top", dir = top ? -1 : 1; // trade direction after the reversal
  // scan-levels events carry hits (named levels); scan-liq-flip events carry tags
  const tag = e.tags?.[0];
  const lvl = e.hits ? e.hits[0] : { lv: tag.name === "爆倉清算" ? null : tag.level };
  const at = (m) => bars.get(e.t + m * MIN);
  const range = (a, b) => { const r = []; for (let m = a; m <= b; m++) { const x = at(m); if (x) r.push(x); } return r; };
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

  // Absorption: aggressive volume in the 0.15 % zone at the extreme, last 15 min into it
  const zone = e.ext * 0.0015;
  let zBuy = 0, zSell = 0;
  for (const b of range(-15, 2)) for (const [bin, bu, se] of b.lv) {
    const p = bin * tick + tick / 2;
    if (top ? p >= e.ext - zone : p <= e.ext + zone) { zBuy += bu; zSell += se; }
  }
  // CVD divergence: earlier probe within 90 min that came within 0.3 % of the extreme
  const cvd = []; let c = 0;
  for (const b of range(-120, 240)) { c += b.d; cvd.push({ t: b.t, c, h: b.h, l: b.l }); }
  const iExt = cvd.findIndex((x) => x.t === e.t);
  let div = null;
  for (let j = iExt - 10; j >= Math.max(0, iExt - 90); j--) {
    const p = cvd[j];
    const close = top ? p.h >= e.ext * 0.997 : p.l <= e.ext * 1.003;
    if (close) {
      const priceMore = top ? e.ext > p.h : e.ext < p.l;
      const cvdLess = top ? cvd[iExt].c < p.c : cvd[iExt].c > p.c;
      if (priceMore && cvdLess) div = { t: p.t, price: top ? p.h : p.l, cvdThen: p.c, cvdNow: cvd[iExt].c };
      break;
    }
  }
  // Stacked imbalances after the extreme in the trade direction (≥3 diagonal, 3:1)
  let stacked = null;
  for (const b of range(0, 30)) {
    const m = new Map(b.lv.map(([bin, bu, se]) => [bin, [bu, se]]));
    const bins = [...m.keys()].sort((a, b) => a - b);
    let run = 0, best = 0;
    for (const bin of bins) {
      const [bu, se] = m.get(bin);
      const ok = dir > 0 ? bu >= 1 && bu >= 3 * (m.get(bin - 1)?.[1] ?? 0) : se >= 1 && se >= 3 * (m.get(bin + 1)?.[0] ?? 0);
      run = ok ? run + 1 : 0; best = Math.max(best, run);
    }
    if (best >= 3) { stacked = { t: b.t, run: best }; break; }
  }
  // OI: 30 min before vs at the extreme vs 30 min after (5-min readings)
  const oiAt = (t) => { let v = null; for (const m of raw.metrics) if (m[0] <= t) v = m[1]; return v; };
  const oi = { pre: oiAt(e.t - 60 * MIN), ext: oiAt(e.t), post: oiAt(e.t + 30 * MIN) };

  // Entry A (aggressive): first 1m close back on the trade side of the level, within 15 min, after the extreme.
  // Entry B (confirmation): first 5m close in trade direction with positive 5m delta in trade direction.
  const stop = top ? e.ext * 1.001 : e.ext * 0.999;
  const sim = (entryT, entry) => {
    const R = Math.abs(entry - stop);
    let mfe = 0, res = "timeout", exitT = null;
    for (let i = kIdx.get(entryT) + 1; i < kIdx.get(entryT) + 240; i++) {
      const [t, , h, l] = kl[i];
      if (top ? h >= stop : l <= stop) { res = "stop"; exitT = t; break; }
      mfe = Math.max(mfe, top ? (entry - l) / R : (h - entry) / R);
      if (mfe >= 2 && res === "timeout") { res = "2R"; exitT = t; }
      if (mfe >= 3) { res = "3R"; exitT = t; break; }
    }
    return { entryT, entry, stop, R, riskPct: (R / entry) * 100, res, exitT, mfe };
  };
  let A = null;
  // liquidation sweeps have no fixed line to reclaim: use the extreme bar's body edge instead
  const x0 = at(0);
  const ref = lvl.lv ?? (top ? Math.min(x0.o, x0.c) : Math.max(x0.o, x0.c));
  for (const b of range(1, 15)) if (top ? b.c < ref && b.d < 0 : b.c > ref && b.d > 0) { A = sim(b.t, b.c); break; }
  if (!A) for (const b of range(1, 15)) if (top ? b.c < e.ext * 0.997 : b.c > e.ext * 1.003) { A = { ...sim(b.t, b.c), note: "level not reclaimed by close; used 0.3% off extreme" }; break; }
  let B = null;
  for (let m = 0; m <= 30; m += 1) {
    const t5 = Math.floor((e.t + m * MIN) / (5 * MIN)) * 5 * MIN;
    if (t5 <= e.t) continue;
    const five = []; for (let j = 0; j < 5; j++) { const x = bars.get(t5 + j * MIN); if (x) five.push(x); }
    if (five.length < 5) continue;
    const o = five[0].o, cl = five[4].c, d5 = sum(five, (x) => x.d);
    if (dir * (cl - o) > 0 && dir * d5 > 0) { B = { ...sim(t5 + 4 * MIN, cl), d5 }; break; }
  }
  const rec = {
    key, side: e.side, ext: e.ext, levels: e.hits ? e.hits.map((h) => `${h.name} ${h.lv.toFixed(0)}`) : e.tags.map((g) => g.name === "爆倉清算" ? `爆倉清算 ~${g.wiped} 叢集@${g.cluster?.price}(${Math.round(g.cluster?.qty ?? 0)})` : `${g.name} ${g.level.toFixed(0)}`),
    approachPct: +(e.approach * 100).toFixed(2), revPct: +(e.rev * 100).toFixed(2), revMin: e.revT, far4hPct: +(e.far * 100).toFixed(2),
    deltaIn15: Math.round(sum(range(-15, 0), (x) => x.d)), deltaOut15: Math.round(sum(range(1, 15), (x) => x.d)),
    extBar: (({ o, h, l, c, buy, sell }) => ({ o, h, l, c, buy: Math.round(buy), sell: Math.round(sell) }))(at(0)),
    zone: { buy: Math.round(zBuy), sell: Math.round(zSell) }, div, stacked, oi,
    A, B,
  };
  out.push(rec);
  const f = (x) => x && `${tpe(x.entryT)} @${x.entry.toFixed(0)} SL ${x.stop.toFixed(0)} (${x.riskPct.toFixed(2)}%) → ${x.res}${x.exitT ? " " + tpe(x.exitT) : ""} MFE ${x.mfe.toFixed(1)}R${x.note ? " *" : ""}`;
  console.log(`\n## ${key} ${top ? "頂" : "底"} ${e.ext} | ${rec.levels.join(", ")}`);
  console.log(`  來勢 ${rec.approachPct}% 反轉 ${rec.revPct}%/${rec.revMin}m 4h ${rec.far4hPct}% | Δ前15 ${rec.deltaIn15} Δ後15 ${rec.deltaOut15}`);
  console.log(`  極值K ${JSON.stringify(rec.extBar)} | 極值區 主動買 ${rec.zone.buy} 主動賣 ${rec.zone.sell}`);
  console.log(`  CVD背離 ${div ? `${tpe(div.t)} ${div.price} cvd ${Math.round(div.cvdThen)}→${Math.round(div.cvdNow)}` : "無"} | 堆疊失衡 ${stacked ? `${tpe(stacked.t)} ×${stacked.run}` : "無"} | OI ${oi.pre}→${oi.ext}→${oi.post}`);
  console.log(`  A 激進 ${f(A) ?? "無"}`);
  console.log(`  B 確認 ${f(B) ?? "無"}`);
}
await writeFile(new URL(OUT, DIR), JSON.stringify(out, null, 1));
