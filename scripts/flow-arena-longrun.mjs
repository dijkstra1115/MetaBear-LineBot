// Long-run check for the FLOW ARENA sandbox: runs untouched markets for many simulated hours and
// reports whether the price wanders like a random walk or keeps snapping back. Variance ratio near 1
// means moves persist; well below 1 means they get pulled back. Also flags flash moves.
// npm run lab:flow-arena:long -- --hours 24 --seeds 1,2,3,4 [--anchor '{"trendChance":0.6}']
import { Sandbox } from "../public/arena/engine/market.js";
import { ANCHOR } from "../public/arena/engine/maker.js";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
};
if (arg("anchor")) Object.assign(ANCHOR, JSON.parse(arg("anchor")));
const HOURS = Number(arg("hours", 24));
const seeds = arg("seeds", "1,2,3,4,5,6,7,8").split(",").map(Number);
const pct = (v, d = 2) => (v * 100).toFixed(d) + "%";
const variance = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length; };
const rows = [];
for (const seed of seeds) {
  const sim = new Sandbox(seed);
  const closes = [], fair = [], regimes = {};
  for (let t = 1; t <= HOURS * 3600; t++) {
    sim.tick();
    if (t % 60 === 0) { closes.push(sim.last); fair.push(sim.fair.value); regimes[sim.regime.key] = (regimes[sim.regime.key] ?? 0) + 1; }
  }
  const logs = closes.map(Math.log);
  const ret = (lag) => logs.slice(lag).map((v, i) => v - logs[i]);
  const v1 = variance(ret(1));
  const vr = (lag) => variance(ret(lag)) / (lag * v1);
  const sorted = [...closes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const within = (band) => closes.filter((c) => Math.abs(c / median - 1) <= band).length / closes.length;
  const hourly = []; for (let h = 0; h < HOURS; h++) { const s = closes.slice(h * 60, h * 60 + 60); hourly.push(Math.max(...s) / Math.min(...s) - 1); }
  const gap = closes.map((c, i) => Math.abs(c / fair[i] - 1));
  const row = {
    seed, drift: closes.at(-1) / closes[0] - 1, range: sorted.at(-1) / sorted[0] - 1,
    fairRange: Math.max(...fair) / Math.min(...fair) - 1,
    within05: within(0.005), within1: within(0.01), within2: within(0.02),
    vr15: vr(15), vr60: vr(60), vr240: vr(240),
    hourMedian: [...hourly].sort((a, b) => a - b)[Math.floor(HOURS / 2)],
    gapMedian: [...gap].sort((a, b) => a - b)[Math.floor(gap.length / 2)],
    maxMinute: Math.max(...ret(1).map(Math.abs)),
    regimes: Object.entries(regimes).map(([k, v]) => `${k} ${Math.round(v / closes.length * 100)}%`).join(", "),
    ledger: sim.ledgerBalance(),
  };
  rows.push(row);
  console.log(`seed ${seed}: ${HOURS}h drift ${pct(row.drift)}, range ${pct(row.range)}, fair-value range ${pct(row.fairRange)} | time within ±0.5% ${pct(row.within05, 0)}, ±1% ${pct(row.within1, 0)}, ±2% ${pct(row.within2, 0)} of the median | variance ratio 15m ${row.vr15.toFixed(2)} 1h ${row.vr60.toFixed(2)} 4h ${row.vr240.toFixed(2)} | median 1h range ${pct(row.hourMedian)} max 1m move ${pct(row.maxMinute)} | median |price-fair| ${pct(row.gapMedian)} | ${row.regimes}`);
}
const med = (k) => { const v = rows.map((r) => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
console.log(`\nmedian: |drift| ${pct(med("drift"))} range ${pct(med("range"))} within ±1% ${pct(med("within1"), 0)} VR15 ${med("vr15").toFixed(2)} VR60 ${med("vr60").toFixed(2)} VR240 ${med("vr240").toFixed(2)} worst 1m move ${pct(Math.max(...rows.map((r) => r.maxMinute)))}`);
