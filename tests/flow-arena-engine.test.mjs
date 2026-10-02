import test from "node:test";
import assert from "node:assert/strict";
import { OrderBook } from "../public/arena/engine/book.js";
import { Sandbox } from "../public/arena/engine/market.js";
import { Player } from "../public/arena/engine/player.js";
import { Session } from "../public/arena/engine/session.js";

const quick = (seed = 3) => new Sandbox(seed, { synthCandles: 120, warmSeconds: 900 });

test("order book matches by price, then time, and reports every fill", () => {
  const fills = [];
  const book = new OrderBook({ onTrade: (trade) => fills.push(trade) });
  book.submit("sell", 10100, 50, { owner: "a", acct: "a" });
  book.submit("sell", 10000, 30, { owner: "b", acct: "b" });
  book.submit("sell", 10000, 40, { owner: "c", acct: "c" });
  const result = book.submit("buy", 10100, 100, { owner: "x", acct: "x", rest: false });
  assert.equal(result.matched, 100);
  assert.deepEqual(fills.map((fill) => [fill.maker.acct, fill.price, fill.lots]), [["b", 10000, 30], ["c", 10000, 40], ["a", 10100, 30]]);
  assert.equal(book.lotsAt(10100), 20);
  assert.equal(book.bestAsk(), 10100);
});

test("self-trade prevention cancels the owner's resting order instead of trading", () => {
  const fills = [];
  const book = new OrderBook({ onTrade: (trade) => fills.push(trade) });
  book.submit("sell", 10000, 50, { owner: "me", acct: "me" });
  book.submit("sell", 10100, 50, { owner: "other", acct: "other" });
  const result = book.submit("buy", 10200, 30, { owner: "me", acct: "me", rest: false });
  assert.equal(result.matched, 30);
  assert.equal(fills[0].maker.acct, "other");
  assert.equal(book.lotsAt(10000), 0);
});

test("iceberg orders show only their display size and refill behind the queue", () => {
  const fills = [];
  const book = new OrderBook({ onTrade: (trade) => fills.push(trade) });
  book.submit("buy", 10000, 300, { owner: "ice", acct: "ice", iceberg: { display: 100 } });
  book.submit("buy", 10000, 50, { owner: "plain", acct: "plain" });
  assert.equal(book.lotsAt(10000), 150);
  book.submit("sell", 10000, 160, { owner: "s", acct: "s", rest: false });
  assert.deepEqual(fills.map((fill) => [fill.maker.acct, fill.lots]), [["ice", 100], ["plain", 50], ["ice", 10]]);
  assert.equal(book.lotsAt(10000), 90);
});

test("the ledger stays balanced and open interest is the sum of the longs", () => {
  const sim = quick(5);
  const player = new Player(sim);
  player.submitMarket("buy", 50000);
  for (let t = 0; t < 600; t++) {
    sim.tick();
    if (t === 200) player.submitLimit("sell", sim.last + 2000, 20000);
    if (t === 400) player.close();
    assert.equal(sim.ledgerBalance(), 0);
  }
  assert.equal(sim.oi, sim.recountOpenInterest());
  assert.ok(sim.oi > 0);
});

test("the same seed builds the same market", () => {
  const a = quick(11);
  const b = quick(11);
  for (let t = 0; t < 300; t++) {
    a.tick();
    b.tick();
  }
  assert.equal(a.last, b.last);
  assert.equal(a.cvd, b.cvd);
  assert.equal(a.oi, b.oi);
});

test("crowds exit through the order book: closing trades move open interest", () => {
  const sim = quick(7);
  const cohort = [...sim.cohorts.values()].find((item) => item.position && !item.forced && item.pool !== "noise");
  assert.ok(cohort, "an open crowd position exists");
  const lots = Math.abs(cohort.position);
  const tape = sim.tape.length;
  const oi = sim.oi;
  sim.exitCohort(cohort, "market", "test");
  sim.maintain();
  const closing = sim.tape.slice(tape).reduce((sum, trade) => sum + trade.lots, 0);
  assert.ok(closing >= lots, "the exit traded at least the position size");
  assert.equal(cohort.removed || cohort.position === 0 || cohort.forced === "exit", true);
  assert.ok(sim.oi <= oi, "open interest did not rise from a pure exit");
  assert.equal(sim.ledgerBalance(), 0);
});

test("stops, trailing stops, time exits and chart signals all show up as exit flow", () => {
  const sim = new Sandbox(4);
  for (let t = 0; t < 3600; t++) sim.tick();
  const exits = sim.marketStats.exits;
  for (const kind of ["stop", "time", "signal", "noise"]) assert.ok(exits[kind] > 0, `${kind} exits happened`);
});

test("crowds leave visible limit orders at levels and hidden stop entries beyond swing points", () => {
  const sim = new Sandbox(9);
  const crowdOrders = [...sim.book.orders.values()].filter((order) => String(order.acct).startsWith("c"));
  const below = crowdOrders.filter((order) => order.side === "buy" && order.price < sim.last).length;
  const above = crowdOrders.filter((order) => order.side === "sell" && order.price > sim.last).length;
  assert.ok(below > 20 && above > 20, `resting crowd orders on both sides (${below}/${above})`);
  const triggers = [...sim.cohorts.values()].filter((cohort) => cohort.trigger != null);
  assert.ok(triggers.some((cohort) => cohort.side > 0 && cohort.trigger > sim.last), "buy stops above");
  assert.ok(triggers.some((cohort) => cohort.side < 0 && cohort.trigger < sim.last), "sell stops below");
  const reveal = sim.reveal();
  assert.ok(reveal.levels.some((row) => row.liqLong + row.liqShort > 0));
  assert.equal(reveal.pools.length, 8);
});

test("positions have no size cap, and leverage changes only while flat", () => {
  const sim = quick(2);
  const player = new Player(sim);
  assert.equal(player.setLeverage(20), null);
  const huge = player.submitMarket("buy", 300000); // 3,000 BTC at 20×
  assert.equal(huge.ok, true);
  assert.equal(player.position, 300000);
  assert.match(player.setLeverage(5), /空倉/);
});

test("a liquidation loses at most the position margin", () => {
  const sim = quick(6);
  const player = new Player(sim);
  player.setLeverage(20);
  player.submitMarket("buy", 50000);
  const margin = player.margin;
  const liq = player.liquidationPrice();
  assert.ok(liq < sim.last);
  const bot = sim.addAccount("bot", "test");
  // The mark follows quotes, which reprice over a few seconds: a single wick is not enough, so the
  // seller keeps pressing until the mark crosses.
  for (let t = 0; t < 40 && player.position; t++) {
    sim.book.submit("sell", Math.round(liq * 0.97), 200000, { owner: "bot", acct: "bot", rest: false });
    sim.tick();
  }
  assert.equal(player.position, 0);
  assert.equal(player.stats.liquidations, 1);
  assert.ok(player.stats.marginLost <= margin + 1e-6);
  assert.ok(bot.position < 0);
  assert.equal(sim.ledgerBalance(), 0);
});

test("trigger orders fire on the mark, TWAP slices over time, icebergs show their display size", () => {
  const sim = quick(8);
  const player = new Player(sim);
  player.setLeverage(1);
  const trigger = player.addTrigger("buy", sim.markPrice() - 30000, 1000);
  assert.equal(trigger.ok, true);
  sim.addAccount("bot", "test");
  sim.book.submit("sell", Math.round(sim.last * 0.985), 400000, { owner: "bot", acct: "bot", rest: false });
  player.onTick();
  assert.equal(player.triggers.length, 0);
  assert.ok(player.position > 0);
  const before = player.position;
  player.addTwap("buy", 4000, 40, 4);
  for (let t = 0; t < 45; t++) sim.tick();
  assert.equal(player.twaps.length, 0);
  assert.ok(player.position - before > 3000);
  const ice = player.submitLimit("sell", sim.last + 300000, 5000, { display: 500 });
  const order = sim.book.orders.get(ice.id);
  assert.equal(order.lots, 500);
  assert.equal(order.iceberg.hidden, 4500);
});

test("a turn runs five simulated minutes, and a filled resting order pauses it early", () => {
  const sim = quick(10);
  const session = new Session(sim);
  session.alerts = { bigFlow: false, cascade: false, own: false, move: false };
  const run = session.advance(1000);
  assert.equal(run.stop, "turn");
  assert.equal(run.ticks, 300);
  assert.equal(session.turn, 2);
  const player = new Player(sim);
  session.alerts.own = true;
  player.submitLimit("buy", sim.book.bestBid(), 100);
  player.submitLimit("sell", sim.book.bestAsk(), 100);
  const paused = session.advance(300);
  assert.equal(paused.stop, "alert");
  assert.equal(paused.alert.kind, "own");
});
