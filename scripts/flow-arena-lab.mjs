// Flow Arena strategy lab: plays scripted strategies over many seeds and prints how each one scores.
// Bots only use what a player can see (book, liquidation map, tape, iceberg read, news headline),
// so a row that pulls far ahead of the others is a balance problem worth a look.
//
//   npm run lab:flow-arena                          all bots, 60 seeds
//   npm run lab:flow-arena -- chain,fade --seeds 300
//   npm run lab:flow-arena -- --engine path/to/flow-arena-engine.js
//   npm run lab:flow-arena -- chain --rivals fade,news     each row shares its market with rivals
//
// Around 60 seeds the mean return still moves by roughly ±0.5 percentage points; use 300 before
// drawing conclusions.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const enginePath = option("engine", fileURLToPath(new URL("../public/orderflow/flow-arena-engine.js", import.meta.url)));
const seedCount = Number(option("seeds", 60));
const rivals = option("rivals", "").split(",").filter(Boolean);
const only = args.find((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"))?.split(",");
const { FlowArenaRun } = await import(pathToFileURL(resolve(enginePath)));
const { ARENA_BOTS: bots } = await import(pathToFileURL(resolve(dirname(enginePath), "flow-arena-bots.js")));
const SEEDS = Array.from({ length: seedCount }, (_, i) => 500001 + i * 104729);

// The row's bot trades as "you"; rivals, if any, trade the same market.
const play = (seed, name) => {
  const lineup = [name, ...rivals];
  const run = new FlowArenaRun(seed, { traders: lineup.map((bot, index) => index ? `rival:${index}` : "player") });
  const states = lineup.map(() => ({}));
  while (!run.finished) {
    lineup.forEach((bot, index) => bots[bot](run, run.traders[index], states[index]));
    run.tick();
  }
  return run.result;
};
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const share = (values, test) => `${Math.round(values.filter(test).length / values.length * 100)}%`;

if ([...(only ?? []), ...rivals].some((name) => !bots[name])) throw Error(`Unknown bot. Available: ${Object.keys(bots).join(", ")}`);
const rows = [];
for (const name of Object.keys(bots)) {
  if (only && !only.includes(name)) continue;
  const results = SEEDS.map((seed) => play(seed, name));
  const roi = results.map((result) => result.roi);
  const score = results.map((result) => result.score);
  rows.push({
    bot: name,
    "mean ROI %": mean(roi).toFixed(2),
    "median %": percentile(roi, 0.5).toFixed(2),
    "p90 %": percentile(roi, 0.9).toFixed(2),
    win: share(roi, (value) => value > 0),
    "mean score": Math.round(mean(score)),
    S: share(score, (value) => value >= 200),
    A: share(score, (value) => value >= 100),
  });
}
console.log(`${SEEDS.length} seeds${rivals.length ? ` · rivals: ${rivals.join(", ")}` : ""} · ${enginePath}`);
console.table(rows);
