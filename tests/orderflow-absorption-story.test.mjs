import test from "node:test";
import assert from "node:assert/strict";
import {
  createAbsorptionStory,
  absorptionSnapshot,
  scenePosition,
  SCENE_STARTS,
  SCENE_DURATIONS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/absorption-story-model.js";
import {
  drawAbsorption,
  cameraAt,
  priceY,
  eventLabelY,
} from "../public/orderflow/absorption-story-view.js";
const story = createAbsorptionStory();
function at(playhead, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= playhead);
  const p = scenePosition(scene, playhead - SCENE_STARTS[scene], reduced);
  return { ...p, story, state: absorptionSnapshot(story, p.time) };
}

test("incoming and completed fill labels remain inside the camera crop", () => {
  for (const fill of story.fills) {
    for (let time = fill.at - 850; time < fill.at + 1800; time += 50) {
      for (const reduced of [false, true]) {
        const camera = cameraAt(time, reduced);
        const top =
          camera.y + (eventLabelY(fill.price) - 18 - 214) * camera.scale;
        const bottom =
          camera.y + (eventLabelY(fill.price) + 8 - 214) * camera.scale;
        assert.ok(top >= 65, `label top clipped at ${time}: ${top}`);
        assert.ok(bottom <= 319, `label bottom clipped at ${time}: ${bottom}`);
      }
    }
  }
  assert.match(drawAbsorption(at(27000)).svg, /y="170"[^>]*>成交 8<\/text>/);
});

test("known finite passive supply absorbs exact active buys at the same price", () => {
  assert.deepEqual(
    story.fills.map((fill) => [fill.price, fill.size, fill.side]),
    [
      [101, 10, "buy"],
      [101, 20, "buy"],
      [101, 30, "buy"],
      [101, 20, "buy"],
      [102, 8, "buy"],
    ],
  );
  assert.deepEqual(
    story.frames.map(
      (frame) => frame.asks.find((row) => row.price === 101)?.size ?? 0,
    ),
    [80, 70, 50, 20, 0, 0],
  );
  const absorbed = at(TIMING.absorbed).state;
  assert.equal(absorbed.price, 101);
  assert.equal(absorbed.volume, 60);
  assert.equal(absorbed.remaining101, 20);
  for (const frame of story.frames) {
    assert.ok(frame.bids[0].price < frame.asks[0].price);
    assert.ok(
      [...frame.bids, ...frame.asks].every(
        (row) => row.size >= 0 && row.hidden === 0,
      ),
    );
  }
});

test("exhausting 101 does not change last price until a separate fill executes at 102", () => {
  const empty = at(TIMING.empty).state,
    later = at(TIMING.higher - 1).state,
    higher = at(TIMING.higher).state;
  assert.equal(empty.remaining101, 0);
  assert.equal(empty.price, 101);
  assert.equal(empty.volume, 80);
  assert.deepEqual(empty, later);
  assert.equal(higher.price, 102);
  assert.equal(higher.volume, 88);
  assert.equal(higher.remaining102, 12);
  assert.deepEqual(higher.rows, [
    { price: 102, buy: 8, sell: 0, volume: 8 },
    { price: 101, buy: 80, sell: 0, volume: 80 },
  ]);
  assert.deepEqual(higher.candle, {
    open: 101,
    high: 102,
    low: 101,
    close: 102,
  });
});

test("resting supply plus executed quantity is conserved across every event boundary", () => {
  for (const fill of story.fills) {
    const before = at(fill.at - 1).state,
      after = at(fill.at).state;
    assert.equal(after.volume - before.volume, fill.size);
    assert.equal(
      before.remaining101 +
        before.remaining102 -
        after.remaining101 -
        after.remaining102,
      fill.size,
    );
    assert.equal(after.volume + after.remaining101 + after.remaining102, 100);
    assert.equal(after.trades.length, before.trades.length + 1);
    assert.equal(
      [...drawAbsorption(at(fill.at)).svg.matchAll(/data-fill-at=/g)].length,
      after.trades.length,
    );
  }
});

test("36-second story remains deterministic when scrubbing backward or reducing motion", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b),
    36000,
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
      absorptionSnapshot(createAbsorptionStory(), time),
    );
    assert.deepEqual(p.state, at(time, true).state);
    for (const frame of [p, at(time, true)])
      assert.doesNotMatch(
        drawAbsorption(frame).svg,
        /NaN|Infinity|undefined|width="-|height="-/,
      );
  }
  assert.equal(at(0).state.price, null);
  for (const reduced of [false, true]) {
    assert.equal(cameraAt(0, reduced).scale, 1);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1.18);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 1);
  }
  assert.equal(priceY(101), 214);
});
