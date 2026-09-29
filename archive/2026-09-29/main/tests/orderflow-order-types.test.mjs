import test from "node:test";
import assert from "node:assert/strict";
import {
  createOrderTypesStory,
  orderTypesSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/order-types-model.js";
import {
  drawOrderTypes,
  cameraAt,
} from "../public/orderflow/order-types-view.js";
const story = createOrderTypesStory();
function at(t, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= t);
  return {
    ...scenePosition(scene, t - SCENE_STARTS[scene], reduced),
    state: orderTypesSnapshot(story, t),
  };
}
test("same 30-unit demand walks existing offers while a limit never pays above 101", () => {
  const final = at(TOTAL_DURATION).state;
  assert.deepEqual(
    final.market.fills.map(({ price, size }) => [price, size]),
    [
      [101, 10],
      [102, 20],
    ],
  );
  assert.equal(final.market.filled, 30);
  assert.equal(final.market.value, 3050);
  assert.equal(final.market.avg, 3050 / 30);
  assert.deepEqual(
    final.limit.fills.map(({ price, size }) => [price, size]),
    [
      [101, 10],
      [101, 8],
    ],
  );
  assert.equal(final.limit.filled, 18);
  assert.equal(final.limit.resting, 12);
  assert.equal(final.limit.avg, 101);
  assert.equal(final.limit.asks.find((r) => r.price === 102).remaining, 25);
  assert.equal(story.expected.incoming.fills[0].makerOwn, true);
});
test("execution quantities jump at fills; neither waiting nor camera travel creates trades", () => {
  for (const [kind, fills] of [
    ["market", story.marketFills],
    ["limit", story.limitFills],
  ]) {
    for (const fill of fills) {
      const before = at(fill.playedAt - 1).state[kind],
        after = at(fill.playedAt).state[kind];
      assert.equal(after.filled - before.filled, fill.size);
      assert.equal(after.fills.length - before.fills.length, 1);
    }
  }
  const waitStart = at(TIMING.rest).state.limit,
    waitEnd = at(TIMING.arrival - 1).state.limit;
  assert.deepEqual(waitStart, waitEnd);
  assert.equal(waitStart.filled, 10);
  assert.equal(waitStart.resting, 20);
  assert.equal(at(TIMING.limitFill).state.limit.resting, 20);
  assert.deepEqual(at(0).state.market.fills, []);
  assert.deepEqual(at(0).state.limit.fills, []);
});
test("seeking backwards rebuilds execution and order state without mutating the source", () => {
  const original = structuredClone(story);
  for (const t of [30000, 14400, 8500, 19200, 0, 15400, 6200]) {
    assert.deepEqual(
      orderTypesSnapshot(story, t),
      orderTypesSnapshot(createOrderTypesStory(), t),
    );
    const s = at(t).state;
    for (const kind of ["market", "limit"]) {
      assert.equal(s[kind].filled + s[kind].remaining, 30);
      assert.ok(s[kind].asks.every((r) => r.remaining >= 0));
      assert.ok(s[kind].fills.every((f) => f.playedAt <= t));
    }
  }
  assert.deepEqual(story, original);
});
test("30-second scene joins are continuous and all camera/render samples are finite", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b, 0),
    TOTAL_DURATION,
  );
  for (let scene = 0; scene < 3; scene++)
    assert.equal(
      scenePosition(scene, SCENE_DURATIONS[scene]).playhead,
      scenePosition(scene + 1, 0).playhead,
    );
  for (const reduced of [false, true])
    for (let t = 0; t <= TOTAL_DURATION; t += 125) {
      const svg = drawOrderTypes(at(t, reduced)).svg;
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
      assert.ok(Object.values(cameraAt(t, reduced)).every(Number.isFinite));
      for (const match of svg.matchAll(/(?:width|height|r)="(-?[\d.]+)"/g))
        assert.ok(Number(match[1]) >= 0);
    }
  assert.deepEqual(cameraAt(0), cameraAt(TOTAL_DURATION));
});
test("focused orders have no cropped text from the opposite panel", () => {
  for (const [time, hidden, visible] of [
    [7000, "limit", "market"],
    [18000, "market", "limit"],
  ]) {
    const svg = drawOrderTypes(at(time)).svg;
    for (const layer of ["data-book", "data-book-labels"]) {
      assert.match(svg, new RegExp(`${layer}="${hidden}" opacity="0"`));
      assert.match(svg, new RegExp(`${layer}="${visible}" opacity="1"`));
    }
  }
  for (const time of [0, TOTAL_DURATION]) {
    const svg = drawOrderTypes(at(time)).svg;
    for (const kind of ["market", "limit"])
      assert.match(svg, new RegExp(`data-book="${kind}" opacity="1"`));
  }
});
