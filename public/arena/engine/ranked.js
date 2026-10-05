import { Sandbox } from "./market.js";
import { Player } from "./player.js";
import { TURN_SECONDS } from "./session.js";

// Ranked games: a random seed, a fixed number of turns, and a log of every player action that can
// change the market. The engine is deterministic, so the seed plus the log replays the whole game;
// nothing about the market itself needs to be stored.
export const RANKED_TURNS = 24;
export const RANKED_VERSION = 3; // bump whenever the engine changes what a seed and log replay to
export const SETTLED_SEASON_VERSION = 3; // season boundary, independent of future engine versions
export const MAX_ACTIONS = 3000;

// Ops and how each is applied. Every action applies at the boundary after tick `t`.
const OPS = {
  enqueue: (player, args) => player.enqueue(args),
  execute: (player, args) => player.execute(args),
  cancel: (player, args) => player.cancel(args.id),
  cancelAll: (player) => player.cancelAll(),
  leverage: (player, args) => player.setLeverage(args.leverage),
  protect: (player, args) => player.setProtection(args.stop, args.take, args.stopFraction, args.takeFraction),
  unprotect: (player) => player.clearProtection(),
};
export const ACTION_OPS = Object.keys(OPS);

export function applyAction(player, action) {
  return OPS[action.op](player, action.args ?? {});
}

// Wraps the live player: apply an action and remember when it happened.
export class ActionLog {
  constructor(sim) {
    this.sim = sim;
    this.start = sim.time;
    this.actions = [];
  }
  apply(player, op, args = {}) {
    const action = { t: this.sim.time - this.start, op, args };
    this.actions.push(action);
    return applyAction(player, action);
  }
}

// A ranked score is available only after all positions have actually closed.
export function rankedResult(sim, player) {
  if (player.position) throw new Error("尚未完成平倉，無法結算成績");
  return {
    pnl: Math.round((player.account.realized - player.fees) * 100) / 100,
    settled: true,
    position: 0,
    volume: player.stats.volume,
    liquidations: player.stats.liquidations,
    ignited: player.stats.ignited,
    price: sim.last,
  };
}

// Freeze player decisions at the deadline, cancel all opening orders, then use the normal close
// path. Partial market fills retry as the market ticks and liquidity returns. The page advances
// this in small batches so even an oversized position does not freeze the UI.
export class RankedSettlement {
  constructor(sim, player) {
    this.sim = sim;
    this.player = player;
    this.start = sim.time;
    this.feesBefore = player.fees;
    this.volumeBefore = player.stats.volume;
    this.notionalBefore = player.stats.notional;
    this.summary = { lots: Math.abs(player.position), beforePnl: player.equity() };
    player.drainEvents();
    player.cancelAll();
    player.clearProtection();
    player.exitIntent = false;
    if (player.position) player.close();
    player.drainEvents();
  }

  get done() { return this.player.position === 0; }

  advance(ticks = 30) {
    for (let i = 0; i < ticks && !this.done; i++) {
      // Liquidations use the same market exit path; every remaining lot must find a counterparty.
      this.sim.tick();
      this.player.drainEvents();
    }
    return this.done;
  }

  result() {
    const result = rankedResult(this.sim, this.player);
    const marketLots = this.player.stats.volume - this.volumeBefore;
    return { ...result, settlement: {
      lots: this.summary.lots,
      marketLots,
      averagePrice: marketLots ? (this.player.stats.notional - this.notionalBefore) * 10000 / marketLots : null,
      fees: this.player.fees - this.feesBefore,
      beforePnl: this.summary.beforePnl,
      seconds: this.sim.time - this.start,
    } };
  }
}

// Rebuilds a ranked game from its seed and action log.
export function replayRanked({ seed, actions, turns = RANKED_TURNS }) {
  const sim = new Sandbox(seed);
  const player = new Player(sim);
  const start = sim.time;
  const end = start + turns * TURN_SECONDS;
  let next = 0;
  for (;;) {
    while (next < actions.length && actions[next].t === sim.time - start) applyAction(player, actions[next++]);
    if (sim.time >= end) break;
    sim.tick();
  }
  const settlement = new RankedSettlement(sim, player);
  while (!settlement.done) {
    settlement.advance(300);
    if (sim.time - end > 86400) throw new Error("平倉仍在等待流動性，尚無最終成績");
  }
  return settlement.result();
}

// Shape checks shared by the page and the server: sane, ordered, within the game and small.
export function checkActions(actions, turns = RANKED_TURNS) {
  if (!Array.isArray(actions) || actions.length > MAX_ACTIONS) return "操作紀錄格式不對";
  let last = 0;
  for (const action of actions) {
    if (!action || typeof action !== "object") return "操作紀錄格式不對";
    if (!Number.isSafeInteger(action.t) || action.t < last || action.t > turns * TURN_SECONDS) return "操作時間不對";
    if (!ACTION_OPS.includes(action.op)) return "未知的操作";
    if (action.args != null && (typeof action.args !== "object" || JSON.stringify(action.args).length > 300)) return "操作內容不對";
    last = action.t;
  }
  return null;
}
