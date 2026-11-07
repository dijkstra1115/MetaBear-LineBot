// Why October lost: the case-wall rules' trades from october-list.mjs broken down by stop size,
// fees, how far they ran before the stop, trend, repeat entries, level and session, plus the same
// rules month by month since July.
//
//   node scripts/strategy-research/diagnose.mjs
import { H, MIN, at, loadOhlc, readJson, simulate, wallTrades } from "./lib.mjs";

const ohlc = loadOhlc();
const { rows, idx } = ohlc;
const close = (t) => rows[idx.get(t)]?.[4];
const wall = readJson("october-all.json").filter((x) => x.startT);
for (const x of wall) {
  const s = x.dir === "long" ? 1 : -1, risk = Math.abs(x.entry - x.stop);
  let mfe = 0, mfe4 = 0;
  for (let j = idx.get(x.startT); j < rows.length && rows[j][0] < x.entryT + 4 * H; j++) {
    const fav = (s * ((s > 0 ? rows[j][2] : rows[j][3]) - x.entry)) / risk;
    mfe4 = Math.max(mfe4, fav);
    if (rows[j][0] < x.exitT - MIN) mfe = Math.max(mfe, fav);
  }
  Object.assign(x, { mfe, mfe4, holdMin: (x.exitT - x.startT) / MIN, hour: new Date(x.entryT + 8 * H).getUTCHours() });
  x.with4 = s * (close(x.entryT) - close(x.entryT - 4 * H)) > 0;
  x.with24 = s * (close(x.entryT) - close(x.entryT - 24 * H)) > 0;
}
const st = (ys) => {
  const n = ys.length, w = ys.filter((y) => y.gross > 0).length, g = ys.reduce((a, y) => a + y.gross, 0), net = ys.reduce((a, y) => a + y.net, 0);
  return `${String(n).padStart(3)} 筆 勝率 ${String(n ? Math.round((100 * w) / n) : 0).padStart(2)}% 扣費前 ${g.toFixed(1).padStart(6)}R（每筆 ${(g / (n || 1)).toFixed(2)}R） 扣費後 ${net.toFixed(1).padStart(7)}R`;
};
const pr = (k, ys) => console.log(`  ${k.padEnd(16)} ${st(ys)}`);
const fee = wall.reduce((a, x) => a + x.fee, 0) / wall.length;
console.log(`案例牆三條，十月每個訊號：${st(wall)}`);
console.log(`  平均停損 ${(wall.reduce((a, x) => a + x.riskPct, 0) / wall.length).toFixed(3)}%，手續費每筆 ${fee.toFixed(2)}R，2R 含費打平勝率約 ${((100 * (1 + fee)) / 3).toFixed(1)}%`);
console.log("\n依停損距離");
for (const [a, b] of [[0, 0.15], [0.15, 0.2], [0.2, 0.25], [0.25, 0.35], [0.35, 3]]) pr(`${a}–${b}%`, wall.filter((x) => x.riskPct >= a && x.riskPct < b));
const stops = wall.filter((x) => x.result === "stop");
console.log(`\n停損 ${stops.length} 筆：多快被打 ${[[0, 5], [5, 15], [15, 30], [30, 60], [60, 241]].map(([a, b]) => `${a}–${b} 分 ${stops.filter((x) => x.holdMin > a && x.holdMin <= b).length}`).join("、")}`);
console.log(`  停損前最多走到：${[[0, 0.5], [0.5, 1], [1, 1.5], [1.5, 2]].map(([a, b]) => `${a}–${b}R ${stops.filter((x) => x.mfe >= a && x.mfe < b).length}`).join("、")}`);
console.log(`  停損後 4 小時內又走到 +2R：${stops.filter((x) => x.mfe4 >= 2).length}`);
console.log("\n方向與趨勢");
pr("做多", wall.filter((x) => x.dir === "long"));
pr("做空", wall.filter((x) => x.dir === "short"));
pr("順 4h", wall.filter((x) => x.with4));
pr("逆 4h", wall.filter((x) => !x.with4));
pr("順 24h", wall.filter((x) => x.with24));
pr("逆 24h", wall.filter((x) => !x.with24));
console.log("\n同一關鍵位同一天第幾次進場");
const n = {};
for (const x of [...wall].sort((a, b) => a.entryT - b.entryT)) {
  const k = `${x.src}|${x.what}|${x.dir}|${new Date(x.entryT + 8 * H).toISOString().slice(0, 10)}`;
  x.nth = n[k] = (n[k] ?? 0) + 1;
}
pr("第 1 次", wall.filter((x) => x.nth === 1));
pr("第 2 次", wall.filter((x) => x.nth === 2));
pr("第 3 次以後", wall.filter((x) => x.nth >= 3));
console.log("\n關鍵位拒絕：依關鍵位");
for (const k of ["前日高", "前日低", "前日POC", "前日VAH", "前日VAL", "週高", "週低"]) pr(k, wall.filter((x) => x.src === "reject" && x.what.startsWith(k)));
console.log("\n時段（台北）");
for (const [a, b, k] of [[0, 3, "00–03"], [3, 9, "03–09"], [9, 15, "09–15"], [15, 21, "15–21"], [21, 24, "21–24"]]) pr(k, wall.filter((x) => x.hour >= a && x.hour < b));
console.log("\n同樣三條規則，每月（每個訊號都開）");
const all = wallTrades();
for (const m of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
  const a = m === "2026-07" ? at("2026-07-20T00:00:00") : at(`${m}-01T00:00:00`), [y, mo] = m.split("-").map(Number);
  const b = at(`${y}-${String(mo + 1).padStart(2, "0")}-01T00:00:00`);
  pr(m, all.filter((x) => x.entryT >= a && x.entryT < b).map((x) => ({ ...x, ...simulate(ohlc, x) })));
}
