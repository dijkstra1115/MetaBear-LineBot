import test from "node:test";
import assert from "node:assert/strict";
import {
  createAbsorptionStory,
  absorptionSnapshot,
  TOTAL_DURATION,
} from "../public/orderflow/absorption-story-model.js";
import {
  cameraAt,
  drawAbsorption,
} from "../public/orderflow/absorption-story-view.js";
const story = createAbsorptionStory();

test("the active footprint stays inside the price viewport throughout zoom, pan and return", () => {
  for (const reduced of [false, true])
    for (let time = 0; time <= TOTAL_DURATION; time += 100) {
      const state = absorptionSnapshot(story, time),
        camera = cameraAt(time, reduced),
        bar = state.currentBar;
      if (!bar) continue;
      const x = camera.x(bar.index + 0.5),
        half = bar.index >= 3 ? 29 * camera.scale : 6 * camera.scale;
      assert.ok(
        x - half >= 68 && x + half <= 905,
        `x crop at ${time}, reduced=${reduced}`,
      );
      for (const row of bar.footprint) {
        const y = camera.y(row.price),
          halfHeight = 7 * (1 + 0.65 * camera.focus);
        assert.ok(
          y - halfHeight >= 54 && y + halfHeight <= 247,
          `row crop ${row.price} at ${time}`,
        );
      }
      assert.ok(
        318 - bar.volume * 0.12 - 11 >= 266,
        "volume label must stay below separator",
      );
    }
});

test("all replay and quote boundaries render finite, deterministic geometry in either direction", () => {
  const samples = [
    0,
    4000,
    5500,
    6999,
    7000,
    14000,
    22000,
    32000,
    42000,
    44000,
    46000,
    48000,
    ...story.events
      .filter((e) => e.at >= 7000)
      .flatMap((e) => [e.at - 1, e.at, e.at + 1]),
  ];
  const frames = new Map();
  for (const reduced of [false, true]) {
    for (const time of samples) {
      const state = absorptionSnapshot(story, time),
        frame = drawAbsorption({ state, playhead: time, reduced });
      assert.doesNotMatch(frame.svg, /NaN|Infinity|undefined/);
      frames.set(`${reduced}:${time}`, frame.svg);
    }
    for (const time of [...samples].reverse()) {
      const state = absorptionSnapshot(story, time);
      assert.equal(
        drawAbsorption({ state, playhead: time, reduced }).svg,
        frames.get(`${reduced}:${time}`),
      );
    }
  }
});
