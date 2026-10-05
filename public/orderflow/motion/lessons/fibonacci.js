// S06 黃金口袋，是答案還是巧合？ — Fibonacci as a map of the crowd. A swing from 1,000
// to 2,000 gets its retracement lines; 200 simulated pullbacks show why four lines
// spread over 15–65% are bound to be "touched". Then the crowd's orders appear: bids
// in the golden pocket (0.618–0.65), long stops under 0.786. The same pullback plays
// twice: A, the bids stay and absorb; B, they are pulled and the stops cascade.
// Ledger: FIBONACCI-LESSON-PLAN.
import {
  C,
  F,
  W,
  H,
  clamp,
  ease,
  lerp,
  prog,
  tw,
  text,
  rgba,
  glow,
  ring,
  burst,
  candle,
  line,
  pulse,
  rrect,
  fmt,
  shake,
  bear,
  rnd,
  rrange,
} from "../core.js";
import { titleCard, priceGrid, floatChip, camera, camPath, statement, tag } from "../kit.js";

// ---------------------------------------------------------------- geometry
const PY = (p) => 930 - (p - 1000) * 0.66;
const X = (i) => 250 + i * 64;
const RED = "#ff8a7f";

// ---------------------------------------------------------------- the ledger
export const SWING = { low: 1000, high: 2000 };
/** Retracement price for a ratio of the swing. */
export const fibPrice = (r) => SWING.high - (SWING.high - SWING.low) * r;
export const LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786];
export const POCKET = { top: fibPrice(0.618), bottom: fibPrice(0.65) };

/** Bars as price paths [[t, p], ...]; OHLC is read off the path up to market time. */
const ohlcPath = (t0, t1, o, h, l, c) => {
  const up = c >= o;
  const mid = up ? [l, h] : [h, l];
  return [
    [t0, o],
    [lerp(t0, t1, 0.3), mid[0]],
    [lerp(t0, t1, 0.7), mid[1]],
    [t1, c],
  ];
};
/** The impulse, finished before the film starts. */
export const IMPULSE = [
  [1000, 1080, 990, 1070],
  [1070, 1200, 1060, 1180],
  [1180, 1330, 1170, 1310],
  [1310, 1450, 1290, 1430],
  [1430, 1600, 1410, 1580],
  [1580, 1720, 1560, 1700],
  [1700, 1860, 1690, 1840],
  [1840, 2000, 1820, 1980],
];
/** The shared pullback toward the pocket (forms on screen). */
export const PULLBACK = [
  [1980, 1990, 1880, 1900],
  [1900, 1920, 1760, 1780],
  [1780, 1800, 1640, 1660],
  [1660, 1680, 1520, 1540],
  [1540, 1560, 1420, 1440],
];
const PB_T = [26.8, 27.7, 28.6, 29.5, 30.4, 31.2];
const SHARED_BARS = PULLBACK.map((b, i) => ohlcPath(PB_T[i], PB_T[i + 1], ...b));
const REW_VT = PB_T.at(-1);
/** A: the bids stay; sellers hit them all the way to 1,355 and price turns. */
export const BARS_A = [
  ...SHARED_BARS,
  [
    [31.4, 1440],
    [31.6, 1450],
    [31.8, 1382],
    [32.6, 1370],
    [33.4, 1355],
    [34.2, 1380],
    [35.4, 1420],
  ],
  ohlcPath(35.6, 37.2, 1420, 1520, 1410, 1510),
  ohlcPath(37.2, 38.8, 1510, 1640, 1500, 1630),
];
/** B: the bids are pulled first; price slices the pocket and runs the stops. */
export const BARS_B = [
  ...SHARED_BARS,
  [
    [50.0, 1440],
    [50.2, 1445],
    [50.6, 1382],
    [50.8, 1370],
    [51.0, 1355],
    [51.6, 1214],
    [52.4, 1150],
    [53.0, 1190],
    [53.6, 1180],
  ],
  ohlcPath(53.6, 55.2, 1180, 1230, 1150, 1160),
];
/** Resting bids: the crowd's limit buys (+), cancels (−) and fills (−). */
const CROWD = [
  { t: 22.0, p: 1500, q: 60, x: X(8) - 20 },
  { t: 22.4, p: 1382, q: 250, x: X(8) - 20 },
  { t: 23.0, p: 1370, q: 200, x: X(8) - 20 },
  { t: 23.6, p: 1355, q: 150, x: X(8) - 20 },
];
export const BOOK_A = [
  ...CROWD,
  { t: 31.8, p: 1382, q: -150, x: X(13) - 10 },
  { t: 32.6, p: 1370, q: -120, x: X(13) },
  { t: 33.4, p: 1355, q: -80, x: X(13) + 8 },
];
export const BOOK_B = [
  ...CROWD,
  { t: 46.2, p: 1382, q: -200, x: X(12) + 22 },
  { t: 46.7, p: 1370, q: -160, x: X(12) + 26 },
  { t: 47.2, p: 1355, q: -120, x: X(12) + 30 },
  { t: 50.6, p: 1382, q: -50, x: X(13) - 6 },
  { t: 50.8, p: 1370, q: -40, x: X(13) - 2 },
  { t: 51.0, p: 1355, q: -30, x: X(13) + 2 },
];
/** Long stops parked under 0.786, and when they fire in B. */
export const STOPS = { p: 1200, q: 400, t: 51.6 };

/** Simulated depth of 200 past pullbacks, in 5% bins from 10% to 90%: smooth, no Fibonacci peaks. */
export const DEPTHS = [4, 9, 14, 19, 22, 23, 22, 20, 17, 14, 11, 9, 7, 5, 3, 1];
const BIN0 = 10;
const BINW = 5;
/** How many simulated pullbacks fall inside [a, b) percent (whole bins only). */
export const depthShare = (a, b) => DEPTHS.reduce((s, n, i) => s + (BIN0 + i * BINW >= a && BIN0 + (i + 1) * BINW <= b ? n : 0), 0);
const RANDOM_LINES = [29, 44, 55, 67];

// ---------------------------------------------------------------- timeline
const T = {
  title: 2.6,
  swing: 2.8,
  fib: 6.5,
  hist: [10.4, 21.4],
  crowd: 21.5,
  stops: 26.0,
  pull: 26.8,
  a: 31.4,
  hold: 37.5,
  rew: [43.5, 45.5],
  b: 45.5,
  stopFire: 51.6,
  split: 56.0,
  final: 62.5,
  end: 68,
};

// ---------------------------------------------------------------- market state
function priceAt(path, vt) {
  if (vt <= path[0][0]) return path[0][1];
  for (let i = 1; i < path.length; i++)
    if (vt <= path[i][0]) return lerp(path[i - 1][1], path[i][1], ease.inOutQuad(prog(vt, path[i - 1][0], path[i][0])));
  return path.at(-1)[1];
}
function barAt(path, vt) {
  if (vt < path[0][0]) return null;
  const seen = path.filter(([t]) => t <= vt).map(([, p]) => p);
  const now = priceAt(path, vt);
  const ps = [...seen, now];
  return { o: path[0][1], h: Math.max(...ps), l: Math.min(...ps), c: now, live: vt < path.at(-1)[0] };
}

function bookAt(events, vt) {
  const q = {};
  for (const e of [...events].sort((a, b) => a.t - b.t)) if (e.t <= vt) q[e.p] = Math.max(0, (q[e.p] ?? 0) + e.q);
  return q;
}
/** Heat segments: each change closes a segment at the bar where it happened. */
function heatAt(events, vt, xNow) {
  const segs = [];
  const open = {};
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    if (e.t > vt) break;
    const x = e.x;
    const cur = open[e.p];
    if (cur) segs.push({ p: e.p, x0: cur.x, x1: Math.max(cur.x, x), q: cur.q });
    open[e.p] = { x, q: Math.max(0, (cur?.q ?? 0) + e.q) };
  }
  for (const [p, cur] of Object.entries(open)) segs.push({ p: Number(p), x0: cur.x, x1: Math.max(cur.x, xNow), q: cur.q });
  return segs.filter((s) => s.q > 0 && s.x1 > s.x0);
}
function snapshot(branch, vt) {
  const A = branch === "A";
  const live = A ? BARS_A : BARS_B;
  const bars = IMPULSE.map(([o, h, l, c]) => ({ o, h, l, c }));
  let last = IMPULSE.at(-1)[3];
  let liveIdx = 7;
  live.forEach((path, k) => {
    const b = barAt(path, vt);
    bars.push(b);
    if (b) {
      last = b.c;
      liveIdx = 8 + k;
    }
  });
  const events = A ? BOOK_A : BOOK_B;
  return { branch, vt, bars, last, liveIdx, book: bookAt(events, vt), heat: heatAt(events, vt, X(Math.max(liveIdx, 9)) + 26) };
}

// ---------------------------------------------------------------- camera
const KEYS = [
  { t: 0, x: 900, y: 600, z: 0.8 },
  { t: T.swing, x: 900, y: 600, z: 0.86 },
  { t: T.fib, x: 960, y: 590, z: 0.92 },
  { t: 10.0, x: 960, y: 590, z: 0.93 },
  { t: T.crowd, x: 960, y: 590, z: 0.93 },
  { t: 23.0, x: 900, y: 660, z: 1.1 },
  { t: 26.4, x: 900, y: 680, z: 1.1 },
  { t: 27.4, x: 920, y: 640, z: 0.98 },
  { t: 31.0, x: 940, y: 640, z: 1.0 },
  { t: 32.0, x: 1000, y: 680, z: 1.25 },
  { t: 35.4, x: 1000, y: 680, z: 1.25 },
  { t: 36.4, x: 960, y: 600, z: 0.98 },
  { t: T.rew[0], x: 960, y: 600, z: 0.98 },
  { t: T.rew[1], x: 940, y: 640, z: 1.0 },
  { t: 47.8, x: 960, y: 680, z: 1.15 },
  { t: 50.0, x: 960, y: 700, z: 1.05 },
  { t: 52.4, x: 960, y: 720, z: 0.98 },
  { t: T.split, x: 960, y: 700, z: 0.98 },
];
function mainCam(t) {
  const cam = camPath(t, KEYS);
  const [a, b] = shake(t, T.stopFire, 18, 0.7, 31);
  cam.sx = a;
  cam.sy = b;
  return cam;
}

// ---------------------------------------------------------------- the chart (world space)
function world(ctx, t, S, o = {}) {
  const a = o.alpha ?? 1;
  const main = !o.pane;
  const A = S.branch === "A";
  const vt = S.vt;
  priceGrid(ctx, t, { alpha: 0.26 * a, step: 33, oy: PY(1000) });

  // ---- price axis
  const ax = main ? tw(t, T.swing, T.swing + 0.6) : 1;
  for (let p = 1000; p <= 2000; p += 100)
    text(ctx, fmt(p), X(0) - 54, PY(p) + 1, { family: F.mono, size: 16, color: C.dim, align: "right", base: "middle", alpha: a * ax * 0.8 });

  // ---- swing anchors
  const anc = main ? tw(t, T.fib - 0.4, T.fib + 0.2) : 1;
  if (anc > 0) {
    glow(ctx, X(0), PY(SWING.low), 30, C.gold, a * anc * 0.8);
    glow(ctx, X(7), PY(SWING.high), 30, C.gold, a * anc * 0.8);
    tag(ctx, `低點 ${fmt(SWING.low)}`, X(0) + 20, PY(SWING.low) + 26, { color: C.gold, size: 16, alpha: a * anc });
    tag(ctx, `高點 ${fmt(SWING.high)}`, X(7) - 70, PY(SWING.high) - 28, { color: C.gold, size: 16, alpha: a * anc });
    if (main) line(ctx, X(0), PY(SWING.low), lerp(X(0), X(7), tw(t, T.fib, T.fib + 0.8)), lerp(PY(SWING.low), PY(SWING.high), tw(t, T.fib, T.fib + 0.8)), C.gold, 1.6, a * 0.5 * (1 - tw(t, T.fib + 2, T.fib + 3)), [6, 6]);
  }

  // ---- Fibonacci levels and the golden pocket
  const xEnd = X(15) + 40;
  LEVELS.forEach((r, k) => {
    const u = main ? tw(t, T.fib + 0.8 + k * 0.35, T.fib + 1.4 + k * 0.35, ease.outQuart) : 1;
    if (u <= 0) return;
    const p = fibPrice(r);
    const gold = r === 0.618;
    const broke = !A && r >= 0.618 && vt >= (r === 0.618 ? 50.6 : T.stopFire);
    const col = broke ? RED : gold ? C.gold : r === 0.786 ? C.sell : C.muted;
    line(ctx, X(0) - 20, PY(p), lerp(X(0) - 20, xEnd, u), PY(p), col, gold ? 2 : 1.3, a * (gold ? 0.9 : 0.6), gold ? null : [8, 7]);
    text(ctx, `${r} · ${fmt(p)}`, xEnd + 10, PY(p) + 1, { family: F.mono, size: 16, weight: gold ? 800 : 600, color: col, base: "middle", alpha: a * u });
  });
  const gp = main ? tw(t, T.fib + 2.8, T.fib + 3.4) : 1;
  if (gp > 0) {
    ctx.save();
    ctx.globalAlpha = a * gp * (0.14 + 0.05 * Math.sin(t * 2.4));
    ctx.fillStyle = A || vt < 50.6 ? C.gold : RED;
    ctx.fillRect(X(0) - 20, PY(POCKET.top), xEnd - X(0) + 20, PY(POCKET.bottom) - PY(POCKET.top));
    ctx.restore();
    text(ctx, `黃金口袋 0.618–0.65 · ${fmt(POCKET.top)}–${fmt(POCKET.bottom)}`, xEnd + 10, PY(POCKET.bottom) + 18, { family: F.tc, size: 15, weight: 800, color: C.gold, base: "middle", alpha: a * gp });
  }

  // ---- the crowd's bids (heatmap)
  for (const s of S.heat) {
    const k = clamp(s.q / 250);
    ctx.save();
    ctx.globalAlpha = a * (0.18 + 0.6 * k);
    const g = ctx.createLinearGradient(0, PY(s.p) - 9, 0, PY(s.p) + 9);
    g.addColorStop(0, rgba(C.buy, 0));
    g.addColorStop(0.5, rgba(k > 0.7 ? "#f4e7b0" : C.buy, 1));
    g.addColorStop(1, rgba(C.buy, 0));
    ctx.fillStyle = g;
    ctx.fillRect(s.x0, PY(s.p) - 9, s.x1 - s.x0, 18);
    ctx.restore();
  }

  // ---- long stops under 0.786
  const stIn = main ? tw(t, T.stops, T.stops + 0.5) * (A ? 1 - tw(t, T.rew[0], T.rew[0] + 0.3) : 1) : 0;
  if (stIn > 0 && (A || vt < STOPS.t + 1.2)) {
    for (let i = 0; i < 6; i++) {
      const pop = A || vt < T.b + 0.3 ? ease.outBack(prog(t, T.stops + i * 0.06, T.stops + 0.4 + i * 0.06)) : 1;
      const fired = A ? 0 : prog(vt, STOPS.t + i * 0.05, STOPS.t + 0.4 + i * 0.05);
      const bx = X(12) + 30 + i * 26;
      const by = PY(STOPS.p) + fired * 60 * (1 + i * 0.2);
      if (fired < 1) bear(ctx, bx, by, 20 * pop * (1 + fired * 0.6), C.sell, a * stIn * clamp(pop) * (1 - fired), { outline: fired < 0.05 });
      if (fired > 0 && fired < 1) glow(ctx, bx, by, 36, C.sell, 0.8 * (1 - fired));
    }
    const lb = stIn * (A ? 1 : 1 - tw(vt, STOPS.t, STOPS.t + 0.3));
    if (lb > 0) tag(ctx, `多單停損 ${fmt(STOPS.p)} · ${STOPS.q} 隻（0.786 下面）`, X(12) + 16, PY(STOPS.p) + 34, { color: C.sell, size: 16, alpha: a * lb });
  }

  // ---- candles
  S.bars.forEach((b, i) => {
    if (!b) return;
    const pop = main && i < 8 ? tw(t, T.swing + 0.2 + i * 0.12, T.swing + 0.6 + i * 0.12) : 1;
    candle(ctx, X(i), 30, PY(b.o), PY(b.h), PY(b.l), PY(b.c), { alpha: a * pop, wickWidth: 3, minBody: 4, glow: b.live && main ? 16 : 0 });
  });
  // ---- live price and retracement depth
  if (S.liveIdx >= 8) {
    const y = PY(S.last);
    const xl = X(S.liveIdx) + 20;
    line(ctx, xl, y, xl + 56, y, C.gold, 2, a * 0.8);
    glow(ctx, xl, y, 18, C.gold, a * 0.6);
    const depth = ((SWING.high - S.last) / (SWING.high - SWING.low)) * 100;
    if (depth > 45 && S.liveIdx <= 13 && (A || vt < 51.4)) text(ctx, `回調 ${depth.toFixed(1)}%`, xl + 4, y + 26, { family: F.mono, size: 16, weight: 700, color: C.gold, base: "middle", alpha: a * 0.9 });
  }
}

// ---- the crowd scene and both endings (world space overlays)
function crowdNotes(ctx, t, S, a) {
  const vt = S.vt;
  const A = S.branch === "A";
  // limit orders flying in from the crowd
  if (t < T.stops + 1)
    [
      ["限價買 · 0.618", 22.0, 1382],
      ["限價買 · 0.65", 22.6, 1355],
      ["限價買 · 0.618", 23.2, 1370],
      ["限價買 · 黃金口袋", 23.8, 1382],
    ].forEach(([s, t0, p], k) => {
      const u = ease.outCubic(prog(t, t0, t0 + 0.8));
      if (u <= 0 || t > t0 + 2.2) return;
      const x = lerp(X(16) + 200, X(9.5) + k * 60, u);
      const y = lerp(PY(p) - 200 + k * 30, PY(POCKET.top) - 40 - k * 26, u);
      tag(ctx, s, x, y, { color: C.buy, size: 14, alpha: a * (1 - tw(t, t0 + 1.6, t0 + 2.2)) });
    });
  const ck = tw(t, 24.2, 24.6) * (1 - tw(t, T.pull + 0.4, T.pull + 0.8));
  if (ck > 0) tag(ctx, `黃金口袋掛買合計 ${S.book[1382] + S.book[1370] + S.book[1355]} 隻`, X(9), PY(1300), { color: C.buy, size: 18, alpha: a * ck });
  if (A && t < T.rew[0]) {
    const fills = [[31.8, 150, 1382], [32.6, 120, 1370], [33.4, 80, 1355]];
    fills.forEach(([t0, , p]) => burst(ctx, X(13), PY(p), t, t0, { n: 18, speed: 220, color: C.sell, seed: p, flare: 40 }));
    const got = fills.reduce((s, [t0, q]) => s + (vt >= t0 ? q : 0), 0);
    const ab = tw(t, 31.8, 32.1) * (1 - tw(t, T.rew[0] - 0.6, T.rew[0]));
    if (ab > 0) tag(ctx, `掛買接住 ${got} 隻賣單${vt >= 34.2 ? "，低點停在 1,355" : ""}`, X(9), PY(1290), { color: C.buy, solid: vt >= 34.2, size: 18, alpha: a * ab });
    const hd = tw(t, T.hold, T.hold + 0.4) * (1 - tw(t, T.rew[0] - 0.4, T.rew[0]));
    if (hd > 0) tag(ctx, "有用的是買單，不是 0.618 這個比例", X(1), PY(1840), { color: C.gold, size: 20, alpha: a * hd });
  }
  if (!A) {
    [46.2, 46.7, 47.2].forEach((t0, k) => {
      const p = [1382, 1370, 1355][k];
      floatChip(ctx, `撤單 −${[200, 160, 120][k]}`, X(1.5) + k * 140, PY(1830), t, t0, { color: RED, size: 22, dur: 1.4 });
      const ev = t - t0;
      if (ev > 0 && ev < 1.4)
        for (let i = 0; i < 16; i++) {
          const x = lerp(X(8), X(12), rnd(301 + k, i)) + ev * rrange(302, i, 20, 80);
          const y = PY(p) + rrange(303, i, -8, 8) - ev * ev * rrange(304, i, 40, 140);
          glow(ctx, x, y, 9 * (1 - ev / 1.4), C.buy, 0.9 * (1 - ev / 1.4));
        }
    });
    const left = tw(t, 47.6, 48.0) * (1 - tw(t, 50.0, 50.4));
    if (left > 0) tag(ctx, `價格還沒到，黃金口袋只剩 ${S.book[1382] + S.book[1370] + S.book[1355]} 隻`, X(9), PY(1300), { color: RED, size: 18, alpha: a * left });
    ring(ctx, X(13), PY(STOPS.p), t, T.stopFire, { r1: 300, color: RED, w: 5, dur: 1.0 });
    const run = tw(vt, T.stopFire, T.stopFire + 0.3) * (1 - tw(t, T.split, T.split + 0.3));
    if (run > 0) tag(ctx, "停損觸發 → 加速跌到 1,150", X(14) + 10, PY(1120), { color: RED, solid: true, size: 18, alpha: a * run });
  }
}

// ---------------------------------------------------------------- the histogram (screen space)
function histogram(ctx, t) {
  const [h0, h1] = T.hist;
  const a = tw(t, h0, h0 + 0.6) * (1 - tw(t, h1 - 0.6, h1));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.94 * a;
  ctx.fillStyle = "#04080f";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const x0 = 260;
  const x1 = 1660;
  const base = 780;
  const xp = (pct) => lerp(x0, x1, (pct - BIN0) / (BINW * DEPTHS.length));
  text(ctx, "教學用模擬：200 次回調，各回到多深？", W / 2, 200, { family: F.tc, size: 34, weight: 800, color: C.text, align: "center", alpha: a });
  // axis
  line(ctx, x0, base, x1, base, C.line, 2, a);
  for (let p = 10; p <= 90; p += 10) text(ctx, `${p}%`, xp(p), base + 30, { family: F.mono, size: 16, color: C.dim, align: "center", alpha: a });
  // squares drop in, bin by bin
  const unit = 15;
  const bw = (x1 - x0) / DEPTHS.length;
  DEPTHS.forEach((n, i) => {
    for (let k = 0; k < n; k++) {
      const appear = h0 + 0.8 + (k / 23) * 3.2 + i * 0.04;
      const u = ease.outCubic(prog(t, appear, appear + 0.25));
      if (u <= 0) continue;
      const y = base - 6 - (k + 1) * unit + (1 - u) * -60;
      const inBand = BIN0 + i * BINW >= 15 && BIN0 + (i + 1) * BINW <= 65;
      const band = tw(t, 17.0, 17.4);
      ctx.save();
      ctx.globalAlpha = a * u;
      rrect(ctx, x0 + i * bw + 8, y, bw - 16, unit - 3, 3);
      ctx.fillStyle = inBand && band > 0 ? rgba(C.gold, 0.5 + 0.3 * band) : rgba("#5a8fa8", 0.75);
      ctx.fill();
      ctx.restore();
    }
  });
  // the four Fibonacci lines
  [23.6, 38.2, 50, 61.8].forEach((p, k) => {
    const u = tw(t, 15.6 + k * 0.25, 16.0 + k * 0.25, ease.outQuart);
    if (u <= 0) return;
    line(ctx, xp(p), base, xp(p), lerp(base, 330, u), C.gold, 2.4, a);
    text(ctx, `${p}%`, xp(p), 312, { family: F.mono, size: 17, weight: 800, color: C.gold, align: "center", alpha: a * u });
  });
  const band = tw(t, 17.0, 17.4);
  if (band > 0) {
    ctx.save();
    ctx.globalAlpha = a * band * 0.08;
    ctx.fillStyle = C.gold;
    ctx.fillRect(xp(15), 340, xp(65) - xp(15), base - 340);
    ctx.restore();
    tag(ctx, `${depthShare(15, 65)} / 200 次回調落在 15%–65%：四條線都在這一段`, W / 2, 270, { align: "center", color: C.gold, solid: true, size: 20, alpha: a * band });
  }
  // four random lines do the same job
  const rl = tw(t, 18.6, 19.0);
  if (rl > 0) {
    RANDOM_LINES.forEach((p, k) => {
      const u = tw(t, 18.6 + k * 0.15, 19.0 + k * 0.15, ease.outQuart);
      line(ctx, xp(p), base, xp(p), lerp(base, 380, u), C.muted, 2, a * 0.8, [6, 6]);
    });
    tag(ctx, `隨便畫四條（${RANDOM_LINES.join("、")}%），一樣碰得到`, W / 2, 860, { align: "center", color: C.muted, size: 18, alpha: a * rl });
  }
  const ft = tw(t, 19.6, 20.0);
  if (ft > 0)
    text(ctx, "真實回測：外匯 40,243 次回調，回調深度在斐波那契比例上沒有特別集中（Forexop）。", W / 2, 920, { family: F.tc, size: 17, color: C.dim, align: "center", alpha: a * ft });
}

function pane(ctx, t, S, rect, cam, o) {
  ctx.save();
  rrect(ctx, rect.x, rect.y, rect.w, rect.h, 22);
  ctx.fillStyle = "rgba(6,11,19,0.94)";
  ctx.fill();
  ctx.clip();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);
  world(ctx, t, S, { pane: true, alpha: o.alpha });
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = o.alpha;
  rrect(ctx, rect.x, rect.y, rect.w, rect.h, 22);
  ctx.strokeStyle = rgba(o.color, 0.7);
  ctx.lineWidth = 2;
  ctx.shadowColor = o.color;
  ctx.shadowBlur = 24;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- lesson
export const lesson = {
  id: "fibonacci",
  title: "黃金口袋，是答案還是巧合？",
  duration: T.end,
  description:
    "從 1,000 到 2,000 畫上斐波那契：200 次模擬回調顯示，四條線放在回調最常見的區段，碰到是必然。它有用的地方是人群的掛單：黃金口袋掛買 600、0.786 下方停損 400。同一個回調演兩次：買單在、吸收 350 就守住；買單先撤，停損一起湧出。",
  note: "斐波那契畫的是人群的地圖，\n答案在成交裡。",
  footer:
    "教學用合成行情：K 線、掛單與停損都是本課設定；200 次回調的分布為示意，真實回測引用 Forexop 對外匯 40,243 次回調的研究。黃金口袋與 0.786 停損是常見做法的示意，不是通用法則。",
  audio: "./motion/audio/fibonacci.m4a",
  music: {
    palette: "tense",
    bpm: 104,
    sections: [
      { t: 0, level: 0 },
      { t: T.swing, level: 1 },
      { t: T.fib, level: 2 },
      { t: T.hist[0], level: 1 },
      { t: T.crowd, level: 2 },
      { t: T.a, level: 3 },
      { t: T.hold, level: 2 },
      { t: T.rew[0], level: 0 },
      { t: T.b, level: 2 },
      { t: 50.0, level: 3 },
      { t: T.split, level: 2 },
      { t: T.final, level: 1 },
      { t: 66.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "一段上漲與斐波那契" },
    { t: T.hist[0], label: "巧合：四條線一定碰得到" },
    { t: T.crowd, label: "人群的地圖" },
    { t: T.a, label: "買單在：守住" },
    { t: T.rew[0], label: "買單撤：加速" },
    { t: T.split, label: "同一條 0.618" },
  ],
  captions: [
    { a: 2.8, b: 6.4, text: "一段上漲：從 1,000 到 2,000。" },
    { a: 6.5, b: 10.3, text: "畫上斐波那契，0.618 在 1,382。" },
    { a: 10.4, b: 15.4, text: "先看 200 次回調，各回到多深。" },
    { a: 15.5, b: 18.5, text: "四條線，剛好放在回調最多的地方。" },
    { a: 18.6, b: 21.4, text: "隨便畫四條，也一樣碰得到。" },
    { a: 21.5, b: 25.9, text: "但很多人看同一組線：買單掛在黃金口袋。" },
    { a: 26.0, b: 31.3, text: "停損，放在 0.786 下面。" },
    { a: 31.4, b: 37.4, text: "這次買單真的在，賣壓被吃掉。" },
    { a: 37.5, b: 43.4, text: "價格守住了。有用的是買單，不是比例。" },
    { a: 43.5, b: 45.4, text: "回到同一個到價前。" },
    { a: 45.5, b: 49.9, text: "這次價格還沒到，買單先撤了。" },
    { a: 50.0, b: 55.9, text: "跌穿黃金口袋，停損一起湧出。" },
    { a: 56.0, b: 62.4, text: "同一條 0.618，兩種結局。" },
    { a: 62.5, b: 68, text: "斐波那契畫的是人群的地圖，答案在成交裡。" },
  ],
  flashes: [
    { t: T.fib + 2.8, amt: 0.15, decay: 8 },
    { t: 17.0, amt: 0.15, decay: 8 },
    { t: 33.4, amt: 0.2, decay: 7 },
    { t: T.rew[1], amt: 0.3, decay: 7 },
    { t: T.stopFire, amt: 0.45, decay: 6, pre: 0.2 },
  ],
  cues: [
    { t: 0.1, kind: "tick", vel: 0.4 },
    { t: 0.4, kind: "whoosh", dur: 0.6 },
    { t: 0.8, kind: "type", n: 12 },
    { t: 2.2, kind: "whoosh", dur: 0.6 },
    ...IMPULSE.map((_, i) => ({ t: T.swing + 0.2 + i * 0.12, kind: "blip", vel: 0.25, freq: 700 + i * 60 })),
    ...LEVELS.map((r, k) => ({ t: T.fib + 0.8 + k * 0.35, kind: "scan", price: fibPrice(r) })),
    { t: T.fib + 2.8, kind: "shimmer" },
    { t: T.hist[0], kind: "whoosh", dur: 0.8 },
    { t: 11.2, kind: "riser", dur: 3.6, vel: 0.5 },
    ...[23.6, 38.2, 50, 61.8].map((_, k) => ({ t: 15.6 + k * 0.25, kind: "stamp", vel: 0.6 })),
    { t: 17.0, kind: "shimmer" },
    ...RANDOM_LINES.map((_, k) => ({ t: 18.6 + k * 0.15, kind: "tick", vel: 0.4 })),
    { t: T.hist[1] - 0.4, kind: "whoosh", dur: 0.8 },
    ...CROWD.map((e) => ({ t: e.t, kind: "rise", dur: 0.4 })),
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ t: T.stops + i * 0.06, kind: "tick", vel: 0.3 })),
    ...PB_T.slice(0, -1).map((t0, i) => ({ t: t0 + 0.3, kind: "fill", price: PULLBACK[i][3], side: "sell", soft: true })),
    ...[31.8, 32.6, 33.4].map((t0) => ({ t: t0, kind: "fill", price: 1370, side: "sell" })),
    { t: 34.2, kind: "rise", dur: 0.6 },
    { t: 35.8, kind: "fill", price: 1500, side: "buy", soft: true },
    { t: 37.4, kind: "fill", price: 1600, side: "buy", soft: true },
    { t: T.rew[0], kind: "drain", dur: 1.8 },
    { t: T.rew[0] + 0.1, kind: "riser", dur: 1.8, vel: 0.5 },
    { t: T.rew[1], kind: "impact", big: true },
    ...[46.2, 46.7, 47.2].map((t0) => ({ t: t0, kind: "drain", dur: 0.5 })),
    { t: 49.0, kind: "riser", dur: 1.0 },
    ...[50.6, 50.8, 51.0].map((t0) => ({ t: t0, kind: "fill", price: 1370, side: "sell", soft: true })),
    { t: T.stopFire, kind: "impact", big: true },
    { t: T.stopFire + 0.05, kind: "alarm" },
    { t: T.stopFire + 0.2, kind: "rumble", dur: 1.8 },
    { t: T.split, kind: "whoosh", dur: 1.0 },
    { t: T.split + 0.6, kind: "shimmer" },
    { t: T.final, kind: "whoosh", dur: 1.2 },
    { t: T.final + 0.6, kind: "swell", dur: 2.4 },
  ],
  draw(ctx, t) {
    const B = t >= T.rew[1];
    const vtA = t < T.rew[0] ? t : lerp(T.rew[0], REW_VT, tw(t, T.rew[0], T.rew[1], ease.inOutCubic));
    const S = B ? snapshot("B", t) : snapshot("A", vtA);
    const cam = mainCam(t);
    const splitIn = tw(t, T.split, T.split + 1.1, ease.inOutQuart);
    const worldA = tw(t, 1.8, 2.8) * (1 - tw(t, T.split, T.split + 0.2));

    if (worldA > 0)
      camera(ctx, cam, () => {
        world(ctx, t, S, { alpha: worldA });
        crowdNotes(ctx, t, S, worldA);
        if (B && t > T.stopFire && t < T.stopFire + 1.4)
          for (let i = 0; i < 18; i++) {
            const u = (t - T.stopFire - rrange(311, i, 0, 0.3)) / 1.1;
            if (u <= 0 || u >= 1) continue;
            const ang = rrange(312, i, -Math.PI, Math.PI);
            const d = u * rrange(313, i, 120, 420);
            bear(ctx, X(14) + Math.cos(ang) * d, PY(STOPS.p) + Math.sin(ang) * d * 0.6, 22 * (1 + u), rnd(315, i) > 0.7 ? RED : C.sell, 0.85 * (1 - u), { rot: u * rrange(314, i, -3, 3) });
          }
      });

    histogram(ctx, t);

    // ---------- rewind
    const rw = tw(t, T.rew[0], T.rew[0] + 0.25) * (1 - tw(t, T.rew[1] - 0.15, T.rew[1] + 0.1));
    if (rw > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "saturation";
      ctx.globalAlpha = 0.85 * rw;
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.7 * rw;
      ctx.fillStyle = "rgba(3,6,11,0.9)";
      ctx.fillRect(0, H / 2 - 150, W, 260);
      ctx.restore();
      text(ctx, "◀◀", W / 2, H / 2 - 90, { family: F.display, size: 80, weight: 700, color: C.gold, align: "center", base: "middle", alpha: rw * (0.6 + 0.4 * Math.sin(t * 16)), glow: 20 });
      text(ctx, "回到同一個到價前", W / 2, H / 2, { family: F.tc, size: 60, weight: 900, color: C.text, align: "center", base: "middle", alpha: rw, glow: 12 });
    }

    // ---------- split
    if (splitIn > 0) {
      const back = tw(t, T.final, T.final + 1.4, ease.inOutQuart);
      const L = { x: 60, y: 200, w: 880, h: 700 };
      const Rr = { x: 980, y: 200, w: 880, h: 700 };
      const full = { x: 0, y: 0, w: W, h: H };
      const mixR = (p, q, u) => ({ x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u), w: lerp(p.w, q.w, u), h: lerp(p.h, q.h, u) });
      const camPane = { x: 900, y: 630, z: 0.62 };
      const camFull = { x: 900, y: 660, z: 0.7 };
      if (back < 1) {
        const cB = { x: lerp(cam.x, camPane.x, splitIn), y: lerp(cam.y, camPane.y, splitIn), z: lerp(cam.z, camPane.z, splitIn) };
        pane(ctx, t, snapshot("B", Math.min(t, 55.4)), mixR(full, Rr, splitIn), cB, { color: RED, alpha: 1 - back });
      }
      const aIn = tw(t, T.split + 0.3, T.split + 1.3, ease.outQuart);
      const rA = back > 0 ? mixR(L, full, back) : mixR({ ...L, x: L.x - 1000 }, L, aIn);
      const cA = back > 0 ? { x: lerp(camPane.x, camFull.x, back), y: lerp(camPane.y, camFull.y, back), z: lerp(camPane.z, camFull.z, back) } : camPane;
      pane(ctx, t, snapshot("A", 39.0), rA, cA, { color: C.buy, alpha: aIn });
      const la = tw(t, T.split + 1.0, T.split + 1.5) * (1 - back);
      if (la > 0) {
        tag(ctx, "A · 買單留著 → 吸收 350，守住", L.x + 24, L.y - 34, { color: C.buy, solid: true, size: 22, alpha: la });
        tag(ctx, "B · 買單先撤 → 停損湧出，跌到 1,150", Rr.x + 24, Rr.y - 34, { color: RED, solid: true, size: 22, alpha: la });
        text(ctx, "同一條 0.618，差別在掛單有沒有留下、有沒有成交。", W / 2, L.y + L.h + 36, { family: F.tc, size: 22, weight: 700, color: C.text, align: "center", alpha: la * tw(t, T.split + 1.6, T.split + 2.0) });
      }
    }

    // ---------- closing
    if (t >= T.final + 0.8) {
      const sc = tw(t, T.final + 0.8, T.final + 1.2);
      ctx.save();
      ctx.globalAlpha = 0.75 * sc;
      const g = ctx.createLinearGradient(0, 60, 0, 330);
      g.addColorStop(0, "rgba(6,11,19,0.95)");
      g.addColorStop(1, "rgba(6,11,19,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 60, W, 270);
      ctx.restore();
      statement(ctx, t, T.final + 0.9, [
        { text: "斐波那契畫的是人群的地圖，", size: 52 },
        { text: "答案在成交裡。", size: 52, color: C.gold },
      ], { y: 150, gap: 74 });
    }

    titleCard(ctx, t, {
      num: "S6",
      kicker: "STORY 06 · FIBONACCI",
      title: "黃金口袋，是答案還是巧合？",
      sub: "斐波那契：人群的地圖",
      titleSize: 72,
      outA: 1.9,
      outB: 2.5,
    });
  },
};
