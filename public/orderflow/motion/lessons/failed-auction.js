// T01 掃過前低，收回才算數 — the first strategy lesson. One ledger (FAILED-AUCTION-
// LESSON-PLAN) drives candles, footprint, volume, OI and the resting bids. The
// strategy rail (地點 → 事件 → 確認 → 執行) stays on screen; every check is earned
// by evidence that lifts off the chart, flies at the viewer and lands in its slot.
// Branch A (failed auction) plays first; the film then rewinds to the stop trigger
// and plays branch B (accepted breakdown) from the same state.
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
  shake,
  spring,
  bear,
  rnd,
  rrange,
  noise1,
  neonPath,
  prefs,
} from "../core.js";
import { priceGrid, floatChip, camera, camPath, statement, tag, arrow } from "../kit.js";

// ---------------------------------------------------------------- geometry
const PY = (p) => 560 - (p - 104) * 36;
const X = (i) => 260 + i * 60;
const VB = 1040; // volume baseline
const VS = 0.28;
const OIY = (v) => 1250 - (v - 800) * 0.2;
const PX = 1300; // prior-day profile
const OI_COL = "#c3d0dc"; // OI has no side: a neutral hue, never buy/sell
const RED = "#ff8a7f";

// ---------------------------------------------------------------- the ledger
/** Prior-day volume by price (the profile on the right). */
export const PRIOR = {
  100: 160, 101: 50, 102: 80, 103: 100, 104: 120, 105: 130, 106: 150, 107: 170, 108: 200,
  109: 150, 110: 120, 111: 90, 112: 70, 113: 60, 114: 80, 115: 70, 116: 50, 117: 40,
};
/** Point of control and 70% value area, expanding one row at a time from the POC. */
export function valueArea(profile, share = 0.7) {
  const ps = Object.keys(profile).map(Number).sort((a, b) => a - b);
  const total = ps.reduce((s, p) => s + profile[p], 0);
  const poc = ps.reduce((a, p) => (profile[p] > profile[a] ? p : a), ps[0]);
  let lo = poc;
  let hi = poc;
  let acc = profile[poc];
  while (acc < total * share) {
    const up = profile[hi + 1] ?? -1;
    const dn = profile[lo - 1] ?? -1;
    if (up >= dn) acc += profile[++hi];
    else acc += profile[--lo];
  }
  return { poc, val: lo, vah: hi, low: ps[0], high: ps.at(-1), total, share: acc / total };
}
const VA = valueArea(PRIOR);

/** Today, already finished: a slow drift from 107 to 101 while OI climbs. */
export const HIST = [
  { o: 107, h: 108, l: 106, c: 106, v: 60, d: -10, oi: 10 },
  { o: 106, h: 107, l: 105, c: 105, v: 70, d: -20, oi: 20 },
  { o: 105, h: 106, l: 104, c: 106, v: 60, d: 10, oi: 0 },
  { o: 106, h: 106, l: 104, c: 104, v: 80, d: -30, oi: 30 },
  { o: 104, h: 105, l: 103, c: 103, v: 90, d: -40, oi: 40 },
  { o: 103, h: 104, l: 102, c: 104, v: 70, d: 10, oi: 10 },
  { o: 104, h: 104, l: 102, c: 102, v: 90, d: -40, oi: 40 },
  { o: 102, h: 103, l: 101, c: 102, v: 80, d: -20, oi: 30 },
  { o: 102, h: 102, l: 101, c: 101, v: 90, d: -40, oi: 40 },
  { o: 101, h: 102, l: 101, c: 101, v: 70, d: -10, oi: 20 },
];
export const OI0 = 1000;

// Trades: [t, bar, aggressor side, price, qty, ΔOI]. Aggressive sells hit bids.
const tr = ([t, bar, side, price, qty, oi]) => ({ t, bar, side, price, qty, oi });
/** Shared by both branches: the sweep up to the stop trigger at 99. */
export const SHARED = [
  [18.4, 10, "sell", 101, 20, 0],
  [18.95, 10, "sell", 100, 60, -30],
  [19.5, 10, "sell", 99, 30, -30],
].map(tr);
const STOP_T = 19.5;
/** Branch A: stops and liquidations run into refilled bids at 97. */
export const TRADES_A = [
  ...SHARED,
  [19.95, 10, "sell", 98, 80, -70],
  [20.4, 10, "sell", 97, 60, -60],
  [21.05, 10, "sell", 97, 50, -40],
  [21.7, 10, "sell", 97, 40, -20],
  [22.25, 10, "buy", 98, 40, 10],
  [22.8, 10, "buy", 99, 40, 0],
  // bar 11: second test of 97, much less selling
  [34.5, 11, "sell", 98, 30, 0],
  [35.1, 11, "sell", 97, 60, -20],
  [35.8, 11, "buy", 98, 10, 0],
  [36.4, 11, "buy", 99, 20, 0],
  // bar 12: reclaim 100 and the value area low
  [39.6, 12, "buy", 99, 20, 0],
  [40.0, 12, "buy", 100, 50, -20],
  [40.4, 12, "buy", 101, 60, -20],
  [40.8, 12, "sell", 101, 30, 0],
  [41.2, 12, "buy", 102, 70, -20],
  [41.6, 12, "sell", 102, 30, 0],
  // bar 13: the retest holds 100
  [45.6, 13, "sell", 101, 20, 0],
  [46.1, 13, "sell", 100, 10, 0],
  [46.5, 13, "buy", 100, 20, 10],
  [46.9, 13, "buy", 101, 60, 0],
  [47.5, 13, "buy", 102, 70, 0],
].map((x) => (Array.isArray(x) ? tr(x) : x));
/** Branch B: new positions pour in, nothing refills, price stays below. */
export const TRADES_B = [
  ...SHARED,
  [59.9, 10, "sell", 98, 80, 40],
  [60.4, 10, "sell", 97, 60, 50],
  [60.9, 10, "sell", 96, 90, 90],
  [61.5, 10, "sell", 95, 60, 60],
  [62.1, 10, "buy", 96, 30, 0],
].map((x) => (Array.isArray(x) ? tr(x) : x));
// Resting bids (the heatmap): +add / −cancel. Trades consume them separately.
export const BOOK_A = [
  { t: -1, p: 98, q: 300, x: X(6) - 30 },
  { t: -1, p: 100, q: 60, x: X(7) - 30 },
  { t: -1, p: 99, q: 30, x: X(8) - 30 },
  { t: 16.6, p: 98, q: -220, x: X(10) - 22 },
  { t: 17.4, p: 97, q: 60, x: X(10) - 16 },
  { t: 20.75, p: 97, q: 80, x: X(10) + 6 },
  { t: 21.4, p: 97, q: 70, x: X(10) + 14 },
];
export const BOOK_B = [...BOOK_A.slice(0, 5), { t: 59.7, p: 96, q: 90, x: X(10) - 4 }, { t: 59.7, p: 95, q: 60, x: X(10) - 2 }];
/** Bars with no trade tape: OHLC, volume, delta, ΔOI and the time they form. */
export const RALLY = [
  { bar: 14, t0: 52.8, t1: 54.2, o: 102, h: 105, l: 102, c: 105, v: 200, d: 100, oi: -40 },
  { bar: 15, t0: 54.2, t1: 55.6, o: 105, h: 107, l: 104, c: 107, v: 180, d: 80, oi: -30 },
  { bar: 16, t0: 55.6, t1: 57.0, o: 107, h: 108, l: 106, c: 108, v: 160, d: 60, oi: -20 },
];
export const RANGE_B = [
  { bar: 11, t0: 62.7, t1: 63.8, o: 96, h: 98, l: 95, c: 97, v: 140, d: 10, oi: 30, at: { 95: 30, 96: 50, 97: 40, 98: 20 } },
  { bar: 12, t0: 63.8, t1: 64.9, o: 97, h: 98, l: 95, c: 96, v: 120, d: -10, oi: 10, at: { 95: 20, 96: 50, 97: 30, 98: 20 } },
  { bar: 13, t0: 64.9, t1: 66.0, o: 96, h: 97, l: 95, c: 96, v: 100, d: 0, oi: 0, at: { 95: 20, 96: 50, 97: 30 } },
];
/** Plan levels (lesson settings, not general rules). */
export const PLAN = { entry: 101, stop: 96, t1: VA.poc, t2: VA.vah, voidLine: 105, entryT: 46.9 };
const R = (p) => (p - PLAN.entry) / (PLAN.entry - PLAN.stop);

// ---------------------------------------------------------------- timeline
const T = {
  open: 3.3,
  over: 4.4,
  where: 8.2,
  whereOI: 12.6,
  event: 15.6,
  cancel: 16.6,
  confirm: 23.6,
  zoom: 27.2,
  replay: [28.9, 29.8, 30.6],
  refill: [29.3, 30.2],
  zoomOut: 33.2,
  diverge: 36.5,
  reclaim: 39.4,
  execute: 44.6,
  imb: [47.8, 51.3],
  risk: 51.2,
  rally: 52.8,
  target: 56.8,
  rew: [57.6, 59.6],
  fail: 66.1,
  split: 68.2,
  final: 72.8,
  end: 77,
};
/** Evidence that flies into the rail's checklist. */
const EVIDENCE = [
  { t0: 24.4, slot: 0, kicker: "證據 1 / 4 · OI", hero: "OI −240", sub: "掃蕩中舊倉被平掉", color: OI_COL },
  { t0: 31.2, slot: 1, kicker: "證據 2 / 4 · 吸收", hero: "97 吸收 150", sub: "賣了 150，價格沒再往下", color: C.buy },
  { t0: 37.5, slot: 2, kicker: "證據 3 / 4 · 背離", hero: "Δ −260 → −60", sub: "同一個低點，賣壓變小", color: C.gold },
  { t0: 41.8, slot: 3, kicker: "證據 4 / 4 · 收回", hero: "收回 102", sub: "重回前一日價值區", color: C.buy },
];
const EV_DUR = 2.5;
const LAND = EVIDENCE.map((e) => e.t0 + EV_DUR);
const SLOT_NAMES = ["OI", "吸收", "背離", "收回"];
const FAIL_T = [66.2, 66.45, 66.7, 66.95];

// ---------------------------------------------------------------- market state
/** Market time of branch A: follows t, except it runs backwards during the rewind. */
function marketTimeA(t) {
  if (t < T.rew[0]) return t;
  return lerp(T.rew[0], STOP_T + 0.05, tw(t, T.rew[0], T.rew[1], ease.inOutCubic));
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

function bookAt(events, trades, vt) {
  const q = {};
  for (const e of events) if (e.t <= vt) q[e.p] = (q[e.p] ?? 0) + e.q;
  for (const x of trades) if (x.t <= vt && x.side === "sell") q[x.price] = Math.max(0, (q[x.price] ?? 0) - x.qty);
  return q;
}

/** Heat segments per price: [{p, x0, x1, q}] from adds, cancels and fills. */
function heatAt(events, trades, vt, xNow) {
  const ev = [];
  for (const e of events) if (e.t <= vt) ev.push({ t: e.t, p: e.p, dq: e.q, x: e.x });
  for (const x of trades)
    if (x.t <= vt && x.side === "sell") {
      const idx = trades.filter((y) => y.bar === x.bar).indexOf(x);
      ev.push({ t: x.t, p: x.price, dq: -x.qty, x: X(x.bar) - 8 + idx * 4 });
    }
  ev.sort((a, b) => a.t - b.t);
  const segs = [];
  const open = {};
  for (const e of ev) {
    const cur = open[e.p];
    if (cur) segs.push({ p: e.p, x0: cur.x, x1: Math.max(cur.x, e.x), q: cur.q });
    const q = Math.max(0, (cur?.q ?? 0) + e.dq);
    open[e.p] = { x: e.x, q };
  }
  for (const [p, cur] of Object.entries(open)) segs.push({ p: Number(p), x0: cur.x, x1: Math.max(cur.x, xNow), q: cur.q });
  return segs.filter((s) => s.q > 0 && s.x1 > s.x0);
}

/** Everything the chart needs at market time vt of a branch. */
function snapshot(branch, vt) {
  const A = branch === "A";
  const trades = A ? TRADES_A : TRADES_B;
  const bars = HIST.map((b) => ({ ...b, vis: b.v }));
  let oi = OI0 + HIST.reduce((s, b) => s + b.oi, 0);
  let oiExact = oi;
  const oiPts = [[X(0) - 30, OI0]];
  let acc = OI0;
  HIST.forEach((b, i) => {
    acc += b.oi;
    oiPts.push([X(i) + 24, acc]);
  });
  let live = 9;
  let last = 101;
  const lastBar = A ? 16 : 13;
  for (let i = 10; i <= lastBar; i++) {
    const sum = A ? RALLY.find((b) => b.bar === i) : RANGE_B.find((b) => b.bar === i);
    const b = sum ? barFromSummary(sum, vt) : barFromTrades(trades, vt, i);
    bars.push(b);
    if (!b) continue;
    live = i;
    last = b.c;
    if (sum) {
      const u = prog(vt, sum.t0, sum.t1);
      oi += sum.oi * u;
      if (u >= 1) oiExact += sum.oi;
      oiPts.push([X(i) - 24 + 48 * u, oi]);
    } else {
      const ts = trades.filter((x) => x.bar === i && x.t <= vt);
      ts.forEach((x, k) => {
        oi += x.oi * ease.outCubic(prog(vt, x.t, x.t + 0.3));
        oiExact += x.oi;
        oiPts.push([X(i) - 24 + (48 * (k + 1)) / Math.max(4, trades.filter((y) => y.bar === i).length), oi]);
      });
    }
  }
  const events = A ? BOOK_A : BOOK_B;
  const xNow = X(Math.max(live, vt >= T.event ? 10 : 9)) + 30;
  return {
    branch,
    vt,
    bars,
    oi,
    oiExact,
    oiPts,
    live,
    last,
    book: bookAt(events, trades, vt),
    heat: heatAt(events, trades, vt, xNow),
  };
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

/** Today's profile in branch B once the range has formed. */
export function profileB(vt = Infinity) {
  const prof = {};
  for (const x of TRADES_B) if (x.bar === 10 && x.t <= vt) prof[x.price] = (prof[x.price] ?? 0) + x.qty;
  for (const b of RANGE_B) {
    const u = prog(vt, b.t0, b.t1);
    for (const [p, q] of Object.entries(b.at)) prof[p] = (prof[p] ?? 0) + q * u;
  }
  return prof;
}

// ---------------------------------------------------------------- camera
const FP_CAM = { x: X(10), y: PY(99), z: 2.5 };
const MAIN_KEYS = [
  { t: 0, x: 880, y: 660, z: 0.3 },
  { t: T.open, x: 880, y: 660, z: 0.3 },
  { t: 4.9, x: 890, y: 650, z: 0.8 },
  { t: T.where, x: 890, y: 650, z: 0.81 },
  { t: 9.4, x: 1010, y: 650, z: 1.0 },
  { t: 12.4, x: 1030, y: 650, z: 1.02 },
  { t: 13.4, x: 800, y: 1000, z: 0.9 },
  { t: 15.4, x: 810, y: 1000, z: 0.9 },
  { t: 16.4, x: 1030, y: 690, z: 1.12 },
  { t: 23.3, x: 1020, y: 720, z: 1.22 },
  { t: 24.2, x: 880, y: 1020, z: 0.95 },
  { t: 27.0, x: 880, y: 1020, z: 0.97 },
  { t: 28.4, ...FP_CAM },
  { t: T.zoomOut, x: FP_CAM.x, y: FP_CAM.y, z: 2.6 },
  { t: 34.2, x: 1040, y: 700, z: 1.15 },
  { t: 44.4, x: 1040, y: 690, z: 1.17 },
  { t: 45.4, x: 1030, y: 600, z: 0.95 },
  { t: 47.7, x: 1030, y: 600, z: 0.95 },
  { t: 48.6, x: X(13), y: PY(101), z: 2.6 },
  { t: 50.5, x: X(13), y: PY(101), z: 2.7 },
  { t: 51.3, x: 1030, y: 600, z: 0.95 },
  { t: 52.6, x: 1030, y: 600, z: 0.96 },
  { t: 53.8, x: 1000, y: 560, z: 0.86 },
  { t: T.rew[0], x: 1000, y: 560, z: 0.88 },
  { t: 59.2, x: 1030, y: 700, z: 1.1 },
  { t: 60.2, x: 1030, y: 720, z: 1.12 },
  { t: 62.8, x: 1010, y: 760, z: 1.0 },
  { t: T.split, x: 1010, y: 760, z: 1.0 },
];
function mainCam(t) {
  const cam = camPath(t, MAIN_KEYS);
  // Evidence heroes push the world back a touch: the card comes forward.
  const hero = EVIDENCE.reduce((s, e) => s + heroAmt(t, e.t0), 0);
  cam.z *= 1 - 0.07 * clamp(hero);
  if (!prefs.reduced) cam.rot = -0.012 * tw(t, STOP_T, STOP_T + 0.4) * (1 - tw(t, 22.8, 23.8)) + 0.004 * noise1(t * 0.35, 4);
  const [a, b] = shake(t, STOP_T, 20, 0.7, 11);
  const [c, d] = shake(t, 20.4, 9, 0.4, 13);
  const [e, f] = shake(t, 60.9, 16, 0.6, 17);
  cam.sx = a + c + e;
  cam.sy = b + d + f;
  return cam;
}
const toScreen = (cam, x, y) => [W / 2 + (cam.sx ?? 0) + (x - cam.x) * cam.z, H / 2 + (cam.sy ?? 0) + (y - cam.y) * cam.z];

// ---------------------------------------------------------------- depth helpers
const FOCAL = 700;
/** Perspective scale of a point at depth z (z < 0 is in front of the screen). */
const depthScale = (z) => FOCAL / Math.max(40, FOCAL + z);

/** Warp-speed streaks flying at the viewer (opening). */
function warp(ctx, t, a) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const speed = 900 + 2600 * tw(t, 2.6, 3.9, ease.inCubic);
  for (let i = 0; i < 150; i++) {
    const ang = rnd(21, i) * TAU;
    const r0 = rrange(22, i, 40, 900);
    const span = 3000;
    const z = span - ((rnd(23, i) * span + t * speed) % span);
    const z2 = Math.min(span, z + 60 + speed * 0.05);
    const s1 = depthScale(z - 400);
    const s2 = depthScale(z2 - 400);
    const x1 = W / 2 + Math.cos(ang) * r0 * s1;
    const y1 = H / 2 + Math.sin(ang) * r0 * s1;
    const x2 = W / 2 + Math.cos(ang) * r0 * s2;
    const y2 = H / 2 + Math.sin(ang) * r0 * s2;
    const col = rnd(24, i) > 0.82 ? C.gold : C.teal;
    ctx.strokeStyle = rgba(col, a * clamp(1 - z / span) * 0.8);
    ctx.lineWidth = 1 + 2.4 * clamp(s1 - 0.5);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Screen-space dust at several depths; drifts against the camera for parallax. */
function dust(ctx, t, cam, a) {
  if (a <= 0) return;
  for (let i = 0; i < 46; i++) {
    const depth = rrange(31, i, 0.3, 1.8);
    const px = rnd(32, i) * (W + 400) - 200 - (cam.x - 900) * depth * 0.55 + t * rrange(33, i, -6, 6);
    const py = rnd(34, i) * (H + 400) - 200 - (cam.y - 660) * depth * 0.55 - t * rrange(35, i, 2, 9);
    const x = ((px % (W + 400)) + W + 400) % (W + 400) - 200;
    const y = ((py % (H + 400)) + H + 400) % (H + 400) - 200;
    glow(ctx, x, y, (depth > 1.2 ? 9 : 4) * depth * (0.7 + cam.z * 0.3), rnd(36, i) > 0.75 ? C.gold : C.teal, 0.22 * a * (depth > 1.3 ? 0.7 : 1));
  }
}

// ---------------------------------------------------------------- the strategy rail
const STAGES = [
  { k: "地點", en: "WHERE", w: 150 },
  { k: "事件", en: "WHAT", w: 150 },
  { k: "確認", en: "WHO WON", w: 344 },
  { k: "執行", en: "DO", w: 150 },
];
const RAIL_Y = 74;
const RAIL_H = 58;
const RAIL = (() => {
  const gap = 24;
  const total = STAGES.reduce((s, x) => s + x.w, 0) + gap * 3;
  let x = (W - total) / 2;
  return STAGES.map((s) => {
    const box = { ...s, x, cx: x + s.w / 2 };
    x += s.w + gap;
    return box;
  });
})();
const slotXY = (i) => [RAIL[2].x + 118 + i * 50, RAIL_Y];

/** Stage timings: [active from, done at] per branch segment. */
function stageState(t, i) {
  if (t >= T.final) {
    const on = tw(t, T.final + 1.0 + i * 0.22, T.final + 1.3 + i * 0.22);
    return { active: on, done: on, fail: 0 };
  }
  const B = t >= T.rew[1];
  const inRew = t >= T.rew[0] && t < T.rew[1];
  const act = [T.where, T.event, T.confirm, T.execute][i];
  const done = [T.event, T.confirm, LAND[3], T.target][i];
  if (!B) {
    const clear = inRew && i >= 2 ? tw(t, T.rew[0], T.rew[0] + 0.8) : 0;
    return { active: tw(t, act, act + 0.4) * (1 - clear), done: tw(t, done, done + 0.3) * (1 - clear), fail: 0 };
  }
  if (i < 2) return { active: 1, done: 1, fail: 0 };
  if (i === 2) return { active: 1, done: 0, fail: tw(t, T.fail + 0.95, T.fail + 1.2) };
  return { active: 0, done: 0, fail: tw(t, T.fail + 1.1, T.fail + 1.35) };
}

function slotState(t, i) {
  if (t >= T.final) {
    const on = tw(t, T.final + 1.4 + i * 0.12, T.final + 1.6 + i * 0.12);
    return { ok: on, no: 0, pop: pulse(t, T.final + 1.4 + i * 0.12, 5) };
  }
  if (t < T.rew[0]) return { ok: tw(t, LAND[i], LAND[i] + 0.25), no: 0, pop: pulse(t, LAND[i], 5) };
  if (t < T.rew[1]) return { ok: 1 - tw(t, T.rew[0] + 0.2 + i * 0.12, T.rew[0] + 0.5 + i * 0.12), no: 0, pop: 0 };
  return { ok: 0, no: i === 2 ? 0 : tw(t, FAIL_T[i], FAIL_T[i] + 0.2), na: i === 2 ? tw(t, FAIL_T[i], FAIL_T[i] + 0.2) : 0, pop: pulse(t, FAIL_T[i], 5) };
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

/** Where each stage word sits while it flies in (opening), then settles in the rail. */
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
    // box
    if (frame > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * frame;
      rrect(ctx, s.x, RAIL_Y - RAIL_H / 2, s.w, RAIL_H, 12);
      ctx.fillStyle = rgba(C.panel, 0.72 + 0.1 * st.active);
      ctx.fill();
      const col = st.fail > 0.5 ? RED : st.done > 0.5 ? C.buy : st.active > 0 ? C.gold : C.line;
      ctx.strokeStyle = rgba(col, 0.35 + 0.55 * Math.max(st.active, st.done, st.fail));
      ctx.lineWidth = 1.6;
      if (st.active > 0 && st.done < 1 && st.fail < 1) {
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 14 * st.active * (0.7 + 0.3 * Math.sin(t * 5));
      }
      ctx.stroke();
      ctx.restore();
      // active underline sweep
      if (st.active > 0 && st.done < 1 && st.fail < 1) {
        const u = (t * 0.6) % 1;
        line(ctx, s.x + 14, RAIL_Y + RAIL_H / 2 - 5, s.x + 14 + (s.w - 28) * st.active, RAIL_Y + RAIL_H / 2 - 5, C.gold, 2, 0.5 * alpha);
        glow(ctx, s.x + 14 + (s.w - 28) * u, RAIL_Y + RAIL_H / 2 - 5, 18, C.gold, 0.6 * alpha * st.active);
      }
    }
    // word, flying from depth to its box
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
  // checklist slots inside 確認
  if (frame > 0)
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
      if (i === 0 && s.ok < 0.5 && s.no < 0.5) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.restore();
      const rt = t >= T.final ? T.final + 1.4 + i * 0.12 : t < T.rew[0] ? LAND[i] : FAIL_T[i];
      ring(ctx, x, y - 4, t, rt, { r0: 17, r1: 54, color: t >= T.rew[1] && t < T.final ? RED : C.buy, dur: 0.6 });
      checkGlyph(ctx, x, y - 4, 1.05, C.buy, a * s.ok);
      crossGlyph(ctx, x, y - 4, 0.95, RED, a * s.no);
      if (s.na > 0) line(ctx, x - 7, y - 4, x + 7, y - 4, C.muted, 3, a * s.na);
      text(ctx, name, x, y + 22, { family: F.tc, size: 12, weight: 700, color: s.ok > 0.5 ? C.buy : s.no > 0.5 ? RED : C.muted, align: "center", base: "middle", alpha: a * 0.95 });
    });
  if (frame > 0) {
    const req = alpha * frame * (1 - tw(t, T.rew[1], T.rew[1] + 0.5) + tw(t, T.final + 1.4, T.final + 1.8));
    text(ctx, "必要", slotXY(0)[0], RAIL_Y - 34, { family: F.tc, size: 11, weight: 700, color: C.gold, align: "center", alpha: req * 0.9 });
  }
}

// ---------------------------------------------------------------- evidence cards
/** 0..1: how much a hero card is on screen (for scrims and camera push-back). */
function heroAmt(t, t0) {
  return tw(t, t0 + 0.1, t0 + 0.5) * (1 - tw(t, t0 + 1.8, t0 + 2.2));
}

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
  text(ctx, e.hero, -w / 2 + 28, 6, { family: F.tc, size: 52, weight: 900, color: C.text, base: "middle", alpha: a, glow: 14, glowColor: e.color });
  text(ctx, e.sub, -w / 2 + 30, h / 2 - 30, { family: F.tc, size: 20, weight: 500, color: C.muted, base: "middle", alpha: a });
  ctx.restore();
}

function evidence(ctx, t, e, from) {
  const u = t - e.t0;
  if (u < 0 || u > EV_DUR + 0.05) return;
  // motion trail: ghost copies from a few frames back
  for (let k = 4; k >= 1; k--) {
    const pt = evidencePose(t - k * 0.028, e, from);
    const fast = u < 0.6 || u > 1.85;
    if (fast && t - k * 0.028 > e.t0) heroCard(ctx, pt, e, 0.14 * (1 - k / 5));
  }
  const pose = evidencePose(t, e, from);
  const fadeEnd = 1 - tw(u, EV_DUR - 0.12, EV_DUR);
  heroCard(ctx, pose, e, fadeEnd);
  if (u > EV_DUR - 0.2) burst(ctx, ...slotXY(e.slot), t, e.t0 + EV_DUR, { n: 14, speed: 240, color: C.buy, seed: e.slot + 5, flare: 60 });
}

// ---------------------------------------------------------------- the chart (world space)
function spreadX(i, spread, spread13 = 0) {
  let x = X(i);
  if (i !== 10) x += Math.sign(i - 10) * 190 * spread;
  if (i !== 13) x += Math.sign(i - 13) * 190 * spread13;
  return x;
}
/** 0..1 while the camera is inside bar 13's footprint. */
const imbFocus = (t) => tw(t, T.imb[0], T.imb[0] + 0.6) * (1 - tw(t, T.imb[1] - 0.45, T.imb[1]));

function world(ctx, t, S, o = {}) {
  const a = o.alpha ?? 1;
  const main = !o.pane;
  const vt = S.vt;
  const A = S.branch === "A";
  const spread = main && A ? tw(t, T.zoom, T.zoom + 1.0) * (1 - tw(t, T.zoomOut, T.zoomOut + 1.0)) : 0;
  const unfold10 = main && A ? tw(t, T.zoom + 0.5, T.zoom + 1.3) * (1 - tw(t, T.zoomOut, T.zoomOut + 0.7)) : 0;
  const spread13 = main && A ? tw(t, T.imb[0], T.imb[0] + 0.9) * (1 - tw(t, T.imb[1] - 0.8, T.imb[1])) : 0;
  const unfold13 = main && A ? tw(t, T.imb[0] + 0.5, T.imb[0] + 1.1) * (1 - tw(t, T.imb[1] - 0.8, T.imb[1] - 0.5)) : 0;
  const unfold = Math.max(unfold10, unfold13);
  const intro = main ? tw(t, 3.6, 4.5) : 1;

  priceGrid(ctx, t, { alpha: 0.28 * a, step: 36, oy: PY(104) });

  // ---- prior-day profile + value area
  const prof = main ? tw(t, 4.6, 6.4) : 1;
  const focus = o.profile ?? 1;
  const vaA = (main ? tw(t, 6.6, 7.4) : 1) * clamp(focus * 1.6 - 0.5);
  const maxV = Math.max(...Object.values(PRIOR));
  for (const [ps, v] of Object.entries(PRIOR)) {
    const p = Number(ps);
    const inVA = p >= VA.val && p <= VA.vah;
    const grow = ease.outCubic(prog(prof, (117 - p) * 0.025, (117 - p) * 0.025 + 0.55));
    if (grow <= 0) continue;
    const len = (v / maxV) * 230 * grow;
    ctx.save();
    ctx.globalAlpha = a * focus;
    rrect(ctx, PX, PY(p) - 14, len, 28, 4);
    ctx.fillStyle = p === VA.poc ? rgba(C.gold, 0.8) : rgba(inVA ? "#5a8fa8" : C.dim, inVA ? 0.55 : 0.4);
    ctx.fill();
    ctx.restore();
  }
  if (vaA > 0) {
    ctx.save();
    ctx.globalAlpha = a * vaA * 0.08;
    ctx.fillStyle = "#5a8fa8";
    ctx.fillRect(PX - 8, PY(VA.vah) - 18, 260, PY(VA.val) - PY(VA.vah) + 36);
    ctx.restore();
    const lab = (p, str, col) =>
      text(ctx, str, PX + 250, PY(p) + 1, { family: F.mono, size: 20, weight: 700, color: col, base: "middle", alpha: a * vaA });
    lab(VA.vah, `VAH ${VA.vah}`, C.muted);
    lab(VA.poc, `POC ${VA.poc}`, C.gold);
    lab(VA.val, `VAL ${VA.val}`, C.muted);
    text(ctx, "前一日成交分布", PX, PY(99) + 4, { family: F.tc, size: 22, weight: 800, color: C.muted, alpha: a * prof * focus });
    // faint level lines across the chart
    for (const p of [VA.vah, VA.poc]) line(ctx, X(0) - 40, PY(p), PX - 16, PY(p), p === VA.poc ? C.gold : C.muted, 1, a * vaA * 0.22, [6, 8]);
  }

  // ---- price labels
  for (let p = 94; p <= 117; p++) {
    const key = p === VA.val || p === VA.poc || p === VA.vah || p === 100 || p === S.last;
    text(ctx, String(p), X(0) - 60, PY(p) + 1, {
      family: F.mono,
      size: 17,
      weight: p === S.last ? 800 : 500,
      color: p === S.last ? C.gold : key ? C.text : C.dim,
      align: "right",
      base: "middle",
      alpha: a * intro * (key ? 0.95 : 0.6),
    });
  }

  // second axis on the chart's right edge, so the live bar always has prices beside it
  for (let p = 94; p <= 112; p++)
    text(ctx, String(p), PX - 30, PY(p) + 1, {
      family: F.mono,
      size: 15,
      weight: p === S.last ? 800 : 500,
      color: p === S.last ? C.gold : C.dim,
      align: "right",
      base: "middle",
      alpha: a * intro * (p === S.last ? 0.95 : 0.5) * (1 - unfold13),
    });

  // ---- location lines: VAL 102 and prior-day low 100
  const valA = main ? tw(t, T.where + 0.2, T.where + 0.8) : 0.8;
  const lowP = main ? tw(t, T.where + 0.7, T.where + 1.6, ease.inOutQuart) : 1;
  const reclaimed = A ? tw(vt, 41.2, 41.6) : 0;
  const lowBack = A ? tw(vt, 40.0, 40.4) : 0;
  if (valA > 0) {
    line(ctx, X(0) - 40, PY(VA.val), PX - 60, PY(VA.val), reclaimed > 0 ? C.buy : C.gold, 2 + reclaimed, a * valA * 0.75 * (1 - 0.85 * unfold), [12, 8]);
    tag(ctx, `VAL ${VA.val}`, X(0) - 34, PY(VA.val) - 26, { color: reclaimed > 0 ? C.buy : C.gold, size: 18, alpha: a * valA });
  }
  if (lowP > 0) {
    const x1 = PX - 60;
    const x0 = lerp(x1, X(0) - 40, lowP);
    const crack = main && A ? pulse(t, STOP_T, 3) : 0;
    neonPath(ctx, [[x0, PY(100)], [x1, PY(100)]], crack > 0.05 ? RED : lowBack > 0 ? C.buy : C.sell, 2.2 + 3 * crack, a * 0.85 * (1 - 0.6 * unfold), 0.8 + 2 * crack);
    if (lowP < 1) glow(ctx, x0, PY(100), 40, C.sell, a);
    tag(ctx, "前一日低點 100", X(0) - 34, PY(100) + 26, { color: lowBack > 0 ? C.buy : C.sell, size: 18, alpha: a * lowP });
  }

  // ---- heatmap bands (resting bids)
  const heatA = main ? tw(t, 5.2, 6.2) : 1;
  for (const s of S.heat) {
    const k = clamp(s.q / 300);
    const hl = s.p === 98 && main && A ? tw(t, T.where + 2.4, T.where + 2.9) * (1 - tw(t, T.event, T.event + 0.6)) : 0;
    ctx.save();
    ctx.globalAlpha = a * heatA * (0.14 + 0.5 * k + 0.3 * hl) * (1 - 0.75 * unfold);
    const g = ctx.createLinearGradient(0, PY(s.p) - 16, 0, PY(s.p) + 16);
    g.addColorStop(0, rgba(C.buy, 0));
    g.addColorStop(0.5, rgba(k > 0.6 ? "#f4e7b0" : C.buy, 1));
    g.addColorStop(1, rgba(C.buy, 0));
    ctx.fillStyle = g;
    ctx.fillRect(s.x0, PY(s.p) - 16, s.x1 - s.x0, 32);
    ctx.restore();
  }
  if (main && A) {
    const wl = tw(t, T.where + 2.4, T.where + 2.9) * (1 - tw(t, T.event + 1.6, T.event + 2.2));
    if (wl > 0) tag(ctx, `買牆 ${S.book[98] ?? 0} 隻 · 熱力圖`, X(6) - 20, PY(98) + 30, { color: C.buy, size: 18, alpha: a * wl });
    // the cancelled 220 evaporates
    const ev = t - T.cancel;
    if (ev > 0 && ev < 1.6 && t < T.rew[0])
      for (let i = 0; i < 26; i++) {
        const x = lerp(X(6) - 30, X(10) - 22, rnd(41, i)) + ev * rrange(42, i, 20, 90);
        const y = PY(98) + rrange(43, i, -12, 12) - ev * ev * rrange(44, i, 40, 160);
        glow(ctx, x, y, 10 * (1 - ev / 1.6), C.buy, 0.9 * (1 - ev / 1.6));
      }
    if (t < T.rew[0]) {
      floatChip(ctx, "撤單 −220", X(9), PY(98) - 34, t, T.cancel, { color: RED, size: 30, dur: 1.6 });
      const cx = tw(t, T.cancel + 0.2, T.cancel + 0.5) * (1 - tw(t, 18.1, 18.4));
      if (cx > 0) tag(ctx, "撤單：沒有成交，價格不動", X(6) - 20, PY(95.8), { color: RED, size: 18, alpha: a * cx });
      [20.75, 21.4].forEach((ts, k) => floatChip(ctx, "97 補 +" + [80, 70][k], X(10) - 80, PY(97) + 4, t, ts, { color: C.buy, size: 24, dur: 1.0, rise: 30 }));
    }
  }

  // ---- stops waiting below the low
  const stopsIn = main ? tw(t, T.where + 1.4, T.where + 1.9) : 0;
  const stopT = STOP_T;
  if (stopsIn > 0 && vt < stopT + 1.2) {
    for (let i = 0; i < 6; i++) {
      const pop = ease.outBack(prog(t, T.where + 1.4 + i * 0.06, T.where + 1.8 + i * 0.06));
      const fired = prog(vt, stopT + i * 0.04, stopT + 0.35 + i * 0.04);
      const bx = X(10) + 50 + i * 30;
      const by = PY(99) + fired * 50 * (1 + i * 0.2);
      if (fired < 1) bear(ctx, bx, by, 24 * pop * (1 + fired * 0.6), C.sell, a * clamp(pop) * (1 - fired), { outline: fired < 0.05 });
      if (fired > 0 && fired < 1) glow(ctx, bx, by, 40, C.sell, 0.8 * (1 - fired));
    }
    const lb = stopsIn * (1 - tw(vt, stopT, stopT + 0.3));
    if (lb > 0) tag(ctx, "多單停損 99 · 強平價在更下方", X(10) + 36, PY(99) + 36, { color: C.sell, size: 18, alpha: a * lb });
  }

  // ---- candles + volume + delta
  S.bars.forEach((b, i) => {
    const x = spreadX(i, spread, spread13);
    const pop = main && i < 10 ? tw(t, 4.0 + i * 0.1, 4.4 + i * 0.1) : 1;
    if (!b) {
      if (i === 10 && main && t >= T.event && vt < 18.4) {
        ctx.save();
        ctx.globalAlpha = a * 0.35 * tw(t, T.event, T.event + 0.4);
        ctx.strokeStyle = C.line;
        ctx.setLineDash([5, 6]);
        rrect(ctx, x - 22, PY(103), 44, PY(96) - PY(103), 6);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    const focusDim = (i === 10 ? 1 : 1 - 0.55 * spread) * (i === 13 ? 1 : 1 - 0.55 * spread13);
    const isLive = i === S.live && i >= 10;
    const body = i === 10 ? 1 - unfold10 * 0.75 : i === 13 ? 1 - unfold13 * 0.75 : 1;
    candle(ctx, x, 34 * body, PY(b.o), PY(b.h), PY(b.l), PY(b.c), {
      alpha: a * pop * focusDim,
      wickWidth: 3,
      minBody: 5,
      glow: isLive && main ? 16 : 0,
    });
    const col = b.c >= b.o ? C.buy : C.sell;
    ctx.save();
    ctx.globalAlpha = a * pop * focusDim;
    rrect(ctx, x - 17, VB - b.vis * VS, 34, b.vis * VS, 4);
    ctx.fillStyle = rgba(col, 0.55);
    ctx.fill();
    ctx.restore();
    if (b.v > 0)
      text(ctx, String(b.v), x, VB - b.vis * VS - 12, { family: F.display, size: 20, weight: 700, color: C.text, align: "center", alpha: a * pop * focusDim * 0.9 });
    if (!b.pending) {
      const dv = b.d;
      const hlD = main && A && (i === 10 || i === 11) ? tw(t, T.diverge, T.diverge + 0.4) * (1 - tw(t, T.reclaim, T.reclaim + 0.5)) : 0;
      text(ctx, signed(dv), x, VB + 24, {
        family: F.mono,
        size: 15 + hlD * 7,
        weight: 700,
        color: dv >= 0 ? C.buy : C.sell,
        align: "center",
        alpha: a * pop * focusDim * (0.8 + 0.2 * hlD),
        glow: hlD * 12,
      });
    }
  });
  text(ctx, "量 / Δ", X(0) - 60, VB - 10, { family: F.tc, size: 18, weight: 700, color: C.muted, align: "right", alpha: a * intro });

  // ---- live price marker
  if (S.live >= 10 && unfold < 0.05) {
    const y = PY(S.last);
    const xl = spreadX(S.live, spread) + 24;
    line(ctx, xl, y, xl + 70, y, C.gold, 2, a * 0.8);
    glow(ctx, xl, y, 20, C.gold, a * 0.6);
  }

  // ---- OI panel (neutral colour: OI has no side)
  const oiA = main ? tw(t, 5.0, 5.8) : 1;
  if (oiA > 0) {
    const top = OIY(1470);
    ctx.save();
    ctx.globalAlpha = a * oiA;
    rrect(ctx, X(0) - 40, top - 30, X(16) - X(0) + 110, OIY(800) - top + 50, 14);
    ctx.fillStyle = rgba(C.ink, 0.55);
    ctx.fill();
    ctx.strokeStyle = rgba(C.line, 0.9);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    text(ctx, "未平倉量 OI（隻）", X(0) - 24, top - 4, { family: F.tc, size: 18, weight: 800, color: OI_COL, alpha: a * oiA });
    const draw = main ? tw(t, 5.2, 7.0, ease.inOutQuad) : 1;
    const pts = S.oiPts.map(([x, v]) => [x < X(10) - 30 ? x : x + (spread ? 0 : 0), OIY(v)]);
    const n = Math.max(2, Math.ceil(pts.length * draw));
    neonPath(ctx, pts.slice(0, n), OI_COL, 2.6, a * oiA, 0.9);
    const endPt = pts[n - 1];
    glow(ctx, endPt[0], endPt[1], 22, OI_COL, a * oiA * 0.8);
    text(ctx, fmt(S.oiExact), endPt[0] + 16, endPt[1] - 14, { family: F.display, size: 26, weight: 700, color: OI_COL, alpha: a * oiA * draw });
    if (main) oiNotes(ctx, t, S, a, pts);
  }
}

function oiNotes(ctx, t, S, a, pts) {
  const A = S.branch === "A";
  // +240 new positions on the way down
  const up = tw(t, T.whereOI + 0.4, T.whereOI + 0.9) * (1 - tw(t, T.event, T.event + 0.5));
  if (A && up > 0) {
    neonPath(ctx, pts.slice(0, 11), C.gold, 3.4, a * up, 1.4);
    const x = X(9) + 50;
    line(ctx, x, OIY(OI0), x, OIY(1240), C.gold, 2, a * up);
    line(ctx, x - 8, OIY(OI0), x + 8, OIY(OI0), C.gold, 2, a * up);
    line(ctx, x - 8, OIY(1240), x + 8, OIY(1240), C.gold, 2, a * up);
    tag(ctx, "+240 新倉（不分多空）", x + 16, OIY(1120), { color: C.gold, size: 20, alpha: a * up });
  }
  // the cliff
  const cliff = A ? tw(t, T.confirm + 0.3, T.confirm + 0.8) * (1 - tw(t, T.zoom, T.zoom + 0.4)) : 0;
  if (cliff > 0) {
    const seg = pts.filter(([x]) => x >= X(10) - 26 && x <= X(10) + 26);
    neonPath(ctx, seg, C.gold, 4, a * cliff * (0.6 + 0.4 * Math.sin(t * 8)), 1.6);
    tag(ctx, "OI −240：停損與強平把舊倉平掉", X(10) + 60, OIY(900), { color: C.gold, size: 20, alpha: a * cliff });
  }
  // short covering on the rally
  const cover = A ? tw(S.vt, 54.0, 54.5) * (1 - tw(t, T.rew[0], T.rew[0] + 0.3)) : 0;
  if (cover > 0) {
    const seg = pts.filter(([x]) => x >= X(12) - 26);
    neonPath(ctx, seg, C.buy, 3.4, a * cover, 1.2);
    tag(ctx, "價格漲、OI 降：空單回補", X(13), OIY(860) + 26, { color: C.buy, size: 20, alpha: a * cover });
  }
  // B: new positions pour in
  const inflow = !A ? tw(S.vt, 60.4, 60.9) * (1 - tw(t, T.split, T.split + 0.4)) : 0;
  if (inflow > 0) {
    const seg = pts.filter(([x]) => x >= X(10) - 26);
    neonPath(ctx, seg, RED, 3.6, a * inflow, 1.4);
    tag(ctx, "OI +180：新倉湧入", X(5), OIY(1400), { color: RED, size: 20, alpha: a * inflow });
  }
}

// ---- footprint of the sweep bar, unfolded out of its candle
function footprintView(ctx, t, a) {
  const unfold = tw(t, T.zoom + 0.5, T.zoom + 1.3) * (1 - tw(t, T.zoomOut, T.zoomOut + 0.7));
  if (unfold <= 0) return;
  const fp = footprint(TRADES_A, 10);
  const FW = 92 * unfold;
  const x = X(10);
  const al = a * unfold;
  text(ctx, "主動賣", x - 18 - FW / 2, PY(101.75), { family: F.tc, size: 13, weight: 700, color: C.sell, align: "center", alpha: al });
  text(ctx, "主動買", x + 18 + FW / 2, PY(101.75), { family: F.tc, size: 13, weight: 700, color: C.buy, align: "center", alpha: al });
  const inRe = t >= T.zoom && t < T.zoomOut + 0.6;
  for (let p = 97; p <= 101; p++) {
    const cell = fp[p] ?? { bid: 0, ask: 0 };
    let bid = cell.bid;
    if (p === 97 && inRe) {
      bid = 0;
      [60, 50, 40].forEach((q, k) => (bid += t >= T.replay[k] ? q : 0));
    }
    const hl = p === 97 ? tw(t, T.replay[0] - 0.4, T.replay[0]) : 0;
    const y = PY(p);
    for (const [side, v] of [["bid", bid], ["ask", cell.ask]]) {
      const x0 = side === "bid" ? x - 16 - FW : x + 16;
      ctx.save();
      ctx.globalAlpha = al;
      rrect(ctx, x0, y - 16, FW, 32, 5);
      const heat = clamp(v / 150);
      ctx.fillStyle = rgba(side === "bid" ? C.sell : C.buy, 0.08 + 0.42 * heat);
      ctx.fill();
      if (p === 97 && side === "bid" && hl > 0) {
        ctx.strokeStyle = rgba(C.gold, hl);
        ctx.lineWidth = 2;
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 16 * (0.6 + 0.4 * Math.sin(t * 7));
        ctx.stroke();
      }
      ctx.restore();
      text(ctx, String(v), x0 + FW / 2, y + 1, { family: F.display, size: 21, weight: 700, color: v ? C.text : C.dim, align: "center", base: "middle", alpha: al });
    }
  }
  // the passive bid at 97 being hit and refilled (replayed)
  if (inRe) {
    let q = 60;
    const steps = [
      [T.replay[0], -60],
      [T.refill[0], 80],
      [T.replay[1], -50],
      [T.refill[1], 70],
      [T.replay[2], -40],
    ];
    let hit = 0;
    for (const [ts, dq] of steps)
      if (t >= ts) {
        q += dq;
        hit = ts;
      }
    const bx = x - 16 - FW - 12;
    const w = q * 0.55;
    ctx.save();
    ctx.globalAlpha = al;
    rrect(ctx, bx - w, PY(97) - 11, w, 22, 4);
    ctx.fillStyle = rgba(C.buy, 0.75);
    ctx.shadowColor = C.buy;
    ctx.shadowBlur = 10 + 20 * pulse(t, hit, 4);
    ctx.fill();
    ctx.restore();
    text(ctx, `掛買 ${q}`, bx - w - 8, PY(97) + 1, { family: F.tc, size: 13, weight: 800, color: C.buy, align: "right", base: "middle", alpha: al });
    T.refill.forEach((ts, k) => floatChip(ctx, `補 +${[80, 70][k]}`, bx - 40, PY(97) - 22, t, ts, { color: C.buy, size: 18, dur: 0.9, rise: 26 }));
    T.replay.forEach((ts, k) => burst(ctx, x - 16 - FW / 2, PY(97), t, ts, { n: 16, speed: 160, color: C.sell, seed: 60 + k, flare: 34 }));
    // the floor
    const fl = tw(t, T.replay[0] + 0.2, T.replay[0] + 0.6);
    neonPath(ctx, [[x - 16 - FW - 70, PY(97) + 17], [x + 16 + FW + 30, PY(97) + 17]], C.gold, 1.6, al * fl, 1);
    text(ctx, "價格停在 97", x + 16 + FW + 6, PY(97) + 34, { family: F.tc, size: 14, weight: 800, color: C.gold, alpha: al * fl });
    const rp = tw(t, T.replay[0] - 0.5, T.replay[0] - 0.2);
    text(ctx, "回看 97 · 已發生的成交", x, PY(102.45), { family: F.tc, size: 14, weight: 800, color: C.gold, align: "center", alpha: al * rp, ls: 1 });
  }
}

// ---- bar 13 up close: two stacked diagonal buy imbalances
function imbalanceView(ctx, t, a) {
  const unfold = tw(t, T.imb[0] + 0.5, T.imb[0] + 1.1) * (1 - tw(t, T.imb[1] - 0.8, T.imb[1] - 0.5));
  if (unfold <= 0) return;
  const fp = footprint(TRADES_A, 13);
  const FW = 84 * unfold;
  const x = X(13);
  const al = a * unfold;
  const bidX = x - 16 - FW;
  const askX = x + 16;
  text(ctx, "第 13 根足跡 · 斜著比", x, PY(103.55), { family: F.tc, size: 15, weight: 800, color: C.gold, align: "center", alpha: al, ls: 1 });
  text(ctx, "主動賣", bidX + FW / 2, PY(102.75), { family: F.tc, size: 13, weight: 700, color: C.sell, align: "center", alpha: al });
  text(ctx, "主動買", askX + FW / 2, PY(102.75), { family: F.tc, size: 13, weight: 700, color: C.buy, align: "center", alpha: al });
  const pairs = [
    { p: 101, t0: T.imb[0] + 0.9 },
    { p: 102, t0: T.imb[0] + 1.35 },
  ];
  for (let p = 100; p <= 102; p++) {
    const cell = fp[p] ?? { bid: 0, ask: 0 };
    const pair = pairs.find((q) => q.p === p);
    const lit = pair ? tw(t, pair.t0 + 0.3, pair.t0 + 0.5) : 0;
    for (const [side, v] of [["bid", cell.bid], ["ask", cell.ask]]) {
      const x0 = side === "bid" ? bidX : askX;
      ctx.save();
      ctx.globalAlpha = al;
      rrect(ctx, x0, PY(p) - 16, FW, 32, 5);
      ctx.fillStyle = rgba(side === "bid" ? C.sell : C.buy, 0.08 + 0.4 * clamp(v / 80) + (side === "ask" ? 0.3 * lit : 0));
      ctx.fill();
      if (side === "ask" && lit > 0) {
        ctx.strokeStyle = rgba(C.buy, lit);
        ctx.lineWidth = 2;
        ctx.shadowColor = C.buy;
        ctx.shadowBlur = 16;
        ctx.stroke();
      }
      ctx.restore();
      text(ctx, String(v), x0 + FW / 2, PY(p) + 1, { family: F.display, size: 21, weight: 700, color: v ? C.text : C.dim, align: "center", base: "middle", alpha: al });
    }
  }
  // diagonal comparison: this price's buying against the selling one tick lower
  for (const { p, t0 } of pairs) {
    const ask = fp[p].ask;
    const bid = fp[p - 1].bid;
    const u = tw(t, t0, t0 + 0.35, ease.outCubic);
    arrow(ctx, bidX + FW / 2 + 14, PY(p - 1) - 6, askX + FW / 2 - 18, PY(p) + 6, C.gold, u, { width: 2.4, head: 9, alpha: al });
    const la = al * tw(t, t0 + 0.3, t0 + 0.5);
    tag(ctx, `${ask} ÷ ${bid} = ${+(ask / bid).toFixed(1)} 倍`, askX + FW + 10, PY(p), { color: C.buy, size: 15, alpha: la });
    if (u > 0 && u < 1) glow(ctx, lerp(bidX + FW / 2, askX + FW / 2, u), lerp(PY(p - 1), PY(p), u), 18, C.gold, al);
  }
  const sum = al * tw(t, T.imb[0] + 1.8, T.imb[0] + 2.1);
  tag(ctx, "連續兩格 ≥ 3 倍：買方不平衡堆疊", x, PY(99.35), { align: "center", color: C.buy, solid: true, size: 15, alpha: sum });
}

// ---- event labels and plan (world space, branch A)
function planA(ctx, t, S, a) {
  const vt = S.vt;
  const live = t < T.rew[0];
  // stop trigger stamp and liquidations
  if (live) {
    ring(ctx, X(10), PY(99), t, STOP_T, { r1: 360, color: RED, w: 6, dur: 1.1 });
    ring(ctx, X(10), PY(99), t, STOP_T + 0.12, { r1: 220, color: C.gold, w: 3, dur: 0.8 });
    const st = tw(t, STOP_T, STOP_T + 0.12) * (1 - tw(t, 22.4, 22.9));
    if (st > 0) tag(ctx, "停損觸發 → 市價賣出", X(10) + 40, PY(101.2), { color: C.sell, solid: true, size: 20, alpha: a * st });
    [[19.95, 98], [20.4, 97], [21.05, 97]].forEach(([ts, p], k) => {
      const q = tw(t, ts, ts + 0.1) * (1 - tw(t, 22.6, 23.0));
      if (q > 0) tag(ctx, "強平", X(10) + 40 + k * 64, PY(p) + 30, { color: RED, size: 16, alpha: a * q });
    });
  }
  // divergence: equal lows, shrinking delta
  const dv = tw(vt, T.diverge, T.diverge + 0.5) * (live ? 1 - tw(t, T.reclaim, T.reclaim + 0.5) : 0);
  if (dv > 0) {
    neonPath(ctx, [[X(10) - 24, PY(97) + 22], [X(11) + 24, PY(97) + 22]], C.gold, 2, a * dv, 1);
    text(ctx, "同一個低點 97", X(10.5), PY(97) + 46, { family: F.tc, size: 18, weight: 800, color: C.gold, align: "center", alpha: a * dv });
    arrow(ctx, X(10) + 8, VB + 44, X(11) - 8, VB + 44, C.gold, tw(vt, T.diverge + 0.2, T.diverge + 0.7), { width: 2, head: 10, alpha: a * dv });
    text(ctx, "賣壓 −260 → −60", X(10.5), VB + 70, { family: F.tc, size: 17, weight: 800, color: C.gold, align: "center", alpha: a * dv });
  }
  // reclaim shockwaves
  if (live) {
    ring(ctx, X(12), PY(100), t, 40.0, { r1: 140, color: C.buy, w: 3 });
    ring(ctx, X(12), PY(102), t, 41.2, { r1: 200, color: C.buy, w: 4 });
    const rc = tw(t, 41.2, 41.5) * (1 - tw(t, 44.2, 44.6));
    if (rc > 0) tag(ctx, "收回 VAL：回到價值區", X(12) + 34, PY(103), { color: C.buy, solid: true, size: 20, alpha: a * rc });
  }
  // void line
  const vl = tw(vt, T.execute + 0.3, T.execute + 1.0);
  if (vl > 0) {
    const x0 = X(12) - 20;
    const x1 = lerp(x0, X(16) + 60, tw(vt, T.execute + 0.3, T.execute + 1.2, ease.outQuart));
    line(ctx, x0, PY(PLAN.voidLine), x1, PY(PLAN.voidLine), C.muted, 2, a * vl * (0.6 + 0.3 * Math.sin(t * 4)), [8, 8]);
    const lb = vl * (live ? 1 - tw(t, T.risk, T.risk + 0.4) : 0);
    tag(ctx, `作廢線 ${PLAN.voidLine}：先過線沒回測就放掉`, X(12) - 20, PY(PLAN.voidLine) - 26, { color: C.muted, size: 17, alpha: a * lb });
  }
  // thin selling on the retest
  const thin = tw(vt, 46.2, 46.5) * (live ? 1 - tw(t, T.risk, T.risk + 0.4) : 0);
  if (thin > 0) tag(ctx, "回測：主動賣只剩 30", X(13) + 36, PY(99) + 4, { color: C.sell, size: 18, alpha: a * thin });
  // entry pin
  const pin = spring(vt, PLAN.entryT, 16, 7);
  if (pin > 0 && vt >= PLAN.entryT) {
    const y = PY(PLAN.entry) - (1 - pin) * 160;
    ctx.save();
    ctx.globalAlpha = a * clamp(pin * 3);
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.moveTo(X(13) - 30, y);
    ctx.lineTo(X(13) - 48, y - 12);
    ctx.lineTo(X(13) - 48, y + 12);
    ctx.closePath();
    ctx.shadowColor = C.gold;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.restore();
    const ex = lerp(X(13) - 30, X(16) + 56, tw(vt, PLAN.entryT, PLAN.entryT + 0.5, ease.outQuart));
    line(ctx, X(13) - 30, PY(PLAN.entry), ex, PY(PLAN.entry), C.gold, 2, a * clamp(pin * 3));
    tag(ctx, `進場 ${PLAN.entry}`, ex + 8, PY(PLAN.entry), { color: C.gold, solid: true, size: 18, alpha: a * clamp(pin * 3) });
    if (live) ring(ctx, X(13) - 30, PY(PLAN.entry), t, PLAN.entryT + 0.15, { r1: 110, color: C.gold, w: 3 });
  }
  // stacked buy imbalance
  const imb = tw(vt, 47.5, 47.8) * (live ? 1 - tw(t, T.rally + 1.2, T.rally + 1.6) : 0);
  if (imb > 0) {
    for (const p of [101, 102]) {
      const x = X(13) + 30;
      ctx.save();
      ctx.globalAlpha = a * imb;
      ctx.fillStyle = C.buy;
      ctx.shadowColor = C.buy;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(x, PY(p) + 8);
      ctx.lineTo(x + 10, PY(p) - 8);
      ctx.lineTo(x + 20, PY(p) + 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    tag(ctx, "連續兩格買方不平衡", X(13) + 58, PY(103.2), { color: C.buy, size: 17, alpha: a * imb });
  }
  // risk / reward
  const rr = tw(vt, T.risk, T.risk + 0.9, ease.outQuart);
  if (rr > 0) {
    const x0 = X(13) - 30;
    const x1 = lerp(x0, X(16) + 56, rr);
    ctx.save();
    ctx.globalAlpha = a * 0.16;
    ctx.fillStyle = C.sell;
    ctx.fillRect(x0, PY(PLAN.entry), x1 - x0, PY(PLAN.stop) - PY(PLAN.entry));
    ctx.fillStyle = C.buy;
    ctx.fillRect(x0, PY(PLAN.t2), x1 - x0, PY(PLAN.entry) - PY(PLAN.t2));
    ctx.restore();
    line(ctx, x0, PY(PLAN.entry), x1, PY(PLAN.entry), C.gold, 2, a);
    line(ctx, x0, PY(PLAN.stop), x1, PY(PLAN.stop), C.sell, 2.4, a);
    line(ctx, x0, PY(PLAN.t1), x1, PY(PLAN.t1), C.buy, 2.4, a, [10, 6]);
    line(ctx, x0, PY(PLAN.t2), x1, PY(PLAN.t2), C.buy, 2, a * 0.8, [4, 6]);
    const la = a * tw(vt, T.risk + 0.5, T.risk + 0.9);
    const lx = X(16) + 64;
    tag(ctx, `停損 ${PLAN.stop} · 吸收低點外 1 元`, lx, PY(PLAN.stop), { color: C.sell, size: 18, alpha: la });
    tag(ctx, `目標一 ${PLAN.t1} · POC · ${R(PLAN.t1).toFixed(1)}R`, lx, PY(PLAN.t1), { color: C.buy, size: 18, alpha: la });
    tag(ctx, `目標二 ${PLAN.t2} · VAH · ${R(PLAN.t2).toFixed(1)}R`, lx, PY(PLAN.t2), { color: C.buy, size: 18, alpha: la });
  }
  if (live) {
    ring(ctx, X(16), PY(PLAN.t1), t, T.target, { r1: 220, color: C.buy, w: 4, dur: 1 });
    burst(ctx, X(16), PY(PLAN.t1), t, T.target, { n: 30, speed: 420, color: C.buy, seed: 77, flare: 120 });
    const hit = tw(t, T.target, T.target + 0.2) * (1 - tw(t, T.rew[0], T.rew[0] + 0.3));
    if (hit > 0) tag(ctx, `到達目標一 ${PLAN.t1}`, X(16), PY(PLAN.t1) - 40, { align: "center", color: C.buy, solid: true, size: 22, alpha: a * hit });
  }
}

function planB(ctx, t, S, a) {
  const vt = S.vt;
  const n97 = tw(vt, 60.5, 60.8) * (1 - tw(t, 62.6, 63.0));
  if (n97 > 0) tag(ctx, "97 沒有補單", X(10) + 40, PY(97), { color: RED, size: 20, alpha: a * n97 });
  const low = tw(vt, 61.6, 61.9) * (1 - tw(t, T.split, T.split + 0.3));
  if (low > 0) tag(ctx, "一路賣到 95", X(10) + 40, PY(95) + 30, { color: C.sell, size: 20, alpha: a * low });
  // today's new profile, below the old value
  const prof = profileB(vt);
  const pa = tw(vt, 63.2, 63.8);
  if (pa > 0) {
    const x0 = X(13) + 70;
    const maxV = 270;
    for (const [ps, v] of Object.entries(prof)) {
      const p = Number(ps);
      if (v <= 0) continue;
      ctx.save();
      ctx.globalAlpha = a * pa;
      rrect(ctx, x0, PY(p) - 14, (v / maxV) * 190, 28, 4);
      ctx.fillStyle = p === 96 && vt >= 65.6 ? rgba(C.gold, 0.85) : rgba(C.sell, 0.45);
      ctx.fill();
      ctx.restore();
    }
    text(ctx, "今天新的成交分布", x0, PY(102.2), { family: F.tc, size: 18, weight: 800, color: C.sell, alpha: a * pa });
    const poc = tw(vt, 65.6, 66.0);
    if (poc > 0) tag(ctx, "新 POC 96：在區外建立價值", x0 + 200, PY(96), { color: C.gold, size: 18, alpha: a * poc });
  }
  const no = tw(t, T.fail + 1.0, T.fail + 1.2) * (1 - tw(t, T.split, T.split + 0.3));
  if (no > 0) {
    const s = 1 + 0.6 * (1 - ease.outBack(prog(t, T.fail + 1.0, T.fail + 1.4)));
    ctx.save();
    ctx.translate(X(14.6), PY(104.6));
    ctx.rotate(-0.08);
    ctx.scale(s, s);
    rrect(ctx, -120, -40, 240, 80, 14);
    ctx.globalAlpha = a * no;
    ctx.strokeStyle = RED;
    ctx.lineWidth = 4;
    ctx.shadowColor = RED;
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(X(14.6), PY(104.6));
    ctx.rotate(-0.08);
    ctx.scale(s, s);
    text(ctx, "不進場", 0, 2, { family: F.tc, size: 44, weight: 900, color: RED, align: "center", base: "middle", alpha: a * no });
    ctx.restore();
  }
}

// ---------------------------------------------------------------- panes (split screen)
function pane(ctx, t, S, rect, cam, o) {
  ctx.save();
  rrect(ctx, rect.x, rect.y, rect.w, rect.h, 22);
  ctx.fillStyle = "rgba(6,11,19,0.94)";
  ctx.fill();
  ctx.clip();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);
  world(ctx, t, S, { pane: true, alpha: o.alpha, profile: S.branch === "A" ? 0.3 : 1 });
  if (S.branch === "A") planA(ctx, t, S, o.alpha);
  else planB(ctx, t, S, o.alpha * 0.9);
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
  id: "failed-auction",
  title: "掃過前低，收回才算數",
  duration: T.end,
  description:
    "跌破前一日低點，停損與強平湧出、OI 驟降，97 的買單補了又補；再探低點賣壓變小、收回 102。等回測 101 進場，停損 96、目標 108／112。倒回同一個跌破：這次新倉湧入、價格沒回來，就不做。",
  note: "地點、事件、確認、執行：\n收回才算數。",
  footer:
    "教學用合成行情：同一份逐筆帳本產生 K 線、足跡、量、OI 與掛單。作廢線、停損位置與 3 倍不平衡為本課設定；OI 只表示開平倉，不表示多空方向。",
  audio: "./motion/audio/failed-auction.m4a",
  music: {
    palette: "tense",
    bpm: 120,
    sections: [
      { t: 0, level: 0 },
      { t: T.over, level: 1 },
      { t: T.event, level: 2 },
      { t: 18.2, level: 3 },
      { t: T.confirm, level: 1 },
      { t: T.zoom, level: 2 },
      { t: T.reclaim, level: 3 },
      { t: T.execute, level: 2 },
      { t: T.rally, level: 3 },
      { t: T.rew[0], level: 0 },
      { t: T.rew[1], level: 2 },
      { t: T.fail, level: 1 },
      { t: T.split, level: 2 },
      { t: T.final, level: 1 },
      { t: 75.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "全景：緩跌到前低" },
    { t: T.where, label: "地點：停損在哪裡" },
    { t: T.event, label: "事件：掃蕩" },
    { t: T.confirm, label: "確認：誰贏了" },
    { t: T.execute, label: "執行：等回測" },
    { t: T.rew[0], label: "另一個結局" },
    { t: T.split, label: "兩種結局" },
  ],
  captions: [
    { a: 4.6, b: 8.1, text: "一段緩跌，停在前低上方。" },
    { a: 8.2, b: 12.5, text: "前低下方，停損堆在這裡。" },
    { a: 12.6, b: 15.5, text: "下跌途中，新倉一路增加。" },
    { a: 15.6, b: 18.1, text: "牆還沒被碰到，先撤了。" },
    { a: 18.2, b: 23.5, text: "跌破前低，停損與強平一起湧出。" },
    { a: 23.6, b: 27.1, text: "OI 驟降：舊倉被清洗。" },
    { a: 27.2, b: 33.9, text: "回看 97：賣了 150，價格推不動。" },
    { a: 34.2, b: 39.3, text: "再探低點，賣壓少了很多。" },
    { a: 39.4, b: 44.4, text: "收回前低：這次拍賣失敗了。" },
    { a: 44.6, b: 47.7, text: "不追，等它回來測。" },
    { a: 47.8, b: 51.1, text: "回測時，買方連兩格壓過賣方。" },
    { a: 51.2, b: 52.7, text: "停損放在吸收之外。" },
    { a: 52.8, b: 57.5, text: "下跌時的新空單，成了上漲燃料。" },
    { a: 57.6, b: 59.5, text: "回到同一個跌破。" },
    { a: 59.6, b: 66.1, text: "這次新倉湧入，價格沒有回來。" },
    { a: 66.2, b: 68.1, text: "條件不齊，就不做。" },
    { a: 68.2, b: 72.7, text: "同一個跌破，兩種結局。" },
    { a: 72.8, b: 77, text: "掃過前低，收回才算數。" },
  ],
  flashes: [
    { t: T.open + 0.9, amt: 0.35, decay: 5, pre: 0.5 },
    { t: STOP_T, amt: 0.45, decay: 6, pre: 0.25 },
    ...LAND.map((t) => ({ t, amt: 0.12, decay: 10 })),
    { t: 41.2, amt: 0.25, decay: 7 },
    { t: T.target, amt: 0.25, decay: 6 },
    { t: T.rew[1], amt: 0.3, decay: 7 },
    { t: 60.9, amt: 0.3, decay: 6 },
  ],
  cues: [
    { t: 0.1, kind: "tick", vel: 0.4 },
    ...RAIL.map((_, i) => ({ t: 0.3 + i * 0.26 + 0.5, kind: "whoosh", dur: 0.4, vel: 0.7 })),
    ...RAIL.map((_, i) => ({ t: 0.3 + i * 0.26 + 0.75, kind: "stamp" })),
    { t: 1.35, kind: "type", n: 10 },
    { t: 2.6, kind: "riser", dur: 1.3 },
    { t: T.open + 0.9, kind: "impact", big: true },
    ...HIST.map((_, i) => ({ t: 4.0 + i * 0.1, kind: "blip", vel: 0.22, freq: 900 + i * 50 })),
    { t: 5.0, kind: "swell", dur: 2.0 },
    { t: T.where + 0.3, kind: "scan", price: VA.val },
    { t: T.where + 0.8, kind: "whoosh", dur: 0.9 },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ t: T.where + 1.45 + i * 0.06, kind: "tick", vel: 0.3 })),
    { t: T.where + 2.4, kind: "shimmer" },
    { t: T.whereOI + 0.4, kind: "rise", dur: 0.6 },
    { t: T.event, kind: "thud" },
    { t: T.cancel, kind: "drain", dur: 0.7 },
    { t: 17.6, kind: "riser", dur: 1.9 },
    ...TRADES_A.filter((x) => x.bar === 10).map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side, big: x.t === STOP_T })),
    { t: STOP_T, kind: "impact", big: true },
    { t: STOP_T + 0.05, kind: "alarm" },
    { t: STOP_T + 0.2, kind: "rumble", dur: 2.6 },
    ...EVIDENCE.flatMap((e) => [
      { t: e.t0 + 0.05, kind: "whoosh", dur: 0.6 },
      { t: e.t0 + 0.55, kind: "impact", vel: 0.55 },
      { t: e.t0 + 1.9, kind: "whoosh", dur: 0.5, vel: 0.8 },
      { t: e.t0 + EV_DUR, kind: "stamp" },
    ]),
    { t: T.zoom + 0.2, kind: "whoosh", dur: 1.1 },
    // the absorption: the same note, again and again
    ...T.replay.map((t) => ({ t, kind: "fill", price: 97, side: "sell" })),
    ...T.refill.map((t) => ({ t, kind: "rise", dur: 0.3 })),
    ...TRADES_A.filter((x) => x.bar >= 11 && x.bar <= 13).map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side, soft: x.qty < 30 })),
    { t: 40.0, kind: "rise", dur: 0.5 },
    { t: 41.2, kind: "impact" },
    { t: LAND[3] + 0.1, kind: "shimmer" },
    { t: T.execute + 0.3, kind: "scan", price: PLAN.voidLine },
    { t: PLAN.entryT, kind: "stamp" },
    { t: PLAN.entryT + 0.05, kind: "coin", vel: 0.4 },
    { t: T.imb[0] + 0.2, kind: "whoosh", dur: 0.9 },
    { t: T.imb[0] + 0.9, kind: "fill", price: 101, side: "buy" },
    { t: T.imb[0] + 1.35, kind: "fill", price: 102, side: "buy" },
    { t: T.imb[0] + 1.8, kind: "stamp" },
    { t: T.imb[1] - 0.7, kind: "whoosh", dur: 0.7 },
    { t: T.risk, kind: "whoosh", dur: 0.8 },
    ...RALLY.flatMap((b) => [0, 1, 2, 3].map((k) => ({ t: b.t0 + k * 0.33, kind: "fill", price: Math.round(lerp(b.o, b.c, k / 3)), side: "buy", soft: true }))),
    { t: T.target, kind: "fill", price: 108, side: "buy", big: true },
    { t: T.target + 0.05, kind: "coin", vel: 0.6 },
    { t: T.rew[0], kind: "drain", dur: 1.8 },
    { t: T.rew[0] + 0.1, kind: "riser", dur: 1.8, vel: 0.5 },
    { t: T.rew[1], kind: "impact", big: true },
    ...TRADES_B.filter((x) => x.t > T.rew[1]).map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side })),
    { t: 60.9, kind: "impact" },
    { t: 61.0, kind: "rumble", dur: 1.8 },
    ...RANGE_B.map((b) => ({ t: b.t0 + 0.4, kind: "thud", vel: 0.5 })),
    ...FAIL_T.map((t) => ({ t, kind: "crack", price: 96, loud: false })),
    { t: T.fail + 1.05, kind: "stamp" },
    { t: T.split, kind: "whoosh", dur: 1.0 },
    { t: T.split + 0.6, kind: "shimmer" },
    { t: T.final, kind: "whoosh", dur: 1.2 },
    { t: T.final + 0.6, kind: "swell", dur: 2.4 },
    { t: 74.2, kind: "stamp" },
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

    // ---------- opening: warp + title
    const warpA = 1 - tw(t, T.open + 0.4, T.open + 1.2);
    warp(ctx, t, warpA);

    // ---------- main world (full screen) until the split
    const mainFade = tw(t, T.split, T.split + 0.2);
    if (mainFade < 1) {
      const S = B ? SB : SA;
      dust(ctx, t, cam, worldA * (1 - splitIn));
      camera(ctx, cam, () => {
        ctx.globalAlpha = 1;
        // The profile steps back while the sweep and the plan need the eye.
        const dimProfile = B ? 0 : 0.45 * tw(t, T.event, T.event + 0.8) + 0.35 * tw(t, T.execute, T.execute + 0.8);
        const profile = 1 - dimProfile * (1 - tw(t, T.rew[0], T.rew[1]));
        world(ctx, t, S, { alpha: worldA * (1 - mainFade), profile });
        if (!B) {
          footprintView(ctx, t, worldA);
          imbalanceView(ctx, t, worldA);
          planA(ctx, t, S, worldA * (1 - imbFocus(t)));
        } else planB(ctx, t, S, 1 - mainFade);
        // sparks for fills (live only)
        if (t < T.rew[0] || B)
          for (const x of B ? TRADES_B.filter((y) => y.t > T.rew[1]) : TRADES_A) {
            if (x.t > t || t - x.t > 1.2) continue;
            const col = x.side === "buy" ? C.buy : C.sell;
            burst(ctx, spreadX(x.bar, 0), PY(x.price), t, x.t, { n: x.qty >= 60 ? 22 : 12, speed: 240 + x.qty * 3, seed: x.price * 7 + x.bar, color: col, flare: 40 + x.qty * 0.8 });
          }
      });
      // debris flying at the viewer when the stops fire
      if (!prefs.reduced && t > STOP_T && t < STOP_T + 1.3) {
        const [sx0, sy0] = toScreen(cam, X(10) + 90, PY(99));
        for (let i = 0; i < 24; i++) {
          const u = (t - STOP_T - rrange(51, i, 0, 0.3)) / 1.1;
          if (u <= 0 || u >= 1) continue;
          const z = lerp(0, -600, ease.inCubic(u));
          const s = depthScale(z);
          const ang = rrange(52, i, -Math.PI, Math.PI);
          const dist = u * rrange(53, i, 280, 900);
          ctx.save();
          if (s > 1.8) ctx.filter = `blur(${Math.min(12, (s - 1.8) * 2.4)}px)`;
          const col = rnd(55, i) > 0.7 ? RED : C.sell;
          bear(ctx, sx0 + Math.cos(ang) * dist * s * 0.7, sy0 + Math.sin(ang) * dist * s * 0.45, 30 * s, col, 0.85 * (1 - u) ** 1.2, { rot: u * rrange(54, i, -3, 3) });
          ctx.restore();
        }
      }
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
        const y = ((rnd(61, Math.floor(t * 18) + i) * H) | 0) % H;
        ctx.save();
        ctx.globalAlpha = 0.18 * rw;
        ctx.fillStyle = C.text;
        ctx.fillRect(0, y, W, 1 + rnd(62, i) * 3);
        ctx.restore();
      }
      const s = 1 + 0.1 * pulse(t, T.rew[0], 4);
      ctx.save();
      ctx.globalAlpha = 0.75 * rw;
      const bg = ctx.createRadialGradient(W / 2, H / 2 - 30, 0, W / 2, H / 2 - 30, 520);
      bg.addColorStop(0, "rgba(3,6,11,0.95)");
      bg.addColorStop(1, "rgba(3,6,11,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.save();
      ctx.translate(W / 2, H / 2 - 40);
      ctx.scale(s, s);
      text(ctx, "◀◀", 0, -70, { family: F.display, size: 90, weight: 700, color: C.gold, align: "center", base: "middle", alpha: rw * (0.6 + 0.4 * Math.sin(t * 16)), glow: 20 });
      text(ctx, "回到同一個跌破", 0, 26, { family: F.tc, size: 64, weight: 900, color: C.text, align: "center", base: "middle", alpha: rw, glow: 12 });
      ctx.restore();
      text(ctx, `REWIND  −${(T.rew[0] - vtA).toFixed(1)}s`, W / 2, H / 2 + 120, { family: F.mono, size: 22, weight: 700, color: C.muted, align: "center", ls: 4, alpha: rw });
    }

    // ---------- split: A left, B right
    if (splitIn > 0) {
      const back = finalIn;
      const SAend = snapshot("A", 57.2);
      const SBnow = SB ?? snapshot("B", t);
      const full = { x: 0, y: 0, w: W, h: H };
      const L = { x: 60, y: 210, w: 880, h: 700 };
      const Rr = { x: 980, y: 210, w: 880, h: 700 };
      const mixR = (a, b, u) => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), w: lerp(a.w, b.w, u), h: lerp(a.h, b.h, u) });
      const camPane = { x: 1000, y: 640, z: 0.62 };
      const camFull = { x: 900, y: 640, z: 0.74 };
      // B shrinks from full screen into the right pane
      if (back < 1) {
        const rB = mixR(full, Rr, splitIn);
        const cB = { x: lerp(1010, camPane.x, splitIn), y: lerp(760, camPane.y, splitIn), z: lerp(1.0, camPane.z, splitIn) };
        pane(ctx, t, SBnow, rB, cB, { color: RED, alpha: 1 - back });
      }
      // A slides in from the left, then grows back to full screen
      const aIn = tw(t, T.split + 0.3, T.split + 1.3, ease.outQuart);
      const rA0 = { ...L, x: L.x - 1000 };
      const rA = back > 0 ? mixR(L, full, back) : mixR(rA0, L, aIn);
      const cA = back > 0 ? { x: lerp(camPane.x, camFull.x, back), y: lerp(camPane.y, camFull.y, back), z: lerp(camPane.z, camFull.z, back) } : camPane;
      pane(ctx, t, SAend, rA, cA, { color: C.buy, alpha: aIn });
      const la = tw(t, T.split + 1.0, T.split + 1.5) * (1 - back);
      if (la > 0) {
        tag(ctx, "A · 失敗拍賣 → 等回測進場", L.x + 24, L.y - 34, { color: C.buy, solid: true, size: 24, alpha: la });
        tag(ctx, "B · 被接受 → 不進場", Rr.x + 24, Rr.y - 34, { color: RED, solid: true, size: 24, alpha: la });
        const rows = [
          ["OI", "−240 清洗", "+180 新倉"],
          ["吸收", "97 補單 150", "沒有補單"],
          ["收回", "收回 102", "停在 95–98"],
        ];
        rows.forEach(([k, va, vb], i) => {
          const y = L.y + L.h + 30 + i * 0;
          const x = 60 + i * 300;
          const ra = la * tw(t, T.split + 1.3 + i * 0.2, T.split + 1.6 + i * 0.2);
          checkGlyph(ctx, x + 12, y, 1, C.buy, ra);
          text(ctx, `${k} ${va}`, x + 30, y + 1, { family: F.tc, size: 20, weight: 700, color: C.text, base: "middle", alpha: ra });
          crossGlyph(ctx, 980 + i * 300 + 12, y, 0.9, RED, ra);
          text(ctx, `${k} ${vb}`, 980 + i * 300 + 30, y + 1, { family: F.tc, size: 20, weight: 700, color: C.text, base: "middle", alpha: ra });
        });
      }
    }

    // ---------- evidence cards (screen space, above the world)
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
        [X(10), OIY(1120)],
        [X(10) - 70, PY(97)],
        [X(10.5), VB + 30],
        [X(12), PY(102)],
      ];
      EVIDENCE.forEach((e, i) => evidence(ctx, t, e, toScreen(mainCam(e.t0), ...fromWorld[i])));
    }

    // ---------- rail
    const railA = tw(t, 0.2, 0.5) * (1 - tw(t, T.split, T.split + 0.6) + tw(t, T.final + 0.6, T.final + 1.0));
    // keep the rail readable over whatever the camera puts behind it
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

    // ---------- opening title, then it flies through the camera
    const tOut = prog(t, T.open, T.open + 1.0);
    const tz = lerp(0, -560, ease.inCubic(tOut));
    const ts = depthScale(tz);
    const titleA = 1 - tw(t, T.open + 0.55, T.open + 1.0);
    if (titleA > 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2 + 20);
      ctx.scale(ts, ts);
      if (tz < -30) ctx.filter = `blur(${Math.min(14, -tz / 40)}px)`;
      text(ctx, "STRATEGY 01 · 策略實戰", 0, -110, { family: F.mono, size: 22, weight: 600, color: C.gold, ls: 6, align: "center", alpha: titleA * tw(t, 1.1, 1.5) });
      revealText(ctx, "掃過前低，收回才算數", 0, 0, { family: F.tc, size: 104, weight: 900, color: C.text, align: "center", base: "middle", stagger: 0.05, dur: 0.55, rise: 50, blur: 12, alpha: titleA }, t - 1.35);
      const sub = tw(t, 2.1, 2.6) * titleA;
      text(ctx, "失敗拍賣 · Sweep → Absorb → Reclaim", 0, 96, { family: F.tc, size: 30, weight: 500, color: C.muted, align: "center", alpha: sub });
      line(ctx, -lerp(0, 380, tw(t, 1.8, 2.5, ease.outQuart)), 60, lerp(0, 380, tw(t, 1.8, 2.5, ease.outQuart)), 60, C.teal, 2, 0.7 * titleA);
      ctx.restore();
    }
    if (t < 1.2) {
      const g = tw(t, 0, 1.2);
      glow(ctx, W / 2, H / 2, 400 * g, C.teal, 0.15 * (1 - g));
    }

    // ---------- tags in screen space
    const hist = tw(t, 5.2, 5.6) * (1 - tw(t, T.where, T.where + 0.4));
    if (hist > 0) tag(ctx, "已完成的模擬行情 · 今天", 110, 160, { color: C.muted, alpha: hist, size: 20 });
    const bTag = tw(t, T.rew[1], T.rew[1] + 0.3) * (1 - tw(t, T.split, T.split + 0.3));
    if (bTag > 0) tag(ctx, "B · 從停損觸發之後，換一種走法", 110, 160, { color: RED, alpha: bTag, size: 20 });

    // ---------- closing statement
    if (t >= T.final + 0.8) {
      const sc = tw(t, T.final + 0.8, T.final + 1.2);
      ctx.save();
      ctx.globalAlpha = 0.7 * sc;
      const g = ctx.createLinearGradient(0, 130, 0, 380);
      g.addColorStop(0, "rgba(6,11,19,0.95)");
      g.addColorStop(1, "rgba(6,11,19,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 120, W, 260);
      ctx.restore();
      statement(ctx, t, T.final + 0.9, [
        { text: "掃過前低，收回才算數。", size: 64 },
        { text: "地點 → 事件 → 確認 → 執行", size: 34, weight: 700 },
      ], { y: 210, gap: 84 });
    }
  },
};
