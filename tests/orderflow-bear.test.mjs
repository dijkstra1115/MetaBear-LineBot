import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bearPrice,
  bearSize,
  legacyPrice,
  legacySize,
} from "../public/orderflow/bear-market.js";
import {
  createWickStory,
  wickSnapshot,
  scenePosition as wickPosition,
  SCENE_DURATIONS as wickDurations,
} from "../public/orderflow/wick-model.js";
import {
  createRevisitStory,
  scenePosition as revisitPosition,
  SCENE_DURATIONS as revisitDurations,
} from "../public/orderflow/revisit-model.js";
import {
  createDeltaStory,
  scenePosition as deltaPosition,
  SCENE_DURATIONS as deltaDurations,
} from "../public/orderflow/delta-model.js";
import { drawWick } from "../public/orderflow/wick-view.js";
import { drawRevisit } from "../public/orderflow/revisit-view.js";
import { drawDelta } from "../public/orderflow/delta-view.js";

test("the story denomination preserves every price tick and every traded unit exactly", () => {
  assert.equal(legacyPrice(68419.5), "99");
  assert.equal(legacyPrice(68420), "100");
  assert.equal(legacyPrice(68420.5), "101");
  assert.equal(legacySize(0.005), "1");
  const story = createDeltaStory();
  for (const f of story.frames) {
    for (const r of [...f.state.bids, ...f.state.asks, ...f.state.trades]) {
      assert.ok(
        Math.abs(bearPrice(r.price) - ((r.price - 68420) * 2 + 100)) < 1e-7,
      );
      assert.ok(Math.abs(bearSize(r.size) - r.size * 200) < 1e-7);
      assert.ok(bearSize(r.size) > 0);
    }
  }
});

test("all established story views and narration use bear units and small prices", () => {
  for (const [create, position, durations, draw] of [
    [createWickStory, wickPosition, wickDurations, drawWick],
    [createRevisitStory, revisitPosition, revisitDurations, drawRevisit],
    [createDeltaStory, deltaPosition, deltaDurations, drawDelta],
  ]) {
    const story = create();
    for (let scene = 0; scene < durations.length; scene++)
      for (const fraction of [0, 0.25, 0.6, 1]) {
        const p = position(scene, durations[scene] * fraction);
        const state = wickSnapshot(story, p.time);
        const { svg } = draw({ story, state, scene, ...p });
        const labels = [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)]
          .map((m) => m[1])
          .join(" ");
        assert.doesNotMatch(
          labels,
          /BTC|USDT|68,4\d\d|\b684\d\d|\d+\.\d+\s*(?:隻|元)/,
        );
      }
  }
  for (const file of [
    "matching.html",
    "candles.html",
    "wick.html",
    "revisit.html",
    "delta.html",
    "primer-script.js",
    "wick-script.js",
    "revisit-script.js",
    "delta-script.js",
  ]) {
    const copy = readFileSync(
      new URL("../public/orderflow/" + file, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(copy, /BTC|USDT|68,4\d\d|\d+\.\d+\s*(?:隻|元)/);
  }
});
