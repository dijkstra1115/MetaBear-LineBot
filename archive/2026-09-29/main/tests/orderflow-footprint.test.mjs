import test from "node:test";
import assert from "node:assert/strict";
import {
  createFootprintStory,
  footprintSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/footprint-model.js";
import {
  drawFootprint,
  priceY,
  cameraAt,
} from "../public/orderflow/footprint-view.js";
import { narrativeAt } from "../public/orderflow/footprint-script.js";

const story = createFootprintStory();
function at(playhead, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= playhead);
  const start = SCENE_STARTS[scene];
  const p = scenePosition(scene, playhead - start, reduced);
  return { ...p, state: footprintSnapshot(story, p.time), story };
}

test("seven genuine matching fills produce the planned footprint and OHLC, counted once", () => {
  const final = footprintSnapshot(story, 60000);
  assert.equal(final.trades.length, 7);
  assert.deepEqual(final.rows, [
    { price: 102, buy: 15, sell: 0, volume: 15 },
    { price: 101, buy: 35, sell: 12, volume: 47 },
    { price: 100, buy: 0, sell: 12, volume: 12 },
  ]);
  assert.equal(
    final.rows.reduce((n, r) => n + r.volume, 0),
    74,
  );
  assert.deepEqual(final.candle, {
    open: 101,
    high: 102,
    low: 100,
    close: 102,
    closed: true,
  });
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b, 0),
    30000,
  );
  for (const frame of story.frames) {
    if (frame.bids.length && frame.asks.length)
      assert.ok(frame.bids[0].price < frame.asks[0].price);
    for (const row of [...frame.bids, ...frame.asks]) assert.ok(row.size > 0);
  }
});

test("new passive depth does not add volume or change the candle", () => {
  const before = footprintSnapshot(story, 24999),
    after = footprintSnapshot(story, 25000);
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual(after.candle, before.candle);
  assert.deepEqual(after.bids[0], { price: 101, size: 20, own: 0, hidden: 0 });
});

test("the counter and candle advance at the fill boundary, never during approach", () => {
  for (const [index, trade] of story.trades.entries()) {
    const before = at(trade.playedAt - 1),
      now = at(trade.playedAt);
    assert.equal(before.state.trades.length, index);
    assert.equal(now.state.trades.length, index + 1);
    assert.equal(now.state.price, trade.price);
    assert.equal(now.state.candle.close, trade.price);
    const beforeVolume =
      before.state.rows.find((r) => r.price === trade.price)?.[trade.side] ?? 0;
    const afterVolume = now.state.rows.find((r) => r.price === trade.price)[
      trade.side
    ];
    assert.equal(afterVolume - beforeVolume, trade.size);
    assert.match(
      drawFootprint(now).svg,
      new RegExp(
        `data-footprint-side="${trade.side}" data-price="${trade.price}" data-volume="${afterVolume}"`,
      ),
    );
  }
});

test("seeking backwards and replaying recovers the exact chart without accumulated state", () => {
  for (const t of [30000, 19200, 4200, 9100, 0, 15000, 12500, 21000, 6700]) {
    const p = at(t),
      fresh = { ...p, story: createFootprintStory() };
    fresh.state = footprintSnapshot(fresh.story, p.time);
    assert.deepEqual(p.state, fresh.state);
    assert.equal(drawFootprint(p).svg, drawFootprint(fresh).svg);
  }
  assert.deepEqual(at(0).state.rows, []);
  assert.equal(at(0).state.candle, null);
});

test("chapters meet continuously and captions do not announce an unfilled trade", () => {
  for (let i = 0; i < 3; i++) {
    const end = scenePosition(i, SCENE_DURATIONS[i]),
      next = scenePosition(i + 1, 0);
    assert.equal(end.playhead, next.playhead);
    assert.equal(end.time, next.time);
  }
  const accumulationAt = story.trades[1].playedAt - SCENE_STARTS[1];
  assert.doesNotMatch(narrativeAt(1, accumulationAt - 1).headline, /累加/);
  assert.match(narrativeAt(1, accumulationAt).headline, /同價.*累加/);
  assert.match(narrativeAt(3, 0).headline, /賣出 12 隻.*買入 35 隻/);
  for (let t = 0; t <= TOTAL_DURATION; t += 100) {
    const { scene, elapsed } = at(t);
    assert.equal(narrativeAt(scene, elapsed).question, "");
  }
});

test("reduced motion preserves real data and all chart frames have finite geometry", () => {
  for (let t = 0; t <= TOTAL_DURATION; t += 125) {
    const p = at(t),
      reduced = at(t, true);
    assert.deepEqual(p.state, reduced.state);
    for (const frame of [p, reduced])
      assert.doesNotMatch(drawFootprint(frame).svg, /NaN|Infinity|undefined/);
  }
  assert.equal(priceY(102), 147);
  assert.equal(priceY(101), 222);
  assert.equal(priceY(100), 297);
});

test("panorama opens and closes on the same five footprints and the same camera", () => {
  assert.equal(story.context.length, 5);
  assert.deepEqual(story.context[2].rows, footprintSnapshot(story, 60000).rows);
  assert.deepEqual(
    story.context[2].candle,
    footprintSnapshot(story, 60000).candle,
  );
  for (const reduced of [false, true]) {
    assert.equal(
      cameraAt(0, reduced).scale,
      cameraAt(TOTAL_DURATION, reduced).scale,
    );
    assert.equal(
      cameraAt(TIMING.zoomIn, reduced).scale,
      cameraAt(0, reduced).scale,
    );
    assert.equal(cameraAt(TIMING.firstFill, reduced).scale, 1);
    assert.equal(cameraAt(TIMING.zoomOut - 1, reduced).scale, 1);
    const start = drawFootprint(at(TIMING.zoomIn - 1, reduced)).svg;
    const end = drawFootprint(at(TOTAL_DURATION, reduced)).svg;
    const volumes = (svg) =>
      [
        ...svg.matchAll(
          /data-(?:footprint|context)-side="(buy|sell)" data-price="(\d+)" data-volume="(\d+)"/g,
        ),
      ].map((m) => m.slice(1));
    assert.deepEqual(volumes(start), volumes(end));
    for (const label of ["14:28", "14:29", "14:30", "14:31", "14:32"]) {
      assert.match(start, new RegExp(`data-footprint-minute="${label}"`));
      assert.match(end, new RegExp(`data-footprint-minute="${label}"`));
    }
  }
});

test("the completed opening is explicitly a preview; the replay resets before its first fill", () => {
  assert.equal(cameraAt(TIMING.reset - 100).preview, true);
  assert.equal(cameraAt(TIMING.reset + 100).preview, false);
  assert.match(drawFootprint(at(0)).svg, /data-presentation="overview"/);
  assert.match(
    drawFootprint(at(TIMING.reset + 100)).svg,
    /data-presentation="replay"/,
  );
  const reset = drawFootprint(at(TIMING.reset + 100)).svg;
  const targetValues = [
    ...reset.matchAll(
      /data-footprint-side="(?:buy|sell)" data-price="\d+" data-volume="(\d+)"/g,
    ),
  ];
  assert.equal(targetValues.length, 6);
  assert.ok(targetValues.every((m) => Number(m[1]) === 0));
  assert.deepEqual(at(TIMING.reset + 100).state.rows, []);
  assert.match(narrativeAt(1, 0).headline, /回看/);
  assert.match(narrativeAt(3, SCENE_DURATIONS[3]).headline, /回到全景/);
});
