// Chart readings the strategy crowds trade on, updated once per closed 1-minute candle. They are the
// same public readings a player can take from the chart: averages, MACD, VWAP, bands, swing points,
// liquidity sweeps and fair-value gaps.
const EMA_LENGTHS = [8, 12, 20, 21, 26, 50];
export const MACD_SETS = [
  { key: "fast", fast: 8, slow: 21, signal: 5 },
  { key: "classic", fast: 12, slow: 26, signal: 9 },
];
const PIVOT = 3;
const SWING_MEMORY = 240;

export class Indicators {
  constructor() {
    this.ema = {};
    this.macd = Object.fromEntries(MACD_SETS.map((set) => [set.key, { macd: 0, signal: null, hist: 0, cross: 0, crossAt: -Infinity }]));
    this.swings = []; // { kind: "high" | "low", price, index, swept, broken }
    this.sweeps = []; // { dir, level, extreme, index }
    this.gaps = []; // { dir, low, high, index, filled }
    this.vwap = null;
    this.vwapStd = 0;
    this.bb = null;
    this.atr = null;
    this.high4h = null;
    this.low4h = null;
    this.count = 0;
  }

  update(candles) {
    const index = candles.length - 1;
    const candle = candles[index];
    const close = candle.close;
    this.count++;
    for (const length of EMA_LENGTHS) {
      const prev = this.ema[length];
      this.ema[length] = prev == null ? close : prev + (close - prev) * 2 / (length + 1);
    }
    for (const set of MACD_SETS) {
      const state = this.macd[set.key];
      const macd = this.ema[set.fast] - this.ema[set.slow];
      state.signal = state.signal == null ? macd : state.signal + (macd - state.signal) * 2 / (set.signal + 1);
      const hist = macd - state.signal;
      state.cross = this.count > set.slow && Math.sign(hist) !== Math.sign(state.hist) && Math.abs(hist) > close * 0.00002 ? Math.sign(hist) : 0;
      if (state.cross) state.crossAt = index;
      state.macd = macd;
      state.hist = hist;
    }
    const window = candles.slice(-240);
    let pv = 0;
    let volume = 0;
    for (const item of window) {
      const typical = (item.high + item.low + item.close) / 3;
      const weight = Math.max(1, item.volume);
      pv += typical * weight;
      volume += weight;
    }
    this.vwap = pv / volume;
    let variance = 0;
    for (const item of window) variance += Math.max(1, item.volume) * ((item.high + item.low + item.close) / 3 - this.vwap) ** 2;
    this.vwapStd = Math.sqrt(variance / volume);
    const last20 = candles.slice(-20).map((item) => item.close);
    const mean = last20.reduce((sum, value) => sum + value, 0) / last20.length;
    const std = Math.sqrt(last20.reduce((sum, value) => sum + (value - mean) ** 2, 0) / last20.length);
    this.bb = { mid: mean, std };
    const prevClose = candles[index - 1]?.close ?? candle.open;
    const range = Math.max(candle.high - candle.low, Math.abs(candle.high - prevClose), Math.abs(candle.low - prevClose));
    this.atr = this.atr == null ? range : this.atr + (range - this.atr) / 14;
    this.high4h = Math.max(...window.map((item) => item.high));
    this.low4h = Math.min(...window.map((item) => item.low));
    this.updateSwings(candles, index);
    this.updateGaps(candles, index);
  }

  updateSwings(candles, index) {
    const candle = candles[index];
    // Sweeps and breaks of earlier swing points by the candle that just closed.
    this.sweeps = this.sweeps.filter((sweep) => index - sweep.index <= 5);
    for (const swing of this.swings) {
      if (swing.broken) continue;
      if (swing.kind === "high" && candle.high > swing.price) {
        if (candle.close < swing.price && !swing.swept) {
          swing.swept = true;
          this.sweeps.push({ dir: -1, level: swing.price, extreme: candle.high, index });
        } else if (candle.close > swing.price) swing.broken = true;
      } else if (swing.kind === "low" && candle.low < swing.price) {
        if (candle.close > swing.price && !swing.swept) {
          swing.swept = true;
          this.sweeps.push({ dir: 1, level: swing.price, extreme: candle.low, index });
        } else if (candle.close < swing.price) swing.broken = true;
      }
    }
    // A pivot confirms PIVOT candles after it.
    const pivot = index - PIVOT;
    if (pivot >= PIVOT) {
      const around = candles.slice(pivot - PIVOT, pivot + PIVOT + 1);
      const center = candles[pivot];
      if (around.every((item) => item.high <= center.high)) this.swings.push({ kind: "high", price: center.high, index: pivot, swept: false, broken: false });
      if (around.every((item) => item.low >= center.low)) this.swings.push({ kind: "low", price: center.low, index: pivot, swept: false, broken: false });
    }
    this.swings = this.swings.filter((swing) => index - swing.index <= SWING_MEMORY);
  }

  updateGaps(candles, index) {
    if (index >= 2) {
      const first = candles[index - 2];
      const third = candles[index];
      if (first.high < third.low) this.gaps.push({ dir: 1, low: first.high, high: third.low, index, filled: false });
      if (first.low > third.high) this.gaps.push({ dir: -1, low: third.high, high: first.low, index, filled: false });
    }
    const candle = candles[index];
    for (const gap of this.gaps) {
      if (gap.filled || gap.index === index) continue;
      if (gap.dir > 0 ? candle.low <= gap.low : candle.high >= gap.high) gap.filled = true;
    }
    this.gaps = this.gaps.filter((gap) => !gap.filled && index - gap.index <= 90);
  }

  // Live swing points that still stand, nearest first, within a lookback of candles.
  levels(kind, price, index, lookback = 120) {
    return this.swings
      .filter((swing) => swing.kind === kind && !swing.broken && index - swing.index <= lookback && (kind === "high" ? swing.price > price : swing.price < price))
      .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
  }
}
