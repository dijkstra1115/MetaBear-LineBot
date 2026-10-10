// Rebuilds the top three ranked games from their seed and action log (the same loop as
// replayRanked in public/arena/engine/ranked.js) and records what the film needs, tick by tick:
// price, the player's position and running PnL, liquidation waves, the player's fills and orders,
// one-minute candles and order-book snapshots around every action. The replay must land on the
// stored score; anything else means the engine changed and the film would show a different game.
// Usage: node scripts/export.mjs            (reads assets/data/games.json, writes assets/data/replay.json)
import fs from "node:fs";
import { Sandbox } from "../../../../public/arena/engine/market.js";
import { Player } from "../../../../public/arena/engine/player.js";
import { RankedSettlement, applyAction, RANKED_TURNS } from "../../../../public/arena/engine/ranked.js";
import { TURN_SECONDS } from "../../../../public/arena/engine/session.js";

const games = JSON.parse(fs.readFileSync("assets/data/games.json", "utf8"));
const BOOK_LEVELS = 40;
const out = [];

for (const game of games) {
  const sim = new Sandbox(game.seed);
  const player = new Player(sim);
  const start = sim.time;
  const end = start + RANKED_TURNS * TURN_SECONDS;
  const actions = game.actions;
  const actionTimes = new Set(actions.map((action) => action.t));
  const ticks = [];
  const events = [];
  const waves = [];
  const books = [];
  const orders = [];
  let next = 0;

  const snapBook = (label) =>
    books.push({
      t: sim.time - start,
      label,
      last: sim.last,
      bids: sim.book.depth("buy", BOOK_LEVELS).map((level) => [level.price, level.lots]),
      asks: sim.book.depth("sell", BOOK_LEVELS).map((level) => [level.price, level.lots]),
    });

  const record = (stats, phase) => {
    const t = sim.time - start;
    for (const event of player.drainEvents()) events.push({ t, ...event });
    for (const wave of stats?.waves ?? []) waves.push({ t, side: wave.side, lots: wave.lots, from: wave.from, to: wave.to, chain: wave.chain, by: wave.by });
    ticks.push([
      t,
      sim.last,
      stats && stats.low <= stats.high ? stats.low : sim.last,
      stats && stats.low <= stats.high ? stats.high : sim.last,
      player.position,
      Math.round(player.equity()),
      Math.round(player.account.realized - player.fees),
      sim.oi,
      stats ? stats.player.buy + stats.player.sell : 0,
      stats ? stats.waves.reduce((sum, wave) => sum + wave.lots, 0) : 0,
      phase,
    ]);
  };

  record(null, 0);
  for (;;) {
    const t = sim.time - start;
    if (next < actions.length && actions[next].t === t) snapBook("before");
    while (next < actions.length && actions[next].t === t) {
      const action = actions[next++];
      const result = applyAction(player, action);
      orders.push({ t, op: action.op, args: action.args, ok: result?.ok ?? result == null });
    }
    if (sim.time >= end) break;
    const stats = sim.tick();
    record(stats, 0);
    if (actionTimes.has(t)) snapBook("after");
    else if ((t + 1) % 60 === 0) snapBook("minute");
  }
  snapBook("deadline");
  const settlement = new RankedSettlement(sim, player);
  for (const event of player.drainEvents()) events.push({ t: sim.time - start, ...event });
  while (!settlement.done) {
    const stats = sim.tick();
    record(stats, 1);
    if (sim.time - end > 86400) throw new Error("settlement did not finish");
  }
  snapBook("settled");
  const result = settlement.result();
  if (result.pnl !== game.pnl) throw new Error(`${game.name}: replay ${result.pnl} != stored ${game.pnl}`);

  const candles = sim.allCandles()
    .filter((candle) => candle.time >= start - 3600)
    .map((candle) => [candle.time - start, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.liq.long, candle.liq.short]);

  out.push({
    id: game.id,
    name: game.name,
    seed: game.seed,
    pnl: game.pnl,
    leverage: actions.find((action) => action.op === "leverage")?.args.leverage ?? 3,
    end: end - start,
    result,
    peak: player.stats.peak,
    maxDrawdown: player.stats.maxDrawdown,
    columns: ["t", "last", "low", "high", "position", "equity", "realized", "oi", "playerLots", "liqLots", "settling"],
    ticks,
    candles,
    events: events.filter((event) => event.kind !== "fill"),
    fills: events.filter((event) => event.kind === "fill").length,
    waves,
    orders,
    books,
  });
  console.log(`${game.name}: ${result.pnl} ✓  ticks ${ticks.length}  waves ${waves.length}  events ${events.length}  books ${books.length}`);
}

fs.writeFileSync("assets/data/replay.json", JSON.stringify(out));
console.log(`wrote assets/data/replay.json (${(fs.statSync("assets/data/replay.json").size / 1e6).toFixed(1)} MB)`);
