import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  createHeatmapStory,
  heatmapSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/heatmap-model.js";
import {
  drawHeatmap,
  cameraAt,
  heatColor,
  priceY,
} from "../public/orderflow/heatmap-view.js";
import { narrativeAt } from "../public/orderflow/heatmap-script.js";

const story = createHeatmapStory();
function at(playhead, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= playhead);
  const p = scenePosition(scene, playhead - SCENE_STARTS[scene], reduced);
  return { ...p, state: heatmapSnapshot(story, p.time) };
}
const size102 = (state) => state.rows.find((r) => r.price === 102).size;

test("adding, matching and cancelling produce exact depth with only actual fills counted", () => {
  const snapshots = [0, 30000, 40000, 50000].map((time) =>
    heatmapSnapshot(story, time),
  );
  assert.deepEqual(snapshots.map(size102), [40, 80, 55, 15]);
  const final = heatmapSnapshot(story, 60000);
  assert.equal(final.trades.length, 4);
  assert.equal(final.volume, 53);
  assert.equal(final.price, 102);
  assert.deepEqual(
    final.trades.map(({ price, size, side }) => ({ price, size, side })),
    [
      { price: 100, size: 8, side: "sell" },
      { price: 101, size: 10, side: "buy" },
      { price: 101, size: 10, side: "buy" },
      { price: 102, size: 25, side: "buy" },
    ],
  );
  for (const frame of story.frames) {
    assert.ok(frame.bids[0].price < frame.asks[0].price);
    assert.ok(frame.rows.every((r) => r.size >= 0));
  }
});

test("passive order changes produce neither execution dots nor a change in last-traded price", () => {
  for (const playhead of [TIMING.add, TIMING.cancel]) {
    const before = at(playhead - 1),
      after = at(playhead);
    assert.deepEqual(after.state.trades, before.state.trades);
    assert.equal(after.state.price, before.state.price);
    assert.notEqual(size102(after.state), size102(before.state));
    assert.equal(
      [...drawHeatmap(after).svg.matchAll(/data-trade-at=/g)].length,
      after.state.trades.length,
    );
  }
});

test("historic bands preserve their original quantities and never reveal future order updates", () => {
  const before = heatmapSnapshot(story, 39999),
    after = heatmapSnapshot(story, 60000);
  assert.deepEqual(
    after.bands.filter((b) => b.end <= 30000),
    before.bands.filter((b) => b.end <= 30000),
  );
  assert.equal(
    after.bands.find((b) => b.price === 102 && b.start === 30000).size,
    80,
  );
  assert.equal(
    after.bands.find((b) => b.price === 102 && b.start === 40000).size,
    55,
  );
  assert.equal(
    after.bands.find((b) => b.price === 102 && b.start === 50000).size,
    15,
  );
  for (let t = 0; t <= TOTAL_DURATION; t += 125) {
    const { state } = at(t);
    assert.ok(state.bands.every((b) => b.start < b.end && b.end <= state.time));
    assert.ok(state.trades.every((trade) => trade.playedAt <= t));
  }
});

test("captions, quantity and dots change together at each event boundary", () => {
  for (const trade of story.trades) {
    assert.equal(
      at(trade.playedAt).state.trades.length,
      at(trade.playedAt - 1).state.trades.length + 1,
    );
  }
  const fillOffset = TIMING.fill - SCENE_STARTS[2];
  assert.match(narrativeAt(2, fillOffset).headline, /成交 25.*55/);
  assert.equal(size102(at(TIMING.fill).state), 55);
  assert.doesNotMatch(
    narrativeAt(2, TIMING.cancel - SCENE_STARTS[2] - 1).headline,
    /撤單/,
  );
  assert.match(
    narrativeAt(2, TIMING.cancel - SCENE_STARTS[2]).headline,
    /撤單 40/,
  );
});

test("the 30-second course has continuous chapters, deterministic reverse seeking and finite geometry", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b, 0),
    30000,
  );
  for (let i = 0; i < 3; i++) {
    assert.equal(
      scenePosition(i, SCENE_DURATIONS[i]).time,
      scenePosition(i + 1, 0).time,
    );
  }
  for (let t = TOTAL_DURATION; t >= 0; t -= 125) {
    const p = at(t),
      reduced = at(t, true);
    assert.deepEqual(p.state, heatmapSnapshot(createHeatmapStory(), p.time));
    assert.deepEqual(p.state, reduced.state);
    for (const frame of [p, reduced])
      assert.doesNotMatch(
        drawHeatmap(frame).svg,
        /NaN|Infinity|undefined|width="-/,
      );
  }
  assert.equal(at(0).state.trades.length, 0);
  for (const reduced of [true, false]) {
    assert.equal(cameraAt(0, reduced).scale, 1);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1.45);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 1);
  }
  assert.equal(priceY(102), 170);
});

test("the fixed color scale grows brighter with depth without depending on the current book", () => {
  let last = -1;
  for (let size = 0; size <= 80; size++) {
    const rgb = heatColor(size).match(/\d+/g).map(Number);
    const light = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    assert.ok(light > last);
    last = light;
  }
  assert.equal(heatColor(100), heatColor(80));
});

test("heatmap bookmarks route to the new lesson and all redesigned sidebars link to it", async () => {
  const root = new URL("../public/orderflow/", import.meta.url);
  let destination;
  await runInNewContext(
    `(async () => { ${readFileSync(new URL("academy-entry.js", root), "utf8")} })()`,
    {
      URL,
      URLSearchParams,
      location: {
        href: "https://example.test/orderflow/?lesson=heatmap",
        search: "?lesson=heatmap",
        hash: "",
        replace: (href) => {
          destination = href;
        },
      },
    },
  );
  assert.equal(destination, "./heatmap.html");
  for (const page of [
    "index.html",
    "matching.html",
    "footprint.html",
    "wick.html",
    "heatmap.html",
  ]) {
    assert.match(
      readFileSync(new URL(page, root), "utf8"),
      /href="\.\/heatmap\.html"/,
    );
  }
});
