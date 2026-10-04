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

test("orders placed while paused wait, then go out during the first second of the next run", () => {
  const sim = quick(8);
  const player = new Player(sim);
  const queued = player.enqueue({ type: "market", side: "buy", lots: 50000 });
  assert.equal(queued.ok, true);
  assert.equal(player.position, 0, "nothing trades while paused");
  assert.equal(player.queue.length, 1);
  const time = sim.time;
  sim.tick();
  assert.equal(sim.time, time + 1);
  assert.equal(player.queue.length, 0);
  assert.equal(player.position, 50000);
  const pushes = player.drainEvents().filter((event) => event.kind === "push");
  assert.equal(pushes.length, 1);
  assert.ok(pushes[0].to >= pushes[0].from);
  player.enqueue({ type: "close", fraction: 0.5 });
  sim.tick();
  assert.equal(player.position, 25000);
  assert.equal(player.cancel(player.enqueue({ type: "limit", side: "buy", lots: 100, price: sim.last - 50000 }).id), true);
  assert.equal(player.queue.length, 0);
  assert.equal(sim.ledgerBalance(), 0);
});

test("a partial take-profit closes its share and leaves the stop guarding the rest", () => {
  const sim = quick(14);
  const player = new Player(sim);
  player.setLeverage(1);
  player.submitMarket("buy", 100000);
  const mark = sim.markPrice();
  assert.equal(player.setProtection(mark - 200000, mark + 2000, 1, 0.4), null);
  sim.addAccount("bot", "test");
  for (let t = 0; t < 20 && player.protection.take != null; t++) {
    sim.book.submit("buy", Math.round(sim.last * 1.003), 20000, { owner: "bot", acct: "bot", rest: false });
    sim.tick();
  }
  assert.equal(player.protection.take, null);
  assert.equal(player.position, 60000);
  assert.equal(player.protection.stop, mark - 200000);
});

test("a sudden event shows omens first, then announces itself and trades through the book", () => {
  const sim = quick(12);
  const session = new Session(sim);
  session.alerts = { bigFlow: false, cascade: false, own: false, move: false, event: true };
  sim.events.next = sim.time + 1;
  let alert = null;
  for (let turn = 0; turn < 20 && !alert; turn++) {
    const run = session.advance(300);
    if (run.stop === "alert") alert = run.alert;
  }
  assert.ok(alert, "the event raised a pause");
  assert.equal(alert.kind, "event");
  const event = sim.events.history.at(-1);
  assert.ok(alert.name.length > 0);
  assert.ok(sim.time - event.start >= 10 * 60, "an omen phase came first");
  for (let t = 0; t < 1800; t++) sim.tick();
  if (event.kind !== "drought") assert.ok(sim.events.whale.volume > 0, "the whale traded");
  assert.equal(sim.ledgerBalance(), 0);
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

test("with turn pauses off, turns roll over without stopping until the final turn", () => {
  const sim = quick(10);
  const session = new Session(sim);
  session.alerts = { turn: false, bigFlow: false, cascade: false, own: false, move: false, event: false };
  session.finalTurn = 3;
  const run = session.advance(700);
  assert.equal(run.stop, null);
  assert.equal(run.ticks, 700);
  assert.equal(run.turned, 2);
  assert.equal(session.turn, 3);
  const last = session.advance(1000);
  assert.equal(last.stop, "turn", "the final turn still stops");
  assert.equal(last.ticks, 200);
  assert.equal(last.turned, 1);
  assert.equal(session.turn, 4);
});

test("a resting order filled in pieces pauses once, when the last piece fills", () => {
  const sim = quick(10);
  const session = new Session(sim);
  session.alerts = { bigFlow: false, cascade: false, own: true, move: false, event: false };
  const player = new Player(sim);
  sim.addAccount("bot", "test");
  const bid = sim.book.bestBid();
  const order = player.submitLimit("buy", bid, 10000);
  assert.equal(order.resting, 10000);
  player.drainEvents();
  const pieces = [];
  let run = null;
  for (let t = 0; t < 200; t++) {
    // A seller hits the level a little at a time and never trades below it.
    sim.book.submit("sell", bid, 1500, { owner: "bot", acct: "bot", rest: false });
    run = session.advance(1);
    pieces.push(...run.events.filter((event) => event.kind === "fill"));
    if (run.stop) break;
  }
  assert.equal(run.stop, "alert");
  assert.ok(pieces.length > 1, "the order filled in more than one piece");
  assert.deepEqual(run.alert.events.map((event) => event.kind), ["filled"]);
  const filled = run.alert.events[0];
  assert.equal(filled.side, "buy");
  assert.equal(filled.lots, 10000);
  assert.equal(filled.lots, pieces.reduce((sum, event) => sum + event.lots, 0));
  assert.equal(filled.price, bid);
  assert.equal(player.position, 10000);
  assert.equal(player.working.size, 0);
});

test("a ranked game replays exactly from its seed and action log", async () => {
  const { ActionLog, replayRanked, rankedResult, checkActions } = await import("../public/arena/engine/ranked.js");
  const turns = 3;
  const seed = 4242;
  const sim = new Sandbox(seed);
  const player = new Player(sim);
  const session = new Session(sim);
  session.alerts = { bigFlow: true, cascade: true, own: true, move: true, event: true };
  const log = new ActionLog(sim);
  log.apply(player, "leverage", { leverage: 10 });
  log.apply(player, "enqueue", { type: "market", side: "buy", lots: 60000 });
  session.advance(37);
  log.apply(player, "execute", { type: "limit", side: "sell", lots: 20000, price: sim.last + 40000 });
  log.apply(player, "protect", { stop: sim.markPrice() - 150000, take: null, stopFraction: 0.5, takeFraction: 1 });
  session.advance(120);
  log.apply(player, "enqueue", { type: "close", fraction: 0.5 });
  log.apply(player, "cancelAll");
  // Run to the end of the last turn, pausing wherever the session pauses, like the page does.
  while (sim.time - log.start < turns * 300) session.advance(turns * 300 - (sim.time - log.start));
  const live = rankedResult(sim, player);
  assert.equal(checkActions(log.actions, turns), null);
  const replayed = replayRanked({ seed, actions: JSON.parse(JSON.stringify(log.actions)), turns });
  assert.deepEqual(replayed, live);
  assert.notEqual(live.pnl, 0);
});
