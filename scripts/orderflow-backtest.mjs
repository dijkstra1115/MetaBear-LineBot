// Backtests the order-flow event detectors on an archive dataset.
//
//   npm run lab:orderflow:backtest                                   # the page's 14-day dataset
//   npm run lab:orderflow:backtest -- --data .data/orderflow/btcusdt-90d.json --holdout 20
//
// For each event: the move over the next 15 minutes, 1 hour and 4 hours, signed by the
// event's direction (OI events have none and are scored on the size of the move). Each
// detector is compared with random times carrying the same directions, and with itself
// on the tuning days versus the held-out last days. No fees or slippage are deducted.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { P, SIGNALS, aggregate, attachLiqWipes, detect } from "../public/lab/orderflow/signals.js";
import { buildLiqMap } from "../public/lab/orderflow/liqmap.js";

const args = Object.fromEntries(process.argv.slice(2).flatMap((x, i, all) => (x.startsWith("--") ? [[x.slice(2), all[i + 1]]] : [])));
const HOLDOUT_DAYS = Number(args.holdout ?? 4);
const root = fileURLToPath(new URL("..", import.meta.url));
const raw = JSON.parse(await readFile(`${root}${args.data ?? "public/lab/data/btcusdt.json"}`, "utf8"));

const bars = aggregate(raw.bars, raw.tick, raw.metrics);
const wipes = new Map();
buildLiqMap(raw.bars, raw.tick, raw.metrics.map((r) => [r[0], r[1]]), { keepSteps: false, onStep: (t, w) => wipes.set(t, w) });
attachLiqWipes(bars, wipes);
// Every detector, filtered and unfiltered, so the effect of each filter is visible.
const events = detect(bars, Object.keys(SIGNALS));
const split = bars.at(-1).end - HOLDOUT_DAYS * 86_400_000;

const HORIZONS = { m15: 15, h1: 60, h4: 240 }; // minutes
const steps = Object.fromEntries(Object.entries(HORIZONS).map(([k, m]) => [k, (m * 60_000) / P.tfMs]));
const longest = Math.max(...Object.values(steps));

function outcome(i, dir) {
  if (i + longest >= bars.length) return null;
  const c = bars[i].c;
  const sign = dir === "down" ? -1 : 1;
  const out = {};
  for (const [k, n] of Object.entries(steps)) {
    const r = (sign * (bars[i + n].c - c)) / c;
    out[k] = dir ? r : Math.abs(r);
  }
  return out;
}

function summarize(list) {
  const rows = list.filter(Boolean);
  const n = rows.length;
  const s = { n };
  if (!n) return s;
  for (const k of Object.keys(HORIZONS)) {
    s[`hit_${k}`] = rows.filter((r) => r[k] > 0).length / n;
    s[`avg_${k}`] = (rows.reduce((a, r) => a + r[k], 0) / n) * 1e4;
  }
  s.se_h4 = Math.sqrt((s.hit_h4 * (1 - s.hit_h4)) / n);
  return s;
}

// Deterministic random baseline.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const report = {};
for (const kind of Object.keys(SIGNALS)) {
  const own = events.filter((e) => e.kind === kind);
  const scored = own.map((e) => ({ e, o: outcome(e.i, e.dir) }));
  const baseline = [];
  for (let k = 0; k < 3000 && own.length; k++) {
    const i = P.statsWindow + Math.floor(rand() * (bars.length - P.statsWindow - longest - 1));
    baseline.push(outcome(i, own[k % own.length].dir));
  }
  report[kind] = {
    all: summarize(scored.map((s) => s.o)),
    tuning: summarize(scored.filter((s) => s.e.t < split).map((s) => s.o)),
    holdout: summarize(scored.filter((s) => s.e.t >= split).map((s) => s.o)),
    random: summarize(baseline),
  };
}

const pct = (v) => (v == null ? "   —" : `${(v * 100).toFixed(0)}%`.padStart(4));
const bps = (v) => (v == null ? "    —" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`.padStart(6));
const num = (v, w) => String(v ?? 0).padStart(w);
console.log(`${raw.from} → ${raw.to}, ${bars.length} bars of ${P.tfMs / 60_000} m, ${events.length} events; holdout = last ${HOLDOUT_DAYS} days`);
console.log("hit = share moving the event's way; avg in bps (OI: absolute size); no fees\n");
console.log("event            n | hit 15m  1h   4h ±se | avg 1h    4h | random 1h  4h  avg4h | tune  n  4h | hold  n  1h   4h  avg4h");
for (const [kind, r] of Object.entries(report)) {
  const a = r.all;
  console.log(
    `${SIGNALS[kind].name.padEnd(9, "　")} ${num(a.n, 5)} | ${pct(a.hit_m15)} ${pct(a.hit_h1)} ${pct(a.hit_h4)} ${((a.se_h4 ?? 0) * 100).toFixed(0).padStart(2)} | ${bps(a.avg_h1)} ${bps(a.avg_h4)} | ${pct(r.random.hit_h1)} ${pct(r.random.hit_h4)} ${bps(r.random.avg_h4)} | ${num(r.tuning.n, 6)} ${pct(r.tuning.hit_h4)} | ${num(r.holdout.n, 6)} ${pct(r.holdout.hit_h1)} ${pct(r.holdout.hit_h4)} ${bps(r.holdout.avg_h4)}`,
  );
}
await mkdir(`${root}.data/orderflow`, { recursive: true });
await writeFile(`${root}.data/orderflow/backtest-${raw.from}-${raw.to}.json`, JSON.stringify({ params: P, from: raw.from, to: raw.to, holdoutDays: HOLDOUT_DAYS, report }, null, 2));
