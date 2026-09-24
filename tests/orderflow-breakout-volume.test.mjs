import test from "node:test";
import assert from "node:assert/strict";
import {
  createBreakoutVolumeStory,
  breakoutVolumeSnapshot,
  summarize,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  scenePosition,
} from "../public/orderflow/breakout-volume-model.js";
import {
  cameraAt,
  candleX,
  priceY,
  volumeY,
  drawBreakoutVolume,
} from "../public/orderflow/breakout-volume-view.js";
const story = createBreakoutVolumeStory();
const snapshot = (t) => breakoutVolumeSnapshot(story, t);
test("breakout compares sixty executions with only the five previous equal-time completed bars", () => {
  assert.deepEqual(
    story.bars.slice(0, 5).map((b) => summarize(b.trades).volume),
    [16, 24, 18, 22, 20],
  );
  assert.equal(story.baseline, 20);
  assert.equal(snapshot(0).ratio, 3);
  assert.equal(snapshot(36000).ratio, 3);
  assert.ok(story.bars.every((b) => b.duration === 60000));
  assert.equal(snapshot(0).bars[5].candle.close, 106);
  assert.ok(snapshot(0).bars[5].candle.close > story.level);
});
test("future executions stay hidden and candle/volume changes exactly at each fill", () => {
  for (const bar of story.bars.slice(6))
    for (const trade of bar.trades) {
      const before = snapshot(trade.at - 1).bars[bar.index],
        after = snapshot(trade.at).bars[bar.index];
      assert.equal(after.volume - before.volume, trade.size);
      assert.equal(after.candle.close, trade.price);
      assert.ok(after.trades.every((t) => t.at <= trade.at));
    }
  assert.ok(
    snapshot(0)
      .bars.slice(6)
      .every((b) => !b.candle && b.volume === 0 && !b.complete),
  );
  assert.equal(snapshot(36000).totalVolume, 328);
  assert.deepEqual(
    snapshot(36000).observed.map((bar) => bar.volume),
    [54, 58, 56],
  );
  assert.equal(snapshot(36000).followVolume, 168);
  assert.equal(snapshot(36000).followAverage, 56);
  assert.ok(
    snapshot(36000).observed.every((bar) => bar.volume > story.baseline),
  );
  assert.equal(snapshot(0).followAverage, null);
  assert.equal(snapshot(18300).followAverage, null);
  assert.equal(snapshot(19000).followAverage, 54);
  assert.equal(snapshot(24000).followAverage, 54);
  assert.equal(snapshot(24700).followAverage, 56);
});
test("intrabar dip is visible without prematurely passing or failing the completed-close criterion", () => {
  assert.equal(snapshot(22000).bars[7].candle.close, 103);
  assert.equal(snapshot(22000).bars[7].complete, false);
  assert.equal(snapshot(22000).observed.length, 1);
  assert.equal(snapshot(24700).bars[7].candle.low, 103);
  assert.equal(snapshot(24700).bars[7].candle.close, 105);
  assert.equal(snapshot(24700).passed, 2);
  for (const [i, t] of [19000, 24700, 29600].entries()) {
    assert.equal(snapshot(t - 1).observed.length, i);
    assert.equal(snapshot(t).observed.length, i + 1);
  }
  assert.equal(snapshot(29599).qualified, false);
  assert.equal(snapshot(29600).qualified, true);
  const failed = structuredClone(story);
  failed.bars[8].trades.at(-1).price = 103;
  assert.equal(breakoutVolumeSnapshot(failed, 36000).qualified, false);
});
test("36-second scene joins and reverse seeks preserve exact state and finite render geometry", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b, 0),
    TOTAL_DURATION,
  );
  const initial = JSON.stringify(story);
  for (let i = 0; i < SCENE_DURATIONS.length; i++) {
    assert.equal(scenePosition(i, 0).playhead, SCENE_STARTS[i]);
    if (i < 3)
      assert.equal(
        scenePosition(i, SCENE_DURATIONS[i]).playhead,
        SCENE_STARTS[i + 1],
      );
  }
  for (const t of [0, 7500, 22000, 36000, 19000, 4000, 29600, 0])
    for (const reduced of [false, true]) {
      const state = snapshot(t);
      assert.deepEqual(state, snapshot(t));
      const frame = drawBreakoutVolume({ story, state, playhead: t, reduced });
      assert.doesNotMatch(frame.svg, /NaN|Infinity|undefined/);
    }
  assert.equal(JSON.stringify(story), initial);
});
test("selected and newly forming candles, volume and time labels stay inside the camera crop", () => {
  for (let t = 0; t <= TOTAL_DURATION; t += 80)
    for (const reduced of [false, true]) {
      const { scale, pivotX, pivotY } = cameraAt(t, reduced);
      const state = snapshot(t);
      for (const bar of state.bars.filter((b) => b.index >= 5 && b.candle)) {
        const x = 500 + (candleX(bar.index) - pivotX) * scale;
        const y = (v) => 210 + (v - pivotY) * scale;
        assert.ok(
          x - 30 * scale >= 56 && x + 30 * scale <= 944,
          `x ${t} ${bar.index}`,
        );
        assert.ok(y(priceY(bar.candle.high)) >= 56, `high ${t}`);
        assert.ok(y(priceY(bar.candle.low)) <= 374, `low ${t}`);
        assert.ok(
          y(volumeY(bar.volume) - 20) >= 56 && y(338 + 4) <= 374,
          `volume/label ${t}`,
        );
      }
    }
  assert.deepEqual(cameraAt(0), cameraAt(36000));
});
