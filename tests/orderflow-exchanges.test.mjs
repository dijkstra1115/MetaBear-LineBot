import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { BingxBook, gunzipText, parseBingxKlines, parseBingxTrades } from "../public/lab/orderflow/bingx.js";
import { ArchiveDay, parseArchiveLine } from "../public/lab/orderflow/bybit.js";
import { OkxBook, missingRanges, okxArchiveUrl, parseOkxArchiveLine, parseOkxCandles, parseOkxTrades } from "../public/lab/orderflow/okx.js";

const T0 = Date.UTC(2026, 9, 25, 3, 0);

test("OKX trades and archive lines convert contracts of 0.01 BTC and keep the taker side", () => {
  const [a] = parseOkxTrades([{ instId: "BTC-USDT-SWAP", tradeId: "9", px: "80000.5", sz: "150", side: "sell", ts: String(T0) }]);
  assert.deepEqual(a, { id: "9", t: T0, price: 80_000.5, qty: 1.5, sell: true });
  assert.equal(parseOkxTrades([{ instId: "ETH-USDT-SWAP", tradeId: "1", px: "1", sz: "1", side: "buy", ts: "1" }]).length, 0);
  assert.deepEqual(parseOkxArchiveLine(`BTC-USDT-SWAP,3016211394,buy,81651.2,9.87,${T0},0`), { t: T0, price: 81_651.2, qty: 0.0987, sell: false });
  assert.equal(parseOkxArchiveLine("instrument_name,trade_id,side,price,size,created_time,source"), null);
  // Files are named by Beijing-time day.
  assert.equal(okxArchiveUrl("2026-10-24"), "https://static.okx.com/cdn/okex/traderecords/trades/daily/20261024/BTC-USDT-SWAP-trades-2026-10-24.zip");
  assert.deepEqual(parseOkxCandles([[String(T0), "1", "2", "0.5", "1.5", "9"]]), [[T0, 1, 2, 0.5, 1.5]]);
});

test("the OKX book chains updates on seqId and asks for a new snapshot when one is missed", () => {
  const book = new OkxBook();
  const msg = (action, seqId, prevSeqId, bids, asks = []) => ({ arg: { channel: "books" }, action, data: [{ bids, asks, seqId, prevSeqId, ts: String(T0) }] });
  assert.equal(book.applyOkx(msg("update", 2, 1, [["80000", "100", "0", "1"]])), null, "updates before the snapshot are ignored");
  assert.equal(book.applyOkx(msg("snapshot", 10, -1, [["80000", "100", "0", "1"]], [["80001", "50", "0", "1"]])), "snapshot");
  assert.equal(book.bids.get(80_000), 1, "100 contracts = 1 BTC");
  assert.deepEqual(book.applyOkx(msg("update", 11, 10, [["80000", "0", "0", "0"]])), [["bid", 80_000, 1, 0]]);
  assert.equal(book.applyOkx(msg("update", 13, 12, [])), "resync");
  assert.equal(book.ready, false);
});

test("BingX frames are gunzipped, trades read the buyer-maker flag, and each depth push reads as a diff", async () => {
  assert.equal(await gunzipText(gzipSync("Ping")), "Ping");
  assert.deepEqual(parseBingxTrades([{ t: "749", q: "0.5", p: "80000.1", T: T0, m: true }]), [{ id: "749", t: T0, price: 80_000.1, qty: 0.5, sell: true }]);
  assert.deepEqual(parseBingxTrades([{ fillId: "750", qty: "1", price: "80001", time: T0, isBuyerMaker: false }])[0].sell, false);
  assert.deepEqual(parseBingxKlines([{ open: "1", high: "2", low: "0.5", close: "1.5", time: T0 }]), [[T0, 1, 2, 0.5, 1.5]]);
  const book = new BingxBook();
  assert.equal(book.load({ bids: [["80000", "2"]], asks: [["80001", "3"]] }), "snapshot");
  assert.deepEqual(book.load({ bids: [["80000", "1.5"], ["79999", "4"]], asks: [] }), [["bid", 80_000, 2, 1.5], ["bid", 79_999, 0, 4], ["ask", 80_001, 3, 0]]);
  assert.equal(book.best(), null, "no asks left");
});

test("the archive builder takes any exchange's parsed trades and keeps Bybit's lines as before", () => {
  const day = new ArchiveDay();
  day.add(`${T0 / 1000},BTCUSDT,Sell,1.5,80000`);
  day.addTrade({ t: T0 + 1, price: 80_011, qty: 2, sell: false });
  assert.equal(parseArchiveLine("timestamp,symbol,side,size,price"), null);
  const { rows, prints } = day.take();
  assert.deepEqual(rows, [[T0, 80_000, 80_011, 80_000, 80_011, [[8000, 0, 1.5], [8001, 2, 0]]]]);
  assert.deepEqual(prints, [[T0 + 1, "buy", 80_011, 2]]);
});

test("only the minutes a collector lacks are asked for again, as runs", () => {
  const M = 60_000;
  const have = new Set([T0, T0 + M, T0 + 4 * M, T0 + 5 * M]);
  assert.deepEqual(missingRanges(have, T0, T0 + 5 * M), [[T0 + 2 * M, T0 + 3 * M]]);
  assert.deepEqual(missingRanges(have, T0, T0 + M), [], "nothing missing, nothing to ask OKX");
  assert.deepEqual(missingRanges(new Set(), T0, T0 + 2 * M), [[T0, T0 + 2 * M]]);
});
