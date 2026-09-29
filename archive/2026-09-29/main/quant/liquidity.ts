import type { Frame, Level, LiquiditySnapshot, SymbolName } from "./types.js";

/** Compact visual projection; does not alter the trading engine's book or features. */
export function projectLiquidity(
  symbol: SymbolName,
  bids: Level[],
  asks: Level[],
  time: number,
  source: LiquiditySnapshot["source"],
): LiquiditySnapshot | undefined {
  if (!bids.length || !asks.length || bids[0][0] >= asks[0][0]) return;
  const mid = (bids[0][0] + asks[0][0]) / 2,
    step = symbol === "BTCUSDT" ? 5 : 0.2;
  const low = Math.max(bids.at(-1)![0], mid * 0.95),
    high = Math.min(asks.at(-1)![0], mid * 1.05);
  const cells = new Map<number, [number, number, number]>();
  for (const [side, levels] of [
    [1, bids],
    [2, asks],
  ] as const)
    for (const [price, qty] of levels) {
      if (
        !Number.isFinite(price) ||
        !Number.isFinite(qty) ||
        price <= 0 ||
        qty < 0
      )
        throw Error("invalid_liquidity_level");
      if (price < low || price > high || qty === 0) continue;
      const index = Math.floor(price / step + 1e-8),
        row = cells.get(index) ?? [Number((index * step).toFixed(8)), 0, 0];
      row[side] += price * qty;
      cells.set(index, row);
    }
  return {
    time,
    source,
    mid,
    low,
    high,
    bidLevels: bids.length,
    askLevels: asks.length,
    step,
    cells: [...cells.values()]
      .sort((a, b) => a[0] - b[0])
      .map(([p, b, a]) => [
        p,
        Math.round(b * 100) / 100,
        Math.round(a * 100) / 100,
      ]),
  };
}
export function liquidityForFrame(f: Frame): LiquiditySnapshot | undefined {
  if (
    f.liquidity &&
    f.time - f.liquidity.time <= 15000 &&
    f.liquidity.time <= f.time + 2000
  )
    return f.liquidity;
  if (f.time - f.bookTime > 5000 || f.bookTime > f.time + 2000) return;
  return projectLiquidity(
    f.symbol,
    f.bids,
    f.asks,
    f.bookTime,
    f.session.startsWith("synthetic") ? "synthetic" : "recorded-ws",
  );
}
export interface HeatmapOptions {
  start: number;
  end: number;
  interval: number;
  range: number;
  rows?: number;
}
export function buildHeatmap(frames: Frame[], options: HeatmapOptions) {
  const { start, end, interval, range } = options;
  const usable = frames
    .map((frame) => ({ frame, book: liquidityForFrame(frame) }))
    .filter((v) => v.book !== undefined);
  const latest = usable.at(-1)?.book,
    reference = latest?.mid ?? 0;
  const baseStep = latest?.step ?? 5;
  const rawLow = reference * (1 - range),
    rawHigh = reference * (1 + range);
  const binSize = Math.max(
    baseStep,
    Math.ceil((rawHigh - rawLow) / (options.rows ?? 180) / baseStep) * baseStep,
  );
  const low = Number((Math.floor(rawLow / binSize) * binSize).toFixed(8));
  const rowCount = Math.max(1, Math.ceil((rawHigh - low) / binSize));
  const high = Number((low + rowCount * binSize).toFixed(8));
  const count = Math.ceil((end - start) / interval);
  const columns: Array<null | {
    time: number;
    bookTime: number;
    mid: number;
    low: number;
    high: number;
    source: string;
    session: string;
    bidLevels: number;
    askLevels: number;
    cells: [number, number, number][];
  }> = Array.from({ length: count }, () => null);
  for (const { frame, book } of usable) {
    const index = Math.floor((frame.time - start) / interval);
    if (index < 0 || index >= count) continue;
    const cells = new Map<number, [number, number, number]>();
    for (const [price, bid, ask] of book!.cells) {
      const row = Math.floor((price - low) / binSize + 1e-8);
      if (row < 0 || row >= rowCount) continue;
      const c = cells.get(row) ?? [row, 0, 0];
      c[1] += bid;
      c[2] += ask;
      cells.set(row, c);
    }
    // Last observed snapshot in each time bucket. Never sum quantities across time.
    columns[index] = {
      time: frame.time,
      bookTime: book!.time,
      mid: book!.mid,
      low: book!.low,
      high: book!.high,
      source: book!.source,
      session: frame.session,
      bidLevels: book!.bidLevels,
      askLevels: book!.askLevels,
      cells: [...cells.values()].map(([r, b, a]) => [
        r,
        Math.round(b),
        Math.round(a),
      ]),
    };
  }
  const values = columns
    .flatMap((c) => c?.cells.map((v) => v[1] + v[2]) ?? [])
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const colorMax = values.length
    ? values[Math.floor((values.length - 1) * 0.99)]
    : 1;
  return {
    start,
    end,
    interval,
    low,
    high,
    binSize,
    rowCount,
    columns,
    colorMax,
    reference,
    observedColumns: columns.filter(Boolean).length,
    totalColumns: count,
    latest: latest
      ? {
          time: latest.time,
          source: latest.source,
          bidLevels: latest.bidLevels,
          askLevels: latest.askLevels,
          low: latest.low,
          high: latest.high,
          mid: latest.mid,
        }
      : null,
    metric: "visible_resting_notional_usdt",
    aggregation: "last_snapshot_per_time_bucket",
    priceRange: range,
  };
}
