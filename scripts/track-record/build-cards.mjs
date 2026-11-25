// Builds public/track-record/cards.json: one card per trade that has a replay case
// (public/lab/orderflow/cases/t-*.json whose "trade" names a trades.json id). A card carries the
// point-group messages, the logic from the analysis group (or none), the result as the replay
// engine settles it, and, for trades with no logic on record, 盤面紀錄: facts read from the data
// (ranges, volume spikes, how the exit happened), never a reason for the trade, and 事後分析: the
// order blocks and FVGs the entry sat in (data/track-record/setup-analysis.json, from
// analyze-setups.mjs).
//
//   node scripts/track-record/build-cards.mjs
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { Player, exitLabel, prepare } from "../../public/lab/orderflow/replay.js";

globalThis.performance ??= { now: () => 0 };
const MINUTE = 60_000;
const root = new URL("../../", import.meta.url);
const casesDir = new URL("public/lab/orderflow/cases/", root);
const { trades } = JSON.parse(await readFile(new URL("data/track-record/trades.json", root), "utf8"));
const byId = new Map(trades.map((t) => [t.id, t]));
const setups = await readFile(new URL("data/track-record/setup-analysis.json", root), "utf8").then(JSON.parse, () => ({ trades: {} }));
const MARKET = { ETH: "eth", BTC: "btc", SOL: "sol", GOLD: "xau" };
const fmt = (p) => p.toLocaleString("en-US", { maximumFractionDigits: 2 });
const hm = (t) => new Date(t + 8 * 3_600_000).toISOString().slice(11, 16);

/** Minute rows [t, o, h, l, c, volume] of a case: BingX cases from the saved klines, Binance ones from their footprint. */
async function minutesOf(raw, prepared) {
  if (raw.source === "BingX") {
    const days = new Set();
    for (let t = Math.floor(raw.history / 86_400_000) * 86_400_000; t < raw.end; t += 86_400_000) days.add(new Date(t).toISOString().slice(0, 10));
    const rows = [];
    for (const day of days) {
      try {
        rows.push(...JSON.parse(await readFile(new URL(`data/track-record/bingx-1m/${raw.symbol}-${day}.json`, root), "utf8")));
      } catch {}
    }
    return rows.filter((r) => r[0] >= raw.history && r[0] < raw.end).sort((a, b) => a[0] - b[0]);
  }
  return prepared.rowsUntil(raw.end).map(([t, o, h, l, c, lv]) => [t, o, h, l, c, lv.reduce((s, [, b, a]) => s + b + a, 0)]);
}

/** Plain facts around the trade, from the data only. */
function factsOf(rows, p) {
  const open = p.openT;
  // A time on another day than the entry carries its date.
  const day = (t) => new Date(t + 8 * 3_600_000).toISOString().slice(5, 10).replace("-", "/");
  const when = (t) => (day(t) === day(open) ? hm(t) : `${day(t)} ${hm(t)}`);
  const exitT = p.exit?.t ?? open;
  const before = rows.filter((r) => r[0] >= open - 30 * MINUTE && r[0] < open - MINUTE + 1);
  const base = rows.filter((r) => r[0] >= open - 61 * MINUTE && r[0] < open - MINUTE);
  const mean = base.reduce((s, r) => s + r[5], 0) / Math.max(1, base.length);
  const facts = [];
  if (before.length) {
    const lo = Math.min(...before.map((r) => r[3]));
    const hi = Math.max(...before.map((r) => r[2]));
    const where = (p.entry - lo) / (hi - lo || 1);
    facts.push(`進場前 30 分鐘在 ${fmt(lo)}～${fmt(hi)} 之間，進場價在這段區間的${where < 0.25 ? "下緣" : where > 0.75 ? "上緣" : "中間"}${where < 0 ? "之下" : where > 1 ? "之上" : ""}。`);
  }
  const exitBar = p.exit && rows.find((r) => r[0] <= p.exit.t - 1 && r[0] + MINUTE > p.exit.t - 1);
  const times = (r) => (mean > 0 && r[5] >= 5 * mean ? `，成交量約是進場前一小時平均的 ${Math.round(r[5] / mean)} 倍` : "");
  if (mean > 0) {
    // The exit bar gets its own line below.
    const spikes = rows.filter((r) => r !== exitBar && r[0] >= open - 30 * MINUTE && r[0] <= exitT + 15 * MINUTE && r[5] >= 5 * mean);
    for (const r of spikes.slice(0, 3)) facts.push(`${when(r[0])} 一分鐘從 ${fmt(r[1])} 到 ${fmt(r[4])}（最高 ${fmt(r[2])}、最低 ${fmt(r[3])}），成交量約是進場前一小時平均的 ${Math.round(r[5] / mean)} 倍。`);
  }
  if (p.exit) {
    const bar = exitBar;
    if (bar && p.exit.kind === "stop") {
      const wick = p.dir > 0 ? bar[3] : bar[2];
      const back = p.dir > 0 ? bar[4] > p.exit.price : bar[4] < p.exit.price;
      facts.push(`${when(bar[0])} 這根${p.dir > 0 ? "下" : "上"}影線到 ${fmt(wick)}，打到停損 ${fmt(p.exit.price)}${back ? `，收盤回到 ${fmt(bar[4])}` : `，收在 ${fmt(bar[4])}`}${times(bar)}。`);
    }
    const after = rows.filter((r) => r[0] >= p.exit.t && r[0] < p.exit.t + 15 * MINUTE);
    if (after.length) {
      const best = p.dir > 0 ? Math.max(...after.map((r) => r[2])) : Math.min(...after.map((r) => r[3]));
      facts.push(`出場後 15 分鐘內${p.dir > 0 ? "最高" : "最低"}到 ${fmt(best)}。`);
    }
  }
  return facts;
}

const cards = [];
for (const file of (await readdir(casesDir)).filter((f) => /^t-.*\.json$/.test(f) && !f.endsWith(".data.json")).sort()) {
  const script = JSON.parse(await readFile(new URL(file, casesDir), "utf8"));
  const trade = byId.get(script.trade);
  if (!trade) continue;
  const raw = JSON.parse(await readFile(new URL(script.data, casesDir), "utf8"));
  const prepared = prepare(raw);
  const player = new Player(script, prepared);
  player.seek(raw.end);
  const p = player.state.position;
  const logic = trade.logic.filter((l) => l.match === "direct" || l.match === "likely");
  const rows = await minutesOf(raw, prepared);
  const exit = p.exit && { t: p.exit.t, price: p.exit.price, label: exitLabel(p.exit), r: Math.round(p.exit.r * 100) / 100, pct: Math.round(((p.exit.r * p.risk) / p.entry) * 10_000) / 100 };
  cards.push({
    id: trade.id,
    case: file.replace(/\.json$/, ""),
    market: MARKET[trade.symbol],
    symbol: trade.symbol,
    source: raw.source,
    side: trade.side,
    posted: trade.posted,
    order: trade.order,
    entry: p.entry,
    stop: p.stop,
    targets: trade.tp,
    openT: p.openT,
    legs: p.legs.map(({ t, stop, target }) => ({ t, stop, target })),
    fills: (p.fills ?? []).map(({ t, price, size, kind }) => ({ t, price, size, kind })),
    exit,
    timeline: trade.timeline.map(({ t, text }) => ({ t, text })),
    logic: logic.map(({ t, match, text }) => ({ t, match, text })),
    facts: logic.length ? [] : factsOf(rows, p),
    analysis: logic.length ? null : (setups.trades[trade.id] ?? null),
    notes: script.notes ?? [],
    // Minutes for the card's chart: an hour before the entry to 20 minutes after the exit.
    bars: rows.filter((r) => r[0] >= p.openT - 60 * MINUTE && r[0] <= (exit?.t ?? raw.end) + 20 * MINUTE).map((r) => r.slice(0, 5)),
  });
}
// Trades that could not be redrawn still get listed, with the reason.
const { skipped: reasons = {} } = JSON.parse(await readFile(new URL("data/track-record/replays.json", root), "utf8"));
const skipped = Object.entries(reasons).map(([id, reason]) => {
  const t = byId.get(id);
  return { id, reason, symbol: t.symbol, side: t.side, posted: t.posted, result: t.result, entry: t.entry, stop: t.sl, targets: t.tp, exit: t.exit, timeline: t.timeline.map(({ t: at, text }) => ({ t: at, text })) };
});
const dir = new URL("public/track-record/", root);
await mkdir(dir, { recursive: true });
await writeFile(new URL("cards.json", dir), JSON.stringify({ cards, skipped, setupValidation: setups.validation ? { ...setups.validation, trades: setups.validatedTrades } : null }));
for (const c of cards) console.log(c.id, c.exit?.label, c.exit?.r, `${c.bars.length} bars`, c.facts.length ? `${c.facts.length} facts` : `${c.logic.length} logic`);
