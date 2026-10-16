import test from "node:test";
import assert from "node:assert/strict";
import { ALERT_DEFAULTS, IcebergWatch, LiqWatch, OiWatch, SpoofWatch, WallWatch, describe, watchPrint } from "../public/lab/orderflow/watch.js";

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

test("a wall cancelled within a second as price closes in is spoofing; one eaten or far away is not", () => {
  const MID = { bid: 80_995, ask: 81_005, mid: 81_000 };
  // An ask band at 81,050–81,060 (0.06 % above mid) holding 100 BTC for five seconds.
  const setup = () => {
    const w = new SpoofWatch(cfg);
    w.reset(T0, new Map([[80_995, 3]]), new Map([[81_005, 3], [81_052, 60], [81_057, 40]]));
    for (let k = 0; k <= 5; k++) w.update(T0 + k * S, [["ask", 81_005, 3, 3 + (k % 2)]], MID); // other levels move
    w.update(T0 + 5 * S, [["ask", 81_052, 60, 60]], MID); // the band is seen at 100 BTC
    return w;
  };
  const pulled = setup();
  pulled.trade(T0 + 5 * S + 100, 81_051, 1.5);
  const [e] = pulled.update(T0 + 5 * S + 400, [["ask", 81_052, 60, 0], ["ask", 81_057, 40, 0]], MID);
  assert.deepEqual([e.kind, e.side, e.price, e.size, e.traded], ["spoof", "ask", 81_050, 100, 1.5]);
  assert.ok(e.distPct < 0.1 && e.heldMs >= 5_000);
  assert.match(describe(e), /疑似誘單 賣單牆 81,050–81,060：價格距離 0\.06% 時，1 秒內撤掉 100 BTC，期間只成交 1\.5 BTC/);

  // Most of it cancelled counts too: 60 of 100 BTC gone, 40 left below the 50 BTC line.
  const [partial] = setup().update(T0 + 5 * S + 200, [["ask", 81_052, 60, 0]], MID);
  assert.deepEqual([partial.kind, partial.size], ["spoof", 60]);

  const eaten = setup();
  eaten.trade(T0 + 5 * S + 100, 81_052, 60);
  eaten.trade(T0 + 5 * S + 150, 81_057, 30);
  assert.deepEqual(eaten.update(T0 + 5 * S + 400, [["ask", 81_052, 60, 0], ["ask", 81_057, 40, 0]], MID), [], "trades took most of it");

  const far = setup();
  assert.deepEqual(far.update(T0 + 5 * S + 400, [["ask", 81_052, 60, 0], ["ask", 81_057, 40, 0]], { bid: 80_495, ask: 80_505, mid: 80_500 }), [], "price 0.7 % away");

  // The same size at the touch is quoting, not a wall: price has reached the band already.
  const touch = setup();
  assert.deepEqual(touch.update(T0 + 5 * S + 400, [["ask", 81_052, 60, 0], ["ask", 81_057, 40, 0]], { bid: 81_049, ask: 81_051, mid: 81_050 }), [], "the band holds the best ask");

  const slow = setup();
  slow.update(T0 + 6 * S, [["ask", 81_052, 60, 40]], MID); // 80
  slow.update(T0 + 7.5 * S, [["ask", 81_052, 40, 20]], MID); // 60
  assert.deepEqual(slow.update(T0 + 9 * S, [["ask", 81_057, 40, 20]], MID), [], "it shrank over seconds, not within one");

  const brief = new SpoofWatch(cfg);
  brief.reset(T0, new Map(), new Map([[81_052, 100]]));
  brief.update(T0, [["ask", 81_052, 100, 100]], MID);
  assert.deepEqual(brief.update(T0 + 1.5 * S, [["ask", 81_052, 100, 0]], MID), [], "it stood under three seconds");
});
