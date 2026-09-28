import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeltaConceptStory,
  deltaConceptSnapshot,
  scenePosition,
  SCENE_STARTS,
  SCENE_DURATIONS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/delta-concept-model.js";
import {
  drawDeltaConcept,
  cameraAt,
  cvdY,
  deltaY,
} from "../public/orderflow/delta-concept-view.js";
const story = createDeltaConceptStory();
function at(playhead, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= playhead);
  const p = scenePosition(scene, playhead - SCENE_STARTS[scene], reduced);
  return { ...p, story, state: deltaConceptSnapshot(story, p.time) };
}

test("each completed minute derives signed delta and total volume from known aggressor executions", () => {
  assert.deepEqual(
    story.minutes.map(({ buy, sell, volume, delta }) => ({
      buy,
      sell,
      volume,
      delta,
    })),
    [
      { buy: 40, sell: 15, volume: 55, delta: 25 },
      { buy: 10, sell: 20, volume: 30, delta: -10 },
      { buy: 25, sell: 10, volume: 35, delta: 15 },
    ],
  );
  assert.ok(story.minutes.every((minute) => minute.duration === 60000));
  for (const minute of story.minutes) {
    assert.equal(
      minute.rows.reduce((sum, row) => sum + row.buy, 0),
      minute.buy,
    );
    assert.equal(
      minute.rows.reduce((sum, row) => sum + row.sell, 0),
      minute.sell,
    );
    assert.equal(
      minute.volume,
      minute.trades.reduce((sum, trade) => sum + trade.size, 0),
    );
  }
  assert.equal(story.minutes[0].trades.length, 3);
  assert.notEqual(story.minutes[0].delta, story.minutes[0].trades.length);
});

test("CVD uses the declared common zero point and retains prior minutes rather than resetting each bar", () => {
  assert.equal(story.resetLabel, "14:30");
  assert.deepEqual(
    story.minutes.map((minute) => minute.cvd),
    [25, 15, 30],
  );
  let sum = 0;
  for (const minute of story.minutes) {
    sum += minute.delta;
    assert.equal(minute.cvd, sum);
  }
  assert.deepEqual(at(TOTAL_DURATION).state.points, [
    { label: "14:30", value: 0 },
    { label: "14:31", value: 25 },
    { label: "14:32", value: 15 },
    { label: "14:33", value: 30 },
  ]);
  assert.equal(at(0).state.cvd, 0);
  assert.equal(deltaY(-10) > deltaY(0), true);
  assert.equal(cvdY(30) < cvdY(15), true);
});

test("every reveal boundary exposes exact completed values without interpolating quantities", () => {
  for (const [index, time] of story.deltaAt.entries()) {
    assert.equal(at(time - 1).state.deltaCount, index);
    assert.equal(at(time).state.deltaCount, index + 1);
    assert.equal(at(time).state.deltas.at(-1), story.minutes[index].delta);
    assert.match(
      drawDeltaConcept(at(time)).svg,
      new RegExp(
        `data-delta-index="${index}" data-delta="${story.minutes[index].delta}"`,
      ),
    );
  }
  for (const [index, time] of story.cvdAt.entries()) {
    assert.equal(at(time - 1).state.cvdCount, index);
    assert.equal(at(time).state.cvdCount, index + 1);
    assert.equal(at(time).state.cvd, story.minutes[index].cvd);
    assert.equal(at(time + 750).state.cvd, story.minutes[index].cvd);
  }
});

test("30-second playback and reverse seeking preserve calculations and finite chart geometry", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b),
    30000,
  );
  for (let scene = 0; scene < 3; scene++)
    assert.equal(
      scenePosition(scene, SCENE_DURATIONS[scene]).time,
      scenePosition(scene + 1, 0).time,
    );
  for (let time = TOTAL_DURATION; time >= 0; time -= 125) {
    const p = at(time);
    assert.deepEqual(
      p.state,
      deltaConceptSnapshot(createDeltaConceptStory(), time),
    );
    assert.deepEqual(p.state, at(time, true).state);
    for (const frame of [p, at(time, true)])
      assert.doesNotMatch(
        drawDeltaConcept(frame).svg,
        /NaN|Infinity|undefined|width="-|height="-/,
      );
  }
  for (const reduced of [false, true]) {
    assert.equal(cameraAt(0, reduced).scale, 1);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1.6);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 1);
  }
});
