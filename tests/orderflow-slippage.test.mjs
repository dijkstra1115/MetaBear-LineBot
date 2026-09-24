import test from "node:test";
import assert from "node:assert/strict";
import {
  createSlippageStory,
  slippageSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/slippage-model.js";
import { drawSlippage, cameraAt } from "../public/orderflow/slippage-view.js";
const story = createSlippageStory();
function at(t, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= t);
  return {
    ...scenePosition(scene, t - SCENE_STARTS[scene], reduced),
    state: slippageSnapshot(story, t),
  };
}
test("identical orders and best offers produce different exact VWAPs from depth alone", () => {
  const { deep, shallow } = at(TOTAL_DURATION).state;
  assert.equal(deep.filled, 30);
  assert.equal(shallow.filled, 30);
  assert.equal(deep.avg, 101);
  assert.equal(deep.value, 3030);
  assert.equal(deep.slippage, 0);
  assert.deepEqual(
    shallow.fills.map(({ price, size }) => [price, size]),
    [
      [101, 5],
      [102, 15],
      [104, 10],
    ],
  );
  assert.equal(shallow.value, 3075);
  assert.equal(shallow.avg, 102.5);
  assert.equal(shallow.slippage, 1.5);
  assert.equal(shallow.extraCost, 45);
  assert.equal(shallow.asks.find((r) => r.price === 103).remaining, 0);
  assert.equal(shallow.asks.find((r) => r.price === 104).remaining, 10);
  assert.equal(deep.avg, story.deep.expected.avg);
  assert.equal(shallow.avg, story.shallow.expected.avg);
});
test("every visible fill and average changes exactly at its execution boundary", () => {
  for (const kind of ["deep", "shallow"])
    for (const fill of story[kind].fills) {
      const before = at(fill.playedAt - 1).state[kind],
        after = at(fill.playedAt).state[kind];
      assert.equal(after.filled - before.filled, fill.size);
      assert.equal(after.value - before.value, fill.size * fill.price);
      assert.equal(after.fills.length - before.fills.length, 1);
    }
  assert.equal(at(TIMING.shallowSecond).state.shallow.avg, 101.75);
  assert.equal(at(TIMING.shallowFirst - 1).state.shallow.avg, null);
  assert.doesNotMatch(
    drawSlippage(at(TIMING.shallowThird - 1)).svg,
    /data-fill-price="104"/,
  );
  assert.match(
    drawSlippage(at(TIMING.shallowThird)).svg,
    /data-fill-price="104"/,
  );
});
test("reversed seeks preserve fills, residual offers and quantity conservation", () => {
  const original = structuredClone(story);
  for (const t of [30000, 13400, 20000, 0, 16600, 7200, 23000]) {
    assert.deepEqual(
      slippageSnapshot(story, t),
      slippageSnapshot(createSlippageStory(), t),
    );
    for (const kind of ["deep", "shallow"]) {
      const s = at(t).state[kind];
      assert.equal(s.filled + s.remaining, 30);
      assert.equal(
        s.asks.reduce((n, r) => n + r.remaining, 0) + s.filled,
        story[kind].initial.reduce((n, r) => n + r.size, 0),
      );
      assert.ok(s.fills.every((f) => f.playedAt <= t));
    }
  }
  assert.deepEqual(story, original);
});
test("scene boundaries, reduced motion and continuous camera geometry stay seek-safe", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b, 0),
    30000,
  );
  for (let scene = 0; scene < 3; scene++)
    assert.equal(
      scenePosition(scene, SCENE_DURATIONS[scene]).time,
      scenePosition(scene + 1, 0).time,
    );
  for (const reduced of [false, true])
    for (let t = 0; t <= TOTAL_DURATION; t += 125) {
      const svg = drawSlippage(at(t, reduced)).svg;
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
      assert.ok(Object.values(cameraAt(t, reduced)).every(Number.isFinite));
      for (const match of svg.matchAll(/(?:width|height|r)="(-?[\d.]+)"/g))
        assert.ok(Number(match[1]) >= 0);
      assert.deepEqual(at(t, reduced).state, at(t, false).state);
    }
  assert.deepEqual(cameraAt(0), cameraAt(TOTAL_DURATION));
});
test("zoom hides the complete opposite book and restores both books in the overview", () => {
  for (const [time, hidden, visible] of [
    [8000, "shallow", "deep"],
    [20500, "deep", "shallow"],
  ]) {
    const svg = drawSlippage(at(time)).svg;
    for (const layer of ["data-book", "data-book-labels"]) {
      assert.match(svg, new RegExp(`${layer}="${hidden}" opacity="0"`));
      assert.match(svg, new RegExp(`${layer}="${visible}" opacity="1"`));
    }
  }
  for (const time of [0, TOTAL_DURATION]) {
    const svg = drawSlippage(at(time)).svg;
    for (const kind of ["deep", "shallow"])
      assert.match(svg, new RegExp(`data-book="${kind}" opacity="1"`));
  }
});
