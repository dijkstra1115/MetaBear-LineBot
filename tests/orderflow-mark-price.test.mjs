import test from "node:test";
import assert from "node:assert/strict";
import {
  createMarkPriceStory,
  markPriceSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/mark-price-model.js";
import {
  drawMarkPrice,
  cameraAt,
} from "../public/orderflow/mark-price-view.js";
const story = createMarkPriceStory();
const at = (time, reduced = false) => {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= time);
  const p = scenePosition(scene, time - SCENE_STARTS[scene], reduced);
  return { ...p, state: markPriceSnapshot(story, p.time) };
};

test("a synthetic local execution spike can differ from the observed mark, then reconverge", () => {
  assert.equal(at(0).state.last, 100);
  assert.equal(at(0).state.mark, 100);
  const spike = at(TIMING.divergence).state;
  assert.equal(spike.last, 92);
  assert.equal(spike.mark, 99.8);
  assert.ok(Math.abs(spike.gap - 7.8) < 1e-10);
  assert.equal(spike.deviated, true);
  const back = at(TIMING.return).state;
  assert.equal(back.last, 99.2);
  assert.equal(back.mark, 99.4);
  assert.equal(back.deviated, false);
});

test("last and mark remain independent observations; a mark update need not be an execution", () => {
  const before = at(1800).state,
    next = at(3200).state;
  assert.equal(before.last, next.last);
  assert.notEqual(before.mark, next.mark);
  const lastChanged = {
    observations: story.observations.map((o) => ({ ...o, last: 80 })),
  };
  assert.equal(markPriceSnapshot(lastChanged, TIMING.divergence).mark, 99.8);
  assert.ok(
    at(TOTAL_DURATION).state.mark < 99.4,
    "mark is not a fixed or guaranteed stable number",
  );
});

test("new observations are revealed only at their boundaries, without synthetic in-between prices", () => {
  for (const observation of story.observations.slice(1)) {
    const before = at(observation.at - 1).state,
      after = at(observation.at).state;
    assert.equal(after.observations.length, before.observations.length + 1);
    assert.equal(after.last, observation.last);
    assert.equal(after.mark, observation.mark);
  }
  for (let time = 0; time <= TOTAL_DURATION; time += 125)
    assert.ok(at(time).state.observations.every((o) => o.at <= time));
});

test("SVG dots distinguish changed mark observations from changed execution prices", () => {
  const frame = drawMarkPrice(at(3200)).svg;
  assert.match(frame, /data-series="mark" data-at="3200"/);
  assert.doesNotMatch(frame, /data-series="last" data-at="3200"/);
  assert.match(frame, /data-series="last" data-at="1800"/);
});

test("30-second chapters, reduced motion and reverse seeking preserve observations and finite geometry", () => {
  assert.equal(TOTAL_DURATION, 30000);
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b),
    TOTAL_DURATION,
  );
  for (let i = 0; i < 3; i++)
    assert.equal(
      scenePosition(i, SCENE_DURATIONS[i]).time,
      scenePosition(i + 1, 0).time,
    );
  for (let time = TOTAL_DURATION; time >= 0; time -= 125) {
    const p = at(time);
    assert.deepEqual(p.state, markPriceSnapshot(createMarkPriceStory(), time));
    for (const reduced of [false, true]) {
      assert.deepEqual(at(time, reduced).state, p.state);
      assert.doesNotMatch(
        drawMarkPrice(at(time, reduced)).svg,
        /NaN|Infinity|undefined|(?:width|height|r)="-/,
      );
    }
  }
  for (const reduced of [false, true]) {
    assert.equal(cameraAt(0, reduced).scale, 1);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1.28);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 1);
  }
});
