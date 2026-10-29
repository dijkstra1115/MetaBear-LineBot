import { test } from "node:test";
import assert from "node:assert/strict";
import { bubbleRadius, countdown, eventMark, mergePrints, stackedImbalances } from "../public/lab/orderflow/marks.js";

test("prints merge into one bubble per bar and side, at their size-weighted price", () => {
  const bar = (t) => Math.floor(t / 900);
  const merged = mergePrints(
    [
      [0, "sell", 81560, 100],
      [100, "sell", 81550, 300],
      [200, "buy", 81508, 87],
      [950, "sell", 81600, 20],
    ],
    bar,
  );
  const sell0 = merged.find((m) => m.i === 0 && m.side === "sell");
  assert.equal(sell0.count, 2);
  assert.equal(sell0.qty, 400);
  assert.equal(sell0.price, 81552.5);
  assert.equal(merged.find((m) => m.i === 0 && m.side === "buy").count, 1);
  assert.equal(merged.find((m) => m.i === 1).qty, 20);
  assert.equal(mergePrints([[0, "buy", 1, 1]], () => null).length, 0);
});

test("bubbles grow with the square root of the total and stop at a cap", () => {
  assert.ok(bubbleRadius(10) < bubbleRadius(100));
  assert.equal(bubbleRadius(690), 24);
  assert.equal(bubbleRadius(0), 4);
});

test("one capsule per bar: the event's short name, or how many", () => {
  assert.equal(eventMark([]), null);
  assert.deepEqual(eventMark([{ kind: "sweep", dir: "down" }]), { label: "掃", dir: "down", count: 1 });
  assert.deepEqual(eventMark([{ kind: "oi", dir: null }]), { label: "OI", dir: null, count: 1 });
  assert.deepEqual(eventMark([{ kind: "print", dir: "up" }, { kind: "print", dir: "up" }, { kind: "liq", dir: "up" }]), { label: "3", dir: "up", count: 3 });
  assert.equal(eventMark([{ kind: "sweep", dir: "up" }, { kind: "sweep", dir: "down" }]).dir, null);
});

test("the price tag counts down the forming bar", () => {
  assert.equal(countdown(530_000), "8:50");
  assert.equal(countdown(5_400), "0:06");
  assert.equal(countdown(3_725_000), "1:02:05");
  assert.equal(countdown(-5), "0:00");
});

test("stacked imbalances: three or more adjacent levels imbalanced on one side", () => {
  // Levels high to low, $10 apart; a gap at 120 breaks the second buy run.
  const lv = (p, flags = {}) => ({ p, buy: 1, sell: 1, buyImb: false, sellImb: false, ...flags });
  const levels = [
    lv(200, { sellImb: true }),
    lv(190, { sellImb: true }),
    lv(180, { sellImb: true }),
    lv(170),
    lv(160, { buyImb: true }),
    lv(150, { buyImb: true }),
    lv(140, { buyImb: true }),
    lv(130, { buyImb: true }),
    lv(110, { buyImb: true }),
    lv(100, { buyImb: true }),
  ];
  assert.deepEqual(stackedImbalances(levels, 10), [
    { side: "buy", lo: 130, hi: 170, n: 4 },
    { side: "sell", lo: 180, hi: 210, n: 3 },
  ]);
  assert.deepEqual(stackedImbalances(levels, 10, 5), []);
  assert.deepEqual(stackedImbalances([], 10), []);
});
