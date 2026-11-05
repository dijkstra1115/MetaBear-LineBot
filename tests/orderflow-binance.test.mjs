import test from "node:test";
import assert from "node:assert/strict";
import { BINANCE_REST, BINANCE_SPOT_REST, BinanceBook, RELAY_PATHS, parseAggTrade, parseKlines, parseSpotKlines, relayHost } from "../public/lab/orderflow/binance.js";
import { groupPrints } from "../public/lab/orderflow/bybit.js";

const T0 = Date.UTC(2026, 9, 25, 3, 0);
const snap = { lastUpdateId: 100, bids: [["80000.0", "1"], ["79999.9", "2"], ["1000.00", "118"]], asks: [["80000.1", "3"], ["80001.0", "4"]] };
const diff = (U, u, pu, b = [], a = []) => ({ e: "depthUpdate", E: T0, U, u, pu, b, a });

test("aggTrades keep their id and taker side, and one order's fills sum into a print", () => {
  const a = parseAggTrade({ a: 7, T: T0, p: "80000.0", q: "1.5", m: true });
  const b = parseAggTrade({ a: 8, T: T0, p: "80001.0", q: "1", m: true });
  assert.deepEqual(a, { id: "7", a: 7, t: T0, price: 80_000, qty: 1.5, sell: true });
  assert.deepEqual(groupPrints([a, b]), [[T0, "sell", 80_000.4, 2.5]]);
  assert.deepEqual(parseKlines([[T0, "1", "2", "0.5", "1.5", "9"]]), [[T0, 1, 2, 0.5, 1.5]]);
});

test("the book joins buffered diffs to the snapshot and chains later ones on pu", () => {
  const book = new BinanceBook();
  assert.equal(book.diff(diff(90, 95, 89, [["80000.0", "9"]])), null, "buffered before the snapshot");
  assert.equal(book.diff(diff(96, 104, 95, [["80000.0", "5"]])), null);
  assert.equal(book.load(snap), "snapshot");
  assert.equal(book.bids.get(80_000), 5, "the diff straddling lastUpdateId is applied, the older one dropped");
  assert.deepEqual(book.diff(diff(105, 110, 104, [], [["80000.1", "0"]])), [["ask", 80_000.1, 3, 0]]);
  assert.equal(book.best().ask, 80_001);
  assert.equal(book.diff(diff(115, 120, 112)), "resync", "a broken chain resets the book");
  assert.equal(book.ready, false);
});

test("a snapshot older than the first buffered diff asks for another", () => {
  const book = new BinanceBook();
  book.diff(diff(150, 160, 149));
  assert.equal(book.load(snap), "resync");
  assert.equal(book.ready, false);
});

test("the watchers and heatmap only see the window around mid; far orders are not walls", () => {
  const book = new BinanceBook();
  book.load(snap);
  assert.equal(book.allBids.get(1000), undefined, "beyond ±5 % is dropped on recenter");
  assert.deepEqual([...book.bids.keys()].sort(), [79_999.9, 80_000]);
  const changes = book.diff(diff(99, 102, 98, [["70000.0", "50"], ["79990.0", "2"]]));
  assert.deepEqual(changes, [["bid", 79_990, 0, 2]], "a far level changes the full book only");
  assert.equal(book.allBids.get(70_000), 50);
  assert.equal(book.bids.has(70_000), false);
});

test("the relay forwards only public market-data paths", () => {
  assert.ok(RELAY_PATHS.test("/fapi/v1/aggTrades?symbol=BTCUSDT&fromId=1&limit=1000"));
  assert.ok(RELAY_PATHS.test("/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=5m&limit=500"));
  assert.ok(RELAY_PATHS.test("/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=3&startTime=1"));
  assert.ok(RELAY_PATHS.test("/fapi/v1/premiumIndexKlines?symbol=BTCUSDT&interval=5m&limit=500&startTime=1&endTime=2"));
  for (const bad of ["/fapi/v1/order?symbol=BTCUSDT", "/fapi/v2/account?x=1", "/sapi/v1/x?y", "/fapi/v1/klines?a=1#", "/fapi/v1/klines?a=%2F", "https://evil.example/fapi/v1/depth?", "/fapi/v1/../v2/account?", "/api/v3/order?symbol=BTCUSDT", "/api/v3/account?x=1"])
    assert.equal(RELAY_PATHS.test(bad), false, bad);
  assert.equal(relayHost("/api/v3/klines?symbol=BTCUSDT"), BINANCE_SPOT_REST, "spot paths go to the spot API");
  assert.equal(relayHost("/fapi/v1/depth?symbol=BTCUSDT"), BINANCE_REST);
});

test("spot klines become per-minute taker flow, from the API (ms) and the archive (µs) alike", () => {
  // open time, o, h, l, c, volume, close time, quote volume, trades, taker buy base, taker buy quote, ignore
  const api = [T0, "80000", "80010", "79990", "80005", "10.5", T0 + 59_999, "840000.4", "900", "6.25", "500000.2", "0"];
  assert.deepEqual(parseSpotKlines([api]), [[T0, 6.25, 4.25, 500_000, 340_000]]);
  const archive = [String(T0 * 1000), ...api.slice(1).map(String)];
  assert.deepEqual(parseSpotKlines([archive]), [[T0, 6.25, 4.25, 500_000, 340_000]]);
});
