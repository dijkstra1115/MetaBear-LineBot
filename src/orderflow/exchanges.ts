// The collectors per exchange, shared by the Worker (src/orderflow/index.ts) and the 全市場 collector
// that reads all of them (src/orderflow/market-collector.ts).
import type { OrderflowEnv } from "./collector";

export const EXCHANGES = ["binance", "bybit", "okx", "bingx"] as const;
export type Exchange = (typeof EXCHANGES)[number];

export function stubFor(env: OrderflowEnv, ex: string) {
  // Asia-Pacific: Bybit blocks US data centers (docs/ORDERFLOW-CF-PROBE.md); Binance's relay is in Tokyo.
  if (ex === "bybit") return env.COLLECTOR.get(env.COLLECTOR.idFromName("BTCUSDT"), { locationHint: "apac-se" });
  const ns = ex === "binance" ? env.BINANCE : ex === "okx" ? env.OKX : ex === "bingx" ? env.BINGX : ex === "all" ? env.MARKET : undefined;
  return ns?.get(ns.idFromName("BTCUSDT"), { locationHint: "apac" }) ?? null;
}
