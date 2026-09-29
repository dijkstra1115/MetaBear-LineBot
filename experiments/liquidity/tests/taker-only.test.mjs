import test from "node:test";
import assert from "node:assert/strict";
import { FLOW_HISTORY, FLOW_MODE_TARGET, FLOW_ORDER_LOTS, TakerOnlyMarket } from "../public/orderflow/taker-only-engine.js";

test("non-crossing arrivals rest, then a crossing order trades at the resting price", () => {
  const market = new TakerOnlyMarket(1);
  market.submit("sell", 10050, 200);
  assert.equal(market.last, 10000);
  assert.equal(market.trades, 0);
  assert.deepEqual(market.depth("sell"), [{ price: 10050, lots: 200 }]);
  const buy = market.submit("buy", 10100, 300);
  assert.equal(buy.matched, 200);
  assert.equal(buy.resting, 100);
  assert.equal(market.last, 10050);
  assert.deepEqual(market.depth("buy"), [{ price: 10100, lots: 100 }]);
  assert.equal(market.restingLots, 100);
  assert.equal(market.candles[0].volume, 200);
  assert.deepEqual(market.heatmap[0].bids, market.depth("buy", 100));
});

test("incoming order sweeps only prices it crosses and preserves the uncrossed book", () => {
  const market = new TakerOnlyMarket(2);
  market.submit("sell", 10030, 100);
  market.submit("sell", 10040, 200);
  market.submit("sell", 10060, 300);
  const result = market.submit("buy", 10045, 400);
  assert.equal(result.matched, 300);
  assert.equal(result.resting, 100);
  assert.equal(market.last, 10040);
  assert.equal(market.bestBid(), 10045);
  assert.equal(market.bestAsk(), 10060);
  assert.equal(market.spread(), 15);
});

test("random arrivals stay within one percent of the previous last trade and replay by seed", () => {
  const first = new TakerOnlyMarket(44021);
  const second = new TakerOnlyMarket(44021);
  for (let i = 0; i < 1000; i++) {
    const before = first.last;
    const { min, max } = first.quoteBounds();
    const arrival = first.step();
    second.step();
    assert.equal(arrival.lots, FLOW_ORDER_LOTS);
    assert.equal(arrival.lots, 100, "every generated order is exactly 1 BEAR");
    assert.ok(arrival.price >= min && arrival.price <= max);
    assert.ok(Math.abs(arrival.price - before) <= before * 0.01 + 1);
    assert.ok(first.bestBid() == null || first.bestAsk() == null || first.bestBid() < first.bestAsk());
  }
  assert.deepEqual(first.candles, second.candles);
  assert.deepEqual(first.heatmap, second.heatmap);
  assert.equal(first.last, second.last);
  assert.ok(first.trades > 0);
  assert.ok(first.restingLots > 0);
});

test("the live chart retains a bounded history while the market keeps running", () => {
  const market = new TakerOnlyMarket(773);
  market.advance(3000);
  assert.equal(market.orders, 3000);
  assert.equal(market.candles.length, FLOW_HISTORY);
  assert.equal(market.heatmap.length, FLOW_HISTORY);
  assert.ok(market.candles.at(-1).bucket > market.candles[0].bucket);
});

test("resting orders expire after the chosen simulated age without moving the trade price", () => {
  const market = new TakerOnlyMarket(1, 1);
  market.submit("sell", 10100, 100);
  for (let i = 0; i < 9; i++) market.submit("buy", 9000, 100);
  assert.equal(market.bestAsk(), 10100);
  market.submit("buy", 9000, 100);
  assert.equal(market.bestAsk(), null);
  assert.equal(market.expiredOrders, 1);
  assert.equal(market.expiredLots, 100);
  assert.equal(market.last, 10000);
  assert.equal(market.trades, 0);
  assert.deepEqual(market.heatmap.at(-1).asks, []);
});

test("changing lifetime immediately removes old orders but never restores canceled ones", () => {
  const market = new TakerOnlyMarket(1, 60);
  market.submit("sell", 10100, 200);
  market.submit("buy", 10100, 50);
  for (let i = 0; i < 5; i++) market.submit("buy", 9000, 100);
  assert.equal(market.askLots.get(10100), 150);
  market.setLifetime(0.3);
  assert.equal(market.bestAsk(), null);
  assert.equal(market.expiredLots, 350);
  assert.equal(market.expiredOrders, 3);
  market.setLifetime(60);
  assert.equal(market.bestAsk(), null);
  assert.equal(market.expiredOrders, 3);
  assert.deepEqual(market.heatmap.at(-1).asks, []);
});

test("extending lifetime retains surviving orders and order accounting balances", () => {
  const market = new TakerOnlyMarket(2, 0.3);
  market.submit("sell", 10100, 100);
  market.submit("buy", 9000, 100);
  market.setLifetime(1);
  for (let i = 0; i < 4; i++) market.submit("buy", 9000, 100);
  assert.equal(market.bestAsk(), 10100);
  market.submit("buy", 10100, 100);
  assert.equal(market.bestAsk(), null);
  assert.equal(market.expiredOrders, 0);
  assert.equal(market.orders * 100, market.executedLots * 2 + market.restingLots + market.expiredLots);
});

test("target-price mode rests when the opposite book exists outside its limit", () => {
  const market = new TakerOnlyMarket(1, 60, FLOW_MODE_TARGET);
  market.submit("sell", 10100, 100);
  const unfilledBuy = market.submit("buy", 10050, 100);
  assert.equal(unfilledBuy.matched, 0);
  assert.equal(unfilledBuy.resting, 100);
  assert.equal(market.bestBid(), 10050);
  assert.equal(market.bestAsk(), 10100);
  const filledBuy = market.submit("buy", 10100, 100);
  assert.equal(filledBuy.executionPrice, 10100);
  const filledSell = market.submit("sell", 10050, 100);
  assert.equal(filledSell.executionPrice, 10050);
});

test("target-price mode derives side from quote and only fills within that limit", () => {
  const first = new TakerOnlyMarket(44021, 60, FLOW_MODE_TARGET);
  const replay = new TakerOnlyMarket(44021, 60, FLOW_MODE_TARGET);
  let twoSidedBookSeen = false;
  for (let i = 0; i < 3000; i++) {
    const before = first.last;
    const { min, max } = first.quoteBounds();
    const arrival = first.step();
    replay.step();
    assert.ok(arrival.price >= min && arrival.price <= max);
    if (arrival.price < before) assert.equal(arrival.side, "sell");
    if (arrival.price > before) assert.equal(arrival.side, "buy");
    if (arrival.matched) {
      if (arrival.side === "buy") assert.ok(arrival.executionPrice <= arrival.price);
      else assert.ok(arrival.executionPrice >= arrival.price);
    }
    if (first.bestBid() != null && first.bestAsk() != null) twoSidedBookSeen = true;
    assert.equal(first.orders * FLOW_ORDER_LOTS, first.executedLots * 2 + first.restingLots + first.expiredLots);
  }
  assert.ok(twoSidedBookSeen);
  assert.deepEqual(first.candles, replay.candles);
  assert.deepEqual(first.heatmap, replay.heatmap);
});
