import { test } from "node:test";
import assert from "node:assert/strict";
import { hitDrawing, indexAt, loadDrawings, saveDrawings, segmentDistance, timeAt } from "../public/lab/orderflow/drawings.js";

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

test("drawings: saved per market, and broken entries are dropped", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  saveDrawings("btc", [{ id: "a", type: "h", p: 80000 }], storage);
  saveDrawings("eth", [{ id: "b", type: "t", a: { t: 1, p: 2 }, b: { t: 3, p: 4 } }, { id: "c", type: "t", a: { t: 1 } }], storage);
  assert.deepEqual(loadDrawings("btc", storage), [{ id: "a", type: "h", p: 80000 }]);
  assert.deepEqual(loadDrawings("eth", storage).map((d) => d.id), ["b"]);
  assert.deepEqual(loadDrawings("sol", storage), []);
  store.set("metabear-orderflow-drawings", "not json");
  assert.deepEqual(loadDrawings("btc", storage), []);
});
