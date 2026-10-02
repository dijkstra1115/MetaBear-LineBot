// Market regime, read from the tape once per closed candle, and the hidden sentiment that tilts the
// crowds. Players never see either; they are revealed only on request.
export const REGIMES = {
  bull: "強勢多頭",
  bear: "強勢空頭",
  quiet: "低波盤整",
  wild: "高波盤整",
  panic: "恐慌",
  euphoria: "狂熱",
};

const TREND_WINDOW = 45;
const VOL_WINDOW = 30;

export function readRegime(candles, recentLiquidations) {
  const window = candles.slice(-TREND_WINDOW);
  if (window.length < 10) return { key: "quiet", trend: 0, efficiency: 0, volatility: 0 };
  const first = window[0].open;
  const last = window.at(-1).close;
  let path = 0;
  for (const candle of window) path += Math.abs(candle.close - candle.open) + Math.abs(candle.high - candle.low) * 0.25;
  const move = last / first - 1;
  const efficiency = Math.abs(last - first) / Math.max(1, path);
  const returns = candles.slice(-VOL_WINDOW).map((candle) => Math.log(candle.close / candle.open));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const volatility = Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length);
  const short = candles.slice(-10);
  const shortMove = short.at(-1).close / short[0].open - 1;
  let key;
  if (recentLiquidations.long > 60000 && shortMove < -0.006) key = "panic";
  else if (recentLiquidations.short > 60000 && shortMove > 0.006) key = "euphoria";
  else if (efficiency > 0.2 && Math.abs(move) > 0.004) key = move > 0 ? "bull" : "bear";
  else key = volatility > 0.0011 ? "wild" : "quiet";
  return { key, trend: move, efficiency, volatility };
}

// Mean-reverting hidden mood in [-1, 1] with rare jumps. It only tilts which way crowds lean.
export class Sentiment {
  constructor(rng) {
    this.rng = rng;
    this.value = rng.range(-0.4, 0.4);
    this.jumps = [];
  }
  step(time) {
    const theta = 1 / 2400;
    const sigma = 0.012;
    this.value += -theta * this.value + sigma * this.rng.normal();
    if (this.rng.chance(1 / 5400)) {
      const jump = (this.rng.chance(0.5) ? 1 : -1) * this.rng.range(0.35, 0.7);
      this.value += jump;
      this.jumps.push({ time, jump });
      if (this.jumps.length > 20) this.jumps.shift();
    }
    this.value = Math.max(-1, Math.min(1, this.value));
  }
}
