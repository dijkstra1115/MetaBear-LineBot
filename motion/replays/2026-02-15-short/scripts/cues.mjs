// Film timing: when each bar appears, when each trade opens and closes, the song offset and the
// captions. Bars appear whole, quickly; they slow down while a position is open, and every
// entry and exit lands on a beat of the song (116.55 BPM).
import { readFileSync } from "node:fs";

const D = JSON.parse(readFileSync(new URL("../assets/data/replay.json", import.meta.url), "utf8"));
export const BEAT = 60 / 116.55;
const SONG_DROP_BEAT = 80; // the drop sits 0.5 s + 80 beats into the song (flow-arena/surge cues)

const FAST = 1 / 17; // nothing happening for a while
const NORMAL = 1 / 8;
const IN_TRADE = 1 / 4;
const ENTRY_HOLD = 1.0; // the position pops up
const EXIT_HOLD = 0.75; // the result lands
const START = 0.6;
const TAIL = 1.0; // after the last bar, before the end card
export const ENDCARD = 3.6;

const n = D.bars.length;
const inTrade = (i) => D.trades.some((t) => i > t.signal && i <= t.exit);
const soon = (i) => D.trades.some((t) => t.signal - i >= 0 && t.signal - i <= 10);
const onBeat = (x) => Math.ceil(x / BEAT - 1e-6) * BEAT;

// reveal[i]: film time at which bar i appears (bars before the history mark are there from 0).
const reveal = new Array(n).fill(0);
const events = [];
let t = START;
for (let i = D.history; i < n; i++) {
  const signal = D.trades.findIndex((x) => x.signal === i);
  const exit = D.trades.findIndex((x) => x.exit === i);
  if (signal >= 0 || exit >= 0) t = onBeat(t);
  reveal[i] = t;
  if (exit >= 0) {
    events.push({ type: "exit", trade: exit, t });
    t += EXIT_HOLD;
  }
  if (signal >= 0) {
    events.push({ type: "entry", trade: signal, t });
    t += ENTRY_HOLD;
  }
  t += inTrade(i + 1) ? IN_TRADE : soon(i + 1) ? NORMAL : exit >= 0 || signal >= 0 ? NORMAL : FAST;
}
const lastExit = events.filter((e) => e.type === "exit").at(-1).t;
export const ENDCARD_AT = +(onBeat(t + TAIL - BEAT)).toFixed(4);
export const END = +(ENDCARD_AT + ENDCARD).toFixed(3);
// Song offset: film beats sit on the song's beat grid and the drop lands on the last exit.
const dropBeat = Math.round(lastExit / BEAT);
export const SONG_OFFSET = +(0.5 + (SONG_DROP_BEAT - dropBeat) * BEAT).toFixed(4);
export const REVEAL = reveal.map((x) => +x.toFixed(4));
export const EVENTS = events.map((e) => ({ ...e, t: +e.t.toFixed(4) }));

// Captions: one short line per trade, from its entry to its exit.
const WHY = [
  "回測前日 VAL，守住 → 做多",
  "站上前日 VAH，回測不破 → 做多",
  "回調縮量，突破 → 再做多",
  "反彈縮量，跌破 → 做空",
];
const at = (type, k) => events.find((e) => e.type === type && e.trade === k).t;
export const CAPTIONS = D.trades.map((_, k) => [at("entry", k), Math.min(at("exit", k) + EXIT_HOLD + 0.2, k + 1 < D.trades.length ? at("entry", k + 1) - 0.05 : Infinity), WHY[k]]);
