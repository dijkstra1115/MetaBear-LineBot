// Cuts assets/data/<id>.json for one stretch: 5-minute bars from half an hour before the first
// re-test until a little after the last exit (with five hours of history already on the chart), the
// prior UTC day's high and low at each bar, and every trade the stretch's rule took inside it, one
// position at a time, as scripts/replay-cases/scan-case-rules.mjs --json measured them. A stretch
// with source "strategies" (the 08-31 short) takes the course strategies' trades instead, as
// scripts/replay-cases/scan-strategies.mjs chose its window.
// Run from this folder: node scripts/extract.mjs 2026-09-14
import { readFile, writeFile } from "node:fs/promises";
import { fromArchive, readingsAt } from "../../../../public/lab/orderflow/metrics.js";
import { RULES, SEGMENTS } from "./segments.mjs";

const id = process.argv[2];
const G = SEGMENTS[id];
if (!G) throw new Error(`unknown stretch ${id}; one of ${Object.keys(SEGMENTS).join(", ")}`);
const MIN = 60_000;
const TF = 5 * MIN;
const DAY = 86_400_000;
const HISTORY = 60;
const at = (s) => Date.parse(s.replace(" ", "T") + ":00+08:00");

let picked;
if (G.source === "strategies") {
  // The window's trades, one position per strategy, in the case-rule trades' shape: times are the
  // last minute of the 5-minute bar whose close opened (or closed) the position; the touch is
  // found on the bars below.
  const windows = JSON.parse(await readFile("../../../.data/orderflow/replay-cases/strategy-windows.json", "utf8"));
  const w = windows.find((x) => x.from === at(G.from));
  if (!w) throw new Error("stretch not found: run scripts/replay-cases/scan-strategies.mjs");
  picked = w.trades.map((t) => ({
    ...t,
    rule: t.strat,
    long: t.dir === "long",
    name: t.level ?? "",
    level: t.levelPrice ?? null,
    entryT: t.entryT - MIN,
    exitT: t.exitT - MIN,
    touchT: t.push ? t.push.to : t.signalT - 30 * MIN,
    r: Math.round((Math.abs(t.tp - t.entry) / Math.abs(t.entry - t.stop)) * 100) / 100,
  }));
} else {
  const all = JSON.parse(await readFile("../../../.data/orderflow/replay-cases/case-rule-trades.json", "utf8"));
  // One position at a time over the rule's whole history, so a trade the scanner skipped because one
  // was open before the stretch stays skipped here.
  let busy = -Infinity;
  const taken = [];
  for (const t of all.filter((x) => x.rule === G.rule).sort((a, b) => a.entryT - b.entryT)) {
    if (t.entryT <= busy) continue;
    busy = t.exitT;
    taken.push(t);
  }
  picked = taken.filter((t) => t.entryT >= at(G.from) && t.entryT <= at(G.to));
}
if (!picked.length) throw new Error("no trades: run scripts/replay-cases/scan-case-rules.mjs --json");
if (picked.some((t) => t.result === "timeout")) throw new Error("a trade timed out: the template draws only targets and stops");

const raw = JSON.parse(await readFile("../../../.data/orderflow/btcusdt-90d.json", "utf8"));
const tick = raw.tick;
const first = Math.floor((Math.min(...picked.map((t) => t.touchT)) - 30 * MIN) / TF) * TF;
const start = first - HISTORY * TF;
const end = Math.floor(picked.at(-1).exitT / TF) * TF + 4 * TF;
const rows = raw.bars.filter((r) => r[0] >= start - 2 * DAY && r[0] < end);
// A stretch spread over weeks (G.window) keeps only each trade's window — from window.pre minutes
// before its touch to window.post after its exit — and jumps the days in between.
const windows = [];
for (const t of G.window ? picked : []) {
  const from = Math.floor((t.touchT - G.window.pre * MIN) / TF) * TF;
  const to = Math.floor(t.exitT / TF) * TF + G.window.post * MIN;
  if (windows.length && from <= windows.at(-1)[1]) windows.at(-1)[1] = Math.max(windows.at(-1)[1], to);
  else windows.push([windows.length ? from : from - HISTORY * TF, to]);
}
const shown = (t) => !windows.length || windows.some(([a, b]) => t >= a && t < b);

// Prior UTC day's high and low, as the rules use them.
const days = new Map();
for (const [t, , h, l] of rows) {
  const d = Math.floor(t / DAY);
  const x = days.get(d) ?? { h: -Infinity, l: Infinity };
  days.set(d, { h: Math.max(x.h, h), l: Math.min(x.l, l) });
}
const bars = new Map();
for (const [t, o, h, l, c, levels] of rows) {
  if (t < start || !shown(t)) continue;
  const k = Math.floor(t / TF) * TF;
  const vol = levels.reduce((a, [, buy, sell]) => a + buy + sell, 0);
  let b = bars.get(k);
  if (!b) bars.set(k, (b = [k, o, h, l, c, 0]));
  b[2] = Math.max(b[2], h);
  b[3] = Math.min(b[3], l);
  b[4] = c;
  b[5] += vol;
}
const list = [...bars.values()].sort((a, b) => a[0] - b[0]).map((b) => [b[0], b[1], b[2], b[3], b[4], Math.round(b[5])]);
const prior = list.map(([t]) => {
  const p = days.get(Math.floor(t / DAY) - 1);
  return p ? [p.h, p.l] : null;
});
const index = (t) => list.findIndex((b) => b[0] <= t && t < b[0] + TF);
const jumps = windows.slice(1).map(([from], k) => ({ bar: list.findIndex((b) => b[0] >= from), days: Math.round((from - windows[k][1]) / DAY) }));
const minute = new Map(rows.map((r) => [r[0], r]));
const readings = fromArchive(raw.metrics).sort((a, b) => a[0] - b[0]);

const fmt = (p) => p.toLocaleString("en-US", { maximumFractionDigits: 0 });
// Level names as a viewer reads them: "09-12 高" → "9/12 高點", "前日VAH" → "前日 VAH".
function label(t) {
  const m = t.name.match(/^(\d\d)-(\d\d) (高|低)$/);
  if (m) return `${+m[1]}/${+m[2]} ${m[3]}點`;
  return t.name.replace(/\s*(POC|VAH|VAL)$/, " $1");
}
function why(t, pierced) {
  const L = label(t) + (/[A-Z]$/.test(label(t)) ? " " : "");
  const side = t.long ? "做多" : "做空";
  // Before a full-width comma no space is needed after POC, VAH or VAL.
  if (t.rule === "B" && t.kind === "flip") return `${t.long ? "站上" : "跌破"}${label(t)}，回測不${t.long ? "破" : "過"} → ${side}`;
  if (t.rule === "B") return `回測${label(t)}，${t.long ? "守住" : "擋住"} → ${side}`;
  if (t.rule === "C") return t.long ? `回調縮量，突破 → ${side}` : `反彈縮量，跌破 → ${side}`;
  if (t.rule === "flip") return t.long ? `${L}回測守住 → ${side}` : `${L}回測擋住 → ${side}`;
  if (t.rule === "liq") return `衝進爆倉叢集後收回 → ${side}`;
  if (pierced) return t.long ? `跌破${L}又收回 → ${side}` : `突破${L}又收回 → ${side}`;
  return t.long ? `回測${L}守住 → ${side}` : `碰到${L}被擋 → ${side}`;
}
// Context: the same three measurements for every trade, shown whether they back the trade or not
// (none of them is part of the rule): aggressive selling and buying inside the re-test zone from
// the touch to the entry, the last 15 minutes' net delta, and the open interest's change over the
// hour before the entry (read as the archive publishes it).
function context(t) {
  const centre = t.rule === "liq" ? (t.long ? t.stop / 0.999 : t.stop / 1.001) : t.level;
  const lo = centre * (1 - 0.0015), hi = centre * (1 + 0.0015);
  let buy = 0, sell = 0, delta = 0;
  for (let m = t.touchT; m <= t.entryT; m += MIN)
    for (const [bin, b, s] of minute.get(m)?.[5] ?? []) {
      const p = bin * tick + tick / 2;
      if (p >= lo && p <= hi) (buy += b), (sell += s);
    }
  for (let m = t.entryT - 14 * MIN; m <= t.entryT; m += MIN) for (const [, b, s] of minute.get(m)?.[5] ?? []) delta += b - s;
  const at = readingsAt(readings);
  const before = at(t.entryT + MIN - 60 * MIN)?.[1];
  const after = at(t.entryT + MIN)?.[1];
  const oi = before != null && after != null ? after - before : null;
  const n = (x) => fmt(Math.round(Math.abs(x)));
  return [
    // A pullback (strategy C) has no level to measure around.
    ...(t.level == null && t.rule !== "liq" ? [] : [`${t.rule === "liq" ? "極值區" : "回測區"}主動賣 ${n(sell)} · 買 ${n(buy)}`]),
    // One line for both, so the touch, the context, the stack and the order fit the feed's five rows.
    `近 15 分${delta < 0 ? "淨賣" : "淨買"} ${n(delta)}${oi == null ? "" : ` · OI 1 小時 ${oi < 0 ? "−" : "+"}${n(oi)}`}`,
  ];
}
// Alerts: what the rule saw, in order: the touch, the pierce if price went through and came back,
// then the context, and the stacked imbalances on the entry minute that open the trade.
// The course strategies' alerts, as the 08-31 short worded them (strategy B: the level, then the
// absorption or the break; strategy C: the push, then the quiet pullback), with the same context.
function strategyAlerts(t, signal) {
  const out = [];
  const z = (t.level ?? 0) * 0.0015;
  if (t.rule === "B" && t.kind === "hold") {
    out.push({ bar: index(t.touchT), tone: "level", text: `觸及${label(t)} ${fmt(t.level)}` });
    out.push({ bar: signal, tone: t.long ? "sell" : "buy", text: `${t.long ? "賣" : "買"}壓 ${t.absorb} BTC 被吸收` });
  } else if (t.rule === "B") {
    out.push({ bar: index(t.touchT), tone: "level", text: `${t.long ? "站上" : "跌破"}${label(t)} ${fmt(t.level)}` });
  } else {
    const top = index(t.push.to);
    const from = index(t.push.from);
    const vol = (i, j) => list.slice(i, j + 1).reduce((a, b) => a + b[5], 0) / (j - i + 1);
    const pct = (Math.abs(t.push.end - t.push.start) / t.push.start) * 100;
    out.push({ bar: top, tone: t.long ? "buy" : "sell", text: `${t.long ? "急漲" : "急跌"} ${pct.toFixed(1)}% · 放量` });
    out.push({ bar: signal - 1, tone: "level", text: `${t.long ? "回調" : "反彈"}量縮 ${Math.round((1 - vol(top + 1, signal - 1) / vol(from, top)) * 100)}%` });
  }
  for (const text of context(t)) out.push({ bar: signal, tone: "info", text });
  return out.sort((a, b) => a.bar - b.bar);
}

function alerts(t, signal) {
  if (G.source === "strategies") return strategyAlerts(t, signal);
  const L = label(t);
  const out = [];
  const touch = index(t.touchT);
  if (t.rule === "liq") out.push({ bar: touch, tone: t.long ? "sell" : "buy", text: `${t.long ? "急跌" : "急漲"}衝進爆倉叢集` });
  else out.push({ bar: touch, tone: "level", text: `回測${/^\d/.test(L) ? " " : ""}${L} ${fmt(t.level)}` });
  const ext = t.long ? t.stop / 0.999 : t.stop / 1.001;
  const through = t.long ? (t.level - ext) / t.level : (ext - t.level) / t.level;
  if (t.rule !== "liq" && through >= 0.0005)
    out.push({ bar: Math.max(touch, index(t.extT)), tone: t.long ? "sell" : "buy", text: `${t.long ? "跌破" : "突破"} ${(through * 100).toFixed(2)}% 又收回` });
  for (const text of context(t)) out.push({ bar: signal, tone: "info", text });
  out.push({ bar: signal, tone: t.long ? "buy" : "sell", text: `${t.run} 層${t.long ? "買" : "賣"}方堆疊` });
  return out;
}

// Strategy B's touch: the first bar of the six before the signal at the level (a hold) or the
// first close through it (a flip), as the 08-31 short found them.
for (const t of G.source === "strategies" ? picked : []) {
  if (t.rule !== "B") continue;
  const signal = index(t.entryT);
  const z = t.level * 0.0015;
  const span = t.kind === "flip" ? 14 : 6;
  for (let i = Math.max(0, signal - span); i <= signal; i++) {
    const [bt, , h, l, c] = list[i];
    const hit = t.kind === "flip" ? (t.long ? c > t.level + z : c < t.level - z) : t.long ? l <= t.level + z : h >= t.level - z;
    if (hit) {
      t.touchT = bt;
      break;
    }
  }
}

const trades = picked.map((t) => {
  const signal = index(t.entryT);
  const ext = t.long ? t.stop / 0.999 : t.stop / 1.001;
  const pierced = t.level != null && G.source !== "strategies" && (t.long ? ext < t.level : ext > t.level);
  return {
    rule: t.rule,
    dir: t.long ? "long" : "short",
    level: label(t),
    levelPrice: t.rule === "liq" ? null : (t.level ?? null),
    signal,
    exit: index(t.exitT),
    entry: t.entry,
    stop: t.stop,
    tp: t.tp,
    r: t.r,
    result: t.result,
    entryT: t.entryT,
    exitT: t.exitT,
    // The minutes the single-trade shorts (motion/replays/trade-shorts) place their alerts at.
    touchT: t.touchT,
    extT: t.extT ?? null,
    push: t.push ?? null,
    why: why(t, pierced),
    alerts: alerts(t, signal),
  };
});
// Opening card, in the feed's band until the first alert: what the film is, before any bar moves.
const sides = new Set(trades.map((t) => t.dir));
const pts = sides.size > 1 ? "高低點" : sides.has("long") ? "高點" : "低點";
const RULE_LINES = {
  flip: `前幾日${pts}被突破後回測，出現 ≥3 層堆疊、收回就進場`,
  reject: "碰到前日高低、POC、VAH／VAL 被擋回，出現 ≥3 層堆疊就進場",
  liq: "急漲急跌衝進爆倉叢集後收回，出現 ≥3 層堆疊就進場",
};
// The course strategies that took a trade here, in the order they first did.
const rules = G.source === "strategies" ? [...new Set(trades.map((t) => t.rule))].map((key) => ({ key, name: RULES[key] })) : null;
const R = [...new Set(trades.map((t) => t.r))];
const intro =
  G.source === "strategies"
    ? [`${G.range} 這段時間，${rules.length} 個策略開的每一筆`, `課程 ${rules.map((r) => r.name.split(" ")[0]).join("、")} 的規則照做，目標 ${R.join("／")}R`, `停損也照放 · 共 ${trades.length} 筆`]
    : [`${G.range} ${G.range.includes("–") ? "這段時間" : "這一天"}，規則開的每一筆`, RULE_LINES[G.rule], `停損也照放 · 共 ${trades.length} 筆`];
// A flip stretch keeps its one line on screen the whole time; the other rules draw each trade's level with it.
const lines = G.rule === "flip" ? [...new Map(trades.map((t) => [t.levelPrice, { price: t.levelPrice, name: t.level }])).values()] : [];

await writeFile(
  `assets/data/${id}.json`,
  JSON.stringify({ id, symbol: "BTCUSDT", source: raw.source, tick, tf: "5m", history: HISTORY, rule: G.rule, ruleName: RULES[G.rule] ?? "", rules, range: G.range, intro, jumps, showPrior: G.rule === "reject" || G.source === "strategies", lines, bars: list, prior, trades }),
);
const tpe = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(5, 16).replace("T", " ");
console.log(`${id}: ${list.length} bars ${tpe(list[0][0])} → ${tpe(list.at(-1)[0])}, revealed from ${tpe(list[HISTORY][0])}`);
for (const t of trades) {
  console.log(`  ${tpe(t.entryT)} ${t.why} @${t.entry} → ${t.result} (bars ${t.signal}→${t.exit})`);
  for (const a of t.alerts) console.log(`     ${tpe(list[a.bar][0])} ${a.text}`);
}
