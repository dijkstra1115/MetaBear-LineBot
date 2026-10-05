// T03 回調縮量，才是上車點 — the third strategy lesson, and the first that trades with
// the trend. One ledger (TREND-PULLBACK-LESSON-PLAN) drives candles, footprints,
// volume, CVD, OI and the impulse profile. Unlike T02 there is no level to defend:
// the evidence is the pullback itself. A: quiet volume, CVD gives back little, OI
// falls; then the first positive-delta bar and a break of the pullback's lower high
// end it (long on the break). The film rewinds to the top. B: loud volume, CVD below
// the impulse start, new shorts, and no turn: someone else took over (no trade).
import {
  C,
  F,
  W,
  H,
  TAU,
  clamp,
  ease,
  lerp,
  prog,
  tw,
  text,
  revealText,
  rgba,
  glow,
  ring,
  burst,
  candle,
  line,
  pulse,
  rrect,
  signed,
  fmt,
  spring,
  rnd,
  rrange,
  noise1,
  neonPath,
  prefs,
} from "../core.js";
import { priceGrid, camera, camPath, statement, tag } from "../kit.js";

// ---------------------------------------------------------------- geometry
const PY = (p) => 560 - (p - 104) * 30;
const X = (i) => 230 + i * 60;
const VB = 1010; // volume baseline
const VS = 0.3;
const CVY = (v) => 1230 - (v + 100) * 0.16;
const OIY = (v) => 1440 - (v - 1000) * 0.25;
const PX = 1330; // impulse profile
const OI_COL = "#c3d0dc"; // OI has no side: a neutral hue, never buy/sell
const RED = "#ff8a7f";

// ---------------------------------------------------------------- the ledger
const sumOf = (at) => Object.values(at).reduce((s, q) => s + q, 0);
/** Eleven bars: a first leg to 104, a pullback to 100, the impulse to 110 (bars 7–10). */
export const HIST = [
  { o: 96, h: 98, l: 96, c: 98, v: 80, d: 30, oi: 20 },
  { o: 98, h: 101, l: 97, c: 100, v: 100, d: 40, oi: 30 },
  { o: 100, h: 103, l: 99, c: 103, v: 120, d: 50, oi: 40 },
  { o: 103, h: 104, l: 102, c: 103, v: 110, d: 20, oi: 20 },
  { o: 103, h: 103, l: 101, c: 101, v: 70, d: -20, oi: -10 },
  { o: 101, h: 102, l: 100, c: 101, v: 60, d: -10, oi: -10 },
  { o: 101, h: 103, l: 100, c: 103, v: 80, d: 30, oi: 10 },
  { o: 103, h: 106, l: 103, c: 105, d: 150, oi: 80, at: { 103: 20, 104: 60, 105: 80, 106: 100 } },
  { o: 105, h: 108, l: 104, c: 108, d: 130, oi: 70, at: { 104: 20, 105: 40, 106: 80, 107: 60, 108: 40 } },
  { o: 108, h: 110, l: 107, c: 110, d: 110, oi: 50, at: { 107: 40, 108: 50, 109: 70, 110: 60 } },
  { o: 110, h: 110, l: 108, c: 109, d: -20, oi: 10, at: { 108: 30, 109: 50, 110: 40 } },
].map((b) => (b.at ? { ...b, v: sumOf(b.at) } : b));
export const OI0 = 1000;
const IMPULSE = [7, 8, 9];
export const IMPULSE_AVG = IMPULSE.reduce((s, i) => s + HIST[i].v, 0) / IMPULSE.length;
export const IMPULSE_DELTA = IMPULSE.reduce((s, i) => s + HIST[i].d, 0);
/** CVD at the close of the bar before the impulse: the line a healthy pullback must hold. */
export const CVD_START = HIST.slice(0, 7).reduce((s, b) => s + b.d, 0);

/** Volume by price over the bars of the impulse (7–10). */
export function impulseProfile(u = () => 1) {
  const prof = {};
  for (let i = 7; i <= 10; i++) for (const [p, q] of Object.entries(HIST[i].at)) prof[p] = (prof[p] ?? 0) + q * u(i);
  return prof;
}
const pocOf = (prof) => Number(Object.keys(prof).reduce((a, p) => (prof[p] > prof[a] ? p : a)));
export const POC = pocOf(impulseProfile());

// Trades: [t, bar, aggressor side, price, qty, ΔOI].
const tr = ([t, bar, side, price, qty, oi]) => ({ t, bar, side, price, qty, oi });
/** Branch A: buyers return near the impulse's POC, then price breaks the pullback's lower high. */
export const TRADES_A = [
  [33.4, 13, "sell", 106, 20, 0],
  [33.8, 13, "sell", 105, 30, 0],
  [34.3, 13, "buy", 105, 40, 10],
  [34.8, 13, "buy", 106, 50, 0],
  [35.3, 13, "buy", 107, 40, 10],
  // bar 14: through the pullback's last high (108)
  [40.6, 14, "buy", 107, 30, 10],
  [41.0, 14, "sell", 107, 10, 0],
  [41.4, 14, "buy", 108, 60, 10],
  [44.4, 14, "buy", 109, 40, 10],
].map(tr);
/** Branch B: a loud pullback; selling never lets up. */
export const TRADES_B = [
  [55.6, 13, "sell", 105, 40, 20],
  [56.0, 13, "sell", 104, 60, 20],
  [56.4, 13, "sell", 103, 70, 20],
  [56.8, 13, "sell", 102, 50, 20],
  [57.1, 13, "buy", 102, 20, 0],
  [57.4, 13, "buy", 103, 30, 0],
].map(tr);
/** Bars with no trade tape: OHLC, volume, delta, ΔOI and the time they form. */
const TOP = { bar: 10, t0: 17.4, t1: 18.8 };
export const PULL_A = [
  { bar: 11, t0: 20.5, t1: 21.8, o: 109, h: 109, l: 107, c: 107, v: 90, d: -40, oi: -20 },
  { bar: 12, t0: 21.8, t1: 23.1, o: 107, h: 108, l: 106, c: 106, v: 70, d: -30, oi: -20 },
];
export const RALLY_A = [
  { bar: 15, t0: 46.0, t1: 47.4, o: 109, h: 112, l: 108, c: 112, v: 220, d: 120, oi: 60 },
  { bar: 16, t0: 47.4, t1: 48.8, o: 112, h: 114, l: 111, c: 113, v: 200, d: 80, oi: 40 },
];
export const PULL_B = [
  { bar: 11, t0: 52.0, t1: 53.4, o: 109, h: 109, l: 106, c: 106, v: 180, d: -140, oi: 60 },
  { bar: 12, t0: 53.4, t1: 54.8, o: 106, h: 107, l: 105, c: 105, v: 220, d: -170, oi: 100 },
];
/** The pullback's last lower high: breaking it ends the pullback (A). */
export const TRIGGER = PULL_A.at(-1).h;
/** Plan levels (lesson settings, not general rules). */
export const PLAN = { entry: TRIGGER, stop: 104, t1: 112, t2: 115, entryT: 41.45 };
const R = (p) => (p - PLAN.entry) / (PLAN.entry - PLAN.stop);
const REW_VT = TOP.t1 + 0.2;

// ---------------------------------------------------------------- timeline
const T = {
  open: 3.3,
  over: 4.4,
  where: 8.5,
  impulse: 13.0,
  event: 17.0,
  pull: 20.5,
  confirm: 23.4,
  turn: 33.4,
  zoom: [35.8, 40.0],
  brk: 41.4,
  execute: 44.2,
  risk: 44.8,
  rally: 46.0,
  target: 47.0,
  rew: [49.6, 51.6],
  fail: 58.0,
  split: 60.0,
  final: 66.0,
  end: 71,
};
const EV_DUR = 2.5;
const EVIDENCE = [
  { t0: 23.6, slot: 0, kicker: "證據 1 / 4 · 量能", hero: "回調量 90、70", sub: `推升均量 ${IMPULSE_AVG}：推升的人在休息`, color: C.buy },
  { t0: 27.0, slot: 1, kicker: "證據 2 / 4 · CVD", hero: "守在 140 之上", sub: `回調吐回 90，推升累積 +${IMPULSE_DELTA}`, color: C.buy },
  { t0: 30.4, slot: 2, kicker: "證據 3 / 4 · OI", hero: "OI −40", sub: "價跌 OI 降：獲利了結，沒有新空單", color: OI_COL },
  { t0: 41.6, slot: 3, kicker: "證據 4 / 4 · 轉強", hero: `Δ 轉正、破 ${TRIGGER}`, sub: "回調的高點一路降低，現在被突破", color: C.buy },
];
const LAND = EVIDENCE.map((e) => e.t0 + EV_DUR);
const SLOT_NAMES = ["量能", "CVD", "OI", "轉強"];
/** B: each check fails as its evidence appears on the chart. */
const FAIL_T = [54.9, 56.05, 55.3, 57.7];

// ---------------------------------------------------------------- market state
function marketTimeA(t) {
  if (t < T.rew[0]) return t;
  return lerp(T.rew[0], REW_VT, tw(t, T.rew[0], T.rew[1], ease.inOutCubic));
}

function barFromTrades(list, vt, i) {
  const trades = list.filter((x) => x.bar === i && x.t <= vt);
  if (!trades.length) return null;
  const ps = trades.map((x) => x.price);
  const buy = trades.filter((x) => x.side === "buy").reduce((s, x) => s + x.qty, 0);
  const sell = trades.filter((x) => x.side === "sell").reduce((s, x) => s + x.qty, 0);
  const vis = trades.reduce((s, x) => s + x.qty * ease.outCubic(prog(vt, x.t, x.t + 0.35)), 0);
  return { o: ps[0], h: Math.max(...ps), l: Math.min(...ps), c: ps.at(-1), v: buy + sell, d: buy - sell, vis, live: true };
}

/** A summary bar forming along o → extreme → extreme → c. */
function barFromSummary(b, vt) {
  if (vt < b.t0) return null;
  const u = prog(vt, b.t0, b.t1);
  const up = b.c >= b.o;
  const path = up ? [b.o, b.l, b.h, b.c] : [b.o, b.h, b.l, b.c];
  const seg = Math.min(2, Math.floor(u * 3));
  const f = u * 3 - seg;
  const last = lerp(path[seg], path[seg + 1], ease.inOutQuad(clamp(f)));
  const seen = [...path.slice(0, seg + 1), last];
  const done = u >= 1;
  return {
    o: b.o,
    h: done ? b.h : Math.max(...seen),
    l: done ? b.l : Math.min(...seen),
    c: done ? b.c : last,
    v: done ? b.v : 0,
    d: b.d,
    vis: b.v * ease.outCubic(u),
    live: true,
    pending: !done,
  };
}

/** Everything the chart needs at market time vt of a branch. */
function snapshot(branch, vt) {
  const A = branch === "A";
  const trades = A ? TRADES_A : TRADES_B;
  const sums = A ? [...PULL_A, ...RALLY_A] : PULL_B;
  const bars = [];
  let cvd = 0;
  let oi = OI0;
  const cvdPts = [[X(0) - 26, 0]];
  const oiPts = [[X(0) - 26, OI0]];
  const exact = { cvd: 0, oi: OI0 };
  let live = 9;
  let last = HIST[9].c;
  const lastBar = A ? 16 : 13;
  for (let i = 0; i <= lastBar; i++) {
    const sum = i < 10 ? null : i === 10 ? { ...HIST[10], ...TOP } : sums.find((b) => b.bar === i);
    let b;
    if (i < 10) b = { ...HIST[i], vis: HIST[i].v };
    else if (sum) b = barFromSummary(sum, vt);
    else b = barFromTrades(trades, vt, i);
    bars.push(b);
    if (!b) continue;
    if (i >= 10) {
      live = i;
      last = b.c;
    }
    if (i < 10) {
      cvd += b.d;
      oi += b.oi;
      exact.cvd = cvd;
      exact.oi = oi;
      cvdPts.push([X(i) + 22, cvd]);
      oiPts.push([X(i) + 22, oi]);
    } else if (sum) {
      const u = prog(vt, sum.t0, sum.t1);
      cvd += sum.d * u;
      oi += sum.oi * u;
      if (u >= 1) {
        exact.cvd += sum.d;
        exact.oi += sum.oi;
      }
      cvdPts.push([X(i) - 22 + 44 * u, cvd]);
      oiPts.push([X(i) - 22 + 44 * u, oi]);
    } else {
      const all = trades.filter((y) => y.bar === i);
      all
        .filter((x) => x.t <= vt)
        .forEach((x, k) => {
          const u = ease.outCubic(prog(vt, x.t, x.t + 0.3));
          const dd = x.side === "buy" ? x.qty : -x.qty;
          cvd += dd * u;
          oi += x.oi * u;
          exact.cvd += dd;
          exact.oi += x.oi;
          const px = X(i) - 22 + (44 * (k + 1)) / Math.max(4, all.length);
          cvdPts.push([px, cvd]);
          oiPts.push([px, oi]);
        });
    }
  }
  return { branch, vt, bars, cvd, oi, exact, cvdPts, oiPts, live, last };
}

/** Footprint of one bar: price → { bid (sold into), ask (bought) }. */
export function footprint(trades, bar, vt = Infinity) {
  const fp = {};
  for (const x of trades)
    if (x.bar === bar && x.t <= vt) {
      fp[x.price] ??= { bid: 0, ask: 0 };
      fp[x.price][x.side === "sell" ? "bid" : "ask"] += x.qty;
    }
  return fp;
}

// ---------------------------------------------------------------- focus (the turn bar, unfolded)
function focus(t) {
  const [a, b] = T.zoom;
  return {
    bar: 13,
    spread: tw(t, a, a + 0.9) * (1 - tw(t, b - 0.8, b)),
    unfold: tw(t, a + 0.5, a + 1.1) * (1 - tw(t, b - 0.8, b - 0.4)),
  };
}
function spreadX(i, f) {
  if (!f || i === f.bar) return X(i);
  return X(i) + Math.sign(i - f.bar) * 170 * f.spread;
}

// ---------------------------------------------------------------- camera
const MAIN_KEYS = [
  { t: 0, x: 880, y: 760, z: 0.3 },
  { t: T.open, x: 880, y: 760, z: 0.3 },
  { t: 4.9, x: 920, y: 760, z: 0.72 },
  { t: T.where, x: 920, y: 760, z: 0.73 },
  { t: 9.4, x: 980, y: 600, z: 0.98 },
  { t: 12.8, x: 980, y: 600, z: 1.0 },
  { t: 13.8, x: 900, y: 860, z: 0.72 },
  { t: 16.6, x: 900, y: 860, z: 0.73 },
  { t: 17.6, x: 940, y: 560, z: 1.05 },
  { t: 23.1, x: 960, y: 580, z: 1.05 },
  { t: 23.8, x: 960, y: 720, z: 0.95 },
  { t: 26.2, x: 960, y: 720, z: 0.95 },
  { t: 26.9, x: 960, y: 1080, z: 1.0 },
  { t: 29.7, x: 960, y: 1080, z: 1.0 },
  { t: 30.3, x: 960, y: 1300, z: 1.0 },
  { t: 33.0, x: 960, y: 1300, z: 1.0 },
  { t: 33.8, x: 970, y: 540, z: 1.15 },
  { t: 35.5, x: 980, y: 540, z: 1.16 },
  { t: 36.5, x: X(13), y: PY(106), z: 2.4 },
  { t: 39.3, x: X(13), y: PY(106), z: 2.5 },
  { t: 40.2, x: 990, y: 540, z: 1.1 },
  { t: 41.5, x: 990, y: 540, z: 1.1 },
  { t: 44.6, x: 1000, y: 520, z: 0.95 },
  { t: 48.8, x: 1000, y: 500, z: 0.92 },
  { t: T.rew[0], x: 1000, y: 500, z: 0.92 },
  { t: 51.3, x: 950, y: 780, z: 0.78 },
  { t: T.split, x: 950, y: 800, z: 0.77 },
];
function heroAmt(t, t0) {
  return tw(t, t0 + 0.1, t0 + 0.5) * (1 - tw(t, t0 + 1.8, t0 + 2.2));
}
function mainCam(t) {
  const cam = camPath(t, MAIN_KEYS);
  const hero = EVIDENCE.reduce((s, e) => s + heroAmt(t, e.t0), 0);
  cam.z *= 1 - 0.07 * clamp(hero);
  if (!prefs.reduced) cam.rot = 0.004 * noise1(t * 0.35, 4);
  return cam;
}
const toScreen = (cam, x, y) => [W / 2 + (x - cam.x) * cam.z, H / 2 + (y - cam.y) * cam.z];

// ---------------------------------------------------------------- depth helpers
const FOCAL = 700;
const depthScale = (z) => FOCAL / Math.max(40, FOCAL + z);

function warp(ctx, t, a) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const speed = 900 + 2600 * tw(t, 2.6, 3.9, ease.inCubic);
  for (let i = 0; i < 150; i++) {
    const ang = rnd(221, i) * TAU;
    const r0 = rrange(222, i, 40, 900);
    const span = 3000;
    const z = span - ((rnd(223, i) * span + t * speed) % span);
    const z2 = Math.min(span, z + 60 + speed * 0.05);
    const s1 = depthScale(z - 400);
    const s2 = depthScale(z2 - 400);
    ctx.strokeStyle = rgba(rnd(224, i) > 0.82 ? C.gold : C.teal, a * clamp(1 - z / span) * 0.8);
    ctx.lineWidth = 1 + 2.4 * clamp(s1 - 0.5);
    ctx.beginPath();
    ctx.moveTo(W / 2 + Math.cos(ang) * r0 * s1, H / 2 + Math.sin(ang) * r0 * s1);
    ctx.lineTo(W / 2 + Math.cos(ang) * r0 * s2, H / 2 + Math.sin(ang) * r0 * s2);
    ctx.stroke();
  }
  ctx.restore();
}

function dust(ctx, t, cam, a) {
  if (a <= 0) return;
  for (let i = 0; i < 46; i++) {
    const depth = rrange(231, i, 0.3, 1.8);
    const px = rnd(232, i) * (W + 400) - 200 - (cam.x - 900) * depth * 0.55 + t * rrange(233, i, -6, 6);
    const py = rnd(234, i) * (H + 400) - 200 - (cam.y - 760) * depth * 0.55 - t * rrange(235, i, 2, 9);
    const x = ((px % (W + 400)) + W + 400) % (W + 400) - 200;
    const y = ((py % (H + 400)) + H + 400) % (H + 400) - 200;
    glow(ctx, x, y, (depth > 1.2 ? 9 : 4) * depth * (0.7 + cam.z * 0.3), rnd(236, i) > 0.75 ? C.gold : C.teal, 0.22 * a * (depth > 1.3 ? 0.7 : 1));
  }
}

// ---------------------------------------------------------------- the strategy rail
const STAGES = [
  { k: "地點", w: 150 },
  { k: "事件", w: 150 },
  { k: "確認", w: 344 },
  { k: "執行", w: 150 },
];
const RAIL_Y = 74;
const RAIL_H = 58;
const RAIL = (() => {
  const gap = 24;
  const total = STAGES.reduce((s, x) => s + x.w, 0) + gap * 3;
  let x = (W - total) / 2;
  return STAGES.map((s) => {
    const box = { ...s, x };
    x += s.w + gap;
    return box;
  });
})();
const slotXY = (i) => [RAIL[2].x + 118 + i * 50, RAIL_Y];

function stageState(t, i) {
  if (t >= T.final) {
    const on = tw(t, T.final + 1.0 + i * 0.22, T.final + 1.3 + i * 0.22);
    return { active: on, done: on, fail: 0 };
  }
  if (t < T.rew[1]) {
    const act = [T.where, T.event, T.confirm, T.execute][i];
    const done = [T.event, T.confirm, LAND[3], T.target][i];
    const clear = t >= T.rew[0] && i >= 2 ? tw(t, T.rew[0], T.rew[0] + 0.8) : 0;
    return { active: tw(t, act, act + 0.4) * (1 - clear), done: tw(t, done, done + 0.3) * (1 - clear), fail: 0 };
  }
  if (i < 2) return { active: 1, done: 1, fail: 0 };
  if (i === 2) return { active: 1, done: 0, fail: tw(t, T.fail, T.fail + 0.25) };
  return { active: 0, done: 0, fail: tw(t, T.fail + 0.15, T.fail + 0.4) };
}

function slotState(t, i) {
  if (t >= T.final) {
    const at = T.final + 1.4 + i * 0.12;
    return { ok: tw(t, at, at + 0.2), no: 0, pop: pulse(t, at, 5), at };
  }
  if (t < T.rew[0]) return { ok: tw(t, LAND[i], LAND[i] + 0.25), no: 0, pop: pulse(t, LAND[i], 5), at: LAND[i] };
  if (t < T.rew[1]) return { ok: 1 - tw(t, T.rew[0] + 0.2 + i * 0.12, T.rew[0] + 0.5 + i * 0.12), no: 0, pop: 0, at: -9 };
  return { ok: 0, no: tw(t, FAIL_T[i], FAIL_T[i] + 0.2), pop: pulse(t, FAIL_T[i], 5), at: FAIL_T[i] };
}

function checkGlyph(ctx, x, y, s, color, a) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.4 * s;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x - 7 * s, y);
  ctx.lineTo(x - 2 * s, y + 5 * s);
  ctx.lineTo(x + 8 * s, y - 6 * s);
  ctx.stroke();
  ctx.restore();
}
function crossGlyph(ctx, x, y, s, color, a) {
  if (a <= 0) return;
  line(ctx, x - 6 * s, y - 6 * s, x + 6 * s, y + 6 * s, color, 3.4 * s, a);
  line(ctx, x + 6 * s, y - 6 * s, x - 6 * s, y + 6 * s, color, 3.4 * s, a);
}

function stageWordFly(t, i) {
  const t0 = 0.3 + i * 0.26;
  const z = lerp(2600, 0, ease.outCubic(prog(t, t0, t0 + 0.75))) - 180 * Math.sin(Math.PI * prog(t, t0 + 0.45, t0 + 0.95));
  return { z, a: tw(t, t0, t0 + 0.2) };
}

function rail(ctx, t, alpha) {
  if (alpha <= 0) return;
  const frame = tw(t, 1.6, 2.4);
  RAIL.forEach((s, i) => {
    const st = stageState(t, i);
    const fly = stageWordFly(t, i);
    if (fly.a <= 0) return;
    const busy = st.active > 0 && st.done < 1 && st.fail < 1;
    if (frame > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * frame;
      rrect(ctx, s.x, RAIL_Y - RAIL_H / 2, s.w, RAIL_H, 12);
      ctx.fillStyle = rgba(C.panel, 0.72 + 0.1 * st.active);
      ctx.fill();
      const col = st.fail > 0.5 ? RED : st.done > 0.5 ? C.buy : st.active > 0 ? C.gold : C.line;
      ctx.strokeStyle = rgba(col, 0.35 + 0.55 * Math.max(st.active, st.done, st.fail));
      ctx.lineWidth = 1.6;
      if (busy) {
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 14 * st.active * (0.7 + 0.3 * Math.sin(t * 5));
      }
      ctx.stroke();
      ctx.restore();
      if (busy) {
        const u = (t * 0.6) % 1;
        line(ctx, s.x + 14, RAIL_Y + RAIL_H / 2 - 5, s.x + 14 + (s.w - 28) * st.active, RAIL_Y + RAIL_H / 2 - 5, C.gold, 2, 0.5 * alpha);
        glow(ctx, s.x + 14 + (s.w - 28) * u, RAIL_Y + RAIL_H / 2 - 5, 18, C.gold, 0.6 * alpha * st.active);
      }
    }
    const sc = depthScale(fly.z);
    const tx = s.x + 44;
    const x = lerp(W / 2, tx, clamp(sc)) + (tx - W / 2) * Math.max(0, sc - 1) * 0.15;
    const y = lerp(H / 2 + 40, RAIL_Y, clamp(sc));
    const size = 26 * Math.max(sc, 0.05) * lerp(3.2, 1, clamp(sc));
    const col = st.fail > 0.5 ? RED : st.done > 0.5 ? C.buy : st.active > 0 ? C.text : C.muted;
    ctx.save();
    if (fly.z < -20) ctx.filter = `blur(${Math.min(8, -fly.z / 30)}px)`;
    text(ctx, s.k, x, y + 1, { family: F.tc, size, weight: 900, color: col, base: "middle", alpha: alpha * fly.a, glow: st.active ? 10 : 0, glowColor: col });
    ctx.restore();
    if (frame > 0) {
      text(ctx, `0${i + 1}`, s.x + 14, RAIL_Y - 13, { family: F.mono, size: 12, weight: 700, color: C.dim, alpha: alpha * frame, ls: 2 });
      if (st.done > 0) checkGlyph(ctx, s.x + s.w - 24, RAIL_Y, 1, C.buy, alpha * st.done);
      if (st.fail > 0) crossGlyph(ctx, s.x + s.w - 24, RAIL_Y, 1, RED, alpha * st.fail);
    }
  });
  if (frame <= 0) return;
  SLOT_NAMES.forEach((name, i) => {
    const [x, y] = slotXY(i);
    const s = slotState(t, i);
    const a = alpha * frame;
    const r = 17 * (1 + 0.35 * s.pop);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(x, y - 4, r, 0, TAU);
    ctx.fillStyle = s.ok > 0 ? rgba(C.buy, 0.18 * s.ok) : s.no > 0 ? rgba(RED, 0.16 * s.no) : rgba(C.ink, 0.8);
    ctx.fill();
    ctx.strokeStyle = s.ok > 0.5 ? C.buy : s.no > 0.5 ? RED : rgba(C.muted, 0.45);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
    ring(ctx, x, y - 4, t, s.at, { r0: 17, r1: 54, color: s.no > 0 ? RED : C.buy, dur: 0.6 });
    checkGlyph(ctx, x, y - 4, 1.05, C.buy, a * s.ok);
    crossGlyph(ctx, x, y - 4, 0.95, RED, a * s.no);
    text(ctx, name, x, y + 22, { family: F.tc, size: 12, weight: 700, color: s.ok > 0.5 ? C.buy : s.no > 0.5 ? RED : C.muted, align: "center", base: "middle", alpha: a * 0.95 });
  });
}

// ---------------------------------------------------------------- evidence cards
function evidencePose(t, e, from) {
  const u = t - e.t0;
  const [sx, sy] = slotXY(e.slot);
  const cx = W / 2;
  const cy = H / 2 + 30;
  if (u < 0.6) {
    const p = ease.outCubic(clamp(u / 0.6));
    const over = Math.sin(Math.PI * clamp(u / 0.6)) * 0.9;
    return { x: lerp(from[0], cx, p), y: lerp(from[1], cy, p), s: lerp(0.3, 1.9, p) + over, blur: over * 7, rot: (1 - p) * -0.08 };
  }
  if (u < 1.85) return { x: cx, y: cy, s: 1.9 + 0.08 * ease.inOutQuad(clamp((u - 0.6) / 1.25)), blur: 0, rot: 0 };
  const p = ease.inExpo(clamp((u - 1.85) / (EV_DUR - 1.85)));
  return { x: lerp(cx, sx, p), y: lerp(cy, sy - 4, p), s: lerp(1.98, 0.09, p), blur: p * 4, rot: p * 0.12 };
}

function heroCard(ctx, pose, e, a) {
  if (a <= 0 || pose.s <= 0.01) return;
  const w = 440;
  const h = 170;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot);
  ctx.scale(pose.s, pose.s);
  if (pose.blur > 0.4) ctx.filter = `blur(${pose.blur / pose.s}px)`;
  ctx.globalAlpha *= a;
  glow(ctx, 0, 0, w * 0.75, e.color, 0.35);
  rrect(ctx, -w / 2, -h / 2, w, h, 20);
  ctx.fillStyle = "rgba(8,14,24,0.92)";
  ctx.fill();
  ctx.strokeStyle = rgba(e.color, 0.8);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = e.color;
  ctx.fillRect(-w / 2, -h / 2 + 26, 5, h - 52);
  ctx.restore();
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot);
  ctx.scale(pose.s, pose.s);
  if (pose.blur > 0.4) ctx.filter = `blur(${pose.blur / pose.s}px)`;
  text(ctx, e.kicker, -w / 2 + 30, -h / 2 + 34, { family: F.tc, size: 15, weight: 700, color: C.gold, ls: 2, base: "middle", alpha: a });
  text(ctx, e.hero, -w / 2 + 28, 6, { family: F.tc, size: 50, weight: 900, color: C.text, base: "middle", alpha: a, glow: 14, glowColor: e.color });
  text(ctx, e.sub, -w / 2 + 30, h / 2 - 30, { family: F.tc, size: 19, weight: 500, color: C.muted, base: "middle", alpha: a });
  ctx.restore();
}

function evidence(ctx, t, e, from) {
  const u = t - e.t0;
  if (u < 0 || u > EV_DUR + 0.05) return;
  for (let k = 4; k >= 1; k--) {
    const pt = evidencePose(t - k * 0.028, e, from);
    if ((u < 0.6 || u > 1.85) && t - k * 0.028 > e.t0) heroCard(ctx, pt, e, 0.14 * (1 - k / 5));
  }
  heroCard(ctx, evidencePose(t, e, from), e, 1 - tw(u, EV_DUR - 0.12, EV_DUR));
  if (u > EV_DUR - 0.2) burst(ctx, ...slotXY(e.slot), t, e.t0 + EV_DUR, { n: 14, speed: 240, color: C.buy, seed: e.slot + 25, flare: 60 });
}

// ---------------------------------------------------------------- the chart (world space)
function world(ctx, t, S, o = {}) {
  const a = o.alpha ?? 1;
  const main = !o.pane;
  const vt = S.vt;
  const A = S.branch === "A";
  const fo = main && A ? focus(t) : null;
  const unfold = fo ? fo.unfold : 0;
  const intro = main ? tw(t, 3.6, 4.5) : 1;
  // the profile and right-hand axis step aside while the risk box needs the space
  const planFade = A ? tw(vt, T.risk, T.risk + 0.6) : 0;

  priceGrid(ctx, t, { alpha: 0.28 * a, step: 30, oy: PY(104) });

  // ---- impulse shading
  const shade = main ? tw(t, T.impulse, T.impulse + 0.6) * (1 - tw(t, T.event + 1, T.event + 1.6)) : 0;
  if (shade > 0) {
    ctx.save();
    ctx.globalAlpha = a * shade * 0.08;
    ctx.fillStyle = C.buy;
    ctx.fillRect(X(7) - 30, PY(112), X(9) - X(7) + 60, VB - PY(112));
    ctx.restore();
    tag(ctx, "推升段", X(7) - 26, PY(111.6), { color: C.buy, size: 18, alpha: a * shade });
  }

  // ---- impulse profile (grows with the top bar) and POC
  const grow = main ? tw(t, T.where + 0.3, T.where + 1.8) : 1;
  const prof = impulseProfile((i) => (i < 10 ? 1 : prog(A ? Math.min(vt, T.rew[0]) : vt, TOP.t0, TOP.t1)));
  const pf = (o.profile ?? 1) * (1 - 0.8 * unfold) * (1 - 0.8 * planFade);
  if (grow > 0) {
    for (const [ps, v] of Object.entries(prof)) {
      const p = Number(ps);
      if (v <= 0) continue;
      const g = ease.outCubic(prog(grow, (110 - p) * 0.06, (110 - p) * 0.06 + 0.58));
      ctx.save();
      ctx.globalAlpha = a * pf;
      rrect(ctx, PX, PY(p) - 11, Math.max(3, (v / 180) * 220 * g), 22, 4);
      ctx.fillStyle = p === POC ? rgba(C.gold, 0.85) : rgba("#5a8fa8", 0.55);
      ctx.fill();
      ctx.restore();
    }
    text(ctx, "推升段成交分布", PX, PY(111.4), { family: F.tc, size: 20, weight: 800, color: C.muted, alpha: a * grow * pf * (1 - planFade) });
    text(ctx, `POC ${POC}`, PX + 232, PY(POC) + 1, { family: F.mono, size: 18, weight: 700, color: C.gold, base: "middle", alpha: a * grow * pf });
  }

  // ---- price labels
  for (let p = 95; p <= 115; p++) {
    const key = p === POC || p === S.last;
    text(ctx, String(p), X(0) - 56, PY(p) + 1, { family: F.mono, size: 16, weight: p === S.last ? 800 : 500, color: p === S.last ? C.gold : key ? C.text : C.dim, align: "right", base: "middle", alpha: a * intro * (key ? 0.95 : 0.6) });
  }
  for (let p = 95; p <= 115; p++)
    text(ctx, String(p), PX - 26, PY(p) + 1, {
      family: F.mono,
      size: 14,
      weight: p === S.last ? 800 : 500,
      color: p === S.last ? C.gold : C.dim,
      align: "right",
      base: "middle",
      alpha: a * intro * (p === S.last ? 0.95 : 0.5) * (1 - unfold) * (1 - planFade),
    });

  // ---- the location: where the impulse traded most, as a soft band (not a line to defend)
  const loc = main ? tw(t, T.where + 1.8, T.where + 2.6) : 1;
  if (loc > 0) {
    const x0 = X(7) - 20;
    const x1 = lerp(x0, PX - 40, main ? tw(t, T.where + 1.8, T.where + 2.8, ease.outQuart) : 1);
    const fade = (1 - 0.7 * unfold) * (1 - 0.6 * planFade);
    ctx.save();
    ctx.globalAlpha = a * loc * fade * 0.09;
    ctx.fillStyle = C.gold;
    ctx.fillRect(x0, PY(POC) - 15, x1 - x0, 30);
    ctx.restore();
    const lb = (main ? tw(t, T.where + 2.4, T.where + 2.8) * (1 - tw(t, T.event, T.event + 0.5)) : 0) * fade;
    if (lb > 0) tag(ctx, `推升段成交中心 ${POC}：回調可能在這附近結束`, X(11) - 40, PY(POC) - 34, { color: C.gold, size: 18, alpha: a * lb });
  }

  // ---- trend structure
  const hh = main ? tw(t, 5.6, 6.2) * (1 - tw(t, T.where, T.where + 0.5)) : 0;
  if (hh > 0) {
    tag(ctx, "高點 104", X(3), PY(105.4), { align: "center", color: C.muted, size: 16, alpha: a * hh });
    tag(ctx, "低點墊高 100", X(5), PY(98.6), { align: "center", color: C.buy, size: 16, alpha: a * hh });
    tag(ctx, "新高 110", X(9), PY(111.4), { align: "center", color: C.buy, size: 16, alpha: a * hh });
  }

  // ---- the pullback's falling highs and the trigger
  structure(ctx, t, S, a * (1 - unfold), main);

  // ---- candles, volume, delta
  S.bars.forEach((b, i) => {
    if (!b) return;
    const x = spreadX(i, fo);
    const pop = main && i < 10 ? tw(t, 4.0 + i * 0.08, 4.4 + i * 0.08) : 1;
    const isF = fo && fo.bar === i;
    const focusDim = fo && !isF ? 1 - 0.55 * fo.spread : 1;
    const isLive = i === S.live && i >= 10;
    candle(ctx, x, 32 * (isF ? 1 - fo.unfold * 0.75 : 1), PY(b.o), PY(b.h), PY(b.l), PY(b.c), { alpha: a * pop * focusDim, wickWidth: 3, minBody: 5, glow: isLive && main ? 16 : 0 });
    const col = b.c >= b.o ? C.buy : C.sell;
    ctx.save();
    ctx.globalAlpha = a * pop * focusDim;
    rrect(ctx, x - 16, VB - b.vis * VS, 32, b.vis * VS, 4);
    ctx.fillStyle = rgba(col, 0.55);
    ctx.fill();
    ctx.restore();
    if (b.v > 0 && i >= 7)
      text(ctx, String(b.v), x, VB - b.vis * VS - 12, { family: F.display, size: 19, weight: 700, color: C.text, align: "center", alpha: a * pop * focusDim * 0.9 });
    if (!b.pending) {
      const flip = A && i === 13 ? pulse(t, 35.4, 2) : 0;
      text(ctx, signed(b.d), x, VB + 22, { family: F.mono, size: 14 + 8 * flip, weight: 700, color: b.d >= 0 ? C.buy : C.sell, align: "center", alpha: a * pop * focusDim * (i >= 7 ? 0.9 : 0.55), glow: 14 * flip });
    }
  });
  text(ctx, "量 / Δ", X(0) - 56, VB - 10, { family: F.tc, size: 18, weight: 700, color: C.muted, align: "right", alpha: a * intro });
  const avg = main ? tw(t, T.impulse + 0.6, T.impulse + 1.4, ease.outQuart) : 1;
  if (avg > 0) {
    const y = VB - IMPULSE_AVG * VS;
    line(ctx, X(7) - 24, y, lerp(X(7) - 24, X(16) + 30, avg), y, C.gold, 1.6, a * 0.7, [8, 6]);
    text(ctx, `推升均量 ${IMPULSE_AVG}`, X(16) + 36, y + 1, { family: F.tc, size: 15, weight: 800, color: C.gold, base: "middle", alpha: a * avg * 0.9 * (1 - unfold) });
  }

  // ---- live price marker
  if (S.live >= 10 && unfold < 0.05) {
    const y = PY(S.last);
    const xl = spreadX(S.live, fo) + 20;
    line(ctx, xl, y, xl + 64, y, C.gold, 2, a * 0.8);
    glow(ctx, xl, y, 20, C.gold, a * 0.6);
  }

  // ---- CVD panel
  const pa = main ? tw(t, 5.0, 5.8) : 1;
  if (pa > 0) {
    panelBox(ctx, CVY(880) - 26, CVY(-100) + 16, "CVD 累計差額（隻）", C.buy, a * pa);
    const draw = main ? tw(t, 5.2, 7.0, ease.inOutQuad) : 1;
    const pts = S.cvdPts.map(([x, v]) => [x, CVY(v)]);
    const n = Math.max(2, Math.ceil(pts.length * draw));
    const below = S.cvd < CVD_START;
    neonPath(ctx, pts.slice(0, n), C.buy, 2.6, a * pa, 0.9);
    const k = S.cvdPts.findIndex(([x, v], j) => j < n && x > X(9) && v < CVD_START);
    if (k > 0) neonPath(ctx, pts.slice(k - 1, n), RED, 3, a * pa, 1.2);
    const end = pts[n - 1];
    glow(ctx, end[0], end[1], 22, below ? RED : C.buy, a * pa * 0.8);
    text(ctx, fmt(S.exact.cvd), end[0] + 16, end[1] - 14, { family: F.display, size: 24, weight: 700, color: below ? RED : C.buy, alpha: a * pa * draw });
    const sl = main ? tw(t, T.impulse + 0.8, T.impulse + 1.6, ease.outQuart) : 1;
    if (sl > 0) {
      line(ctx, X(6) + 22, CVY(CVD_START), lerp(X(6) + 22, X(16) + 30, sl), CVY(CVD_START), C.gold, 1.6, a * 0.8, [8, 6]);
      text(ctx, `推升起點 ${CVD_START}`, X(16) + 36, CVY(CVD_START) + 1, { family: F.tc, size: 15, weight: 800, color: C.gold, base: "middle", alpha: a * sl });
    }
  }
  // ---- OI panel
  if (pa > 0) {
    panelBox(ctx, OIY(1580) - 26, OIY(980) + 16, "未平倉量 OI（隻）", OI_COL, a * pa);
    const draw = main ? tw(t, 5.2, 7.0, ease.inOutQuad) : 1;
    const pts = S.oiPts.map(([x, v]) => [x, OIY(v)]);
    const n = Math.max(2, Math.ceil(pts.length * draw));
    neonPath(ctx, pts.slice(0, n), OI_COL, 2.6, a * pa, 0.9);
    const end = pts[n - 1];
    glow(ctx, end[0], end[1], 22, OI_COL, a * pa * 0.8);
    text(ctx, fmt(S.exact.oi), end[0] + 16, end[1] - 14, { family: F.display, size: 24, weight: 700, color: OI_COL, alpha: a * pa * draw });
    if (main) {
      const up = tw(t, T.impulse + 1.0, T.impulse + 1.5) * (1 - tw(t, T.event, T.event + 0.5));
      if (up > 0) {
        neonPath(ctx, pts.filter(([x]) => x >= X(6) && x <= X(9) + 30), C.buy, 3.4, a * up, 1.3);
        tag(ctx, "推升段 OI +200：價漲 OI 漲＝新多單", X(1), OIY(1340), { color: C.buy, size: 18, alpha: a * up });
      }
    }
  }
}

/** The pullback's highs, each lower than the last; A breaks the last one, B never does. */
function structure(ctx, t, S, a, main) {
  const A = S.branch === "A";
  const highs = [10, 11, 12].map((i) => S.bars[i] && !S.bars[i].pending ? [X(i), PY(S.bars[i].h), S.bars[i].h] : null).filter(Boolean);
  if (highs.length < 3) return;
  const at = A ? PULL_A.at(-1).t1 : PULL_B.at(-1).t1;
  const u = tw(S.vt, at, at + 0.6, ease.outQuart);
  if (u <= 0) return;
  const broken = A && S.vt >= T.brk;
  const fade = A ? 1 - tw(S.vt, T.risk, T.risk + 0.6) : 1;
  const pts = highs.map(([x, y]) => [x, y - 12]);
  neonPath(ctx, pts.slice(0, Math.max(2, Math.ceil(pts.length * u))), broken ? C.muted : RED, 2, a * 0.8 * fade, 0.8);
  for (const [x, y] of pts) glow(ctx, x, y, 12, RED, a * u * 0.7 * fade);
  const lbl = `回調的高點：${highs.map((h) => h[2]).join(" → ")}`;
  tag(ctx, lbl, X(10) - 10, PY(highs[0][2]) - 44, { color: RED, size: 16, alpha: a * u * fade * (broken ? 0.5 : 1) });
  if (!A) return;
  // the trigger: the last lower high, extended to the right
  const x0 = X(12);
  const x1 = lerp(x0, X(15) + 10, u);
  line(ctx, x0, PY(TRIGGER), x1, PY(TRIGGER), broken ? C.buy : C.gold, 2, a * fade, [8, 6]);
  tag(ctx, broken ? `突破 ${TRIGGER}：回調結束` : `突破 ${TRIGGER} ＝ 轉強`, X(13) + 40, PY(TRIGGER + 0.95), { color: broken ? C.buy : C.gold, size: 16, alpha: a * u * fade, solid: broken && main && pulse(t, T.brk, 2) > 0.3 });
  if (main) ring(ctx, X(14), PY(TRIGGER), t, T.brk, { r1: 200, color: C.buy, w: 4 });
}

function panelBox(ctx, top, bottom, title, col, a) {
  ctx.save();
  ctx.globalAlpha = a;
  rrect(ctx, X(0) - 40, top, X(16) - X(0) + 230, bottom - top, 14);
  ctx.fillStyle = rgba(C.ink, 0.55);
  ctx.fill();
  ctx.strokeStyle = rgba(C.line, 0.9);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  text(ctx, title, X(0) - 24, top + 26, { family: F.tc, size: 17, weight: 800, color: col, alpha: a });
}

/** A, bar 14 up close: the first bar of the pullback where buying beats selling. */
function turnView(ctx, t, a) {
  const f = focus(t);
  if (f.unfold <= 0) return;
  const fp = footprint(TRADES_A, 13);
  const FW = 86 * f.unfold;
  const x = X(13);
  const al = a * f.unfold;
  text(ctx, "第 14 根足跡 · 回調以來第一根買方多", x, PY(108.6), { family: F.tc, size: 15, weight: 800, color: C.gold, align: "center", alpha: al, ls: 1 });
  text(ctx, "主動賣", x - 16 - FW / 2, PY(107.9), { family: F.tc, size: 13, weight: 700, color: C.sell, align: "center", alpha: al });
  text(ctx, "主動買", x + 16 + FW / 2, PY(107.9), { family: F.tc, size: 13, weight: 700, color: C.buy, align: "center", alpha: al });
  const rows = [107, 106, 105];
  rows.forEach((p, k) => {
    const cell = fp[p] ?? { bid: 0, ask: 0 };
    const lit = tw(t, T.zoom[0] + 1.0 + k * 0.35, T.zoom[0] + 1.3 + k * 0.35);
    for (const [side, v] of [["bid", cell.bid], ["ask", cell.ask]]) {
      const x0 = side === "bid" ? x - 16 - FW : x + 16;
      ctx.save();
      ctx.globalAlpha = al;
      rrect(ctx, x0, PY(p) - 13, FW, 26, 5);
      ctx.fillStyle = rgba(side === "bid" ? C.sell : C.buy, 0.08 + 0.42 * clamp(v / 60) * (side === "ask" ? lit : 1));
      ctx.fill();
      ctx.restore();
      text(ctx, String(v), x0 + FW / 2, PY(p) + 1, { family: F.display, size: 19, weight: 700, color: v ? C.text : C.dim, align: "center", base: "middle", alpha: al });
    }
  });
  const sell = Object.values(fp).reduce((s, c) => s + c.bid, 0);
  const buy = Object.values(fp).reduce((s, c) => s + c.ask, 0);
  const sumA = tw(t, T.zoom[0] + 2.2, T.zoom[0] + 2.5);
  line(ctx, x - 16 - FW, PY(104.4), x + 16 + FW, PY(104.4), C.line, 1.4, al * sumA);
  text(ctx, String(sell), x - 16 - FW / 2, PY(103.9), { family: F.display, size: 22, weight: 700, color: C.sell, align: "center", base: "middle", alpha: al * sumA });
  text(ctx, String(buy), x + 16 + FW / 2, PY(103.9), { family: F.display, size: 22, weight: 700, color: C.buy, align: "center", base: "middle", alpha: al * sumA });
  tag(ctx, `Δ ${signed(buy - sell)}：前面三根都是負的`, x, PY(102.7), { align: "center", color: C.buy, solid: true, size: 15, alpha: al * tw(t, T.zoom[0] + 2.7, T.zoom[0] + 3.0) });
}

// ---- plan overlays (world space)
function planA(ctx, t, S, a) {
  const vt = S.vt;
  const live = t < T.rew[0];
  if (live) {
    const qv = tw(t, 22.4, 22.8) * (1 - tw(t, T.turn, T.turn + 0.4));
    if (qv > 0) tag(ctx, "回調量 90、70：低於均量", X(11) - 30, VB - IMPULSE_AVG * VS - 34, { color: C.buy, size: 17, alpha: a * qv });
    const cv = tw(t, LAND[1], LAND[1] + 0.3) * (1 - tw(t, T.turn, T.turn + 0.4));
    if (cv > 0) tag(ctx, "只吐回 90 · 仍在 140 之上", X(1), CVY(560), { color: C.buy, size: 17, alpha: a * cv });
    const ov = tw(t, LAND[2], LAND[2] + 0.3) * (1 - tw(t, T.turn + 2, T.turn + 2.4));
    if (ov > 0) tag(ctx, "價跌 OI 降：獲利了結", X(1), OIY(1260), { color: OI_COL, size: 17, alpha: a * ov });
    const dz = tw(t, 35.4, 35.7) * (1 - tw(t, T.zoom[0], T.zoom[0] + 0.3)) + tw(t, T.zoom[1], T.zoom[1] + 0.3) * (1 - tw(t, T.brk, T.brk + 0.3));
    if (dz > 0) tag(ctx, "第一根 Δ 轉正：+80", X(13) - 30, VB + 52, { color: C.buy, size: 17, alpha: a * dz });
  }
  // entry pin: a buy stop on the break of the pullback's last high
  const pin = spring(vt, PLAN.entryT, 16, 7);
  if (pin > 0 && vt >= PLAN.entryT) {
    const x0 = X(14) - 26;
    const y = PY(PLAN.entry);
    const py = y - (1 - pin) * 160;
    ctx.save();
    ctx.globalAlpha = a * clamp(pin * 3);
    ctx.fillStyle = C.buy;
    ctx.beginPath();
    ctx.moveTo(x0, py);
    ctx.lineTo(x0 - 18, py - 12);
    ctx.lineTo(x0 - 18, py + 12);
    ctx.closePath();
    ctx.shadowColor = C.buy;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.restore();
    const ex = lerp(x0, X(16) + 50, tw(vt, PLAN.entryT, PLAN.entryT + 0.5, ease.outQuart));
    line(ctx, x0, y, ex, y, C.buy, 2, a * clamp(pin * 3));
    const lab = tw(vt, T.risk, T.risk + 0.3);
    if (lab > 0) tag(ctx, `做多 ${PLAN.entry} · 突破即進場`, ex + 8, y, { color: C.buy, solid: true, size: 17, alpha: a * lab });
    if (live) ring(ctx, x0, y, t, PLAN.entryT + 0.15, { r1: 110, color: C.buy, w: 3 });
  }
  // risk / reward
  const rr = tw(vt, T.risk, T.risk + 0.9, ease.outQuart);
  if (rr > 0) {
    const x0 = X(14) - 26;
    const x1 = lerp(x0, X(16) + 50, rr);
    ctx.save();
    ctx.globalAlpha = a * 0.16;
    ctx.fillStyle = C.sell;
    ctx.fillRect(x0, PY(PLAN.entry), x1 - x0, PY(PLAN.stop) - PY(PLAN.entry));
    ctx.fillStyle = C.buy;
    ctx.fillRect(x0, PY(PLAN.t2), x1 - x0, PY(PLAN.entry) - PY(PLAN.t2));
    ctx.restore();
    line(ctx, x0, PY(PLAN.stop), x1, PY(PLAN.stop), RED, 2.4, a);
    line(ctx, x0, PY(PLAN.t1), x1, PY(PLAN.t1), C.gold, 2.4, a, [10, 6]);
    line(ctx, x0, PY(PLAN.t2), x1, PY(PLAN.t2), C.gold, 2, a * 0.8, [4, 6]);
    const la = a * tw(vt, T.risk + 0.5, T.risk + 0.9);
    const lx = X(16) + 58;
    tag(ctx, `停損 ${PLAN.stop} · 回調低點外 1 元`, lx, PY(PLAN.stop), { color: RED, size: 17, alpha: la });
    tag(ctx, `目標一 ${PLAN.t1} · ${R(PLAN.t1).toFixed(1)}R`, lx, PY(PLAN.t1), { color: C.gold, size: 17, alpha: la });
    tag(ctx, `目標二 ${PLAN.t2} · 等幅推升 · ${R(PLAN.t2).toFixed(1)}R`, lx, PY(PLAN.t2), { color: C.gold, size: 17, alpha: la });
  }
  if (live) {
    ring(ctx, X(15), PY(PLAN.t1), t, T.target, { r1: 220, color: C.buy, w: 4, dur: 1 });
    burst(ctx, X(15), PY(PLAN.t1), t, T.target, { n: 30, speed: 420, color: C.buy, seed: 277, flare: 120 });
    const hit = tw(t, T.target, T.target + 0.2) * (1 - tw(t, T.rew[0], T.rew[0] + 0.3));
    if (hit > 0) tag(ctx, `到達目標一 ${PLAN.t1}`, X(13), PY(PLAN.t1) + 6, { align: "center", color: C.buy, solid: true, size: 22, alpha: a * hit });
  }
}

function planB(ctx, t, S, a, live) {
  const vt = S.vt;
  const on = (t0) => tw(vt, t0, t0 + 0.3) * (live ? 1 - tw(t, T.split, T.split + 0.4) : 1);
  const lv = on(FAIL_T[0] - 0.3);
  if (lv > 0) tag(ctx, "回調量 180、220：比推升還兇", X(10) - 20, VB - 150, { color: RED, size: 17, alpha: a * lv });
  const oi = on(FAIL_T[2] - 0.3);
  if (oi > 0) tag(ctx, "價跌 OI 漲：新空單進場", X(1), OIY(1260), { color: RED, size: 17, alpha: a * oi });
  const cv = on(FAIL_T[1] - 0.2);
  if (cv > 0) tag(ctx, `CVD 跌破推升起點 ${CVD_START}`, X(1), CVY(560), { color: RED, size: 17, alpha: a * cv });
  const nt = on(FAIL_T[3] - 0.3);
  if (nt > 0) tag(ctx, "Δ 一直是負的，沒有轉強訊號", X(13) + 30, PY(100.8), { color: RED, size: 18, alpha: a * nt });
  if (live) ring(ctx, X(13), PY(104), t, 56.0, { r1: 220, color: RED, w: 4, dur: 1.0 });
  const no = tw(t, T.fail + 0.2, T.fail + 0.4) * (live ? 1 - tw(t, T.split, T.split + 0.3) : 1);
  if (no > 0) {
    const s = live ? 1 + 0.6 * (1 - ease.outBack(prog(t, T.fail + 0.2, T.fail + 0.6))) : 1;
    ctx.save();
    ctx.translate(X(15.5), PY(107));
    ctx.rotate(-0.08);
    ctx.scale(s, s);
    ctx.globalAlpha = a * no;
    rrect(ctx, -120, -40, 240, 80, 14);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 4;
    ctx.shadowColor = RED;
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(X(15.5), PY(107));
    ctx.rotate(-0.08);
    ctx.scale(s, s);
    text(ctx, "不進場", 0, 2, { family: F.tc, size: 44, weight: 900, color: RED, align: "center", base: "middle", alpha: a * no });
    ctx.restore();
  }
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
  world(ctx, t, S, { pane: true, alpha: o.alpha, profile: 0.4 });
  if (S.branch === "A") planA(ctx, t, S, o.alpha);
  else planB(ctx, t, S, o.alpha, false);
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
  id: "trend-pullback",
  title: "回調縮量，才是上車點",
  duration: T.end,
  description:
    "上漲中的回調。A：回調量 90、70 低於推升均量 240，CVD 只吐回 90，OI 下降；第一根 Δ 轉正、突破回調小高點 108，突破即做多、停損 104。倒回高點，B：回調放量、CVD 跌破推升起點、OI 增加 240，Δ 始終為負，不進場。",
  note: "回調是換氣，\n不是換人。",
  footer:
    "教學用合成行情：同一份逐筆帳本產生 K 線、足跡、量、CVD 與 OI。推升均量、CVD 推升起點、突破進場與停損位置為本課設定；OI 只表示開平倉，需與價格方向一起讀。",
  audio: "./motion/audio/trend-pullback.m4a",
  music: {
    palette: "tense",
    bpm: 112,
    sections: [
      { t: 0, level: 0 },
      { t: T.over, level: 1 },
      { t: T.where, level: 2 },
      { t: T.event, level: 1 },
      { t: T.confirm, level: 2 },
      { t: T.turn, level: 3 },
      { t: T.zoom[0], level: 2 },
      { t: T.brk, level: 3 },
      { t: T.rew[0], level: 0 },
      { t: T.rew[1], level: 2 },
      { t: 55.6, level: 3 },
      { t: T.fail, level: 1 },
      { t: T.split, level: 2 },
      { t: T.final, level: 1 },
      { t: 69.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "全景：一段上漲" },
    { t: T.where, label: "地點：推升段的成交中心" },
    { t: T.event, label: "事件：開始回調" },
    { t: T.confirm, label: "確認：換氣還是換人" },
    { t: T.turn, label: "轉強：回調結束" },
    { t: T.execute, label: "執行：突破上車" },
    { t: T.rew[0], label: "另一個回調" },
    { t: T.split, label: "兩種回調" },
  ],
  captions: [
    { a: 4.6, b: 8.4, text: "一段上漲，高點和低點都在墊高。" },
    { a: 8.5, b: 12.9, text: `推升段成交最多在 ${POC}：回調可能在這附近結束。` },
    { a: 13.0, b: 16.9, text: "推升放量、新多單進場，這是真的上漲。" },
    { a: 17.0, b: 23.3, text: "上漲停下來，開始回調。" },
    { a: 23.4, b: 26.9, text: "回調縮量：推升的人在休息。" },
    { a: 27.0, b: 30.3, text: "CVD 只吐回一小段。" },
    { a: 30.4, b: 33.3, text: "價格跌、OI 也跌：沒有新空單進場。" },
    { a: 33.4, b: 35.7, text: "到了成交中心附近，買方開始出手。" },
    { a: 35.8, b: 40.5, text: "回調以來，第一根買比賣多。" },
    { a: 40.6, b: 44.1, text: `突破回調的小高點 ${TRIGGER}：回調結束了。` },
    { a: 44.2, b: 49.5, text: "突破就上車，停損放在回調低點外。" },
    { a: 49.6, b: 51.5, text: "回到同一個高點。" },
    { a: 51.6, b: 55.5, text: "這次回調，量反而放大。" },
    { a: 55.6, b: 57.9, text: "Δ 一直是負的，高點越來越低。" },
    { a: 58.0, b: 59.9, text: "這不是回調，是換人了。" },
    { a: 60.0, b: 65.9, text: "同一個回調，兩種成交。" },
    { a: 66.0, b: 71, text: "回調縮量，才是上車點。" },
  ],
  flashes: [
    { t: T.open + 0.9, amt: 0.35, decay: 5, pre: 0.5 },
    { t: T.where + 2.4, amt: 0.12, decay: 8 },
    ...LAND.map((t) => ({ t, amt: 0.12, decay: 10 })),
    { t: T.brk, amt: 0.3, decay: 6, pre: 0.15 },
    { t: T.target, amt: 0.25, decay: 6 },
    { t: T.rew[1], amt: 0.3, decay: 7 },
    { t: 56.0, amt: 0.3, decay: 6 },
    { t: T.fail + 0.2, amt: 0.2, decay: 7 },
  ],
  cues: [
    { t: 0.1, kind: "tick", vel: 0.4 },
    ...RAIL.map((_, i) => ({ t: 0.3 + i * 0.26 + 0.5, kind: "whoosh", dur: 0.4, vel: 0.7 })),
    ...RAIL.map((_, i) => ({ t: 0.3 + i * 0.26 + 0.75, kind: "stamp" })),
    { t: 1.35, kind: "type", n: 10 },
    { t: 2.6, kind: "riser", dur: 1.3 },
    { t: T.open + 0.9, kind: "impact", big: true },
    ...HIST.slice(0, 10).map((_, i) => ({ t: 4.0 + i * 0.08, kind: "blip", vel: 0.22, freq: 800 + i * 50 })),
    { t: 5.0, kind: "swell", dur: 2.0 },
    { t: T.where + 0.3, kind: "rise", dur: 1.0 },
    { t: T.where + 1.8, kind: "scan", price: POC },
    { t: T.where + 2.4, kind: "shimmer" },
    { t: T.impulse + 0.6, kind: "whoosh", dur: 0.8 },
    { t: T.impulse + 1.0, kind: "rise", dur: 0.6 },
    { t: T.event + 0.4, kind: "thud" },
    ...[...PULL_A, ...RALLY_A, ...PULL_B].flatMap((b) =>
      [0, 1, 2].map((k) => ({ t: b.t0 + k * 0.4, kind: "fill", price: Math.round(lerp(b.o, b.c, k / 2)), side: b.c >= b.o ? "buy" : "sell", soft: true })),
    ),
    { t: 23.2, kind: "scan", price: TRIGGER },
    ...EVIDENCE.flatMap((e) => [
      { t: e.t0 + 0.05, kind: "whoosh", dur: 0.6 },
      { t: e.t0 + 0.55, kind: "impact", vel: 0.55 },
      { t: e.t0 + 1.9, kind: "whoosh", dur: 0.5, vel: 0.8 },
      { t: e.t0 + EV_DUR, kind: "stamp" },
    ]),
    ...TRADES_A.map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side, soft: x.qty < 30, big: x.t === T.brk })),
    { t: 35.4, kind: "rise", dur: 0.5 },
    { t: T.zoom[0] + 0.2, kind: "whoosh", dur: 1.1 },
    { t: T.zoom[0] + 2.7, kind: "stamp" },
    { t: T.zoom[1] - 0.7, kind: "whoosh", dur: 0.7 },
    { t: T.brk, kind: "impact" },
    { t: PLAN.entryT + 0.05, kind: "coin", vel: 0.4 },
    { t: T.risk, kind: "whoosh", dur: 0.8 },
    { t: T.target, kind: "fill", price: 112, side: "buy", big: true },
    { t: T.target + 0.05, kind: "coin", vel: 0.6 },
    { t: T.rew[0], kind: "drain", dur: 1.8 },
    { t: T.rew[0] + 0.1, kind: "riser", dur: 1.8, vel: 0.5 },
    { t: T.rew[1], kind: "impact", big: true },
    ...TRADES_B.map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side, big: x.qty >= 60 })),
    { t: 56.0, kind: "impact" },
    { t: 56.1, kind: "rumble", dur: 1.6 },
    ...FAIL_T.map((t) => ({ t, kind: "crack", price: 104, loud: false })),
    { t: T.fail + 0.2, kind: "stamp" },
    { t: T.split, kind: "whoosh", dur: 1.0 },
    { t: T.split + 0.6, kind: "shimmer" },
    { t: T.final, kind: "whoosh", dur: 1.2 },
    { t: T.final + 0.6, kind: "swell", dur: 2.4 },
    { t: 67.8, kind: "stamp" },
  ],
  draw(ctx, t) {
    const B = t >= T.rew[1];
    const vtA = marketTimeA(t);
    const SA = snapshot("A", Math.min(vtA, T.end));
    const SB = B ? snapshot("B", t) : null;
    const splitIn = tw(t, T.split, T.split + 1.1, ease.inOutQuart);
    const finalIn = tw(t, T.final, T.final + 1.4, ease.inOutQuart);
    const cam = mainCam(t);
    const worldA = tw(t, T.open - 0.2, T.open + 0.9);

    warp(ctx, t, 1 - tw(t, T.open + 0.4, T.open + 1.2));

    const mainFade = tw(t, T.split, T.split + 0.2);
    if (mainFade < 1) {
      const S = B ? SB : SA;
      dust(ctx, t, cam, worldA * (1 - splitIn));
      camera(ctx, cam, () => {
        ctx.globalAlpha = 1;
        world(ctx, t, S, { alpha: worldA * (1 - mainFade) });
        if (!B) {
          turnView(ctx, t, worldA);
          planA(ctx, t, S, worldA * (1 - focus(t).unfold));
        } else planB(ctx, t, S, 1 - mainFade, true);
        if (t < T.rew[0] || B) {
          const fo = B ? null : focus(t);
          for (const x of B ? TRADES_B : TRADES_A) {
            if (x.t > t || t - x.t > 1.2) continue;
            burst(ctx, spreadX(x.bar, fo), PY(x.price), t, x.t, { n: x.qty >= 60 ? 22 : 12, speed: 240 + x.qty * 2, seed: x.price * 7 + x.bar, color: x.side === "buy" ? C.buy : C.sell, flare: 40 + x.qty * 0.5 });
          }
        }
      });
    }

    // ---------- rewind treatment
    const rw = tw(t, T.rew[0], T.rew[0] + 0.25) * (1 - tw(t, T.rew[1] - 0.15, T.rew[1] + 0.1));
    if (rw > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "saturation";
      ctx.globalAlpha = 0.85 * rw;
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.12 * rw;
      ctx.fillStyle = "#000";
      for (let y = ((t * 900) % 6) - 6; y < H; y += 6) ctx.fillRect(0, y, W, 2);
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const y = ((rnd(261, Math.floor(t * 18) + i) * H) | 0) % H;
        ctx.save();
        ctx.globalAlpha = 0.18 * rw;
        ctx.fillStyle = C.text;
        ctx.fillRect(0, y, W, 1 + rnd(262, i) * 3);
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 0.75 * rw;
      const bg = ctx.createRadialGradient(W / 2, H / 2 - 30, 0, W / 2, H / 2 - 30, 520);
      bg.addColorStop(0, "rgba(3,6,11,0.95)");
      bg.addColorStop(1, "rgba(3,6,11,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      const s = 1 + 0.1 * pulse(t, T.rew[0], 4);
      ctx.save();
      ctx.translate(W / 2, H / 2 - 40);
      ctx.scale(s, s);
      text(ctx, "◀◀", 0, -70, { family: F.display, size: 90, weight: 700, color: C.gold, align: "center", base: "middle", alpha: rw * (0.6 + 0.4 * Math.sin(t * 16)), glow: 20 });
      text(ctx, "回到同一個高點", 0, 26, { family: F.tc, size: 64, weight: 900, color: C.text, align: "center", base: "middle", alpha: rw, glow: 12 });
      ctx.restore();
      text(ctx, `REWIND  −${(T.rew[0] - vtA).toFixed(1)}s`, W / 2, H / 2 + 120, { family: F.mono, size: 22, weight: 700, color: C.muted, align: "center", ls: 4, alpha: rw });
    }

    // ---------- split: A left, B right
    if (splitIn > 0) {
      const back = finalIn;
      const SAend = snapshot("A", RALLY_A[1].t1 + 0.1);
      const SBnow = SB ?? snapshot("B", t);
      const full = { x: 0, y: 0, w: W, h: H };
      const L = { x: 60, y: 210, w: 880, h: 700 };
      const Rr = { x: 980, y: 210, w: 880, h: 700 };
      const mixR = (p, q, u) => ({ x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u), w: lerp(p.w, q.w, u), h: lerp(p.h, q.h, u) });
      const camPane = { x: 930, y: 830, z: 0.53 };
      const camFull = { x: 930, y: 700, z: 0.5 };
      if (back < 1) {
        const cB = { x: lerp(950, camPane.x, splitIn), y: lerp(800, camPane.y, splitIn), z: lerp(0.77, camPane.z, splitIn) };
        pane(ctx, t, SBnow, mixR(full, Rr, splitIn), cB, { color: RED, alpha: 1 - back });
      }
      const aIn = tw(t, T.split + 0.3, T.split + 1.3, ease.outQuart);
      const rA = back > 0 ? mixR(L, full, back) : mixR({ ...L, x: L.x - 1000 }, L, aIn);
      const cA = back > 0 ? { x: lerp(camPane.x, camFull.x, back), y: lerp(camPane.y, camFull.y, back), z: lerp(camPane.z, camFull.z, back) } : camPane;
      pane(ctx, t, SAend, rA, cA, { color: C.buy, alpha: aIn });
      const la = tw(t, T.split + 1.0, T.split + 1.5) * (1 - back);
      if (la > 0) {
        tag(ctx, `A · 換氣 → 突破 ${TRIGGER} 做多`, L.x + 24, L.y - 34, { color: C.buy, solid: true, size: 24, alpha: la });
        tag(ctx, "B · 換人 → 不進場", Rr.x + 24, Rr.y - 34, { color: RED, solid: true, size: 24, alpha: la });
        const rows = [
          ["量 90、70", "量 180、220"],
          ["CVD 吐回 90", "CVD 吐回 500"],
          ["OI −40", "OI +240"],
          ["Δ 轉正、破高", "Δ 始終為負"],
        ];
        rows.forEach(([va, vb], i) => {
          const y = L.y + L.h + 30;
          const ra = la * tw(t, T.split + 1.3 + i * 0.2, T.split + 1.6 + i * 0.2);
          checkGlyph(ctx, 72 + i * 220, y, 0.9, C.buy, ra);
          text(ctx, va, 88 + i * 220, y + 1, { family: F.tc, size: 18, weight: 700, color: C.text, base: "middle", alpha: ra });
          crossGlyph(ctx, 992 + i * 220, y, 0.8, RED, ra);
          text(ctx, vb, 1008 + i * 220, y + 1, { family: F.tc, size: 18, weight: 700, color: C.text, base: "middle", alpha: ra });
        });
      }
    }

    // ---------- evidence cards
    if (t < T.rew[0]) {
      let scrimA = 0;
      for (const e of EVIDENCE) scrimA = Math.max(scrimA, heroAmt(t, e.t0));
      if (scrimA > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5 * scrimA;
        ctx.fillStyle = "#03060b";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      const fromWorld = [
        [X(11.5), VB - 40],
        [X(12), CVY(440)],
        [X(12), OIY(1270)],
        [X(14), PY(TRIGGER)],
      ];
      EVIDENCE.forEach((e, i) => evidence(ctx, t, e, toScreen(mainCam(e.t0), ...fromWorld[i])));
    }

    // ---------- rail
    const railA = tw(t, 0.2, 0.5) * (1 - tw(t, T.split, T.split + 0.6) + tw(t, T.final + 0.6, T.final + 1.0));
    if (worldA > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, 170);
      g.addColorStop(0, "rgba(6,11,19,0.92)");
      g.addColorStop(0.6, "rgba(6,11,19,0.55)");
      g.addColorStop(1, "rgba(6,11,19,0)");
      ctx.save();
      ctx.globalAlpha = worldA * (1 - splitIn * (1 - finalIn));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, 170);
      ctx.restore();
    }
    rail(ctx, t, railA);

    // ---------- opening title
    const tz = lerp(0, -560, ease.inCubic(prog(t, T.open, T.open + 1.0)));
    const ts = depthScale(tz);
    const titleA = 1 - tw(t, T.open + 0.55, T.open + 1.0);
    if (titleA > 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2 + 20);
      ctx.scale(ts, ts);
      if (tz < -30) ctx.filter = `blur(${Math.min(14, -tz / 40)}px)`;
      text(ctx, "STRATEGY 03 · 策略實戰", 0, -110, { family: F.mono, size: 22, weight: 600, color: C.gold, ls: 6, align: "center", alpha: titleA * tw(t, 1.1, 1.5) });
      revealText(ctx, "回調縮量，才是上車點", 0, 0, { family: F.tc, size: 100, weight: 900, color: C.text, align: "center", base: "middle", stagger: 0.05, dur: 0.55, rise: 50, blur: 12, alpha: titleA }, t - 1.35);
      text(ctx, "順勢回調 · Breathe or Hand-over", 0, 96, { family: F.tc, size: 30, weight: 500, color: C.muted, align: "center", alpha: tw(t, 2.1, 2.6) * titleA });
      const lw = lerp(0, 380, tw(t, 1.8, 2.5, ease.outQuart));
      line(ctx, -lw, 60, lw, 60, C.teal, 2, 0.7 * titleA);
      ctx.restore();
    }
    if (t < 1.2) {
      const g = tw(t, 0, 1.2);
      glow(ctx, W / 2, H / 2, 400 * g, C.teal, 0.15 * (1 - g));
    }

    // ---------- tags in screen space
    const hist = tw(t, 5.2, 5.6) * (1 - tw(t, T.where, T.where + 0.4));
    if (hist > 0) tag(ctx, "已完成的模擬行情", 110, 214, { color: C.muted, alpha: hist, size: 20 });
    const bTag = tw(t, T.rew[1], T.rew[1] + 0.3) * (1 - tw(t, T.split, T.split + 0.3));
    if (bTag > 0) tag(ctx, "B · 從同一個高點，換一種回調", 110, 214, { color: RED, alpha: bTag, size: 20 });

    // ---------- closing statement
    if (t >= T.final + 0.8) {
      const sc = tw(t, T.final + 0.8, T.final + 1.2);
      ctx.save();
      ctx.globalAlpha = 0.7 * sc;
      const g = ctx.createLinearGradient(0, 130, 0, 330);
      g.addColorStop(0, "rgba(6,11,19,0.95)");
      g.addColorStop(1, "rgba(6,11,19,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 120, W, 210);
      ctx.restore();
      statement(ctx, t, T.final + 0.9, [
        { text: "回調縮量，才是上車點。", size: 56 },
        { text: "地點 → 事件 → 確認 → 執行", size: 30, weight: 700 },
      ], { y: 196, gap: 72 });
    }
  },
};
