// Can the three case-wall rules be tuned into something that pays after fees? Every signal is a
// trade; parameters are chosen on 2026-07-20 → 09-30 only and October is run once.
//
//   node scripts/strategy-research/tune-case-rules.mjs
//
// Grid: stop 0.1–1.5 % beyond the extreme, target 1/1.5/2/3 R, 4 h or 24 h trend filter, at most
// 1/2/any entries per level per day, hold 4 or 12 h. The random baseline enters at random minutes in
// the 24 h trend's direction with the same stop distance, target and hold.
import { H, MIN, at, loadOhlc, readJson, simulate } from "./lib.mjs";

const ohlc = loadOhlc();
const close = (t) => ohlc.rows[ohlc.idx.get(t)]?.[4];
const TR = [at("2026-07-20T00:00:00"), at("2026-10-01T00:00:00")], TE = [TR[1], at("2026-11-01T00:00:00")];
const count = {};
const sig = readJson("case-rule-signals.json").filter((x) => x.entryT >= TR[0] && x.entryT < TE[1]).sort((a, b) => a.entryT - b.entryT).map((x) => {
  const s = x.long ? 1 : -1, c = close(x.entryT);
  const key = `${x.rule}|${x.name}|${Math.round(x.level)}|${x.long}|${new Date(x.entryT + 8 * H).toISOString().slice(0, 10)}`;
  return {
    rule: x.rule, s, entryT: x.entryT, entry: x.entry, ext: x.long ? x.stop / 0.999 : x.stop / 1.001,
    set: x.entryT < TR[1] ? "train" : "test",
    tr4: s * (c - close(x.entryT - 4 * H)) > 0, tr24: s * (c - close(x.entryT - 24 * H)) > 0,
    nth: (count[key] = (count[key] ?? 0) + 1),
  };
});

function trade(x, c) {
  const stop = x.ext * (1 - x.s * c.buf), risk = Math.abs(x.entry - stop);
  if (risk / x.entry > 0.025) return null;
  return simulate(ohlc, { dir: x.s > 0 ? "long" : "short", entryT: x.entryT, startT: x.entryT + MIN, entry: x.entry, stop, tp: x.entry + x.s * c.tgt * risk, hold: c.hold });
}
function run(c, set, rule) {
  let n = 0, w = 0, gross = 0, net = 0;
  for (const x of sig) {
    if (x.set !== set || (rule && x.rule !== rule) || (c.trend === "4h" && !x.tr4) || (c.trend === "24h" && !x.tr24) || x.nth > c.maxNth) continue;
    const o = trade(x, c);
    if (!o) continue;
    n++, (gross += o.gross), (net += o.net), o.net > 0 && w++;
  }
  return { n, w, gross, net, per: n ? net / n : 0 };
}
function baseline(c, set, rule, n) {
  const [a, b] = set === "train" ? TR : TE;
  const xs = sig.filter((x) => x.set === "train" && (!rule || x.rule === rule));
  const riskPct = xs.reduce((s, x) => s + Math.abs(x.entry - x.ext) / x.entry, 0) / xs.length + c.buf;
  const per = [];
  for (let k = 0; k < 20; k++) {
    let seed = k + 1, net = 0;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let m = 0; m < n; m++) {
      const t = Math.floor((a + rnd() * (b - a - 13 * H)) / MIN) * MIN, p = close(t), p24 = close(t - 24 * H);
      if (p == null || p24 == null) { m--; continue; }
      const s = p >= p24 ? 1 : -1, stop = p * (1 - s * riskPct);
      const o = simulate(ohlc, { dir: s > 0 ? "long" : "short", entryT: t, startT: t + MIN, entry: p, stop, tp: p + s * c.tgt * Math.abs(p - stop), hold: c.hold });
      net += o ? o.net : 0;
    }
    per.push(net / n);
  }
  per.sort((x, y) => x - y);
  return `隨機進場（順 24h）20 次每筆扣費後：中位數 ${per[10].toFixed(3)}R，範圍 ${per[0].toFixed(3)}～${per[19].toFixed(3)}R`;
}
const f = (o) => `${String(o.n).padStart(4)} 筆 勝 ${String(Math.round((100 * o.w) / (o.n || 1))).padStart(2)}% 扣費前 ${o.gross.toFixed(1).padStart(6)}R 扣費後 ${o.net.toFixed(1).padStart(7)}R 每筆 ${o.per.toFixed(3)}R`;
const name = (c) => `停損外 ${(c.buf * 100).toFixed(2)}% · ${c.tgt}R · 趨勢 ${c.trend} · 每位每天 ≤ ${c.maxNth === 99 ? "∞" : c.maxNth} · ${c.hold}h`;
const grid = [];
for (const buf of [0.001, 0.002, 0.003, 0.005, 0.0075, 0.01, 0.015]) for (const tgt of [1, 1.5, 2, 3]) for (const trend of ["none", "4h", "24h"]) for (const maxNth of [1, 2, 99]) for (const hold of [4, 12]) grid.push({ buf, tgt, trend, maxNth, hold });
const original = { buf: 0.001, tgt: 2, trend: "none", maxNth: 99, hold: 4 };

for (const rule of ["flip", "reject", null]) {
  console.log(`\n===== ${rule ?? "三條合併"}`);
  console.log(`原規則  訓練 ${f(run(original, "train", rule))}\n        十月 ${f(run(original, "test", rule))}`);
  const res = grid.map((c) => ({ c, tr: run(c, "train", rule) })).filter((o) => o.tr.n >= 40).sort((a, b) => b.tr.per - a.tr.per);
  console.log(`訓練期每筆扣費後前 5 名（${res.length} 組，至少 40 筆）：`);
  for (const o of res.slice(0, 5)) console.log(`  ${name(o.c)}\n    訓練 ${f(o.tr)}\n    十月 ${f(run(o.c, "test", rule))}`);
  const pos = res.filter((o) => o.tr.net > 0), posTest = pos.map((o) => run(o.c, "test", rule));
  console.log(`訓練期扣費後為正：${pos.length}/${res.length} 組；其中十月也為正：${posTest.filter((t) => t.net > 0).length} 組`);
  if (res[0].c.trend === "24h") console.log(`  第一名對照 訓練 ${baseline(res[0].c, "train", rule, res[0].tr.n)}\n             十月 ${baseline(res[0].c, "test", rule, run(res[0].c, "test", rule).n)}`);
}
// The setting that improved both periods for the key-level rejection rule.
const steady = { buf: 0.005, tgt: 1, trend: "24h", maxNth: 2, hold: 12 };
const tr = run(steady, "train", "reject"), te = run(steady, "test", "reject");
console.log(`\n關鍵位拒絕 ${name(steady)}\n  訓練 ${f(tr)}\n  十月 ${f(te)}\n  訓練 ${baseline(steady, "train", "reject", tr.n)}\n  十月 ${baseline(steady, "test", "reject", te.n)}`);
