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

test("a liquidation closes through the market and preserves the balanced ledger", () => {
  const sim = quick(6);
  const player = new Player(sim);
  player.setLeverage(20);
  player.submitMarket("buy", 50000);
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
  assert.ok(player.stats.liquidationLoss > 0);
  assert.equal(player.liquidation, null);
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

test("with turn pauses off, ranked games stop before and after the final turn", () => {
  const sim = quick(10);
  const session = new Session(sim);
  session.alerts = { turn: false, bigFlow: false, cascade: false, own: false, move: false, event: false };
  session.finalTurn = 3;
  const run = session.advance(700);
  assert.equal(run.stop, "turn", "the last-turn warning cannot be skipped");
  assert.equal(run.ticks, 600);
  assert.equal(run.turned, 2);
  assert.equal(session.turn, 3);
  const last = session.advance(1000);
  assert.equal(last.stop, "turn", "the final turn still stops");
  assert.equal(last.ticks, 300);
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
  const { ActionLog, replayRanked, RankedSettlement, checkActions } = await import("../public/arena/engine/ranked.js");
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
  const settlement = new RankedSettlement(sim, player);
  while (!settlement.done) settlement.advance();
  const live = settlement.result();
  assert.equal(checkActions(log.actions, turns), null);
  const replayed = replayRanked({ seed, actions: JSON.parse(JSON.stringify(log.actions)), turns });
  assert.deepEqual(replayed, live);
  assert.notEqual(live.pnl, 0);
});

test("long and short liquidations wait for fills, survive recovery, and never refund excess losses", () => {
  for (const side of ["buy", "sell"]) {
    const sim = new Sandbox(6, { synthCandles: 0, warmSeconds: 0 });
    // Keep the real order book and ledger, but supply liquidity explicitly for this scenario.
    for (const id of [...sim.book.orders.keys()]) sim.book.cancel(id);
    sim.book.onTaker = () => {};
    sim.maintain = () => {};
    sim.resolveTriggers = () => null;
    const player = new Player(sim);
    const bot = sim.addAccount("counterparty", "test");
    const opposite = side === "buy" ? "sell" : "buy";
    const entry = 10_000_000;
    sim.book.last = entry;
    let mark = entry;
    sim.markPrice = () => mark;
    player.setLeverage(20);
    sim.book.submit(opposite, entry, 10000, { owner: bot.id, acct: bot.id });
    player.submitMarket(side, 10000);
    const margin = player.margin;
    const feesBefore = player.fees;
    const volumeBefore = player.stats.volume;
    player.enqueue({ type: "market", side, lots: 100 });
    player.submitLimit(side, side === "buy" ? 8_000_000 : 12_000_000, 100);
    const insuranceBefore = { ...sim.insurance };
    mark = player.liquidationPrice();
    player.onTick();
    assert.equal(Math.abs(player.position), 10000, "no counterparty means no closing fill");
    assert.equal(player.queue.length, 0);
    assert.equal(player.orders().length, 0);
    assert.equal(player.stats.liquidations, 1);
    assert.equal(player.exitIntent, true);
    assert.equal(player.execute({ type: "market", side: opposite, lots: 20000 }).ok, false, "cannot reverse a liquidating position");
    assert.equal(player.enqueue({ type: "market", side, lots: 100 }).ok, false);
    const exitPrice = side === "buy" ? 9_000_000 : 11_000_000;
    sim.book.submit(side, exitPrice, 4000, { owner: bot.id, acct: bot.id });
    player.onTick();
    assert.equal(Math.abs(player.position), 6000);
    assert.equal(player.stats.liquidations, 1, "a partial fill does not retrigger liquidation");
    mark = entry; // The market recovers, but forced closing must continue.
    sim.book.submit(side, exitPrice, 6000, { owner: bot.id, acct: bot.id });
    player.onTick();
    assert.equal(player.position, 0);
    assert.equal(player.exitIntent, false);
    assert.equal(player.liquidation, null);
    assert.equal(player.account.realized, -1_000_000, "full execution loss remains in the ledger");
    const exitFees = exitPrice * 10000 / 10000 * 0.0005;
    assert.ok(Math.abs(player.fees - feesBefore - exitFees) < 1e-6);
    assert.ok(Math.abs(player.stats.liquidationLoss - (1_000_000 + exitFees)) < 1e-6);
    assert.ok(player.stats.liquidationLoss > margin, "losses can exceed position margin");
    assert.equal(player.stats.volume - volumeBefore, 10000, "every lot closed by a trade");
    assert.deepEqual(sim.insurance, insuranceBefore, "insurance never receives the player's position");
    assert.equal(sim.ledgerBalance(), 0);
    const events = player.drainEvents();
    assert.equal(events.filter(e => e.kind === "liquidation").length, 1);
    assert.equal(events.filter(e => e.kind === "liquidationComplete").length, 1);
    assert.equal(player.enqueue({ type: "market", side, lots: 100 }).ok, true, "trading resumes once flat");
  }
});

test("ranked settlement closes longs and shorts, cancels every order, and charges actual fills", async () => {
  const { RankedSettlement, rankedResult } = await import("../public/arena/engine/ranked.js");
  for (const side of ["buy", "sell"]) {
    const sim = quick(42);
    const player = new Player(sim);
    player.submitMarket(side, 40000);
    const position = Math.abs(player.position);
    assert.ok(position > 0);
    assert.throws(() => rankedResult(sim, player), /尚未完成平倉/);
    player.enqueue({ type: "market", side, lots: 10000 });
    player.submitLimit(side, Math.round(sim.last * (side === "buy" ? 0.8 : 1.2)), 1000);
    const feesBefore = player.fees;
    const settlement = new RankedSettlement(sim, player);
    for (let i = 0; i < 100 && !settlement.done; i++) settlement.advance();
    assert.equal(settlement.done, true);
    assert.equal(player.position, 0);
    assert.equal(player.queue.length, 0);
    assert.equal(player.orders().length, 0);
    assert.equal(player.protection.stop, null);
    assert.equal(player.protection.take, null);
    const result = settlement.result();
    assert.equal(result.pnl, Math.round((player.account.realized - player.fees) * 100) / 100);
    assert.equal(result.settlement.lots, position);
    assert.equal(result.settlement.marketLots, position);
    assert.ok(result.settlement.averagePrice > 0);
    assert.equal(result.settlement.fees, player.fees - feesBefore);
    assert.ok(result.settlement.fees > 0);
    assert.deepEqual(settlement.result(), result, "reading the result does not trade again");
    assert.equal(sim.ledgerBalance(), 0);
  }
});

test("settlement waits for liquidity instead of valuing an unfilled position at the mark", async () => {
  const { RankedSettlement } = await import("../public/arena/engine/ranked.js");
  const sim = quick(42);
  const player = new Player(sim);
  player.submitMarket("buy", 10000);
  const position = player.position;
  for (const id of [...sim.book.orders.keys()]) sim.book.cancel(id);
  const settlement = new RankedSettlement(sim, player);
  assert.equal(settlement.done, false);
  assert.equal(player.position, position);
  assert.equal(player.exitIntent, true);
  assert.throws(() => settlement.result(), /尚未完成平倉/);
  for (let i = 0; i < 100 && !settlement.done; i++) settlement.advance();
  assert.equal(settlement.done, true);
  assert.ok(settlement.result().settlement.seconds > 0);
});

test("flat players finish settlement without another market tick or trading fee", async () => {
  const { RankedSettlement } = await import("../public/arena/engine/ranked.js");
  const sim = quick();
  const player = new Player(sim);
  player.enqueue({ type: "market", side: "buy", lots: 10000 });
  const time = sim.time;
  const settlement = new RankedSettlement(sim, player);
  settlement.advance(300);
  assert.equal(sim.time, time);
  assert.equal(player.queue.length, 0);
  assert.equal(settlement.result().pnl, 0);
  assert.equal(settlement.result().settlement.lots, 0);
});

test("concentrated large buys still finish with a flat, balanced ledger", async () => {
  const { RankedSettlement } = await import("../public/arena/engine/ranked.js");
  const sim = quick(42);
  const player = new Player(sim);
  player.setLeverage(1);
  for (let i = 0; i < 10; i++) {
    player.submitMarket("buy", 500000);
    sim.tick();
  }
  const settlement = new RankedSettlement(sim, player);
  assert.ok(settlement.summary.lots > 500000, "the exit is larger than a single 5,000 BTC order");
  for (let i = 0; i < 100 && !settlement.done; i++) settlement.advance();
  assert.equal(settlement.done, true);
  assert.equal(player.position, 0);
  assert.equal(sim.ledgerBalance(), 0);
  const result = settlement.result();
  assert.equal(result.settlement.marketLots, result.settlement.lots);
  assert.equal(result.pnl, Math.round((player.account.realized - player.fees) * 100) / 100);
});
