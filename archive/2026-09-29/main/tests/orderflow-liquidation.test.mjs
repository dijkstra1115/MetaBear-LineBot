import test from "node:test";
import assert from "node:assert/strict";
import {
  createLiquidationStory,
  liquidationSnapshot,
  liquidationMetrics,
  scenePosition,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/liquidation-model.js";
import {
  drawLiquidation,
  cameraAt,
  marginWidth,
} from "../public/orderflow/liquidation-view.js";
const story = createLiquidationStory();
const at = (time, reduced = false) => {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= time);
  const p = scenePosition(scene, time - SCENE_STARTS[scene], reduced);
  return { ...p, state: liquidationSnapshot(story, p.time) };
};

test("100 margin at five times leverage opens 500 exposure and loses 25 or 50 at 5 or 10 percent", () => {
  const initial = at(0).state;
  assert.equal(initial.notional, 500);
  assert.equal(initial.margin, 100);
  assert.equal(initial.leverage, 5);
  const first = at(TIMING.drop).state,
    half = at(TIMING.half).state;
  assert.equal(first.marketDrop, 0.05);
  assert.equal(first.loss, 25);
  assert.equal(first.equity, 75);
  assert.equal(half.marketDrop, 0.1);
  assert.equal(half.loss, 50);
  assert.equal(half.equity, 50);
  assert.equal(first.marginLoss, 0.25);
  assert.equal(half.marginLoss, 0.5);
  assert.equal(marginWidth(first.equity), 360);
  assert.equal(marginWidth(half.equity), 240);
});

test("the exact liquidation threshold precedes the hypothetical 20 percent zero-margin point", () => {
  const initial = liquidationMetrics(100),
    trigger = liquidationMetrics(initial.liquidationPrice);
  assert.ok(Math.abs(trigger.mark - 80.40201005025126) < 1e-10);
  assert.ok(Math.abs(trigger.equity - trigger.maintenance) < 1e-10);
  assert.ok(Math.abs(trigger.equity - 2.01005025125628) < 1e-10);
  assert.equal(trigger.triggered, true);
  assert.equal(liquidationMetrics(trigger.mark + 0.000001).triggered, false);
  assert.equal(liquidationMetrics(trigger.mark - 0.000001).triggered, true);
  assert.ok(trigger.marketDrop < 0.2);
  assert.equal(initial.theoreticalZeroPrice, 80);
  assert.equal(liquidationMetrics(80).equity, 0);
});

test("playback freezes at liquidation and never continues the liquidated position to a 20 percent loss", () => {
  const trigger = at(TIMING.trigger).state;
  assert.equal(at(TIMING.trigger - 1).state.triggered, false);
  assert.equal(trigger.triggered, true);
  assert.equal(at(TOTAL_DURATION).state.mark, trigger.mark);
  assert.equal(at(TOTAL_DURATION).state.equity, trigger.equity);
  const extended = {
    ...story,
    quotes: [...story.quotes, { at: 28000, mark: 80 }],
  };
  assert.equal(liquidationSnapshot(extended, 32000).mark, trigger.mark);
  assert.equal(
    liquidationSnapshot(extended, 32000).quotes.length,
    story.quotes.length,
  );
  assert.ok(story.quotes.every((q) => q.mark > 80));
});

test("numbers update at the recorded quote boundaries without future loss or interpolation", () => {
  for (const quote of story.quotes.slice(1)) {
    assert.notEqual(at(quote.at - 1).state.mark, quote.mark);
    assert.equal(at(quote.at).state.mark, quote.mark);
  }
  for (let time = 0; time <= TOTAL_DURATION; time += 125) {
    const state = at(time).state;
    assert.ok(state.quotes.every((q) => q.at <= time));
    assert.equal(state.equity, state.margin + state.pnl);
    assert.ok(Math.abs(state.marginLoss - state.marketDrop * 5) < 1e-12);
  }
});

test("model reflects maintenance or margin changes and rejects invalid inputs", () => {
  const base = story.example;
  assert.ok(
    liquidationMetrics(100, { ...base, margin: 150 }).liquidationPrice <
      liquidationMetrics(100).liquidationPrice,
  );
  assert.ok(
    liquidationMetrics(100, { ...base, maintenanceRate: 0.01 })
      .liquidationPrice > liquidationMetrics(100).liquidationPrice,
  );
  assert.throws(() => liquidationMetrics(NaN), RangeError);
  assert.throws(
    () => liquidationMetrics(100, { ...base, maintenanceRate: 1 }),
    RangeError,
  );
});

test("32-second chapters and reverse seeking preserve finite geometry and exact financial state", () => {
  assert.equal(TOTAL_DURATION, 32000);
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
    assert.deepEqual(
      p.state,
      liquidationSnapshot(createLiquidationStory(), time),
    );
    for (const reduced of [false, true]) {
      assert.deepEqual(at(time, reduced).state, p.state);
      assert.doesNotMatch(
        drawLiquidation(at(time, reduced)).svg,
        /NaN|Infinity|undefined|(?:width|height|r)="-/,
      );
    }
  }
  for (const reduced of [false, true]) {
    assert.equal(cameraAt(0, reduced).scale, 1);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1.12);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 1);
  }
});
