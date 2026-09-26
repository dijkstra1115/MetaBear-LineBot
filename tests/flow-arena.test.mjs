import test from "node:test";
import assert from "node:assert/strict";
import {
  ARENA_CONTRACT_BTC,
  ARENA_DURATION,
  ARENA_INITIAL_PRICE,
  ARENA_MAINTENANCE,
  ARENA_PLAYER_MARGIN,
  ARENA_START_BALANCE,
  FlowArenaRun,
  cohortLiquidationPrice,
} from "../public/orderflow/flow-arena-engine.js";
import { arenaChartGeometry, arenaChartPriceAtY } from "../public/orderflow/flow-arena-chart.js";
import { FLOW_MODE_TARGET, TakerOnlyMarket } from "../public/orderflow/taker-only-engine.js";

const liquidationTrades = (run, from) => run.market.tradeLog.slice(from).filter((trade) => trade.takerOwner === "liquidation");

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

test("BTC round starts with 100 units of purchasing power and keeps orders uncapped", () => {
  const run = new FlowArenaRun(33084);
  assert.equal(run.market.last, ARENA_INITIAL_PRICE);
  assert.equal(run.startPrice, ARENA_INITIAL_PRICE);
  assert.equal(ARENA_CONTRACT_BTC, 1);
  assert.equal(ARENA_START_BALANCE, 10000000);
  assert.equal(ARENA_START_BALANCE / (ARENA_INITIAL_PRICE / 100 * ARENA_CONTRACT_BTC), 100);
  const accepted = run.submit("buy", "market", 2000);
  assert.equal(accepted.ok, true);
  assert.ok(run.account.position > 0);
  assert.ok(run.exposureRatio() > 0 && run.exposureRatio() < 1);
  const largeResting = run.submit("buy", "limit", 20000, 100);
  assert.equal(largeResting.ok, true);
  assert.equal(largeResting.resting, 20000);
  const close = run.close();
  assert.equal(close.ok, true);
  assert.equal(run.account.position, 0);
  assert.ok(run.account.fees > 0);
  const result = run.finish();
  assert.equal(result.balance, run.account.balance);
  assert.equal(result.utilizationFactor, 1);
});

test("one BTC contract gains 100 USDT when BTC rises 100 USDT", () => {
  const run = new FlowArenaRun(77551);
  run.account.position = 100;
  run.account.entry = ARENA_INITIAL_PRICE;
  run.market.restingOrders = [];
  run.market.last = ARENA_INITIAL_PRICE + 10000;
  assert.equal(run.equity(), ARENA_START_BALANCE + 100);
});

test("equal seeds reproduce retail, crowd positions, events and results", () => {
  const a = new FlowArenaRun(90217);
  const b = new FlowArenaRun(90217);
  for (let i = 0; i < ARENA_DURATION; i++) { a.tick(); b.tick(); }
  assert.deepEqual(a.eventPlan, b.eventPlan);
  assert.deepEqual(a.whale, b.whale);
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
  const run = new FlowArenaRun(44021);
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
  const run = new FlowArenaRun(44021);
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

test("a push nobody follows drifts back toward the maker's fair value", () => {
  const a = new FlowArenaRun(61001);
  const b = new FlowArenaRun(61001);
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
  const run = new FlowArenaRun(51290);
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

test("player liquidation price is where equity meets the risk margin", () => {
  const run = new FlowArenaRun(33084);
  run.account.position = 30000;
  run.account.entry = ARENA_INITIAL_PRICE;
  const price = run.playerLiquidationPrice();
  assert.ok(price < ARENA_INITIAL_PRICE);
  const equity = run.account.balance + run.account.position * (price - run.account.entry) / 10000;
  const exposure = price * run.account.position / 10000;
  // The price is rounded to a cent, so allow one cent of movement on the whole position.
  assert.ok(Math.abs(equity - exposure * ARENA_PLAYER_MARGIN) <= run.account.position / 10000 * 1.06);
});

test("order preview matches immediate fills; passive quotes stay as pending orders", () => {
  const run = new FlowArenaRun(33084);
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

// Balance guard on fixed seeds: blind pumping must lose, pushing into a large band must pay.
test("blind pumping loses while hunting large liquidation bands pays", () => {
  const seeds = Array.from({ length: 16 }, (_, i) => 1000 + i * 7919);
  const pump = (run) => {
    if (run.time % 20 === 5 && !run.account.position) run.submit("buy", "market", 4000);
    if (run.time % 20 === 7 && run.account.position) run.close();
  };
  const hunt = (run, state) => {
    if (run.account.position) { if (run.time >= state.exitAt) run.close(); return; }
    if (run.time < 3 || run.time > 112 || run.time < (state.cool ?? 0)) return;
    const fuel = run.fuel(0.025);
    const last = run.market.last;
    const target = [
      fuel.shortPeak && { direction: 1, peak: fuel.shortPeak, distance: fuel.shortPeak.price / last - 1 },
      fuel.longPeak && { direction: -1, peak: fuel.longPeak, distance: 1 - fuel.longPeak.price / last },
    ].filter((item) => item && item.peak.lots >= 2000 && item.distance < 0.02).sort((a, b) => b.peak.lots / b.distance - a.peak.lots / a.distance)[0];
    if (!target) return;
    const side = target.direction > 0 ? "buy" : "sell";
    let lots = 500;
    while (lots < 10000) {
      const preview = run.previewOrder(side, "market", lots);
      if (preview.worstPrice != null && (target.direction > 0 ? preview.worstPrice >= target.peak.price : preview.worstPrice <= target.peak.price)) break;
      lots += 500;
    }
    run.submit(side, "market", lots);
    state.exitAt = run.time + 3;
    state.cool = run.time + 7;
  };
  const play = (seed, bot) => {
    const run = new FlowArenaRun(seed);
    const state = {};
    while (!run.finished) { bot(run, state); run.tick(); }
    return run.result.roi;
  };
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const pumped = mean(seeds.map((seed) => play(seed, pump)));
  const hunted = mean(seeds.map((seed) => play(seed, hunt)));
  assert.ok(pumped < -1, `blind pumping ROI ${pumped}`);
  assert.ok(hunted > 0, `band hunting ROI ${hunted}`);
  assert.ok(hunted - pumped > 1.5);
});
