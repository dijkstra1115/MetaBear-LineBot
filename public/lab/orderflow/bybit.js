// Bybit BTCUSDT perpetual feeds, shared by the lab page, the Cloudflare collector
// (src/orderflow/collector.ts) and the archive importer. Binance refuses connections from
// Cloudflare (docs/ORDERFLOW-CF-PROBE.md), so the platform's history and live data come from Bybit.
//
// Footprint bar row, the same shape the lab has always drawn:
//   [minute ms, open, high, low, close, [[price bin, taker buy BTC, taker sell BTC], …]]
// Heatmap column: [minute ms, mid, low bin, [resting BTC per bin from the low bin up]]

export const SYMBOL = "BTCUSDT";
export const TICK = 10; // footprint and heatmap price bin, USD
export const HEAT_RANGE = 0.02; // heatmap rows ±2 % around mid
export const WS_URL = "wss://stream.bybit.com/v5/public/linear";
export const REST_URL = "https://api.bybit.com";
// 1,000 levels a side (pushed every 200 ms) reach only about ±0.25 % from mid on BTC, so
// heatmap rows further out stay empty.
export const BOOK_TOPIC = `orderbook.1000.${SYMBOL}`;
export const TRADE_TOPIC = `publicTrade.${SYMBOL}`;
export const TICKER_TOPIC = `tickers.${SYMBOL}`;
export const PING = JSON.stringify({ op: "ping" });

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

/** publicTrade message → [{ id, t, price, qty, sell }], where sell means the taker sold. */
export function parseTrades(m) {
  if (m.topic !== TRADE_TOPIC) return [];
  return m.data.map((d) => ({ id: d.i, t: d.T, price: Number(d.p), qty: Number(d.v), sell: d.S === "Sell" }));
}

/** /v5/market/recent-trade list → the same trade objects. */
export function parseRestTrades(list) {
  return list.map((d) => ({ id: d.execId, t: Number(d.time), price: Number(d.price), qty: Number(d.size), sell: d.side === "Sell" }));
}

/** Adds one trade to minute bars: Map(minute → { o, h, l, c, levels: Map(bin → [buy, sell]) }). */
export function addTrade(bars, { t, price, qty, sell }, tick = TICK) {
  const minute = Math.floor(t / 60_000) * 60_000;
  let bar = bars.get(minute);
  if (!bar) bars.set(minute, (bar = { o: price, h: price, l: price, c: price, levels: new Map(), first: t, last: t }));
  if (price > bar.h) bar.h = price;
  if (price < bar.l) bar.l = price;
  // Trades can arrive late (a REST backfill after a reconnect), so open and close follow time.
  if (t < bar.first) (bar.first = t), (bar.o = price);
  if (t >= bar.last) (bar.last = t), (bar.c = price);
  const bin = Math.floor(price / tick);
  let lv = bar.levels.get(bin);
  if (!lv) bar.levels.set(bin, (lv = [0, 0]));
  lv[sell ? 1 : 0] += qty;
  return minute;
}

/** Bar → row, levels ascending by bin. */
export function barRow(t, bar) {
  const levels = [...bar.levels.entries()].sort((x, y) => x[0] - y[0]).map(([bin, [buy, sell]]) => [bin, round(buy, 3), round(sell, 3)]);
  return [t, bar.o, bar.h, bar.l, bar.c, levels];
}

/** Total taker buy and sell over rows. */
export function takerTotals(rows) {
  let buy = 0;
  let sell = 0;
  for (const r of rows) for (const [, b, s] of r[5]) (buy += b), (sell += s);
  return [buy, sell];
}

/** Local order book from the orderbook.1000 snapshot + delta stream. */
export class OrderBook {
  constructor() {
    this.bids = new Map();
    this.asks = new Map();
    this.ready = false;
  }

  reset() {
    this.bids.clear();
    this.asks.clear();
    this.ready = false;
  }

  apply(m) {
    if (m.topic !== BOOK_TOPIC) return;
    const d = m.data;
    // A snapshot, or u = 1 after a Bybit service restart, replaces the whole book.
    if (m.type === "snapshot" || d.u === 1) {
      this.bids.clear();
      this.asks.clear();
      this.ready = true;
    } else if (!this.ready) return;
    for (const [p, q] of d.b) Number(q) === 0 ? this.bids.delete(Number(p)) : this.bids.set(Number(p), Number(q));
    for (const [p, q] of d.a) Number(q) === 0 ? this.asks.delete(Number(p)) : this.asks.set(Number(p), Number(q));
  }

  /** [mid, low bin, sizes] binned at `tick` over ±range, or null before the first snapshot. */
  column(tick = TICK, range = HEAT_RANGE) {
    if (!this.ready || !this.bids.size || !this.asks.size) return null;
    let bid = -Infinity;
    let ask = Infinity;
    for (const p of this.bids.keys()) if (p > bid) bid = p;
    for (const p of this.asks.keys()) if (p < ask) ask = p;
    const mid = (bid + ask) / 2;
    const lowBin = Math.floor((mid * (1 - range)) / tick);
    const sizes = new Array(Math.floor((mid * (1 + range)) / tick) - lowBin + 1).fill(0);
    for (const side of [this.bids, this.asks])
      for (const [p, q] of side) {
        const i = Math.floor(p / tick) - lowBin;
        if (i >= 0 && i < sizes.length) sizes[i] += q;
      }
    return [round(mid, 1), lowBin, sizes.map((q) => round(q, 2))];
  }
}

/** Merges a tickers snapshot or delta into state; returns the fields as { oi (BTC), oiValue (USDT), funding, mark }. */
export function applyTicker(state, m) {
  if (m.topic !== TICKER_TOPIC) return state;
  const d = m.data;
  if (d.openInterest != null) state.oi = Number(d.openInterest);
  if (d.openInterestValue != null) state.oiValue = Number(d.openInterestValue);
  if (d.fundingRate != null) state.funding = Number(d.fundingRate);
  if (d.markPrice != null) state.mark = Number(d.markPrice);
  return state;
}
