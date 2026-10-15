import test from "node:test";
import assert from "node:assert/strict";
import { BOOK_TOPIC, OrderBook, TICKER_TOPIC, TRADE_TOPIC, addTrade, applyTicker, barRow, groupPrints, parseTrades, takerTotals } from "../public/lab/orderflow/bybit.js";

const T0 = Date.UTC(2026, 9, 15, 13, 0);

test("Bybit trades become footprint bins with the taker side, open and close following trade time", () => {
  const trades = parseTrades({
    topic: TRADE_TOPIC,
    data: [
      { i: "a", T: T0 + 1_000, S: "Buy", v: "0.5", p: "80005" },
      { i: "b", T: T0 + 2_000, S: "Sell", v: "1.25", p: "80012.5" },
    ],
  });
  assert.deepEqual(trades.map((tr) => [tr.id, tr.sell]), [["a", false], ["b", true]]);
  const bars = new Map();
  for (const tr of trades) addTrade(bars, tr);
  // A REST backfill can deliver an earlier trade after later ones.
  addTrade(bars, { t: T0 + 500, price: 79_990, qty: 2, sell: true });
  const row = barRow(T0, bars.get(T0));
  assert.deepEqual(row, [T0, 79_990, 80_012.5, 79_990, 80_012.5, [[7999, 0, 2], [8000, 0.5, 0], [8001, 0, 1.25]]]);
  assert.deepEqual(takerTotals([row]), [0.5, 3.25]);
});

test("the order book resets on snapshots, applies deltas and bins resting size around mid", () => {
  const book = new OrderBook();
  book.apply({ topic: BOOK_TOPIC, type: "delta", data: { u: 5, b: [["1", "1"]], a: [] } });
  assert.equal(book.ready, false, "deltas before the first snapshot are ignored");
  book.apply({ topic: BOOK_TOPIC, type: "snapshot", data: { u: 10, b: [["79995", "1"], ["79985", "2"]], a: [["80005", "3"], ["80100", "4"]] } });
  book.apply({ topic: BOOK_TOPIC, type: "delta", data: { u: 11, b: [["79985", "0"]], a: [["80006", "0.5"]] } });
  const [mid, lowBin, sizes] = book.column(10, 0.002);
  assert.equal(mid, 80_000);
  assert.equal(lowBin, Math.floor((80_000 * 0.998) / 10));
  assert.equal(sizes[7999 - lowBin], 1);
  assert.equal(sizes[7998 - lowBin], 0, "a zero-size delta removes the level");
  assert.equal(sizes[8000 - lowBin], 3.5);
  assert.equal(sizes[8010 - lowBin], 4);
  // u = 1 means Bybit restarted the stream: the book starts over.
  book.apply({ topic: BOOK_TOPIC, type: "delta", data: { u: 1, b: [["70000", "1"]], a: [["70010", "1"]] } });
  assert.deepEqual([...book.bids.keys(), ...book.asks.keys()], [70_000, 70_010]);
  book.reset();
  assert.equal(book.column(), null);
});

test("ticker deltas only overwrite the fields they carry", () => {
  const state = applyTicker({}, { topic: TICKER_TOPIC, data: { openInterest: "60000.5", openInterestValue: "4.8e9", fundingRate: "0.0001" } });
  applyTicker(state, { topic: TICKER_TOPIC, data: { bid1Price: "80000" } });
  assert.deepEqual(state, { oi: 60_000.5, oiValue: 4.8e9, funding: 0.0001 });
  applyTicker(state, { topic: "other", data: { openInterest: "1" } });
  assert.equal(state.oi, 60_000.5);
});

test("fills of one taker order merge into a print at their average price", () => {
  const fill = (t, price, qty, sell) => ({ t, price, qty, sell });
  const prints = groupPrints([
    fill(T0, 80_000, 3, false),
    fill(T0, 80_010, 1, false), // same order walking the book
    fill(T0, 79_990, 2, true), // same millisecond, other side: another print
    fill(T0 + 1, 80_000, 0.5, false),
  ]);
  assert.deepEqual(prints, [
    [T0, "buy", 80_002.5, 4],
    [T0, "sell", 79_990, 2],
    [T0 + 1, "buy", 80_000, 0.5],
  ]);
  assert.deepEqual(groupPrints([]), []);
});
