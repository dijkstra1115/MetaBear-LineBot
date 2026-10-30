import { test } from "node:test";
import assert from "node:assert/strict";
import { groupEvents } from "../public/lab/orderflow/narrate.js";
import { START_MS, TAIL_MS, barsPerSecond, beatAt, beatsOf, findStory, fitBarW, focusOf, outroOf, replayParams, spanOf, windowOf } from "../public/lab/orderflow/event-replay.js";

const MINUTE = 60_000;
const at = (hhmm) => Date.parse(`2026-10-23T${hhmm}:00+08:00`);
const sweep = (hhmm, price, side = "down") => ({
  t: at(hhmm),
  kind: "sweep",
  price,
  side,
  level: "vwap",
  dist: 0,
  repeat: false,
  text: `🪝 掃蕩收回：刺穿VWAP ${Math.round(price)} 後收回（5 分 K，${hhmm} 收盤）｜VWAP ${Math.round(price).toLocaleString("en-US")}（差 $0）`,
});
// 1-minute rows [t, o, h, l, c] for 17:15–18:20 with a gentle rise after 18:05.
const rows = [];
for (let t = at("17:10"); t < at("18:20"); t += MINUTE) {
  const c = t < at("18:05") ? 81600 + ((t / MINUTE) % 5) * 4 : 81600 + (t - at("18:05")) / MINUTE * 12;
  rows.push([t, c - 2, c + 6, c - 6, c]);
}
const story = groupEvents([sweep("17:35", 81613), sweep("17:50", 81612, "up"), sweep("18:05", 81612)])[0];

test("a replay keeps the chart's candle width unless the story would not fit", () => {
  assert.equal(fitBarW(14, 1100, 50), 14);
  assert.equal(fitBarW(64, 1100, 54), 16);
  assert.equal(fitBarW(14, 300, 200), 4);
});

test("bar events show on their 5-minute bar, live events on their minute", () => {
  assert.deepEqual(spanOf({ kind: "sweep", t: at("18:05") }), { start: at("18:00"), end: at("18:05") });
  assert.deepEqual(spanOf({ kind: "print", t: at("18:05") + 12_345 }), { start: at("18:05"), end: at("18:06") });
});

test("a replay window has 20 minutes of context and 15 after, never past now", () => {
  const win = windowOf(story, at("19:00"));
  assert.equal(win.from, at("17:10"));
  assert.equal(win.to, at("18:05") + TAIL_MS);
  assert.equal(windowOf(story, at("18:09") + 30_000).to, at("18:09"));
  assert.equal(barsPerSecond(win), 1);
  assert.equal(barsPerSecond({ from: 0, to: 270 * MINUTE }), 3);
});

test("captions open with context, then one per event, from the event lines", () => {
  const win = windowOf(story, at("19:00"));
  const beats = beatsOf(story, win, rows);
  assert.deepEqual(beats.map((b) => b.kicker), ["開始", "① 17:35 · 第 1 次", "② 17:50 · 第 2 次", "③ 18:05 · 第 3 次"]);
  assert.match(beats[0].head, /^17:15，價格 81,6\d\d，在 VWAP 81,613 (上方|下方) \$\d+。$/);
  assert.equal(beats[3].head, "刺穿 VWAP 81,612 後收回");
  assert.equal(beats[3].sub, "前面在 17:35、17:50；3 次都沒有在 VWAP 的另一邊站穩。");
  assert.equal(beats[0].t, win.from + START_MS);
  assert.equal(beatAt(beats, at("17:40")).kicker, "① 17:35 · 第 1 次");
  assert.equal(beatAt(beats, win.from), null);
});

test("the outro counts the events and states the range and close after the last one", () => {
  const win = windowOf(story, at("19:00"));
  const o = outroOf(story, win, rows);
  assert.equal(o.count.value, "3 次");
  assert.equal(o.count.times, "17:35 · 17:50 · 18:05");
  assert.equal(o.after.label, "18:05 之後 15 分鐘");
  assert.equal(o.close.label, "18:20 收在");
  assert.match(o.close.vs, /^VWAP 上方 \$\d+$/);
});

test("long stories replay their latest hour and mention the rest", () => {
  const long = groupEvents([sweep("15:00", 81610), sweep("16:00", 81611), sweep("16:30", 81612), sweep("17:00", 81612), sweep("17:20", 81612), sweep("17:35", 81613), sweep("17:50", 81612)])[0];
  assert.equal(long.items.length, 7);
  const f = focusOf(long);
  assert.deepEqual(f.items.map((e) => e.t), [at("17:00"), at("17:20"), at("17:35"), at("17:50")]);
  assert.equal(f.earlier.length, 3);
  const beats = beatsOf(f, windowOf(f, at("19:00")), rows);
  assert.match(beats[0].sub, /^今天稍早從 15:00 起已經出現 3 次；/);
});

test("share links name the newest event and find their story again", () => {
  const p = replayParams(story);
  assert.deepEqual(p, { replay: String(at("18:05")), k: "sweep", lv: "vwap" });
  const groups = groupEvents([sweep("17:35", 81613), sweep("17:50", 81612, "up"), sweep("18:05", 81612)]);
  assert.equal(findStory(groups, { t: at("18:05"), kind: "sweep" }), groups[0]);
  assert.equal(findStory(groups, { t: at("18:06"), kind: "sweep" }), null);
});
