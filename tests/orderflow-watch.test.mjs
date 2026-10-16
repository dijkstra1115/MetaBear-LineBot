import test from "node:test";
import assert from "node:assert/strict";
import { ALERT_DEFAULTS, IcebergWatch, LiqWatch, OiWatch, WallWatch, describe, watchPrint } from "../public/lab/orderflow/watch.js";

const T0 = Date.UTC(2026, 9, 16, 12, 0);
const S = 1_000;
const cfg = { ...ALERT_DEFAULTS };

test("only taker orders at or above the threshold are reported", () => {
  assert.equal(watchPrint([T0, "buy", 80_000, 49.9], cfg), null);
  const e = watchPrint([T0, "sell", 80_000, 75], cfg);
  assert.deepEqual(e, { kind: "print", t: T0, side: "sell", price: 80_000, qty: 75 });
  assert.match(describe(e), /大單 主動賣 75\.0 BTC @ 80,000/);
});

test("liquidations on one side add up inside the window, once per cooldown", () => {
  const w = new LiqWatch(cfg);
  assert.equal(w.add([T0, "long", 80_000, 10, "bybit"]), null); // $0.8M
  assert.equal(w.add([T0 + 70 * S, "long", 79_900, 10, "okx"]), null, "the first one left the 60 s window");
  const e = w.add([T0 + 80 * S, "long", 79_800, 10, "bybit"]); // $0.8M + $0.8M … still short
  assert.equal(e, null);
  const hit = w.add([T0 + 90 * S, "long", 79_700, 6, "bybit"]);
  assert.equal(hit.kind, "liq");
  assert.equal(hit.count, 3);
  assert.deepEqual([hit.low, hit.high], [79_700, 79_900]);
  assert.deepEqual(hit.exchanges.sort(), ["bybit", "okx"]);
  assert.equal(w.add([T0 + 95 * S, "long", 79_600, 30, "bybit"]), null, "cooling down");
  assert.ok(w.add([T0 + 95 * S, "short", 79_600, 30, "bybit"]), "the other side has its own cooldown");
});

test("an OI jump far outside the last day's changes is read with the price move", () => {
  const w = new OiWatch(cfg);
  let oi = 60_000;
  let t = T0;
  // Four hours of ±0.05 % noise.
  for (let k = 0; k < 60; k++) {
    oi *= 1 + (k % 2 ? 0.0005 : -0.0005);
    assert.equal(w.add((t += 300 * S), oi, 80_000), null);
  }
  const jump = w.add((t += 300 * S), oi * 1.008, 80_400);
  assert.equal(jump.kind, "oi");
  assert.ok(jump.z > 3);
  assert.equal(jump.reading, "新多單進場");
  assert.match(describe(jump), /OI 5 分鐘 \+0\.80%/);
  const drop = w.add((t += 300 * S), oi * 0.995, 80_100);
  assert.equal(drop.reading, "多單平倉");
});

test("a wall is reported after it holds, then as pulled or eaten when it goes", () => {
  const w = new WallWatch(cfg);
  const book = (wall) => {
    const bids = new Map([[79_995, 2], [79_985, 3], [79_975, 2], [79_965, 2]]);
    const asks = new Map([[80_005, 2], [80_015, 3], [80_025, 2], [80_035, 2]]);
    if (wall) bids.set(79_951, wall);
    return [bids, asks];
  };
  assert.deepEqual(w.check(T0, ...book(100)), [], "not held long enough yet");
  const [appeared] = w.check(T0 + 61 * S, ...book(100));
  assert.deepEqual([appeared.kind, appeared.side, appeared.price], ["wall", "bid", 79_950]);
  w.trade(79_990);
  const [pulled] = w.check(T0 + 70 * S, ...book(0));
  assert.equal(pulled.kind, "wall_pulled", "price never reached 79,950–79,960");

  const eaten = new WallWatch(cfg);
  eaten.check(T0, ...book(100));
  eaten.check(T0 + 61 * S, ...book(100));
  eaten.trade(79_955);
  eaten.check(T0 + 65 * S, ...book(80));
  const [gone] = eaten.check(T0 + 70 * S, ...book(0));
  assert.equal(gone.kind, "wall_eaten");
  assert.equal(gone.size, 100);
});

test("an iceberg is far more traded at a price than ever shown, while the level stays", () => {
  const w = new IcebergWatch(cfg);
  // Sellers hit 80,000 repeatedly; it never shows more than 5 BTC and keeps refilling.
  for (let k = 0; k < 12; k++) w.trade(T0 + k * S, 80_000, 2.5, true, 5);
  const bids = new Map([[80_000, 4]]);
  const [e] = w.check(T0 + 13 * S, bids, new Map());
  assert.deepEqual([e.kind, e.side, e.price, e.filled, e.shown], ["iceberg", "bid", 80_000, 30, 5]);
  assert.match(describe(e), /冰山 買方 80,000 已成交 30\.0 BTC，最多只顯示 5\.0 BTC/);

  const plain = new IcebergWatch(cfg);
  for (let k = 0; k < 12; k++) plain.trade(T0 + k * S, 80_000, 2.5, true, 40);
  assert.deepEqual(plain.check(T0 + 13 * S, new Map([[80_000, 10]]), new Map()), [], "it showed enough to cover the fills");
  const cleared = new IcebergWatch(cfg);
  for (let k = 0; k < 12; k++) cleared.trade(T0 + k * S, 80_000, 2.5, true, 5);
  assert.deepEqual(cleared.check(T0 + 13 * S, new Map(), new Map()), [], "the level is gone: it was simply eaten");
});
