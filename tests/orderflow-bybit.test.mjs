import test from "node:test";
import assert from "node:assert/strict";
import { BOOK_TOPIC, OrderBook, StreamGaps, bybitGet, TICKER_TOPIC, TRADE_TOPIC, addTrade, applyTicker, barRow, groupPrints, parseTrades, takerTotals } from "../public/lab/orderflow/bybit.js";

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

test("a dropped page stream hands the minutes around the gap back to the collector", () => {
  const M = 60_000;
  const gaps = new StreamGaps();
  gaps.reconnect(); // the first connection is not a gap
  gaps.trade(T0 + 10_000);
  gaps.trade(T0 + M + 30_000);
  assert.equal(gaps.covers(T0, T0 + M), false);
  gaps.reconnect();
  assert.equal(gaps.covers(T0 + M, T0 + 2 * M), true, "while down, the last minute and later ones");
  assert.equal(gaps.covers(T0 + 5 * M, T0 + 6 * M), true);
  assert.equal(gaps.covers(T0, T0 + M), false, "minutes before the drop stay the page's");
  gaps.trade(T0 + 3 * M + 5_000);
  assert.deepEqual(gaps.list, [[T0 + M + 30_000, T0 + 3 * M + 5_000]]);
  for (const [m, missed] of [[0, false], [1, true], [2, true], [3, true], [4, false]]) assert.equal(gaps.covers(T0 + m * M, T0 + (m + 1) * M), missed, `minute ${m}`);
});

test("live fills merge by Bybit's seq, so orders sharing a millisecond stay apart", () => {
  const fill = (seq, price, qty) => ({ t: T0, price, qty, sell: false, seq });
  assert.deepEqual(groupPrints([fill(7, 80_000, 1), fill(7, 80_010, 3), fill(8, 80_010, 2)]), [
    [T0, "buy", 80_007.5, 4],
    [T0, "buy", 80_010, 2],
  ]);
  assert.deepEqual(parseTrades({ topic: TRADE_TOPIC, data: [{ i: "x", T: T0, S: "Buy", v: "1", p: "80000", seq: 42 }] })[0].seq, 42);
});

test("Bybit REST errors say what came back instead of undefined", async () => {
  const reply = (status, body) => async () => new Response(body, { status });
  assert.deepEqual(await bybitGet("u", reply(200, JSON.stringify({ retCode: 0, result: { list: [1] } }))), { list: [1] });
  await assert.rejects(bybitGet("u", reply(200, JSON.stringify({ retCode: 10006, retMsg: "Too many visits!" }))), /HTTP 200 10006 Too many visits!/);
  await assert.rejects(bybitGet("u", reply(403, "<html><body><h1>403 ERROR</h1>Request blocked.</body></html>")), /HTTP 403 403 ERROR Request blocked\./);
  await assert.rejects(bybitGet("u", reply(429, "{}")), /HTTP 429 \{\}/);
});
