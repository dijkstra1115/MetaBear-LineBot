// Cuts the film's data out of the Binance archive dataset built by
// scripts/orderflow-data.mjs (repo root). Run from this folder:
//
//   node --max-old-space-size=6144 scripts/extract.mjs
//
// Writes assets/data/replay.json. Times are UTC ms; the film labels them in Taipei time.
import { readFile, writeFile } from "node:fs/promises";

const SRC = "../../../.data/orderflow/btcusdt-oos.json";
const utc = (s) => Date.parse(`${s}Z`);
const raw = JSON.parse(await readFile(SRC, "utf8"));
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function group(from, to, ms) {
  const out = new Map();
  for (const [t, o, h, l, c, levels] of raw.bars) {
    if (t < from || t >= to) continue;
    const k = Math.floor(t / ms) * ms;
    let b = out.get(k);
    if (!b) out.set(k, (b = { t: k, o, h, l, c, buy: 0, sell: 0, levels: new Map() }));
    b.h = Math.max(b.h, h);
    b.l = Math.min(b.l, l);
    b.c = c;
    for (const [bin, buy, sell] of levels) {
      b.buy += buy;
      b.sell += sell;
      const band = Math.floor((bin * raw.tick) / 100) * 100;
      const lv = b.levels.get(band) ?? [0, 0];
      lv[0] += buy;
      lv[1] += sell;
      b.levels.set(band, lv);
    }
  }
  return [...out.values()].sort((a, b) => a.t - b.t);
}

const oiAt = (t) => {
  let row = null;
  for (const m of raw.metrics) if (m[0] <= t) row = m;
  return row;
};

// Scene 2: two days of 15-minute bars down to the low.
const line = group(utc("2026-02-04T00:00:00"), utc("2026-02-06T00:30:00"), 15 * 60_000).map((b) => [b.t, b.o, b.h, b.l, b.c]);

// Scenes 3, 5, 6: 5-minute bars from 07:30 to 10:00 Taipei with CVD from 07:30 and OI at each close.
let cvd = 0;
const bars5 = group(utc("2026-02-05T23:30:00"), utc("2026-02-06T02:00:00"), 5 * 60_000).map((b) => {
  cvd += b.buy - b.sell;
  const m = oiAt(b.t + 5 * 60_000);
  return { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, vol: Math.round(b.buy + b.sell), delta: Math.round(b.buy - b.sell), cvd: Math.round(cvd), oi: m ? Math.round(m[1]) : null };
});

// Scene 4: 1-minute footprint around the 60,000 tests, $100 bands.
const fp = group(utc("2026-02-06T00:10:00"), utc("2026-02-06T00:27:00"), 60_000).map((b) => ({
  t: b.t,
  o: b.o,
  h: b.h,
  l: b.l,
  c: b.c,
  delta: Math.round(b.buy - b.sell),
  levels: [...b.levels.entries()].sort((x, y) => x[0] - y[0]).map(([p, [buy, sell]]) => [p, round(buy, 0), round(sell, 0)]),
}));

const high = line.reduce((a, b) => (b[2] > a[2] ? b : a));
const out = {
  source: "Binance USDⓈ-M BTCUSDT perpetual, data.binance.vision archives",
  high: { t: high[0], price: high[2] },
  low: { t: utc("2026-02-06T00:19:00"), price: Math.min(...fp.map((b) => b.l)) },
  line,
  bars5,
  fp,
};
await writeFile("assets/data/replay.json", JSON.stringify(out));
console.log(`line ${line.length}, bars5 ${bars5.length}, footprint ${fp.length}; high ${out.high.price}, low ${out.low.price}`);
