import { MACD_SETS } from "./indicators.js";
import { roundPrice } from "./book.js";

// Strategy crowds. Each pool decides at a Poisson rate scaled by the regime and the hidden mood;
// every decision draws its own parameters, so stops and targets spread around the chart levels
// instead of sitting on exact prices. A decision opens one cohort through sim.openCohort.
//
// Regime weight order: bull, bear, quiet, wild, panic, euphoria.
const W = (bull, bear, quiet, wild, panic, euphoria) => ({ bull, bear, quiet, wild, panic, euphoria });
const MIN = 60;
const ROUND_STEP = 50000; // $500

// Crowd sizes are scaled together so total open interest sits near a mid-size venue.
export const CROWD_SCALE = 3;
const btcLots = (rng, median, spread = 0.9) => Math.max(1, Math.round(rng.lognormal(median * CROWD_SCALE, spread) * 100));

// Round numbers and still-standing swing points on one side of the price.
function chartLevels(sim, kind, within, lookback = 120) {
  const last = sim.last;
  const index = sim.candles.length - 1;
  const out = sim.ind.levels(kind, last, index, lookback).map((swing) => swing.price);
  const step = ROUND_STEP;
  if (kind === "low") {
    for (let price = Math.floor(last / step) * step; price > last * (1 - within); price -= step) if (price < last) out.push(price);
  } else {
    for (let price = Math.ceil(last / step) * step; price < last * (1 + within); price += step) if (price > last) out.push(price);
  }
  return out.filter((price) => Math.abs(price / last - 1) <= within).sort((a, b) => Math.abs(a - last) - Math.abs(b - last));
}

// Nearer levels draw more orders.
function pickLevel(rng, levels) {
  if (!levels.length) return null;
  const index = Math.min(levels.length - 1, Math.floor(-Math.log(1 - rng.next() * 0.95) * 1.2));
  return levels[index];
}

const leaning = (sim, base = 0.5, mood = 0.12) => sim.rng.next() < base + sim.sentiment.value * mood ? 1 : -1;

export const POOLS = [
  {
    key: "breakout",
    name: "突破動能",
    rate: 7,
    weights: W(1.8, 1.8, 0.6, 1.0, 1.3, 1.5),
    leverage: [[20, 0.35], [25, 0.25], [50, 0.3], [75, 0.1]],
    // Buy-stops above swing highs and sell-stops below swing lows: liquidity resting above and below the range.
    decide(sim) {
      const { rng } = sim;
      const dir = leaning(sim, 0.5, 0.1);
      const levels = chartLevels(sim, dir > 0 ? "high" : "low", 0.02, rng.int(15, 60));
      const level = pickLevel(rng, levels.filter((price) => dir > 0 ? price > sim.last * 1.0003 : price < sim.last * 0.9997));
      if (level == null) return;
      const trigger = roundPrice(level * (1 + dir * rng.range(0.0001, 0.0009)));
      const stop = roundPrice(level * (1 - dir * rng.lognormal(0.0035, 0.5)));
      const trail = rng.range(0.003, 0.008);
      const target = rng.chance(0.5) ? roundPrice(trigger * (1 + dir * rng.range(0.004, 0.012))) : null;
      sim.openCohort({
        pool: "breakout", side: dir, lots: btcLots(rng, 1.1), leverage: sim.leverageFor(this),
        entry: { type: "trigger", price: trigger, expireAt: sim.time + rng.int(10, 40) * MIN },
        stop, trail, take: target, takeMode: rng.chance(0.4) ? "limit" : "trigger",
        hold: rng.int(60, 240) * MIN, signal: "reversal3",
      });
    },
  },
  {
    key: "sr",
    name: "支撐壓力",
    rate: 7,
    weights: W(0.8, 0.8, 1.5, 1.2, 0.6, 0.6),
    leverage: [[10, 0.35], [20, 0.4], [25, 0.25]],
    // Resting limit orders just in front of support and resistance, stops just beyond them.
    decide(sim) {
      const { rng } = sim;
      const trendLean = sim.regime.key === "bull" ? 0.12 : sim.regime.key === "bear" ? -0.12 : 0;
      const dir = leaning(sim, 0.5 + trendLean, 0.1);
      const level = pickLevel(rng, chartLevels(sim, dir > 0 ? "low" : "high", 0.015));
      if (level == null) return;
      const price = roundPrice(level * (1 + dir * rng.range(0, 0.0006)));
      if (dir > 0 ? price >= sim.last : price <= sim.last) return;
      const stop = roundPrice(level * (1 - dir * rng.lognormal(0.004, 0.5)));
      const opposite = chartLevels(sim, dir > 0 ? "high" : "low", 0.03)[0];
      const take = roundPrice(opposite != null ? opposite * (1 - dir * rng.range(0, 0.0008)) : price * (1 + dir * rng.range(0.005, 0.012)));
      sim.openCohort({
        pool: "sr", side: dir, lots: btcLots(rng, 1.4), leverage: sim.leverageFor(this),
        entry: { type: "limit", price, expireAt: sim.time + rng.int(15, 60) * MIN },
        stop, take, takeMode: rng.chance(0.6) ? "limit" : "trigger",
        hold: rng.int(90, 480) * MIN, breakeven: rng.chance(0.5),
      });
    },
  },
  {
    key: "ict",
    name: "ICT／SMC",
    rate: 6,
    weights: W(1.0, 1.0, 1.1, 1.4, 1.2, 1.0),
    leverage: [[10, 0.25], [20, 0.3], [25, 0.2], [50, 0.25]],
    // Fade a sweep of a swing point back into the range, or buy a fair-value gap with the trend.
    decide(sim) {
      const { rng, ind } = sim;
      const index = sim.candles.length - 1;
      const sweep = ind.sweeps.filter((item) => index - item.index <= 4).at(-1);
      if (sweep) {
        const dir = sweep.dir;
        const market = rng.chance(0.4);
        const price = market ? null : roundPrice(sim.last - (sim.last - sweep.extreme) * rng.range(0.3, 0.6));
        const stop = roundPrice(sweep.extreme * (1 - dir * rng.range(0.0005, 0.0015)));
        const liquidity = chartLevels(sim, dir > 0 ? "high" : "low", 0.03)[0];
        const entry = price ?? sim.last;
        const take = roundPrice(liquidity ?? entry * (1 + dir * rng.range(0.006, 0.015)));
        if (dir > 0 ? stop >= entry : stop <= entry) return;
        sim.openCohort({
          pool: "ict", side: dir, lots: btcLots(rng, 1), leverage: sim.leverageFor(this),
          entry: market ? { type: "market" } : { type: "limit", price, expireAt: sim.time + rng.int(5, 20) * MIN },
          stop, take, takeMode: rng.chance(0.5) ? "limit" : "trigger", hold: rng.int(60, 300) * MIN,
        });
        return;
      }
      const trend = Math.sign((ind.ema[20] ?? 0) - (ind.ema[50] ?? 0));
      const gap = ind.gaps.filter((item) => item.dir === trend && (trend > 0 ? item.high < sim.last : item.low > sim.last)).at(-1);
      if (!gap || !rng.chance(0.35)) return;
      const price = roundPrice((gap.low + gap.high) / 2);
      const stop = roundPrice((trend > 0 ? gap.low : gap.high) * (1 - trend * rng.range(0.001, 0.003)));
      const take = roundPrice(price + (price - stop) * rng.range(1.5, 2.5));
      sim.openCohort({
        pool: "ict", side: trend, lots: btcLots(rng, 0.9), leverage: sim.leverageFor(this),
        entry: { type: "limit", price, expireAt: sim.time + rng.int(10, 30) * MIN },
        stop, take, takeMode: rng.chance(0.5) ? "limit" : "trigger", hold: rng.int(60, 300) * MIN,
      });
    },
  },
  {
    key: "trend",
    name: "均線／MACD",
    rate: 14,
    weights: W(1.4, 1.4, 0.6, 0.8, 1.0, 1.2),
    leverage: [[5, 0.3], [10, 0.4], [20, 0.3]],
    // Market entries right after a MACD cross; out on the opposite cross.
    decide(sim) {
      const { rng, ind } = sim;
      const index = sim.candles.length - 1;
      const fresh = MACD_SETS.filter((set) => index - ind.macd[set.key].crossAt <= 1);
      if (!fresh.length) return;
      const set = fresh[rng.int(0, fresh.length - 1)];
      const dir = Math.sign(ind.macd[set.key].hist);
      if (!dir) return;
      const stop = roundPrice(sim.last * (1 - dir * rng.range(0.005, 0.012)));
      const take = rng.chance(0.4) ? roundPrice(sim.last * (1 + dir * rng.range(0.012, 0.03))) : null;
      sim.openCohort({
        pool: "trend", side: dir, lots: btcLots(rng, 1.3), leverage: sim.leverageFor(this),
        entry: { type: "market" }, stop, take, takeMode: "trigger",
        hold: rng.int(60, 480) * MIN, signal: `macd:${set.key}`,
      });
    },
  },
  {
    key: "meanrev",
    name: "均值回歸",
    rate: 7,
    weights: W(0.4, 0.4, 1.6, 1.3, 0.7, 0.5),
    leverage: [[5, 0.3], [10, 0.4], [20, 0.3]],
    // Fade a stretch outside the Bollinger band or far from VWAP; target the middle.
    decide(sim) {
      const { rng, ind } = sim;
      if (!ind.bb?.std) return;
      const z = (sim.last - ind.bb.mid) / ind.bb.std;
      const vwapGap = sim.last / ind.vwap - 1;
      let dir = 0;
      let target = null;
      if (Math.abs(z) > rng.range(2, 2.5)) {
        dir = -Math.sign(z);
        target = ind.bb.mid;
      } else if (Math.abs(vwapGap) > rng.range(0.007, 0.012)) {
        dir = -Math.sign(vwapGap);
        target = ind.vwap;
      }
      if (!dir) return;
      const price = roundPrice(sim.last * (1 - dir * rng.range(0.0003, 0.002)));
      const stop = roundPrice(price * (1 - dir * rng.range(0.004, 0.01)));
      sim.openCohort({
        pool: "meanrev", side: dir, lots: btcLots(rng, 1.1), leverage: sim.leverageFor(this),
        entry: { type: "limit", price, expireAt: sim.time + rng.int(10, 30) * MIN },
        stop, take: roundPrice(target), takeMode: "limit", hold: rng.int(60, 240) * MIN,
      });
    },
  },
  {
    key: "emotion",
    name: "情緒追價",
    rate: 10,
    weights: W(1.2, 1.4, 0.4, 1.0, 2.2, 2.2),
    leverage: [[50, 0.4], [75, 0.3], [100, 0.3]],
    // Chase a fast move or a liquidation burst at market with high leverage; panic out on drawdown.
    decide(sim) {
      const { rng } = sim;
      const move = sim.moveOver(3 * MIN);
      const burst = sim.recentLiquidations(30);
      let dir = 0;
      let strength = 0;
      if (Math.abs(move) > 0.004) {
        dir = Math.sign(move);
        strength = Math.abs(move) / 0.004;
      } else if (burst.long + burst.short > 3000) {
        dir = burst.short > burst.long ? 1 : -1;
        strength = 1;
      }
      if (!dir || !rng.chance(Math.min(1, 0.4 * strength))) return;
      sim.openCohort({
        pool: "emotion", side: dir, lots: btcLots(rng, 0.7, 1), leverage: sim.leverageFor(this),
        entry: { type: "market" },
        stop: rng.chance(0.2) ? roundPrice(sim.last * (1 - dir * rng.range(0.006, 0.012))) : null,
        take: roundPrice(sim.last * (1 + dir * rng.range(0.003, 0.006))), takeMode: "trigger",
        hold: rng.int(30, 180) * MIN, panic: rng.range(0.3, 0.6),
      });
    },
  },
  {
    key: "noise",
    name: "雜訊散戶",
    rate: 150,
    weights: W(1, 1, 0.8, 1.2, 1.4, 1.4),
    leverage: [[2, 0.2], [5, 0.2], [10, 0.25], [20, 0.2], [50, 0.15]],
    // Everyday flow near the touch. Some decisions open, the rest close an earlier noise position.
    decide(sim) {
      const { rng } = sim;
      const open = sim.poolCount("noise");
      if (open > 40 && (rng.chance(0.42) || open > 1400)) {
        sim.closeRandom("noise", rng.chance(0.5) ? "market" : "limit");
        return;
      }
      const dir = leaning(sim, 0.5, 0.08);
      const aggressive = rng.chance(0.38);
      const touch = sim.touch(dir > 0 ? "buy" : "sell");
      const price = aggressive ? null : roundPrice(touch * (1 - dir * rng.lognormal(0.00025, 0.9)));
      sim.openCohort({
        pool: "noise", side: dir, lots: btcLots(rng, 0.25, 1.1), leverage: sim.leverageFor(this),
        entry: aggressive ? { type: "market" } : { type: "limit", price, expireAt: sim.time + rng.int(30, 120) },
        stop: rng.chance(0.2) ? roundPrice(sim.last * (1 - dir * rng.range(0.005, 0.015))) : null,
        hold: rng.int(2, 30) * MIN,
      });
    },
  },
  {
    key: "value",
    name: "長線承接",
    rate: 1.2,
    weights: W(0.8, 0.8, 1, 1, 1.5, 1.3),
    leverage: [[1, 0.5], [2, 0.3], [3, 0.2]],
    // Deep ladders: buyers well under the 4-hour high, sellers well over the 4-hour low.
    decide(sim) {
      const { rng, ind } = sim;
      const dir = leaning(sim, 0.5, 0.2);
      const anchor = dir > 0 ? ind.high4h : ind.low4h;
      if (anchor == null) return;
      const price = roundPrice(anchor * (1 - dir * rng.range(0.02, 0.06)));
      if (dir > 0 ? price >= sim.last * 0.996 : price <= sim.last * 1.004) return;
      sim.openCohort({
        pool: "value", side: dir, lots: btcLots(rng, 5, 0.8), leverage: sim.leverageFor(this),
        entry: { type: "limit", price, expireAt: sim.time + rng.int(60, 180) * MIN },
        stop: rng.chance(0.1) ? roundPrice(price * (1 - dir * rng.range(0.04, 0.06))) : null,
        take: roundPrice(price * (1 + dir * rng.range(0.015, 0.03))), takeMode: "limit",
        hold: rng.int(240, 720) * MIN,
      });
    },
  },
];

export const POOL_MAP = new Map(POOLS.map((pool) => [pool.key, pool]));
