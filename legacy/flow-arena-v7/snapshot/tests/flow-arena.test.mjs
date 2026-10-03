import test from "node:test";
import assert from "node:assert/strict";
import {
  ARENA_CONTRACT_BTC,
  ARENA_DURATION,
  ARENA_INITIAL_PRICE,
  ARENA_MAINTENANCE,
  ARENA_DEFAULT_LEVERAGE,
  ARENA_RISK_LIMITS,
  ARENA_RIVAL_ZONES,
  ARENA_START_BALANCE,
  FlowArenaRun,
  cohortLiquidationPrice,
} from "../public/orderflow/flow-arena-engine.js";
import { arenaChartGeometry, arenaChartPriceAtY } from "../public/orderflow/flow-arena-chart.js";
import { ARENA_BOTS } from "../public/orderflow/flow-arena-bots.js";
import { FLOW_MODE_TARGET, TakerOnlyMarket } from "../public/orderflow/taker-only-engine.js";

// Price cents × lots divided by this gives USDT.
const CENT_LOTS_PER_USDT = 10000 / ARENA_CONTRACT_BTC;
const liquidationTrades = (run, from) => run.market.tradeLog.slice(from).filter((trade) => trade.takerOwner === "liquidation");
// Mechanism tests run without the hidden defenders and hunter so a seeded iceberg cannot absorb the push.
const quiet = (run) => {
  for (const defender of run.defenders) run.market.cancel(defender.id, "defender");
  run.defenders = [];
  run.actHunter = () => {};
  return run;
};

test("retail quote selects direction and each incoming retail order stays at one unit", () => {
  const market = new TakerOnlyMarket(41234, 60, FLOW_MODE_TARGET);
  for (let i = 0; i < 350; i++) {
    const before = market.last;
    const arrival = market.step();
    assert.equal(arrival.lots, 100);
    if (arrival.price < before) assert.equal(arrival.side, "sell");
    if (arrival.price > before) assert.equal(arrival.side, "buy");
    if (arrival.matched) {
      assert.ok(arrival.side === "buy" ? arrival.executionPrice <= arrival.price : arrival.executionPrice >= arrival.price);
    }
  }
});

test("trade ledger conserves CVD and the footprint covers the last 30 simulated seconds", () => {
  const run = new FlowArenaRun(59321);
  for (let i = 0; i < 40; i++) run.tick();
  const expectedCvd = run.market.tradeLog.reduce((sum, trade) => sum + (trade.aggressorSide === "buy" ? trade.lots : -trade.lots), 0);
  assert.equal(run.market.cvd, expectedCvd);
  const recent = run.market.tradeLog.filter((trade) => trade.time > run.time - 30);
  assert.equal(run.footprint(30).reduce((sum, row) => sum + row.buy + row.sell, 0), recent.reduce((sum, trade) => sum + trade.lots, 0));
});

test("candles follow simulated seconds, including the warm-up history", () => {
  const run = new FlowArenaRun(77551);
  const candles = run.market.candles;
  assert.ok(candles.length >= 60);
  assert.ok(candles[0].time < 0);
  for (let i = 1; i < candles.length; i++) assert.equal(candles[i].bucket - candles[i - 1].bucket, 1);
  run.tick();
  run.tick();
  assert.equal(run.market.candles.at(-1).time, 2);
});

test("market maker quotes both sides with a deeper backstop farther away", () => {
  const run = new FlowArenaRun(77551);
  for (let i = 0; i < 5; i++) run.tick();
  const last = run.market.last;
  const depth = (side, from, to) => run.market.restingOrders
    .filter((order) => order.owner === "maker" && order.side === side && Math.abs(order.price / last - 1) > from && Math.abs(order.price / last - 1) <= to)
    .reduce((sum, order) => sum + order.lots, 0);
  for (const side of ["buy", "sell"]) {
    assert.ok(depth(side, 0, 0.01) >= 1000, `${side} near depth`);
    assert.ok(depth(side, 0.01, 0.06) > depth(side, 0, 0.01), `${side} backstop is deeper`);
  }
  for (let i = 0; i < 80; i++) run.tick();
  assert.ok(Math.abs(run.maker.inventory) <= run.maker.maxInventory);
  assert.ok(run.maker.fills > 0);
});

test("chart zoom, vertical pan and click price use the displayed price scale", () => {
  const run = new FlowArenaRun(77551);
  const canvas = { getBoundingClientRect: () => ({ top: 100, left: 0, width: 1050, height: 600 }) };
  const normal = arenaChartGeometry(canvas, run, { zoom: 1, offset: 0 });
  const zoomed = arenaChartGeometry(canvas, run, { zoom: 2, offset: 0 });
  const panned = arenaChartGeometry(canvas, run, { zoom: 2, offset: 20000 });
  assert.equal(normal.span / zoomed.span, 2);
  assert.equal(panned.high - zoomed.high, 20000);
  const visiblePrice = (zoomed.high + zoomed.low) / 2;
  const clickY = 100 + zoomed.y(visiblePrice);
  assert.ok(Math.abs(arenaChartPriceAtY(canvas, run, { zoom: 2, offset: 0 }, clickY) - visiblePrice) <= 500);
  assert.equal(arenaChartPriceAtY(canvas, run, { zoom: 2, offset: 0 }, 50), null);
});

test("the price axis holds still under the pointer and only narrows once the range has settled", () => {
  const run = new FlowArenaRun(77551);
  const canvas = { getBoundingClientRect: () => ({ top: 100, left: 0, width: 1050, height: 600 }) };
  const view = { zoom: 1, offset: 0, frame: { low: null, high: null, hold: false } };
  const first = arenaChartGeometry(canvas, run, view);
  const clickY = 100 + first.y(run.market.last * 1.004);
  const price = arenaChartPriceAtY(canvas, run, view, clickY);
  view.frame.hold = true;
  // A new high inside the window would rescale a free axis; a held one keeps the click price.
  run.market.candles.at(-1).high = Math.round(first.high + (first.high - first.low) * 0.02);
  assert.equal(arenaChartPriceAtY(canvas, run, view, clickY), price);
  view.frame.hold = false;
  const released = arenaChartGeometry(canvas, run, view);
  assert.ok(released.high > first.high, "without the pointer the axis widens for the new high");
  assert.equal(arenaChartGeometry(canvas, run, view).high, released.high, "and then stays put");
});

test("a rival's liquidation price shows only as a fixed zone once it comes near", () => {
  const run = new FlowArenaRun(61001, { traders: ["player", "rival:1"] });
  const rival = run.trader("rival:1");
  const last = run.market.last;
  const [wide, narrow] = ARENA_RIVAL_ZONES;
  const liqFor = (distance) => {
    rival.account.position = 1000;
    rival.account.entry = last;
    // Isolated margin sized so the liquidation price sits `distance` below the price.
    rival.account.margin = run.notional(last, 1000) * (distance + ARENA_MAINTENANCE);
    return rival.liquidationPrice();
  };
  const mark = run.markPrice();
  liqFor(0.06);
  assert.equal(rival.liquidationZone(mark), null, "a far liquidation price stays hidden");
  const near = liqFor(0.022);
  const zone = rival.liquidationZone(mark);
  assert.ok(zone, "within reach the zone appears");
  assert.equal(zone.width, wide.width);
  assert.ok(zone.low <= near && zone.high >= near, "the true price is inside the zone");
  assert.notEqual(Math.round((zone.low + zone.high) / 2), near, "the zone is not centered on it");
  assert.deepEqual(rival.liquidationZone(mark), zone, "the same position keeps the same zone");
  const close = liqFor(0.008);
  const tight = rival.liquidationZone(mark);
  assert.equal(tight.width, narrow.width);
  assert.ok(tight.low <= close && tight.high >= close);
  rival.account.position = 0;
  assert.equal(rival.liquidationZone(mark), null);
});

test("BTC round starts with 100 units of purchasing power at the default leverage", () => {
  const run = new FlowArenaRun(33084);
  assert.equal(run.market.last, ARENA_INITIAL_PRICE);
  assert.equal(run.startPrice, ARENA_INITIAL_PRICE);
  assert.equal(ARENA_CONTRACT_BTC, 50);
  assert.equal(ARENA_START_BALANCE, 500000000);
  assert.equal(ARENA_START_BALANCE / (ARENA_INITIAL_PRICE / 100 * ARENA_CONTRACT_BTC), 100);
  const accepted = run.submit("buy", "market", 2000);
  assert.equal(accepted.ok, true);
  assert.ok(run.account.position > 0);
  assert.ok(run.exposureRatio() > 0 && run.exposureRatio() < 1);
  assert.equal(run.leverage, ARENA_DEFAULT_LEVERAGE);
  assert.ok(run.account.margin > 0);
  const close = run.close();
  assert.equal(close.ok, true);
  assert.equal(run.account.position, 0);
  assert.ok(run.account.fees > 0);
  const result = run.finish();
  assert.equal(result.balance, run.account.balance);
  assert.equal(run.account.margin, 0);
  assert.equal(result.leverage, ARENA_DEFAULT_LEVERAGE);
});

test("one 50 BTC contract gains 5,000 USDT when BTC rises 100 USDT", () => {
  const run = new FlowArenaRun(77551);
  run.account.position = 100;
  run.account.entry = ARENA_INITIAL_PRICE;
  run.market.restingOrders = [];
  run.market.last = ARENA_INITIAL_PRICE + 10000;
  assert.equal(run.equity(), ARENA_START_BALANCE + 100 * ARENA_CONTRACT_BTC);
});

test("equal seeds reproduce retail, crowd positions, events and results", () => {
  const a = new FlowArenaRun(90217);
  const b = new FlowArenaRun(90217);
  for (let i = 0; i < ARENA_DURATION; i++) { a.tick(); b.tick(); }
  assert.deepEqual(a.eventPlan, b.eventPlan);
  assert.deepEqual(a.cohorts, b.cohorts);
  assert.deepEqual(a.market.tradeLog, b.market.tradeLog);
  assert.deepEqual(a.result, b.result);
});

test("same retail seed branches after a player's market impact", () => {
  const a = new FlowArenaRun(76180);
  const b = new FlowArenaRun(76180);
  const order = a.submit("buy", "market", 5000);
  assert.equal(order.ok, true);
  assert.ok(order.matched > 0);
  assert.ok(order.impact > 0);
  for (let i = 0; i < 16; i++) { a.tick(); b.tick(); }
  assert.notDeepEqual(a.market.candles.map((c) => c.close), b.market.candles.map((c) => c.close));
});

test("crowd liquidation prices follow leverage and maintenance margin", () => {
  assert.equal(cohortLiquidationPrice(1, 10000000, 50), Math.round(10000000 * (1 - 1 / 50 + ARENA_MAINTENANCE)));
  assert.equal(cohortLiquidationPrice(-1, 10000000, 25), Math.round(10000000 * (1 + 1 / 25 - ARENA_MAINTENANCE)));
  const run = new FlowArenaRun(21007);
  const mapped = run.liquidationLevels().reduce((sum, row) => sum + row.long + row.short, 0);
  assert.equal(mapped, run.cohorts.reduce((sum, cohort) => sum + cohort.lots, 0));
  assert.ok(run.cohorts.some((cohort) => cohort.kind === "trapped"));
  for (const cohort of run.cohorts) {
    assert.ok(cohort.side > 0 ? cohort.liq < cohort.entry : cohort.liq > cohort.entry);
  }
});

test("pushing through a short-liquidation band fires forced buys credited to the player", () => {
  const run = quiet(new FlowArenaRun(44021));
  const last = run.market.last;
  const target = Math.round(last * 1.004);
  run.cohorts = [];
  run.addCohort(-1, Math.round(target / (1 + 1 / 50 - ARENA_MAINTENANCE)), 1500, 50, "trapped");
  const band = run.cohorts[0];
  assert.ok(Math.abs(band.liq - target) <= 2);
  const first = run.market.tradeLog.length;
  const result = run.submit("buy", "market", 3000);
  assert.equal(result.ok, true);
  assert.ok(result.cascade, "the push fires a liquidation wave");
  const forced = liquidationTrades(run, first);
  assert.ok(forced.length > 0);
  assert.ok(forced.every((trade) => trade.aggressorSide === "buy"));
  const forcedLots = forced.reduce((sum, trade) => sum + trade.lots, 0);
  assert.equal(forcedLots, 1500 - (run.cohorts.find((cohort) => cohort.id === band.id)?.lots ?? 0));
  const item = run.liquidationFeed.at(-1);
  assert.equal(item.side, "short");
  assert.equal(item.ignited, true);
  assert.equal(run.stats.ignitedLots, forcedLots);
});

test("a cascade resolves one wave per second instead of all at once", () => {
  const run = quiet(new FlowArenaRun(44021));
  const last = run.market.last;
  run.cohorts = [];
  // Three stacked bands: each wave should only reach the next band after the market advances.
  for (const step of [1.004, 1.016, 1.028]) {
    const liq = Math.round(last * step);
    run.addCohort(-1, Math.round(liq / (1 + 1 / 50 - ARENA_MAINTENANCE)), 2500, 50, "trapped");
  }
  run.submit("buy", "market", 3000);
  const firstWave = run.liquidationFeed.filter((item) => !item.warm).length;
  assert.equal(firstWave, 1);
  for (let i = 0; i < 4; i++) run.tick();
  const waves = run.liquidationFeed.filter((item) => !item.warm && item.side === "short");
  assert.ok(waves.length >= 2);
  assert.ok(waves.some((item) => item.chain >= 2));
  assert.ok(new Set(waves.map((item) => item.time)).size >= 2, "waves land on different seconds");
});

test("a band the push crossed still liquidates after the price snaps back", () => {
  const run = quiet(new FlowArenaRun(51290));
  const last = run.market.last;
  run.cohorts = [];
  run.addCohort(-1, Math.round(last * 1.003 / (1 + 1 / 50 - ARENA_MAINTENANCE)), 2000, 50, "trapped");
  const band = run.cohorts[0];
  // The push takes the only ask; nothing is left within reach for the forced buys.
  for (const order of [...run.market.restingOrders].filter((item) => item.side === "sell")) run.market.cancel(order.id, order.owner);
  run.market.submit("sell", Math.round(last * 1.005), 300, { owner: "test-ask" });
  run.submit("buy", "market", 300);
  assert.ok(run.market.last > band.liq, "the push crossed the band");
  assert.equal(band.lots, 2000, "the first forced wave found no sellers");
  // The maker requotes below the band next second; the crossed band still has to buy.
  for (let i = 0; i < 3; i++) run.tick();
  assert.ok(!run.cohorts.includes(band) || band.lots === 0, `band still holds ${band.lots} lots after being crossed`);
});

test("a push is not called absorbed when its own fills reached the visible-book estimate", () => {
  // Take-profit selling the push triggers pulls the last trade back, though nothing hidden absorbed it.
  const run = quiet(new FlowArenaRun(24680));
  run.cohorts = [];
  const last = run.market.last;
  run.addCohort(1, Math.round(last * 0.99), 3000, 10, "retail", null, Math.round(last * 1.001));
  const shown = run.previewOrder("buy", "market", 1000);
  const result = run.submit("buy", "market", 1000);
  assert.ok(run.market.last < shown.worstPrice, "take-profit selling pulled the last trade back");
  assert.equal(result.stalled, false);
  assert.ok(result.reach > 0, "the probe's own fills moved up");
});


test("a push nobody follows drifts back toward the maker's fair value", () => {
  const a = quiet(new FlowArenaRun(61001));
  const b = quiet(new FlowArenaRun(61001));
  a.cohorts = [];
  b.cohorts = [];
  a.submit("buy", "market", 2500);
  const peak = a.market.last / b.market.last - 1;
  for (let i = 0; i < 12; i++) { a.cohorts = []; b.cohorts = []; a.tick(); b.tick(); }
  const later = a.market.last / b.market.last - 1;
  assert.ok(peak > 0.004);
  assert.ok(later < peak * 0.8, `impact ${peak} should fade, still ${later}`);
});

test("stop and take thresholds use decimal prices while the book uses cents", () => {
  const run = new FlowArenaRun(51290);
  run.submit("buy", "market", 1000);
  assert.ok(run.account.position > 0);
  const mark = run.markPrice() / 100;
  assert.equal(run.setProtection(mark - 1, mark + 1), null);
  assert.equal(run.protection.stop, Math.round((mark - 1) * 100));
  assert.equal(run.protection.take, Math.round((mark + 1) * 100));
});

test("exits fill through backstop depth during a liquidity drought", () => {
  const run = new FlowArenaRun(51290);
  run.submit("sell", "market", 5000);
  assert.equal(run.account.position, -5000);
  run.activeEvent = { start: 0, duration: 30, depth: 0.15, activity: 1, side: 0, drought: true };
  run.tick();
  const result = run.close();
  assert.equal(result.ok, true);
  assert.equal(run.account.position, 0);
  assert.equal(run.exitIntent, null);
  assert.ok(run.lastExecution.slippage > 0);
});

test("a triggered stop retries when the whole opposing book is gone", () => {
  const run = quiet(new FlowArenaRun(51290));
  run.submit("buy", "market", 100);
  assert.equal(run.account.position, 100);
  run.actMaker = () => {};
  run.market.step = () => null;
  run.market.removeOwner("maker");
  for (const order of [...run.market.restingOrders].filter((item) => item.side === "buy")) run.market.cancel(order.id, order.owner);
  run.protection = { stop: run.markPrice() + 100, take: null };
  run.tick();
  assert.equal(run.account.position, 100);
  assert.equal(run.exitIntent?.reason, "stop");
  run.market.submit("buy", run.market.last - 100, 100, { owner: "test-bid" });
  run.tick();
  assert.equal(run.account.position, 0);
  assert.equal(run.exitIntent, null);
});

test("isolated liquidation price follows the chosen leverage", () => {
  for (const leverage of [1, 3, 5, 10, 20]) {
    const run = quiet(new FlowArenaRun(33084));
    assert.equal(run.setLeverage(leverage), null);
    run.submit("buy", "market", 2000);
    const { entry, margin, position } = run.account;
    assert.ok(Math.abs(margin - position * entry / CENT_LOTS_PER_USDT / leverage) <= position / CENT_LOTS_PER_USDT, "margin is notional / leverage (entry rounds to a cent)");
    const liq = run.playerLiquidationPrice();
    const loss = position * (entry - liq) / CENT_LOTS_PER_USDT;
    const maintenance = position * liq / CENT_LOTS_PER_USDT * ARENA_MAINTENANCE;
    assert.ok(Math.abs(loss - (margin - maintenance)) <= position / CENT_LOTS_PER_USDT * 1.01, `${leverage}x liquidation uses the margin down to maintenance`);
    if (leverage === 10) assert.ok(Math.abs(liq / entry - (1 - 1 / 10 + ARENA_MAINTENANCE)) < 0.001);
  }
});

test("opening exposure needs free margin; closing never does", () => {
  const run = quiet(new FlowArenaRun(33084));
  assert.equal(run.setLeverage(1), null);
  const tooBig = run.submit("sell", "market", 15000);
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.error, /可用保證金不足/);
  const room = run.maxOpenLots();
  assert.ok(room > 9000 && room < 10000, `1x room ${room}`);
  assert.equal(run.submit("sell", "market", 5000).ok, true);
  assert.ok(run.availableMargin() < run.account.balance * 0.55);
  const resting = run.submit("sell", "limit", 4000, Math.round(run.market.last * 1.05));
  assert.equal(resting.ok, true);
  assert.ok(run.reservedMargin() > 0, "resting opening orders reserve margin");
  assert.equal(run.submit("sell", "market", 3000).ok, false);
  assert.equal(run.close().ok, true, "closing needs no margin");
  assert.equal(run.account.position, 0);
  run.submit("buy", "limit", 100, Math.round(run.market.last * 0.95));
  assert.equal(run.setLeverage(10), "空倉且沒有掛單時才能調整槓桿");
  run.cancelAll();
  assert.equal(run.setLeverage(10), null);
  assert.equal(run.submit("sell", "market", 5000).ok, true);
});

test("risk limits cap position size by leverage, counting resting orders", () => {
  const run = quiet(new FlowArenaRun(33084));
  assert.equal(run.setLeverage(20), null);
  const cap = run.riskLimitLots(20);
  assert.equal(run.btc(cap), ARENA_RISK_LIMITS[20]);
  assert.equal(run.maxOpenLots(), cap);
  const tooBig = run.submit("buy", "market", cap + 500);
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.error, /風險限額/);
  assert.equal(run.submit("buy", "market", 1500).ok, true);
  // A resting sell twice the position could flip into a short past the limit.
  const flip = run.submit("sell", "limit", 1500 + cap + 500, Math.round(run.market.last * 1.03));
  assert.equal(flip.ok, false);
  assert.equal(run.submit("sell", "limit", 1500, Math.round(run.market.last * 1.03), { reduceOnly: true }).ok, true, "reduce-only exits never count");
  run.cancelAll();
  run.close();
  assert.equal(run.setLeverage(3), null);
  assert.ok(run.maxOpenLots() > cap, "lower leverage allows a larger position");
});

test("order room is the largest size validateOrder accepts, and names what caps it", () => {
  const run = quiet(new FlowArenaRun(33084));
  assert.equal(run.setLeverage(3), null);
  const cap = run.riskLimitLots(3);
  assert.deepEqual(run.orderRoom("buy"), { lots: cap, limit: "risk" });
  assert.equal(run.submit("buy", "market", 4000).ok, true);
  run.submit("buy", "limit", 2000, Math.round(run.market.last * 0.97));
  const room = run.orderRoom("buy");
  assert.deepEqual(room, { lots: cap - 6000, limit: "risk" }, "position and resting orders both count");
  assert.equal(run.submit("buy", "market", room.lots + 10).ok, false);
  assert.equal(run.orderRoom("sell").lots, cap + 4000, "selling closes the long before it opens a short");
  run.cancelAll();
  run.close();

  assert.equal(run.setLeverage(1), null);
  const margin = run.orderRoom("sell");
  assert.equal(margin.limit, "margin");
  assert.equal(run.submit("sell", "limit", margin.lots, run.market.last).ok, true);
  assert.ok(run.orderRoom("sell").lots <= 10, "only a rounding remainder is left");
  assert.equal(run.submit("sell", "market", margin.lots).ok, false);
});

test("mid-round build-ups pile one leverage into a new band", () => {
  const run = new FlowArenaRun(500001);
  while (!run.finished) run.tick();
  assert.ok(run.buildups.length >= 3, `${run.buildups.length} build-ups`);
  for (const buildup of run.buildups) {
    assert.ok(buildup.start >= 16 && buildup.start <= ARENA_DURATION - 25);
    assert.ok(buildup.lots >= 1500 && buildup.lots <= 4000);
    assert.ok([25, 50].includes(buildup.leverage));
  }
});

test("reduce-only orders and partial closes never flip the position", () => {
  const run = quiet(new FlowArenaRun(33084));
  run.submit("buy", "market", 2500);
  const half = run.closePart(0.5);
  assert.equal(half.ok, true);
  assert.equal(run.account.position, 1250);
  const clipped = run.submit("sell", "market", 5000, null, { reduceOnly: true });
  assert.equal(clipped.ok, true);
  assert.equal(run.account.position, 0, "clipped to the position instead of opening a short");
  assert.equal(run.submit("sell", "market", 100, null, { reduceOnly: true }).ok, false);
  run.submit("buy", "market", 1000);
  run.submit("sell", "limit", 800, Math.round(run.market.last * 1.03), { reduceOnly: true });
  run.submit("sell", "limit", 800, Math.round(run.market.last * 1.04), { reduceOnly: true });
  const reduce = run.playerOrders().filter((order) => order.reduceOnly);
  assert.equal(reduce.reduce((sum, order) => sum + order.lots, 0), 1000, "reduce-only orders are trimmed to the position");
  run.close();
  assert.equal(run.playerOrders().length, 0, "reduce-only orders go away once flat");
});

test("an isolated liquidation loses only the position margin and the round goes on", () => {
  const run = quiet(new FlowArenaRun(61001));
  run.setLeverage(10);
  run.submit("buy", "market", 3000);
  const margin = run.account.margin;
  const before = run.account.balance;
  const liq = run.playerLiquidationPrice();
  // Wipe the bids and drop the market under the liquidation price.
  for (const order of [...run.market.restingOrders].filter((item) => item.side === "buy" && item.owner !== "player")) run.market.cancel(order.id, order.owner);
  run.market.submit("buy", Math.round(liq * 0.97), 50000, { owner: "test-bid" });
  run.market.submit("sell", Math.round(liq * 0.97), 100, { owner: "test-seller" });
  run.market.submit("sell", Math.round(liq * 0.975), 100, { owner: "test-ask" });
  run.markCache.key = "";
  run.checkPlayerLiquidation();
  assert.equal(run.account.position, 0);
  assert.equal(run.stats.playerLiquidations, 1);
  assert.ok(before - run.account.balance <= margin + 0.01, "loss capped at the margin");
  assert.equal(run.finished, false);
  assert.equal(run.episodes.at(-1).liquidated, true);
  assert.equal(run.review().notes[0].kind, "liquidated");
  assert.equal(run.submit("buy", "market", 500).ok, true, "the rest of the wallet keeps trading");
});

test("a round exports its actions, positions and review", () => {
  const run = quiet(new FlowArenaRun(33084));
  run.setLeverage(5);
  run.submit("buy", "market", 1000);
  run.tick();
  run.closePart(0.5);
  while (!run.finished) run.tick();
  const data = JSON.parse(JSON.stringify(run.exportData()));
  assert.equal(data.seed, 33084);
  assert.equal(data.result.leverage, 5);
  assert.ok(data.actions.some((action) => action.kind === "leverage" && action.leverage === 5));
  assert.ok(data.actions.filter((action) => action.kind === "submit").length >= 2);
  assert.ok(data.review.episodes.length >= 1);
});

test("order preview matches immediate fills; passive quotes stay as pending orders", () => {
  const run = quiet(new FlowArenaRun(33084));
  const resting = run.submit("buy", "limit", 100, 100);
  assert.equal(resting.ok, true);
  assert.equal(resting.resting, 100);
  assert.equal(run.playerOrders().length, 1);
  run.cancelAll();
  assert.equal(run.playerOrders().length, 0);
  run.cohorts = [];
  const preview = run.previewOrder("buy", "market", 3000);
  const actual = run.submit("buy", "market", 3000);
  assert.equal(actual.ok, true);
  assert.equal(preview.matched, actual.matched);
  assert.equal(preview.remaining, actual.unfilled);
  assert.equal(preview.avgPrice, actual.avgPrice);
  assert.equal(run.previewOrder("buy", "limit", 100, 0), null);
});

test("player limit orders stay on the book until filled or canceled", () => {
  const run = new FlowArenaRun(33084);
  const order = run.submit("buy", "limit", 100, Math.round(run.market.last * 0.8));
  for (let i = 0; i < 90; i++) run.tick();
  assert.ok(run.playerOrders().some((item) => item.id === order.id));
});

test("maker quotes keep their place in the queue while the price holds", () => {
  const run = quiet(new FlowArenaRun(61001));
  const far = [...run.maker.quotes.entries()].filter(([key]) => Number(key.split(":")[1]) >= 9);
  const before = new Map(far.map(([key, quote]) => [key, quote.ids[0]]));
  run.tick();
  const kept = far.filter(([key, quote]) => quote.ids.includes(before.get(key))).length;
  assert.ok(kept >= far.length * 0.75, `${kept} of ${far.length} far quotes kept their order`);
});

test("an iceberg refills inside one sweep and the tape exposes it", () => {
  const run = quiet(new FlowArenaRun(61001));
  const price = Math.round(run.market.last * 1.003);
  const arrival = run.market.submit("sell", price, 300, { owner: "defender" });
  run.market.order(arrival.id).iceberg = { display: 300, hidden: 3700, refills: 0 };
  const shown = run.previewOrder("buy", "market", 3000);
  const result = run.submit("buy", "market", 3000);
  assert.equal(result.ok, true);
  assert.ok(run.market.last <= price, "the sweep cannot pass the iceberg");
  assert.ok(result.stalled, "the push stalls short of the visible-book estimate");
  assert.ok(shown.worstPrice > price);
  const atIceberg = run.market.tradeLog.filter((trade) => trade.makerOwner === "defender").reduce((sum, trade) => sum + trade.lots, 0);
  assert.ok(atIceberg > 300);
  const signal = run.icebergSignals().find((item) => item.price === price);
  assert.ok(signal, "the iceberg shows up in the public read");
  assert.equal(signal.side, "sell");
  run.market.cancel(arrival.id, "defender");
  assert.equal(run.market.order(arrival.id), null);
  assert.equal(run.market.askLots.has(price), false);
});

test("seeded defenders guard trapped bands and are revealed after the round", () => {
  let run = null;
  for (let seed = 5000; seed < 5040 && !run; seed++) {
    const candidate = new FlowArenaRun(seed);
    if (candidate.defenders.length) run = candidate;
  }
  assert.ok(run, "some seed has a defender");
  for (const defender of run.defenders) {
    const cohort = run.cohorts.find((item) => item.id === defender.cohortId);
    assert.ok(cohort && cohort.kind === "trapped");
    assert.ok(defender.side === "sell" ? defender.price < cohort.liq && defender.price > run.market.last : defender.price > cohort.liq && defender.price < run.market.last);
    assert.ok(defender.total >= cohort.lots * 0.9);
    const order = run.market.order(defender.id);
    assert.ok(order.lots < defender.total, "only a slice is visible");
  }
  while (!run.finished) run.tick();
  const review = run.review();
  assert.equal(review.defenders.length, run.defenders.length);
  for (const defender of review.defenders) assert.ok(["broken", "withdrawn", "holding"].includes(defender.status));
});

test("headlines only change liquidity and never lean the flow one way", () => {
  for (const seed of [90217, 61001, 33084]) {
    const run = new FlowArenaRun(seed);
    assert.ok(run.eventPlan.length >= 3);
    for (const event of run.eventPlan) {
      assert.equal(event.side, undefined, `${event.title} carries no direction`);
      assert.ok(event.depth > 0 && event.depth < 1);
    }
  }
});

test("the hunter pushes into an affordable band and exits within a few seconds", () => {
  const run = new FlowArenaRun(61001);
  for (const defender of run.defenders) run.market.cancel(defender.id, "defender");
  run.defenders = [];
  run.cohorts = [];
  const liq = Math.round(run.market.last * 1.005);
  run.addCohort(-1, Math.round(liq / (1 + 1 / 50 - ARENA_MAINTENANCE)), 4000, 50, "trapped");
  // The hunter reads the same public estimate as the player.
  run.estimate = new Map();
  run.addEstimate(-1, liq, 4000);
  run.hunter.next = 0;
  run.time = 30;
  run.actHunter();
  assert.equal(run.hunter.strikes.length, 1);
  assert.equal(run.hunter.strikes[0].target, "band");
  assert.ok(run.hunter.position > 0);
  for (let i = 0; i < 6; i++) run.tick();
  assert.equal(run.hunter.position, 0);
  assert.notEqual(run.hunter.strikes[0].pnl, null);
});

test("the hunter goes after a heavily exposed player's liquidation price", () => {
  const run = new FlowArenaRun(61001);
  for (const defender of run.defenders) run.market.cancel(defender.id, "defender");
  run.defenders = [];
  run.cohorts = [];
  // A 5,000 BTC long whose isolated margin only covers a 1.6% drop: the liquidation price sits about 1.2% below.
  run.account.position = 10000;
  run.account.entry = run.market.last;
  run.account.margin = 10000 * run.market.last / CENT_LOTS_PER_USDT * 0.016;
  run.hunter.next = 0;
  run.time = 30;
  const liq = run.playerLiquidationPrice();
  assert.ok(liq < run.market.last && liq > run.market.last * 0.985);
  run.actHunter();
  assert.equal(run.hunter.strikes.at(-1)?.target, "player");
  assert.equal(run.hunter.strikes.at(-1).side, "sell");
});

test("the public heatmap is estimated from volume, not read from real positions", () => {
  const run = quiet(new FlowArenaRun(24680));
  run.cohorts = [];
  run.estimate = new Map();
  run.submit("buy", "market", 2000);
  assert.equal(run.liquidationLevels(25000).length, 0, "no leveraged crowd opened anything");
  const painted = run.estimatedLevels(25000).filter((row) => row.long > 0);
  assert.ok(painted.length >= 3, "a trader's buying still paints long bands at several assumed leverages");
  assert.ok(painted.every((row) => row.price < run.market.last));
  // A displayed bin gathers raw levels up to half a bin below its price.
  run.clearCrossedEstimates(Math.min(...painted.map((row) => row.price)) - 12500, run.market.last);
  assert.equal(run.estimatedLevels(25000).filter((row) => row.long > 0).length, 0, "levels the price traded through count as liquidated");
});

test("the market scales with the room and moves the same while traders sit still", () => {
  const solo = new FlowArenaRun(24680);
  const room = new FlowArenaRun(24680, { traders: ["player", "rival:1", "rival:2", "rival:3"] });
  assert.equal(room.contractBtc, ARENA_CONTRACT_BTC * 2.5);
  assert.equal(room.btc(100), 125);
  assert.equal(room.you.id, "player");
  for (let i = 0; i < 30; i++) {
    solo.tick();
    room.tick();
    assert.equal(room.market.last, solo.market.last);
  }
  for (const trader of room.traders) assert.equal(trader.equity(), ARENA_START_BALANCE);
});

test("traders fill each other's orders and the trade is recorded as a duel", () => {
  const run = quiet(new FlowArenaRun(24680, { traders: ["player", "rival:1"] }));
  const rival = run.trader("rival:1");
  const price = Math.round(run.market.last * 0.999);
  assert.equal(rival.submit("buy", "limit", 1000, price).ok, true);
  for (const order of run.market.restingOrders.filter((item) => item.side === "buy" && item.price > price && item.owner !== "rival:1")) run.market.cancel(order.id, order.owner);
  assert.equal(run.submit("sell", "market", 1000).ok, true);
  assert.equal(run.account.position, -1000);
  assert.equal(rival.account.position, 1000);
  assert.equal(rival.account.entry, price);
  const duel = run.review().duels.find((item) => item.taker === "player" && item.maker === "rival:1");
  assert.equal(duel.lots, 1000);
  assert.equal(duel.avgPrice, price);
});

test("self-trade prevention cancels the trader's own resting order instead of filling it", () => {
  const run = quiet(new FlowArenaRun(24680));
  const ask = run.previewOrder("buy", "market", 100).worstPrice;
  const own = run.submit("sell", "limit", 500, ask);
  assert.equal(own.ok, true);
  const result = run.submit("buy", "market", 2000);
  assert.equal(result.ok, true);
  assert.equal(run.playerOrders().length, 0, "the crossed resting order is gone");
  assert.equal(run.account.position, 2000, "every lot filled against someone else");
  assert.ok(!run.market.tradeLog.some((trade) => trade.makerOwner === "player" && trade.takerOwner === "player"));
});

test("a wave the rival ignited is credited to the rival, not to you", () => {
  const run = quiet(new FlowArenaRun(44021, { traders: ["player", "rival:1"] }));
  const rival = run.trader("rival:1");
  const target = Math.round(run.market.last * 1.004);
  run.cohorts = [];
  run.addCohort(-1, Math.round(target / (1 + 1 / 50 - ARENA_MAINTENANCE)), 1500, 50, "trapped");
  const result = rival.submit("buy", "market", 3000);
  assert.ok(result.cascade, "the rival's push fires a liquidation wave");
  const item = run.liquidationFeed.at(-1);
  assert.equal(item.by, "rival:1");
  assert.equal(item.ignited, false);
  assert.ok(rival.stats.ignitedLots > 0);
  assert.equal(run.stats.ignitedLots, 0);
});

test("a trader liquidated during a rival's push is knocked out by that rival", () => {
  const run = quiet(new FlowArenaRun(61001, { traders: ["player", "rival:1"] }));
  const rival = run.trader("rival:1");
  run.cohorts = [];
  run.account.position = 2000;
  run.account.entry = run.market.last;
  run.account.margin = run.notional(run.market.last, 2000) * 0.004;
  assert.ok(run.playerLiquidationPrice() > run.market.last * 0.999, "the long sits right on its liquidation price");
  rival.setLeverage(1);
  assert.equal(rival.submit("sell", "market", 3000).ok, true);
  run.tick();
  assert.equal(run.liquidated, true);
  const knockout = run.knockouts.find((item) => item.victim === "player");
  assert.equal(knockout?.by, "rival:1");
  assert.equal(run.lastLiquidation.by, "rival:1");
});

test("with rivals in the market the hunter leaves traders alone, and the round ranks every trader", () => {
  const run = new FlowArenaRun(61001, { traders: ["player", { id: "rival:1", name: "高手" }] });
  const rival = run.trader("rival:1");
  for (const defender of run.defenders) run.market.cancel(defender.id, "defender");
  run.defenders = [];
  run.cohorts = [];
  rival.account.position = 10000;
  rival.account.entry = run.market.last;
  rival.account.margin = run.notional(run.market.last, 10000) * 0.016;
  run.hunter.next = 0;
  run.time = 30;
  run.actHunter();
  assert.ok(run.hunter.strikes.every((strike) => strike.trader == null), "hunting a trader is left to the other traders");
  rival.account.position = 0;
  rival.account.margin = 0;
  run.time = ARENA_DURATION - 1;
  run.tick();
  assert.equal(run.standings.length, 2);
  const [first, second] = run.standings;
  const tied = first.score === second.score && first.roi === second.roi;
  assert.deepEqual(run.standings.map((row) => row.rank), tied ? [1, 1] : [1, 2]);
  assert.equal(run.standings.find((row) => row.id === "rival:1").name, "高手");
  assert.equal(run.result.rank, run.standings.find((row) => row.id === "player").rank);
});

test("each position episode records entries, exits, slippage and the resulting PnL", () => {
  const run = quiet(new FlowArenaRun(33084));
  const start = run.account.balance;
  run.submit("buy", "market", 2000);
  run.tick();
  run.close();
  assert.equal(run.episodes.length, 1);
  const episode = run.episodes[0];
  assert.equal(episode.direction, 1);
  assert.equal(episode.entryLots, 2000);
  assert.equal(episode.exitLots, 2000);
  assert.ok(Math.abs(episode.pnl - (run.account.balance - start)) < 0.01);
  assert.ok(episode.slippage > 0);
  run.submit("sell", "market", 1000);
  run.submit("buy", "market", 3000);
  assert.equal(run.episodes.length, 2);
  assert.equal(run.episode.direction, 1);
  assert.equal(run.episode.entryLots, 2000);
});

test("the review turns an absorbed push into a coaching note", () => {
  const run = quiet(new FlowArenaRun(61001));
  const price = Math.round(run.market.last * 1.003);
  const arrival = run.market.submit("sell", price, 300, { owner: "defender" });
  run.market.order(arrival.id).iceberg = { display: 300, hidden: 5700, refills: 0 };
  run.defenders.push({ id: arrival.id, cohortId: 0, side: "sell", price, total: 6000, band: price * 1.01, bandLots: 3000, absorbed: 0, fromPlayer: 0, broken: false, withdrawn: false });
  run.submit("buy", "market", 3000);
  for (let i = 0; i < 3; i++) run.tick();
  run.close();
  const review = run.review();
  assert.ok(review.episodes[0].absorbed >= 1500, "most of the push ran into the iceberg");
  assert.equal(review.notes[0].kind, "absorbed");
  assert.ok(review.defenders[0].fromPlayer >= 1500);
});

// Balance guard on fixed seeds: blind pumping loses the most, chasing the brightest band
// still loses, and a player who reads icebergs, probes and fades exhausted cascades wins.
test("blind pushing loses and no scripted strategy dominates the estimated map", () => {
  // The public heatmap is an estimate, so a strategy that trusts it blindly should not run away
  // with the game, and pushing without reading at all should lose clearly.
  const seeds = Array.from({ length: 60 }, (_, i) => 1000 + i * 7919);
  const play = (seed, name) => {
    const run = new FlowArenaRun(seed);
    const state = {};
    while (!run.finished) { ARENA_BOTS[name](run, run.you, state); run.tick(); }
    return run.result.roi;
  };
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const results = Object.fromEntries(["pump", "chain", "chainBig3x", "fade", "expert"].map((name) => [name, mean(seeds.map((seed) => play(seed, name)))]));
  assert.ok(results.pump < -1.5, `blind pumping ROI ${results.pump}`);
  for (const name of ["chain", "chainBig3x", "fade", "expert"]) assert.ok(results[name] < 2, `${name} ROI ${results[name]} dominates`);
  assert.ok(Math.max(results.chain, results.fade, results.expert) - results.pump > 2, "reading beats pushing blind");
});

