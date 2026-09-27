// Flow Arena strategy lab: plays scripted strategies over many seeds and prints how each one scores.
// Bots only use what a player can see (book, liquidation map, tape, iceberg read, news headline),
// so a row that pulls far ahead of the others is a balance problem worth a look.
//
//   npm run lab:flow-arena                          all bots, 60 seeds
//   npm run lab:flow-arena -- chain,fade --seeds 300
//   npm run lab:flow-arena -- --engine path/to/flow-arena-engine.js
//
// Around 60 seeds the mean return still moves by roughly ±0.5 percentage points; use 300 before
// drawing conclusions.
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const enginePath = option("engine", fileURLToPath(new URL("../public/orderflow/flow-arena-engine.js", import.meta.url)));
const seedCount = Number(option("seeds", 60));
const only = args.find((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"))?.split(",");
const { FlowArenaRun } = await import(pathToFileURL(resolve(enginePath)));
const SEEDS = Array.from({ length: seedCount }, (_, i) => 500001 + i * 104729);

const sideOf = (direction) => direction > 0 ? "buy" : "sell";
const flat = (run) => !run.account.position && !run.playerOrders().length;
// The brightest band within reach, weighed by size over distance.
const pickBand = (run, minLots = 2000, reach = 0.02) => {
  const fuel = run.fuel(0.025);
  const last = run.market.last;
  return [
    fuel.shortPeak && { direction: 1, peak: fuel.shortPeak, distance: fuel.shortPeak.price / last - 1 },
    fuel.longPeak && { direction: -1, peak: fuel.longPeak, distance: 1 - fuel.longPeak.price / last },
  ].filter((item) => item && item.peak.lots >= minLots && item.distance < reach && item.distance > 0.002)
    .sort((a, b) => b.peak.lots / b.distance - a.peak.lots / a.distance)[0];
};
// A public iceberg read sitting between the price and the band.
const guarded = (run, target) => run.icebergSignals().some((signal) => target.direction > 0
  ? signal.side === "sell" && signal.price > run.market.last && signal.price < target.peak.price
  : signal.side === "buy" && signal.price < run.market.last && signal.price > target.peak.price);

const bots = {
  // Blind: buy 2,000 BTC every 20 seconds and sell it 2 seconds later.
  pump: (run) => {
    if (run.time % 20 === 5 && !run.account.position) run.submit("buy", "market", 4000);
    if (run.time % 20 === 7 && run.account.position) run.close();
  },
  // Max leverage, max size, one shot.
  yolo20x: (run) => {
    if (run.time === 0) run.setLeverage(20);
    if (run.time === 3) run.submit("buy", "market", Math.min(run.maxOpenLots(), 40000));
    if (run.time === 8 && run.account.position) run.close();
  },
  // Two-sided passive quotes around the mid; flatten half the inventory past a cap.
  maker: (run, s, { width = 0.0015, size = 500, cap = 2000 } = {}) => {
    if (run.time > 116) { run.cancelAll(); if (run.account.position) run.close(); return; }
    run.cancelAll();
    const mid = run.markPrice();
    const pos = run.account.position;
    if (Math.abs(pos) >= cap) { run.closePart(0.5); return; }
    if (pos < cap) run.submit("buy", "limit", size, Math.round(mid * (1 - width)));
    if (pos > -cap) run.submit("sell", "limit", size, Math.round(mid * (1 + width)));
  },
  // Follow net taker flow on the tape.
  flow: (run) => {
    if (run.time < 10 || run.time > 114) { if (run.account.position && run.time > 114) run.close(); return; }
    const recent = run.market.tradeLog.filter((trade) => trade.time > run.time - 8 && trade.takerOwner !== "player");
    const net = recent.reduce((sum, trade) => sum + (trade.aggressorSide === "buy" ? trade.lots : -trade.lots), 0);
    const want = net > 1500 ? 1 : net < -1500 ? -1 : 0;
    const pos = Math.sign(run.account.position);
    if (pos && pos !== want) run.close();
    if (want && pos !== want) run.submit(sideOf(want), "market", 1000);
  },
  // Rest an exit twice the push beyond the band, walk the price there in clips; when the cascade
  // fills the exit, the extra half flips you into the snap-back for a few seconds.
  ladderFlip: (run, s, { gap = 0.01, size = 5000, clip = 1000, hold = 5 } = {}) => {
    if (s.flip) {
      if (run.time >= s.flip) { run.cancelAll(); if (run.account.position) run.close(); s.flip = null; s.plan = null; s.cool = run.time + 3; }
      return;
    }
    if (s.plan) {
      const plan = s.plan;
      const pos = run.account.position;
      if (!run.playerOrders().length || Math.sign(pos) === -plan.direction) { run.cancelAll(); s.flip = run.time + hold; return; }
      if (run.time - plan.start > 8 + size / clip || plan.lastPush?.stalled) { run.cancelAll(); if (pos) run.close(); s.plan = null; s.cool = run.time + 3; return; }
      if (Math.abs(pos) < size) plan.lastPush = run.submit(sideOf(plan.direction), "market", clip);
      return;
    }
    if (!flat(run) || run.time < 2 || run.time > 100 || run.time < (s.cool ?? 0)) return;
    const target = pickBand(run);
    if (!target || guarded(run, target)) return;
    if (!run.submit(sideOf(-target.direction), "limit", size * 2, Math.round(target.peak.price * (1 + target.direction * gap))).ok) return;
    s.plan = { direction: target.direction, start: run.time };
    s.plan.lastPush = run.submit(sideOf(target.direction), "market", clip);
  },
  // Read stacked bands: the exit goes past the last band a chain can reach one wave at a time.
  chain: (run, s, { hop = 0.009, minChain = 4000, size = 5000, clip = 1000, hold = 5, perSecond = 1 } = {}) => {
    if (s.flip) {
      if (run.time >= s.flip) { run.cancelAll(); if (run.account.position) run.close(); s.flip = null; s.plan = null; s.cool = run.time + 3; }
      return;
    }
    if (s.plan) {
      const plan = s.plan;
      const pos = run.account.position;
      if (!run.playerOrders().length || Math.sign(pos) === -plan.direction) { run.cancelAll(); s.flip = run.time + hold; return; }
      if (run.time - plan.start > 10 + size / clip || plan.lastPush?.stalled) { run.cancelAll(); if (pos) run.close(); s.plan = null; s.cool = run.time + 3; return; }
      for (let i = 0; i < perSecond && Math.abs(run.account.position) < size; i++) plan.lastPush = run.submit(sideOf(plan.direction), "market", clip);
      return;
    }
    if (!flat(run) || run.time < 2 || run.time > 100 || run.time < (s.cool ?? 0)) return;
    const last = run.market.last;
    const levels = run.liquidationLevels(25000);
    let best = null;
    for (const direction of [1, -1]) {
      const bands = levels.filter((row) => (direction > 0 ? row.short : row.long) >= 300 && (direction > 0 ? row.price > last : row.price < last))
        .map((row) => ({ price: row.price, lots: direction > 0 ? row.short : row.long, d: Math.abs(row.price / last - 1) }))
        .sort((a, b) => a.d - b.d);
      if (!bands.length || bands[0].d > 0.02) continue;
      let reach = bands[0];
      let total = 0;
      for (const band of bands) { if (band.d - reach.d > hop) break; reach = band; total += band.lots; }
      if (total >= minChain && (!best || total / bands[0].d > best.total / best.first)) best = { direction, reach, total, first: bands[0].d };
    }
    if (!best || guarded(run, { direction: best.direction, peak: best.reach })) return;
    const exit = Math.round(best.reach.price * (1 + best.direction * 0.004));
    if (!run.submit(sideOf(-best.direction), "limit", size * 2, exit).ok) return;
    s.plan = { direction: best.direction, start: run.time };
    s.plan.lastPush = run.submit(sideOf(best.direction), "market", clip);
  },
  chainFast: (run, s) => bots.chain(run, s, { perSecond: 2 }),
  chainBig3x: (run, s) => bots.chain(run, s, { size: 8000, clip: 2000 }),
  // Fade a chain of two or more waves one second after it fires.
  fade: (run, s) => {
    if (run.account.position) { if (run.time >= s.exitAt) run.close(); return; }
    const wave = run.liquidationFeed.filter((item) => !item.warm).at(-1);
    if (wave && wave.chain >= 2 && run.time - wave.time === 1 && s.faded !== wave.id && run.time < 112) {
      s.faded = wave.id;
      run.submit(wave.side === "short" ? "sell" : "buy", "market", 2500);
      s.exitAt = run.time + 6;
    }
  },
  // Trade the direction of a news headline for 8 seconds.
  news: (run, s) => {
    const event = run.activeEvent;
    if (run.account.position) { if (run.time >= s.exitAt) run.close(); return; }
    if (event?.side && s.seen !== event.start && run.time < 112) {
      s.seen = event.start;
      run.submit(event.side > 0 ? "buy" : "sell", "market", 1500);
      s.exitAt = run.time + 8;
    }
  },
  // The balance test's tape reader: probe, skip guarded bands, push, exit after 3 s; fade finished chains.
  expert: (run, s) => {
    const sizeFor = (target) => {
      let lots = 500;
      while (lots < 10000) {
        const preview = run.previewOrder(sideOf(target.direction), "market", lots);
        if (preview.worstPrice != null && (target.direction > 0 ? preview.worstPrice >= target.peak.price : preview.worstPrice <= target.peak.price)) break;
        lots += 500;
      }
      return lots;
    };
    s.avoid ??= new Map();
    if (run.account.position && !s.probing) { if (run.time >= s.exitAt) run.close(); return; }
    if (s.probing) {
      const target = s.probing;
      s.probing = null;
      if (s.stalled || guarded(run, target)) { run.close(); s.avoid.set(target.peak.price, run.time + 30); s.cool = run.time + 3; return; }
      run.submit(sideOf(target.direction), "market", Math.max(500, sizeFor(target)));
      s.exitAt = run.time + 3;
      s.cool = run.time + 7;
      return;
    }
    if (run.time < 3 || run.time > 112) return;
    const wave = run.liquidationFeed.filter((item) => !item.warm).at(-1);
    if (wave && wave.chain >= 2 && run.time - wave.time === 1 && s.faded !== wave.id) {
      s.faded = wave.id;
      run.submit(wave.side === "short" ? "sell" : "buy", "market", 2500);
      s.exitAt = run.time + 6;
      return;
    }
    if (run.time < (s.cool ?? 0)) return;
    const target = pickBand(run);
    if (!target || (s.avoid.get(target.peak.price) ?? 0) > run.time) return;
    if (guarded(run, target)) { s.cool = run.time + 2; return; }
    const probe = run.submit(sideOf(target.direction), "market", 1000);
    s.stalled = probe.stalled || probe.impact * target.direction < 0.12;
    s.probing = target;
  },
};

const play = (seed, bot) => {
  const run = new FlowArenaRun(seed);
  const state = {};
  while (!run.finished) { bot(run, state); run.tick(); }
  return run.result;
};
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const share = (values, test) => `${Math.round(values.filter(test).length / values.length * 100)}%`;

if (only?.some((name) => !bots[name])) throw Error(`Unknown bot. Available: ${Object.keys(bots).join(", ")}`);
const rows = [];
for (const [name, bot] of Object.entries(bots)) {
  if (only && !only.includes(name)) continue;
  const results = SEEDS.map((seed) => play(seed, bot));
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
console.log(`${SEEDS.length} seeds · ${enginePath}`);
console.table(rows);
