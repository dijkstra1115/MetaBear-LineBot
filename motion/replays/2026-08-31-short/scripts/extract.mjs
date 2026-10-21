// Cuts assets/data/replay.json from the archive: 5-minute bars of the chosen stretch (with five
// hours of history before it), the prior UTC day's high and low at each bar, and the trades that
// scripts/replay-cases/scan-strategies.mjs found there. Run from this folder: node scripts/extract.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dayProfiles } from "../../../../public/lab/orderflow/strategy-failed-auction.js";

const FROM = Date.parse("2026-08-31T07:10:00Z"); // 2026-08-31 15:10 Taipei: the stretch's start
const HISTORY = 60; // bars already on the chart when the film starts
const TF = 5 * 60_000;
const DAY = 86_400_000;

const windows = JSON.parse(await readFile("../../../.data/orderflow/replay-cases/strategy-windows.json", "utf8"));
const w = windows.find((x) => x.from === FROM);
if (!w) throw new Error("stretch not found: run scripts/replay-cases/scan-strategies.mjs");
const raw = JSON.parse(await readFile("../../../.data/orderflow/btcusdt-90d.json", "utf8"));
const start = w.from - HISTORY * TF;
const rows = raw.bars.filter((r) => r[0] >= start - 2 * DAY && r[0] < w.to);
const profiles = dayProfiles(rows, raw.tick);

const bars = new Map();
for (const [t, o, h, l, c, levels] of rows) {
  if (t < start) continue;
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
  const p = profiles.get(Math.floor(t / DAY) - 1);
  return p ? [p.high, p.low] : null;
});
const index = (t) => list.findIndex((b) => b[0] <= t && t < b[0] + TF);

// One short line per trade, from the rule that took it.
function why(t) {
  const side = t.dir === "long" ? "做多" : "做空";
  if (t.strat === "A") return `掃過${t.level}又收回 → ${side}`;
  if (t.strat === "B" && t.kind === "flip") return `${t.dir === "long" ? "站上" : "跌破"}${t.level}，回測不${t.dir === "long" ? "破" : "過"} → ${side}`;
  if (t.strat === "B") return `回測${t.level}，${t.dir === "long" ? "守住" : "擋住"} → ${side}`;
  if (t.strat === "C") return t.dir === "long" ? `回調縮量，突破 → ${side}` : `反彈縮量，跌破 → ${side}`;
  if (t.strat === "D") return `衝過爆倉位收上影線 → ${side}`;
  return `開盤區間突破，回測大單吸收 → ${side}`;
}
// Alerts: the facts each rule saw before it opened the position, as one short line each, on the
// bar where they happened. "Big" is one minute's aggressive trading at one $10 level, as in
// strategy E's note (the archive has no single orders).
const BIG = 30; // BTC
const minute = new Map(rows.map((r) => [r[0], r]));
function biggest(from, to, lo, hi, side) {
  let best = null;
  for (let t = from; t < to; t += 60_000)
    for (const [bin, buy, sell] of minute.get(t)?.[5] ?? []) {
      const p = bin * raw.tick + raw.tick / 2;
      const q = side === "buy" ? buy : sell;
      if (p >= lo && p <= hi && (!best || q > best.q)) best = { t, q };
    }
  return best;
}
const fmt = (p) => p.toLocaleString("en-US", { maximumFractionDigits: 1 });
function alerts(t, signal) {
  const out = [];
  const long = t.dir === "long";
  if (t.strat === "B") {
    const L = t.levelPrice;
    const z = L * 0.0015;
    if (t.kind === "hold") {
      let touch = signal;
      for (let i = Math.max(0, signal - 6); i <= signal; i++) if (long ? list[i][3] <= L + z : list[i][2] >= L - z) { touch = i; break; }
      out.push({ bar: touch, tone: "level", text: `觸及${t.level} ${fmt(L)}` });
      const big = biggest(list[touch][0], list[signal][0] + TF, L - z, L + z, long ? "sell" : "buy");
      if (big && big.q >= BIG) out.push({ bar: Math.max(touch, index(big.t)), tone: long ? "sell" : "buy", text: `大額${long ? "賣" : "買"}單 ${Math.round(big.q)} BTC · 未${long ? "跌破" : "突破"}` });
      else out.push({ bar: signal, tone: long ? "sell" : "buy", text: `${long ? "賣" : "買"}壓 ${t.absorb} BTC 被吸收` });
    } else {
      let brk = signal;
      for (let i = Math.max(0, signal - 14); i < signal; i++) if (long ? list[i][4] > L + z : list[i][4] < L - z) { brk = i; break; }
      out.push({ bar: brk, tone: "level", text: `${long ? "站上" : "跌破"}${t.level} ${fmt(L)}` });
      const big = biggest(list[signal][0], list[signal][0] + TF, L - z, L + 3 * z, long ? "buy" : "sell");
      if (big && big.q >= BIG) out.push({ bar: signal, tone: long ? "buy" : "sell", text: `回測時大額${long ? "買" : "賣"}單 ${Math.round(big.q)} BTC` });
    }
  } else if (t.strat === "C") {
    const top = index(t.push.to);
    const from = index(t.push.from);
    const vol = (i, j) => list.slice(i, j + 1).reduce((a, b) => a + b[5], 0) / (j - i + 1);
    const pct = (Math.abs(t.push.end - t.push.start) / t.push.start) * 100;
    out.push({ bar: top, tone: long ? "buy" : "sell", text: `${long ? "急漲" : "急跌"} ${pct.toFixed(1)}% · 放量` });
    out.push({ bar: signal - 1, tone: "level", text: `${long ? "回調" : "反彈"}量縮 ${Math.round((1 - vol(top + 1, signal - 1) / vol(from, top)) * 100)}%` });
  }
  return out.sort((a, b) => a.bar - b.bar);
}

const trades = w.trades.map((t) => ({
  strat: t.strat,
  kind: t.kind ?? null,
  dir: t.dir,
  level: t.level ?? null,
  levelPrice: t.levelPrice ?? null,
  signal: index(t.entryT - 1), // the bar whose close (or, for D, whose minute) opens the position
  exit: index(t.exitT - 60_000), // the bar holding the 1-minute bar that hit the stop or target
  entry: t.entry,
  stop: t.stop,
  tp: t.tp,
  r: +(Math.abs(t.tp - t.entry) / Math.abs(t.entry - t.stop)).toFixed(2),
  result: t.result,
  why: why(t),
  alerts: alerts(t, index(t.entryT - 1)),
}));
await writeFile("assets/data/replay.json", JSON.stringify({ symbol: "BTCUSDT", source: raw.source, tf: "5m", history: HISTORY, strategies: w.use, bars: list, prior, trades }));
const tpe = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
console.log(`${list.length} bars ${tpe(list[0][0])} → ${tpe(list.at(-1)[0])}, high ${Math.max(...list.map((b) => b[2]))}, low ${Math.min(...list.map((b) => b[3]))}`);
console.log("prior-day levels:", [...new Set(prior.map((p) => JSON.stringify(p)))].join(" "));
for (const t of trades) {
  console.log(t.strat, t.dir, t.why, "signal bar", t.signal, "exit bar", t.exit, t.result, `${t.r}R`);
  for (const a of t.alerts) console.log(`   bar ${a.bar} ${tpe(list[a.bar][0])}  ${a.text}`);
}
