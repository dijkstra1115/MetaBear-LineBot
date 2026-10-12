// Cuts the film's data out of the Binance archive dataset (repo root scripts/orderflow-data.mjs).
// Run from this folder:  node --max-old-space-size=6144 scripts/extract.mjs  → assets/data/replay.json
// Times are UTC ms; the film labels them in Taipei time. "Prior day" is the 2025-12-08 UTC day.
import { readFile, writeFile } from "node:fs/promises";
import { dayProfiles } from "../../../../public/lab/orderflow/strategy-failed-auction.js";

const raw = JSON.parse(await readFile("../../../.data/orderflow/btcusdt-oos.json", "utf8"));
const U = (s) => Date.parse(`${s}Z`);
const r1 = (v) => Math.round(v * 10) / 10;

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
      const m = raw.metrics.filter((r) => r[0] <= b.t + ms).at(-1);
      const row = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, vol: Math.round(b.buy + b.sell), delta: Math.round(b.buy - b.sell), oi: m ? Math.round(m[1]) : null };
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

const out = {
  source: "Binance USDⓈ-M BTCUSDT perpetual, data.binance.vision archives",
  prior: { low: prior.low, high: prior.high, val: prior.val, poc: prior.poc, vah: prior.vah },
  profile: [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([p, v]) => [p, Math.round(v)]),
  // 11:00–16:00 Taipei, 5-minute bars with OI.
  m5: bars("2025-12-09T03:00:00", "2025-12-09T08:00:00", 300_000),
  // 13:10–13:22 Taipei, 1-minute bars with $50 bands (the break and the absorption).
  m1: bars("2025-12-09T05:10:00", "2025-12-09T05:22:00", 60_000, 50),
  // The 15:20 re-test bar at $10 (the entry imbalance).
  entryBar: bars("2025-12-09T07:20:00", "2025-12-09T07:25:00", 300_000, 10)[0],
  // 15:25 → 23:50 Taipei for the wait and the targets, 5-minute bars.
  wait: bars("2025-12-09T07:25:00", "2025-12-09T15:50:00", 300_000),
  plan: { entry: 90345, entryT: U("2025-12-09T07:25:00"), stop: 89280, t1: 91305, t2: 92005, t1T: U("2025-12-09T15:37:00"), t2T: U("2025-12-09T15:44:00") },
  sweep: { t: U("2025-12-09T05:17:00"), low: 89368.9, absorb: { sell: 310, buy: 67 } },
};
await writeFile("assets/data/replay.json", JSON.stringify(out));
console.log(`prior ${JSON.stringify(out.prior)}; m5 ${out.m5.length}, m1 ${out.m1.length}, wait ${out.wait.length}`);
