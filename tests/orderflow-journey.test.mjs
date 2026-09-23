import test from "node:test";
import assert from "node:assert/strict";
import {
  createJourneyStory,
  snapshotAt,
  JOURNEY_DURATION,
} from "../public/orderflow/journey-model.js";
import {
  createAbsorptionStory,
  BASE_PRICE,
  CANDLE_INTERVAL,
} from "../public/orderflow/absorption-model.js";
import {
  journey,
  journeyIndex,
} from "../public/orderflow/journey-curriculum.js";
import { curriculum } from "../public/orderflow/curriculum.js";
import { round, metrics } from "../public/orderflow/engine.js";
import { drawJourneyChart } from "../public/orderflow/journey-charts.js";
const sum = (rows) => round(rows.reduce((total, row) => total + row.size, 0));

test("six journeys cover all legacy courses and every market scene advances the same timeline", () => {
  assert.equal(journey.length, 6);
  for (const course of curriculum)
    assert.ok(
      journey.some((part) => part.covers.includes(course.id)),
      course.id,
    );
  assert.equal(journeyIndex("matching"), 0);
  assert.equal(journeyIndex("iceberg"), 1);
  assert.equal(journeyIndex("unknown"), 0);
  const story = createJourneyStory();
  let last = 0;
  for (const part of journey.slice(1)) {
    assert.equal(part.start, last);
    for (const scene of part.scenes) {
      assert.ok(scene.end > last);
      assert.ok(
        story.events.some((event) => event.at > last && event.at <= scene.end),
        "Each scene contains a market event",
      );
      const before = snapshotAt(story, last),
        after = snapshotAt(story, scene.end);
      assert.deepEqual(
        after.trades.slice(0, before.trades.length),
        before.trades,
      );
      last = scene.end;
    }
    assert.equal(last, part.end);
  }
  assert.equal(last, JOURNEY_DURATION);
});

test("the accepted absorption market is preserved exactly before the new continuation", () => {
  const original = createAbsorptionStory(),
    story = createJourneyStory();
  for (const frame of original.frames) {
    const state = snapshotAt(story, frame.at);
    for (const key of Object.keys(frame.state))
      assert.deepEqual(state[key], frame.state[key]);
  }
  assert.deepEqual(story, createJourneyStory());
});

test("public additions and removals conserve depth; mark, funding and liquidation reports do not invent fills", () => {
  const story = createJourneyStory(),
    initial = story.frames[0].state;
  for (const { at, state } of story.frames) {
    const events = story.events.filter((event) => event.at <= at);
    for (const side of ["sell", "buy"]) {
      const additions = sum(
        events.filter((event) => event.kind === "add" && event.side === side),
      );
      const removals = sum(
        events.filter(
          (event) => event.kind === "remove" && event.side === side,
        ),
      );
      const consumed = sum(state.trades.filter((trade) => trade.side !== side));
      const key = side === "sell" ? "asks" : "bids";
      assert.equal(
        sum(state[key]),
        round(sum(initial[key]) + additions - removals - consumed),
      );
    }
    assert.ok(state.bids[0].price < state.asks[0].price);
    assert.ok(
      [...state.bids, ...state.asks].every(
        (row) => row.size > 0 && Object.keys(row).length === 2,
      ),
    );
    const totals = metrics(state.trades);
    assert.equal(state.cvd, round(totals.cvd));
    assert.equal(state.volume, round(totals.volume));
    assert.ok(state.trades.every((trade) => trade.at <= at));
    for (const event of events.filter(
      (event) =>
        event.at === at &&
        ["ticker", "settlement", "remove", "liquidation"].includes(event.kind),
    )) {
      const before = snapshotAt(story, at - 1);
      assert.deepEqual(state.trades, before.trades);
      assert.deepEqual(state.candles, before.candles);
      assert.equal(state.price, before.price);
    }
  }
});

test("wall withdrawal leaves latest price unchanged; later buys pay higher prices", () => {
  const story = createJourneyStory(),
    before = snapshotAt(story, 22999),
    after = snapshotAt(story, 23000);
  assert.ok(before.asks.find((row) => row.price === BASE_PRICE + 2.5).size > 8);
  assert.ok(!after.asks.some((row) => row.price === BASE_PRICE + 2.5));
  assert.equal(after.price, before.price);
  assert.equal(after.volume, before.volume);
  assert.ok(snapshotAt(story, 28000).price > after.price);
});

test("candles, profile and VWAP all reconcile with the revealed tape", () => {
  const story = createJourneyStory();
  for (const { at, state } of story.frames) {
    assert.equal(
      round(state.candles.reduce((total, candle) => total + candle.volume, 0)),
      state.volume,
    );
    assert.equal(
      round(state.profile.reduce((total, row) => total + row.volume, 0)),
      state.volume,
    );
    assert.equal(state.vwap, metrics(state.trades).vwap);
    for (const candle of state.candles) {
      assert.ok(candle.start <= at);
      const trades = state.trades.filter(
        (trade) =>
          trade.at >= candle.start && trade.at < candle.start + CANDLE_INTERVAL,
      );
      const prices = trades.map((trade) => trade.price);
      if (candle.start === 0) prices.unshift(BASE_PRICE);
      assert.equal(candle.open, prices[0]);
      assert.equal(candle.close, prices.at(-1));
      assert.equal(candle.high, Math.max(...prices));
      assert.equal(candle.low, Math.min(...prices));
    }
  }
});

test("OI can stay flat while volume increases, and one funding settlement is conserved", () => {
  const story = createJourneyStory(),
    entered = snapshotAt(story, 50000),
    exchanged = snapshotAt(story, 54000);
  assert.ok(entered.oi > snapshotAt(story, 46000).oi);
  assert.equal(exchanged.oi, entered.oi);
  assert.ok(exchanged.volume > entered.volume);
  const before = snapshotAt(story, 58499),
    after = snapshotAt(story, 58500);
  assert.equal(before.settlement, null);
  assert.equal(after.settlement.payment, 1);
  assert.equal(
    after.settlement.payment,
    after.settlement.nominal * after.settlement.rate,
  );
  assert.equal(before.oi, after.oi);
  assert.equal(before.volume, after.volume);
  assert.equal(
    story.events.filter((event) => event.kind === "settlement").length,
    1,
  );
});

test("liquidation reports follow executions, are never double-counted, and rewinding hides future reports", () => {
  const story = createJourneyStory(),
    end = snapshotAt(story, JOURNEY_DURATION);
  assert.equal(end.liquidations.length, 3);
  assert.equal(snapshotAt(story, 66000).liquidations.length, 0);
  for (const report of end.liquidations) {
    const before = snapshotAt(story, report.at - 1),
      after = snapshotAt(story, report.at);
    assert.equal(before.volume, after.volume);
    assert.equal(after.liquidations.length, before.liquidations.length + 1);
  }
  end.liquidations.length = 0;
  assert.equal(snapshotAt(story, JOURNEY_DURATION).liquidations.length, 3);
});

test("all chapter visualizations render finite coordinates at scene boundaries on desktop and mobile", () => {
  const story = createJourneyStory();
  for (const [chapter, part] of journey.entries()) {
    if (!chapter) continue;
    for (const scene of part.scenes)
      for (const mobile of [false, true]) {
        const chart = drawJourneyChart({
          story,
          state: snapshotAt(story, scene.end),
          time: scene.end,
          view: scene.view,
          mobile,
          chapter,
        });
        assert.doesNotMatch(chart.svg, /NaN|Infinity|undefined|style=/);
        assert.match(chart.svg, /data-candle-start/);
      }
  }
});
