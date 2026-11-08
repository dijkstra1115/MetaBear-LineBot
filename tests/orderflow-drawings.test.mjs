import { test } from "node:test";
import assert from "node:assert/strict";
import { hitDrawing, indexAt, loadDrawings, rangeOf, rangeProfile, saveDrawings, segmentDistance, timeAt } from "../public/lab/orderflow/drawings.js";

const M = 60_000;
const TF = 15 * M;
// Four 15-minute bars with a gap of one bar after the second (no trades in that stretch).
const bars = [0, 1, 3, 4].map((k) => ({ t: k * TF, end: (k + 1) * TF }));

test("drawings: time and bar index map onto each other, gaps and both ends included", () => {
  assert.equal(indexAt(bars, 0, TF), 0);
  assert.equal(indexAt(bars, TF / 2, TF), 0.5);
  assert.equal(indexAt(bars, 3 * TF, TF), 2);
  assert.equal(indexAt(bars, 6 * TF, TF), 5); // two bars past the last one
  assert.equal(indexAt(bars, -TF, TF), -1);
  for (const i of [-1.5, 0, 0.25, 1.5, 2.75, 3, 6.5]) assert.equal(indexAt(bars, timeAt(bars, i, TF), TF), i);
});

test("drawings: a press picks the nearest line, and a trend line's end before its body", () => {
  const toX = (t) => t / M; // 1 px per minute
  const toY = (p) => 1000 - p;
  const list = [
    { id: "h", type: "h", p: 900 },
    { id: "t", type: "t", a: { t: 0, p: 800 }, b: { t: 100 * M, p: 700 } },
  ];
  assert.deepEqual(hitDrawing(list, 50, 104, toX, toY), { id: "h", part: "line" });
  assert.deepEqual(hitDrawing(list, 50, 250, toX, toY), { id: "t", part: "line" });
  assert.deepEqual(hitDrawing(list, 1, 201, toX, toY), { id: "t", part: "a" });
  assert.deepEqual(hitDrawing(list, 100, 300, toX, toY), { id: "t", part: "b" });
  assert.equal(hitDrawing(list, 50, 150, toX, toY), null);
  assert.equal(segmentDistance(5, 5, 0, 0, 0, 0), Math.hypot(5, 5));
});

test("drawings: a fixed range snaps to whole bars, in either order", () => {
  assert.deepEqual(rangeOf(TF + 5 * M, 3 * TF + 14 * M, TF), { a: { t: TF }, b: { t: 4 * TF } });
  assert.deepEqual(rangeOf(3 * TF + 1, TF, TF), { a: { t: TF }, b: { t: 4 * TF } });
  assert.deepEqual(rangeOf(2 * TF, 2 * TF, TF), { a: { t: 2 * TF }, b: { t: 3 * TF } });
});

test("drawings: a fixed range's profile counts only its own bars and finds POC, VAH and VAL", () => {
  const lv = (p, buy, sell) => ({ p, buy, sell });
  const withLevels = [
    { t: 0, end: TF, levels: [lv(100, 50, 50)] }, // before the range: left out
    { t: TF, end: 2 * TF, levels: [lv(100, 10, 0), lv(110, 30, 10), lv(120, 5, 5)] },
    { t: 3 * TF, end: 4 * TF, levels: [lv(110, 20, 20), lv(130, 2, 3)] },
    { t: 4 * TF, end: 5 * TF, levels: [lv(140, 99, 99)] }, // the range's end bound: left out
  ];
  const prof = rangeProfile(withLevels, TF, 4 * TF, TF);
  assert.deepEqual(prof.rows, [[100, 10, 0], [110, 50, 30], [120, 5, 5], [130, 2, 3]]);
  // The POC row (80 of 105) already holds 70 %, so it is the whole value area.
  assert.deepEqual([prof.poc, prof.vah, prof.val], [110, 110, 110]);
  // Otherwise it grows toward the heavier neighbour, a tie going up as on the chart: 15 + 10 (up,
  // the tie) is short of 70 % of 36, then 100 (10) outweighs 130 (1).
  const tie = rangeProfile([{ t: 0, end: TF, levels: [lv(100, 10, 0), lv(110, 15, 0), lv(120, 10, 0), lv(130, 1, 0)] }], 0, TF, TF);
  assert.deepEqual([tie.poc, tie.vah, tie.val], [110, 120, 100]);
  assert.equal(prof.bars, 2);
  assert.equal(prof.partial, false);
  assert.equal(rangeProfile(withLevels, -TF, TF, TF).partial, true);
  assert.equal(rangeProfile(withLevels, 6 * TF, 7 * TF, TF), null);
});

test("drawings: a range is picked by its edges or by its levels inside it", () => {
  const toX = (t) => t / M;
  const toY = (p) => 1000 - p;
  const list = [{ id: "r", type: "r", a: { t: 10 * M }, b: { t: 40 * M } }];
  const levelsOf = () => [900, 950, 850];
  assert.deepEqual(hitDrawing(list, 12, 500, toX, toY, levelsOf), { id: "r", part: "a" });
  assert.deepEqual(hitDrawing(list, 39, 500, toX, toY, levelsOf), { id: "r", part: "b" });
  assert.deepEqual(hitDrawing(list, 25, 101, toX, toY, levelsOf), { id: "r", part: "line" });
  assert.equal(hitDrawing(list, 25, 300, toX, toY, levelsOf), null);
  assert.equal(hitDrawing(list, 60, 100, toX, toY, levelsOf), null); // the levels run on, but only inside picks
});

test("drawings: saved per market, and broken entries are dropped", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  saveDrawings("btc", [{ id: "a", type: "h", p: 80000 }], storage);
  saveDrawings(
    "eth",
    [
      { id: "b", type: "t", a: { t: 1, p: 2 }, b: { t: 3, p: 4 } },
      { id: "c", type: "t", a: { t: 1 } },
      { id: "r", type: "r", a: { t: 1 }, b: { t: 5 } },
      { id: "r2", type: "r", a: { t: 5 }, b: { t: 1 } },
    ],
    storage,
  );
  assert.deepEqual(loadDrawings("btc", storage), [{ id: "a", type: "h", p: 80000 }]);
  assert.deepEqual(loadDrawings("eth", storage).map((d) => d.id), ["b", "r"]);
  assert.deepEqual(loadDrawings("sol", storage), []);
  store.set("metabear-orderflow-drawings", "not json");
  assert.deepEqual(loadDrawings("btc", storage), []);
});
