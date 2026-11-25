// 事後分析 for the trades with no opening logic on record: which of the checks that held up in
// validate-setups.mjs (LuxAlgo order blocks, order blocks on two or more timeframes, FVGs) the
// entry price sat in when the trade opened. Sweeps and EQH/EQL are left out: at random minutes
// they fired about as often as at the recorded entries. The result is what the chart showed, not
// the reason the trade was taken; build-cards.mjs puts it on the cards with that wording.
//
//   node scripts/track-record/validate-setups.mjs   # first: writes setup-validation.json
//   node scripts/track-record/analyze-setups.mjs    # writes data/track-record/setup-analysis.json
import { readFile, writeFile } from "node:fs/promises";
import { loadBars } from "./bars.mjs";
import { detectSetups, MIN } from "./setups.mjs";

const HOUR = 60 * MIN;
const HISTORY = 12 * 24 * HOUR;
const TF = { 1: "1m", 5: "5m", 15: "15m", 60: "1h" };
const root = new URL("../../", import.meta.url);
const { cards } = JSON.parse(await readFile(new URL("public/track-record/cards.json", root), "utf8"));
const { totals, trades: validatedTrades } = JSON.parse(await readFile(new URL("data/track-record/setup-validation.json", root), "utf8"));
const fmt = (p) => p.toLocaleString("en-US", { maximumFractionDigits: 2 });
const taipei = (t) => new Date(t + 8 * HOUR).toISOString();
const when = (t, ref) => (taipei(t).slice(0, 10) === taipei(ref).slice(0, 10) ? "" : `${taipei(t).slice(5, 10).replace("-", "/")} `) + taipei(t).slice(11, 16);

const out = {};
for (const card of cards.filter((c) => !c.logic.length)) {
  const m1 = await loadBars(card.symbol, card.source, card.openT - HISTORY, card.openT + MIN);
  const found = detectSetups(m1, { side: card.side, entry: card.entry, stop: card.stop, at: card.openT }).filter((f) => f.kind === "ob" || f.kind === "fvg");
  const bull = card.side === "long";
  const lines = [];
  for (const f of found) {
    const zone = `${fmt(f.lo)}～${fmt(f.hi)}`;
    lines.push(`${TF[f.tf]} ${bull ? "看漲" : "看跌"}${f.kind === "ob" ? "訂單塊" : " FVG"} ${zone}（${when(f.t, card.openT)} 那根 K 棒${f.kind === "ob" ? "" : "留下的缺口"}）`);
  }
  const obTfs = found.filter((f) => f.kind === "ob").map((f) => TF[f.tf]);
  const overlap = obTfs.length >= 2 ? `${obTfs.join("、")} 的訂單塊在進場價重疊。` : null;
  const days = m1.length ? (card.openT - m1[0].t) / 24 / HOUR : 0;
  out[card.id] = { zones: found.map(({ kind, tf, lo, hi, t }) => ({ kind, tf, lo, hi, t })), lines, overlap, historyDays: Math.round(days * 10) / 10 };
  console.log(card.id.padEnd(24), card.source.padEnd(7), `${days.toFixed(1)}d`, lines.length ? [...lines, overlap ?? ""].join(" ; ") : "—");
}
const n = Object.keys(out).length;
const matched = Object.values(out).filter((a) => a.lines.length).length;
await writeFile(
  new URL("data/track-record/setup-analysis.json", root),
  JSON.stringify({ about: "Written by scripts/track-record/analyze-setups.mjs. After-the-fact chart checks, not trade reasons.", validation: totals, validatedTrades, trades: out }, null, 2) + "\n",
);
console.log(`${matched}/${n} trades sat in an order block or FVG`);
