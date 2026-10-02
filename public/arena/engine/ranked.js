import { Sandbox } from "./market.js";
import { Player } from "./player.js";
import { TURN_SECONDS } from "./session.js";

// Ranked games: a random seed, a fixed number of turns, and a log of every player action that can
// change the market. The engine is deterministic, so the seed plus the log replays the whole game;
// nothing about the market itself needs to be stored.
export const RANKED_TURNS = 24;
export const RANKED_VERSION = 1;
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

// The score: running PnL at the end of the last turn (open positions valued at the mark).
export function rankedResult(sim, player) {
  return {
    pnl: Math.round(player.equity() * 100) / 100,
    volume: player.stats.volume,
    liquidations: player.stats.liquidations,
    ignited: player.stats.ignited,
    price: sim.last,
  };
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
  return rankedResult(sim, player);
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
