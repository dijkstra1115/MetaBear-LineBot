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
  run.actWhale = () => {};
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

test("the whale pulls passive orders the price has left behind", () => {
  const run = quiet(new FlowArenaRun(61001));
  run.time = run.whale.start;
  const far = Math.round(run.market.last * 0.97);
  const arrival = run.market.submit("buy", far, 500, { owner: "whale" });
  run.whale.orders.push({ id: arrival.id, born: run.time });
  const remaining = run.whale.remaining;
  run.whale.next = Infinity;
  run.actWhale();
  assert.equal(run.market.order(arrival.id), null);
  assert.equal(run.whale.remaining, remaining + 500);
});

test("the hunter pushes into an affordable band and exits within a few seconds", () => {
  const run = new FlowArenaRun(61001);
  for (const defender of run.defenders) run.market.cancel(defender.id, "defender");
  run.defenders = [];
  run.cohorts = [];
  const liq = Math.round(run.market.last * 1.005);
  run.addCohort(-1, Math.round(liq / (1 + 1 / 50 - ARENA_MAINTENANCE)), 4000, 50, "trapped");
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
  // 1,000 BTC long bought well above the market: equity is thin and the liquidation price sits about 1.2% below.
  run.account.position = 100000;
  run.account.entry = Math.round(run.market.last * 1.0287);
  run.hunter.next = 0;
  run.time = 30;
  const liq = run.playerLiquidationPrice();
  assert.ok(liq < run.market.last && liq > run.market.last * 0.985);
  run.actHunter();
  assert.equal(run.hunter.strikes.at(-1)?.target, "player");
  assert.equal(run.hunter.strikes.at(-1).side, "sell");
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
  assert.ok(review.episodes[0].absorbed >= 2000);
  assert.equal(review.notes[0].kind, "absorbed");
  assert.ok(review.defenders[0].fromPlayer >= 2000);
});

// Balance guard on fixed seeds: blind pumping loses the most, chasing the brightest band
// still loses, and a player who reads icebergs, probes and fades exhausted cascades wins.
test("reading the tape beats chasing the liquidation map", () => {
  const seeds = Array.from({ length: 24 }, (_, i) => 1000 + i * 7919);
  const pickBand = (run) => {
    const fuel = run.fuel(0.025);
    const last = run.market.last;
    return [
      fuel.shortPeak && { direction: 1, peak: fuel.shortPeak, distance: fuel.shortPeak.price / last - 1 },
      fuel.longPeak && { direction: -1, peak: fuel.longPeak, distance: 1 - fuel.longPeak.price / last },
    ].filter((item) => item && item.peak.lots >= 2000 && item.distance < 0.02).sort((a, b) => b.peak.lots / b.distance - a.peak.lots / a.distance)[0];
  };
  const sizeFor = (run, target) => {
    const side = target.direction > 0 ? "buy" : "sell";
    let lots = 500;
    while (lots < 10000) {
      const preview = run.previewOrder(side, "market", lots);
      if (preview.worstPrice != null && (target.direction > 0 ? preview.worstPrice >= target.peak.price : preview.worstPrice <= target.peak.price)) break;
      lots += 500;
    }
    return lots;
  };
  const guarded = (run, target) => run.icebergSignals().some((signal) => target.direction > 0
    ? signal.side === "sell" && signal.price > run.market.last && signal.price < target.peak.price
    : signal.side === "buy" && signal.price < run.market.last && signal.price > target.peak.price);
  const pump = (run) => {
    if (run.time % 20 === 5 && !run.account.position) run.submit("buy", "market", 4000);
    if (run.time % 20 === 7 && run.account.position) run.close();
  };
  const naive = (run, state) => {
    if (run.account.position) { if (run.time >= state.exitAt) run.close(); return; }
    if (run.time < 3 || run.time > 112 || run.time < (state.cool ?? 0)) return;
    const target = pickBand(run);
    if (!target) return;
    run.submit(target.direction > 0 ? "buy" : "sell", "market", sizeFor(run, target));
    state.exitAt = run.time + 3;
    state.cool = run.time + 7;
  };
  const expert = (run, state) => {
    state.avoid ??= new Map();
    if (run.account.position && !state.probing) { if (run.time >= state.exitAt) run.close(); return; }
    if (state.probing) {
      const target = state.probing;
      state.probing = null;
      if (state.stalled || guarded(run, target)) {
        run.close();
        state.avoid.set(target.peak.price, run.time + 30);
        state.cool = run.time + 3;
        return;
      }
      run.submit(target.direction > 0 ? "buy" : "sell", "market", Math.max(500, sizeFor(run, target)));
      state.exitAt = run.time + 3;
      state.cool = run.time + 7;
      return;
    }
    if (run.time < 3 || run.time > 112) return;
    const wave = run.liquidationFeed.filter((item) => !item.warm).at(-1);
    if (wave && wave.chain >= 2 && run.time - wave.time === 1 && state.faded !== wave.id) {
      state.faded = wave.id;
      run.submit(wave.side === "short" ? "sell" : "buy", "market", 2500);
      state.exitAt = run.time + 6;
      return;
    }
    if (run.time < (state.cool ?? 0)) return;
    const target = pickBand(run);
    if (!target || (state.avoid.get(target.peak.price) ?? 0) > run.time) return;
    if (guarded(run, target)) { state.cool = run.time + 2; return; }
    const probe = run.submit(target.direction > 0 ? "buy" : "sell", "market", 1000);
    state.stalled = probe.stalled || probe.impact * target.direction < 0.12;
    state.probing = target;
  };
  const play = (seed, bot) => {
    const run = new FlowArenaRun(seed);
    const state = {};
    while (!run.finished) { bot(run, state); run.tick(); }
    return run.result.roi;
  };
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const pumped = mean(seeds.map((seed) => play(seed, pump)));
  const chased = mean(seeds.map((seed) => play(seed, naive)));
  const read = mean(seeds.map((seed) => play(seed, expert)));
  assert.ok(pumped < -1.5, `blind pumping ROI ${pumped}`);
  assert.ok(chased < 0, `band chasing ROI ${chased}`);
  assert.ok(read > 0.1, `tape reading ROI ${read}`);
  assert.ok(read - chased > 0.4);
});
