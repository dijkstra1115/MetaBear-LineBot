// Strategies A–E as written, every signal, on 2025-11-16 → 2026-06-30 and 2026-07-01 → 11-03; then
// every signal of every rule taken the other way (the stop becomes the target and the target the
// stop), to show the losses are fees, not a wrong direction.
//
//   node scripts/strategy-research/ae-baseline.mjs
import { aeTrades, at, loadOhlc, simulate, wallTrades } from "./lib.mjs";

const ohlc = loadOhlc();
const P = { train: [Date.parse("2025-11-16T00:00:00Z"), Date.parse("2026-07-01T00:00:00Z")], test: [Date.parse("2026-07-01T00:00:00Z"), Date.parse("2026-11-04T00:00:00Z")] };
const ae = aeTrades();
const inP = ([a, b]) => (x) => x.entryT >= a && x.entryT < b;
const f = (xs) => {
  const n = xs.length, g = xs.reduce((s, x) => s + x.gross, 0), net = xs.reduce((s, x) => s + x.net, 0);
  return `${String(n).padStart(4)} 筆 勝 ${String(Math.round((100 * xs.filter((x) => x.net > 0).length) / (n || 1))).padStart(2)}% 扣費前/筆 ${(g / (n || 1)).toFixed(3).padStart(6)}R 扣費後/筆 ${(net / (n || 1)).toFixed(3).padStart(6)}R 合計 ${net.toFixed(1).padStart(6)}R`;
};
const sim = (xs) => xs.map((x) => simulate(ohlc, x)).filter(Boolean);
console.log("A～E 原參數，每個訊號都開（24 小時逾時）");
for (const s of ["A", "B-hold", "B-flip", "C", "D", "E"]) {
  const xs = ae.filter((x) => (s.startsWith("B") ? x.src === s : x.strat === s));
  console.log(`  ${s.padEnd(6)} 訓練 ${f(sim(xs.filter(inP(P.train))))} | 驗證 ${f(sim(xs.filter(inP(P.test))))}`);
}
const risk = (s) => {
  const xs = ae.filter((x) => x.strat === s);
  return `${s} ${((xs.reduce((a, x) => a + Math.abs(x.entry - x.stop) / x.entry, 0) / xs.length) * 100).toFixed(2)}%`;
};
console.log(`  平均停損距離：${["A", "B", "C", "D", "E"].map(risk).join("、")}`);

// Results in units of the original risk, so both ways are the same position size.
console.log("\n反著做（同一部位大小）");
const flip = (x) => ({ ...x, dir: x.dir === "long" ? "short" : "long", stop: x.tp, tp: x.stop });
function both(name, xs, period) {
  let n = 0, og = 0, on = 0, rg = 0, rn = 0;
  for (const x of xs.filter(inP(period))) {
    const o = simulate(ohlc, x), r = simulate(ohlc, flip(x));
    if (!o || !r) continue;
    const k = Math.abs(x.entry - x.tp) / Math.abs(x.entry - x.stop);
    n++, (og += o.gross), (on += o.net), (rg += r.gross * k), (rn += r.net * k);
  }
  console.log(`  ${name.padEnd(8)} ${String(n).padStart(4)} 筆 | 原方向 扣費前 ${og.toFixed(1).padStart(7)}R 扣費後 ${on.toFixed(1).padStart(7)}R | 反著做 扣費前 ${rg.toFixed(1).padStart(7)}R 扣費後 ${rn.toFixed(1).padStart(7)}R`);
}
const wall = wallTrades();
both("牆 7/20～9/30", wall, [at("2026-07-20T00:00:00"), at("2026-10-01T00:00:00")]);
both("牆 10 月", wall, [at("2026-10-01T00:00:00"), at("2026-11-01T00:00:00")]);
for (const s of "ABCDE") for (const [k, p] of Object.entries(P)) both(`${s} ${k === "train" ? "訓練" : "驗證"}`, ae.filter((x) => x.strat === s), p);
