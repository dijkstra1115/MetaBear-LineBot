import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_DEFAULTS, LevelBook, TAIPEI_OFFSET_MS, closedBarEvents, eventPrice, levelText, priorDayLevels, sessionOf, sessionStart } from "../public/lab/orderflow/keylevels.js";

const M = 60_000;
const at = (iso) => Date.parse(iso);
// A quiet minute: [t, o, h, l, c, [[bin, buy, sell]]] with all volume in one $10 bin.
const minute = (t, price, qty = 1) => [t, price, price + 5, price - 5, price, [[Math.floor(price / 10), qty / 2, qty / 2]]];

test("sessions are UTC days (08:00 in Taiwan); the backtest can still ask for Taiwan days", () => {
  const before = at("2026-10-20T23:59:59Z");
  const after = at("2026-10-21T00:00:00Z");
  assert.equal(sessionOf(after), sessionOf(before) + 1);
  assert.equal(sessionStart(sessionOf(before)), at("2026-10-20T00:00:00Z"));
  assert.equal(sessionStart(sessionOf(at("2026-10-21T08:00:00+08:00"))), at("2026-10-21T00:00:00Z"));
  assert.equal(sessionStart(sessionOf(at("2026-10-21T07:59:59+08:00"))), at("2026-10-20T00:00:00Z"));
  // Taiwan days for the pre-registered backtest (docs/ORDERFLOW-KEYLEVEL-ALERTS.md §5a).
  assert.equal(sessionStart(sessionOf(at("2026-10-20T16:00:00Z"), TAIPEI_OFFSET_MS), TAIPEI_OFFSET_MS), at("2026-10-20T16:00:00Z"));
  const taipei = new LevelBook(10, { ...LEVEL_DEFAULTS, sessionOffsetMs: TAIPEI_OFFSET_MS });
  const utc = new LevelBook(10);
  // A high at 20:00 UTC is the previous day in UTC but the next Taiwan day.
  for (const book of [taipei, utc]) {
    book.addMinute(minute(at("2026-10-20T10:00:00Z"), 900));
    book.addMinute(minute(at("2026-10-20T20:00:00Z"), 1000));
    book.addMinute(minute(at("2026-10-21T02:00:00Z"), 950));
  }
  const pdh = (book) => book.levels(at("2026-10-21T02:01:00Z")).find((L) => L.name === "pdh")?.price;
  assert.equal(pdh(utc), 1005);
  assert.equal(pdh(taipei), 905);
});

test("the previous day gives high, low, POC and value area; VWAP waits an hour", () => {
  const book = new LevelBook(10);
  const day = sessionStart(sessionOf(at("2026-10-20T12:00:00+08:00")));
  for (let k = 0; k < 1440; k++) book.addMinute(minute(day + k * M, k === 100 ? 1000 : k === 900 ? 800 : 900, k === 500 ? 50 : 1));
  const next = day + 1440 * M;
  book.addMinute(minute(next, 905));
  const levels = Object.fromEntries(book.levels(next + M).map((L) => [L.name, L.price]));
  assert.equal(levels.pdh, 1005);
  assert.equal(levels.pdl, 795);
  assert.equal(levels.poc, 905, "the bin that traded most, at its middle");
  assert.ok(levels.val <= 905 && levels.vah >= 905);
  assert.equal("vwap" in levels, false, "VWAP is skipped in the session's first hour");
  for (let k = 1; k <= 60; k++) book.addMinute(minute(next + k * M, 905));
  assert.equal(Math.round(book.levels(next + 61 * M).find((L) => L.name === "vwap").price), 905);
  // A missing day leaves no prior levels rather than stale ones.
  book.addMinute(minute(next + 2 * 1440 * M, 905));
  assert.equal(book.levels(next + 2 * 1440 * M + M).some((L) => L.name === "pdh"), false);
});

test("a stacked imbalance becomes a level until shortly after price returns to it", () => {
  const book = new LevelBook(10);
  const t0 = sessionStart(sessionOf(at("2026-10-20T12:00:00+08:00")));
  const quiet = (t) => [t, 1000, 1000, 990, 995, Array.from({ length: 16 }, (_, k) => [95 + k, 0.5, 0.5])];
  for (let k = 0; k < 4; k++) book.addMinute(quiet(t0 + k * M));
  // Buyers lift three consecutive $10 bins (1010–1040) far above the sells one bin lower.
  const levels = Array.from({ length: 16 }, (_, k) => [95 + k, 0.5, 0.5]).map(([bin, b, s]) => (bin >= 101 && bin <= 103 ? [bin, 20, 0] : [bin, b, s]));
  book.addMinute([t0 + 4 * M, 995, 1045, 990, 1040, levels]);
  const zone = () => book.levels(book.through + M).find((L) => L.name === "stack");
  assert.equal(zone()?.price, 1025);
  // Away from the zone it stays; after price comes back, it lasts five more minutes.
  for (let k = 5; k < 10; k++) book.addMinute([t0 + k * M, 1100, 1105, 1095, 1100, [[110, 1, 1]]]);
  assert.ok(zone());
  book.addMinute([t0 + 10 * M, 1050, 1050, 1030, 1040, [[103, 1, 1]]]);
  for (let k = 11; k <= 14; k++) book.addMinute([t0 + k * M, 1100, 1105, 1095, 1100, [[110, 1, 1]]]);
  assert.ok(zone(), "still there within five minutes of the touch");
  book.addMinute([t0 + 15 * M, 1100, 1105, 1095, 1100, [[110, 1, 1]]]);
  book.addMinute([t0 + 16 * M, 1100, 1105, 1095, 1100, [[110, 1, 1]]]);
  assert.equal(zone(), undefined);
});

test("near() applies the percentage tolerance and eventPrice reads each alert kind", () => {
  const book = new LevelBook(10);
  const day = sessionStart(sessionOf(at("2026-10-20T12:00:00+08:00")));
  for (let k = 0; k < 1440; k++) book.addMinute(minute(day + k * M, k === 0 ? 80_000 : 79_000));
  const t = day + 1440 * M;
  book.addMinute(minute(t, 79_500));
  // Previous-day high 80,005; 0.1 % of 80,000 is $80.
  assert.equal(book.near(t + M, 79_930)?.name, "pdh");
  assert.equal(book.near(t + M, 79_900), null);
  assert.equal(levelText(book.nearest(t + M, 79_930)), "前日高 80,005（差 $75）");

  assert.equal(eventPrice({ kind: "liq", side: "long", low: 100, high: 110 }), 100);
  assert.equal(eventPrice({ kind: "liq", side: "short", low: 100, high: 110 }), 110);
  assert.equal(eventPrice({ kind: "wall_pulled", price: 80_000 }), 80_005);
  assert.equal(eventPrice({ kind: "oi", pct: 1 }, 79_000), 79_000);
  assert.equal(eventPrice({ kind: "print", price: 79_123 }), 79_123);
});

test("right after midnight, the day that just ended already gives the prior levels", () => {
  const book = new LevelBook(10);
  const day = sessionStart(sessionOf(at("2026-10-20T12:00:00+08:00")));
  for (let k = 0; k < 1440; k++) book.addMinute(minute(day + k * M, k === 7 ? 950 : 900));
  assert.equal(book.levels(day + 1440 * M).find((L) => L.name === "pdh")?.price, 955);
});

test("the lab chart's previous-day levels are the ones the level book holds", () => {
  const day = sessionStart(sessionOf(at("2026-10-20T12:00:00Z")));
  const rows = [];
  for (let k = 0; k < 1440; k += 7) rows.push(minute(day + k * M, 79_000 + ((k * 37) % 900), 1 + (k % 5)));
  rows.push(minute(day + 1440 * M, 79_400));
  const book = new LevelBook(10);
  for (const r of rows) book.addMinute(r);
  const held = book.levels(day + 1441 * M).filter((L) => L.name !== "vwap" && L.name !== "stack");
  assert.deepEqual(priorDayLevels(rows, 10).get(sessionOf(day) + 1), held);
});

test("bar detectors sweep the level book's levels, VWAP included, and stamp the bar's close", () => {
  const t0 = at("2026-10-20T10:00:00Z");
  // Twenty quiet 5-minute bars between 990 and 1010, then one that pokes above a level at 1020 and
  // closes back below it.
  const rows = [];
  for (let k = 0; k < 100; k++) rows.push([t0 + k * M, 1000, 1010, 990, 1000, [[99, 1, 1], [100, 1, 1]]]);
  rows.push([t0 + 100 * M, 1000, 1015, 1000, 1012, [[101, 1, 1]]], [t0 + 101 * M, 1012, 1022, 1010, 1015, [[101, 1, 2]]]);
  for (let k = 102; k < 105; k++) rows.push([t0 + k * M, 1015, 1018, 1005, 1008, [[100, 1, 1]]]);
  const end = t0 + 105 * M;
  const events = closedBarEvents(rows, 10, [{ name: "vwap", price: 1020 }], end);
  const sweep = events.find((e) => e.kind === "sweep");
  assert.deepEqual({ ...sweep, note: undefined }, { kind: "sweep", t: end, price: 1020, side: "down", note: undefined });
  assert.match(sweep.note, /VWAP 1,?020/);
  assert.equal(closedBarEvents(rows, 10, [], end).some((e) => e.kind === "sweep"), false, "no level, no sweep of it");
  assert.deepEqual(closedBarEvents(rows, 10, [{ name: "vwap", price: 1020 }], end - M), [], "only at a bar close");
});
