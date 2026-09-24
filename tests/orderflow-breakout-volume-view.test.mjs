import test from "node:test";
import assert from "node:assert/strict";
import {
  createBreakoutVolumeStory,
  breakoutVolumeSnapshot,
  TOTAL_DURATION,
} from "../public/orderflow/breakout-volume-model.js";
import {
  cameraAt,
  drawBreakoutVolume,
  volumeY,
} from "../public/orderflow/breakout-volume-view.js";
const story = createBreakoutVolumeStory();

test("the retest and renewed buying remain readable through camera movement", () => {
  for (const reduced of [false, true])
    for (let t = 0; t <= TOTAL_DURATION; t += 100) {
      const state = breakoutVolumeSnapshot(story, t),
        camera = cameraAt(t, reduced),
        bar = state.preview ? state.bars[5] : state.currentBar;
      if (!bar) continue;
      const x = camera.x(bar.index + 0.5),
        half = (9 + 20 * camera.focus) * camera.scale;
      assert.ok(
        x - half >= 68 && x + half <= 905,
        `active footprint x crop at ${t}, reduced=${reduced}`,
      );
      for (const row of bar.footprint) {
        const y = camera.y(row.price),
          h = (11 + 5 * camera.focus) / 2;
        assert.ok(
          y - h >= 57 && y + h <= 247,
          `active price crop at ${t}, ${row.price}`,
        );
      }
      assert.ok(
        volumeY(bar.volume) - 16 >= 271,
        "volume label clears separator",
      );
    }
  for (let i = 0; i < 10; i++)
    assert.equal(cameraAt(0).x(i + 0.5), cameraAt(TOTAL_DURATION).x(i + 0.5));
  for (let p = 98; p <= 109; p++)
    assert.equal(cameraAt(0).y(p), cameraAt(TOTAL_DURATION).y(p));
});

test("forward and reverse event-boundary renders preserve the same visual data", () => {
  const samples = [
    0,
    4000,
    5500,
    6999,
    7000,
    19000,
    22000,
    30000,
    36000,
    37500,
    39000,
    40000,
    ...story.events
      .filter((e) => e.at >= 7000)
      .flatMap((e) => [e.at - 1, e.at, e.at + 1]),
  ];
  for (const reduced of [false, true]) {
    const frames = new Map();
    for (const t of samples) {
      const frame = drawBreakoutVolume({
        story,
        state: breakoutVolumeSnapshot(story, t),
        playhead: t,
        reduced,
      });
      assert.doesNotMatch(frame.svg, /NaN|Infinity|undefined/);
      frames.set(t, frame.svg);
    }
    for (const t of [...samples].reverse())
      assert.equal(
        drawBreakoutVolume({
          story,
          state: breakoutVolumeSnapshot(story, t),
          playhead: t,
          reduced,
        }).svg,
        frames.get(t),
      );
  }
});
