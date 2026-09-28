import test from "node:test";
import assert from "node:assert/strict";
import {
  fundingCashflow,
  createFundingStory,
  fundingSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/funding-model.js";
import { drawFunding, cameraAt } from "../public/orderflow/funding-view.js";
const story = createFundingStory();
const at = (time, reduced = false) => {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= time);
  const p = scenePosition(scene, time - SCENE_STARTS[scene], reduced);
  return { ...p, state: fundingSnapshot(story, p.time) };
};

test("positive and negative rates exchange exactly 1 and 2 USDT on fixed 10000 notional", () => {
  const first = at(TIMING.first).state,
    second = at(TIMING.second).state;
  assert.equal(first.notional, 10000);
  assert.equal(first.amount, 1);
  assert.equal(first.payer, "long");
  assert.deepEqual([first.longNet, first.shortNet], [-1, 1]);
  assert.equal(second.amount, 2);
  assert.equal(second.payer, "short");
  assert.deepEqual([second.longNet, second.shortNet], [1, -1]);
  for (const s of second.settlements) assert.equal(s.long + s.short, 0);
});

test("cash flow is zero until settlement, and selecting the next rate does not book its payment early", () => {
  assert.deepEqual([at(0).state.longNet, at(0).state.shortNet], [0, 0]);
  for (const s of story.settlements) {
    assert.equal(
      at(s.at).state.settlements.length,
      at(s.at - 1).state.settlements.length + 1,
    );
    assert.equal(
      at(s.at + 1).state.settlements.length,
      at(s.at).state.settlements.length,
    );
  }
  assert.equal(at(TIMING.next).state.rate, -0.0002);
  assert.equal(at(TIMING.next).state.settled, false);
  assert.deepEqual(
    [at(TIMING.next).state.longNet, at(TIMING.next).state.shortNet],
    [-1, 1],
  );
});

test("fees use position quantity and current mark, not margin or leverage as a separate multiplier", () => {
  const position = { quantity: 100, mark: 100, rate: 0.0001, side: "long" };
  assert.deepEqual(
    fundingCashflow({ ...position, leverage: 5, margin: 2000 }),
    fundingCashflow({ ...position, leverage: 10, margin: 1000 }),
  );
  assert.equal(fundingCashflow({ ...position, mark: 200 }).cashflow, -2);
  assert.equal(fundingCashflow({ ...position, quantity: 50 }).cashflow, -0.5);
  assert.equal(
    fundingCashflow({ ...position, heldAtSettlement: false }).cashflow,
    0,
  );
  assert.equal(fundingCashflow({ ...position, quantity: 0 }).cashflow, 0);
  assert.equal(fundingCashflow({ ...position, rate: 0 }).cashflow, 0);
  assert.throws(() => fundingCashflow({ ...position, mark: 0 }), RangeError);
  assert.throws(
    () => fundingCashflow({ ...position, side: "unknown" }),
    RangeError,
  );
});

test("32-second chapters, reverse seeks and reduced motion never duplicate payments", () => {
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
  const initial = structuredClone(story);
  for (let time = TOTAL_DURATION; time >= 0; time -= 125) {
    const p = at(time);
    assert.deepEqual(p.state, fundingSnapshot(createFundingStory(), time));
    assert.equal(p.state.longNet + p.state.shortNet, 0);
    assert.ok(p.state.settlements.every((s) => s.at <= time));
    for (const reduced of [false, true]) {
      assert.deepEqual(at(time, reduced).state, p.state);
      assert.doesNotMatch(
        drawFunding(at(time, reduced)).svg,
        /NaN|Infinity|undefined|(?:width|height|r)="-/,
      );
    }
  }
  assert.deepEqual(story, initial);
});

test("camera keeps position circles and full-height labels within the viewing window", () => {
  const c = cameraAt(TIMING.focused),
    frame = drawFunding(at(TIMING.first)).svg;
  const window = frame.match(
    /id="funding-window"><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/,
  );
  assert.ok(window);
  const [, left, top, width, height] = window.map(Number);
  const sx = (x) => c.x + (x - 500) * c.scale,
    sy = (y) => c.y + (y - 216) * c.scale;
  assert.ok(
    sy(113 - 12) >= top,
    "cycle heading includes the full glyph height",
  );
  assert.ok(
    sy(322 + 24 * 0.3) <= top + height,
    "cash-flow label includes descenders",
  );
  for (const cx of [225, 775]) {
    assert.ok(sx(cx - 69) >= left);
    assert.ok(sx(cx + 69) <= left + width);
  }
  for (const reduced of [false, true]) {
    assert.equal(cameraAt(0, reduced).scale, 1);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 1);
  }
});
