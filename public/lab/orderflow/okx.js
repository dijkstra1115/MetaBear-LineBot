// OKX BTC-USDT-SWAP feeds for the collector's OKX object (src/orderflow/okx-collector.ts) and the
// lab. Cloudflare reaches OKX directly. Sizes come in contracts of 0.01 BTC and are converted, so
// trades, prints and book rows are in BTC like bybit.js.

import { OrderBook } from "./bybit.js";

export const OKX_INST = "BTC-USDT-SWAP";
export const OKX_CT = 0.01; // BTC per contract
export const OKX_WS = "wss://ws.okx.com:8443/ws/v5/public";
export const OKX_REST = "https://www.okx.com";
export const OKX_CHANNELS = ["trades", "books", "open-interest", "funding-rate"];

const btc = (contracts) => Math.round(Number(contracts) * OKX_CT * 1e6) / 1e6;

/** trades message or REST /market/trades list → trades; side is the taker's. */
export function parseOkxTrades(list) {
  return (list ?? []).filter((d) => d.instId === OKX_INST).map((d) => ({ id: String(d.tradeId), t: Number(d.ts), price: Number(d.px), qty: btc(d.sz), sell: d.side === "sell" }));
}

// OKX's daily trade archive (one zipped CSV per day, named by its Beijing-time date).
export const okxArchiveUrl = (day) => `https://static.okx.com/cdn/okex/traderecords/trades/daily/${day.replaceAll("-", "")}/${OKX_INST}-trades-${day}.zip`;

/** Archive line instrument_name,trade_id,side,price,size,created_time → trade, or null for the header. */
export function parseOkxArchiveLine(line) {
  const c = line.split(",", 6);
  const t = Number(c[5]);
  if (c[0] !== OKX_INST || !(t > 0)) return null;
  return { t, price: Number(c[3]), qty: btc(c[4]), sell: c[2].toLowerCase() === "sell" };
}

/** history-candles rows (newest first) → [t, open, high, low, close]. */
export function parseOkxCandles(list) {
  return list.map(([t, o, h, l, c]) => [Number(t), Number(o), Number(h), Number(l), Number(c)]);
}

/**
 * The 400-level book from the `books` channel: a snapshot, then updates chained by seqId. A broken
 * chain resets the book and returns "resync"; the collector resubscribes for a new snapshot.
 */
export class OkxBook extends OrderBook {
  constructor() {
    super();
    this.seq = null;
  }

  reset() {
    super.reset();
    this.seq = null;
  }

  /** books message → "snapshot", changed levels [side, price, before, after], null or "resync". */
  applyOkx(m) {
    if (m.arg?.channel !== "books" || !m.data?.[0]) return null;
    const d = m.data[0];
    const snapshot = m.action === "snapshot";
    if (snapshot) {
      this.bids.clear();
      this.asks.clear();
      this.ready = true;
    } else if (!this.ready) return null;
    else if (d.prevSeqId !== this.seq) {
      this.reset();
      return "resync";
    }
    this.seq = d.seqId;
    const changes = [];
    for (const [side, book, list] of [["bid", this.bids, d.bids], ["ask", this.asks, d.asks]])
      for (const [ps, qs] of list) {
        const p = Number(ps);
        const q = btc(qs);
        const before = book.get(p) ?? 0;
        q === 0 ? book.delete(p) : book.set(p, q);
        if (!snapshot) changes.push([side, p, before, q]);
      }
    return snapshot ? "snapshot" : changes;
  }
}
