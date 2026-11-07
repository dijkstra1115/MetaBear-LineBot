// Does any order-flow reading predict the next 1/4/12 hours? 21 features every five minutes (data
// up to that moment only), ranked against forward returns on 2025-11-16 → 2026-06-30 and checked on
// 2026-07-01 → 11-03 with the train quintile cuts.
//
//   node --max-old-space-size=14000 scripts/strategy-research/features.mjs [--build]
//
// --build (or a missing .data/orderflow/research/features.json) recomputes the features.
import { existsSync, writeFileSync } from "node:fs";
import { fromArchive, readingsAt } from "../../public/lab/orderflow/metrics.js";
import { DAY, H, MIN, OUT, flag, loadArchives, readJson } from "./lib.mjs";

const TF = 5 * MIN;
if (flag("build") || !existsSync(`${OUT}features.json`)) {
  const { rows, metrics, tick } = loadArchives();
  const readings = fromArchive(metrics).sort((a, b) => a[0] - b[0]);
  const bars = [];
  const day = new Map();
  for (const r of rows) {
    const t = Math.floor(r[0] / TF) * TF;
    let b = bars.at(-1);
    if (!b || b.t !== t) bars.push((b = { t, h: r[2], l: r[3], c: r[4], buy: 0, sell: 0 }));
    (b.h = Math.max(b.h, r[2])), (b.l = Math.min(b.l, r[3])), (b.c = r[4]);
    const d = Math.floor(r[0] / DAY);
    let x = day.get(d);
    if (!x) day.set(d, (x = { h: -Infinity, l: Infinity, v: new Map() }));
    (x.h = Math.max(x.h, r[2])), (x.l = Math.min(x.l, r[3]));
    for (const [bin, bu, se] of r[5]) (b.buy += bu), (b.sell += se), x.v.set(bin, (x.v.get(bin) ?? 0) + bu + se);
  }
  for (const x of day.values()) {
    let best = -1;
    for (const [bin, v] of x.v) if (v > best) (best = v), (x.poc = bin * tick + tick / 2);
    delete x.v;
  }
  // readingsAt only walks forward, so each lag gets its own walker.
  const [at0, at1, at4, at24] = [0, 1, 2, 3].map(() => readingsAt(readings));
  const pre = { buy: [0], sell: [0] };
  for (const b of bars) pre.buy.push(pre.buy.at(-1) + b.buy), pre.sell.push(pre.sell.at(-1) + b.sell);
  const sum = (k, i, n) => pre[k][i + 1] - pre[k][i + 1 - n];
  const out = [];
  for (let i = 288; i < bars.length; i++) {
    const b = bars[i], t = b.t + TF; // decided at the bar's close
    if (bars[i - 288].t !== b.t - 288 * TF) continue;
    const c = b.c, ago = (n) => bars[i - n].c;
    const vol = (n) => sum("buy", i, n) + sum("sell", i, n);
    const dl = (n) => (sum("buy", i, n) - sum("sell", i, n)) / (vol(n) || 1);
    let hi = -Infinity, lo = Infinity;
    for (let j = i - 11; j <= i; j++) (hi = Math.max(hi, bars[j].h)), (lo = Math.min(lo, bars[j].l));
    const m = at0(t), m1 = at1(t - H), m4 = at4(t - 4 * H), m24 = at24(t - DAY), pd = day.get(Math.floor(b.t / DAY) - 1);
    const f = {
      t, r1h: Math.log(c / ago(12)), r4h: Math.log(c / ago(48)), r24h: Math.log(c / ago(288)),
      d1h: dl(12), d4h: dl(48), d24h: dl(288),
      vz: Math.log(vol(12) / (vol(288) / 24)), eff: Math.log((hi - lo) / c / (vol(12) || 1) + 1e-12),
      oi1h: m && m1 ? m[1] / m1[1] - 1 : null, oi4h: m && m4 ? m[1] / m4[1] - 1 : null, oi24h: m && m24 ? m[1] / m24[1] - 1 : null,
      topPos: m ? Math.log(m[3]) : null, topAcc: m ? Math.log(m[4]) : null, glob: m ? Math.log(m[5]) : null, taker: m ? Math.log(m[6]) : null,
      glob24: m && m24 ? Math.log(m[5] / m24[5]) : null, topPos24: m && m24 ? Math.log(m[3] / m24[3]) : null,
      dPoc: pd ? Math.log(c / pd.poc) : null, dHi: pd ? Math.log(c / pd.h) : null, dLo: pd ? Math.log(c / pd.l) : null,
    };
    f.oiXr4 = f.oi4h != null ? f.oi4h * Math.sign(f.r4h) : null;
    for (const [k, n] of [["f1h", 12], ["f4h", 48], ["f12h", 144]]) f[k] = i + n < bars.length && bars[i + n].t === b.t + n * TF ? Math.log(bars[i + n].c / c) : null;
    out.push(f);
  }
  writeFileSync(`${OUT}features.json`, JSON.stringify(out));
  console.log(`features.json: ${out.length} samples`);
}

const xs = readJson("features.json");
const TE0 = Date.parse("2026-07-01T00:00:00Z");
const tr = xs.filter((x) => x.t >= Date.parse("2025-11-16T00:00:00Z") && x.t < TE0), te = xs.filter((x) => x.t >= TE0);
const FEATS = ["r1h", "r4h", "r24h", "d1h", "d4h", "d24h", "vz", "eff", "oi1h", "oi4h", "oi24h", "oiXr4", "topPos", "topAcc", "glob", "taker", "glob24", "topPos24", "dPoc", "dHi", "dLo"];
const rank = (a) => {
  const r = new Array(a.length);
  a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]).forEach(([, i], k) => (r[i] = k));
  return r;
};
const corr = (a, b) => {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) (ab += (a[i] - ma) * (b[i] - mb)), (aa += (a[i] - ma) ** 2), (bb += (b[i] - mb) ** 2);
  return ab / Math.sqrt(aa * bb);
};
const bp = (v) => (v * 1e4).toFixed(1).padStart(6);
for (const Hk of ["f1h", "f4h", "f12h"]) {
  const mean = (s) => s.reduce((a, x) => a + (x[Hk] ?? 0), 0) / s.length;
  console.log(`\n目標 ${Hk}（bps），市場平均 訓練 ${bp(mean(tr))} 驗證 ${bp(mean(te))}；欄位：Q1..Q5、Q5−Q1、IC`);
  for (const k of FEATS) {
    const a = tr.filter((x) => x[k] != null && x[Hk] != null), b = te.filter((x) => x[k] != null && x[Hk] != null);
    const v = a.map((x) => x[k]).sort((p, q) => p - q), cut = [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.floor(q * v.length)]);
    const row = (set) => {
      const s = [0, 0, 0, 0, 0], n = [0, 0, 0, 0, 0];
      for (const x of set) {
        const j = cut.filter((c) => x[k] > c).length;
        (s[j] += x[Hk]), n[j]++;
      }
      const m = s.map((v, j) => v / (n[j] || 1));
      return `${m.map(bp).join("")} ${bp(m[4] - m[0])} ${corr(rank(set.map((x) => x[k])), rank(set.map((x) => x[Hk]))).toFixed(3).padStart(6)}`;
    };
    console.log(`  ${k.padEnd(9)} 訓練 ${row(a)} | 驗證 ${row(b)}`);
  }
}

// The features whose sign held in both periods, all contrarian, as one score; only its extremes.
const PARTS = ["r4h", "d4h", "dPoc", "r1h"];
const z = Object.fromEntries(PARTS.map((k) => {
  const v = tr.map((x) => x[k]).filter((v) => v != null), m = v.reduce((a, b) => a + b, 0) / v.length;
  return [k, [m, Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)]];
}));
for (const x of xs) x.score = PARTS.every((k) => x[k] != null) ? -PARTS.reduce((a, k) => a + (x[k] - z[k][0]) / z[k][1], 0) / PARTS.length : null;
const sv = tr.map((x) => x.score).filter((v) => v != null).sort((a, b) => a - b);
const side = (set, lo, hi, Hk, keep = () => true) => {
  let s = 0, n = 0;
  for (const x of set) {
    if (x.score == null || x[Hk] == null || !keep(x)) continue;
    if (x.score >= hi) (s += x[Hk]), n++;
    else if (x.score <= lo) (s -= x[Hk]), n++;
  }
  return `${bp(s / (n || 1))} bps（${n}）`;
};
console.log(`\n合成分數 −平均 z（${PARTS.join(", ")}），分數高做多、低做空，順分數方向的平均報酬：`);
for (const p of [0.01, 0.02, 0.05, 0.1]) {
  const lo = sv[Math.floor(p * sv.length)], hi = sv[Math.floor((1 - p) * sv.length)];
  for (const Hk of ["f1h", "f4h", "f12h"]) console.log(`  前後 ${String(p * 100).padStart(2)}% ${Hk.padEnd(4)} 訓練 ${side(tr, lo, hi, Hk)} 驗證 ${side(te, lo, hi, Hk)}`);
}
const av = tr.map((x) => Math.abs(x.r24h)).sort((a, b) => a - b), q = [0.2, 0.4, 0.6, 0.8].map((p) => av[Math.floor(p * av.length)]);
const lo = sv[Math.floor(0.05 * sv.length)], hi = sv[Math.floor(0.95 * sv.length)];
console.log("\n依 24h 漲跌幅分組（Q1 最平靜），分數前後 5%，4 小時：");
for (let g = 0; g < 5; g++) {
  const keep = (x) => q.filter((c) => Math.abs(x.r24h) > c).length === g;
  console.log(`  Q${g + 1} 訓練 ${side(tr, lo, hi, "f4h", keep)} 驗證 ${side(te, lo, hi, "f4h", keep)}`);
}
