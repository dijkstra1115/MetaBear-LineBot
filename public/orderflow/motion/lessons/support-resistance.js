// T02 同一道支撐，守住或翻轉 — the second strategy lesson. One ledger (SUPPORT-
// RESISTANCE-LESSON-PLAN) drives candles, footprints, volume, OI, the resting book
// and the range profile. The zone is drawn from four overlapping reasons; then the
// same arrival plays twice. A: the bids stay, absorb and price reclaims (long).
// The film rewinds to the moment before the touch. B: the bids are pulled, price is
// accepted below, and the old support stops a retest (short).
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
  hexMix,
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
const PY = (p) => 560 - (p - 104) * 32;
const X = (i) => 220 + i * 56;
const VB = 1040; // volume baseline
const VS = 0.16;
const OIY = (v) => 1250 - (v - 1000) * 0.5;
const PX = 1370; // range profile
const OI_COL = "#c3d0dc"; // OI has no side: a neutral hue, never buy/sell
const RED = "#ff8a7f";
export const ZONE = { lo: 100, hi: 102 };

// ---------------------------------------------------------------- the ledger
const sumOf = (at) => Object.values(at).reduce((s, q) => s + q, 0);
/** Twelve finished bars: a fast lift through 95–99, a range on 100–106, a push to 112, back to 104. */
export const HIST = [
  { o: 94, h: 97, l: 94, c: 97, d: 15, oi: 10, at: { 94: 10, 95: 8, 96: 6, 97: 3 } },
  { o: 97, h: 100, l: 97, c: 100, d: 25, oi: 20, at: { 97: 3, 98: 8, 99: 12, 100: 20 } },
  { o: 100, h: 103, l: 100, c: 102, d: 30, oi: 30, at: { 100: 30, 101: 40, 102: 50, 103: 30 } },
  { o: 102, h: 104, l: 101, c: 103, d: 20, oi: 10, at: { 101: 30, 102: 50, 103: 40, 104: 20 } },
  { o: 103, h: 104, l: 100, c: 101, d: -40, oi: 0, at: { 100: 20, 101: 40, 102: 30, 103: 30, 104: 20 } },
  { o: 101, h: 105, l: 101, c: 104, d: 30, oi: 20, at: { 101: 20, 102: 30, 103: 20, 104: 30, 105: 20 } },
  { o: 104, h: 106, l: 100, c: 101, d: -30, oi: 10, at: { 100: 20, 101: 20, 102: 30, 103: 20, 104: 20, 105: 20, 106: 20 } },
  { o: 101, h: 106, l: 101, c: 105, d: 30, oi: -10, at: { 101: 10, 102: 10, 103: 10, 104: 10, 105: 20, 106: 10 } },
  { o: 105, h: 109, l: 105, c: 108, d: 20, oi: 0, at: { 105: 10, 106: 10, 107: 10, 108: 10, 109: 6 } },
  { o: 108, h: 112, l: 107, c: 111, d: 14, oi: -20, at: { 107: 6, 108: 6, 109: 6, 110: 10, 111: 8, 112: 6 } },
  { o: 111, h: 112, l: 106, c: 107, d: -20, oi: 10, at: { 106: 10, 107: 8, 108: 4, 109: 8, 110: 12, 111: 10, 112: 8 } },
  { o: 107, h: 108, l: 104, c: 104, d: -16, oi: 20, at: { 104: 10, 105: 10, 106: 10, 107: 6, 108: 4 } },
].map((b) => ({ ...b, v: sumOf(b.at) }));
export const OI0 = 1000;

/** Volume by price over a list of bars that carry `at`. */
export function profileOf(bars, u = () => 1) {
  const prof = {};
  bars.forEach((b, i) => {
    for (const [p, q] of Object.entries(b.at)) prof[p] = (prof[p] ?? 0) + q * u(b, i);
  });
  return prof;
}
const pocOf = (prof) => Number(Object.keys(prof).reduce((a, p) => (prof[p] > prof[a] ? p : a)));
/** The range's profile: HVN 101–103 above, LVN 95–99 below. */
export const RANGE = profileOf(HIST);
export const RANGE_POC = pocOf(RANGE);

// Trades: [t, bar, aggressor side, price, qty, ΔOI]. Sells hit bids, buys lift asks.
const tr = ([t, bar, side, price, qty, oi]) => ({ t, bar, side, price, qty, oi });
/** Shared by both branches: the approach bar, down to the top of the zone. */
export const SHARED = [
  [20.2, 12, "sell", 104, 20, 10],
  [20.9, 12, "sell", 103, 30, 10],
  [21.6, 12, "buy", 103, 10, 0],
].map(tr);
/** Market time both branches share: just before the touch. */
const REW_VT = 22.4;
/** Branch A: the bids stay, absorb 380 at 101, and buyers reclaim the zone. */
export const TRADES_A = [
  ...SHARED,
  ...[
    [26.6, 13, "sell", 103, 20, 0],
    [27.0, 13, "buy", 103, 10, 0],
    [27.4, 13, "sell", 102, 30, 0],
    [27.8, 13, "sell", 102, 30, 10],
    [28.3, 13, "sell", 101, 120, 10],
    [28.8, 13, "sell", 101, 80, 10],
    [29.6, 13, "sell", 101, 100, 10],
    [30.1, 13, "sell", 101, 80, 0],
    [30.5, 13, "buy", 101, 40, 0],
    [30.9, 13, "buy", 102, 30, 0],
    // bar 14: one more test of 101, almost no selling, then buyers lift to 103
    [38.0, 14, "sell", 102, 15, 0],
    [38.5, 14, "sell", 101, 20, 0],
    [39.0, 14, "buy", 101, 10, 0],
    [42.1, 14, "buy", 102, 80, -10],
    [42.6, 14, "buy", 103, 90, -10],
  ].map(tr),
];
/** Branch B: the bids are pulled, stops fire below 100, price stays below, the retest fails. */
export const TRADES_B = [
  ...SHARED,
  ...[
    [60.9, 13, "sell", 103, 10, 0],
    [61.2, 13, "sell", 102, 60, 0],
    [61.45, 13, "buy", 102, 10, 0],
    [61.7, 13, "sell", 101, 70, 10],
    [61.95, 13, "buy", 101, 10, 0],
    [62.2, 13, "sell", 100, 50, 0],
    [62.4, 13, "buy", 100, 10, 0],
    [62.7, 13, "sell", 99, 160, -160],
    [63.0, 13, "buy", 99, 20, 0],
    [63.25, 13, "sell", 98, 120, 20],
    [63.45, 13, "buy", 98, 20, 0],
    [63.7, 13, "sell", 97, 90, 10],
    [63.95, 13, "sell", 96, 40, 0],
    [64.15, 13, "buy", 96, 20, 0],
    [64.4, 13, "buy", 97, 30, 0],
    // bar 16: the retest of 100 from below, absorbed by resting asks
    [70.4, 16, "buy", 98, 30, 0],
    [70.7, 16, "sell", 98, 20, 0],
    [71.0, 16, "buy", 99, 70, 0],
    [71.3, 16, "sell", 99, 10, 0],
    [71.7, 16, "buy", 100, 80, -10],
    [72.2, 16, "buy", 100, 70, -10],
    [73.0, 16, "sell", 100, 30, 0],
    [73.4, 16, "sell", 99, 20, -10],
    // bar 17: sellers take over; two stacked sell imbalances
    [76.6, 17, "sell", 99, 40, 10],
    [76.9, 17, "buy", 100, 20, 0],
    [77.1, 17, "sell", 100, 5, 0],
    [77.4, 17, "sell", 99, 40, 10],
    [77.6, 17, "buy", 99, 15, 0],
    [77.9, 17, "sell", 98, 50, 10],
    [78.1, 17, "buy", 98, 20, 0],
    [78.4, 17, "sell", 98, 40, 10],
    [78.7, 17, "sell", 97, 40, 20],
    [78.9, 17, "buy", 97, 10, 0],
  ].map(tr),
];
// Resting orders (the heatmap): +add / −cancel. Fills consume them separately.
const BOOK0 = [
  { t: -1, side: "bid", p: 101, q: 400, x: X(7) - 20 },
  { t: -1, side: "bid", p: 100, q: 250, x: X(8) - 20 },
];
export const BOOK_A = [...BOOK0, { t: 29.2, side: "bid", p: 101, q: 150, x: X(13) + 2 }];
export const BOOK_B = [
  ...BOOK0,
  { t: 57.0, side: "bid", p: 101, q: -330, x: X(12) + 18 },
  { t: 57.6, side: "bid", p: 100, q: -200, x: X(12) + 24 },
  { t: 66.6, side: "ask", p: 100, q: 200, x: X(15) },
  { t: 72.6, side: "ask", p: 100, q: 100, x: X(16) + 6 },
];
/** Bars with no trade tape: OHLC, volume, delta, ΔOI and the time they form. */
export const RALLY_A = [
  { bar: 15, t0: 51.0, t1: 52.3, o: 103, h: 106, l: 103, c: 105, v: 200, d: 80, oi: -30 },
  { bar: 16, t0: 52.3, t1: 53.6, o: 105, h: 108, l: 105, c: 108, v: 180, d: 60, oi: -30 },
];
export const ACCEPT_B = [
  { bar: 14, t0: 64.8, t1: 66.0, o: 97, h: 99, l: 96, c: 98, v: 300, d: -40, oi: 120, at: { 96: 60, 97: 100, 98: 100, 99: 40 } },
  { bar: 15, t0: 66.0, t1: 67.2, o: 98, h: 99, l: 97, c: 98, v: 260, d: -20, oi: 80, at: { 97: 70, 98: 130, 99: 60 } },
];
export const DROP_B = [
  { bar: 18, t0: 79.4, t1: 80.6, o: 97, h: 98, l: 95, c: 96, v: 220, d: -90, oi: 20 },
  { bar: 19, t0: 80.6, t1: 81.8, o: 96, h: 97, l: 95, c: 95, v: 200, d: -60, oi: -10 },
];
/** Plan levels (lesson settings, not general rules). */
export const PLAN_A = { entry: 103, stop: 98, t1: 108, t2: 112, entryT: 49.4 };
export const PLAN_B = { entry: 98, stop: 101, t1: 95, t2: 94, entryT: 78.4 };
const R_A = (p) => (p - PLAN_A.entry) / (PLAN_A.entry - PLAN_A.stop);
const R_B = (p) => (PLAN_B.entry - p) / (PLAN_B.stop - PLAN_B.entry);

// ---------------------------------------------------------------- timeline
const T = {
  open: 3.3,
  over: 4.4,
  where: 8.5,
  src: [8.7, 10.0, 11.3, 12.6],
  zoneIn: 13.4,
  liq: 14.0,
  edge: 17.0,
  event: 19.5,
  confirm: 23.4,
  zoom: 31.0,
  replay: [32.2, 32.8, 33.9, 34.5],
  refill: 33.35,
  zoomOut: 36.6,
  diverge: 38.6,
  reclaim: 42.6,
  execute: 45.6,
  imb: [45.8, 49.2],
  risk: 49.9,
  rally: 51.0,
  target: 53.6,
  rew: [54.4, 56.4],
  pull: [57.0, 57.6],
  stop: 62.7,
  flip: 70.0,
  fpB: [71.0, 73.8],
  riskB: 78.9,
  targetB: 81.8,
  split: 82.4,
  final: 87.4,
  end: 92,
};
const EV_DUR = 2.5;
/** Evidence that flies into the rail's checklist; A argues for the long, B for the short. */
const EV_A = [
  { t0: 23.8, slot: 0, kicker: "證據 1 / 4 · 掛單", hero: "101 牆沒撤", sub: "價格到之前，400 隻還掛著", color: C.buy },
  { t0: 35.0, slot: 1, kicker: "證據 2 / 4 · 到價", hero: "101 吸收 380", sub: "賣了 380，價格沒再往下", color: C.buy },
  { t0: 39.4, slot: 2, kicker: "證據 3 / 4 · 回測", hero: "主動賣 380 → 20", sub: "同一個低點，賣的人少了", color: C.gold },
  { t0: 43.0, slot: 3, kicker: "證據 4 / 4 · 接手", hero: "收回 103", sub: "回到區域上方，買方接手", color: C.buy },
];
const EV_B = [
  { t0: 58.1, slot: 0, kicker: "證據 1 / 4 · 掛單", hero: "牆先撤 −530", sub: "價格還沒到，掛買先走了", color: RED },
  { t0: 67.5, slot: 1, kicker: "證據 2 / 4 · 到價", hero: "區外成交 560", sub: "跌破後留在下方，OI +200", color: C.sell },
  { t0: 73.8, slot: 2, kicker: "證據 3 / 4 · 回測", hero: "100 吸收 150", sub: "買了 150，推不過 100", color: C.sell },
];
const EVIDENCE = [...EV_A, ...EV_B];
const B4_T = 78.45; // the stacked sell imbalance: a quick tick, no hero card
const LAND_A = EV_A.map((e) => e.t0 + EV_DUR);
const LAND_B = [...EV_B.map((e) => e.t0 + EV_DUR), B4_T];
const SLOT_NAMES = ["掛單", "到價", "回測", "接手"];

// ---------------------------------------------------------------- market state
/** Market time of branch A: follows t, except it runs backwards during the rewind. */
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

/** Book events and fills in time order; a fill only touches a side that has resting size. */
function bookEvents(events, trades, vt) {
  const ev = [];
  for (const e of events) if (e.t <= vt) ev.push({ t: e.t, side: e.side, p: e.p, dq: e.q, x: e.x });
  for (const x of trades)
    if (x.t <= vt) {
      const same = trades.filter((y) => y.bar === x.bar);
      const k = same.indexOf(x);
      ev.push({ t: x.t, side: x.side === "sell" ? "bid" : "ask", p: x.price, dq: -x.qty, fill: true, x: X(x.bar) - 20 + (40 * k) / Math.max(1, same.length - 1) });
    }
  return ev.sort((a, b) => a.t - b.t);
}

export function bookAt(events, trades, vt) {
  const q = { bid: {}, ask: {} };
  for (const e of bookEvents(events, trades, vt)) {
    const side = q[e.side];
    if (e.fill && side[e.p] === undefined) continue;
    side[e.p] = Math.max(0, (side[e.p] ?? 0) + e.dq);
  }
  return q;
}

/** Heat segments per side and price: [{side, p, x0, x1, q}]. */
function heatAt(events, trades, vt, xNow) {
  const segs = [];
  const open = {};
  for (const e of bookEvents(events, trades, vt)) {
    const key = `${e.side}${e.p}`;
    const cur = open[key];
    if (e.fill && !cur) continue;
    if (cur) segs.push({ side: e.side, p: e.p, x0: cur.x, x1: Math.max(cur.x, e.x), q: cur.q });
    open[key] = { side: e.side, p: e.p, x: e.x, q: Math.max(0, (cur?.q ?? 0) + e.dq) };
  }
  for (const cur of Object.values(open)) segs.push({ side: cur.side, p: cur.p, x0: cur.x, x1: Math.max(cur.x, xNow), q: cur.q });
  return segs.filter((s) => s.q > 0 && s.x1 > s.x0);
}

/** Everything the chart needs at market time vt of a branch. */
function snapshot(branch, vt) {
  const A = branch === "A";
  const trades = A ? TRADES_A : TRADES_B;
  const sums = A ? RALLY_A : [...ACCEPT_B, ...DROP_B];
  const bars = HIST.map((b) => ({ ...b, vis: b.v }));
  let acc = OI0;
  const oiPts = [[X(0) - 28, OI0]];
  HIST.forEach((b, i) => {
    acc += b.oi;
    oiPts.push([X(i) + 22, acc]);
  });
  let oi = acc;
  let oiExact = acc;
  let live = 11;
  let last = HIST.at(-1).c;
  const lastBar = A ? 16 : 19;
  for (let i = 12; i <= lastBar; i++) {
    const sum = sums.find((b) => b.bar === i);
    const b = sum ? barFromSummary(sum, vt) : barFromTrades(trades, vt, i);
    bars.push(b);
    if (!b) continue;
    live = i;
    last = b.c;
    if (sum) {
      const u = prog(vt, sum.t0, sum.t1);
      oi += sum.oi * u;
      if (u >= 1) oiExact += sum.oi;
      oiPts.push([X(i) - 22 + 44 * u, oi]);
    } else {
      const all = trades.filter((y) => y.bar === i);
      all
        .filter((x) => x.t <= vt)
        .forEach((x, k) => {
          oi += x.oi * ease.outCubic(prog(vt, x.t, x.t + 0.3));
          oiExact += x.oi;
          oiPts.push([X(i) - 22 + (44 * (k + 1)) / Math.max(4, all.length), oi]);
        });
    }
  }
  const events = A ? BOOK_A : BOOK_B;
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
    heat: heatAt(events, trades, vt, X(Math.max(live, 12)) + 28),
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

/** Volume that traded below the zone once price was accepted there (bars 14–15 of B). */
export const acceptedProfile = (vt = Infinity) => profileOf(ACCEPT_B, (b) => prog(vt, b.t0, b.t1));

// ---------------------------------------------------------------- focus (unfolded footprints)
const FOCI = [
  { branch: "A", bar: 13, a: T.zoom, b: T.zoomOut },
  { branch: "A", bar: 14, a: T.imb[0], b: T.imb[1] },
  { branch: "B", bar: 16, a: T.fpB[0], b: T.fpB[1] },
];
function foci(t, branch) {
  return FOCI.filter((f) => f.branch === branch).map((f) => ({
    bar: f.bar,
    spread: tw(t, f.a, f.a + 0.9) * (1 - tw(t, f.b - 0.8, f.b)),
    unfold: tw(t, f.a + 0.5, f.a + 1.1) * (1 - tw(t, f.b - 0.8, f.b - 0.4)),
  }));
}
function spreadX(i, fo) {
  let x = X(i);
  for (const f of fo) if (i !== f.bar) x += Math.sign(i - f.bar) * 170 * f.spread;
  return x;
}

// ---------------------------------------------------------------- camera
const MAIN_KEYS = [
  { t: 0, x: 880, y: 640, z: 0.3 },
  { t: T.open, x: 880, y: 640, z: 0.3 },
  { t: 4.9, x: 920, y: 640, z: 0.78 },
  { t: T.where, x: 920, y: 640, z: 0.8 },
  { t: 9.6, x: 1010, y: 600, z: 0.9 },
  { t: 13.8, x: 1010, y: 600, z: 0.92 },
  { t: 15.0, x: 840, y: 640, z: 1.05 },
  { t: 16.8, x: 840, y: 640, z: 1.06 },
  { t: 17.6, x: 880, y: 620, z: 0.86 },
  { t: 19.3, x: 880, y: 620, z: 0.86 },
  { t: 20.4, x: 860, y: 600, z: 1.1 },
  { t: 23.0, x: 870, y: 620, z: 1.15 },
  { t: 26.3, x: 900, y: 640, z: 1.15 },
  { t: 30.8, x: 920, y: 640, z: 1.18 },
  { t: 31.9, x: X(13), y: PY(102), z: 2.4 },
  { t: 36.2, x: X(13), y: PY(102), z: 2.5 },
  { t: 37.4, x: 950, y: 620, z: 1.15 },
  { t: 45.4, x: 960, y: 620, z: 1.12 },
  { t: 46.6, x: X(14), y: PY(102), z: 2.5 },
  { t: 48.6, x: X(14), y: PY(102), z: 2.6 },
  { t: 49.6, x: 980, y: 560, z: 0.95 },
  { t: 51.0, x: 980, y: 560, z: 0.95 },
  { t: 53.6, x: 990, y: 540, z: 0.9 },
  { t: T.rew[0], x: 990, y: 540, z: 0.9 },
  { t: 56.0, x: 870, y: 620, z: 1.15 },
  { t: 60.6, x: 870, y: 620, z: 1.15 },
  { t: 61.4, x: 920, y: 680, z: 1.0 },
  { t: 64.6, x: 930, y: 680, z: 1.0 },
  { t: 65.6, x: 1010, y: 680, z: 0.92 },
  { t: 70.2, x: 1010, y: 670, z: 0.93 },
  { t: 71.8, x: X(16), y: PY(99), z: 2.2 },
  { t: 73.4, x: X(16), y: PY(99), z: 2.25 },
  { t: 74.4, x: 1000, y: 660, z: 0.95 },
  { t: 79.2, x: 1000, y: 660, z: 0.95 },
  { t: T.split, x: 990, y: 680, z: 0.92 },
];
function heroAmt(t, t0) {
  return tw(t, t0 + 0.1, t0 + 0.5) * (1 - tw(t, t0 + 1.8, t0 + 2.2));
}
function mainCam(t) {
  const cam = camPath(t, MAIN_KEYS);
  // Evidence heroes push the world back a touch: the card comes forward.
  const hero = EVIDENCE.reduce((s, e) => s + heroAmt(t, e.t0), 0);
  cam.z *= 1 - 0.07 * clamp(hero);
  if (!prefs.reduced) cam.rot = -0.012 * tw(t, T.stop, T.stop + 0.4) * (1 - tw(t, 64.6, 65.6)) + 0.004 * noise1(t * 0.35, 4);
  const [a, b] = shake(t, T.stop, 20, 0.7, 11);
  const [c, d] = shake(t, 63.7, 9, 0.4, 13);
  const [e, f] = shake(t, 28.3, 6, 0.3, 17);
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
    const ang = rnd(121, i) * TAU;
    const r0 = rrange(122, i, 40, 900);
    const span = 3000;
    const z = span - ((rnd(123, i) * span + t * speed) % span);
    const z2 = Math.min(span, z + 60 + speed * 0.05);
    const s1 = depthScale(z - 400);
    const s2 = depthScale(z2 - 400);
    const col = rnd(124, i) > 0.82 ? C.gold : C.teal;
    ctx.strokeStyle = rgba(col, a * clamp(1 - z / span) * 0.8);
    ctx.lineWidth = 1 + 2.4 * clamp(s1 - 0.5);
    ctx.beginPath();
    ctx.moveTo(W / 2 + Math.cos(ang) * r0 * s1, H / 2 + Math.sin(ang) * r0 * s1);
    ctx.lineTo(W / 2 + Math.cos(ang) * r0 * s2, H / 2 + Math.sin(ang) * r0 * s2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Screen-space dust at several depths; drifts against the camera for parallax. */
function dust(ctx, t, cam, a) {
  if (a <= 0) return;
  for (let i = 0; i < 46; i++) {
    const depth = rrange(131, i, 0.3, 1.8);
    const px = rnd(132, i) * (W + 400) - 200 - (cam.x - 900) * depth * 0.55 + t * rrange(133, i, -6, 6);
    const py = rnd(134, i) * (H + 400) - 200 - (cam.y - 640) * depth * 0.55 - t * rrange(135, i, 2, 9);
    const x = ((px % (W + 400)) + W + 400) % (W + 400) - 200;
    const y = ((py % (H + 400)) + H + 400) % (H + 400) - 200;
    glow(ctx, x, y, (depth > 1.2 ? 9 : 4) * depth * (0.7 + cam.z * 0.3), rnd(136, i) > 0.75 ? C.gold : C.teal, 0.22 * a * (depth > 1.3 ? 0.7 : 1));
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
    const box = { ...s, x, cx: x + s.w / 2 };
    x += s.w + gap;
    return box;
  });
})();
const slotXY = (i) => [RAIL[2].x + 118 + i * 50, RAIL_Y];

/** Stage state: active / done, and the colour of the side being argued (A long, B short). */
function stageState(t, i) {
  if (t >= T.final) {
    const on = tw(t, T.final + 1.0 + i * 0.22, T.final + 1.3 + i * 0.22);
    return { active: on, done: on, col: C.buy };
  }
  if (t < T.rew[1]) {
    const act = [T.where, T.event, T.confirm, T.execute][i];
    const done = [T.event, T.confirm, LAND_A[3], T.target][i];
    const clear = t >= T.rew[0] && i >= 2 ? tw(t, T.rew[0], T.rew[0] + 0.8) : 0;
    return { active: tw(t, act, act + 0.4) * (1 - clear), done: tw(t, done, done + 0.3) * (1 - clear), col: C.buy };
  }
  if (i < 2) return { active: 1, done: 1, col: C.buy };
  const act = i === 2 ? T.rew[1] : B4_T;
  const done = i === 2 ? B4_T : T.targetB;
  return { active: tw(t, act, act + 0.4), done: tw(t, done, done + 0.3), col: C.sell };
}

function slotState(t, i) {
  if (t >= T.final) {
    const at = T.final + 1.4 + i * 0.12;
    return { ok: tw(t, at, at + 0.2), pop: pulse(t, at, 5), at, col: C.buy };
  }
  if (t < T.rew[0]) return { ok: tw(t, LAND_A[i], LAND_A[i] + 0.25), pop: pulse(t, LAND_A[i], 5), at: LAND_A[i], col: C.buy };
  if (t < T.rew[1]) return { ok: 1 - tw(t, T.rew[0] + 0.2 + i * 0.12, T.rew[0] + 0.5 + i * 0.12), pop: 0, at: -9, col: C.buy };
  return { ok: tw(t, LAND_B[i], LAND_B[i] + 0.25), pop: pulse(t, LAND_B[i], 5), at: LAND_B[i], col: C.sell };
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
    const busy = st.active > 0 && st.done < 1;
    if (frame > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * frame;
      rrect(ctx, s.x, RAIL_Y - RAIL_H / 2, s.w, RAIL_H, 12);
      ctx.fillStyle = rgba(C.panel, 0.72 + 0.1 * st.active);
      ctx.fill();
      const col = st.done > 0.5 ? st.col : st.active > 0 ? C.gold : C.line;
      ctx.strokeStyle = rgba(col, 0.35 + 0.55 * Math.max(st.active, st.done));
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
    const col = st.done > 0.5 ? st.col : st.active > 0 ? C.text : C.muted;
    ctx.save();
    if (fly.z < -20) ctx.filter = `blur(${Math.min(8, -fly.z / 30)}px)`;
    text(ctx, s.k, x, y + 1, { family: F.tc, size, weight: 900, color: col, base: "middle", alpha: alpha * fly.a, glow: st.active ? 10 : 0, glowColor: col });
    ctx.restore();
    if (frame > 0) {
      text(ctx, `0${i + 1}`, s.x + 14, RAIL_Y - 13, { family: F.mono, size: 12, weight: 700, color: C.dim, alpha: alpha * frame, ls: 2 });
      if (st.done > 0) checkGlyph(ctx, s.x + s.w - 24, RAIL_Y, 1, st.col, alpha * st.done);
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
    ctx.fillStyle = s.ok > 0 ? rgba(s.col, 0.18 * s.ok) : rgba(C.ink, 0.8);
    ctx.fill();
    ctx.strokeStyle = s.ok > 0.5 ? s.col : rgba(C.muted, 0.45);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
    ring(ctx, x, y - 4, t, s.at, { r0: 17, r1: 54, color: s.col, dur: 0.6 });
    checkGlyph(ctx, x, y - 4, 1.05, s.col, a * s.ok);
    text(ctx, name, x, y + 22, { family: F.tc, size: 12, weight: 700, color: s.ok > 0.5 ? s.col : C.muted, align: "center", base: "middle", alpha: a * 0.95 });
  });
  // which side the checklist is arguing for
  const side = (lbl, col, on) =>
    on > 0 && text(ctx, lbl, slotXY(0)[0] - 50, RAIL_Y - 4, { family: F.tc, size: 13, weight: 800, color: col, align: "right", base: "middle", alpha: alpha * frame * on });
  side("做多", C.buy, tw(t, T.confirm, T.confirm + 0.4) * (1 - tw(t, T.rew[0], T.rew[0] + 0.4)));
  side("做空", C.sell, tw(t, T.rew[1], T.rew[1] + 0.4) * (1 - tw(t, T.split, T.split + 0.4)));
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
  text(ctx, e.sub, -w / 2 + 30, h / 2 - 30, { family: F.tc, size: 20, weight: 500, color: C.muted, base: "middle", alpha: a });
  ctx.restore();
}

function evidence(ctx, t, e, from) {
  const u = t - e.t0;
  if (u < 0 || u > EV_DUR + 0.05) return;
  for (let k = 4; k >= 1; k--) {
    const pt = evidencePose(t - k * 0.028, e, from);
    const fast = u < 0.6 || u > 1.85;
    if (fast && t - k * 0.028 > e.t0) heroCard(ctx, pt, e, 0.14 * (1 - k / 5));
  }
  heroCard(ctx, evidencePose(t, e, from), e, 1 - tw(u, EV_DUR - 0.12, EV_DUR));
  const col = e.t0 > T.rew[1] ? C.sell : C.buy;
  if (u > EV_DUR - 0.2) burst(ctx, ...slotXY(e.slot), t, e.t0 + EV_DUR, { n: 14, speed: 240, color: col, seed: e.slot + 5 + (e.t0 > T.rew[1] ? 10 : 0), flare: 60 });
}

// ---------------------------------------------------------------- the chart (world space)
function rangeProfile(ctx, t, a, main, focus) {
  const grow = main ? tw(t, 4.6, 6.4) : 1;
  const hl = (t0) => (main ? tw(t, t0, t0 + 0.5) * (1 - tw(t, T.liq, T.liq + 0.6)) : 0);
  const hvn = hl(T.src[2]);
  const lvn = hl(T.src[3]);
  const maxV = RANGE[RANGE_POC];
  for (const [ps, v] of Object.entries(RANGE)) {
    const p = Number(ps);
    const g = ease.outCubic(prog(grow, (112 - p) * 0.025, (112 - p) * 0.025 + 0.55));
    if (g <= 0) continue;
    const isH = p >= 101 && p <= 103;
    const isL = p >= 95 && p <= 99;
    ctx.save();
    ctx.globalAlpha = a * focus;
    rrect(ctx, PX, PY(p) - 12, Math.max(3, (v / maxV) * 230 * g), 24, 4);
    ctx.fillStyle =
      p === RANGE_POC ? rgba(C.gold, 0.8) : isH && hvn > 0 ? rgba(C.buy, 0.4 + 0.4 * hvn) : isL && lvn > 0 ? rgba(C.sell, 0.35 + 0.5 * lvn) : rgba("#5a8fa8", 0.5);
    ctx.fill();
    ctx.restore();
  }
  text(ctx, "區間成交分布", PX, PY(113.4), { family: F.tc, size: 22, weight: 800, color: C.muted, alpha: a * grow * focus });
  text(ctx, `POC ${RANGE_POC}`, PX + 244, PY(RANGE_POC) + 1, { family: F.mono, size: 18, weight: 700, color: C.gold, base: "middle", alpha: a * grow * focus });
  if (hvn > 0) {
    neonPath(ctx, [[PX - 10, PY(103) - 14], [PX - 10, PY(101) + 14]], C.buy, 3, a * hvn, 1);
    tag(ctx, "HVN 101–103 · 雙方曾經接受的價格", PX + 20, PY(104.4), { color: C.buy, size: 18, alpha: a * hvn });
  }
  if (lvn > 0) {
    neonPath(ctx, [[PX - 10, PY(99) - 14], [PX - 10, PY(95) + 14]], C.sell, 3, a * lvn, 1);
    tag(ctx, "LVN 95–99 · 成交稀薄，容易快速穿過", PX + 40, PY(97), { color: C.sell, size: 18, alpha: a * lvn });
  }
}

function world(ctx, t, S, o = {}) {
  const a = o.alpha ?? 1;
  const main = !o.pane;
  const vt = S.vt;
  const A = S.branch === "A";
  const fo = main ? foci(t, S.branch) : [];
  const unfold = fo.reduce((m, f) => Math.max(m, f.unfold), 0);
  const intro = main ? tw(t, 3.6, 4.5) : 1;
  // the profile and right-hand axis step aside while the risk box needs the space
  const planFade = A ? tw(vt, T.risk, T.risk + 0.6) : tw(vt, T.riskB, T.riskB + 0.6);

  priceGrid(ctx, t, { alpha: 0.28 * a, step: 32, oy: PY(104) });

  // ---- range profile (B: steps back once the new value forms below)
  const focus = (o.profile ?? 1) * (A ? 1 : 1 - 0.7 * tw(vt, ACCEPT_B[0].t0, ACCEPT_B[0].t0 + 0.8));
  rangeProfile(ctx, t, a * (1 - 0.8 * unfold) * (1 - 0.8 * planFade), main, focus);

  // ---- price labels
  for (let p = 93; p <= 113; p++) {
    const key = p === ZONE.lo || p === ZONE.hi || p === S.last;
    text(ctx, String(p), X(0) - 56, PY(p) + 1, {
      family: F.mono,
      size: 17,
      weight: p === S.last ? 800 : 500,
      color: p === S.last ? C.gold : key ? C.text : C.dim,
      align: "right",
      base: "middle",
      alpha: a * intro * (key ? 0.95 : 0.6),
    });
  }
  for (let p = 93; p <= 112; p++)
    text(ctx, String(p), PX - 28, PY(p) + 1, {
      family: F.mono,
      size: 15,
      weight: p === S.last ? 800 : 500,
      color: p === S.last ? C.gold : C.dim,
      align: "right",
      base: "middle",
      alpha: a * intro * (p === S.last ? 0.95 : 0.5) * (1 - unfold) * (1 - planFade),
    });

  // ---- the zone: support, or (B, once accepted below) resistance
  const zoneIn = main ? tw(t, T.zoneIn, T.zoneIn + 0.7) : 1;
  const flip = A ? 0 : tw(vt, T.flip, T.flip + 0.6);
  if (zoneIn > 0) {
    const col = hexMix(C.buy, C.sell, flip);
    const x0 = X(0) - 30;
    const x1 = lerp(x0, PX - 44, main ? tw(t, T.zoneIn, T.zoneIn + 0.9, ease.outQuart) : 1);
    const y0 = PY(ZONE.hi) - 16;
    const y1 = PY(ZONE.lo) + 16;
    const fade = 1 - 0.7 * unfold;
    ctx.save();
    ctx.globalAlpha = a * zoneIn * fade * (0.12 + 0.05 * Math.sin(t * 2.2));
    ctx.fillStyle = col;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
    line(ctx, x0, y0, x1, y0, col, 1.6, a * zoneIn * fade * 0.7, [10, 7]);
    line(ctx, x0, y1, x1, y1, col, 1.6, a * zoneIn * fade * 0.7, [10, 7]);
    if (main) ring(ctx, X(12), (y0 + y1) / 2, t, T.flip, { r1: 260, color: C.sell, w: 4, dur: 0.9 });
    const label = flip < 0.5 ? `支撐區 ${ZONE.lo}–${ZONE.hi} · 首次回測` : `壓力區 ${ZONE.lo}–${ZONE.hi} · 舊支撐`;
    const la = (main ? tw(t, T.liq + 0.3, T.liq + 0.8) * (A ? 1 : tw(vt, T.flip, T.flip + 0.4)) : 1) * (1 - unfold);
    tag(ctx, label, X(7) - 10, y1 + 22, { color: col, size: 18, alpha: a * la * fade, solid: main && pulse(t, T.flip, 2) > 0.3 });
  }

  // ---- the four reasons (main, before the zone settles)
  if (main && t < T.liq + 0.8) {
    const out = 1 - tw(t, T.liq, T.liq + 0.6);
    const s0 = tw(t, T.src[0], T.src[0] + 0.4) * out;
    if (s0 > 0) {
      for (const [k, i] of [[0, 4], [1, 6]]) ring(ctx, X(i), PY(100), t, T.src[0] + k * 0.25, { r1: 70, color: C.gold, w: 3, dur: 0.7 });
      for (const i of [4, 6]) glow(ctx, X(i), PY(100), 26, C.gold, s0 * 0.8);
      tag(ctx, "前低 100 · 兩次", X(5), PY(100) + 40, { align: "center", color: C.gold, size: 18, alpha: a * s0 });
    }
    const s1 = tw(t, T.src[1], T.src[1] + 0.9, ease.outQuart) * out;
    if (s1 > 0) {
      neonPath(ctx, [[X(0) - 30, PY(100)], [lerp(X(0) - 30, PX - 44, s1), PY(100)]], C.gold, 2.4, a * out, 1.2);
      tag(ctx, "整數 100", X(9), PY(100) + 40, { color: C.gold, size: 18, alpha: a * tw(t, T.src[1] + 0.3, T.src[1] + 0.6) * out });
    }
  }

  // ---- heatmap bands (bids teal, asks orange)
  const heatA = main ? tw(t, 5.2, 6.2) : 1;
  for (const s of S.heat) {
    const k = clamp(s.q / 400);
    const bid = s.side === "bid";
    ctx.save();
    ctx.globalAlpha = a * heatA * (0.16 + 0.55 * k) * (1 - 0.75 * unfold);
    const g = ctx.createLinearGradient(0, PY(s.p) - 14, 0, PY(s.p) + 14);
    const col = bid ? C.buy : C.sell;
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.5, rgba(k > 0.6 ? "#f4e7b0" : col, 1));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(s.x0, PY(s.p) - 14, s.x1 - s.x0, 28);
    ctx.restore();
  }
  if (main) {
    const wl = tw(t, T.liq + 0.5, T.liq + 1.0) * (1 - tw(t, T.event + 1.2, T.event + 1.8));
    const wB = A ? 0 : tw(t, T.rew[1], T.rew[1] + 0.3) * (1 - tw(t, T.pull[0] - 0.3, T.pull[0]));
    const w = Math.max(wl, wB);
    if (w > 0) tag(ctx, `熱力圖 · 101 掛買 ${S.book.bid[101] ?? 0}、100 掛買 ${S.book.bid[100] ?? 0}`, X(8) - 20, PY(103.4), { color: C.buy, size: 18, alpha: a * w });
  }

  // ---- long stops waiting just outside the zone
  if (main) {
    const inA = tw(t, T.liq + 0.2, T.liq + 0.7) * (1 - tw(t, T.execute, T.execute + 0.6));
    const inB = A ? 0 : tw(t, T.rew[1], T.rew[1] + 0.5);
    const shown = (A ? inA : inB) * (1 - unfold);
    if (shown > 0 && vt < T.stop + 1.2) {
      for (let i = 0; i < 6; i++) {
        const pop = A ? ease.outBack(prog(t, T.liq + 0.2 + i * 0.06, T.liq + 0.6 + i * 0.06)) : shown;
        const fired = A ? 0 : prog(vt, T.stop + i * 0.04, T.stop + 0.35 + i * 0.04);
        const bx = X(13) + 30 + i * 28;
        const by = PY(99) + fired * 50 * (1 + i * 0.2);
        if (fired < 1) bear(ctx, bx, by, 22 * pop * (1 + fired * 0.6), C.sell, a * clamp(pop) * shown * (1 - fired), { outline: fired < 0.05 });
        if (fired > 0 && fired < 1) glow(ctx, bx, by, 40, C.sell, 0.8 * (1 - fired));
      }
      const lb = shown * (1 - tw(vt, T.stop, T.stop + 0.3));
      if (lb > 0) tag(ctx, "多單停損 99 · 在區域外", X(13) + 20, PY(99) + 36, { color: C.sell, size: 18, alpha: a * lb });
    }
  }

  // ---- B: value builds below the zone
  if (!A) {
    const prof = acceptedProfile(vt);
    const pa = tw(vt, ACCEPT_B[0].t0, ACCEPT_B[0].t0 + 0.6) * (1 - 0.8 * planFade) * (1 - 0.8 * unfold);
    if (pa > 0) {
      const poc = pocOf(prof);
      const done = vt >= ACCEPT_B[1].t1;
      for (const [ps, v] of Object.entries(prof)) {
        if (v <= 0) continue;
        const p = Number(ps);
        ctx.save();
        ctx.globalAlpha = a * pa;
        rrect(ctx, PX, PY(p) - 12, (v / 230) * 200, 24, 4);
        ctx.fillStyle = p === poc && done ? rgba(C.gold, 0.85) : rgba(C.sell, 0.5);
        ctx.fill();
        ctx.restore();
      }
      text(ctx, "跌破後的新成交", PX, PY(100.4), { family: F.tc, size: 18, weight: 800, color: C.sell, alpha: a * pa * (1 - planFade) });
      const pt = tw(vt, ACCEPT_B[1].t1, ACCEPT_B[1].t1 + 0.4) * (main ? 1 - tw(t, T.flip + 1, T.flip + 1.5) : 0);
      if (pt > 0) tag(ctx, `新 POC ${poc} · 區外 ${fmt(sumOf(prof))} 隻`, PX + 210, PY(poc), { color: C.gold, size: 17, alpha: a * pt });
    }
  }

  // ---- candles + volume + delta
  S.bars.forEach((b, i) => {
    if (!b) return;
    const x = spreadX(i, fo);
    const pop = main && i < 12 ? tw(t, 4.0 + i * 0.08, 4.4 + i * 0.08) : 1;
    const f = fo.find((q) => q.bar === i);
    const focusDim = fo.reduce((m, q) => m * (q.bar === i ? 1 : 1 - 0.55 * q.spread), 1);
    const isLive = i === S.live && i >= 12;
    const body = f ? 1 - f.unfold * 0.75 : 1;
    candle(ctx, x, 30 * body, PY(b.o), PY(b.h), PY(b.l), PY(b.c), { alpha: a * pop * focusDim, wickWidth: 3, minBody: 5, glow: isLive && main ? 16 : 0 });
    const col = b.c >= b.o ? C.buy : C.sell;
    ctx.save();
    ctx.globalAlpha = a * pop * focusDim;
    rrect(ctx, x - 15, VB - b.vis * VS, 30, b.vis * VS, 4);
    ctx.fillStyle = rgba(col, 0.55);
    ctx.fill();
    ctx.restore();
    if (b.v > 0 && i >= 12)
      text(ctx, String(b.v), x, VB - b.vis * VS - 12, { family: F.display, size: 19, weight: 700, color: C.text, align: "center", alpha: a * pop * focusDim * 0.9 });
    if (!b.pending)
      text(ctx, signed(b.d), x, VB + 24, { family: F.mono, size: 14, weight: 700, color: b.d >= 0 ? C.buy : C.sell, align: "center", alpha: a * pop * focusDim * (i >= 12 ? 0.9 : 0.55) });
  });
  text(ctx, "量 / Δ", X(0) - 56, VB - 10, { family: F.tc, size: 18, weight: 700, color: C.muted, align: "right", alpha: a * intro });

  // ---- live price marker
  if (S.live >= 12 && unfold < 0.05) {
    const y = PY(S.last);
    const xl = spreadX(S.live, fo) + 20;
    line(ctx, xl, y, xl + 64, y, C.gold, 2, a * 0.8);
    glow(ctx, xl, y, 20, C.gold, a * 0.6);
  }

  // ---- OI panel (neutral colour: OI has no side)
  const oiA = main ? tw(t, 5.0, 5.8) : 1;
  if (oiA > 0) {
    const top = OIY(1300);
    ctx.save();
    ctx.globalAlpha = a * oiA;
    rrect(ctx, X(0) - 40, top - 30, X(19) - X(0) + 110, OIY(980) - top + 50, 14);
    ctx.fillStyle = rgba(C.ink, 0.55);
    ctx.fill();
    ctx.strokeStyle = rgba(C.line, 0.9);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    text(ctx, "未平倉量 OI（隻）", X(0) - 24, top - 4, { family: F.tc, size: 18, weight: 800, color: OI_COL, alpha: a * oiA });
    const draw = main ? tw(t, 5.2, 7.0, ease.inOutQuad) : 1;
    const pts = S.oiPts.map(([x, v]) => [x, OIY(v)]);
    const n = Math.max(2, Math.ceil(pts.length * draw));
    neonPath(ctx, pts.slice(0, n), OI_COL, 2.6, a * oiA, 0.9);
    const endPt = pts[n - 1];
    glow(ctx, endPt[0], endPt[1], 22, OI_COL, a * oiA * 0.8);
    text(ctx, fmt(S.oiExact), endPt[0] + 16, endPt[1] - 14, { family: F.display, size: 26, weight: 700, color: OI_COL, alpha: a * oiA * draw });
    if (main && !A) {
      const st = tw(vt, T.stop, T.stop + 0.3) * (1 - tw(t, 64.6, 65.0));
      if (st > 0) tag(ctx, "OI −160：停損平掉舊多單", X(13) + 40, OIY(1020), { color: C.gold, size: 18, alpha: a * st });
      const acc = tw(vt, ACCEPT_B[0].t0 + 0.4, ACCEPT_B[0].t0 + 0.9) * (1 - tw(t, T.flip, T.flip + 0.5));
      if (acc > 0) {
        neonPath(ctx, pts.filter(([x]) => x >= X(14) - 24 && x <= X(15) + 24), RED, 3.6, a * acc, 1.4);
        tag(ctx, "OI +200：新倉在區域下方建立", X(15) + 60, OIY(1300), { color: RED, size: 18, alpha: a * acc });
      }
    }
  }
}

/** Footprint cells for rows lo..hi around x (sells left, buys right). */
function fpCells(ctx, fp, x, lo, hi, FW, al, o = {}) {
  text(ctx, "主動賣", x - 16 - FW / 2, PY(hi + 0.85), { family: F.tc, size: 13, weight: 700, color: C.sell, align: "center", alpha: al });
  text(ctx, "主動買", x + 16 + FW / 2, PY(hi + 0.85), { family: F.tc, size: 13, weight: 700, color: C.buy, align: "center", alpha: al });
  for (let p = lo; p <= hi; p++) {
    const cell = o.cell?.(p) ?? fp[p] ?? { bid: 0, ask: 0 };
    for (const [side, v] of [["bid", cell.bid], ["ask", cell.ask]]) {
      const x0 = side === "bid" ? x - 16 - FW : x + 16;
      const hl = o.hl?.(p, side) ?? 0;
      ctx.save();
      ctx.globalAlpha = al;
      rrect(ctx, x0, PY(p) - 14, FW, 28, 5);
      ctx.fillStyle = rgba(side === "bid" ? C.sell : C.buy, 0.08 + 0.42 * clamp(v / (o.scale ?? 150)) + 0.25 * hl);
      ctx.fill();
      if (hl > 0) {
        const hc = o.hlColor ?? C.gold;
        ctx.strokeStyle = rgba(hc, hl);
        ctx.lineWidth = 2;
        ctx.shadowColor = hc;
        ctx.shadowBlur = 16 * (0.6 + 0.4 * Math.sin(o.t * 7));
        ctx.stroke();
      }
      ctx.restore();
      text(ctx, String(v), x0 + FW / 2, PY(p) + 1, { family: F.display, size: 20, weight: 700, color: v ? C.text : C.dim, align: "center", base: "middle", alpha: al });
    }
  }
}

/** A, bar 14: the sells into 101, replayed inside its footprint, against the resting bid. */
function absorbView(ctx, t, a) {
  const f = foci(t, "A").find((q) => q.bar === 13);
  if (!f || f.unfold <= 0) return;
  const fp = footprint(TRADES_A, 13);
  const FW = 88 * f.unfold;
  const x = X(13);
  const al = a * f.unfold;
  const amounts = [120, 80, 100, 80];
  const replayed = amounts.reduce((s, q, k) => s + (t >= T.replay[k] ? q : 0), 0);
  text(ctx, "第 14 根足跡 · 回看 101", x, PY(104.6), { family: F.tc, size: 15, weight: 800, color: C.gold, align: "center", alpha: al, ls: 1 });
  fpCells(ctx, fp, x, 101, 103, FW, al, {
    t,
    cell: (p) => (p === 101 ? { bid: replayed, ask: fp[101].ask } : null),
    hl: (p, side) => (p === 101 && side === "bid" ? tw(t, T.replay[0] - 0.4, T.replay[0]) : 0),
  });
  // the resting bid at 101: hit, refilled, hit again
  const steps = [
    [T.replay[0], -120],
    [T.replay[1], -80],
    [T.refill, 150],
    [T.replay[2], -100],
    [T.replay[3], -80],
  ];
  let q = 400;
  let hit = -9;
  for (const [ts, dq] of steps)
    if (t >= ts) {
      q += dq;
      hit = ts;
    }
  const bx = x - 16 - FW - 12;
  const w = q * 0.3;
  ctx.save();
  ctx.globalAlpha = al;
  rrect(ctx, bx - w, PY(101) - 10, w, 20, 4);
  ctx.fillStyle = rgba(C.buy, 0.75);
  ctx.shadowColor = C.buy;
  ctx.shadowBlur = 10 + 20 * pulse(t, hit, 4);
  ctx.fill();
  ctx.restore();
  text(ctx, `掛買 ${q}`, bx - w - 8, PY(101) + 1, { family: F.tc, size: 13, weight: 800, color: C.buy, align: "right", base: "middle", alpha: al });
  floatChip(ctx, "補 +150", bx - 40, PY(101) - 22, t, T.refill, { color: C.buy, size: 18, dur: 0.9, rise: 26 });
  T.replay.forEach((ts, k) => burst(ctx, x - 16 - FW / 2, PY(101), t, ts, { n: 16, speed: 160, color: C.sell, seed: 160 + k, flare: 34 }));
  const fl = tw(t, T.replay[0] + 0.2, T.replay[0] + 0.6);
  neonPath(ctx, [[x - 16 - FW - 70, PY(101) + 16], [x + 16 + FW + 30, PY(101) + 16]], C.gold, 1.6, al * fl, 1);
  text(ctx, "價格停在 101", x + 16 + FW + 6, PY(101) + 32, { family: F.tc, size: 14, weight: 800, color: C.gold, alpha: al * fl });
}

/** A, bar 15: two stacked diagonal buy imbalances. */
function imbalanceView(ctx, t, a) {
  const f = foci(t, "A").find((q) => q.bar === 14);
  if (!f || f.unfold <= 0) return;
  const fp = footprint(TRADES_A, 14);
  const FW = 84 * f.unfold;
  const x = X(14);
  const al = a * f.unfold;
  const bidX = x - 16 - FW;
  const askX = x + 16;
  const pairs = [
    { p: 102, t0: T.imb[0] + 0.9 },
    { p: 103, t0: T.imb[0] + 1.35 },
  ];
  text(ctx, "第 15 根足跡 · 斜著比", x, PY(104.6), { family: F.tc, size: 15, weight: 800, color: C.gold, align: "center", alpha: al, ls: 1 });
  fpCells(ctx, fp, x, 101, 103, FW, al, {
    t,
    scale: 90,
    hlColor: C.buy,
    hl: (p, side) => {
      const pr = pairs.find((q) => q.p === p);
      return side === "ask" && pr ? tw(t, pr.t0 + 0.3, pr.t0 + 0.5) : 0;
    },
  });
  for (const { p, t0 } of pairs) {
    const ask = fp[p].ask;
    const bid = fp[p - 1].bid;
    const u = tw(t, t0, t0 + 0.35, ease.outCubic);
    arrow(ctx, bidX + FW / 2 + 14, PY(p - 1) - 6, askX + FW / 2 - 18, PY(p) + 6, C.gold, u, { width: 2.4, head: 9, alpha: al });
    tag(ctx, `${ask} ÷ ${bid} = ${+(ask / bid).toFixed(1)} 倍`, askX + FW + 10, PY(p), { color: C.buy, size: 15, alpha: al * tw(t, t0 + 0.3, t0 + 0.5) });
    if (u > 0 && u < 1) glow(ctx, lerp(bidX + FW / 2, askX + FW / 2, u), lerp(PY(p - 1), PY(p), u), 18, C.gold, al);
  }
  tag(ctx, "連續兩格 ≥ 3 倍：買方不平衡堆疊", x, PY(99.6), { align: "center", color: C.buy, solid: true, size: 15, alpha: al * tw(t, T.imb[0] + 1.8, T.imb[0] + 2.1) });
}

/** B, bar 17: the retest's footprint fills live; buyers lift 150 at 100 and get nowhere. */
function retestView(ctx, t, S, a) {
  const f = foci(t, "B").find((q) => q.bar === 16);
  if (!f || f.unfold <= 0) return;
  const fp = footprint(TRADES_B, 16, S.vt);
  const FW = 84 * f.unfold;
  const x = X(16);
  const al = a * f.unfold;
  text(ctx, "第 17 根足跡 · 從下方回測", x, PY(101.6), { family: F.tc, size: 15, weight: 800, color: C.gold, align: "center", alpha: al, ls: 1 });
  fpCells(ctx, fp, x, 98, 100, FW, al, {
    t,
    hlColor: C.sell,
    hl: (p, side) => (p === 100 && side === "ask" ? tw(S.vt, 71.7, 72.0) : 0),
  });
  // the resting ask at 100, on the right
  const q = S.book.ask[100] ?? 0;
  const bx = x + 16 + FW + 12;
  ctx.save();
  ctx.globalAlpha = al;
  rrect(ctx, bx, PY(100) - 10, q * 0.4, 20, 4);
  ctx.fillStyle = rgba(C.sell, 0.75);
  ctx.shadowColor = C.sell;
  ctx.shadowBlur = 10 + 20 * Math.max(pulse(t, 71.7, 4), pulse(t, 72.2, 4));
  ctx.fill();
  ctx.restore();
  text(ctx, `掛賣 ${q}`, bx + q * 0.4 + 8, PY(100) + 1, { family: F.tc, size: 13, weight: 800, color: C.sell, base: "middle", alpha: al });
  floatChip(ctx, "補 +100", bx + 40, PY(100) - 22, t, 72.6, { color: C.sell, size: 18, dur: 0.9, rise: 26 });
  const cl = tw(S.vt, 72.2, 72.6);
  text(ctx, "買了 150，價格停在 100", x, PY(97.2), { family: F.tc, size: 15, weight: 800, color: C.gold, align: "center", alpha: al * cl });
}

// ---- plan overlays (world space)
function entryPin(ctx, t, vt, x, y, x1, col, label, a, live) {
  const pin = spring(vt, x.t, 16, 7);
  if (pin <= 0 || vt < x.t) return;
  const py = y - (1 - pin) * 160;
  ctx.save();
  ctx.globalAlpha = a * clamp(pin * 3);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x.x, py);
  ctx.lineTo(x.x - 18, py - 12);
  ctx.lineTo(x.x - 18, py + 12);
  ctx.closePath();
  ctx.shadowColor = col;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.restore();
  const ex = lerp(x.x, x1, tw(vt, x.t, x.t + 0.5, ease.outQuart));
  line(ctx, x.x, y, ex, y, col, 2, a * clamp(pin * 3));
  tag(ctx, label, ex + 8, y, { color: col, solid: true, size: 18, alpha: a * clamp(pin * 3) });
  if (live) ring(ctx, x.x, y, t, x.t + 0.15, { r1: 110, color: col, w: 3 });
}

function riskBox(ctx, vt, t0, x0, x1full, plan, labels, a, long) {
  const rr = tw(vt, t0, t0 + 0.9, ease.outQuart);
  if (rr <= 0) return;
  const x1 = lerp(x0, x1full, rr);
  ctx.save();
  ctx.globalAlpha = a * 0.16;
  ctx.fillStyle = C.sell;
  ctx.fillRect(x0, PY(plan.entry), x1 - x0, PY(plan.stop) - PY(plan.entry));
  ctx.fillStyle = C.buy;
  ctx.fillRect(x0, PY(plan.t2), x1 - x0, PY(plan.entry) - PY(plan.t2));
  ctx.restore();
  line(ctx, x0, PY(plan.entry), x1, PY(plan.entry), long ? C.buy : C.sell, 2, a);
  line(ctx, x0, PY(plan.stop), x1, PY(plan.stop), RED, 2.4, a);
  line(ctx, x0, PY(plan.t1), x1, PY(plan.t1), C.gold, 2.4, a, [10, 6]);
  line(ctx, x0, PY(plan.t2), x1, PY(plan.t2), C.gold, 2, a * 0.8, [4, 6]);
  const la = a * tw(vt, t0 + 0.5, t0 + 0.9);
  const lx = x1full + 8;
  tag(ctx, labels.stop, lx, PY(plan.stop), { color: RED, size: 17, alpha: la });
  tag(ctx, labels.t1, lx, PY(plan.t1) + (long ? 0 : -6), { color: C.gold, size: 17, alpha: la });
  tag(ctx, labels.t2, lx, PY(plan.t2) + (long ? 0 : 22), { color: C.gold, size: 17, alpha: la });
}

function planA(ctx, t, S, a) {
  const vt = S.vt;
  const live = t < T.rew[0];
  const wall = tw(t, T.confirm, T.confirm + 0.3) * (1 - tw(t, T.confirm + 0.5, T.confirm + 0.8)) + tw(t, 26.3, 26.6) * (1 - tw(t, 28.1, 28.5));
  if (live && wall > 0) tag(ctx, `牆還在：101 掛買 ${S.book.bid[101] ?? 0}`, X(12) + 30, PY(103.3), { color: C.buy, size: 18, alpha: a * wall });
  if (live) {
    floatChip(ctx, "101 補 +150", X(13) - 70, PY(101) + 8, t, 29.2, { color: C.buy, size: 22, dur: 1.0, rise: 30 });
    const fl = tw(t, 28.7, 29.0) * (1 - tw(t, T.zoom, T.zoom + 0.4));
    if (fl > 0) tag(ctx, "主動賣出撞上買牆", X(13) + 30, PY(103.3), { color: C.sell, size: 18, alpha: a * fl });
  }
  // equal lows, far less selling
  const dv = tw(vt, T.diverge, T.diverge + 0.5) * (live ? 1 - tw(t, T.reclaim, T.reclaim + 0.5) : 0);
  if (dv > 0) {
    neonPath(ctx, [[X(13) - 24, PY(101) + 20], [X(14) + 24, PY(101) + 20]], C.gold, 2, a * dv, 1);
    tag(ctx, "同一個低點 101 · 主動賣 380 → 20", X(12) + 24, PY(105.2), { color: C.gold, size: 18, alpha: a * dv });
  }
  if (live) {
    ring(ctx, X(14), PY(102), t, 42.1, { r1: 140, color: C.buy, w: 3 });
    ring(ctx, X(14), PY(103), t, T.reclaim, { r1: 200, color: C.buy, w: 4 });
    const rc = tw(t, T.reclaim, T.reclaim + 0.3) * (1 - tw(t, T.execute - 0.4, T.execute));
    if (rc > 0) tag(ctx, "收回：回到區域上方", X(14) + 30, PY(104.2), { color: C.buy, solid: true, size: 20, alpha: a * rc });
  }
  // stacked buy imbalance markers once the close-up folds away
  const imb = tw(t, T.imb[1] - 0.4, T.imb[1]) * (live ? 1 - tw(t, T.rally + 1.0, T.rally + 1.4) : 0);
  if (imb > 0) {
    for (const p of [102, 103]) {
      const x = X(14) + 20;
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
  }
  entryPin(ctx, t, vt, { x: X(14) - 26, t: PLAN_A.entryT }, PY(PLAN_A.entry), X(16) + 50, C.buy, `做多 ${PLAN_A.entry}`, a, live);
  riskBox(ctx, vt, T.risk, X(14) - 26, X(16) + 50, PLAN_A, {
    stop: `停損 ${PLAN_A.stop} · 停損堆外面`,
    t1: `目標一 ${PLAN_A.t1} · ${R_A(PLAN_A.t1).toFixed(1)}R`,
    t2: `目標二 ${PLAN_A.t2} · 前高 · ${R_A(PLAN_A.t2).toFixed(1)}R`,
  }, a, true);
  const herd = tw(vt, T.risk + 0.6, T.risk + 1.0) * (live ? 1 - tw(t, T.rally + 1.2, T.rally + 1.6) : 0);
  if (herd > 0) tag(ctx, "不放 99：那裡是大家的停損", X(13) - 10, PY(97.6), { color: RED, size: 16, alpha: a * herd });
  if (live) {
    ring(ctx, X(16), PY(PLAN_A.t1), t, T.target, { r1: 220, color: C.buy, w: 4, dur: 1 });
    burst(ctx, X(16), PY(PLAN_A.t1), t, T.target, { n: 30, speed: 420, color: C.buy, seed: 177, flare: 120 });
    const hit = tw(t, T.target, T.target + 0.2) * (1 - tw(t, T.rew[0], T.rew[0] + 0.3));
    if (hit > 0) tag(ctx, `到達目標一 ${PLAN_A.t1}`, X(16), PY(PLAN_A.t1) - 40, { align: "center", color: C.buy, solid: true, size: 22, alpha: a * hit });
  }
}

function planB(ctx, t, S, a, live) {
  const vt = S.vt;
  if (live) {
    // the pulled bids evaporate before price arrives
    T.pull.forEach((tp, k) => {
      const p = k ? 100 : 101;
      const ev = t - tp;
      if (ev > 0 && ev < 1.6)
        for (let i = 0; i < 24; i++) {
          const x = lerp(X(7 + k), X(12) + 20, rnd(141 + k, i)) + ev * rrange(142, i, 20, 90);
          const y = PY(p) + rrange(143, i, -11, 11) - ev * ev * rrange(144, i, 40, 160);
          glow(ctx, x, y, 10 * (1 - ev / 1.6), C.buy, 0.9 * (1 - ev / 1.6));
        }
      floatChip(ctx, `撤單 ${k ? "−200" : "−330"}`, X(10), k ? PY(98.6) : PY(101.4), t, tp, { color: RED, size: 28, dur: 1.6 });
    });
    const nc = tw(t, T.pull[0] + 0.3, T.pull[0] + 0.6) * (1 - tw(t, 60.4, 60.8));
    if (nc > 0) tag(ctx, "撤單：沒有成交，價格不動", X(8), PY(97.6), { color: RED, size: 18, alpha: a * nc });
    // the break
    ring(ctx, X(13), PY(99), t, T.stop, { r1: 360, color: RED, w: 6, dur: 1.1 });
    ring(ctx, X(13), PY(99), t, T.stop + 0.12, { r1: 220, color: C.gold, w: 3, dur: 0.8 });
    const st = tw(t, T.stop, T.stop + 0.12) * (1 - tw(t, 64.4, 64.9));
    if (st > 0) tag(ctx, "跌破 100 → 停損市價賣出", X(13) + 36, PY(101.4), { color: C.sell, solid: true, size: 20, alpha: a * st });
    const thin = tw(vt, 63.7, 64.0) * (1 - tw(t, 64.8, 65.2));
    if (thin > 0) tag(ctx, "LVN：成交稀薄，一路滑到 96", X(13) + 36, PY(95.6), { color: C.sell, size: 18, alpha: a * thin });
  }
  // old support, new resistance: a ceiling over the retest
  const ceil = tw(vt, 72.2, 72.6) * (live ? 1 - tw(t, 76.2, 76.6) : 0);
  if (ceil > 0 && foci(t, "B")[0].unfold < 0.05) tag(ctx, "100：主動買 150，價格推不過", X(16) + 30, PY(101.3), { color: C.sell, size: 18, alpha: a * ceil });
  // stacked sell imbalance on the way back down
  const imb = tw(vt, B4_T, B4_T + 0.3) * (live ? 1 - tw(t, 80.6, 81.0) : 1);
  if (imb > 0) {
    for (const p of [99, 98]) {
      const x = X(17) + 20;
      ctx.save();
      ctx.globalAlpha = a * imb;
      ctx.fillStyle = C.sell;
      ctx.shadowColor = C.sell;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(x, PY(p) - 8);
      ctx.lineTo(x + 10, PY(p) + 8);
      ctx.lineTo(x + 20, PY(p) - 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const lb = live ? tw(vt, B4_T, B4_T + 0.3) * (1 - tw(t, T.riskB + 0.4, T.riskB + 0.8)) : 0;
    if (lb > 0) tag(ctx, "賣方不平衡 4 倍、6 倍", X(15) - 10, PY(95.3), { color: C.sell, size: 17, alpha: a * lb });
  }
  entryPin(ctx, t, vt, { x: X(17) - 26, t: PLAN_B.entryT }, PY(PLAN_B.entry), X(19) + 50, C.sell, `做空 ${PLAN_B.entry}`, a, live);
  riskBox(ctx, vt, T.riskB, X(17) - 26, X(19) + 50, PLAN_B, {
    stop: `停損 ${PLAN_B.stop} · 回測高點外 1 元`,
    t1: `目標一 ${PLAN_B.t1} · ${R_B(PLAN_B.t1).toFixed(1)}R`,
    t2: `目標二 ${PLAN_B.t2} · 起漲點 · ${R_B(PLAN_B.t2).toFixed(1)}R`,
  }, a, false);
  if (live) {
    ring(ctx, X(19), PY(PLAN_B.t1), t, T.targetB, { r1: 220, color: C.sell, w: 4, dur: 1 });
    burst(ctx, X(19), PY(PLAN_B.t1), t, T.targetB, { n: 30, speed: 420, color: C.sell, seed: 178, flare: 120 });
    const hit = tw(t, T.targetB, T.targetB + 0.2) * (1 - tw(t, T.split, T.split + 0.3));
    if (hit > 0) tag(ctx, `到達目標一 ${PLAN_B.t1}`, X(19), PY(PLAN_B.t1) + 44, { align: "center", color: C.sell, solid: true, size: 22, alpha: a * hit });
  }
}

// ---------------------------------------------------------------- screen-space pieces
/** The four reasons, stacking into one zone. */
function reasonList(ctx, t) {
  const out = 1 - tw(t, T.liq, T.liq + 0.6);
  if (t < T.src[0] || out <= 0) return;
  const rows = ["① 前低 100，碰過兩次", "② 整數 100", "③ HVN 101–103", "④ 下方 LVN 95–99"];
  const x = 250;
  rows.forEach((r, i) => {
    const u = tw(t, T.src[i], T.src[i] + 0.4, ease.outCubic);
    if (u <= 0) return;
    tag(ctx, r, x + (1 - u) * -60, 214 + i * 44, { color: i < 2 ? C.gold : i === 2 ? C.buy : C.sell, size: 19, alpha: u * out });
  });
  const z = tw(t, T.zoneIn, T.zoneIn + 0.4, ease.outBack);
  if (z > 0) tag(ctx, `＝ 支撐區 ${ZONE.lo}–${ZONE.hi}`, x, 214 + 4 * 44 + 6, { color: C.buy, solid: true, size: 21, alpha: clamp(z) * out });
}

/** How much a drawn level is worth: Osler (2000), published vs arbitrary levels. */
function edgeCard(ctx, t) {
  const a = tw(t, T.edge, T.edge + 0.5) * (1 - tw(t, T.event - 0.4, T.event));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.55 * a;
  ctx.fillStyle = "#03060b";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const w = 820;
  const h = 330;
  const x0 = W / 2 - w / 2;
  const y0 = H / 2 - h / 2 + 40;
  const s = 0.92 + 0.08 * ease.outBack(prog(t, T.edge, T.edge + 0.5));
  ctx.save();
  ctx.translate(W / 2, y0 + h / 2);
  ctx.scale(s, s);
  ctx.translate(-W / 2, -(y0 + h / 2));
  ctx.globalAlpha = a;
  rrect(ctx, x0, y0, w, h, 22);
  ctx.fillStyle = "rgba(8,14,24,0.94)";
  ctx.fill();
  ctx.strokeStyle = rgba(C.gold, 0.6);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  text(ctx, "研究：價格碰到支撐壓力後，反彈的比例", x0 + 44, y0 + 54, { family: F.tc, size: 26, weight: 800, color: C.text, alpha: a });
  const rows = [
    { k: "機構公布的價位", v: 60.8, col: C.gold, t0: T.edge + 0.4 },
    { k: "隨機畫的價位", v: 56.2, col: C.muted, t0: T.edge + 0.7 },
  ];
  rows.forEach((r, i) => {
    const y = y0 + 118 + i * 74;
    const u = tw(t, r.t0, r.t0 + 0.8, ease.outQuart);
    const bw = 440 * (r.v / 70) * u;
    text(ctx, r.k, x0 + 44, y + 1, { family: F.tc, size: 22, weight: 700, color: C.muted, base: "middle", alpha: a });
    ctx.save();
    ctx.globalAlpha = a;
    rrect(ctx, x0 + 240, y - 16, Math.max(2, bw), 32, 6);
    ctx.fillStyle = rgba(r.col, 0.75);
    ctx.fill();
    ctx.restore();
    text(ctx, `${(r.v * u).toFixed(1)}%`, x0 + 252 + bw, y + 1, { family: F.display, size: 34, weight: 700, color: r.col, base: "middle", alpha: a * u });
  });
  text(ctx, "Osler (2000)，外匯日內資料 · 差距約 4.6 個百分點", x0 + 44, y0 + h - 36, { family: F.tc, size: 17, weight: 500, color: C.dim, alpha: a });
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
  id: "support-resistance",
  title: "同一道支撐，守住或翻轉",
  duration: T.end,
  description:
    "用前低、整數、HVN、LVN 四個理由畫出 100–102 支撐區。A：買牆沒撤、101 吸收 380、再探賣壓只剩 20、收回 103，做多停損 98。倒回到價前，B：買牆先撤、跌破後在區外成交 560、回測 100 被賣單吸收，做空 98、停損 101。",
  note: "線給地點，\n成交給答案。",
  footer:
    "教學用合成行情：同一份逐筆帳本產生 K 線、足跡、量、OI、掛單與成交分布。區域、停損位置與 3 倍不平衡為本課設定；60.8%／56.2% 引自 Osler (2000) 外匯日內研究，不代表本課勝率。",
  audio: "./motion/audio/support-resistance.m4a",
  music: {
    palette: "tense",
    bpm: 116,
    sections: [
      { t: 0, level: 0 },
      { t: T.over, level: 1 },
      { t: T.where, level: 2 },
      { t: T.edge, level: 1 },
      { t: T.event, level: 2 },
      { t: 26.6, level: 3 },
      { t: T.zoom, level: 2 },
      { t: T.reclaim, level: 3 },
      { t: T.execute, level: 2 },
      { t: T.rally, level: 3 },
      { t: T.rew[0], level: 0 },
      { t: T.rew[1], level: 1 },
      { t: 60.9, level: 3 },
      { t: 64.8, level: 2 },
      { t: 76.6, level: 3 },
      { t: T.split, level: 2 },
      { t: T.final, level: 1 },
      { t: 90.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "全景：回到起漲區" },
    { t: T.where, label: "地點：畫出區域" },
    { t: T.event, label: "事件：價格到了" },
    { t: T.confirm, label: "A 確認：守住" },
    { t: T.execute, label: "A 執行：做多" },
    { t: T.rew[0], label: "B：撤單與跌破" },
    { t: 70.4, label: "B 執行：回測做空" },
    { t: T.split, label: "兩種交易" },
  ],
  captions: [
    { a: 4.6, b: 8.4, text: "價格回到上次起漲的地方。" },
    { a: 8.5, b: 13.9, text: "四個理由疊在一起，才畫成一個區域。" },
    { a: 14.0, b: 16.9, text: "停損在區域外，承接在區域內。" },
    { a: 17.0, b: 19.4, text: "線只給地點，不給答案。" },
    { a: 19.5, b: 23.3, text: "價格來了，先看掛單還在不在。" },
    { a: 23.4, b: 26.5, text: "牆還在。" },
    { a: 26.6, b: 30.9, text: "主動賣出撞上 101 的買牆。" },
    { a: 31.0, b: 37.9, text: "回看 101：賣了 380，價格沒再往下。" },
    { a: 38.0, b: 41.9, text: "再來一次，賣的人少了。" },
    { a: 42.0, b: 45.5, text: "收回區域上方：這道支撐守住了。" },
    { a: 45.6, b: 49.3, text: "回測時，買方連兩格壓過賣方。" },
    { a: 49.4, b: 50.9, text: "停損不放在大家都放的 99。" },
    { a: 51.0, b: 54.3, text: "守住，就做回彈。" },
    { a: 54.4, b: 56.3, text: "回到同一個到價前。" },
    { a: 56.4, b: 60.8, text: "這次價格還沒到，牆先走了。" },
    { a: 60.9, b: 64.7, text: "跌破整數，停損把價格推過稀薄區。" },
    { a: 64.8, b: 70.3, text: "價格在下面留下來了：被接受。" },
    { a: 70.4, b: 76.5, text: "舊支撐，現在接住了買單。" },
    { a: 76.6, b: 79.3, text: "回測推不過，賣方連兩格接手。" },
    { a: 79.4, b: 82.3, text: "支撐翻成壓力，回測不過才做空。" },
    { a: 82.4, b: 87.3, text: "同一道支撐，兩種交易。" },
    { a: 87.4, b: 92, text: "線給地點，成交給答案。" },
  ],
  flashes: [
    { t: T.open + 0.9, amt: 0.35, decay: 5, pre: 0.5 },
    { t: T.zoneIn, amt: 0.15, decay: 8 },
    ...LAND_A.map((t) => ({ t, amt: 0.12, decay: 10 })),
    { t: T.reclaim, amt: 0.22, decay: 7 },
    { t: T.target, amt: 0.25, decay: 6 },
    { t: T.rew[1], amt: 0.3, decay: 7 },
    { t: T.stop, amt: 0.45, decay: 6, pre: 0.25 },
    ...LAND_B.map((t) => ({ t, amt: 0.12, decay: 10 })),
    { t: T.flip, amt: 0.2, decay: 7 },
    { t: T.targetB, amt: 0.25, decay: 6 },
  ],
  cues: [
    { t: 0.1, kind: "tick", vel: 0.4 },
    ...RAIL.map((_, i) => ({ t: 0.3 + i * 0.26 + 0.5, kind: "whoosh", dur: 0.4, vel: 0.7 })),
    ...RAIL.map((_, i) => ({ t: 0.3 + i * 0.26 + 0.75, kind: "stamp" })),
    { t: 1.35, kind: "type", n: 11 },
    { t: 2.6, kind: "riser", dur: 1.3 },
    { t: T.open + 0.9, kind: "impact", big: true },
    ...HIST.map((_, i) => ({ t: 4.0 + i * 0.08, kind: "blip", vel: 0.22, freq: 800 + i * 50 })),
    { t: 5.0, kind: "swell", dur: 2.0 },
    ...T.src.map((t, i) => ({ t, kind: "stamp", vel: 0.6 + i * 0.05 })),
    { t: T.src[1] + 0.1, kind: "scan", price: 100 },
    { t: T.zoneIn, kind: "shimmer" },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ t: T.liq + 0.25 + i * 0.06, kind: "tick", vel: 0.3 })),
    { t: T.liq + 0.5, kind: "swell", dur: 1.2 },
    { t: T.edge, kind: "whoosh", dur: 0.7 },
    { t: T.edge + 0.5, kind: "rise", dur: 0.8 },
    { t: T.event, kind: "thud" },
    ...SHARED.map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side, soft: true })),
    { t: 21.8, kind: "riser", dur: 1.6, vel: 0.6 },
    ...EVIDENCE.flatMap((e) => [
      { t: e.t0 + 0.05, kind: "whoosh", dur: 0.6 },
      { t: e.t0 + 0.55, kind: "impact", vel: 0.55 },
      { t: e.t0 + 1.9, kind: "whoosh", dur: 0.5, vel: 0.8 },
      { t: e.t0 + EV_DUR, kind: "stamp" },
    ]),
    ...TRADES_A.filter((x) => x.bar === 13).map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side, big: x.qty >= 100 })),
    { t: 29.2, kind: "rise", dur: 0.3 },
    { t: T.zoom + 0.2, kind: "whoosh", dur: 1.1 },
    // the absorption: the same note, again and again
    ...T.replay.map((t) => ({ t, kind: "fill", price: 101, side: "sell" })),
    { t: T.refill, kind: "rise", dur: 0.3 },
    ...TRADES_A.filter((x) => x.bar === 14).map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side, soft: x.qty < 30 })),
    { t: T.reclaim, kind: "impact" },
    { t: T.imb[0] + 0.2, kind: "whoosh", dur: 0.9 },
    { t: T.imb[0] + 0.9, kind: "fill", price: 102, side: "buy" },
    { t: T.imb[0] + 1.35, kind: "fill", price: 103, side: "buy" },
    { t: T.imb[0] + 1.8, kind: "stamp" },
    { t: T.imb[1] - 0.7, kind: "whoosh", dur: 0.7 },
    { t: PLAN_A.entryT, kind: "stamp" },
    { t: PLAN_A.entryT + 0.05, kind: "coin", vel: 0.4 },
    { t: T.risk, kind: "whoosh", dur: 0.8 },
    ...RALLY_A.flatMap((b) => [0, 1, 2, 3].map((k) => ({ t: b.t0 + k * 0.32, kind: "fill", price: Math.round(lerp(b.o, b.c, k / 3)), side: "buy", soft: true }))),
    { t: T.target, kind: "fill", price: 108, side: "buy", big: true },
    { t: T.target + 0.05, kind: "coin", vel: 0.6 },
    { t: T.rew[0], kind: "drain", dur: 1.8 },
    { t: T.rew[0] + 0.1, kind: "riser", dur: 1.8, vel: 0.5 },
    { t: T.rew[1], kind: "impact", big: true },
    ...T.pull.map((t) => ({ t, kind: "drain", dur: 0.7 })),
    { t: 59.6, kind: "riser", dur: 1.3 },
    ...TRADES_B.filter((x) => x.t > T.rew[1]).map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side, big: x.t === T.stop, soft: x.qty < 20 })),
    { t: T.stop, kind: "impact", big: true },
    { t: T.stop + 0.05, kind: "alarm" },
    { t: T.stop + 0.2, kind: "rumble", dur: 2.0 },
    ...ACCEPT_B.map((b) => ({ t: b.t0 + 0.4, kind: "thud", vel: 0.5 })),
    { t: T.flip, kind: "crack", price: 100, loud: false },
    { t: T.fpB[0] + 0.2, kind: "whoosh", dur: 0.9 },
    { t: 72.6, kind: "rise", dur: 0.3 },
    { t: B4_T, kind: "stamp" },
    { t: PLAN_B.entryT + 0.05, kind: "coin", vel: 0.4 },
    { t: T.riskB, kind: "whoosh", dur: 0.8 },
    ...DROP_B.flatMap((b) => [0, 1, 2, 3].map((k) => ({ t: b.t0 + k * 0.32, kind: "fill", price: Math.round(lerp(b.o, b.c, k / 3)), side: "sell", soft: true }))),
    { t: T.targetB, kind: "fill", price: 95, side: "sell", big: true },
    { t: T.targetB + 0.05, kind: "coin", vel: 0.6 },
    { t: T.split, kind: "whoosh", dur: 1.0 },
    { t: T.split + 0.6, kind: "shimmer" },
    { t: T.final, kind: "whoosh", dur: 1.2 },
    { t: T.final + 0.6, kind: "swell", dur: 2.4 },
    { t: 89.2, kind: "stamp" },
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
    warp(ctx, t, 1 - tw(t, T.open + 0.4, T.open + 1.2));

    // ---------- main world (full screen) until the split
    const mainFade = tw(t, T.split, T.split + 0.2);
    if (mainFade < 1) {
      const S = B ? SB : SA;
      dust(ctx, t, cam, worldA * (1 - splitIn));
      camera(ctx, cam, () => {
        ctx.globalAlpha = 1;
        // The profile steps back once the zone is drawn and the tape needs the eye.
        const profile = B ? 1 : 1 - 0.5 * tw(t, T.event, T.event + 0.8) * (1 - tw(t, T.rew[0], T.rew[1]));
        world(ctx, t, S, { alpha: worldA * (1 - mainFade), profile });
        if (!B) {
          absorbView(ctx, t, worldA);
          imbalanceView(ctx, t, worldA);
          const fo = foci(t, "A");
          planA(ctx, t, S, worldA * (1 - Math.max(...fo.map((f) => f.unfold))));
        } else {
          retestView(ctx, t, S, 1 - mainFade);
          planB(ctx, t, S, (1 - mainFade) * (1 - foci(t, "B")[0].unfold), true);
        }
        // sparks for fills (live only)
        if (t < T.rew[0] || B) {
          const fo = foci(t, S.branch);
          for (const x of B ? TRADES_B.filter((y) => y.t > T.rew[1]) : TRADES_A) {
            if (x.t > t || t - x.t > 1.2) continue;
            const col = x.side === "buy" ? C.buy : C.sell;
            burst(ctx, spreadX(x.bar, fo), PY(x.price), t, x.t, { n: x.qty >= 60 ? 22 : 12, speed: 240 + x.qty * 2, seed: x.price * 7 + x.bar, color: col, flare: 40 + x.qty * 0.5 });
          }
        }
      });
      // debris flying at the viewer when the stops fire
      if (!prefs.reduced && t > T.stop && t < T.stop + 1.3) {
        const [sx0, sy0] = toScreen(cam, X(13) + 90, PY(99));
        for (let i = 0; i < 24; i++) {
          const u = (t - T.stop - rrange(151, i, 0, 0.3)) / 1.1;
          if (u <= 0 || u >= 1) continue;
          const s = depthScale(lerp(0, -600, ease.inCubic(u)));
          const ang = rrange(152, i, -Math.PI, Math.PI);
          const dist = u * rrange(153, i, 280, 900);
          ctx.save();
          if (s > 1.8) ctx.filter = `blur(${Math.min(12, (s - 1.8) * 2.4)}px)`;
          bear(ctx, sx0 + Math.cos(ang) * dist * s * 0.7, sy0 + Math.sin(ang) * dist * s * 0.45, 30 * s, rnd(155, i) > 0.7 ? RED : C.sell, 0.85 * (1 - u) ** 1.2, { rot: u * rrange(154, i, -3, 3) });
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
        const y = ((rnd(161, Math.floor(t * 18) + i) * H) | 0) % H;
        ctx.save();
        ctx.globalAlpha = 0.18 * rw;
        ctx.fillStyle = C.text;
        ctx.fillRect(0, y, W, 1 + rnd(162, i) * 3);
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
      text(ctx, "回到同一個到價前", 0, 26, { family: F.tc, size: 64, weight: 900, color: C.text, align: "center", base: "middle", alpha: rw, glow: 12 });
      ctx.restore();
      text(ctx, `REWIND  −${(T.rew[0] - vtA).toFixed(1)}s`, W / 2, H / 2 + 120, { family: F.mono, size: 22, weight: 700, color: C.muted, align: "center", ls: 4, alpha: rw });
    }

    // ---------- split: A left, B right
    if (splitIn > 0) {
      const back = finalIn;
      const SAend = snapshot("A", T.target + 0.2);
      const SBnow = SB ?? snapshot("B", t);
      const full = { x: 0, y: 0, w: W, h: H };
      const L = { x: 60, y: 210, w: 880, h: 700 };
      const Rr = { x: 980, y: 210, w: 880, h: 700 };
      const mixR = (p, q, u) => ({ x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u), w: lerp(p.w, q.w, u), h: lerp(p.h, q.h, u) });
      const camPane = { x: 960, y: 700, z: 0.54 };
      const camFull = { x: 940, y: 520, z: 0.66 };
      // B shrinks from full screen into the right pane
      if (back < 1) {
        const cB = { x: lerp(990, camPane.x, splitIn), y: lerp(680, camPane.y, splitIn), z: lerp(0.92, camPane.z, splitIn) };
        pane(ctx, t, SBnow, mixR(full, Rr, splitIn), cB, { color: C.sell, alpha: 1 - back });
      }
      // A slides in from the left, then grows back to full screen
      const aIn = tw(t, T.split + 0.3, T.split + 1.3, ease.outQuart);
      const rA = back > 0 ? mixR(L, full, back) : mixR({ ...L, x: L.x - 1000 }, L, aIn);
      const cA = back > 0 ? { x: lerp(camPane.x, camFull.x, back), y: lerp(camPane.y, camFull.y, back), z: lerp(camPane.z, camFull.z, back) } : camPane;
      pane(ctx, t, SAend, rA, cA, { color: C.buy, alpha: aIn });
      const la = tw(t, T.split + 1.0, T.split + 1.5) * (1 - back);
      if (la > 0) {
        tag(ctx, `A · 守住 → 做多 ${PLAN_A.entry}`, L.x + 24, L.y - 34, { color: C.buy, solid: true, size: 24, alpha: la });
        tag(ctx, `B · 翻轉 → 做空 ${PLAN_B.entry}`, Rr.x + 24, Rr.y - 34, { color: C.sell, solid: true, size: 24, alpha: la });
        const rows = [
          ["牆留著", "牆先撤"],
          ["101 吸收 380", "區外被接受"],
          ["回測買方接手", "回測賣方接手"],
        ];
        rows.forEach(([va, vb], i) => {
          const y = L.y + L.h + 30;
          const ra = la * tw(t, T.split + 1.3 + i * 0.2, T.split + 1.6 + i * 0.2);
          checkGlyph(ctx, 72 + i * 290, y, 1, C.buy, ra);
          text(ctx, va, 90 + i * 290, y + 1, { family: F.tc, size: 20, weight: 700, color: C.text, base: "middle", alpha: ra });
          checkGlyph(ctx, 992 + i * 290, y, 1, C.sell, ra);
          text(ctx, vb, 1010 + i * 290, y + 1, { family: F.tc, size: 20, weight: 700, color: C.text, base: "middle", alpha: ra });
        });
      }
    }

    // ---------- screen-space pieces over the world
    reasonList(ctx, t);
    edgeCard(ctx, t);
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
      [X(9), PY(101)],
      [X(13) - 60, PY(101)],
      [X(13.5), PY(101) + 40],
      [X(14), PY(103)],
      [X(12) + 20, PY(100.5)],
      [PX + 60, PY(98)],
      [X(16), PY(100)],
    ];
    EVIDENCE.forEach((e, i) => evidence(ctx, t, e, toScreen(mainCam(e.t0), ...fromWorld[i])));

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

    // ---------- opening title, then it flies through the camera
    const tz = lerp(0, -560, ease.inCubic(prog(t, T.open, T.open + 1.0)));
    const ts = depthScale(tz);
    const titleA = 1 - tw(t, T.open + 0.55, T.open + 1.0);
    if (titleA > 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2 + 20);
      ctx.scale(ts, ts);
      if (tz < -30) ctx.filter = `blur(${Math.min(14, -tz / 40)}px)`;
      text(ctx, "STRATEGY 02 · 策略實戰", 0, -110, { family: F.mono, size: 22, weight: 600, color: C.gold, ls: 6, align: "center", alpha: titleA * tw(t, 1.1, 1.5) });
      revealText(ctx, "同一道支撐，守住或翻轉", 0, 0, { family: F.tc, size: 100, weight: 900, color: C.text, align: "center", base: "middle", stagger: 0.05, dur: 0.55, rise: 50, blur: 12, alpha: titleA }, t - 1.35);
      text(ctx, "支撐壓力 · Hold or Flip", 0, 96, { family: F.tc, size: 30, weight: 500, color: C.muted, align: "center", alpha: tw(t, 2.1, 2.6) * titleA });
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
    if (bTag > 0) tag(ctx, "B · 從同一個到價前，換一種走法", 110, 214, { color: C.sell, alpha: bTag, size: 20 });

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
        { text: "線給地點，成交給答案。", size: 64 },
        { text: "地點 → 事件 → 確認 → 執行", size: 34, weight: 700 },
      ], { y: 210, gap: 84 });
    }
  },
};
