import test from "node:test";
import assert from "node:assert/strict";
import {
  createVolumeProfileStory,
  volumeProfileSnapshot,
  scenePosition,
  SCENE_STARTS,
  SCENE_DURATIONS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/volume-profile-model.js";
import {
  drawVolumeProfile,
  fragmentGeometry,
  cameraAt,
} from "../public/orderflow/volume-profile-view.js";
const story = createVolumeProfileStory();
function at(playhead, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= playhead);
  const p = scenePosition(scene, playhead - SCENE_STARTS[scene], reduced);
  return { ...p, story, state: volumeProfileSnapshot(story, p.time) };
}

test("time grouping and price grouping conserve the same selected 140 executed units", () => {
  assert.equal(story.range, "14:30–14:33");
  assert.equal(story.tick, 1);
  assert.equal(story.total, 140);
  assert.deepEqual(
    story.minutes.map((minute) => minute.volume),
    [40, 60, 40],
  );
  assert.ok(story.minutes.every((minute) => minute.duration === 60000));
  assert.deepEqual(story.profile, [
    { price: 103, volume: 20 },
    { price: 102, volume: 40 },
    { price: 101, volume: 60 },
    { price: 100, volume: 20 },
  ]);
  assert.deepEqual(story.poc, { price: 101, volume: 60 });
  const final = at(TOTAL_DURATION).state;
  assert.deepEqual(final.profile, story.profile);
  assert.equal(final.classified, 140);
  assert.equal(final.pending, 0);
  assert.equal(final.inTransit, 0);
  assert.equal(final.complete, true);
});

test("a moving fragment leaves the source immediately and enters the profile only on arrival", () => {
  for (const fragment of story.fragments) {
    const before = at(fragment.depart - 1).state,
      departed = at(fragment.depart).state;
    assert.equal(departed.pending, before.pending - fragment.size);
    assert.equal(departed.inTransit, fragment.size);
    assert.equal(departed.classified, before.classified);
    const moving = at(fragment.depart + fragment.duration - 1).state,
      arrived = at(fragment.depart + fragment.duration).state;
    assert.equal(moving.inTransit, fragment.size);
    assert.equal(arrived.inTransit, 0);
    assert.equal(arrived.pending, departed.pending);
    assert.equal(arrived.classified, moving.classified + fragment.size);
    assert.equal(
      arrived.profile.find((row) => row.price === fragment.price).volume,
      moving.profile.find((row) => row.price === fragment.price).volume +
        fragment.size,
    );
  }
  assert.deepEqual(
    [
      at(6500).state.pending,
      at(6500).state.inTransit,
      at(6500).state.classified,
    ],
    [130, 10, 0],
  );
});

test("every frame has one and only one visible owner for each fragment", () => {
  for (let time = 0; time <= TOTAL_DURATION; time += 100) {
    const p = at(time),
      state = p.state;
    assert.equal(state.pending + state.inTransit + state.classified, 140);
    assert.equal(
      state.pendingByMinute.reduce((sum, size) => sum + size),
      state.pending,
    );
    assert.equal(
      state.profile.reduce((sum, row) => sum + row.volume, 0),
      state.classified,
    );
    for (const reduced of [false, true]) {
      const svg = drawVolumeProfile({ ...p, reduced }).svg;
      const fragments = [
        ...svg.matchAll(
          /data-fragment-id="([^"]+)" data-owner="([^"]+)" data-quantity="(\d+)"/g,
        ),
      ];
      assert.equal(fragments.length, story.fragments.length);
      assert.equal(
        new Set(fragments.map((match) => match[1])).size,
        story.fragments.length,
      );
      assert.equal(
        fragments.reduce((sum, match) => sum + Number(match[3]), 0),
        140,
      );
      for (const [, id, owner] of fragments)
        assert.equal(
          owner,
          state.fragments.find((fragment) => fragment.id === id).owner,
        );
    }
  }
});

test("30-second chapters, backward scrubbing and reduced motion preserve ownership and finite geometry", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b),
    30000,
  );
  for (let scene = 0; scene < 3; scene++)
    assert.equal(
      scenePosition(scene, SCENE_DURATIONS[scene]).time,
      scenePosition(scene + 1, 0).time,
    );
  for (let time = TOTAL_DURATION; time >= 0; time -= 100) {
    const p = at(time);
    assert.deepEqual(
      p.state,
      volumeProfileSnapshot(createVolumeProfileStory(), time),
    );
    assert.deepEqual(p.state, at(time, true).state);
    for (const reduced of [false, true])
      assert.doesNotMatch(
        drawVolumeProfile({ ...p, reduced }).svg,
        /NaN|Infinity|undefined|width="-|height="-/,
      );
  }
  for (const reduced of [false, true]) {
    assert.equal(cameraAt(0, reduced).scale, 1);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1.18);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 1);
  }
});

test("all moving blocks and full text widths stay within the four camera edges", () => {
  for (let time = 0; time <= TOTAL_DURATION; time += 100) {
    for (const reduced of [false, true]) {
      const p = at(time, reduced),
        camera = cameraAt(time, reduced);
      const x = (value) => camera.x + (value - 500) * camera.scale;
      const y = (value) => camera.y + (value - 215) * camera.scale;
      for (const fragment of p.state.fragments) {
        const box = fragmentGeometry(fragment, reduced);
        assert.ok(x(box.x) >= 56 && x(box.x + box.width) <= 944);
        assert.ok(y(box.y) >= 55 && y(box.y + box.height) <= 378);
      }
      const svg = drawVolumeProfile(p).svg;
      const world = svg.slice(
        svg.indexOf('data-camera-scale="'),
        svg.lastIndexOf("</g></g>"),
      );
      const labels = [
        ...world.matchAll(
          /<text x="([\d.-]+)" y="([\d.-]+)"[^>]*font-size="([\d.]+)"([^>]*)>([^<]+)<\/text>/g,
        ),
      ];
      assert.ok(labels.length >= 14);
      for (const [, px, py, fontSize, attrs, label] of labels) {
        const size = Number(fontSize),
          width = label.length * size;
        const left =
          Number(px) -
          (attrs.includes('text-anchor="middle"')
            ? width / 2
            : attrs.includes('text-anchor="end"')
              ? width
              : 0);
        assert.ok(
          x(left) >= 56 && x(left + width) <= 944,
          `horizontal clip at ${time}: ${label}`,
        );
        assert.ok(
          y(Number(py) - size) >= 55 && y(Number(py) + size * 0.28) <= 378,
          `vertical clip at ${time}: ${label}`,
        );
      }
    }
  }
});
