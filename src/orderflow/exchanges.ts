// The collectors per exchange, shared by the Worker (src/orderflow/index.ts) and the 全市場 collector
// that reads all of them (src/orderflow/market-collector.ts).
import { DEFAULT_MARKET } from "../../public/lab/orderflow/markets.js";
import type { OrderflowEnv } from "./collector";

export const EXCHANGES = ["binance", "bybit", "okx", "bingx"] as const;
export type Exchange = (typeof EXCHANGES)[number];

/** The collector of one exchange (or "all") for one market; objects are named by the market's symbol. */
export function stubFor(env: OrderflowEnv, ex: string, m: { symbol: string } = DEFAULT_MARKET) {
  // Asia-Pacific: Bybit blocks US data centers (docs/ORDERFLOW-CF-PROBE.md); Binance's relay is in Tokyo.
  if (ex === "bybit") return env.COLLECTOR.get(env.COLLECTOR.idFromName(m.symbol), { locationHint: "apac-se" });
  const ns = ex === "binance" ? env.BINANCE : ex === "okx" ? env.OKX : ex === "bingx" ? env.BINGX : ex === "all" ? env.MARKET : undefined;
  return ns?.get(ns.idFromName(m.symbol), { locationHint: "apac" }) ?? null;
}
