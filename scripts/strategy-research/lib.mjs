// Shared pieces of the strategy research (docs/STRATEGY-RESEARCH-2026-11.md). Internal only: the
// numbers are for deciding what to build, not for publishing (VISION 1).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const OUT = `${ROOT}.data/orderflow/research/`;
export const ARCHIVES = ["btcusdt-oos.json", "btcusdt-90d.json", "btcusdt-oct.json"].map((f) => `${ROOT}.data/orderflow/${f}`);
export const MIN = 60_000;
export const H = 60 * MIN;
export const DAY = 24 * H;
export const TPE = 8 * H;
// Binance USDⓈ-M VIP 0.
export const TAKER = 0.0005;
export const MAKER = 0.0002;

const arg = process.argv.slice(2);
export const opt = (k, d) => (arg.includes(`--${k}`) ? arg[arg.indexOf(`--${k}`) + 1] : d);
export const flag = (k) => arg.includes(`--${k}`);

/** Every archive merged: 1-minute footprint rows and metric readings, each time once. */
export function loadArchives() {
  const sets = ARCHIVES.map((f) => JSON.parse(readFileSync(f, "utf8")));
  const seen = new Set();
  const rows = sets.flatMap((s) => s.bars).filter((r) => !seen.has(r[0]) && seen.add(r[0])).sort((a, b) => a[0] - b[0]);
  return { rows, metrics: sets.flatMap((s) => s.metrics), tick: sets[1].tick };
}

export const readJson = (name) => JSON.parse(readFileSync(OUT + name, "utf8"));

/** 1-minute OHLC written by export.mjs, with an index by time. */
export function loadOhlc() {
  const rows = readJson("ohlc.json");
  return { rows, idx: new Map(rows.map((r, i) => [r[0], i])) };
}

/**
 * One trade on 1-minute rows: { dir, entryT, entry, stop, tp, hold (hours), fill?, startT? }. fill
 * marks a limit order that filled inside the entryT minute, so that minute can only stop it out.
 * startT is the first minute that can move the trade when the entry is a bar's close (the case-wall
 * rules stamp the signal bar). A minute
 * that reaches both the stop and the target counts as the stop. A trade still open after hold is
 * closed at the last close inside it. R is in units of entry−stop; fees use taker in (maker for a
 * limit fill) and maker out at the target, taker out otherwise.
 */
export function simulate({ rows, idx }, x) {
  const s = x.dir === "long" ? 1 : -1, risk = Math.abs(x.entry - x.stop);
  let i = idx.get(x.startT ?? x.entryT);
  if (i == null || !risk) return null;
  let r = null, out = TAKER, exitT = null;
  if (x.fill) {
    if (s > 0 ? rows[i][3] <= x.stop : rows[i][2] >= x.stop) (r = -1), (exitT = rows[i][0] + MIN);
    i++;
  }
  for (; r == null && i < rows.length && rows[i][0] < x.entryT + x.hold * H; i++) {
    if (s > 0 ? rows[i][3] <= x.stop : rows[i][2] >= x.stop) (r = -1), (exitT = rows[i][0] + MIN);
    else if (s > 0 ? rows[i][2] >= x.tp : rows[i][3] <= x.tp) (r = Math.abs(x.tp - x.entry) / risk), (out = MAKER), (exitT = rows[i][0] + MIN);
  }
  const timeout = r == null;
  if (timeout) {
    const j = Math.min(i, rows.length) - 1;
    r = (s * (rows[j][4] - x.entry)) / risk;
    exitT = rows[j][0] + MIN;
  }
  const fee = (((x.fill ? MAKER : TAKER) + out) * x.entry) / risk;
  return { gross: r, net: r - fee, fee, exitT, result: timeout ? "timeout" : r < 0 ? "stop" : "tp", riskPct: (risk / x.entry) * 100 };
}

/** Case-wall rule signals (scan-case-rules --json) as trades: 2R, four hours, from the minute after the signal bar. */
export const wallTrades = () =>
  readJson("case-rule-signals.json").map((x) => ({ src: x.rule, dir: x.long ? "long" : "short", entryT: x.entryT, startT: x.entryT + MIN, entry: x.entry, stop: x.stop, tp: x.tp, hold: 4, what: `${x.name} ${Math.round(x.level)}`, level: x.level, name: x.name }));

/** Strategy A–E signals as trades: their own stop and target, 24 hours. */
export const aeTrades = () =>
  readJson("ae-signals.json").map((x) => ({ src: x.strat === "B" ? `B-${x.kind}` : x.strat, strat: x.strat, kind: x.kind, dir: x.dir, entryT: x.entryT, entry: x.entry, stop: x.stop, tp: x.tp, hold: 24, fill: x.fill, what: x.what }));

export const taipei = (t) => new Date(t + TPE).toISOString();
export const stamp = (t) => taipei(t).slice(5, 16).replace("T", " ");
export const at = (s) => Date.parse(`${s}+08:00`);
export const signR = (v, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}R`;
export function tally(xs) {
  const w = xs.filter((x) => x.net > 0).length;
  return { n: xs.length, w, l: xs.length - w, gross: xs.reduce((a, x) => a + x.gross, 0), net: xs.reduce((a, x) => a + x.net, 0) };
}
