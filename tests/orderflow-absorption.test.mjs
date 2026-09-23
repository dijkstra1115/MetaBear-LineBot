import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_PRICE,
  CANDLE_INTERVAL,
  CHAPTER_ENDS,
  createAbsorptionStory,
  snapshotAt,
} from "../public/orderflow/absorption-model.js";
import { round } from "../public/orderflow/engine.js";

const sum = (items) =>
  round(items.reduce((total, item) => total + item.size, 0));

test("one deterministic history continues across every chapter", () => {
  const story = createAbsorptionStory();
  assert.deepEqual(story, createAbsorptionStory());
  let previous = [];
  for (const at of CHAPTER_ENDS) {
    const state = snapshotAt(story, at);
    assert.deepEqual(state.trades.slice(0, previous.length), previous);
    assert.ok(state.trades.every((trade) => trade.at <= at));
    if (at > 0)
      assert.ok(
        state.trades.length > previous.length,
        "Every next scene must advance the market",
      );
    previous = state.trades;
  }
});

test("public quote additions interleave with buys without inventing executions", () => {
  const story = createAbsorptionStory();
  for (const event of story.events.filter((event) => event.kind === "add")) {
    const before = snapshotAt(story, event.at - 1);
    const after = snapshotAt(story, event.at);
    for (const field of ["price", "cvd", "trades", "candle", "candles"])
      assert.deepEqual(after[field], before[field]);
    if (event.side === "sell") assert.ok(before.asks[0].size > 0);
  }
  const absorbed = snapshotAt(story, 10000);
  assert.ok(absorbed.buy > 10 && absorbed.sell > 0);
  assert.ok(
    absorbed.trades.every((trade) =>
      [BASE_PRICE, BASE_PRICE + 0.5].includes(trade.price),
    ),
  );
  assert.ok(
    story.events.some(
      (event, index, events) =>
        event.kind === "add" &&
        events[index - 1]?.kind === "trade" &&
        events[index + 1]?.kind === "trade",
    ),
  );
});

test("candlesticks and volume include exactly the executions visible at each instant", () => {
  const story = createAbsorptionStory();
  for (const { at, state } of story.frames) {
    assert.equal(
      round(state.candles.reduce((total, candle) => total + candle.volume, 0)),
      state.volume,
    );
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
      assert.equal(candle.volume, sum(trades));
    }
  }
});

test("a live candle retreats, retains its high, and recovers with the same public trades", () => {
  const story = createAbsorptionStory();
  const before = snapshotAt(story, 2149).candles[0];
  const down = snapshotAt(story, 2150).candles[0];
  const backUp = snapshotAt(story, 2500).candles[0];
  assert.equal(before.close, BASE_PRICE + 0.5);
  assert.equal(down.close, BASE_PRICE);
  assert.equal(down.high, before.high);
  assert.equal(down.volume, round(before.volume + 0.25));
  assert.equal(backUp.close, BASE_PRICE + 0.5);
  assert.equal(backUp.low, BASE_PRICE);
  assert.deepEqual(snapshotAt(story, 2149).candles[0], before);
  assert.equal(snapshotAt(story, 18000).candles.length, 6);
});

test("after replenishment ends, subsequent buys consume remaining asks before price rises", () => {
  const story = createAbsorptionStory();
  assert.ok(
    !story.events.some(
      (event) =>
        event.at > 10000 && event.kind === "add" && event.side === "sell",
    ),
  );
  const absorbed = snapshotAt(story, 10000);
  const thinning = snapshotAt(story, 14000);
  assert.equal(absorbed.asks[0].size, 2.4);
  assert.equal(thinning.asks[0].size, 0.3);
  assert.equal(thinning.price, BASE_PRICE + 0.5);
  const end = snapshotAt(story, 18000);
  assert.equal(end.price, BASE_PRICE + 2.5);
  assert.deepEqual(
    [
      ...new Set(
        end.trades
          .filter((trade) => trade.at > 14000)
          .map((trade) => trade.price),
      ),
    ],
    [0.5, 1, 1.5, 2, 2.5].map((offset) => BASE_PRICE + offset),
  );
});

test("every snapshot conserves public depth and derives price and delta from actual fills", () => {
  const story = createAbsorptionStory();
  const initial = story.frames[0].state;
  for (const { at, state } of story.frames) {
    const additions = story.events.filter(
      (event) => event.kind === "add" && event.at <= at,
    );
    const buys = sum(state.trades.filter((trade) => trade.side === "buy"));
    const sells = sum(state.trades.filter((trade) => trade.side === "sell"));
    assert.equal(
      sum(state.asks),
      round(
        sum(initial.asks) +
          sum(additions.filter((event) => event.side === "sell")) -
          buys,
      ),
    );
    assert.equal(
      sum(state.bids),
      round(
        sum(initial.bids) +
          sum(additions.filter((event) => event.side === "buy")) -
          sells,
      ),
    );
    assert.equal(state.cvd, round(buys - sells));
    assert.equal(state.volume, round(buys + sells));
    const prices = [BASE_PRICE, ...state.trades.map((trade) => trade.price)];
    assert.equal(state.price, prices.at(-1));
    assert.equal(state.candle.high, Math.max(...prices));
    assert.equal(state.candle.low, Math.min(...prices));
    assert.equal(state.candle.close, state.price);
    assert.ok(state.bids[0].price < state.asks[0].price);
    for (const row of [...state.asks, ...state.bids]) {
      assert.ok(row.size > 0);
      assert.deepEqual(Object.keys(row).sort(), ["price", "size"]);
    }
  }
});

test("rewinding yields isolated public state, without reserves or maker identity", () => {
  const story = createAbsorptionStory();
  const state = snapshotAt(story, 10000);
  state.asks[0].size = 900;
  state.trades.length = 0;
  assert.equal(snapshotAt(story, 10000).asks[0].size, 2.4);
  assert.equal(snapshotAt(story, -10).trades.length, 0);
  assert.ok(!/"(?:reserve|hidden|makerOwn|peak)":/.test(JSON.stringify(story)));
});
