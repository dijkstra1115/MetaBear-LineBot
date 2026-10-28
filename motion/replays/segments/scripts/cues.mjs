// Film timing: when each bar appears, when each trade opens and closes, and the captions. Bars
// appear whole, quickly; they slow down near and during a position, and every open position
// takes about the same screen time however many bars it lasts. No music, so no beat grid.
import { readFileSync } from "node:fs";

// The stretch is the first argument of whichever script imports this (build.mjs, mix.mjs).
const D = JSON.parse(readFileSync(new URL(`../assets/data/${process.argv[2]}.json`, import.meta.url), "utf8"));

const FAST = 1 / 48; // nothing happening for a while
const NORMAL = 1 / 9; // the ten bars before a signal
const TRADE_TIME = 1.1; // screen time of an open position, spread over its bars
const ENTRY_HOLD = 0.8; // the position pops up
const ALERT_HOLD = 0.5; // each alert gets a beat before the next bar
const INFO_HOLD = 0.4; // context lines (tone "info") come quicker
const EXIT_HOLD = 0.7; // the result lands
const START = 2.6; // the opening card reads while the chart holds still
const JUMP_HOLD = 1.6; // a stretch over weeks skips the days without a trade; the card says how many
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
  const jump = (D.jumps ?? []).findIndex((j) => j.bar === i);
  if (jump >= 0) {
    events.push({ type: "jump", jump, t });
    t += JUMP_HOLD;
  }
  reveal[i] = t;
  // One 5-minute bar can hold a stop and the next trade's alerts and entry (or two trades): play
  // them in the order of the minutes they happened, a trade's alerts just before its entry.
  const items = [];
  D.trades.forEach((tr, k) => {
    tr.alerts.forEach((a, j) => {
      if (a.bar === i) items.push({ key: tr.signal === i ? tr.entryT - (tr.alerts.length - j) : D.bars[i][0] + j, type: "alert", trade: k, alert: j, hold: a.tone === "info" ? INFO_HOLD : ALERT_HOLD });
    });
    if (tr.signal === i) items.push({ key: tr.entryT, type: "entry", trade: k, hold: ENTRY_HOLD });
    if (tr.exit === i) items.push({ key: tr.exitT, type: "exit", trade: k, hold: EXIT_HOLD });
  });
  items.sort((a, b) => a.key - b.key);
  for (const { key, hold, ...e } of items) {
    events.push({ ...e, t });
    t += hold;
  }
  const exited = items.some((e) => e.type === "exit");
  const open = tradeOf(i + 1);
  t += open ? Math.min(1 / 4, Math.max(1 / 14, TRADE_TIME / (open.exit - open.signal))) : soon(i + 1) || exited ? NORMAL : FAST;
}
export const ENDCARD_AT = +(t + TAIL).toFixed(4);
export const END = +(ENDCARD_AT + ENDCARD).toFixed(3);
export const REVEAL = reveal.map((x) => +x.toFixed(4));
export const EVENTS = events.map((e) => ({ ...e, t: +e.t.toFixed(4) }));

// Captions: the trade's rule in one line, from its entry until the result has landed.
const at = (type, k) => events.find((e) => e.type === type && e.trade === k).t;
// Numbered with circled digits, which cannot be read as a date the way "1/5" can (2026-10-28
// feedback); the panel's dots show how many there are in all.
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
export const CAPTIONS = D.trades.map((tr, k) => [at("entry", k), Math.min(at("exit", k) + EXIT_HOLD + 0.2, k + 1 < D.trades.length ? at("entry", k + 1) - 0.05 : Infinity), `${CIRCLED[k]} ${tr.why}`]);
