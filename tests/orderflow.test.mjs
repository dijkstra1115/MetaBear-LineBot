import test from "node:test";
import assert from "node:assert/strict";
import {
  Market,
  PaperAccount,
  metrics,
  scenarioFrames,
  lessonMarket,
} from "../public/orderflow/engine.js";
import {
  BybitSession,
  parseRecording,
  recordingFrame,
} from "../public/orderflow/feed.js";
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
const emptyMarket = () => {
  const m = new Market();
  m.orders = [];
  m.trades = [];
  m.history = [];
  return m;
};

test("market buy walks ascending asks, computes VWAP and leaves unmatched remainder", () => {
  const m = emptyMarket();
  m.add("sell", 102, 2);
  m.add("sell", 100, 1);
  const r = m.execute({ side: "buy", size: 4 });
  assert.deepEqual(
    r.fills.map((f) => f.price),
    [100, 102],
  );
  approx(r.avg, 304 / 3);
  assert.equal(r.remaining, 1);
  assert.equal(m.frame().cvd, 3);
  assert.equal(m.frame().volume, 3);
});
test("resting and cancelled limit orders do not create volume, CVD or OI", () => {
  const m = new Market(),
    before = m.frame();
  const r = m.execute({ side: "buy", type: "limit", price: 68000, size: 8 });
  assert.equal(r.filled, 0);
  assert.equal(m.frame().volume, before.volume);
  assert.ok(m.cancel(r.resting.id));
  assert.equal(m.frame().cvd, before.cvd);
  assert.equal(m.oi, before.oi);
});
test("marketable limit stops at limit and rests remainder", () => {
  const m = emptyMarket();
  m.add("sell", 100, 1);
  m.add("sell", 102, 3);
  const r = m.execute({ side: "buy", type: "limit", price: 101, size: 3 });
  assert.equal(r.filled, 1);
  assert.equal(r.resting.remaining, 2);
  assert.equal(m.book("sell")[0].price, 102);
});
test("iceberg conserves quantity and replenished slice loses time priority", () => {
  const m = emptyMarket(),
    iceberg = m.add("sell", 100, 6, false, 1);
  m.add("sell", 100, 2, true);
  const r = m.execute({ side: "buy", size: 4 });
  assert.deepEqual(
    r.fills.map((f) => f.size),
    [1, 2, 1],
  );
  assert.equal(r.fills[1].makerOwn, true);
  assert.equal(iceberg.remaining, 4);
  assert.equal(iceberg.visible, 1);
  assert.equal(m.book("sell")[0].hidden, 3);
  assert.equal(r.replenished, 2);
});
test("single-sided OI responds to counterpart disposition, not aggressor side", () => {
  const m = emptyMarket();
  m.add("sell", 100, 20);
  const base = m.oi;
  m.execute({ side: "buy", size: 3, disposition: "open" });
  assert.equal(m.oi, base + 3);
  m.execute({ side: "buy", size: 2, disposition: "close" });
  assert.equal(m.oi, base + 1);
  m.execute({ side: "buy", size: 4, disposition: "transfer" });
  assert.equal(m.oi, base + 1);
  assert.equal(m.frame().cvd, 9);
});
test("paper account handles partial close, reversal and fees", () => {
  const a = new PaperAccount(),
    frame = {
      asks: [{ price: 100, size: 10 }],
      bids: [{ price: 110, size: 10 }],
    };
  a.trade("buy", 0.5, frame);
  a.trade("sell", 0.2, frame);
  approx(a.position, 0.3);
  approx(a.realized, 2);
  a.trade("sell", 0.5, frame);
  approx(a.position, -0.2);
  approx(a.realized, 5);
  approx(a.entry, 110);
  approx(a.pnl(100).unrealized, 2);
  approx(a.fees, (50 + 22 + 55) * 0.00055);
});
test("replay snapshots have no future events and remain isolated", () => {
  const frames = scenarioFrames("absorb");
  assert.equal(frames.length, 17);
  const first = structuredClone(frames[0]);
  assert.ok(frames[16].trades.length > first.trades.length);
  frames[16].bids[0].size = 999;
  assert.deepEqual(frames[0], first);
});
test("CVD and VWAP use taker quantity weighting", () => {
  const m = metrics([
    { side: "buy", price: 100, size: 1 },
    { side: "sell", price: 104, size: 3 },
  ]);
  assert.equal(m.vwap, 103);
  assert.equal(m.cvd, -2);
  assert.equal(m.volume, 4);
});
function feed() {
  const f = new BybitSession(
    () => {},
    () => {},
  );
  f.reset();
  f.symbol = "BTCUSDT";
  return f;
}
test("feed replaces snapshots, applies delta deletions, ignores obsolete updates", () => {
  const f = feed(),
    book = (type, u, b, a) =>
      f.ingest({ topic: "orderbook.50.BTCUSDT", type, data: { u, b, a } });
  book("delta", 2, [["99", "2"]], []);
  assert.equal(f.ready, false);
  book("snapshot", 5, [["99", "2"]], [["101", "3"]]);
  book(
    "delta",
    7,
    [
      ["99", "0"],
      ["98", "4"],
    ],
    [],
  );
  book("delta", 6, [["99", "50"]], []);
  assert.deepEqual(
    f.frame().bids.map((r) => [r.price, r.size]),
    [[98, 4]],
  );
  book("snapshot", 1, [["95", "1"]], [["96", "2"]]);
  assert.deepEqual(
    f.frame().bids.map((r) => r.price),
    [95],
  );
});
test("feed deduplicates trades, merges ticker delta and normalizes OI", () => {
  const f = feed(),
    t = { i: "unique", S: "Buy", v: "2", p: "100", T: Date.now() };
  f.ingest({ topic: "publicTrade.BTCUSDT", data: [t, t] });
  f.ingest({
    topic: "tickers.BTCUSDT",
    type: "snapshot",
    data: { openInterest: "20", lastPrice: "100", fundingRate: ".0001" },
  });
  f.ingest({
    topic: "tickers.BTCUSDT",
    type: "delta",
    data: { lastPrice: "101" },
  });
  assert.equal(f.frame().cvd, 2);
  assert.equal(f.frame().oi, 10);
  assert.equal(f.frame().funding, 0.0001);
  f.ingest({
    topic: "tickers.BTCUSDT",
    type: "delta",
    data: { singleOpenInterest: "12" },
  });
  assert.equal(f.frame().oi, 12);
  f.reset();
  assert.equal(f.frame().cvd, 0);
  assert.equal(f.ready, false);
});
test("liquidation Buy means long and does not double-count CVD", () => {
  const f = feed();
  f.ingest({
    topic: "allLiquidation.BTCUSDT",
    data: [{ S: "Buy", v: "3", p: "100", T: 123 }],
  });
  assert.equal(f.frame().liquidations[0].side, "long");
  assert.equal(f.frame().cvd, 0);
});
test("recording round-trips, rejects crossed books and non-finite / malformed input", () => {
  const frames = scenarioFrames("absorb").slice(0, 3).map(recordingFrame);
  frames.forEach((f, i) => (f.time = 1000 + i * 1000));
  const content = { format: "metabear-orderflow-v1", frames };
  const result = parseRecording(JSON.stringify(content));
  assert.equal(result.length, 3);
  assert.equal(result[0].history.length, 1);
  assert.equal(result[2].history.length, 3);
  assert.throws(() => parseRecording("{}"));
  frames[0].bids[0].price = 1e9;
  assert.throws(() => parseRecording(JSON.stringify(content)), /交叉/);
});
test("invalid and zero quantities never mutate the market", () => {
  const m = new Market(),
    before = structuredClone(m.frame());
  for (const size of [0, -1, NaN, Infinity, 101])
    assert.throws(() => m.execute({ side: "buy", size }));
  assert.deepEqual(m.frame(), before);
});
test("every predefined lesson market maintains uncrossed positive depth", () => {
  for (const kind of [
    "matching",
    "iceberg",
    "absorption",
    "slippage",
    "wall",
  ]) {
    const f = lessonMarket(kind).frame();
    assert.ok(f.bids[0].price < f.asks[0].price);
    assert.ok(f.bids.concat(f.asks).every((r) => r.size > 0));
  }
});
