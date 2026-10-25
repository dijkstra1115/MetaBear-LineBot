// BingX BTC-USDT perpetual feeds for the collector's BingX object (src/orderflow/bingx-collector.ts)
// and the lab. Cloudflare reaches BingX directly. Its WebSocket frames are gzipped; quantities are
// already in BTC, open interest comes as a USDT value.

import { OrderBook } from "./bybit.js";

export const BINGX_SYMBOL = "BTC-USDT";
export const BINGX_WS = "wss://open-api-swap.bingx.com/swap-market";
export const BINGX_REST = "https://open-api.bingx.com";
export const BINGX_TOPICS = [`${BINGX_SYMBOL}@trade`, `${BINGX_SYMBOL}@depth100@500ms`];

/** A gzipped frame → text; the server's keep-alive arrives as "Ping" and wants "Pong". */
export async function gunzipText(data) {
  if (typeof data === "string") return data;
  return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

/** @trade data or REST /quote/trades list → trades; `m` (buyer is maker) means the taker sold. */
export function parseBingxTrades(list) {
  return (list ?? []).map((d) => ({
    id: String(d.t ?? d.fillId),
    t: Number(d.T ?? d.time),
    price: Number(d.p ?? d.price),
    qty: Number(d.q ?? d.qty),
    sell: (d.m ?? d.isBuyerMaker) === true,
  }));
}

/** /v3/quote/klines rows (newest first) → [t, open, high, low, close]. */
export function parseBingxKlines(list) {
  return list.map((k) => [Number(k.time), Number(k.open), Number(k.high), Number(k.low), Number(k.close)]);
}

/** The top 100 levels, replaced whole every 500 ms; each load reports what changed, like a diff. */
export class BingxBook extends OrderBook {
  /** depth data { bids, asks } → "snapshot" the first time, then the changed levels [side, price, before, after]. */
  load(d) {
    const first = !this.ready;
    const changes = [];
    for (const [side, book, list] of [["bid", this.bids, d.bids], ["ask", this.asks, d.asks]]) {
      const next = new Map(list.map(([p, q]) => [Number(p), Number(q)]));
      for (const [p, q] of next) if (book.get(p) !== q) changes.push([side, p, book.get(p) ?? 0, q]);
      for (const [p, q] of book) if (!next.has(p)) changes.push([side, p, q, 0]);
      book.clear();
      for (const [p, q] of next) if (q > 0) book.set(p, q);
    }
    this.ready = true;
    return first ? "snapshot" : changes;
  }
}
