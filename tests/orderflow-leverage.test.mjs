import test from "node:test";
import assert from "node:assert/strict";
import {
  createLeverageStory,
  leverageSnapshot,
  positionMetrics,
  scenePosition,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/leverage-model.js";
import { drawLeverage, cameraAt } from "../public/orderflow/leverage-view.js";

const story = createLeverageStory();
const at = (time, reduced = false) => {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= time);
  const p = scenePosition(scene, time - SCENE_STARTS[scene], reduced);
  return { ...p, state: leverageSnapshot(story, p.time) };
};

test("equal margin changes exposure, not the price change applied to each unit", () => {
  const initial = at(0).state;
  assert.deepEqual(
    initial.accounts.map((a) => a.margin),
    [100, 100],
  );
  assert.deepEqual(
    initial.accounts.map((a) => a.quantity),
    [1, 5],
  );
  assert.deepEqual(
    initial.accounts.map((a) => a.notional),
    [100, 500],
  );
  assert.deepEqual(
    at(TIMING.rise).state.accounts.map((a) => a.pnl),
    [1, 5],
  );
  assert.deepEqual(
    at(TIMING.fall).state.accounts.map((a) => a.pnl),
    [-1, -5],
  );
});

test("equal positions have equal absolute PnL despite different margin and ROI", () => {
  const state = at(TIMING.recover).state;
  assert.deepEqual(
    state.accounts.map((a) => a.quantity),
    [5, 5],
  );
  assert.deepEqual(
    state.accounts.map((a) => a.margin),
    [500, 100],
  );
  assert.deepEqual(
    state.accounts.map((a) => a.pnl),
    [5, 5],
  );
  assert.deepEqual(
    state.accounts.map((a) => a.returnOnMargin),
    [0.01, 0.05],
  );
  for (const a of state.accounts) assert.equal(a.equity, a.margin + a.pnl);
});

test("financial state changes only at the specified quote or comparison boundary", () => {
  for (const { at: time, price } of story.quotes.slice(1)) {
    assert.notEqual(at(time - 1).state.price, price);
    assert.equal(at(time).state.price, price);
    assert.equal(at(time + 500).state.price, price);
  }
  assert.equal(at(TIMING.compare - 1).state.accounts[0].quantity, 1);
  assert.equal(at(TIMING.compare).state.accounts[0].quantity, 5);
  assert.equal(at(TIMING.compare).state.price, 99);
  assert.equal(at(TIMING.compare).state.accounts[0].pnl, -5);
});

test("linear position arithmetic remains consistent for non-integer sizes and rejects invalid inputs", () => {
  const a = positionMetrics({ margin: 75, leverage: 3, entry: 100, price: 98 });
  assert.equal(a.quantity, 2.25);
  assert.equal(a.pnl, -4.5);
  assert.throws(() => positionMetrics({ margin: 0, leverage: 5 }), RangeError);
  assert.throws(
    () => positionMetrics({ margin: 100, leverage: Infinity }),
    RangeError,
  );
});

test("30-second chapters and reverse seeks produce deterministic numbers and finite geometry", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b),
    TOTAL_DURATION,
  );
  assert.equal(TOTAL_DURATION, 30000);
  for (let i = 0; i < SCENE_DURATIONS.length - 1; i++)
    assert.equal(
      scenePosition(i, SCENE_DURATIONS[i]).time,
      scenePosition(i + 1, 0).time,
    );
  for (let time = TOTAL_DURATION; time >= 0; time -= 125) {
    const p = at(time);
    assert.deepEqual(p.state, leverageSnapshot(createLeverageStory(), time));
    for (const reduced of [false, true]) {
      const frame = drawLeverage(at(time, reduced));
      assert.doesNotMatch(
        frame.svg,
        /NaN|Infinity|undefined|(?:width|height|r)="-/,
      );
      assert.deepEqual(at(time, reduced).state, p.state);
    }
  }
  for (const reduced of [false, true]) {
    assert.equal(cameraAt(0, reduced).scale, 1);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1.33);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 1);
  }
});
