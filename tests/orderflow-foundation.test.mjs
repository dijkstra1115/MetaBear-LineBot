import test from "node:test";
import assert from "node:assert/strict";
import {
  FoundationLesson,
  candleFromTrades,
} from "../public/orderflow/legacy/foundation-model.js";

test("resting Maker order changes depth without changing the candle or last trade", () => {
  const lesson = new FoundationLesson();
  const before = lesson.snapshot();
  const after = lesson.advance();
  assert.deepEqual(
    after.asks.map(({ price, size }) => ({ price, size })),
    [
      { price: 101, size: 1 },
      { price: 110, size: 1 },
    ],
  );
  assert.equal(after.price, before.price);
  assert.deepEqual(after.trades, before.trades);
  assert.deepEqual(after.candle, before.candle);
});

test("equal Taker buys match lowest asks and skip prices with no resting sellers", () => {
  const lesson = new FoundationLesson();
  lesson.advance();
  const first = lesson.advance();
  assert.equal(first.price, 101);
  assert.equal(first.trades.at(-1).size, 1);
  const second = lesson.advance();
  assert.equal(second.price, 110);
  assert.equal(second.trades.at(-1).size, 1);
  assert.deepEqual(
    second.trades.map((trade) => trade.price),
    [100, 101, 110],
  );
  assert.deepEqual(second.asks, []);
  assert.deepEqual(second.candle, {
    open: 100,
    high: 110,
    low: 100,
    close: 110,
    volume: 3,
  });
});

test("zooming out preserves all fills; a Taker sell matches the highest bid and leaves the upper wick", () => {
  const lesson = new FoundationLesson();
  for (let i = 0; i < 3; i++) lesson.advance();
  const before = lesson.snapshot();
  const zoomed = lesson.advance();
  assert.deepEqual(zoomed.trades, before.trades);
  assert.deepEqual(zoomed.candle, before.candle);
  const sold = lesson.advance();
  assert.deepEqual(
    sold.trades.map((trade) => [trade.side, trade.price, trade.size]),
    [
      ["buy", 100, 1],
      ["buy", 101, 1],
      ["buy", 110, 1],
      ["sell", 99, 1],
    ],
  );
  assert.equal(sold.price, 99);
  assert.deepEqual(sold.candle, {
    open: 100,
    high: 110,
    low: 99,
    close: 99,
    volume: 4,
  });
  assert.deepEqual(sold.bids, []);
  lesson.advance();
  const final = lesson.snapshot();
  assert.deepEqual(lesson.advance(), final);
  assert.deepEqual(new FoundationLesson().snapshot().candle, {
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1,
  });
});

test("a Taker fill at the same price increases volume without moving price", () => {
  assert.deepEqual(
    candleFromTrades([
      { price: 100, size: 1 },
      { price: 100, size: 2 },
    ]),
    {
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 3,
    },
  );
  assert.equal(candleFromTrades([]), null);
});
