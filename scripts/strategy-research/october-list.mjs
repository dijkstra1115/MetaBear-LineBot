// October 2026, every trade the rules would have taken, written as the two record documents:
//
//   node scripts/strategy-research/october-list.mjs           # eight rules, every signal → docs/REPLAY-CASES-2026-10-ALL.md
//   node scripts/strategy-research/october-list.mjs --merged  # three key-level families → docs/REPLAY-CASES-2026-10-MERGED.md
//
// Run export.mjs first. The interpretation lives in docs/STRATEGY-RESEARCH-2026-11.md; these
// documents are data only, so rerunning reproduces them.
import { writeFileSync } from "node:fs";
import { OUT, ROOT, aeTrades, at, flag, loadOhlc, signR, simulate, stamp, taipei, tally, wallTrades } from "./lib.mjs";

const FROM = at("2026-10-01T00:00:00"), TO = at("2026-11-01T00:00:00");
const ohlc = loadOhlc();
const LABEL = { flip: "牆・翻轉", reject: "牆・關鍵位拒絕", liq: "牆・爆倉叢集", A: "A 失敗拍賣", "B-hold": "B 吸收守住", "B-flip": "B 翻轉", C: "C 推升後回檔", D: "D 爆倉插針", E: "E 開盤區間" };
const hm = (t) => taipei(t).slice(11, 16);
const day = (t) => taipei(t).slice(5, 10);
const num = (v) => Math.round(v).toLocaleString("en-US");
const r2 = (v) => signR(v, 2);
const exitAt = (x) => (day(x.exitT) === day(x.entryT) ? hm(x.exitT) : stamp(x.exitT));
const result = (x) => (x.result === "tp" ? "✓ 止盈" : x.result === "stop" ? "✗ 停損" : "逾時");
const signals = [...aeTrades(), ...wallTrades()].filter((x) => x.entryT >= FROM && x.entryT < TO);
const days = (xs) => [...new Set(xs.map((x) => day(x.entryT)))];
const doc = (name, md) => {
  writeFileSync(`${ROOT}docs/${name}`, md);
  console.log(`docs/${name}`);
};

if (!flag("merged")) {
  // Eight rules, every signal on its own; a win is R > 0 before fees.
  const xs = signals.map((x) => ({ ...x, ...simulate(ohlc, x) })).sort((a, b) => a.entryT - b.entryT || a.src.localeCompare(b.src));
  writeFileSync(`${OUT}october-all.json`, JSON.stringify(xs));
  const t = (ys) => {
    const w = ys.filter((y) => y.gross > 0).length, g = ys.reduce((a, y) => a + y.gross, 0), n = ys.reduce((a, y) => a + y.net, 0);
    return { n: ys.length, w, l: ys.length - w, g, net: n };
  };
  let md = `# 十月全部訊號：案例牆三條＋A～E（2026-10-01～10-31）

由 \`scripts/strategy-research/october-list.mjs\` 產生，內部研究，不對外（[VISION.md](VISION.md) 原則 1）；分析見 [STRATEGY-RESEARCH-2026-11.md](STRATEGY-RESEARCH-2026-11.md)。八條規則**有訊號就開**：不限一次一筆，同一時間可以有多張單、不同規則同一分鐘進場也各算一筆。每條規則用它自己的出場：

- 案例牆三條（牆・翻轉／關鍵位拒絕／爆倉叢集）：目標 2R，停損極值外 0.1%，4 小時逾時。
- A～E：[strategies.mjs](../scripts/replay-cases/strategies.mjs) 與失敗拍賣模組的停損停利（A 到 POC、B C 1R、D ±1%、E 1.25R），24 小時逾時。
- 逾時以時限內最後一根收盤算 R；同一分鐘碰到停損和停利算停損。

時間為台北時間；Binance BTCUSDT 永續；手續費 taker 0.05%、止盈 maker 0.02%。資料見 [REPLAY-CASES-2026-10.md](REPLAY-CASES-2026-10.md)。勝＝扣費前 R > 0。

## 各規則合計

| 規則 | 筆數 | 勝 / 負 | 勝率 | 扣費前 | 扣費後 |
| --- | --- | --- | --- | --- | --- |
`;
  for (const k of ["flip", "reject", "liq", "A", "B-hold", "B-flip", "C", "D", "E"]) {
    const o = t(xs.filter((x) => x.src === k));
    md += `| ${LABEL[k]} | ${o.n} | ${o.w} / ${o.l} | ${o.n ? Math.round((100 * o.w) / o.n) : 0}% | ${signR(o.g)} | ${signR(o.net)} |\n`;
  }
  const a = t(xs);
  md += `| **全部** | **${a.n}** | **${a.w} / ${a.l}** | **${Math.round((100 * a.w) / a.n)}%** | **${signR(a.g)}** | **${signR(a.net)}** |\n\n## 每日合計\n\n| 日期 | 筆數 | 勝 / 負 | 扣費前 | 扣費後 |\n| --- | --- | --- | --- | --- |\n`;
  for (const d of days(xs)) {
    const o = t(xs.filter((x) => day(x.entryT) === d));
    md += `| ${d} | ${o.n} | ${o.w} / ${o.l} | ${signR(o.g)} | ${signR(o.net)} |\n`;
  }
  md += "\n## 每一筆\n";
  for (const d of days(xs)) {
    const ys = xs.filter((x) => day(x.entryT) === d), o = t(ys);
    md += `\n### ${d}（${o.n} 筆，${o.w} 勝 ${o.l} 負，扣費前 ${signR(o.g)}，扣費後 ${signR(o.net)}）\n\n| 進場 | 規則 | 方向 | 關鍵位／型態 | 進場 | 停損 | 停利 | 出場 | 結果 | 扣費前 | 扣費後 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
    for (const x of ys) md += `| ${hm(x.entryT)} | ${LABEL[x.src]} | ${x.dir === "long" ? "多" : "空"} | ${x.what} | ${num(x.entry)} | ${num(x.stop)} | ${num(x.tp)} | ${exitAt(x)} | ${result(x)} | ${r2(x.gross)} | ${r2(x.net)} |\n`;
  }
  doc("REPLAY-CASES-2026-10-ALL.md", md);
} else {
  // Key-level families; one open position per family; a win is R > 0 after fees.
  const FAMILY = { reject: "守住拒絕", "B-hold": "守住拒絕", A: "守住拒絕", flip: "翻轉", "B-flip": "翻轉", liq: "爆倉叢集", D: "爆倉叢集" };
  const FAMS = ["守住拒絕", "翻轉", "爆倉叢集"];
  const kept = signals.filter((x) => FAMILY[x.src]).map((x) => ({ ...x, fam: FAMILY[x.src], pri: /^[A-E]/.test(x.src) ? 0 : 1 }));
  // When two sources fire in one minute, the A–E version (stricter) goes first.
  kept.sort((a, b) => a.entryT - b.entryT || a.pri - b.pri);
  const busy = {}, xs = [];
  for (const x of kept) {
    if ((busy[x.fam] ?? 0) > x.entryT) continue;
    const o = simulate(ohlc, x);
    if (!o) continue;
    busy[x.fam] = o.exitT;
    xs.push({ ...x, ...o });
  }
  writeFileSync(`${OUT}october-merged.json`, JSON.stringify(xs));
  const win = (x) => x.net > 0;
  const sum = (ys, k) => ys.reduce((a, y) => a + y[k], 0);
  const pct = (ys) => `${Math.round((100 * ys.filter(win).length) / (ys.length || 1))}%`;

  // Runs of wins and losses in entry order.
  const runs = [];
  for (let i = 0; i < xs.length; i++) {
    const last = runs.at(-1);
    if (last && last.w === win(xs[i])) last.z = i;
    else runs.push({ w: win(xs[i]), a: i, z: i });
  }
  for (const r of runs) {
    r.n = r.z - r.a + 1;
    r.net = sum(xs.slice(r.a, r.z + 1), "net");
    for (let i = r.a; i <= r.z; i++) xs[i].streak = r.n >= 3 ? `${r.w ? "連勝" : "連敗"} ${i - r.a + 1}/${r.n}` : "";
  }
  // Before-fee equity by exit time: its high, and its low after that high, cut the month in three.
  const byExit = [...xs].sort((a, b) => a.exitT - b.exitT);
  let g = 0, peak = { v: -Infinity }, trough = { v: Infinity };
  const curve = byExit.map((x) => [x.exitT, (g += x.gross)]);
  for (const [t, v] of curve) if (v > peak.v) peak = { v, t };
  for (const [t, v] of curve) if (t > peak.t && v < trough.v) trough = { v, t };
  let netEq = 0, netPeak = 0, netPeakT = curve[0][0], dd = { v: 0 };
  for (const x of byExit) {
    netEq += x.net;
    if (netEq > netPeak) (netPeak = netEq), (netPeakT = x.exitT);
    if (netPeak - netEq > dd.v) dd = { v: netPeak - netEq, a: netPeakT, z: x.exitT };
  }
  const close = (t) => ohlc.rows[ohlc.idx.get(Math.floor(t / 60_000) * 60_000 - 60_000)]?.[4] ?? ohlc.rows[ohlc.idx.get(Math.floor(t / 60_000) * 60_000)][4];
  const range = (a, b) => {
    let hi = -Infinity, lo = Infinity;
    for (let i = ohlc.idx.get(Math.floor(a / 60_000) * 60_000); i < ohlc.rows.length && ohlc.rows[i][0] < b; i++) (hi = Math.max(hi, ohlc.rows[i][2])), (lo = Math.min(lo, ohlc.rows[i][3]));
    return [lo, hi];
  };
  const cuts = [FROM, peak.t + 1, trough.t + 1, TO];
  // Daily before-fee results and the runs of up and down days.
  const daily = days(xs).map((d) => {
    const ys = xs.filter((x) => day(x.entryT) === d);
    return { d, n: ys.length, w: ys.filter(win).length, g: sum(ys, "gross"), net: sum(ys, "net") };
  });
  const dayRuns = [];
  for (const o of daily) {
    const up = o.g > 0, last = dayRuns.at(-1);
    if (last && last.up === up) last.z = o.d, last.n++, (last.g += o.g);
    else dayRuns.push({ up, a: o.d, z: o.d, n: 1, g: o.g });
  }
  // Longest runs a coin with the same win rate would give over as many trades.
  const p = xs.filter(win).length / xs.length;
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const sims = Array.from({ length: 2000 }, () => {
    let l = 0, w = 0, cl = 0, cw = 0;
    for (let i = 0; i < xs.length; i++) rnd() < p ? (cw++, (cl = 0), (w = Math.max(w, cw))) : (cl++, (cw = 0), (l = Math.max(l, cl)));
    return [l, w];
  });
  const sl = sims.map((s) => s[0]).sort((a, b) => a - b), sw = sims.map((s) => s[1]).sort((a, b) => a - b);
  const losses = runs.filter((r) => !r.w).sort((a, b) => b.n - a.n), wins = runs.filter((r) => r.w).sort((a, b) => b.n - a.n);
  const runText = (r) => `${stamp(xs[r.a].entryT)} → ${stamp(xs[r.z].entryT)} ${r.n} ${r.w ? "連勝" : "連敗"}（${signR(r.net)}，扣費後）`;
  const best = daily.reduce((a, o) => (o.g > a.g ? o : a)), worst = daily.reduce((a, o) => (o.g < a.g ? o : a));

  let md = `# 十月合併策略：關鍵價位三個家族，有訊號就開（2026-10-01～10-31）

由 \`scripts/strategy-research/october-list.mjs --merged\` 產生，內部研究，不對外（[VISION.md](VISION.md) 原則 1）；分析見 [STRATEGY-RESEARCH-2026-11.md](STRATEGY-RESEARCH-2026-11.md)，每個訊號都開的版本見 [REPLAY-CASES-2026-10-ALL.md](REPLAY-CASES-2026-10-ALL.md)。

## 三個家族

八條規則裡，以一個價位為依據的收斂成三個家族；C 推升後回檔、E 開盤區間不看關鍵價位，已移除。

| 家族 | 合併的來源 | 關鍵價位 |
| --- | --- | --- |
| 守住拒絕 | 牆・關鍵位拒絕、B 吸收守住、A 失敗拍賣 | 前日高低、POC、VAH／VAL、週高低，到價被擋回 |
| 翻轉 | 牆・翻轉、B 翻轉 | 前幾日高低點突破後回測：支撐轉壓力／壓力轉支撐 |
| 爆倉叢集 | 牆・爆倉叢集、D 爆倉插針 | 模型估算的爆倉價位，急漲急跌衝進去後反做 |

- 任一家族有訊號就開；**同一家族同時只持一張單**，已有持倉時的新訊號略過（十月 ${kept.length} 個訊號略過 ${kept.length - xs.length} 個）。同一分鐘兩個來源都觸發時，用 A～E 的版本（條件較嚴）。
- 每筆沿用來源的停損停利：牆三條 2R、4 小時逾時；A～E 原設定、24 小時逾時。taker 0.05%、止盈 maker 0.02%。
- 勝＝扣費後 R > 0。

## 結果

| 家族 | 筆數 | 勝 / 負 | 扣費前 | 扣費後 |
| --- | --- | --- | --- | --- |
`;
  for (const f of FAMS) {
    const o = tally(xs.filter((x) => x.fam === f));
    md += `| ${f} | ${o.n} | ${o.w} / ${o.l} | ${signR(o.gross)} | ${signR(o.net)} |\n`;
  }
  const all = tally(xs);
  md += `| **合計** | **${all.n}** | **${all.w} / ${all.l}** | **${signR(all.gross)}** | **${signR(all.net)}** |

## 連續賺、連續賠的時段

扣費前累積 R 的最高點（${stamp(peak.t)}）與之後的最低點（${stamp(trough.t)}）把十月切成三段（以出場時間算）：

| 時段 | 筆數 | 勝率 | 扣費前 | BTC | 區間 | 各家族扣費前 | 多 / 空扣費前 |
| --- | --- | --- | --- | --- | --- | --- | --- |
`;
  for (let k = 0; k < 3; k++) {
    const [a, b] = [cuts[k], cuts[k + 1]], ys = xs.filter((x) => x.exitT >= a && x.exitT < b), [lo, hi] = range(a, b);
    const fam = FAMS.map((f) => [f, ys.filter((y) => y.fam === f)]).filter(([, zs]) => zs.length).map(([f, zs]) => `${f} ${signR(sum(zs, "gross"))}`).join("、");
    const side = (d) => signR(sum(ys.filter((y) => y.dir === d), "gross"));
    md += `| ${stamp(a)}～${stamp(b - 1)} | ${ys.length} | ${pct(ys)} | **${signR(sum(ys, "gross"))}** | ${num(close(a))} → ${num(close(b - 1))} | ${num(lo)}–${num(hi)} | ${fam} | ${side("long")} / ${side("short")} |\n`;
  }
  md += `
- **最長連敗**：${losses.slice(0, 3).map(runText).join("；")}。
- **最長連勝**：${wins.slice(0, 2).map(runText).join("；")}。
- **連續賠錢的日子**（扣費前，≥ 3 天）：${dayRuns.filter((r) => !r.up && r.n >= 3).map((r) => `${r.a}～${r.z} 連 ${r.n} 天（${signR(r.g)}）`).join("、") || "無"}；連續賺錢 ≥ 3 天：${dayRuns.filter((r) => r.up && r.n >= 3).map((r) => `${r.a}～${r.z}（${signR(r.g)}）`).join("、") || "無"}。單日最好 ${best.d}（${signR(best.g)}），最差 ${worst.d}（${signR(worst.g)}，${worst.n} 筆贏 ${worst.w} 筆）。
- **扣費後**：最大回撤 ${dd.v.toFixed(1)}R（${stamp(dd.a)} → ${stamp(dd.z)}）。
- **和隨機比**：勝率 ${Math.round(p * 100)}% 隨機丟 ${xs.length} 次，最長連敗中位數 ${sl[1000]}（九成落在 ${sl[100]}～${sl[1900]}），最長連勝中位數 ${sw[1000]}（${sw[100]}～${sw[1900]}）。

## 每日合計

| 日期 | 筆數 | 勝 / 負 | 扣費前 | 扣費後 |
| --- | --- | --- | --- | --- |
${daily.map((o) => `| ${o.d} | ${o.n} | ${o.w} / ${o.n - o.w} | ${signR(o.g)} | ${signR(o.net)} |`).join("\n")}

## 每一筆

「連勝／連敗」欄標出 3 筆以上的連續段，例如「連敗 4/11」是 11 連敗中的第 4 筆。
`;
  for (const o of daily) {
    md += `\n### ${o.d}（${o.n} 筆，${o.w} 勝 ${o.n - o.w} 負，扣費前 ${r2(o.g)}，扣費後 ${r2(o.net)}）\n\n| 進場 | 家族 | 來源 | 方向 | 關鍵位／型態 | 進場 | 停損 | 停利 | 出場 | 結果 | 扣費前 | 扣費後 | 連勝／連敗 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
    for (const x of xs.filter((x) => day(x.entryT) === o.d)) md += `| ${hm(x.entryT)} | ${x.fam} | ${LABEL[x.src]} | ${x.dir === "long" ? "多" : "空"} | ${x.what} | ${num(x.entry)} | ${num(x.stop)} | ${num(x.tp)} | ${exitAt(x)} | ${result(x)} | ${r2(x.gross)} | ${r2(x.net)} | ${x.streak} |\n`;
  }
  doc("REPLAY-CASES-2026-10-MERGED.md", md);
}
