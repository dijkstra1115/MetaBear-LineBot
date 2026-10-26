import { test } from "node:test";
import assert from "node:assert/strict";
import { MERGE_MS, cardOf, detailOf, filterGroups, groupEvents, levelPriceOf, nowOf } from "../public/lab/orderflow/narrate.js";
import { LAYOUTS, layoutPrefs, startLayout } from "../public/lab/orderflow/layouts.js";

// Lines as the collector stores them (watch.js describe() plus the key-level note).
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
const wall = { t: at("15:30"), kind: "wall_pulled", price: 81785, side: "ask", level: "poc", dist: 30, repeat: true, text: "🧱 賣單牆 81,780 撤單，價格沒碰到（原本 153 BTC）（15:30:34）｜前日 POC 81,815（差 $30）" };
const divergence = { t: at("15:45"), kind: "divergence", price: 81640.7, side: "up", level: "vwap", dist: 40, repeat: false, text: "↔️ CVD 背離：價格低於前低 81680.6，CVD 高於當時（5 分 K，15:45 收盤）｜VWAP 81,600（差 $40）" };

test("repeats of one kind at one level within 90 minutes read as one story", () => {
  const events = [wall, divergence, sweep("17:35", 81613), sweep("17:50", 81612, "up"), sweep("18:05", 81612)];
  const groups = groupEvents(events);
  assert.deepEqual(groups.map((g) => [g.choice, g.items.length]), [["sweep", 3], ["divergence", 1], ["wall", 1]]);
  // Far apart in time: two stories.
  const apart = groupEvents([sweep("10:00", 81612), { ...sweep("12:00", 81612), t: at("10:00") + MERGE_MS + 60_000 }]);
  assert.equal(apart.length, 2);
  // Health and test events have no story.
  assert.equal(groupEvents([{ t: 1, kind: "health_down", price: 1, text: "" }]).length, 0);
});

test("cards describe what happened with numbers from the event lines", () => {
  const [g] = groupEvents([sweep("17:35", 81613), sweep("17:50", 81612, "up"), sweep("18:05", 81612)]);
  const c = cardOf(g);
  assert.equal(c.badge, "掃蕩收回 ×3");
  assert.equal(c.time, "17:35–18:05");
  assert.equal(c.title, "VWAP 81,612：反覆掃過又收回");
  assert.deepEqual(c.lines.map((l) => l.time), ["18:05", "17:50", "17:35"]);
  assert.equal(c.lines[0].text, "刺穿 VWAP 81,612 後收回");
  assert.equal(c.lesson.href, "/orderflow/failed-auction");
  assert.ok(c.plain.length > 10);

  assert.equal(detailOf(wall), "賣單牆 81,780 撤單，價格沒碰到（原本 153 BTC）");
  // Prints in one minute: one time, and the badge alone names the kind.
  const print = (s, price) => ({ t: at("23:35") + s * 1000, kind: "print", price, side: "buy", level: "stack", text: `🐋 大單 主動買 50.0 BTC @ ${price.toLocaleString("en-US", { maximumFractionDigits: 1 })}（23:35:${String(s).padStart(2, "0")}）｜堆疊區 81,610（差 $20）` });
  const prints = groupEvents([print(5, 81590), print(40, 81637.5)]);
  const p = cardOf(prints[0]);
  assert.equal(p.time, "23:35");
  assert.equal(p.lines[0].text, "主動買 50.0 BTC @ 81,637.5");
  assert.equal(nowOf({ price: 81549, groups: prints, t: at("23:40") }).sub, "23:35，在堆疊區 81,610 附近大單 2 次。");
  assert.equal(levelPriceOf(wall), 81815);
  const w = cardOf(groupEvents([wall])[0]);
  assert.equal(w.title, "前日 POC 81,815：掛單牆有變化");
  const d = cardOf(groupEvents([divergence])[0]);
  assert.equal(d.title, "VWAP 81,600：價格破前低，CVD 沒有跟著創新低");
  assert.equal(d.lesson.href, "/orderflow/delta-concept");
});

test("the 現在 card places price against VWAP and the nearest level, then the last hour", () => {
  const groups = groupEvents([sweep("17:35", 81613), sweep("17:50", 81612, "up"), sweep("18:05", 81612)]);
  const now = nowOf({ price: 81705, vwap: 81612, levels: [{ name: "前日 POC", price: 81815 }, { name: "前日高", price: 82400 }], groups, t: at("18:30") });
  assert.equal(now.head, "價格 81,705，在 VWAP 81,612 上方 $93，離前日 POC 81,815 還差 $110。");
  assert.equal(now.sub, "17:35 到 18:05，在 VWAP 81,612 附近掃蕩收回 3 次。");
  assert.match(nowOf({ price: 81705, groups, t: at("20:00") }).sub, /沒有新事件/);
  // A Latin kind name after Chinese gets its space; a Chinese level name does not.
  const cvd = groupEvents([{ ...divergence, level: "poc", text: divergence.text.replace("VWAP 81,600", "前日 POC 81,815") }, { ...divergence, t: at("16:10"), level: "poc", text: divergence.text.replace("VWAP 81,600", "前日 POC 81,815") }]);
  assert.equal(nowOf({ price: 81705, vwap: 81612, groups: cvd, t: at("16:30") }).sub, "15:45 到 16:10，在前日 POC 81,815 附近 CVD 背離 2 次。");
  assert.equal(nowOf({ price: undefined, groups, t: 0 }), null);
});

test("filters keep the stories of their kinds", () => {
  const groups = groupEvents([wall, divergence, sweep("18:05", 81612)]);
  assert.equal(filterGroups(groups, "all").length, 3);
  assert.deepEqual(filterGroups(groups, "bar").map((g) => g.choice).sort(), ["divergence", "sweep"]);
  assert.deepEqual(filterGroups(groups, "book").map((g) => g.choice), ["wall"]);
  assert.equal(filterGroups(groups, "flow").length, 0);
});

test("layouts: beginners see a quiet chart, pro is the full default set", () => {
  const indicators = [["profile", "overlay", "", true], ["heat", "overlay", "", true], ["prints", "overlay", "", true], ["vwap", "overlay", "", true], ["levels", "overlay", "", false], ["events", "overlay", "", true], ["volume", "pane", "", true], ["cvd", "pane", "", true], ["oi", "pane", "", true]];
  const b = layoutPrefs("beginner", indicators);
  assert.deepEqual(Object.keys(b.show).filter((k) => b.show[k]), ["prints", "vwap", "levels", "events", "cvd"]);
  assert.equal(b.printMin, 10);
  assert.equal(layoutPrefs("beginner", indicators, { narrow: true }).printMin, 25);
  // 全市場 sums four exchanges' prints, so its thresholds sit one step higher.
  assert.equal(layoutPrefs("beginner", indicators, { merged: true }).printMin, 25);
  assert.equal(layoutPrefs("beginner", indicators, { narrow: true, merged: true }).printMin, 50);
  assert.equal(layoutPrefs("advanced", indicators, { merged: true }).printMin, 10);
  assert.equal(layoutPrefs("pro", indicators, { merged: true }).printMin, null);
  const pro = layoutPrefs("pro", indicators);
  assert.deepEqual(Object.keys(pro.show).filter((k) => pro.show[k]), ["profile", "heat", "prints", "vwap", "events", "volume", "cvd", "oi"]);
  assert.equal(pro.printMin, null);
  assert.equal(LAYOUTS.pro.rail, false);

  assert.equal(startLayout({ saved: null, hasSavedIndicators: false, shared: false }), "beginner");
  assert.equal(startLayout({ saved: null, hasSavedIndicators: true, shared: false }), "custom");
  assert.equal(startLayout({ saved: "advanced", hasSavedIndicators: true, shared: false }), "advanced");
  assert.equal(startLayout({ saved: "beginner", hasSavedIndicators: true, shared: true }), "custom");
});
