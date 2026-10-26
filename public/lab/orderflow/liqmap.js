// Estimated liquidation map. Exchanges do not publish where open positions would be
// liquidated, so this rebuilds it from what they do publish: open interest every
// 5 minutes and trades by price. It is a model, and every assumption is here.
//
// 1. A rise in OI over an interval is new positions; each contract has a long and a
//    short side, so both get the increase. Entries are spread over the interval's
//    traded volume by price.
// 2. Each entry is split across assumed leverage tiers and turned into a liquidation
//    price with a flat maintenance margin rate.
// 3. A fall in OI scales every estimated position down by the same ratio.
// 4. When price trades through a liquidation price, those positions are gone.

export const LEVERAGE = [
  [10, 0.25],
  [25, 0.3],
  [50, 0.3],
  [100, 0.15],
];
export const MMR = 0.004;
export const BIN = 25; // USDT per model price bin
const MAX_STEPS = 1500; // snapshots kept for drawing; two weeks of 5-minute steps would need ~40 MB

/**
 * @param rows   1-minute rows [t, o, h, l, c, [[bin, buy, sell], …]] with `tick`-sized bins
 * @param tick   price size of a row bin
 * @param oi     [[t, oiBtc], …] sorted, roughly every 5 minutes; the last may be live
 * @returns { lo, bins, steps: [{ t, long: Float32Array, short: Float32Array }] }
 *          where values are coins at liquidation prices lo + i × bin (BIN, $25, for BTC).
 * @param onStep optional (t, { wipedLong, wipedShort }, { lo, long, short }) after each interval:
 *               BTC the model says was liquidated by price trading through it, and the live map
 *               (read it inside the callback; it changes after). keepSteps: false skips snapshots.
 */
export function buildLiqMap(rows, tick, oi, { onStep, keepSteps = true, bin = BIN } = {}) {
  if (rows.length < 2 || oi.length < 2) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    if (r[3] < min) min = r[3];
    if (r[2] > max) max = r[2];
  }
  // Liquidation prices reach 1/10 + margin away from entry at the lowest tier.
  const lo = Math.floor((min * 0.85) / bin) * bin;
  const bins = Math.ceil((max * 1.15 - lo) / bin);
  const long = new Float32Array(bins);
  const short = new Float32Array(bins);
  const steps = [];
  const binOf = (p) => Math.min(bins - 1, Math.max(0, Math.floor((p - lo) / bin)));

  const stride = Math.max(1, Math.ceil((oi.length - 1) / MAX_STEPS));
  let r = 0;
  // Skip rows before the first OI reading: there is no baseline to compare against.
  while (r < rows.length && rows[r][0] < oi[0][0]) r++;
  for (let k = 1; k < oi.length; k++) {
    const [t, now] = oi[k];
    const prev = oi[k - 1][1];
    let high = -Infinity;
    let low = Infinity;
    const volume = new Map(); // price → traded qty in this interval
    for (; r < rows.length && rows[r][0] < t; r++) {
      const [, o, h, l, c, levels] = rows[r];
      if (h > high) high = h;
      if (l < low) low = l;
      if (levels.length) {
        for (const [bin, buy, sell] of levels) {
          const p = bin * tick + tick / 2;
          volume.set(p, (volume.get(p) ?? 0) + buy + sell);
        }
      } else {
        // Kline-backfilled minute: no price detail, use its typical price.
        const p = (h + l + c) / 3;
        volume.set(p, (volume.get(p) ?? 0) + 1);
      }
    }
    let wipedLong = 0;
    let wipedShort = 0;
    if (Number.isFinite(low)) {
      // Price traded through these liquidation prices during the interval.
      for (let i = binOf(low); i < bins; i++) {
        wipedLong += long[i];
        long[i] = 0;
      }
      for (let i = binOf(high); i >= 0; i--) {
        wipedShort += short[i];
        short[i] = 0;
      }
    }
    onStep?.(t, { wipedLong, wipedShort }, { lo, long, short });
    if (prev > 0 && now < prev) {
      const f = now / prev;
      for (let i = 0; i < bins; i++) {
        long[i] *= f;
        short[i] *= f;
      }
    } else if (now > prev && volume.size) {
      let total = 0;
      for (const v of volume.values()) total += v;
      const added = now - prev;
      for (const [p, v] of volume) {
        const qty = (added * v) / total;
        for (const [lev, share] of LEVERAGE) {
          long[binOf(p * (1 - 1 / lev + MMR))] += qty * share;
          short[binOf(p * (1 + 1 / lev - MMR))] += qty * share;
        }
      }
    }
    if (keepSteps && (k % stride === 0 || k === oi.length - 1)) steps.push({ t, long: long.slice(), short: short.slice() });
  }
  return { lo, bins, steps };
}

/** Latest step at or before time t (binary search), or null. */
export function stepAt(map, t) {
  const s = map.steps;
  let a = 0;
  let b = s.length - 1;
  if (!s.length || s[0].t > t) return null;
  while (a < b) {
    const m = (a + b + 1) >> 1;
    if (s[m].t <= t) a = m;
    else b = m - 1;
  }
  return s[a];
}
