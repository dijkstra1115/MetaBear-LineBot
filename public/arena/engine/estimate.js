import { liquidationPrice } from "./ledger.js";

// The public liquidation map is an estimate, built the way third-party heatmap tools build it: every
// taker trade except published liquidations is assumed to open a share of leveraged positions spread
// over a typical leverage mix; estimates fade slowly, and a level the price trades through counts as
// liquidated. It knows nothing about stops, take-profits or who is closing, so it is often wrong in
// ways open interest and the tape can reveal.
const OPEN_SHARE = 0.3;
const LEVERAGE_MIX = [[10, 0.2], [25, 0.3], [50, 0.35], [100, 0.15]];
const DECAY = 0.0002; // per second, a half-life of about an hour
const BIN = 5000; // $50

export class LiquidationEstimate {
  constructor() {
    this.rows = new Map(); // price bin -> { long, short }
  }

  add(side, liq, lots) {
    const price = Math.round(liq / BIN) * BIN;
    const row = this.rows.get(price) ?? { long: 0, short: 0 };
    row[side > 0 ? "long" : "short"] += lots;
    this.rows.set(price, row);
  }

  // side: +1 for aggressive buying (read as new longs).
  addFlow(side, price, lots) {
    const share = lots * OPEN_SHARE;
    for (const [leverage, weight] of LEVERAGE_MIX) this.add(side, liquidationPrice(side, price, leverage), share * weight);
  }

  decay(seconds = 1) {
    const keep = (1 - DECAY) ** seconds;
    for (const [price, row] of this.rows) {
      row.long *= keep;
      row.short *= keep;
      if (row.long + row.short < 5) this.rows.delete(price);
    }
  }

  clearCrossed(low, high) {
    for (const [price, row] of this.rows) {
      if (row.long && low <= price) row.long = 0;
      if (row.short && high >= price) row.short = 0;
      if (!row.long && !row.short) this.rows.delete(price);
    }
  }

  levels(bin = 10000) {
    const grouped = new Map();
    for (const [key, estimate] of this.rows) {
      const price = Math.round(key / bin) * bin;
      const row = grouped.get(price) ?? { price, long: 0, short: 0 };
      row.long += estimate.long;
      row.short += estimate.short;
      grouped.set(price, row);
    }
    return [...grouped.values()].map((row) => ({ price: row.price, long: Math.round(row.long), short: Math.round(row.short) }))
      .filter((row) => row.long + row.short > 0).sort((a, b) => b.price - a.price);
  }
}
