import test from "node:test";
import assert from "node:assert/strict";
import {
  createVolumeStory,
  volumeSnapshot,
  scenePosition,
  SCENE_STARTS,
  SCENE_DURATIONS,
  TOTAL_DURATION,
  TIMING,
  summarizeTrades,
} from "../public/orderflow/volume-model.js";
import {
  drawVolume,
  cameraAt,
  volumeY,
} from "../public/orderflow/volume-view.js";
const story = createVolumeStory();
function at(playhead, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= playhead);
  const p = scenePosition(scene, playhead - SCENE_STARTS[scene], reduced);
  return { ...p, story, state: volumeSnapshot(story, p.time) };
}

test("volume counts matched quantity once, including both aggressor directions", () => {
  const state = volumeSnapshot(story, TOTAL_DURATION);
  assert.equal(state.volume, 60);
  assert.equal(state.trades.length, 3);
  assert.deepEqual(
    state.trades.map((fill) => [fill.side, fill.size]),
    [
      ["buy", 20],
      ["sell", 15],
      ["buy", 25],
    ],
  );
  assert.deepEqual(state.candle, {
    open: 101,
    high: 102,
    low: 100,
    close: 102,
  });
  assert.equal(
    summarizeTrades([{ price: 100, size: 60, side: "buy" }]).volume,
    state.volume,
  );
  const changedWaiting = volumeSnapshot(
    { ...story, waiting: 8000 },
    TOTAL_DURATION,
  );
  assert.equal(changedWaiting.volume, state.volume);
});

test("equal-time bars use an explicit fixed comparison baseline", () => {
  assert.deepEqual(
    story.context.map((bar) => bar.volume),
    [24, 30, 36, 60, 15],
  );
  assert.ok(story.context.every((bar) => bar.duration === 60000));
  assert.equal(story.baseline, 30);
  assert.equal(story.context[3].volume / story.baseline, 2);
  assert.equal(story.context[4].volume / story.baseline, 0.5);
  assert.equal(320 - volumeY(60), 2 * (320 - volumeY(30)));
  assert.ok(story.context[4].candle.close < story.context[4].candle.open);
  assert.ok(story.context[4].trades.some((fill) => fill.side === "buy"));
});

test("fill boundaries update the exact column without generating intermediate quantities", () => {
  let total = 0;
  for (const fill of story.fills) {
    assert.equal(at(fill.playedAt - 1).state.volume, total);
    total += fill.size;
    const after = at(fill.playedAt);
    assert.equal(after.state.volume, total);
    assert.match(
      drawVolume(after).svg,
      new RegExp(`data-volume-index="3" data-volume="${total}"`),
    );
  }
  assert.equal(at(TIMING.reset).state.volume, 0);
  assert.match(
    drawVolume(at(TIMING.reset)).svg,
    /data-volume-index="3" data-volume="0"/,
  );
});

test("30-second chapters, reverse seeks and reduced motion preserve data with finite SVG", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b),
    TOTAL_DURATION,
  );
  assert.equal(TOTAL_DURATION, 30000);
  for (let scene = 0; scene < 3; scene++)
    assert.equal(
      scenePosition(scene, SCENE_DURATIONS[scene]).time,
      scenePosition(scene + 1, 0).time,
    );
  for (let time = TOTAL_DURATION; time >= 0; time -= 125) {
    const p = at(time);
    assert.deepEqual(p.state, volumeSnapshot(createVolumeStory(), time));
    assert.deepEqual(p.state, at(time, true).state);
    for (const frame of [p, at(time, true)])
      assert.doesNotMatch(
        drawVolume(frame).svg,
        /NaN|Infinity|undefined|width="-|height="-/,
      );
  }
  for (const reduced of [false, true]) {
    assert.equal(cameraAt(0, reduced).scale, 1);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1.55);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 1);
  }
  assert.deepEqual(
    [...drawVolume(at(0)).svg.matchAll(/data-volume="(\d+)"/g)].map(
      (match) => match[1],
    ),
    [
      ...drawVolume(at(TOTAL_DURATION)).svg.matchAll(/data-volume="(\d+)"/g),
    ].map((match) => match[1]),
  );
});
