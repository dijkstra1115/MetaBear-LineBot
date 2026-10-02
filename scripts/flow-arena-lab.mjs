// Balance lab for the FLOW ARENA sandbox: builds markets from many seeds and checks liquidity,
// volatility, crowd fuel and exit flow against the target ranges in docs/FLOW-ARENA.md.
// npm run lab:flow-arena -- --seeds 20 --hours 2
import { Sandbox } from "../public/arena/engine/market.js";
import { Player } from "../public/arena/engine/player.js";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? Number(process.argv[index + 1]) : fallback;
};
const SEEDS = arg("seeds", 12);
const HOURS = arg("hours", 2);
const TARGETS = {
  depthBtc: [1500, 3000],
  impact1250: [0.3, 0.9],
  impact5000: [2, 4],
  candleRange: [0.04, 0.12],
  hourRange: [0.6, 1.5],
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? NaN;
};
const pct = (value) => (value * 100).toFixed(3);

function fuel(sim, range = 0.03) {
  const last = sim.last;
  let long = 0;
  let short = 0;
  for (const cohort of sim.cohorts.values()) {
    if (!cohort.position) continue;
    if (Math.abs(cohort.liq / last - 1) > range) continue;
    if (cohort.position > 0) long += cohort.position;
    else short -= cohort.position;
  }
  return { long: long / 100, short: short / 100 };
}

function stopFuel(sim, range) {
  let long = 0;
  let short = 0;
  for (const cohort of sim.cohorts.values()) {
    if (!cohort.position || cohort.stop == null || Math.abs(cohort.stop / sim.last - 1) > range) continue;
    if (cohort.position > 0) long += cohort.position;
    else short -= cohort.position;
  }
  return { long: long / 100, short: short / 100 };
}

function impact(seed, btc) {
  const sim = new Sandbox(seed);
  const player = new Player(sim);
  player.leverage = 1;
  const before = sim.last;
  const side = seed % 2 ? "buy" : "sell";
  const result = player.submitMarket(side, btc * 100);
  const reach = result.lastPrice ?? before;
  return Math.abs(reach / before - 1);
}

const rows = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const started = performance.now();
  const sim = new Sandbox(seed);
  const buildMs = performance.now() - started;
  const depth = (sim.book.depthWithin("buy", sim.last, 0.01) + sim.book.depthWithin("sell", sim.last, 0.01)) / 200;
  const startFuel = fuel(sim);
  const fuel5 = fuel(sim, 0.05);
  const stops = stopFuel(sim, 0.02);
  const startPrice = sim.last;
  const regimes = new Set();
  for (let t = 0; t < HOURS * 3600; t++) {
    sim.tick();
    regimes.add(sim.regime.key);
    if (sim.ledgerBalance() !== 0) throw Error(`Ledger out of balance at seed ${seed} t ${sim.time}`);
  }
  const candles = sim.candles.filter((candle) => candle.time >= 0);
  const hours = [];
  for (let h = 0; h < HOURS; h++) {
    const slice = candles.slice(h * 60, h * 60 + 60);
    if (!slice.length) continue;
    hours.push((Math.max(...slice.map((c) => c.high)) - Math.min(...slice.map((c) => c.low))) / slice[0].open);
  }
  rows.push({
    seed,
    buildMs: Math.round(buildMs),
    depth,
    impact1250: impact(seed, 1250),
    impact5000: impact(seed, 5000),
    candleRange: median(candles.map((c) => (c.high - c.low) / c.open)),
    hourRange: median(hours),
    volumePerHour: candles.reduce((sum, c) => sum + c.volume, 0) / 100 / HOURS,
    oi: sim.oi / 100,
    fuelLong: startFuel.long,
    fuelShort: startFuel.short,
    fuel5Long: fuel5.long,
    fuel5Short: fuel5.short,
    stopsLong: stops.long,
    stopsShort: stops.short,
    drift: sim.last / startPrice - 1,
    liquidated: (sim.marketStats.liquidatedLong + sim.marketStats.liquidatedShort) / 100,
    regimes: [...regimes].join(","),
    exits: Object.fromEntries(Object.entries(sim.marketStats.exits).map(([key, lots]) => [key, Math.round(lots / 100)])),
  });
  const row = rows.at(-1);
  console.log(`seed ${seed}: build ${row.buildMs}ms depth ${row.depth.toFixed(0)} BTC, push 1250 ${pct(row.impact1250)}% 5000 ${pct(row.impact5000)}%, 1m ${pct(row.candleRange)}% 1h ${pct(row.hourRange)}%, vol ${row.volumePerHour.toFixed(0)}/h, OI ${row.oi.toFixed(0)}, fuel3% L${row.fuelLong.toFixed(0)} S${row.fuelShort.toFixed(0)} 5% L${row.fuel5Long.toFixed(0)} S${row.fuel5Short.toFixed(0)} stops2% L${row.stopsLong.toFixed(0)} S${row.stopsShort.toFixed(0)}, drift ${pct(row.drift)}%, liq ${row.liquidated.toFixed(0)}, regimes ${row.regimes}`);
  console.log(`   exits ${JSON.stringify(row.exits)}`);
  console.log(`   OI by pool ${JSON.stringify(sim.reveal().pools.map((pool) => [pool.key, Math.round((pool.long + pool.short) / 100)]))}`);
}

console.log("\nmedians vs targets");
for (const [key, [low, high]] of Object.entries(TARGETS)) {
  const value = median(rows.map((row) => row[key])) * (key === "depthBtc" ? 1 : 100);
  const actual = key === "depthBtc" ? median(rows.map((row) => row.depth)) : value;
  const ok = actual >= low && actual <= high;
  console.log(`${ok ? "OK " : "OUT"} ${key}: ${actual.toFixed(3)} (target ${low}–${high})`);
}
for (const key of ["volumePerHour", "oi", "fuelLong", "fuelShort", "fuel5Long", "fuel5Short", "stopsLong", "stopsShort", "liquidated", "buildMs"]) console.log(`    ${key}: ${median(rows.map((row) => row[key])).toFixed(1)}`);
console.log(`    |drift| median: ${pct(median(rows.map((row) => Math.abs(row.drift))))}%`);
