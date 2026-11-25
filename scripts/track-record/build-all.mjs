// Builds a lab replay case for every trade in data/track-record/replays.json: the case data
// (Binance trades or BingX klines around the trade) and a case script that opens the position when
// it filled, applies the recorded 套保, stop changes and manual closes, and captions the point-group
// messages at their times. Then it checks the replay's result against the record.
//
//   node scripts/track-record/build-all.mjs            # every trade
//   node scripts/track-record/build-all.mjs <id>…      # some
//
// Binance days must be on disk first (scripts/orderflow-data.mjs, see data/track-record/README.md);
// BingX klines come from fetch-bingx.mjs.
import { readFile, writeFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { Player, exitLabel, prepare } from "../../public/lab/orderflow/replay.js";

globalThis.performance ??= { now: () => 0 };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const root = new URL("../../", import.meta.url);
const path = (p) => new URL(p, root);
const { trades } = JSON.parse(await readFile(path("data/track-record/trades.json"), "utf8"));
const { replays } = JSON.parse(await readFile(path("data/track-record/replays.json"), "utf8"));
const byId = new Map(trades.map((t) => [t.id, t]));
const only = process.argv.slice(2);

const BINANCE = { BTC: ["BTCUSDT", 10, 5, "btc"], ETH: ["ETHUSDT", 0.5, 150, "eth"], SOL: ["SOLUSDT", 0.02, 1500, "sol"] };
const BINGX = { GOLD: ["NCCOGOLD2USD-USDT", "xau"], ETH: ["ETH-USDT", "eth"], BTC: ["BTC-USDT", "btc"] };
const NAME = { BTC: "BTC", ETH: "ETH", SOL: "SOL", GOLD: "黃金" };
const taipei = (s) => Date.parse(s.includes("T") ? s.replace(/\+08:00$/, ":00+08:00") : `${s.replace(" ", "T")}${s.length === 16 ? ":00" : ""}+08:00`);
const iso = (t) => new Date(t + 8 * HOUR).toISOString().slice(0, 19) + "+08:00";
const hm = (t) => new Date(t + 8 * HOUR).toISOString().slice(11, 16);
const fmt = (p) => p.toLocaleString("en-US", { maximumFractionDigits: 3 });
const exists = (u) => stat(u).then((s) => s.size > 0, () => false);
const node = (...args) => execFileSync(process.execPath, args, { cwd: root, stdio: ["ignore", "pipe", "inherit"] }).toString().trim();

/** Klines check time ("09-18 06:55") as ms, in the year of the post or the next. */
function klineAt(trade, posted) {
  if (!trade.klineCheck?.at) return 0;
  const y = Number(trade.posted.slice(0, 4));
  const t = taipei(`${y}-${trade.klineCheck.at}`);
  return t >= posted ? t : taipei(`${y + 1}-${trade.klineCheck.at}`);
}

async function buildData(spec, trade, caseId, start, end) {
  const history = start - 4 * HOUR;
  if (spec.source === "bingx") {
    const [symbol] = BINGX[trade.symbol];
    return node("scripts/track-record/build-bingx-case.mjs", "--id", caseId, "--symbol", symbol, "--history", new Date(history).toISOString(), "--start", new Date(start).toISOString(), "--end", new Date(end).toISOString());
  }
  const [symbol, tick, print] = BINANCE[trade.symbol];
  for (let d = Math.floor(history / DAY) * DAY; d < end; d += DAY) {
    const day = new Date(d).toISOString().slice(0, 10);
    const file = `.data/orderflow/${symbol === "BTCUSDT" ? `case-${day}` : `case-${symbol}-${day}`}.json`;
    if (!(await exists(path(file)))) node("scripts/orderflow-data.mjs", "--symbol", symbol, "--tick", String(tick), "--from", day, "--to", day, "--out", file);
  }
  const span = end - start;
  const step = span <= 3 * HOUR ? 1 : span <= 12 * HOUR ? 10 : 60;
  return node("scripts/replay-cases/build-case.mjs", "--id", caseId, "--symbol", symbol, "--tick", String(tick), "--print", String(print), "--step", String(step), "--history", new Date(history).toISOString(), "--start", new Date(start).toISOString(), "--end", new Date(end).toISOString());
}

/** First replay second at or after `from` whose range reaches the price. */
function fillTime(raw, from, price) {
  for (const s of raw.slices) {
    const t = raw.start + s[0] * 1000;
    if (t >= from && s[3] <= price && s[2] >= price) return t + 1000;
  }
  return null;
}

function scriptFor(spec, trade, raw, open, entry, stop, target, withEnd) {
  const long = trade.side === "long";
  const span = raw.end - raw.start;
  const tf = span <= 3 * HOUR ? "1" : span <= 12 * HOUR ? "5" : "15";
  const binance = raw.source === "Binance";
  const ind = { profile: false, prints: binance, vwap: false, levels: false, events: false, lmap: false, stats: false, volume: binance, delta: false, cvd: binance, oi: false, doi: false, funding: false, ratio: false, imb: false };
  const date = trade.posted.slice(0, 10);
  const steps = [
    {
      at: iso(raw.start),
      speed: Math.max(5, Math.round(span / 75_000)),
      tf,
      mode: "candles",
      barW: tf === "1" ? 10 : 14,
      printMin: 10,
      ind,
      caption: `${date.replace(/-/g, "/")}，${NAME[trade.symbol]}永續合約（${raw.source}）。點位群公開的實盤${long ? "多" : "空"}單。`,
      hold: 3000,
    },
  ];
  // Point-group messages at their own times (ones from before the replay at its start).
  for (const m of trade.timeline) {
    const t = Math.max(raw.start + 1000, taipei(m.t));
    if (t <= raw.end) steps.push({ at: iso(t), caption: `點位群 ${hm(taipei(m.t))}「${m.text.replace(/\n/g, " ")}」`, hold: 2500 });
  }
  const resting = spec.fill === "resting";
  steps.push({ at: iso(open), position: { side: trade.side, entry, stop, target }, caption: `${resting ? "掛單成交" : "進場"} ${fmt(entry)}，停損 ${fmt(stop)}，目標 ${fmt(target)}。`, hold: 3000 });
  const logic = trade.logic.find((l) => l.match === "direct" || l.match === "likely");
  if (logic) steps.push({ at: iso(open + 1000), caption: `開單邏輯：「${logic.text.replace(/\n/g, "，")}」`, hold: 6000 });
  for (const e of spec.events ?? []) {
    const t = Math.max(open + 2000, taipei(e.at) + 500);
    if (e.adjust) steps.push({ at: iso(t), adjust: e.adjust });
    if (e.close) steps.push({ at: iso(t), close: e.close });
  }
  if (withEnd) {
    const r = withEnd.r;
    steps.push({ at: iso(withEnd.t + 1000), caption: `${hm(withEnd.t)} ${withEnd.label}，${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toFixed(2)}R。`, hold: 3500 });
    steps.push({ at: iso(Math.min(raw.end, withEnd.t + MINUTE + 2000)), end: true });
  }
  steps.sort((a, b) => taipei(a.at) - taipei(b.at));
  return {
    title: `實盤 ${date.slice(5).replace("-", "/")} ${NAME[trade.symbol]}${long ? "多" : "空"}`,
    date,
    tz: "+08:00",
    data: `${raw.id}.data.json`,
    trade: trade.id,
    ...(spec.notes?.length ? { notes: spec.notes } : {}),
    steps,
  };
}

const report = [];
for (const spec of replays) {
  if (only.length && !only.includes(spec.id)) continue;
  const trade = byId.get(spec.id);
  if (!trade) throw new Error(`${spec.id}: not in trades.json`);
  const caseId = `t-${spec.id}`;
  const posted = taipei(trade.posted);
  const open0 = spec.open ? taipei(spec.open) : posted;
  const entry = spec.entry ?? trade.entry;
  const stop = spec.stop ?? trade.sl;
  const target = spec.target;
  const marks = [...trade.timeline.map((m) => taipei(m.t)), ...(spec.events ?? []).map((e) => taipei(e.at)), klineAt(trade, posted)];
  const start = Math.floor((open0 - 40 * MINUTE) / MINUTE) * MINUTE;
  let end = spec.end ? taipei(spec.end) : Math.min(Math.max(...marks) + 25 * MINUTE, open0 + 40 * HOUR);
  let result = null;
  let trimmed = false;
  for (let attempt = 0; attempt < 3 && !result; attempt++) {
    const built = await buildData(spec, trade, caseId, start, end);
    const raw = JSON.parse(await readFile(path(`public/lab/orderflow/cases/${caseId}.data.json`), "utf8"));
    let open = open0;
    if (spec.fill === "resting") {
      open = fillTime(raw, open0, entry);
      if (open === null) {
        report.push({ id: spec.id, built, result: "沒成交", recorded: trade.result });
        result = "unfilled";
        break;
      }
    }
    const draft = scriptFor(spec, trade, raw, open, entry, stop, target, null);
    const player = new Player(draft, prepare(raw));
    player.seek(raw.end);
    const exit = player.state.position?.exit;
    if (!exit && !trimmed && attempt === 0 && !spec.end) {
      end = Math.min(end + 24 * HOUR, open0 + 72 * HOUR); // still open: look further
      continue;
    }
    // Keep 20 minutes after the exit, no more.
    if (exit && !trimmed && raw.end > exit.t + 40 * MINUTE) {
      end = exit.t + 20 * MINUTE;
      trimmed = true;
      continue;
    }
    const label = exit ? exitLabel(exit) : "持倉中";
    const r = exit ? Math.round(exit.r * 100) / 100 : null;
    const script = scriptFor(spec, trade, raw, open, entry, stop, target, exit ? { t: exit.t, label, r } : null);
    await writeFile(path(`public/lab/orderflow/cases/${caseId}.json`), JSON.stringify(script, null, 2) + "\n");
    const got = r == null ? "open" : r > 0.005 ? "win" : r < -0.005 ? "loss" : "breakeven";
    const want = trade.result === "partial" ? "win" : trade.result;
    report.push({ id: spec.id, built, result: `${label} ${r}R @${exit ? hm(exit.t) : "-"}`, recorded: trade.result, ok: got === want });
    result = got;
  }
}
for (const r of report) console.log(`${r.ok ? "ok  " : "DIFF"} ${r.id.padEnd(26)} ${String(r.result).padEnd(24)} recorded ${r.recorded}   ${r.built.split(":").slice(1).join(":").trim()}`);
