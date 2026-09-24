import test from "node:test";
import assert from "node:assert/strict";
import {
  createStopOrdersStory,
  stopOrdersSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/stop-orders-model.js";
import {
  drawStopOrders,
  cameraAt,
} from "../public/orderflow/stop-orders-view.js";
const story = createStopOrdersStory();
function at(t, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= t);
  return {
    ...scenePosition(scene, t - SCENE_STARTS[scene], reduced),
    state: stopOrdersSnapshot(story, t),
  };
}

test("market stop triggers, submits and executes as three separate states", () => {
  assert.equal(at(TIMING.trigger - 1).state.current.triggered, false);
  const triggered = at(TIMING.trigger).state.current;
  assert.equal(triggered.triggered, true);
  assert.equal(triggered.referencePrice, 99);
  assert.equal(triggered.submitted, false);
  assert.equal(triggered.filled, 0);
  const submitted = at(TIMING.submit).state.current;
  assert.equal(submitted.submitted, true);
  assert.equal(submitted.bestBid, 98);
  assert.equal(submitted.filled, 0);
  assert.equal(at(TIMING.firstFill - 1).state.current.filled, 0);
  assert.equal(at(TIMING.firstFill).state.current.filled, 10);
});

test("market sell consumes the highest bid before moving to 97 and computes exact VWAP", () => {
  const before = at(TIMING.firstFill - 1).state.market,
    first = at(TIMING.firstFill).state.market,
    final = at(TIMING.secondFill).state.market;
  assert.equal(before.bestBid, 98);
  assert.equal(first.bestBid, 97);
  assert.equal(first.bids.find((r) => r.price === 98).remaining, 0);
  assert.equal(first.bids.find((r) => r.price === 97).remaining, 20);
  assert.equal(first.price, 98);
  assert.equal(final.price, 97);
  assert.deepEqual(
    final.fills.map(({ price, size }) => [price, size]),
    [
      [98, 10],
      [97, 10],
    ],
  );
  assert.equal(final.filled, 20);
  assert.equal(final.value, 1950);
  assert.equal(final.avg, 97.5);
  assert.equal(final.remaining, 0);
  assert.equal(final.bids.find((r) => r.price === 97).remaining, 10);
  assert.equal(story.market.expected.avg, final.avg);
});

test("the explicit rewind restores the identical starting book before replaying the limit trigger", () => {
  const initial = at(0).state.current,
    rewound = at(TIMING.reset).state;
  assert.equal(at(TIMING.reset - 1).state.kind, "market");
  assert.equal(rewound.kind, "limit");
  assert.equal(rewound.rewinding, true);
  assert.deepEqual(rewound.current.bids, initial.bids);
  assert.equal(rewound.current.price, initial.price);
  assert.equal(rewound.current.filled, 0);
  assert.equal(rewound.current.triggered, false);
  assert.equal(rewound.current.submitted, false);
  assert.equal(at(TIMING.limitTrigger - 1).state.current.triggered, false);
  assert.equal(at(TIMING.limitTrigger).state.current.triggered, true);
  assert.equal(at(TIMING.limitSubmit - 1).state.current.resting, 0);
  const limit = at(TIMING.limitSubmit).state.current;
  assert.equal(limit.submitted, true);
  assert.equal(limit.bestBid, 98);
  assert.equal(limit.resting, 0);
  assert.equal(limit.filled, 0);
  assert.equal(limit.avg, null);
  assert.equal(story.limit.expected.restingPrice, 98);
});

test("the 98 sell limit executes half, then leaves only the unfilled half resting at 98", () => {
  const before = at(TIMING.limitFill - 1).state.limit,
    after = at(TIMING.limitFill).state.limit;
  assert.equal(at(TIMING.limitFill).state.triggerPrice, 99);
  assert.equal(at(TIMING.limitFill).state.limitPrice, 98);
  assert.equal(before.filled, 0);
  assert.equal(before.avg, null);
  assert.equal(before.resting, 0);
  assert.equal(before.bids.find((row) => row.price === 98).remaining, 10);
  assert.equal(before.bestBid, 98);
  assert.deepEqual(
    after.fills.map(({ price, size }) => [price, size]),
    [[98, 10]],
  );
  assert.equal(after.filled, 10);
  assert.equal(after.value, 980);
  assert.equal(after.avg, 98);
  assert.equal(after.remaining, 10);
  assert.equal(after.resting, 10);
  assert.equal(after.bids.find((row) => row.price === 98).remaining, 0);
  assert.equal(after.bids.find((row) => row.price === 97).remaining, 20);
  assert.equal(after.bestBid, 97);
  assert.equal(after.price, 98);
  assert.deepEqual(at(TOTAL_DURATION).state.limit, after);
  assert.equal(after.filled, story.limit.expected.filled);
  assert.equal(after.resting, story.limit.expected.remaining);
  assert.equal(after.avg, story.limit.expected.avg);
  assert.match(
    drawStopOrders(at(TIMING.limitFill - 1)).svg,
    /data-bid-price="98" data-remaining="10"/,
  );
  assert.match(
    drawStopOrders(at(TIMING.limitFill)).svg,
    /data-bid-price="98" data-remaining="0"/,
  );
  assert.doesNotMatch(
    drawStopOrders(at(TIMING.limitFill)).svg,
    /stroke-dasharray="3 4"/,
  );
});

test("the main presentation is one current order; comparison appears only in the final four seconds", () => {
  for (const t of [0, 7000, 10000, 15000, 16000, 22000, 26000, 27999]) {
    const svg = drawStopOrders(at(t)).svg;
    assert.equal([...svg.matchAll(/data-current-order-remaining=/g)].length, 1);
    assert.doesNotMatch(svg, /data-summary/);
  }
  assert.match(drawStopOrders(at(TIMING.summary)).svg, /data-summary/);
  assert.equal(at(TIMING.reset).state.current.remaining, 20);
});

test("background fills and own fills conserve the book across reverse seeks without leaking future data", () => {
  const source = structuredClone(story);
  for (const t of [
    32000, 5499, 24500, 23000, 24499, 9200, 16000, 0, 11800, 21500, 15999,
    19000,
  ]) {
    const state = at(t).state;
    assert.deepEqual(state, stopOrdersSnapshot(createStopOrdersStory(), t));
    for (const kind of ["market", "limit"]) {
      const branch = state[kind];
      assert.equal(branch.filled + branch.remaining, 20);
      assert.equal(
        branch.bids.reduce((n, r) => n + r.remaining, 0) +
          branch.filled +
          branch.reference.reduce((n, f) => n + f.size, 0),
        40,
      );
      assert.ok(branch.bids.every((r) => r.remaining >= 0));
      assert.ok(
        [...branch.reference, ...branch.fills].every((f) => f.playedAt <= t),
      );
    }
  }
  assert.deepEqual(story, source);
});

test("32-second scene joins, both camera passes and reduced motion are seek-safe", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b, 0),
    32000,
  );
  for (let scene = 0; scene < 3; scene++)
    assert.equal(
      scenePosition(scene, SCENE_DURATIONS[scene]).time,
      scenePosition(scene + 1, 0).time,
    );
  for (const reduced of [false, true])
    for (let t = 0; t <= TOTAL_DURATION; t += 100) {
      const svg = drawStopOrders(at(t, reduced)).svg;
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
      assert.ok(Object.values(cameraAt(t, reduced)).every(Number.isFinite));
      for (const m of svg.matchAll(/(?:width|height|r)="(-?[\d.]+)"/g))
        assert.ok(Number(m[1]) >= 0);
      assert.deepEqual(at(t, reduced).state, at(t).state);
    }
  assert.deepEqual(cameraAt(0), cameraAt(TIMING.reset));
  assert.deepEqual(cameraAt(0), cameraAt(TOTAL_DURATION));
});
