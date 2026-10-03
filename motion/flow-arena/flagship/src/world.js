// The film's market: a scripted but self-consistent BTC-perp session. The crowd, its liquidation
// bands and the battle's price path are all closed-form, so every scene can sample any moment.

import { bar, BEAT, BATTLE, WAVES } from "./cues.js";
import { clamp, ease, fbm, gauss, lerp, noise1, rnd, rr, smooth } from "./lib.js";

// ---------- The crowd (open + fuel scenes) ----------

export const P0 = 102640;
/** World units per dollar in the open/fuel world. */
export const KY = 0.36;
export const py = (price) => (price - P0) * KY;

// Liquidation bands as the arena's heatmap would show them: short fuel above, long fuel below.
export const BANDS = [
  { price: 102985, w: 26, heat: 0.42, side: "short", kind: "stop" },
  { price: 103420, w: 44, heat: 0.66, side: "short", kind: "liq" },
  { price: 103790, w: 80, heat: 1.0, side: "short", kind: "liq", target: true },
  { price: 104330, w: 40, heat: 0.58, side: "short", kind: "liq" },
  { price: 102310, w: 24, heat: 0.38, side: "long", kind: "stop" },
  { price: 101880, w: 46, heat: 0.74, side: "long", kind: "liq" },
  { price: 101390, w: 38, heat: 0.52, side: "long", kind: "liq" },
];

/** Price line of the open/fuel world, x in world units (head at x = 0 when the fuel run starts). */
export function linePrice(x) {
  const drift = fbm(x / 520, 3, 4) * 230 + fbm(x / 140, 9, 3) * 70 + noise1(x / 22, 5) * 16;
  return P0 + drift;
}

/** End of the fuel run in world x: the price climbs from the history into the target band. */
export const RUN_END = 1500;
const TARGET_PRICE = 103790;
/** Price including the run that climbs into the target band (x > 0). */
export function runPrice(x) {
  const p = linePrice(x);
  if (x <= 0) return p;
  const k = Math.min(1, x / RUN_END);
  const e = k * k * k;
  return p + (TARGET_PRICE - 16 - p) * e;
}

export const COHORTS = [
  { zh: "突破動能", en: "BREAKOUT" },
  { zh: "支撐壓力", en: "SUPPORT / RESISTANCE" },
  { zh: "ICT／SMC", en: "ICT / SMC" },
  { zh: "均線／MACD", en: "MA / MACD" },
  { zh: "均值回歸", en: "MEAN REVERSION" },
  { zh: "情緒追價", en: "FOMO CHASERS" },
  { zh: "雜訊散戶", en: "NOISE" },
  { zh: "長線承接", en: "LONG-TERM BIDS" },
];

const N_CROWD = 1900;
export const crowd = [];
{
  const upper = BANDS.filter((b) => b.side === "short");
  const lower = BANDS.filter((b) => b.side === "long");
  const pick = (list, r) => {
    const total = list.reduce((s, b) => s + b.heat, 0);
    let acc = 0;
    for (const b of list) {
      acc += b.heat / total;
      if (r <= acc) return b;
    }
    return list[list.length - 1];
  };
  for (let i = 0; i < N_CROWD; i++) {
    // Most of the crowd is in the history; the rest opens positions along the run (chasers).
    const late = rnd(i, 13) < 0.3;
    const x = late ? rr(i, 1, 40, RUN_END + 500) : -(rr(i, 1, 0, 1) ** 0.8) * 2300 + 60;
    const short = rnd(i, 2) < 0.5;
    const cohort = late ? 5 : Math.floor(rnd(i, 3) * 8);
    const entry = runPrice(x) + gauss(i, 4) * (late ? 90 : 120);
    const band = pick(short ? upper : lower, rnd(i, 5));
    const liq = band.price + gauss(i, 6) * band.w * 0.55;
    const stopBand = short ? upper[0] : lower[0];
    const stop = stopBand.price + gauss(i, 7) * stopBand.w * 0.6;
    crowd.push({
      i,
      x,
      y: py(entry),
      z: gauss(i, 8) * 150,
      short,
      cohort,
      liq: py(liq),
      stop: py(stop),
      band,
      hasStop: !late && rnd(i, 9) < 0.55,
      late,
      appear: rnd(i, 10),
      size: rr(i, 11, 0.6, 1.6) * (rnd(i, 12) < 0.04 ? 2.4 : 1),
    });
  }
}

// ---------- The battle (one continuous chart, 12 bars) ----------

const T = (b) => bar(b);

/**
 * Game clock: chart candles elapsed at film time t. One candle per beat in play, frozen through
 * PLAN, a touch faster once EXECUTE resumes the market, and nearly stopped in the slow-motion.
 */
const CLOCK = [
  [T(12), 1],
  [T(BATTLE.freeze) - 0.18, 1],
  [T(BATTLE.freeze), 0],
  [T(BATTLE.resume), 0],
  [T(BATTLE.resume) + 0.1, 1.15],
  [T(BATTLE.slowmo) - 0.12, 1.15],
  [T(BATTLE.slowmo) + 0.25, 0.1],
  [T(24), 0.1],
];
const RATE = 1 / BEAT;
function rate(t) {
  for (let i = 1; i < CLOCK.length; i++) {
    if (t <= CLOCK[i][0]) {
      const [a, ra] = CLOCK[i - 1];
      const [b, rb] = CLOCK[i];
      return lerp(ra, rb, smooth(clamp((t - a) / Math.max(1e-6, b - a))));
    }
  }
  return CLOCK[CLOCK.length - 1][1];
}
// Pre-integrated clock (piecewise trapezoid at 1 ms), so tau(t) is exact and monotonic.
const DT = 0.001;
const TAU_TABLE = [];
{
  let acc = 0;
  for (let t = T(12); t <= T(24.5); t += DT) {
    TAU_TABLE.push(acc);
    acc += rate(t) * RATE * DT;
  }
}
export const HISTORY = 64; // candles already on the chart when the battle opens
export function tau(t) {
  if (t <= T(12)) return HISTORY + (t - T(12)) * RATE;
  const f = (t - T(12)) / DT;
  const i = Math.floor(f);
  if (i >= TAU_TABLE.length - 1) return HISTORY + TAU_TABLE[TAU_TABLE.length - 1];
  return HISTORY + lerp(TAU_TABLE[i], TAU_TABLE[i + 1], f - i);
}
/** Game-clock rate relative to normal play (0 = frozen). */
export const clockRate = (t) => (t < T(12) ? 1 : rate(t));

// Battle prices.
export const BP = {
  start: 102640,
  push1Peak: 103260,
  push1Settle: 102990,
  chase: 103140,
  wallExpected: 103690,
  wallActual: 103180,
  wallSettle: 103060,
  execPeak: 103520,
  stormTop: 106130,
  exitAvg: 105020,
};
export const POSITION = {
  size: 7500,
  avg: 103421.7,
  realized: 11987500,
  lev: 20,
};

// Events on the game clock.
const E = {
  push1: tau(T(BATTLE.push1Click)),
  wall: tau(T(BATTLE.wallClick)),
  exec: tau(T(BATTLE.resume)),
  waves: WAVES.map((w) => tau(T(w))),
  slow: tau(T(BATTLE.slowmo)),
};
export const EVENTS = E;

// Cascade wave sizes (BTC) and the price each wave lifts to. The climb accelerates into the storm.
export const WAVE_DATA = WAVES.map((w, i) => {
  const k = i / (WAVES.length - 1);
  const price = lerp(BP.execPeak + 60, BP.stormTop, ease.in2(k) * 0.55 + k * 0.45);
  const size = Math.round(rr(i, 77, 0.6, 1.4) * lerp(92, 310, k) * 10) / 10;
  return { at: E.waves[i], price, size };
});
export const CASCADE_TOTAL = WAVE_DATA.reduce((s, w) => s + w.size, 0);

/** Base price with all scripted moves, on the game clock. Smooth enough to sample into candles. */
export function price(g) {
  // Ambient noise: slow drift + fast jitter. The jitter keeps every candle with wicks.
  let p = BP.start + fbm(g / 9, 21, 3) * 120 + noise1(g * 2.3, 22) * 38 + noise1(g * 7.7, 23) * 16;
  // Push 1: a near-vertical lift, then the maker re-centres near the average fill.
  if (g > E.push1) {
    const a = g - E.push1;
    const up = ease.out4(clamp(a / 0.32));
    const give = ease.out3(clamp((a - 0.3) / 1.0));
    p += lerp(0, BP.push1Peak - BP.start, up) - (BP.push1Peak - BP.push1Settle) * give;
    // FOMO chasers lean in afterwards.
    p += (BP.chase - BP.push1Settle) * ease.inOut3(clamp((a - 1.4) / 2.2));
  }
  // Wall: the push stalls at the iceberg and is sold back.
  if (g > E.wall) {
    const a = g - E.wall;
    const up = ease.out4(clamp(a / 0.22));
    const back = ease.out3(clamp((a - 0.25) / 1.2));
    p += (BP.wallActual - BP.chase) * up - (BP.wallActual - BP.wallSettle) * back;
  }
  // Execute: through the wall and into the short liquidations.
  if (g > E.exec) {
    const a = g - E.exec;
    p += (BP.execPeak - BP.wallSettle) * ease.out4(clamp(a / 0.3));
    let lift = 0;
    for (let i = 0; i < WAVE_DATA.length; i++) {
      const w = WAVE_DATA[i];
      if (g <= w.at) break;
      const prev = i === 0 ? BP.execPeak : WAVE_DATA[i - 1].price;
      lift += (w.price - prev) * ease.out4(clamp((g - w.at) / 0.22));
    }
    p += lift;
    // After the storm, the exit sells into the last liquidations and the price eases off.
    const last = WAVE_DATA[WAVE_DATA.length - 1].at;
    if (g > last) p -= 420 * ease.out3(clamp((g - last - 0.4) / 1.6));
  }
  return p;
}

/** OHLC for candle `c` with the live candle cut at game time g. */
export function candle(c, g) {
  const end = Math.min(c + 1, g);
  if (end <= c) return null;
  const n = 18;
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = 0; i <= n; i++) {
    const v = price(lerp(c, end, i / n));
    if (v > hi) hi = v;
    if (v < lo) lo = v;
  }
  const o = price(c);
  const cl = price(end);
  const vol = 40 + Math.abs(cl - o) * 1.6 + (hi - lo) * 0.6 + rnd(c, 99) * 60;
  return { o, h: hi, l: lo, c: cl, vol };
}

// Order book ladder levels (offset in $ from mid → size). Deterministic per level.
// `key` identifies the price level (stable as the ladder scrolls), `depth` its distance from mid.
export function bookSize(key, depth, side, g) {
  const s = side === "ask" ? 1 : 2;
  const base = 12 + rnd(key, s) ** 2 * 90 + depth * 2.4 + (rnd(key, s + 7) < 0.08 ? 70 : 0);
  const shimmer = 1 + 0.22 * noise1(g * 2 + key * 0.7, s + 30);
  return base * shimmer;
}
