import test from "node:test";
import assert from "node:assert/strict";
import {
  LAB_RATIOS,
  LAB_STEPS,
  LAB_CANDLE_TICKS,
  LAB_WARMUP,
  makeLabTape,
  runLab,
  summarizeLab,
} from "../public/orderflow/liquidity-lab-engine.js";

test("the experiment replays one fixed taker stream against every maker rate", () => {
  const first = runLab(44021);
  const second = runLab(44021);
  assert.deepEqual(first, second);
  assert.ok(first.runs[0].stats.takerOrders > 0);
  assert.ok(first.runs.every((run) => run.stats.takerOrders === first.runs[0].stats.takerOrders));
  assert.ok(first.runs.every((run) => run.candles.length === LAB_STEPS / LAB_CANDLE_TICKS));
  const makerCounts = first.runs.map((run) => run.stats.makerOrders);
  assert.ok(makerCounts.every((count, index) => index === 0 || makerCounts[index - 1] > count));
});

test("maker distance and lifetime can change without redrawing the taker stream", () => {
  const shortNear = runLab(44021, LAB_RATIOS, LAB_STEPS, { distance: 0.6, lifetime: 1 });
  const longFar = runLab(44021, LAB_RATIOS, LAB_STEPS, { distance: 1.8, lifetime: 6 });
  assert.deepEqual(shortNear.tape.takers, longFar.tape.takers);
  assert.deepEqual(shortNear.tape.makers, longFar.tape.makers);
  assert.notDeepEqual(shortNear.runs.map((run) => run.path), longFar.runs.map((run) => run.path));
});

test("passive maker arrivals never move the last traded price", () => {
  const tape = makeLabTape(19273, 120);
  for (const run of runLab(19273, LAB_RATIOS, 120).runs) {
    for (let tick = 1; tick < run.path.length; tick++) {
      if (!tape.takers[tick + LAB_WARMUP])
        assert.equal(run.path[tick], run.path[tick - 1]);
    }
  }
});

test("thin supply raises range and empty-book time across many fixed seeds", () => {
  const seeds = Array.from({ length: 40 }, (_, i) => 58001 + i);
  const rows = summarizeLab(seeds);
  assert.equal(rows.length, LAB_RATIOS.length);
  assert.ok(rows[0].rangePct < rows[1].rangePct);
  assert.ok(rows[1].rangePct < rows[2].rangePct);
  assert.ok(rows[2].rangePct < rows[3].rangePct);
  assert.ok(rows[0].fillPct > rows[3].fillPct);
  assert.ok(rows[3].emptyPct > rows[2].emptyPct);
  assert.ok(rows[3].emptyPct > 30);
});
