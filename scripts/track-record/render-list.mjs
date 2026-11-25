// Writes data/track-record/TRADES.md from trades.json: every trade with its group messages and the
// opening logic found in the analysis group, so the owner can read and correct the record.
//
//   node scripts/track-record/render-list.mjs
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const { trades } = JSON.parse(await readFile(new URL("data/track-record/trades.json", root), "utf8"));

const SIDE = { long: "多", short: "空" };
const RESULT = { win: "✅ 止盈", loss: "❌ 停損", breakeven: "➖ 保本", partial: "🟡 部分獲利", cancelled: "⏸ 撤單／沒成交" };
const MATCH = { direct: "明確說是這單", likely: "推定是這單", plan: "開單前的看法", context: "相關說明" };
const num = (v) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 3 }));
const when = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)} ${iso.slice(11, 16)}` : "時間不明");
const quote = (text) => text.split("\n").map((l) => `> ${l}`).join("\n");

const own = trades.filter((t) => t.kind === "own");
const closed = own.filter((t) => t.status !== "cancelled");
const hasLogic = (t) => t.logic.some((l) => l.match === "direct" || l.match === "likely");
const missing = closed.filter((t) => !hasLogic(t));

const out = [];
out.push("# 實盤交易紀錄（逐筆）", "");
out.push("由 `node scripts/track-record/render-list.mjs` 從 [trades.json](trades.json) 產生，不要直接改這份；要補或改，改 trades.json 後重新產生。時間為台北時間。", "");
out.push(
  `自己的單 ${own.length} 筆，其中撤單／沒成交 ${own.length - closed.length} 筆。有成交的 ${closed.length} 筆裡，${closed.length - missing.length} 筆在分析群找到開單邏輯（明確或推定），${missing.length} 筆沒有找到。`,
  "",
  "邏輯的對應方式：點位群開單之後，分析群裡講到同一幣種、方向、價位或「早上這單」「昨天這單」的貼文，就算事後才貼也接到那一筆；沒有點名的標「推定」。只講大盤方向、在開單之前貼的，標「開單前的看法」，不算這筆的開單邏輯。",
  "",
);
out.push("## 沒有找到開單邏輯的交易", "", "如果你記得當時的理由，補給我就能加進去。", "");
out.push("| 時間 | 幣種 | 方向 | 進場 | 結果 |", "| --- | --- | --- | --- | --- |");
for (const t of missing) out.push(`| ${t.posted ? t.posted.slice(0, 10) + " " + t.posted.slice(11, 16) : "時間不明"} | ${t.symbol} | ${SIDE[t.side]} | ${num(t.entry)} | ${RESULT[t.result] ?? "未知"} |`);
out.push("");

let month = "";
for (const t of trades) {
  const m = (t.posted ?? "2025-11-10").slice(0, 7);
  if (m !== month) out.push(`## ${m.replace("-", " 年 ")} 月`, ""), (month = m);
  const who = t.kind === "metadog" ? "（MetaDog 的單）" : t.kind === "partner" ? "（合作社群報單，不算戰績）" : "";
  const res = RESULT[t.result] ?? "結果未知";
  const est = t.resultSource === "kline-estimate" ? "（群組沒有結算，依 K 線推定）" : "";
  out.push(`### ${when(t.posted)} ${t.symbol} ${SIDE[t.side]} · ${res}${est}${who}`, "");
  out.push(`進場 ${num(t.entry)}（${t.order ?? "方式未註明"}）｜停損 ${num(t.sl)}｜止盈 ${t.tp.map(num).join(" / ")}${t.exit != null ? `｜出場 ${num(t.exit)}` : ""}`, "");
  out.push("**點位群**", "");
  for (const x of t.timeline) out.push(`- ${when(x.t)}${x.group === "分析群" ? "（分析群）" : ""} ${x.text.replace(/\n/g, " ")}`);
  out.push("");
  if (t.logic.length) {
    for (const l of t.logic) {
      const after = t.posted && l.t > t.posted ? "，開單後貼" : t.posted ? "，開單前貼" : "";
      out.push(`**開單邏輯**（分析群 ${when(l.t)}，${MATCH[l.match]}${after}）`, "", quote(l.text), "");
    }
  } else if (t.kind === "own" && t.status !== "cancelled") out.push("⚠ 沒有找到開單邏輯", "");
  if (t.issues.length) out.push("**待確認**", "", ...t.issues.map((i) => `- ${i}`), "");
}
await writeFile(new URL("data/track-record/TRADES.md", root), out.join("\n"));
console.log(`${trades.length} trades, ${missing.length} closed without logic`);
