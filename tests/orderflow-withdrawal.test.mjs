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
  TARGET_INDEX,
  candleFromTrades,
} from "../public/orderflow/withdrawal-model.js";
import {
  drawWithdrawal,
  cameraAt,
  columnX,
  priceY,
  projectPoint,
} from "../public/orderflow/withdrawal-view.js";
const story = createWithdrawalStory();
function at(t, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= t);
  return {
    ...scenePosition(scene, t - SCENE_STARTS[scene], reduced),
    state: withdrawalSnapshot(story, t),
  };
}
test("opening and ending use identical complete history; target derives from the actual fills", () => {
  const opening = at(0).state,
    ending = at(TOTAL_DURATION).state;
  assert.equal(opening.replay, false);
  assert.equal(ending.replay, false);
  assert.equal(opening.bars.length, 11);
  assert.deepEqual(opening.bars, ending.bars);
  assert.deepEqual(opening.bars[TARGET_INDEX], candleFromTrades(story.trades));
  assert.equal(story.contextBars[TARGET_INDEX].trades, story.trades);
  for (const bar of opening.bars) {
    assert.deepEqual(bar, candleFromTrades(bar.trades, bar.index));
  }
  const replay = at(TIMING.reset).state;
  assert.equal(replay.replay, true);
  assert.ok(replay.bars.slice(TARGET_INDEX + 1).every((bar) => bar === null));
  assert.deepEqual(
    replay.bars.slice(0, TARGET_INDEX),
    opening.bars.slice(0, TARGET_INDEX),
  );
  assert.equal(replay.bars[TARGET_INDEX].close, 101);
  assert.equal(at(TIMING.zoomOut).state.replay, false);
  assert.deepEqual(at(TIMING.zoomOut).state.bars, opening.bars);
});
test("cancelling 55 offers changes the best ask, but never the last trade or volume", () => {
  assert.equal(at(TIMING.reset).state.bestAsk, 102);
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
    /data-context-index="5" data-candle-open="101" data-candle-high="101" data-candle-low="101" data-candle-close="101" data-candle-volume="5"/,
  );
  assert.match(
    drawWithdrawal(at(TIMING.buy)).svg,
    /data-context-index="5" data-candle-open="101" data-candle-high="104" data-candle-low="101" data-candle-close="104" data-candle-volume="10"/,
  );
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
  for (const t of [
    38000, 11000, 21500, 0, 12500, 21499, 8000, 29000, 7999, 28999,
  ]) {
    const s = at(t).state;
    assert.deepEqual(s, withdrawalSnapshot(createWithdrawalStory(), t));
    const remaining = s.asks.reduce((n, r) => n + r.size, 0),
      cancelled = s.cancellations.reduce((n, e) => n + e.size, 0);
    assert.equal(remaining + cancelled + s.volume, story.initialAskSize);
    assert.ok(s.bids[0].price < s.asks[0].price);
    assert.ok(s.trades.every((f) => f.playedAt <= s.eventTime));
  }
  assert.deepEqual(story, original);
});
test("38-second joins, finite geometry and reduced-motion states are stable", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b, 0),
    38000,
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
test("the same target candle stays inside the camera window throughout both zooms", () => {
  for (let t = 0; t <= TOTAL_DURATION; t += 50) {
    const camera = cameraAt(t);
    for (const [wx, wy] of [
      [481, priceY(104)],
      [519, priceY(101)],
    ]) {
      const p = projectPoint(wx, wy, camera);
      assert.ok(p.x >= 56 && p.x <= 944, `target x clipped at ${t}`);
      assert.ok(p.y >= 80 && p.y <= 358, `target y clipped at ${t}`);
    }
    if (camera.focus > 0.65)
      for (const [wx, wy] of [
        [148, 72],
        [856, 323],
      ]) {
        const p = projectPoint(wx, wy, camera);
        assert.ok(p.x >= 56 && p.x <= 944, `book x clipped at ${t}`);
        assert.ok(p.y >= 80 && p.y <= 358, `book y clipped at ${t}`);
      }
  }
  for (const t of [0, TOTAL_DURATION])
    for (const bar of story.contextBars) {
      const camera = cameraAt(t);
      for (const [wx, wy] of [
        [columnX(bar.index) - 19, priceY(bar.high)],
        [columnX(bar.index) + 19, priceY(bar.low)],
      ]) {
        const p = projectPoint(wx, wy, camera);
        assert.ok(p.x >= 56 && p.x <= 944);
        assert.ok(p.y >= 80 && p.y <= 358);
      }
    }
});
