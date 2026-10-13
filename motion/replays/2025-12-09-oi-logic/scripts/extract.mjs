// Cuts the film's data out of the Binance archive dataset (repo root scripts/orderflow-data.mjs).
// Run from this folder:  node --max-old-space-size=6144 scripts/extract.mjs  → assets/data/case.json
// Times are UTC ms; the film labels them in Taipei time. "Prior day" is the 2025-12-08 UTC day.
//
// OI alignment: a Binance metrics row stamped T holds the open interest at T + 5 min. Checked over
// the whole archive: |ΔOI| between two rows exceeds the volume traded in [T, T+5m) in 1.1% of
// pairs (impossible if T were the measurement time) but the volume in [T+5m, T+10m) in 0.01%.
// So the OI at the close of the bar [t, t+5m) is the row stamped t.
import { readFile, writeFile } from "node:fs/promises";
import { dayProfiles } from "../../../../public/lab/orderflow/strategy-failed-auction.js";

const raw = JSON.parse(await readFile("../../../.data/orderflow/btcusdt-oos.json", "utf8"));
const U = (s) => Date.parse(`${s}Z`);
const r1 = (v) => Math.round(v * 10) / 10;
const METRIC_LAG = 300_000;
// Metrics at the moment `t` (the last row whose measurement time is ≤ t).
const metricsAt = (t) => raw.metrics.filter((r) => r[0] + METRIC_LAG <= t).at(-1);

function bars(from, to, ms, band = 0) {
  const out = new Map();
  for (const [t, o, h, l, c, levels] of raw.bars) {
    if (t < U(from) || t >= U(to)) continue;
    const k = Math.floor(t / ms) * ms;
    let b = out.get(k);
    if (!b) out.set(k, (b = { t: k, o, h, l, c, buy: 0, sell: 0, lv: new Map() }));
    b.h = Math.max(b.h, h);
    b.l = Math.min(b.l, l);
    b.c = c;
    for (const [bin, buy, sell] of levels) {
      b.buy += buy;
      b.sell += sell;
      if (band) {
        const p = Math.floor((bin * raw.tick) / band) * band;
        const x = b.lv.get(p) ?? [0, 0];
        x[0] += buy;
        x[1] += sell;
        b.lv.set(p, x);
      }
    }
  }
  return [...out.values()]
    .sort((a, b) => a.t - b.t)
    .map((b) => {
      const m = ms >= 300_000 ? metricsAt(b.t + ms) : null;
      const row = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, buy: r1(b.buy), sell: r1(b.sell), delta: Math.round(b.buy - b.sell) };
      if (m) Object.assign(row, { oi: Math.round(m[1]), top: m[3] });
      if (band) row.levels = [...b.lv.entries()].sort((x, y) => x[0] - y[0]).map(([p, [buy, sell]]) => [p, r1(buy), r1(sell)]);
      return row;
    });
}

// Prior-day profile at $100 for the side histogram, and its value area.
const priorRows = raw.bars.filter((r) => r[0] >= U("2025-12-08T00:00:00") && r[0] < U("2025-12-09T00:00:00"));
const prior = dayProfiles(priorRows, raw.tick).get(Math.floor(U("2025-12-08T00:00:00") / 86_400_000));
const hist = new Map();
for (const [, , , , , levels] of priorRows)
  for (const [bin, buy, sell] of levels) {
    const p = Math.floor((bin * raw.tick) / 100) * 100;
    hist.set(p, (hist.get(p) ?? 0) + buy + sell);
  }

// Absorption: aggressive volume below 89,500 (within ~0.15% of the sweep low) in the sweep bar.
const sweepLow = 89368.9;
let absorbSell = 0;
let absorbBuy = 0;
for (const [t, , , , , levels] of raw.bars) {
  if (t < U("2025-12-09T05:15:00") || t >= U("2025-12-09T05:20:00")) continue;
  for (const [bin, buy, sell] of levels)
    if (bin * raw.tick < 89500) {
      absorbBuy += buy;
      absorbSell += sell;
    }
}

const m5 = bars("2025-12-09T02:00:00", "2025-12-09T08:30:00", 300_000);
const at = (s) => m5.find((b) => b.t === U(s));
const out = {
  source: "Binance USDⓈ-M BTCUSDT perpetual, data.binance.vision archives",
  prior: { low: prior.low, high: prior.high, val: prior.val, poc: prior.poc, vah: prior.vah },
  profile: [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([p, v]) => [p, Math.round(v)]),
  // 10:00–16:30 Taipei, 5-minute bars; oi/top are at each bar's close.
  m5,
  // 13:00–13:45 Taipei, 1-minute bars with $25 bands (the break, the absorption and the bounce).
  m1: bars("2025-12-09T05:00:00", "2025-12-09T05:45:00", 60_000, 25),
  // 15:20–15:35 Taipei, 1-minute bars (the re-test bar and the return to its busiest level).
  m1e: bars("2025-12-09T07:20:00", "2025-12-09T07:35:00", 60_000),
  // The 15:20 re-test bar at $10 (its footprint).
  entryBar: bars("2025-12-09T07:20:00", "2025-12-09T07:25:00", 300_000, 10)[0],
  // 15:25 → 24:00 Taipei for the wait and the targets, 5-minute bars.
  wait: bars("2025-12-09T07:25:00", "2025-12-09T16:00:00", 300_000),
  // Entry (2026-10-14): the next bar returns to the 15:20 bar's busiest level (90,300: sells 25, buys 47);
  // a limit at that cell's top, 90,310, fills at 15:29 (low 90,305.1).
  plan: { entry: 90310, entryT: U("2025-12-09T07:29:00"), stop: 89280, t1: 91305, t2: 92005, t1T: U("2025-12-09T15:37:00"), t2T: U("2025-12-09T15:44:00") },
  sweep: { t: U("2025-12-09T05:17:00"), low: sweepLow, absorb: { sell: Math.round(absorbSell), buy: Math.round(absorbBuy) } },
  // The three readings the film is built on (5-minute bars, Taipei time).
  events: {
    shortsIn: at("2025-12-09T04:35:00"), // 12:35
    sweepBar: at("2025-12-09T05:15:00"), // 13:15
    cover: at("2025-12-09T05:30:00"), // 13:30
  },
};
const prev = (b) => m5[m5.indexOf(b) - 1];
for (const [k, b] of Object.entries(out.events)) console.log(k, new Date(b.t + 8 * 3600e3).toISOString().slice(11, 16), "Δ", b.delta, "OI", prev(b).oi, "→", b.oi, `(${b.oi - prev(b).oi})`, "top", prev(b).top, "→", b.top, "low", b.l, "close", b.c);
console.log("absorb", out.sweep.absorb, "prior", out.prior);
await writeFile("assets/data/case.json", JSON.stringify(out));
