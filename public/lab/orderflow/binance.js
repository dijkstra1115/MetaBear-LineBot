// Binance USDⓈ-M BTCUSDT perpetual feeds for the collector's Binance object, which gets them
// through the Tokyo relay (relay/binance-relay.mjs) because Binance refuses Cloudflare
// (docs/ORDERFLOW-CF-PROBE.md). Rows and trades come out in the same shapes as bybit.js, so the
// collector, the lab and the archive tools treat both exchanges alike.

import { OrderBook } from "./bybit.js";
import { DEFAULT_MARKET } from "./markets.js";

export const BINANCE_SYMBOL = "BTCUSDT";
export const BINANCE_REST = "https://fapi.binance.com";
// Binance serves trades and mark price on /market and depth on /public.
export const binanceStreams = (m = DEFAULT_MARKET) => ({
  market: `wss://fstream.binance.com/market/stream?streams=${m.binance}@aggTrade/${m.binance}@markPrice@1s/${m.binance}@forceOrder`,
  depth: `wss://fstream.binance.com/public/stream?streams=${m.binance}@depth@100ms`,
});
export const BINANCE_STREAMS = binanceStreams();
// The only REST paths the relay forwards: the public market data the collector reads, nothing else.
export const RELAY_PATHS =
  /^\/(fapi\/v1\/(depth|aggTrades|klines|openInterest|fundingRate)|futures\/data\/(openInterestHist|globalLongShortAccountRatio|topLongShortPositionRatio|topLongShortAccountRatio))\?[A-Za-z0-9=&.]*$/;
// Bybit's 1,000 levels reach about ±0.25 % from mid. Binance's diff stream also moves orders far
// away (a 118 BTC bid at $1,000), which would read as walls, so the book the watchers and the
// heatmap see is cut to the same window.
export const BOOK_WINDOW = 0.0025;
const KEEP_FAR = 0.05; // levels beyond ±5 % are dropped from the full book when it recenters

/** aggTrade event or REST aggTrades item → trade; aggregate ids are consecutive, so gaps are exact. */
export function parseAggTrade(d) {
  return { id: String(d.a), a: Number(d.a), t: Number(d.T), price: Number(d.p), qty: Number(d.q), sell: d.m === true };
}

// Binance's daily aggTrades archive: one zipped CSV per UTC day, published early the next day.
export const binanceArchiveUrl = (day, symbol = BINANCE_SYMBOL) => `https://data.binance.vision/data/futures/um/daily/aggTrades/${symbol}/${symbol}-aggTrades-${day}.zip`;

/** Archive line agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker → trade, or null for the header. */
export function parseArchiveLine(line) {
  const c = line.split(",", 7);
  const t = Number(c[5]);
  if (!(t > 0)) return null;
  return { t, price: Number(c[1]), qty: Number(c[2]), sell: c[6].trim().toLowerCase() === "true" };
}

/** /fapi/v1/klines rows → [t, open, high, low, close]. */
export function parseKlines(list) {
  return list.map(([t, o, h, l, c]) => [Number(t), Number(o), Number(h), Number(l), Number(c)]);
}

/**
 * Local order book from a REST snapshot plus the diff stream, synced the way Binance documents:
 * diffs arriving before the snapshot are buffered; the first one applied must straddle the
 * snapshot's lastUpdateId and every later one must chain on `pu`. A broken chain resets the book
 * and asks for a new snapshot ("resync"). `bids` and `asks` hold only the window around mid.
 */
export class BinanceBook extends OrderBook {
  constructor(window = BOOK_WINDOW) {
    super();
    this.window = window;
    this.allBids = new Map();
    this.allAsks = new Map();
    this.lastU = 0;
    this.first = false;
    this.buffer = [];
    this.lo = 0;
    this.hi = 0;
  }

  reset() {
    super.reset();
    this.allBids?.clear();
    this.allAsks?.clear();
    this.lastU = 0;
    this.first = false;
    this.buffer = [];
  }

  /** Depth snapshot { lastUpdateId, bids, asks } → "snapshot", or "resync" when the buffered diffs do not join it. */
  load(snap) {
    const pending = this.buffer;
    this.reset();
    for (const [book, list] of [[this.allBids, snap.bids], [this.allAsks, snap.asks]]) for (const [p, q] of list) if (Number(q) > 0) book.set(Number(p), Number(q));
    this.ready = true;
    this.lastU = Number(snap.lastUpdateId);
    this.first = true;
    this.recenter();
    for (const e of pending) if (this.diff(e) === "resync") return "resync";
    return "snapshot";
  }

  /** depthUpdate event → changed window levels as [side, price, size before, size after], null, or "resync". */
  diff(e) {
    if (!this.ready) {
      this.buffer.push(e);
      if (this.buffer.length > 600) this.buffer.shift(); // a minute of 100 ms diffs
      return null;
    }
    if (e.u < this.lastU) return null;
    const joins = this.first ? e.U <= this.lastU : e.pu === this.lastU;
    if (!joins) {
      this.reset();
      this.buffer.push(e);
      return "resync";
    }
    this.first = false;
    this.lastU = e.u;
    const changes = [];
    for (const [side, all, win, list] of [["bid", this.allBids, this.bids, e.b], ["ask", this.allAsks, this.asks, e.a]])
      for (const [ps, qs] of list) {
        const p = Number(ps);
        const q = Number(qs);
        q === 0 ? all.delete(p) : all.set(p, q);
        if (p < this.lo || p > this.hi) continue;
        const before = win.get(p) ?? 0;
        q === 0 ? win.delete(p) : win.set(p, q);
        changes.push([side, p, before, q]);
      }
    return changes;
  }

  /** Rebuilds the window around the current mid; the collector calls it every 10 s. */
  recenter() {
    let bid = -Infinity;
    let ask = Infinity;
    for (const p of this.allBids.keys()) if (p > bid) bid = p;
    for (const p of this.allAsks.keys()) if (p < ask) ask = p;
    if (!Number.isFinite(bid) || !Number.isFinite(ask)) return;
    const mid = (bid + ask) / 2;
    this.lo = mid * (1 - this.window);
    this.hi = mid * (1 + this.window);
    this.bids.clear();
    this.asks.clear();
    for (const [all, win] of [[this.allBids, this.bids], [this.allAsks, this.asks]])
      for (const [p, q] of all) {
        if (Math.abs(p - mid) > mid * KEEP_FAR) all.delete(p);
        else if (p >= this.lo && p <= this.hi) win.set(p, q);
      }
  }
}
