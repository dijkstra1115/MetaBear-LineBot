// Film timing: when each bar appears, when each trade opens and closes, and the captions. Bars
// appear whole, quickly; they slow down near and during a position, and every open position
// takes about the same screen time however many bars it lasts. No music, so no beat grid.
import { readFileSync } from "node:fs";

const D = JSON.parse(readFileSync(new URL("../assets/data/replay.json", import.meta.url), "utf8"));

const FAST = 1 / 48; // nothing happening for a while
const NORMAL = 1 / 9; // the ten bars before a signal
const TRADE_TIME = 1.1; // screen time of an open position, spread over its bars
const ENTRY_HOLD = 0.8; // the position pops up
const ALERT_HOLD = 0.5; // each alert gets a beat before the next bar
const EXIT_HOLD = 0.7; // the result lands
const START = 0.6;
const TAIL = 0.9; // after the last bar, before the end card
export const ENDCARD = 3.2;

const n = D.bars.length;
const tradeOf = (i) => D.trades.find((t) => i > t.signal && i <= t.exit);
const soon = (i) => D.trades.some((t) => t.signal - i >= 0 && t.signal - i <= 10);

// reveal[i]: film time at which bar i appears (bars before the history mark are there from 0).
const reveal = new Array(n).fill(0);
const events = [];
let t = START;
for (let i = D.history; i < n; i++) {
  const signal = D.trades.findIndex((x) => x.signal === i);
  const exit = D.trades.findIndex((x) => x.exit === i);
  reveal[i] = t;
  // Alerts on this bar come first: the rule sees them, then acts.
  D.trades.forEach((tr, k) =>
    tr.alerts.forEach((a, j) => {
      if (a.bar !== i) return;
      events.push({ type: "alert", trade: k, alert: j, t });
      t += ALERT_HOLD;
    }),
  );
  if (exit >= 0) {
    events.push({ type: "exit", trade: exit, t });
    t += EXIT_HOLD;
  }
  if (signal >= 0) {
    events.push({ type: "entry", trade: signal, t });
    t += ENTRY_HOLD;
  }
  const open = tradeOf(i + 1);
  t += open ? Math.min(1 / 4, Math.max(1 / 14, TRADE_TIME / (open.exit - open.signal))) : soon(i + 1) || exit >= 0 ? NORMAL : FAST;
}
export const ENDCARD_AT = +(t + TAIL).toFixed(4);
export const END = +(ENDCARD_AT + ENDCARD).toFixed(3);
export const REVEAL = reveal.map((x) => +x.toFixed(4));
export const EVENTS = events.map((e) => ({ ...e, t: +e.t.toFixed(4) }));

// Captions: the trade's rule in one line, from its entry until the result has landed.
const at = (type, k) => events.find((e) => e.type === type && e.trade === k).t;
export const CAPTIONS = D.trades.map((tr, k) => [at("entry", k), Math.min(at("exit", k) + EXIT_HOLD + 0.2, k + 1 < D.trades.length ? at("entry", k + 1) - 0.05 : Infinity), tr.why]);
