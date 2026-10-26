// The markets the order-flow platform covers (docs/ORDERFLOW-ETH.md): each exchange's name for the
// pair, the price bins and how sizes compare with BTC. The lab, the collectors and the relay read
// these instead of hard-coding BTC.
//
// tick: footprint and heatmap bin, about 0.0125 % of BTC's price and 0.02 % of ETH's.
// bookTick: fine order-book bin. scale: sizes in this coin for the same weight as one BTC threshold
// (ETH is about 1/35 of BTC's price and trades about half its dollar volume, so 30×).

/**
 * @typedef {{ id: string, base: string, symbol: string, path: string, tick: number, bookTick: number, scale: number, binance: string, okxInst: string, okxCt: number, bingx: string }} Market
 * @type {Record<string, Market>}
 */
export const MARKETS = {
  btc: {
    id: "btc",
    base: "BTC",
    symbol: "BTCUSDT",
    path: "btcusdt",
    tick: 10,
    bookTick: 1,
    scale: 1,
    binance: "btcusdt",
    okxInst: "BTC-USDT-SWAP",
    okxCt: 0.01, // coin per contract
    bingx: "BTC-USDT",
  },
  eth: {
    id: "eth",
    base: "ETH",
    symbol: "ETHUSDT",
    path: "ethusdt",
    tick: 0.5,
    bookTick: 0.05,
    scale: 30,
    binance: "ethusdt",
    okxInst: "ETH-USDT-SWAP",
    okxCt: 0.1,
    bingx: "ETH-USDT",
  },
};
export const MARKET_IDS = Object.keys(MARKETS);
export const DEFAULT_MARKET = MARKETS.btc;

/** The market for an id ("btc", "eth"); anything else is BTC, which every older link and object means. */
export const marketOf = (id) => MARKETS[id] ?? DEFAULT_MARKET;
/** The market an API path segment names ("ethusdt"), or null. */
export const marketByPath = (path) => Object.values(MARKETS).find((m) => m.path === path) ?? null;
/** A size threshold written in BTC, in this market's coin. */
export const sized = (m, btc) => btc * m.scale;
