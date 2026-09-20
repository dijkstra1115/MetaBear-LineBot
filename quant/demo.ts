import { QuantStore } from "./store.js";
import { projectLiquidity } from "./liquidity.js";
import {
  SYMBOLS,
  type Frame,
  type Candle,
  type Flow,
  type SymbolName,
} from "./types.js";

/** Fully synthetic fixtures; never imported into the live database. */
export function demoFrame(
  symbol: SymbolName,
  minute: number,
  offset = 10000,
): Frame {
  const start = Date.UTC(2026, 8, 18, 0, 0),
    scale = symbol === "BTCUSDT" ? 1 : 0.04;
  const price = (n: number) => {
    const cycle = Math.floor(n / 40),
      phase = ((n % 40) + 40) % 40;
    const base = 80000 + cycle * 40;
    // Include an adverse reversal after entry, so the demo also demonstrates losses.
    const shock =
      cycle === 1 && phase >= 12 && phase < 16 ? (420 * (16 - phase)) / 4 : 0;
    return (
      (base +
        (phase < 20 ? phase * 42 : (40 - phase) * 42) +
        Math.sin(n * 1.7) * 14 -
        shock) *
      scale
    );
  };
  const time = start + minute * 60000 + offset;
  const candles: Candle[] = [];
  for (let i = minute - 80; i < minute; i++) {
    const open = price(i - 1),
      close = price(i);
    candles.push({
      time: start + i * 60000,
      open,
      high: Math.max(open, close) + 12 * scale,
      low: Math.min(open, close) - 12 * scale,
      close,
      volume: (1 + Math.abs(Math.sin(i))) * 2e6,
    });
  }
  const dir = minute % 40 < 20 ? 1 : -1,
    mid = price(minute) + (offset / 60000) * dir * 35 * scale;
  const flow = (factor: number): Flow[] =>
    Array.from({ length: 40 }, (_, j) => {
      const m = minute - 40 + j,
        d = m % 40 < 20 ? 1 : -1;
      return {
        time: start + m * 60000,
        buy: (1 + d * factor) * 1e6,
        sell: (1 - d * factor) * 1e6,
        trades: 300,
      };
    });
  const bids = Array.from(
    { length: 200 },
    (_, i) =>
      [
        mid - (i + 1) * scale,
        ((dir > 0 ? 3 : 1) + Math.sin(i) ** 2) / scale,
      ] as [number, number],
  );
  const asks = Array.from(
    { length: 200 },
    (_, i) =>
      [
        mid + (i + 1) * scale,
        ((dir < 0 ? 3 : 1) + Math.cos(i) ** 2) / scale,
      ] as [number, number],
  );
  // Synthetic, stationary walls; the trading engine's execution book stays unchanged.
  const deepSide = (side: 1 | -1) =>
    Array.from({ length: 2000 }, (_, i) => {
      const p = mid + side * (i + 1) * scale;
      const distance = Math.abs(p / scale - Math.round(p / scale / 100) * 100);
      const wall =
        Math.exp(-((distance / 2) ** 2)) *
        (8 + 12 * (0.5 + 0.5 * Math.sin(minute / 17 + p / scale / 100)));
      return [p, (0.1 + wall) / scale] as [number, number];
    });
  return {
    id: `demo:${symbol}:${time}`,
    symbol,
    time,
    bookTime: time - 100,
    bids,
    asks,
    mark: mid,
    oi: 10000 + minute * 3,
    fundingRate: 0.0001,
    nextFundingTime: start + 8 * 3600000,
    candles,
    perp: flow(0.28),
    spot: flow(0.14),
    oiChangePct: 0.15,
    coverageStart: start - 3600000,
    session: "synthetic-demo-v1",
    healthy: true,
    issues: [],
    liquidity: projectLiquidity(
      symbol,
      deepSide(-1),
      deepSide(1),
      time - 100,
      "synthetic",
    ),
  };
}
export function createDemo() {
  const store = new QuantStore(":memory:");
  for (let minute = 0; minute < 150; minute++)
    for (const offset of [10000, 20000])
      for (const symbol of SYMBOLS)
        store.process(demoFrame(symbol, minute, offset));
  return store;
}
