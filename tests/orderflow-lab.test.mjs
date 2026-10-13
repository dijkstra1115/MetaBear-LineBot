import test from "node:test";
import assert from "node:assert/strict";
import { ARCHIVE_LAG_MS, fromArchive, mergeReadings, readingsAt } from "../public/lab/orderflow/metrics.js";
import { aggregate } from "../public/lab/orderflow/signals.js";
import { findFailedAuctions } from "../public/lab/orderflow/strategy-failed-auction.js";

const M = 60_000;
const BAR = 5 * M;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 2);
// Archive rows: [stamp, OI (BTC), OI (USDT), topPos, topAcc, global, taker]
const archiveRow = (t, oi) => [t, oi, oi * 100_000, 1.5, 1.4, 1.3, 1];
const minute = (t, price, buy = 1, sell = 1) => [t, price, price, price, price, [[Math.floor(price / 10), buy, sell]]];

test("archive metrics rows move to their reading time, five minutes after the stamp", () => {
  assert.equal(ARCHIVE_LAG_MS, BAR);
  assert.deepEqual(fromArchive([archiveRow(T0, 1000)]), [[T0 + BAR, 1000, 1000 * 100_000, 1.5, 1.4, 1.3, 1]]);
  const at = readingsAt([[T0, 1], [T0 + BAR, 2], [T0 + 2 * BAR, 3]]);
  assert.equal(at(T0 - 1), null);
  assert.equal(at(T0)[1], 1);
  assert.equal(at(T0 + BAR - 1)[1], 1);
  assert.equal(at(T0 + 2 * BAR + M)[1], 3);
});

test("archive and collector rows merge on reading time, the archive winning a tie", () => {
  // Archive row stamped T0 is the reading at T0 + 5m; the collector stamps that same reading T0 + 5m.
  const merged = mergeReadings([archiveRow(T0, 1000)], [[T0 + BAR, 999], [T0 + 2 * BAR, 1010]]);
  assert.deepEqual(merged.map((r) => [r[0], r[1]]), [[T0 + BAR, 1000], [T0 + 2 * BAR, 1010]]);
  assert.deepEqual(mergeReadings([archiveRow(T0, 1000)]).map((r) => r[0]), [T0 + BAR]);
});

test("a bar gets the OI read at its close, so an OI change lands on the bar it happened in", () => {
  const rows = [];
  for (let k = 0; k < 15; k++) rows.push(minute(T0 + k * M, 100_000));
  // OI jumps while the second bar [T0 + 5m, T0 + 10m) trades: the archive row stamped T0 + 5m.
  const metrics = [archiveRow(T0 - BAR, 1000), archiveRow(T0, 1000), archiveRow(T0 + BAR, 1100), archiveRow(T0 + 2 * BAR, 1100)];
  const bars = aggregate(rows, 10, fromArchive(metrics));
  assert.deepEqual(bars.map((b) => b.oi), [1000, 1100, 1100]);
});

test("strategy 01 sees an OI drop during the break bar, measured from the break bar's open", () => {
  const prior = T0 - DAY;
  // Prior UTC day: low 99,500, high 100,500, value area at the 100,000 bin (mid 100,005).
  const rows = [minute(prior, 100_000, 50, 50), minute(prior + M, 99_500), minute(prior + 2 * M, 100_500)];
  rows.push(minute(T0, 99_800)); // above the prior low
  rows.push([T0 + BAR, 99_800, 99_800, 99_400, 99_450, [[9940, 5, 80]]]); // breaks it, sellers absorbed at the low
  rows.push([T0 + 2 * BAR, 99_450, 100_100, 99_450, 100_100, [[10010, 10, 1]]]); // reclaims value
  // Positions close while the break bar trades: the reading at its close (archive stamp T0 + 5m) is lower.
  const metrics = [archiveRow(T0, 1000), archiveRow(T0 + BAR, 990), archiveRow(T0 + 2 * BAR, 990)];
  const [c] = findFailedAuctions(rows, 10, fromArchive(metrics), { sides: ["long"] });
  assert.equal(c.sweepT, T0 + BAR);
  assert.deepEqual([c.oi.before, c.oi.low], [1000, 990]);
  assert.equal(c.checks.oi, true);
  assert.equal(c.checks.absorb, true);
});
