import test from "node:test";
import assert from "node:assert/strict";
import {
  SpotExchange,
  RULES,
  fee,
  reservePerLot,
} from "../public/orderflow/exchange-engine.js";
import {
  MarketWorld,
  Random,
  MAX_CANDLES,
  CANDLE_TICKS,
} from "../public/orderflow/exchange-market.js";
import {
  footprintRows,
  ChartViewport,
  candlesInRange,
} from "../public/orderflow/exchange-chart-data.js";
import {
  ExchangeSession,
  HISTORY_TICKS,
} from "../public/orderflow/exchange-session.js";
import { aggregateCandles } from "../public/orderflow/exchange-chart.js";

function exchange() {
  const x = new SpotExchange();
  for (const owner of ["player", "a", "b", "c"])
    x.addAccount(owner, 100000000, 100000);
  return x;
}
const limit = (side, price, size) => ({ side, type: "limit", price, size });
const market = (side, size) => ({ side, type: "market", size });
function totals(x) {
  return Object.values(x.accounts).reduce(
    (s, a) => ({ cash: s.cash + a.cash, base: s.base + a.base }),
    { cash: x.fees, base: 0 },
  );
}
function invariant(x) {
  for (const [id, a] of Object.entries(x.accounts)) {
    assert.ok(
      Number.isSafeInteger(a.cash) && a.cash >= 0,
      `${id}: cash ${a.cash}`,
    );
    assert.ok(
      Number.isSafeInteger(a.base) && a.base >= 0,
      `${id}: base ${a.base}`,
    );
    const available = x.available(id);
    assert.ok(available.cash >= 0, `${id}: available cash ${available.cash}`);
    assert.ok(available.base >= 0, `${id}: available base ${available.base}`);
  }
  const bid = x.book("buy")[0],
    ask = x.book("sell")[0];
  if (bid && ask)
    assert.ok(bid.price < ask.price, "Book must never stay crossed");
  for (const order of x.orders)
    assert.ok(order.remaining > 0 && Number.isSafeInteger(order.remaining));
}

test("price-time priority sweeps best prices then FIFO at the same price", () => {
  const x = exchange(),
    total = totals(x);
  x.submit("c", limit("sell", 10100, 50));
  const first = x.submit("a", limit("sell", 10000, 40));
  const second = x.submit("b", limit("sell", 10000, 50));
  const result = x.submit("player", market("buy", 110));
  assert.equal(result.filled, 110);
  assert.equal(result.value, 40 * 10000 + 50 * 10000 + 20 * 10100);
  assert.deepEqual(
    x.trades.map((t) => [t.maker, t.size]),
    [
      ["a", 40],
      ["b", 50],
      ["c", 20],
    ],
  );
  assert.ok(first.id < second.id);
  assert.equal(x.book("sell")[0].remaining, 30);
  assert.deepEqual(totals(x), total);
  invariant(x);
});

test("marketable limit trades at resting price and posts the unfilled remainder", () => {
  const x = exchange();
  x.submit("a", limit("sell", 10000, 100));
  const r = x.submit("player", limit("buy", 10100, 250));
  assert.equal(r.filled, 100);
  assert.equal(r.status, "partial");
  assert.equal(r.value, 1000000);
  assert.equal(x.book("buy")[0].price, 10100);
  assert.equal(x.available("player").lockedCash, 150 * reservePerLot(10100));
  invariant(x);
});

test("market orders never fabricate liquidity or rest on an empty book", () => {
  const x = exchange();
  const empty = x.submit("player", market("buy", 100));
  assert.equal(empty.filled, 0);
  assert.equal(empty.status, "cancelled");
  x.submit("a", limit("sell", 10000, 70));
  const partial = x.submit("player", market("buy", 100));
  assert.equal(partial.filled, 70);
  assert.equal(partial.remaining, 30);
  assert.equal(x.orders.length, 0);
  assert.match(partial.reason, /掛單不足/);
});

test("partial market buy uses only available cash and leaves reserved cash intact", () => {
  const x = exchange();
  x.accounts.player.cash = 20000;
  x.submit("player", limit("buy", 9000, 1));
  x.submit("a", limit("sell", 10000, 100));
  const r = x.submit("player", market("buy", 100));
  assert.equal(r.filled, 1);
  assert.equal(r.remaining, 99);
  assert.equal(x.accounts.player.cash, 9995);
  invariant(x);
});

test("cash and inventory reservations prevent double spending and short sales", () => {
  const x = exchange();
  x.accounts.player.cash = 100050;
  x.accounts.player.base = 10;
  const buy = x.submit("player", limit("buy", 10000, 10));
  assert.equal(x.available("player").cash, 0);
  assert.equal(x.submit("player", limit("buy", 9000, 1)).ok, false);
  assert.equal(x.cancel(buy.id, "a"), false);
  assert.equal(x.cancel(buy.id, "player"), true);
  assert.equal(x.available("player").cash, 100050);
  x.submit("player", limit("sell", 11000, 10));
  assert.equal(x.submit("player", market("sell", 1)).ok, false);
  x.cancelAll("player");
  assert.equal(x.available("player").base, 10);
});

test("self trade protection cancels incoming remainder without falsifying trades", () => {
  const x = exchange();
  x.submit("a", limit("sell", 9900, 10));
  x.submit("player", limit("sell", 10000, 50));
  const r = x.submit("player", limit("buy", 11000, 100));
  assert.equal(r.filled, 10);
  assert.equal(r.remaining, 90);
  assert.match(r.reason, /自成交/);
  assert.equal(x.trades.length, 1);
  assert.equal(x.book("sell")[0].owner, "player");
  invariant(x);
});

test("fees are booked to the treasury with exact integer conservation", () => {
  const x = exchange();
  const before = totals(x);
  x.submit("player", limit("sell", 10001, 77));
  x.submit("a", market("buy", 31));
  x.submit("b", market("buy", 46));
  assert.deepEqual(totals(x), before);
  assert.equal(x.playerOrders[0].fee, fee(31 * 10001, 2) + fee(46 * 10001, 2));
  assert.equal(x.playerOrders[0].status, "filled");
  assert.equal(x.playerTrades.length, 2);
  invariant(x);
});

test("per-lot fee reserve remains funded across many tiny partial fills", () => {
  const x = exchange();
  x.accounts.player.cash = reservePerLot(10001) * 100;
  x.submit("player", limit("buy", 10001, 100));
  for (let i = 0; i < 100; i++) {
    x.submit("a", market("sell", 1));
    invariant(x);
  }
  assert.equal(x.accounts.player.base, 100100);
  assert.equal(x.playerOrders[0].status, "filled");
});

test("invalid numeric boundaries are rejected without modifying state", () => {
  const x = exchange();
  for (const command of [
    limit("buy", NaN, 5),
    limit("buy", 0, 5),
    limit("buy", 100.5, 5),
    limit("buy", 100, 0),
    limit("buy", 100, -1),
    market("sell", Infinity),
    market("buy", 0.1),
    limit("buy", RULES.maxPrice + 1, 1),
    market("buy", RULES.maxSize + 1),
    limit("buy", RULES.maxPrice, RULES.maxSize),
  ]) {
    const before = x.snapshot();
    assert.equal(x.submit("player", command).ok, false);
    assert.deepEqual(x.snapshot(), before);
  }
});

test("cancellations and expiration do not move the last traded price", () => {
  const x = exchange();
  x.submit("a", { ...limit("buy", 9500, 100), expires: 2 });
  x.submit("b", limit("sell", 11000, 100));
  x.time = 2;
  x.expire();
  x.cancelAll("b");
  assert.equal(x.lastPrice, 10000);
  assert.equal(x.trades.length, 0);
});

test("market quote is non-mutating and agrees with the actual execution", () => {
  const x = exchange();
  x.submit("a", limit("sell", 10001, 30));
  x.submit("b", limit("sell", 10021, 40));
  const state = x.snapshot(),
    quote = x.quote("buy", 100);
  assert.deepEqual(x.snapshot(), state);
  const r = x.submit("player", market("buy", 100));
  assert.deepEqual(quote, {
    filled: r.filled,
    remaining: r.remaining,
    value: r.value,
    fee: r.fee,
  });
});

test("initial market is populated, player-funded and has no pre-start session volume", () => {
  const w = new MarketWorld(42);
  assert.equal(w.tick, 0);
  assert.equal(w.stats.volume, 0);
  assert.equal(w.exchange.accounts.player.cash, 250000000);
  assert.equal(w.exchange.accounts.player.base, 25000);
  assert.ok(w.candles.length >= 60);
  assert.ok(w.exchange.orders.length > 20);
  assert.equal(w.exchange.playerTrades.length, 0);
  invariant(w.exchange);
});

test("NPC world remains liquid and conserves assets across seeds and player interventions", () => {
  for (const seed of [1, 42, 78432, 4294967295]) {
    const w = new MarketWorld(seed),
      rng = new Random(seed + 10),
      before = totals(w.exchange);
    for (let i = 0; i < 3600; i++) {
      if (i % 33 === 0) {
        const side = rng.next() < 0.5 ? "buy" : "sell";
        w.command(
          rng.next() < 0.65
            ? market(side, rng.between(1, 19000))
            : limit(
                side,
                Math.max(1, w.exchange.lastPrice + rng.between(-300, 300)),
                rng.between(1, 500),
              ),
        );
      }
      if (i % 197 === 0) w.command({ action: "cancelAll" });
      w.step();
      if (i % 100 === 0) {
        invariant(w.exchange);
        assert.deepEqual(totals(w.exchange), before);
      }
    }
    invariant(w.exchange);
    assert.deepEqual(totals(w.exchange), before);
    assert.ok(w.exchange.trades.length > 1000);
    assert.ok(w.exchange.volume > 100000);
    assert.ok(w.stats.high > w.stats.low);
  }
});

test("snapshots restore NPC inventory, random streams, schedules and exact future", () => {
  const w = new MarketWorld(345);
  for (let i = 0; i < 333; i++) w.step();
  const saved = w.snapshot();
  for (let i = 0; i < 777; i++) w.step();
  const future = w.snapshot();
  w.restore(saved);
  for (let i = 0; i < 777; i++) w.step();
  assert.deepEqual(w.snapshot(), future);
});

test("replay restores player orders, same-tick actions, fills and balances exactly", () => {
  const s = new ExchangeSession(2026);
  s.execute(limit("buy", 1, 100));
  s.execute(market("buy", 1200));
  s.advance(120);
  s.execute(limit("sell", 15000, 500));
  s.execute({ action: "cancelAll" });
  s.advance(600);
  s.execute(market("sell", 1000));
  const expected = s.world.snapshot();
  for (const target of [0, 120, 180, 500, 719]) {
    s.seek(target);
    s.advance(720 - target);
    assert.deepEqual(s.world.snapshot(), expected, `seek ${target}`);
  }
});

test("invalid orders in the past preserve the future; valid orders fork and remove future commands", () => {
  const s = new ExchangeSession(77);
  s.advance(100);
  s.execute(market("buy", 1000));
  s.advance(100);
  s.execute(market("sell", 500));
  s.advance(100);
  s.seek(150);
  const before = s.world.snapshot();
  assert.equal(s.execute(market("sell", RULES.maxSize + 1)).ok, false);
  assert.equal(s.head, 300);
  assert.equal(s.branch, 1);
  assert.deepEqual(s.world.snapshot(), before);
  const valid = s.execute(limit("buy", 1, 100));
  assert.equal(valid.branched, true);
  assert.equal(s.head, 150);
  assert.equal(s.branch, 2);
  assert.ok(s.commands.every((c) => c.tick <= 150));
  s.advance(150);
  assert.equal(
    s.world.exchange.playerOrders.some((o) => o.side === "sell"),
    false,
  );
});

test("same inputs are independent of playback batching and chart sampling", () => {
  const a = new ExchangeSession(27),
    b = new ExchangeSession(27);
  for (let i = 0; i < 100; i++) a.advance(1);
  b.advance(100);
  a.execute(market("buy", 321));
  b.execute(market("buy", 321));
  for (let i = 0; i < 50; i++) {
    a.advance(4);
    aggregateCandles(a.world.candles, 30);
  }
  b.advance(200);
  assert.deepEqual(a.world.snapshot(), b.world.snapshot());
});

test("save/load preserves cursor and future replay, including a branched timeline", () => {
  const s = new ExchangeSession(117);
  s.advance(124);
  s.execute(market("buy", 123));
  s.advance(256);
  s.seek(210);
  s.execute(limit("sell", 15000, 210));
  s.advance(170);
  const future = s.world.snapshot();
  s.seek(150);
  const loaded = ExchangeSession.load(s.serialize());
  assert.deepEqual(loaded.world.snapshot(), s.world.snapshot());
  assert.equal(loaded.branch, 2);
  assert.equal(loaded.head, 380);
  loaded.advance(230);
  assert.deepEqual(loaded.world.snapshot(), future);
});

test("rolling twenty-minute rewind stays bounded and survives saved checkpoints", () => {
  const s = new ExchangeSession(519);
  s.execute(market("buy", 100));
  for (let i = 0; i < 6; i++) s.advance(1000);
  assert.ok(s.earliest >= 6000 - HISTORY_TICKS - 120);
  const head = s.world.snapshot();
  const loaded = ExchangeSession.load(s.serialize());
  loaded.seek(0);
  assert.equal(loaded.world.tick, s.earliest);
  loaded.seek(loaded.head);
  assert.deepEqual(loaded.world.snapshot(), head);
  assert.equal(
    loaded.world.exchange.playerTrades.length,
    s.world.exchange.playerTrades.length,
  );
  assert.ok(s.serialize().length < 3000000);
});

test("candles aggregate only executed trades, including player orders while paused", () => {
  const w = new MarketWorld(888),
    tick = w.tick;
  const result = w.command(market("buy", 10000));
  assert.ok(result.filled > 0);
  assert.equal(w.tick, tick);
  assert.equal(w.stats.volume, result.filled);
  assert.equal(w.candles.at(-1).volume, result.filled);
  const last = structuredClone(w.candles.at(-1));
  w.command(limit("buy", 1, 100));
  w.command({ action: "cancelAll" });
  assert.deepEqual(w.candles.at(-1), last);
  const grouped = aggregateCandles(w.candles, 30);
  assert.equal(
    grouped.reduce((n, b) => n + b.volume, 0),
    w.candles.reduce((n, b) => n + b.volume, 0),
  );
});

test("invalid or incompatible saved games are rejected", () => {
  for (const raw of [
    "broken",
    "{}",
    '{"version":1}',
    '{"version":2,"head":-1}',
  ])
    assert.throws(() => ExchangeSession.load(raw));
});

test("footprints and cumulative delta reconcile exactly with real aggressor fills", () => {
  const w = new MarketWorld(1234);
  const initialCvd = w.cvd;
  const buy = w.command(market("buy", 8100));
  const sell = w.command(market("sell", 5600));
  const bar = w.candles.at(-1);
  assert.equal(w.cvd - initialCvd, buy.filled - sell.filled);
  assert.equal(bar.cvdClose - bar.cvdOpen, 2 * bar.buy - bar.volume);
  const rows = footprintRows(bar.footprint, 10);
  assert.equal(
    rows.reduce((n, r) => n + r.buy, 0),
    buy.filled,
  );
  assert.equal(
    rows.reduce((n, r) => n + r.sell, 0),
    sell.filled,
  );
  for (const trade of w.exchange.trades.filter((t) => t.time === 0)) {
    assert.ok(
      bar.footprint[trade.price][trade.side === "buy" ? 1 : 0] >= trade.size,
    );
  }
});

test("timeframe aggregation preserves footprint sides, CVD endpoints and source bars", () => {
  const w = new MarketWorld(199);
  for (let i = 0; i < 241; i++) w.step();
  const source = structuredClone(w.candles);
  for (const seconds of [30, 60, 300]) {
    const groups = aggregateCandles(w.candles, seconds);
    assert.equal(groups[0].cvdOpen, source[0].cvdOpen);
    assert.equal(groups.at(-1).cvdClose, source.at(-1).cvdClose);
    for (const bar of groups) {
      const rows = footprintRows(bar.footprint, 25);
      assert.equal(
        rows.reduce((n, r) => n + r.sell + r.buy, 0),
        bar.volume,
      );
      assert.equal(
        rows.reduce((n, r) => n + r.buy, 0),
        bar.buy,
      );
      assert.equal(bar.cvdClose - bar.cvdOpen, 2 * bar.buy - bar.volume);
    }
  }
  assert.deepEqual(w.candles, source);
});

test("heatmap captures resting volume and removes cancellations without fabricating executions", () => {
  const w = new MarketWorld(529);
  const price = w.exchange.book("buy")[0].price;
  const cvd = w.cvd,
    volume = w.candles.at(-1).volume;
  const before = w.candles.at(-1).depth.bids.find(([p]) => p === price)[1];
  const order = w.command(limit("buy", price, 100));
  assert.ok(order.ok);
  assert.equal(
    w.candles.at(-1).depth.bids.find(([p]) => p === price)[1],
    before + 100,
  );
  w.command({ action: "cancel", id: order.id });
  assert.equal(
    w.candles.at(-1).depth.bids.find(([p]) => p === price)[1],
    before,
  );
  assert.equal(w.cvd, cvd);
  assert.equal(w.candles.at(-1).volume, volume);
  const closed = structuredClone(w.candles.at(-1));
  for (let i = 0; i < CANDLE_TICKS + 4; i++) w.step();
  const historical = w.candles.find((b) => b.time === closed.time);
  assert.ok(historical.depth.time < CANDLE_TICKS);
  const copy = structuredClone(historical);
  w.command(market("buy", 1000));
  assert.deepEqual(historical, copy);
});

test("twelve-hour history is bounded without rebasing cumulative delta", () => {
  const w = new MarketWorld(22, false);
  const count = MAX_CANDLES + 21;
  for (let i = 0; i < count; i++) {
    w.tick = i * CANDLE_TICKS;
    w.recordTrades([{ price: 10000 + (i % 10), size: 3, side: "buy" }]);
  }
  assert.equal(w.candles.length, MAX_CANDLES);
  assert.equal(w.candles[0].time, (count - MAX_CANDLES) * CANDLE_TICKS);
  assert.equal(w.cvd, count * 3);
  assert.equal(w.candles[0].cvdOpen, (count - MAX_CANDLES) * 3);
  assert.equal(w.candles.at(-1).cvdClose, count * 3);
});

test("shared history checkpoints cannot be changed by live commands, rewind or branching", () => {
  const s = new ExchangeSession(550);
  s.advance(120);
  const checkpoint = s.snapshots.at(-1);
  const expected = structuredClone(checkpoint);
  assert.equal(checkpoint.state.candles[0], s.world.candles[0]);
  assert.notEqual(checkpoint.state.candles.at(-1), s.world.candles.at(-1));
  s.execute(market("buy", 2500));
  s.advance(180);
  s.seek(120);
  s.execute(market("sell", 800));
  s.advance(200);
  assert.deepEqual(checkpoint, expected);
});

test("v2 migration preserves balances and future matching without inventing unavailable profiles", () => {
  const original = new ExchangeSession(211);
  original.execute(market("buy", 800));
  original.advance(300);
  const legacy = JSON.parse(original.serialize());
  legacy.version = 2;
  delete legacy.checkpoint.state.cvd;
  delete legacy.checkpoint.state.cvdAnchor;
  for (const bar of legacy.checkpoint.state.candles) {
    for (const key of [
      "cvdOpen",
      "cvdClose",
      "footprint",
      "footprintComplete",
      "depth",
    ])
      delete bar[key];
  }
  const loaded = ExchangeSession.load(JSON.stringify(legacy));
  assert.deepEqual(
    loaded.world.exchange.snapshot(),
    original.world.exchange.snapshot(),
  );
  assert.equal(loaded.world.candles[0].footprintComplete, false);
  assert.equal(loaded.world.candles[0].depth, null);
  assert.equal(loaded.world.candles.at(-1).footprintComplete, true);
  loaded.advance(200);
  original.advance(200);
  assert.deepEqual(
    loaded.world.exchange.snapshot(),
    original.world.exchange.snapshot(),
  );
  assert.deepEqual(
    ExchangeSession.load(loaded.serialize()).world.snapshot(),
    loaded.world.snapshot(),
  );
});

test("chart zoom anchors time and pan clamps without changing simulation state", () => {
  const v = new ChartViewport();
  const args = [0, 40000, 700, 40];
  let r = v.range(...args);
  const anchorTime = r.start + (r.end - r.start) * 0.3;
  v.zoom(2, 0.3, r, 40);
  r = v.range(...args);
  assert.equal(r.start + (r.end - r.start) * 0.3, anchorTime);
  v.pan(1e8, r, 40);
  r = v.range(...args);
  assert.equal(r.start, 0);
  v.pan(-1e8, r, 40);
  assert.equal(v.end, null);
  for (const factor of [1e8, 1e-8]) {
    v.zoom(factor, 1, v.range(...args), 40);
    assert.ok(v.spacing >= 1 && v.spacing <= 180);
  }
});

test("phone footprint zoom keeps completed bars visible instead of only future padding", () => {
  const v = new ChartViewport();
  v.spacing = 180;
  const range = v.range(0, 40000, 240, 40);
  assert.ok(range.start < 40000);
  assert.ok(range.end - 40040 < (range.end - range.start) * 0.13);
});

test("clipping a timeframe bar at the viewport edge does not truncate its executions", () => {
  const world = new MarketWorld(341);
  const all = aggregateCandles(world.candles, 60);
  const visible = aggregateCandles(
    candlesInRange(world.candles, 60, -1333, -1111),
    60,
  );
  for (const bar of visible)
    assert.deepEqual(
      bar,
      all.find((item) => item.time === bar.time),
    );
});
