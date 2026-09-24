import test from "node:test";
import assert from "node:assert/strict";
import {
  createBreakoutStory,
  breakoutSnapshot,
  marketSnapshot,
  scenePosition,
  SCENE_STARTS,
  SCENE_DURATIONS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/breakout-model.js";
import {
  drawBreakout,
  cameraAt,
  priceY,
} from "../public/orderflow/breakout-view.js";
const story = createBreakoutStory();
function at(playhead, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= playhead);
  const p = scenePosition(scene, playhead - SCENE_STARTS[scene], reduced);
  return { ...p, story, state: breakoutSnapshot(story, p.time) };
}

test("different known depths produce equal final candles from different exact active buy volumes", () => {
  const final = at(TOTAL_DURATION).state.markets;
  assert.deepEqual(
    final.map((m) => m.volume),
    [65, 15],
  );
  assert.deepEqual(
    final.map((m) => m.price),
    [103, 103],
  );
  assert.deepEqual(
    final.map((m) => m.remaining102),
    [0, 0],
  );
  assert.deepEqual(
    final.map((m) => m.remaining103),
    [15, 15],
  );
  assert.deepEqual(final[0].candle, final[1].candle);
  assert.deepEqual(final[0].candle, {
    open: 101,
    high: 103,
    low: 101,
    close: 103,
  });
  assert.deepEqual(
    story.markets[0].fills.map((fill) => [fill.price, fill.size]),
    [
      [102, 20],
      [102, 20],
      [102, 20],
      [103, 5],
    ],
  );
  assert.deepEqual(
    story.markets[1].fills.map((fill) => [fill.price, fill.size]),
    [
      [102, 5],
      [102, 5],
      [103, 5],
    ],
  );
});

test("exhausting the crossed level is separate from the fill above it", () => {
  for (const [index, emptyAt, breakAt] of [
    [0, 17000, TIMING.deepBreak],
    [1, 11500, TIMING.thinBreak],
  ]) {
    const exhausted = at(emptyAt).state.markets[index],
      before = at(breakAt - 1).state.markets[index],
      after = at(breakAt).state.markets[index];
    assert.equal(exhausted.remaining102, 0);
    assert.equal(exhausted.price, 102);
    assert.equal(exhausted.broke, false);
    assert.deepEqual(exhausted, before);
    assert.equal(after.price, 103);
    assert.equal(after.broke, true);
    assert.equal(after.volume - before.volume, 5);
  }
  assert.equal(at(TIMING.thinBreak).state.markets[0].broke, false);
  assert.equal(at(TIMING.thinBreak).state.markets[1].broke, true);
});

test("the shared starting print is context and both markets conserve measured supply across fills", () => {
  for (const source of story.markets) {
    const start = marketSnapshot(source, 0);
    assert.equal(start.price, 101);
    assert.equal(start.volume, 0);
    assert.equal(source.seed.size, 1);
    for (const fill of source.fills) {
      const before = marketSnapshot(source, fill.at - 1),
        after = marketSnapshot(source, fill.at);
      assert.equal(after.volume - before.volume, fill.size);
      assert.equal(
        after.volume + after.remaining102 + after.remaining103,
        source.depth + 20,
      );
      assert.equal(
        before.remaining102 +
          before.remaining103 -
          after.remaining102 -
          after.remaining103,
        fill.size,
      );
      assert.ok(after.trades.every((t) => t.side === "buy" && t.at <= fill.at));
    }
    for (const frame of source.frames)
      assert.ok(frame.bids[0].price < frame.asks[0].price);
  }
  assert.equal(at(TIMING.reset - 1).state.preview, true);
  assert.equal(at(TIMING.reset).state.preview, false);
  assert.ok(at(TIMING.reset).state.markets.every((m) => m.volume === 0));
});

test("35-second chapters and reverse seeks preserve models and finite geometry", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b),
    35000,
  );
  for (let scene = 0; scene < 3; scene++)
    assert.equal(
      scenePosition(scene, SCENE_DURATIONS[scene]).time,
      scenePosition(scene + 1, 0).time,
    );
  for (let time = TOTAL_DURATION; time >= 0; time -= 125) {
    const p = at(time);
    assert.deepEqual(p.state, breakoutSnapshot(createBreakoutStory(), time));
    assert.deepEqual(p.state, at(time, true).state);
    for (const frame of [p, at(time, true)])
      assert.doesNotMatch(
        drawBreakout(frame).svg,
        /NaN|Infinity|undefined|width="-|height="-/,
      );
  }
  for (const reduced of [false, true]) {
    assert.equal(cameraAt(0, reduced).scale, 1);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1.1400000000000001);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 1);
  }
});

test("upper executions and lower totals remain clear of the camera crop", () => {
  for (let time = 5500; time <= TOTAL_DURATION; time += 125) {
    const camera = cameraAt(time);
    const transformX = (px) => camera.x + (px - 620) * camera.scale;
    const transformY = (py) => camera.y + (py - 207) * camera.scale;
    for (const [index, source] of story.markets.entries()) {
      for (const fill of source.fills) {
        const top = transformY(priceY(fill.price, index) - 18 - 12);
        const bottom = transformY(priceY(fill.price, index) - 18 + 3);
        assert.ok(top >= 65 && bottom <= 375);
      }
    }
    assert.ok(transformY(346 + 4) < 375);
    const labels = [
      ...drawBreakout(at(time)).svg.matchAll(
        /<text x="([\d.]+)" y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>本段主動買入<\/text>/g,
      ),
    ];
    assert.equal(labels.length, 2);
    for (const [, labelX, , fontSize] of labels) {
      assert.ok(transformX(Number(labelX)) >= 60);
      assert.ok(
        transformX(Number(labelX) + 6 * Number(fontSize)) < transformX(258),
      );
    }
  }
});
