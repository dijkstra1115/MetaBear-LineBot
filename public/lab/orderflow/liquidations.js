// BTC perpetual liquidation feeds, shared by the lab page and the local collector.
// Every parser returns rows of [time ms, "long" | "short", price, quantity in BTC, exchange],
// where "long" means a long position was force-closed (a forced sell). Bybit and OKX
// report the bankruptcy price, which sits beyond the price the position was taken over at;
// Binance reports the average fill price.

export const LIQ_FEEDS = [
  {
    // Pushes every liquidation, batched every 500 ms.
    ex: "bybit",
    url: "wss://stream.bybit.com/v5/public/linear",
    subscribe: { op: "subscribe", args: ["allLiquidation.BTCUSDT"] },
    ping: JSON.stringify({ op: "ping" }),
    parse: (m) =>
      m.topic === "allLiquidation.BTCUSDT"
        ? m.data.map((d) => [d.T, d.S === "Buy" ? "long" : "short", Number(d.p), Number(d.v), "bybit"])
        : [],
  },
  {
    // Channel covers every swap; one BTC-USDT-SWAP contract is 0.01 BTC.
    ex: "okx",
    url: "wss://ws.okx.com:8443/ws/v5/public",
    subscribe: { op: "subscribe", args: [{ channel: "liquidation-orders", instType: "SWAP" }] },
    ping: "ping",
    parse: (m) =>
      (m.arg?.channel === "liquidation-orders" ? m.data ?? [] : [])
        .filter((d) => d.instId === "BTC-USDT-SWAP")
        .flatMap((d) =>
          d.details.map((x) => [Number(x.ts), x.side === "sell" ? "long" : "short", Number(x.bkPx), Math.round(Number(x.sz) * 1e4) / 1e6, "okx"]),
        ),
  },
  {
    // Only the latest liquidation per second is pushed, so cascades are undercounted.
    ex: "binance",
    url: "wss://fstream.binance.com/market/stream?streams=btcusdt@forceOrder",
    parse: (m) => {
      const o = m.data?.e === "forceOrder" ? m.data.o : null;
      if (!o) return [];
      const qty = Number(o.z) || Number(o.q);
      const price = Number(o.ap) || Number(o.p);
      return [[o.T, o.S === "SELL" ? "long" : "short", price, qty, "binance"]];
    },
  },
];

export const LIQ_EXCHANGES = { bybit: "Bybit", okx: "OKX", binance: "幣安" };
