import { test } from "node:test";
import assert from "node:assert/strict";
import { groupEvents } from "../public/lab/orderflow/narrate.js";
import { chapterCard, chapterStory, chaptersOf, findChapter, sentenceOf } from "../public/lab/orderflow/chapters.js";
import { beatsOf, focusOf, outroOf, windowOf } from "../public/lab/orderflow/event-replay.js";

// Lines as the collector stores them (watch.js describe() plus the key-level note).
const at = (hhmm) => Date.parse(`2026-10-23T${hhmm}:00+08:00`);
const POC = "前日 POC 81,815";
const sweep = (hhmm, side = "down", price = 81815) => ({
  t: at(hhmm),
  kind: "sweep",
  price,
  side,
  level: "poc",
  dist: 0,
  repeat: false,
  text: `🪝 掃蕩收回：${side === "down" ? "刺穿" : "跌破"}前日 POC ${price} 後收回（5 分 K，${hhmm} 收盤）｜${POC}（差 $0）`,
});
const print = (hhmm, side, qty, price = 81760) => ({
  t: at(hhmm) + 12_000,
  kind: "print",
  price,
  side,
  level: "poc",
  dist: 55,
  repeat: false,
  text: `🐋 大單 ${side === "buy" ? "主動買" : "主動賣"} ${qty} BTC @ ${price.toLocaleString("en-US")}.0（${hhmm}:12）｜${POC}（差 $55）`,
});
const liq = { t: at("22:17") + 12_000, kind: "liq", price: 80801, side: "long", level: "pdl", dist: 79, repeat: false, text: "💥 連環爆倉 多單 $2.0M，142 筆，80,801–81,459（22:17:12）｜前日低 80,880（差 $79）" };
const oi = { t: at("22:20"), kind: "oi", price: 80950, side: null, level: "stack", dist: 40, repeat: false, text: "📊 OI 5 分鐘 -0.80%（z -4.4），價格 -0.61%：多單平倉（22:20:00）｜堆疊區 81,195（差 $40）" };

test("sweeps and prints near one level within the hour read as one chapter", () => {
  const events = [sweep("22:00", "up"), print("22:38", "sell", 57.2), sweep("22:40"), print("22:46", "buy", 80.5), sweep("22:55"), print("22:55", "buy", 100.3)];
  const chapters = chaptersOf(groupEvents(events));
  assert.equal(chapters.length, 1);
  const c = chapterCard(chapters[0]);
  assert.equal(c.time, "22:00–22:55");
  assert.equal(c.count, 6);
  assert.equal(c.title, POC);
  assert.equal(c.text, "3 次刺穿或跌破又收回，也出現 3 筆大單（2 筆主動買、1 筆主動賣）。");
  assert.deepEqual(c.kinds.map((k) => k.label), ["掃蕩收回 ×3", "大單 ×3"]);
  assert.deepEqual(c.lines.map((l) => [l.time, l.name]), [["22:00", "掃蕩收回"], ["22:38", "大單"], ["22:40", "掃蕩收回"], ["22:46", "大單"], ["22:55", "掃蕩收回"], ["22:55", "大單"]]);
  assert.equal(c.lines[1].text, "主動賣 57.2 BTC @ 81,760.0");
  assert.deepEqual(c.choices, ["sweep", "print"]);
});

test("a cascade then open interest falling joins across neighbouring levels", () => {
  const [c] = chaptersOf(groupEvents([liq, oi]));
  const card = chapterCard(c);
  assert.equal(card.title, "前日低 80,880 附近");
  assert.equal(card.text, "多單連環爆倉 $2.0M（142 筆），接著未平倉量 5 分鐘減少 0.80%。");
  // Far apart in time: separate chapters, newest first.
  const apart = chaptersOf(groupEvents([liq, { ...oi, t: at("23:00") }]));
  assert.deepEqual(apart.map((x) => x.items[0].kind), ["oi", "liq"]);
});

test("one-sided prints name their size; a lone event reads its own line", () => {
  const [c] = chaptersOf(groupEvents([print("00:45", "buy", 130), print("01:00", "buy", 135), sweep("01:05"), sweep("01:20")]));
  assert.equal(sentenceOf(c), "出現 2 筆主動買大單（130、135 BTC），接著 2 次刺穿又收回。");
  const [one] = chaptersOf(groupEvents([sweep("11:25")]));
  assert.equal(chapterCard(one).text, "刺穿前日 POC 81,815 後收回。");
  assert.equal(chapterCard(one).kinds.length, 1);
});

test("short chapters inside a long repeated story fold into it", () => {
  const sweeps = ["11:40", "12:00", "12:25", "12:50", "13:15", "13:40", "14:05", "14:40"].map((t, i) => sweep(t, i % 2 ? "up" : "down"));
  const chapters = chaptersOf(groupEvents([...sweeps, print("13:20", "buy", 60), print("13:22", "buy", 70)]));
  assert.equal(chapters.length, 1);
  assert.equal(sentenceOf(chapters[0]), "8 次刺穿或跌破又收回；期間另有 2 筆主動買大單（60、70 BTC）。");
  assert.equal(chapterCard(chapters[0]).lesson.href, "/orderflow/failed-auction");
});

test("replays play a mixed chapter and name each event's kind", () => {
  const events = [sweep("22:00", "up"), print("22:38", "sell", 57.2), sweep("22:40")];
  const chapters = chaptersOf(groupEvents(events));
  assert.equal(findChapter(chapters, { t: events[1].t, kind: "print" }), chapters[0]);
  assert.equal(findChapter(chapters, { t: events[1].t, kind: "sweep" }), null);
  const story = chapterStory(chapters[0]);
  assert.equal(story.card.title, POC);
  const f = focusOf(story);
  const win = windowOf(f, at("23:30"));
  const rows = [];
  for (let t = win.from; t < win.to; t += 60_000) rows.push([t, 81800, 81820, 81790, 81810]);
  const beats = beatsOf(f, win, rows);
  assert.equal(beats[0].sub, "接下來這一段的 3 件事都標在圖上。");
  assert.deepEqual(beats.slice(1).map((b) => b.kicker), ["① 22:00 · 掃蕩收回", "② 22:38 · 大單", "③ 22:40 · 掃蕩收回"]);
  assert.equal(beats[3].sub, "前面在 22:00 也出現過掃蕩收回。");
  const o = outroOf(f, win, rows);
  assert.equal(o.count.label, "前日 POC 附近發生的事");
  assert.equal(o.count.value, "3 件");
});
