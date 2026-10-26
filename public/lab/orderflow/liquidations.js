// BTC perpetual liquidation feeds, shared by the lab page and the local collector.
// Every parser returns rows of [time ms, "long" | "short", price, quantity in BTC, exchange],
// where "long" means a long position was force-closed (a forced sell). Bybit and OKX
// report the bankruptcy price, which sits beyond the price the position was taken over at;
// Binance reports the average fill price.

/** The liquidation feeds for one market (markets.js); quantities in its coin. */
export function liqFeeds(m = DEFAULT_MARKET) {
  return [
    {
      // Pushes every liquidation, batched every 500 ms.
      ex: "bybit",
      url: "wss://stream.bybit.com/v5/public/linear",
      subscribe: { op: "subscribe", args: [`allLiquidation.${m.symbol}`] },
      ping: JSON.stringify({ op: "ping" }),
      parse: (msg) =>
        msg.topic === `allLiquidation.${m.symbol}`
          ? msg.data.map((d) => [d.T, d.S === "Buy" ? "long" : "short", Number(d.p), Number(d.v), "bybit"])
          : [],
    },
    {
      // Channel covers every swap; sizes are contracts (0.01 BTC, 0.1 ETH).
      ex: "okx",
      url: "wss://ws.okx.com:8443/ws/v5/public",
      subscribe: { op: "subscribe", args: [{ channel: "liquidation-orders", instType: "SWAP" }] },
      ping: "ping",
      parse: (msg) =>
        (msg.arg?.channel === "liquidation-orders" ? msg.data ?? [] : [])
          .filter((d) => d.instId === m.okxInst)
          .flatMap((d) =>
            d.details.map((x) => [Number(x.ts), x.side === "sell" ? "long" : "short", Number(x.bkPx), Math.round(Number(x.sz) * m.okxCt * 1e6) / 1e6, "okx"]),
          ),
    },
    {
      // Only the latest liquidation per second is pushed, so cascades are undercounted.
      ex: "binance",
      url: `wss://fstream.binance.com/market/stream?streams=${m.binance}@forceOrder`,
      parse: (msg) => {
        const o = msg.data?.e === "forceOrder" ? msg.data.o : null;
        if (!o) return [];
        const qty = Number(o.z) || Number(o.q);
        const price = Number(o.ap) || Number(o.p);
        return [[o.T, o.S === "SELL" ? "long" : "short", price, qty, "binance"]];
      },
    },
  ];
}
export const LIQ_FEEDS = liqFeeds();

import { DEFAULT_MARKET } from "./markets.js";

export const LIQ_EXCHANGES = { bybit: "Bybit", okx: "OKX", binance: "Binance" };
