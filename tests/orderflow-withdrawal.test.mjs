import test from "node:test";
import assert from "node:assert/strict";
import {
  createWithdrawalStory,
  withdrawalSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/withdrawal-model.js";
import {
  drawWithdrawal,
  cameraAt,
} from "../public/orderflow/withdrawal-view.js";
const story = createWithdrawalStory();
function at(t, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= t);
  return {
    ...scenePosition(scene, t - SCENE_STARTS[scene], reduced),
    state: withdrawalSnapshot(story, t),
  };
}
test("cancelling 55 offers changes the best ask, but never the last trade or volume", () => {
  assert.equal(at(0).state.bestAsk, 102);
  for (const [time, bestAsk] of [
    [TIMING.cancelFirst, 103],
    [TIMING.cancelSecond, 104],
  ]) {
    const before = at(time - 1).state,
      after = at(time).state;
    assert.equal(after.bestAsk, bestAsk);
    assert.equal(after.price, 101);
    assert.equal(after.volume, 5);
    assert.deepEqual(after.trades, before.trades);
    assert.deepEqual(after.candle, before.candle);
    assert.equal(
      [...drawWithdrawal(at(time)).svg.matchAll(/data-trade-at=/g)].length,
      1,
    );
  }
  const waiting = at(TIMING.buy - 1).state;
  assert.equal(
    waiting.cancellations.reduce((n, e) => n + e.size, 0),
    55,
  );
  assert.equal(waiting.price, 101);
  assert.equal(waiting.volume, 5);
});
test("only the next buy changes last price to 104 and adds its actual five units", () => {
  const before = at(TIMING.buy - 1).state,
    after = at(TIMING.buy).state;
  assert.equal(before.price, 101);
  assert.equal(after.price, 104);
  assert.deepEqual(before.candle, {
    open: 101,
    high: 101,
    low: 101,
    close: 101,
  });
  assert.deepEqual(after.candle, {
    open: 101,
    high: 104,
    low: 101,
    close: 104,
  });
  assert.match(
    drawWithdrawal(at(TIMING.buy - 1)).svg,
    /data-candle-close="101"/,
  );
  assert.match(drawWithdrawal(at(TIMING.buy)).svg, /data-candle-close="104"/);
  assert.equal(after.volume - before.volume, 5);
  assert.deepEqual(
    after.trades.map(({ price, size }) => [price, size]),
    [
      [101, 5],
      [104, 5],
    ],
  );
  assert.equal(after.asks.find((r) => r.price === 104).size, 35);
  assert.equal(
    [...drawWithdrawal(at(TIMING.buy)).svg.matchAll(/data-trade-at=/g)].length,
    2,
  );
});
test("reverse seeks conserve initial offers across cancellations and executions", () => {
  const original = structuredClone(story);
  for (const t of [35000, 11000, 21500, 0, 12500, 21499, 6000]) {
    const s = at(t).state;
    assert.deepEqual(s, withdrawalSnapshot(createWithdrawalStory(), t));
    const remaining = s.asks.reduce((n, r) => n + r.size, 0),
      cancelled = s.cancellations.reduce((n, e) => n + e.size, 0);
    assert.equal(remaining + cancelled + s.volume, story.initialAskSize);
    assert.ok(s.bids[0].price < s.asks[0].price);
    assert.ok(s.trades.every((f) => f.playedAt <= t));
  }
  assert.deepEqual(story, original);
});
test("35-second joins, finite geometry and reduced-motion states are stable", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b, 0),
    35000,
  );
  for (let scene = 0; scene < 3; scene++)
    assert.equal(
      scenePosition(scene, SCENE_DURATIONS[scene]).time,
      scenePosition(scene + 1, 0).time,
    );
  for (const reduced of [false, true])
    for (let t = 0; t <= TOTAL_DURATION; t += 125) {
      const svg = drawWithdrawal(at(t, reduced)).svg;
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
      assert.ok(Object.values(cameraAt(t, reduced)).every(Number.isFinite));
      for (const m of svg.matchAll(/(?:width|height|r)="(-?[\d.]+)"/g))
        assert.ok(Number(m[1]) >= 0);
      assert.deepEqual(at(t, reduced).state, at(t).state);
    }
  assert.deepEqual(cameraAt(0), cameraAt(TOTAL_DURATION));
});
