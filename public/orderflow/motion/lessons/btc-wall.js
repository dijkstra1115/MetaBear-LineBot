// S05 真實盤面上的訂單塊 — a real BTC case study (2026-07-02, Taipei time).
// Binance BTC perpetual: from 05:43 to 06:20 every 1-minute high is 60,800.00 while a resting
// sell wall absorbs ~4,500 BTC of taker buys. 06:21: ~2,100 BTC of market buys break the wall,
// stops trigger and price reaches 61,322 (+522) at 06:21:20. OI −821 BTC in the next 5 minutes.
// From 06:21:40 three 10-second buckets turn net sell (−396 / −484 / −569); Binance + OKX sell
// ~3,000 BTC net within 10 minutes; price is back under 60,800 within 15 minutes and at 60,216
// about an hour later. Labelled numbers come from the event record; the candle, flow and OI
// shapes around them are redrawn to match it (see BTC-WALL-LESSON-PLAN.md).
import {
  C,
  F,
  W,
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
  rrect,
  shake,
  fmt,
  rrange,
} from "../core.js";
import {
  titleCard,
  priceGrid,
  floatChip,
  panel,
  counter,
  camera,
  camPath,
  statement,
  tag,
  legend,
  arrow,
} from "../kit.js";

const WALL = 60800;
const TOP = 61322;

// ---------------- 1-minute candles, 05:30–07:25 (116 bars) ----------------
const N_OPEN = 71; // 05:30–06:40 shown in the opener
const N_ALL = 116;
const WALL_FROM = 13; // 05:43
const WALL_TO = 50; // 06:20
const BREAK = 51; // 06:21
const LOW_AT = 111; // 07:21
const PRE = [60590, 60600, 60640, 60660, 60700, 60695, 60720, 60718, 60735, 60760, 60790, 60760, 60785];
const POST = [
  60990, 60930, 60860, 60780, 60720, 60650, 60580, 60530, 60510, 60540, 60500, 60490, 60520, 60480, 60470, 60500, 60460,
  60480, 60440,
];
const BARS = (() => {
  const out = [];
  let o = 60528;
  for (let i = 0; i < N_ALL; i++) {
    let c, h, l;
    if (i < WALL_FROM) {
      c = PRE[i];
      h = Math.min(60796, Math.max(o, c) + rrange(11, i, 4, 22));
      l = Math.min(o, c) - rrange(12, i, 4, 26);
    } else if (i <= WALL_TO) {
      const flat = i >= 29 && i <= 34;
      c = flat ? 60799.9 : 60800 - rrange(13, i, 0.3, 9);
      h = WALL;
      l = flat ? 60799.9 : Math.min(o, c) - rrange(14, i, 1, i % 5 === 0 ? 34 : 14);
    } else if (i === BREAK) {
      c = 61040;
      h = TOP;
      l = 60796;
    } else if (i <= 70) {
      c = POST[i - 52];
      h = i === 52 ? 61130 : Math.max(o, c) + rrange(15, i, 6, 38);
      l = Math.min(o, c) - rrange(16, i, 6, 40);
    } else {
      const base = i <= LOW_AT ? lerp(60440, 60250, (i - 70) / (LOW_AT - 70)) : 60270 + (i - LOW_AT) * 6;
      c = base + rrange(17, i, -26, 26);
      h = Math.max(o, c) + rrange(18, i, 4, 22);
      l = i === LOW_AT ? 60216 : Math.max(60226, Math.min(o, c) - rrange(19, i, 4, 22));
    }
    out.push({ o, h, l, c });
    o = c;
  }
  return out;
})();
const MIN = (i) => {
  const m = 30 + i;
  return `${String(5 + Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
// The opener shows 60.4k–61.4k; the closing reveal widens the scale to 60.15k.
const PY = (p, s = 0) => 880 - (p - lerp(60400, 60150, s)) * lerp(0.68, 0.544, s);
const SPACING = (s) => lerp(20.5, 12.4, s);
const X = (i, s) => 190 + i * SPACING(s);

// ---------------- the wall, as a price ladder ----------------
const LY = (p) => 540 - (p - 60800.5) * 62;
const LX = 960;
const ASKS = { 60801: 3, 60802: 5, 60803: 2, 60804: 6 };
const BIDS = { 60799: 12, 60798: 20, 60797: 9 };
const ABS = [11.4, 18.6]; // 05:43:00 → 06:20:59
const HITS = Array.from({ length: 40 }, (_, k) => ABS[0] + k * 0.18);
const SWEEP = 19.0;
const CRACK = 19.45;

// ---------------- 10-second flow, 06:21:00–06:24:00 ----------------
const FLOW = [
  [180, 0],
  [1080, 180],
  [520, 620],
  [140, 160],
  [60, 456],
  [90, 574],
  [50, 619],
  [30, 90],
  [25, 70],
  [20, 40],
  [22, 38],
  [35, 30],
  [45, 60],
  [60, 70],
  [15, 25],
  [20, 45],
  [15, 20],
  [10, 50],
];
const PATH = [
  60800, 61180, 61322, 61210, 61060, 60990, 61040, 61080, 61110, 61120, 61090, 61060, 60990, 61010, 60980, 60960, 60940,
  60935, 60930,
];
const TX = (tau) => 260 + (tau / 180) * 1240;
const FY = (p) => 520 - (p - 60750) * 0.5833;
const ZERO = 700;
const VK = 0.16;
function tauAt(t) {
  if (t < 21.4) return 0;
  if (t < 24.0) return 20 * ease.outCubic(prog(t, 21.4, 24.0));
  if (t < 27.0) return lerp(20, 30, prog(t, 24.0, 27.0));
  return lerp(30, 180, ease.inOutQuad(prog(t, 27.0, 32.0)));
}
function priceAt(tau) {
  const k = clamp(tau / 10, 0, PATH.length - 1);
  const i = Math.min(PATH.length - 2, Math.floor(k));
  return lerp(PATH[i], PATH[i + 1], k - i);
}
const STOPS = [60850, 60950, 61050, 61150, 61250];
const tauOfPrice = (p) => (10 * (p - 60800)) / (61180 - 60800); // on the first leg only
const STOP_TAU = STOPS.map((p) => (p < 61180 ? tauOfPrice(p) : 10 + (10 * (p - 61180)) / (TOP - 61180)));
const tOfTau = (tau) => 21.4 + (1 - Math.cbrt(1 - clamp(tau / 20))) * 2.6;

// ---------------- open interest (Binance, 5-minute) ----------------
const OI = [105.02, 105.18, 105.33, 105.3, 105.445, 104.624, 104.3, 104.25, 104.21, 104.1];

// ---------------- taker volume by price band, 06:21–06:24 ----------------
const BANDS = [
  ["61.3k", 179, 82],
  ["61.2k", 1542, 1250],
  ["61.1k", 1360, 1326],
  ["61.0k", 943, 1041],
  ["60.9k", 534, 729],
  ["60.8k", 2146, 52],
  ["60.7k", 0, 2],
];
const BY = (i) => 250 + i * 86;

const T = {
  ladder: 9.6,
  ladderIn: [10.3, 11.1],
  ladderOut: [20.3, 21.0],
  flowIn: [20.6, 21.4],
  sells: 28.4,
  profile: 32.8,
  back: 41.0,
  reveal: [42.2, 44.2],
  shift: [45.2, 46.4],
  recap: 46.0,
  end: 49.0,
};

function clock(t) {
  if (t >= SWEEP) return "06:21:00";
  const s = Math.floor(prog(t, ABS[0], ABS[1]) * (38 * 60 - 1));
  const m = 43 + Math.floor(s / 60);
  return `${String(5 + Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function overview(ctx, t, a, s, n, hl) {
  if (a <= 0) return;
  for (let p = 60200; p <= 61400; p += 200) {
    if (PY(p, s) > 890) continue;
    line(ctx, 170, PY(p, s), 1660, PY(p, s), C.line, 1, a * 0.4);
    text(ctx, `${(p / 1000).toFixed(1)}k`, 1690, PY(p, s), {
      family: F.mono,
      size: 20,
      weight: 500,
      color: C.muted,
      base: "middle",
      alpha: a,
    });
  }
  // The 38-bar wall zone.
  const zx0 = X(WALL_FROM, s) - SPACING(s) / 2;
  const zx1 = X(WALL_TO, s) + SPACING(s) / 2;
  const za = a * hl.zone;
  if (za > 0) {
    ctx.save();
    ctx.globalAlpha = za;
    ctx.fillStyle = rgba(C.gold, 0.1);
    ctx.fillRect(zx0, 200, (zx1 - zx0) * tw(hl.zoneP, 0, 1, ease.outCubic), 680);
    ctx.restore();
    text(ctx, "05:43–06:20 · 38 根 1 分 K", (zx0 + zx1) / 2, 236, {
      family: F.tc,
      size: 24,
      weight: 800,
      color: C.gold,
      align: "center",
      alpha: za * hl.zoneP * hl.zoneLabel,
    });
    text(ctx, "最高價都是 60,800.00", (zx0 + zx1) / 2, 272, {
      family: F.tc,
      size: 22,
      weight: 600,
      color: C.gold,
      align: "center",
      alpha: za * hl.zoneP * hl.zoneLabel * 0.8,
    });
  }
  // Wall line.
  const wl = a * hl.wall;
  line(ctx, 170, PY(WALL, s), lerp(170, 1660, hl.wall), PY(WALL, s), C.sell, 2, wl * 0.9, [10, 8]);
  text(ctx, "賣牆 60,800", 176, PY(WALL, s) - 16, { family: F.tc, size: 22, weight: 800, color: C.sell, alpha: wl });
  // Candles.
  for (let i = 0; i < n; i++) {
    const b = BARS[i];
    const pop =
      i < N_OPEN
        ? tw(t, 2.4 + i * 0.028, 2.8 + i * 0.028)
        : tw(t, T.reveal[0] + (i - N_OPEN) * 0.04, T.reveal[0] + 0.4 + (i - N_OPEN) * 0.04);
    if (pop <= 0) continue;
    const inWall = i >= WALL_FROM && i <= WALL_TO;
    candle(ctx, X(i, s), Math.max(4, SPACING(s) * 0.62), PY(b.o, s), PY(b.h, s), PY(b.l, s), PY(b.c, s), {
      alpha: a * pop * (hl.dimWall && !inWall && i !== BREAK ? 0.55 : 1),
      wickWidth: 2,
      minBody: 2,
      glow: i === BREAK ? 12 : 0,
    });
  }
  for (const i of [0, 30, 60, 90]) {
    if (i >= n) continue;
    text(ctx, MIN(i), X(i, s), 930, {
      family: F.mono,
      size: 20,
      weight: 600,
      color: C.dim,
      align: "center",
      alpha: a * tw(t, 2.6, 3.2),
    });
  }
  // Spike label.
  const sp = a * hl.spike;
  if (sp > 0) {
    line(ctx, X(BREAK, s) + 8, PY(TOP, s), X(BREAK, s) + 40, PY(TOP, s), C.buy, 2, sp);
    text(ctx, "06:21 · 61,322（+522）", X(BREAK, s) + 48, PY(TOP, s), {
      family: F.tc,
      size: 24,
      weight: 800,
      color: C.buy,
      base: "middle",
      alpha: sp,
    });
  }
}

function ladder(ctx, t, a) {
  if (a <= 0) return;
  const absorbed = prog(t, ABS[0], ABS[1]);
  const cracked = prog(t, CRACK - 0.05, CRACK + 0.3);
  for (let p = 60804; p >= 60797; p--) {
    const y = LY(p);
    const isWall = p === WALL;
    line(ctx, 600, y + 31, 1600, y + 31, C.line, 1, a * 0.4);
    text(ctx, `${fmt(p)}.0`, LX, y, {
      family: F.mono,
      size: 24,
      weight: isWall ? 800 : 500,
      color: isWall ? C.sell : C.muted,
      align: "center",
      base: "middle",
      alpha: a,
    });
  }
  // Bids.
  for (const [p, q] of Object.entries(BIDS)) {
    const w = q * 10;
    ctx.save();
    ctx.globalAlpha = a * 0.8;
    rrect(ctx, LX - 80 - w, LY(Number(p)) - 20, w, 40, 5);
    ctx.fillStyle = rgba(C.buy, 0.45);
    ctx.fill();
    ctx.restore();
  }
  // Thin asks above the wall — eaten in the sweep.
  for (const [p, q] of Object.entries(ASKS)) {
    const gone = prog(t, CRACK + 0.1 + (p - 60801) * 0.08, CRACK + 0.25 + (p - 60801) * 0.08);
    const w = q * 14 * (1 - gone);
    if (w <= 0.5) continue;
    ctx.save();
    ctx.globalAlpha = a * 0.8;
    rrect(ctx, LX + 80, LY(Number(p)) - 20, w, 40, 5);
    ctx.fillStyle = rgba(C.sell, 0.5);
    ctx.fill();
    ctx.restore();
  }
  // The wall itself: shrinks as it absorbs, then breaks.
  const ww = lerp(560, 150, absorbed) * (1 - cracked);
  const y = LY(WALL);
  if (ww > 1) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = C.sell;
    ctx.shadowBlur = 18;
    rrect(ctx, LX + 80, y - 26, ww, 52, 6);
    ctx.fillStyle = rgba(C.sell, 0.85);
    ctx.fill();
    ctx.restore();
    text(ctx, "限價賣牆", LX + 100, y + 1, {
      family: F.tc,
      size: 24,
      weight: 900,
      color: C.ink,
      base: "middle",
      alpha: a * clamp((ww - 110) / 40),
    });
  }
  // Taker buys hitting the wall.
  for (const [k, t0] of HITS.entries()) {
    const p = prog(t, t0, t0 + 0.34);
    const jy = rrange(21, k, -14, 14);
    if (p > 0 && p < 1) glow(ctx, lerp(600, LX + 80, ease.inCubic(p)), y + jy, 12, C.buy, a);
    if (k % 2 === 0)
      burst(ctx, LX + 80, y + jy, t, t0 + 0.34, { n: 8, speed: 180, seed: 40 + k, color: C.buy, flare: 30 });
  }
  // Stops resting above: not in the book until triggered.
  const sa = a * tw(t, 15.6, 16.2);
  if (sa > 0) {
    text(ctx, "空單止損（觸發前不在簿上）", 1330, LY(60804) - 52, {
      family: F.tc,
      size: 22,
      weight: 700,
      color: C.gold,
      alpha: sa,
    });
    for (let p = 60801; p <= 60804; p++) {
      const pop = ease.outBack(prog(t, 15.7 + (p - 60801) * 0.2, 16.1 + (p - 60801) * 0.2));
      const fire = prog(t, CRACK + 0.15 + (p - 60801) * 0.12, CRACK + 0.3 + (p - 60801) * 0.12);
      if (pop <= 0) continue;
      ctx.save();
      ctx.globalAlpha = sa * clamp(pop);
      ctx.setLineDash(fire > 0 ? [] : [6, 5]);
      ctx.strokeStyle = fire > 0 ? C.buy : rgba(C.gold, 0.8);
      ctx.lineWidth = 2;
      rrect(ctx, 1330, LY(p) - 20, 190, 40, 8);
      if (fire > 0) {
        ctx.fillStyle = rgba(C.buy, 0.25 * fire);
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
      text(ctx, fire > 0 ? "觸發 → 市價買入" : "止損買單", 1425, LY(p) + 1, {
        family: F.tc,
        size: 20,
        weight: 700,
        color: fire > 0 ? C.buy : C.gold,
        align: "center",
        base: "middle",
        alpha: sa * clamp(pop),
      });
      ring(ctx, 1425, LY(p), t, CRACK + 0.15 + (p - 60801) * 0.12, { r1: 90, color: C.buy, w: 2 });
    }
  }
  // The sweep: ~2,100 BTC of market buys.
  const sw = prog(t, SWEEP, CRACK);
  if (sw > 0 && t < CRACK + 0.6) {
    const x = lerp(520, LX + 80, ease.inCubic(sw));
    ctx.save();
    ctx.globalAlpha = a * (1 - prog(t, CRACK + 0.2, CRACK + 0.6));
    const g = ctx.createLinearGradient(x - 420, 0, x, 0);
    g.addColorStop(0, rgba(C.buy, 0));
    g.addColorStop(1, rgba(C.buy, 0.9));
    ctx.fillStyle = g;
    ctx.fillRect(x - 420, y - 22, 420, 44);
    ctx.restore();
    glow(ctx, x, y, 60, C.buy, a);
  }
  burst(ctx, LX + 80, y, t, CRACK, { n: 60, speed: 900, seed: 9, color: C.sell, flare: 220 });
  ring(ctx, LX + 80, y, t, CRACK, { r1: 420, color: C.sell, w: 4 });
  const bt = a * tw(t, SWEEP - 0.1, SWEEP + 0.2) * (1 - tw(t, 20.0, 20.4));
  if (bt > 0) tag(ctx, "市價買入 約 2,100 BTC", 560, LY(60803), { color: C.buy, solid: true, alpha: bt, size: 26 });
}

function sidePanels(ctx, t, a) {
  if (a <= 0) return;
  const brk = t >= SWEEP;
  counter(ctx, 140, 190, brk ? "台北時間 · 擊穿" : "台北時間", clock(t), {
    alpha: a,
    color: brk ? C.buy : C.text,
    w: 380,
    size: 56,
  });
  const v = 4500 * prog(t, ABS[0], ABS[1]);
  counter(ctx, 140, 340, "牆吸收的主動買入", `約 ${fmt(Math.round(v / 10) * 10)}`, {
    alpha: a * tw(t, 11.2, 11.7),
    color: C.buy,
    w: 380,
    size: 56,
    unit: "BTC",
  });
  // The most extreme minute: range 0.1 U.
  const ma = a * tw(t, 13.4, 13.9);
  if (ma > 0) {
    panel(ctx, 140, 490, 380, 190, { alpha: ma, color: C.gold, borderAlpha: 0.5, accent: C.gold });
    text(ctx, "最極端的一分鐘", 166, 534, { family: F.tc, size: 22, weight: 700, color: C.muted, alpha: ma });
    text(ctx, "振幅 0.1 U", 166, 600, { family: F.display, size: 54, weight: 700, color: C.gold, alpha: ma, glow: 10 });
    text(ctx, "仍有數百筆成交", 166, 650, { family: F.tc, size: 20, weight: 500, color: C.muted, alpha: ma });
    line(ctx, 452, 540, 452, 650, C.gold, 2, ma * 0.6);
    ctx.save();
    ctx.globalAlpha = ma;
    rrect(ctx, 436, 590, 32, 4, 1);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.restore();
  }
}

function flowChart(ctx, t, a) {
  if (a <= 0) return;
  const tau = tauAt(t);
  legend(
    ctx,
    260,
    120,
    [
      { color: C.buy, label: "主動買入" },
      { color: C.sell, label: "主動賣出" },
      { color: C.text, label: "價格（每 10 秒）" },
    ],
    { alpha: a },
  );
  line(ctx, 250, ZERO, 1510, ZERO, C.line, 1.5, a);
  line(ctx, 250, FY(WALL), 1510, FY(WALL), C.gold, 1.5, a * 0.7, [8, 8]);
  text(ctx, "牆 60,800", 1510, FY(WALL) - 14, {
    family: F.tc,
    size: 20,
    weight: 700,
    color: C.gold,
    align: "right",
    alpha: a,
  });
  for (let s = 0; s <= 180; s += 30) {
    const lbl = `06:${String(21 + Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    text(ctx, lbl, TX(s), 890, { family: F.mono, size: 18, weight: 500, color: C.dim, align: "center", alpha: a });
  }
  // Bars.
  FLOW.forEach(([b, s], k) => {
    const x = TX(k * 10) + 4;
    const pop = ease.outCubic(clamp((tau - k * 10) / 6));
    if (pop <= 0) return;
    const net = b - s;
    const hot = k >= 4 && k <= 6;
    const hA = a * (hot ? 1 : 0.85);
    ctx.save();
    ctx.globalAlpha = hA;
    ctx.fillStyle = C.buy;
    if (b > 0) {
      rrect(ctx, x, ZERO - b * VK * pop, 52, b * VK * pop, 3);
      ctx.fill();
    }
    ctx.fillStyle = C.sell;
    if (s > 0) {
      rrect(ctx, x, ZERO, 52, s * VK * pop, 3);
      ctx.fill();
    }
    ctx.restore();
    if (hot) {
      const ta = a * tw(t, T.sells + (k - 4) * 0.35, T.sells + 0.3 + (k - 4) * 0.35);
      text(ctx, `${net < 0 ? "−" : "+"}${fmt(Math.abs(net))}`, x + 26, ZERO + s * VK + 34, {
        family: F.display,
        size: 30,
        weight: 700,
        color: C.sell,
        align: "center",
        alpha: ta,
        glow: 10,
      });
    }
  });
  // Price path.
  const pts = [];
  for (let s = 0; s <= tau + 1e-9; s += 2) pts.push([TX(s) + 30, FY(priceAt(s))]);
  pts.push([TX(tau) + 30, FY(priceAt(tau))]);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 3;
  ctx.shadowColor = C.text;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
  const [hx, hy] = pts[pts.length - 1];
  glow(ctx, hx, hy, 16, C.text, a);
  // Stops triggering along the first leg.
  STOPS.forEach((p, i) => {
    const t0 = tOfTau(STOP_TAU[i]);
    const x = TX(STOP_TAU[i]) + 30;
    ring(ctx, x, FY(p), t, t0, { r1: 70, color: C.buy, w: 2 });
    floatChip(ctx, "止損觸發", x - 90, FY(p), t, t0, { color: C.buy, size: 22, dur: 1.0, family: F.tc });
  });
  // The top.
  const tp = a * tw(t, 24.0, 24.4);
  if (tp > 0) {
    glow(ctx, TX(20) + 30, FY(TOP), 22, C.sell, tp);
    tag(ctx, "頂 61,322 · 06:21:20", TX(20) + 60, FY(TOP), { color: C.sell, alpha: tp, size: 24 });
  }
  const ns = a * tw(t, 29.3, 29.8);
  if (ns > 0)
    tag(ctx, "頂後 20 秒：轉為淨賣出", TX(60) + 90, ZERO + 70, { color: C.sell, solid: true, alpha: ns, size: 24 });
}

function oiPanel(ctx, t, a) {
  if (a <= 0) return;
  const x0 = 1540;
  const y0 = 170;
  panel(ctx, x0, y0, 330, 360, { alpha: a, color: C.gold, borderAlpha: 0.5, accent: C.gold });
  text(ctx, "未平倉量 OI", x0 + 24, y0 + 44, { family: F.tc, size: 24, weight: 800, color: C.text, alpha: a });
  text(ctx, "Binance · 06:00–06:45", x0 + 24, y0 + 74, {
    family: F.mono,
    size: 14,
    weight: 500,
    color: C.muted,
    alpha: a,
  });
  const gx = (i) => x0 + 30 + i * 30;
  const gy = (v) => y0 + 250 - (v - 104) * 90;
  const draw = tw(t, 24.4, 25.6, ease.outCubic);
  ctx.save();
  ctx.globalAlpha = a * 0.5;
  ctx.fillStyle = rgba(C.sell, 0.25);
  ctx.fillRect(gx(4), y0 + 96, 30, 170);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = "#b9a6f5";
  ctx.lineWidth = 3;
  ctx.beginPath();
  const n = 1 + draw * (OI.length - 1);
  for (let i = 0; i < OI.length && i <= n; i++) {
    const v = i + 1 > n ? lerp(OI[i - 1], OI[i], n - (i - 1)) : OI[i];
    const x = i + 1 > n ? lerp(gx(i - 1), gx(i), n - (i - 1)) : gx(i);
    i ? ctx.lineTo(x, gy(v)) : ctx.moveTo(x, gy(v));
  }
  ctx.stroke();
  ctx.restore();
  const la = a * tw(t, 25.4, 25.9);
  text(ctx, "−821", x0 + 190, y0 + 150, {
    family: F.display,
    size: 60,
    weight: 700,
    color: C.sell,
    alpha: la,
    glow: 12,
  });
  text(ctx, "BTC / 5 分鐘", x0 + 190, y0 + 182, { family: F.tc, size: 16, weight: 600, color: C.muted, alpha: la });
  const ex = a * tw(t, 26.0, 26.6);
  text(ctx, "價格漲、OI 降：", x0 + 24, y0 + 300, { family: F.tc, size: 22, weight: 800, color: C.gold, alpha: ex });
  text(ctx, "買的是平倉的空單", x0 + 24, y0 + 334, { family: F.tc, size: 22, weight: 700, color: C.text, alpha: ex });
}

function profile(ctx, t, a) {
  if (a <= 0) return;
  const grow = (i) => tw(t, 33.4 + i * 0.12, 34.4 + i * 0.12, ease.outCubic);
  text(ctx, "← 主動買入（BTC）", LX - 16, 170, {
    family: F.tc,
    size: 24,
    weight: 700,
    color: C.buy,
    align: "right",
    alpha: a,
  });
  text(ctx, "主動賣出（BTC）→", LX + 16, 170, { family: F.tc, size: 24, weight: 700, color: C.sell, alpha: a });
  tag(ctx, "Binance 永續 · 06:21–06:24 · 按價位帶", 140, 170, { color: C.muted, alpha: a, size: 20 });
  line(ctx, LX, 200, LX, BY(6) + 40, C.line, 2, a);
  const hw = a * tw(t, 35.4, 35.9);
  const hs = a * tw(t, 37.2, 37.7);
  BANDS.forEach(([lbl, b, s], i) => {
    const g = grow(i);
    const y = BY(i);
    const wallRow = i === 5;
    const dim = (hw > 0 && !wallRow ? 0.35 * (1 - hs) : 0) + (hs > 0 && wallRow ? 0.4 : 0);
    const al = a * (1 - dim);
    text(ctx, lbl, 400, y, {
      family: F.mono,
      size: 22,
      weight: 600,
      color: wallRow ? C.gold : C.muted,
      base: "middle",
      alpha: a,
    });
    const bw = b * 0.17 * g;
    const sw = s * 0.17 * g;
    ctx.save();
    ctx.globalAlpha = al;
    ctx.fillStyle = C.buy;
    if (bw > 0.5) {
      rrect(ctx, LX - 6 - bw, y - 26, bw, 52, 5);
      ctx.fill();
    }
    ctx.fillStyle = C.sell;
    if (sw > 0.5) {
      rrect(ctx, LX + 6, y - 26, sw, 52, 5);
      ctx.fill();
    }
    ctx.restore();
    text(ctx, fmt(b * g), LX - 18 - bw, y + 1, {
      family: F.display,
      size: 28,
      weight: 700,
      color: C.buy,
      align: "right",
      base: "middle",
      alpha: al,
    });
    text(ctx, fmt(s * g), LX + 18 + sw, y + 1, {
      family: F.display,
      size: 28,
      weight: 700,
      color: C.sell,
      base: "middle",
      alpha: al,
    });
  });
  if (hw > 0) {
    const y = BY(5);
    ctx.save();
    ctx.globalAlpha = hw * (1 - hs * 0.6);
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 2;
    rrect(ctx, 360, y - 36, 1100, 72, 10);
    ctx.stroke();
    ctx.restore();
    tag(ctx, "吃牆的瞬間 · 2,146 : 52", 1180, y, { color: C.gold, solid: true, alpha: hw * (1 - hs), size: 24 });
  }
  if (hs > 0) {
    const x = 1310;
    const y0 = BY(0) - 26;
    const y1 = BY(4) + 26;
    const p = tw(t, 37.2, 37.8, ease.outCubic);
    line(ctx, x, y0, x, lerp(y0, y1, p), C.sell, 3, hs);
    line(ctx, x - 16, y0, x, y0, C.sell, 3, hs);
    line(ctx, x - 16, y1, x, y1, C.sell, 3, hs * p);
    text(ctx, "牆上方 60.9k–61.3k", x + 26, (y0 + y1) / 2 - 24, {
      family: F.tc,
      size: 24,
      weight: 700,
      color: C.muted,
      alpha: hs,
    });
    text(ctx, "主動賣出 約 4,400", x + 26, (y0 + y1) / 2 + 26, {
      family: F.tc,
      size: 34,
      weight: 900,
      color: C.sell,
      alpha: hs,
      glow: 10,
    });
  }
  const tw3 = a * tw(t, 38.8, 39.3);
  if (tw3 > 0) {
    panel(ctx, 1320, 770, 500, 130, { alpha: tw3, color: C.sell, borderAlpha: 0.6, accent: C.sell });
    text(ctx, "Binance＋OKX · 突破後 10 分鐘", 1346, 814, {
      family: F.tc,
      size: 20,
      weight: 600,
      color: C.muted,
      alpha: tw3,
    });
    text(ctx, "淨賣出 約 3,000 BTC", 1346, 870, {
      family: F.tc,
      size: 40,
      weight: 900,
      color: C.sell,
      alpha: tw3,
      glow: 10,
    });
  }
}

const RECAP = [
  ["①", "牆：吸收買盤 38 分鐘", C.gold],
  ["②", "擊穿：約 2,100 BTC 市價買入", C.buy],
  ["③", "止損推升：OI −821 BTC", C.buy],
  ["④", "倒貨：頂後 20 秒轉淨賣", C.sell],
];

export const lesson = {
  id: "btc-wall",
  title: "真實盤面上的訂單塊",
  duration: 54,
  dataLabel: "REAL MARKET · BINANCE／OKX 公開數據重繪",
  description:
    "2026 年 7 月 2 日清晨（台北時間），Binance BTC 永續 05:43 起出現 60,800 的限價賣牆：38 根 1 分 K 最高價都是 60,800.00，牆吸收約 4,500 BTC 主動買入。06:21 約 2,100 BTC 市價買入擊穿，止損連鎖讓價格 30 秒內衝上 61,322，5 分鐘內 OI 減少 821 BTC；觸頂 20 秒後轉為淨賣出，兩所 10 分鐘淨賣約 3,000 BTC，15 分鐘內跌回牆下，約 1 小時後到 60,216。",
  note: "這一次，訂單塊不用事後畫：\n它就掛在委託簿上。",
  footer:
    "真實事件復盤：2026-07-02 台北時間清晨，Binance BTC 永續（賣出合計含 OKX）。K 線、每 10 秒成交與 OI 曲線依公開 API 紀錄重繪，標示數字取自紀錄。掛牆者的身分與意圖無法由公開資料證實；「先製造被迫的買盤、再賣給他們」是對這段路徑的解讀，不是對後市的預測。",
  audio: "./motion/audio/btc-wall.m4a",
  music: {
    palette: "tense",
    key: -3,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 9.6, level: 2 },
      { t: 18.6, level: 1 },
      { t: 19.45, level: 3 },
      { t: 28.4, level: 2 },
      { t: 32.8, level: 1 },
      { t: 41.0, level: 2 },
      { t: 49.0, level: 1 },
      { t: 52.4, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "38 根同一個最高價" },
    { t: 9.6, label: "牆在吸收買盤" },
    { t: 19.0, label: "擊穿，止損連鎖" },
    { t: 28.4, label: "頂後 20 秒轉淨賣" },
    { t: 32.8, label: "賣在牆上方" },
    { t: 41.0, label: "回到牆下" },
  ],
  captions: [
    { a: 2.4, b: 5.3, text: "2026.07.02 清晨，Binance BTC 永續的 1 分 K。" },
    { a: 5.4, b: 9.5, text: "05:43 到 06:20，38 根 K 的最高價都是 60,800.00。" },
    { a: 9.6, b: 13.3, text: "放大這個價位：一道限價賣牆，把主動買入原地吸收。" },
    { a: 13.4, b: 15.5, text: "振幅只有 0.1 U，每分鐘仍有數百筆成交。" },
    { a: 15.6, b: 18.9, text: "明顯的阻力，讓空單把止損放在牆的上方。" },
    { a: 19.0, b: 21.3, text: "06:21，約 2,100 BTC 市價買入，擊穿賣牆。" },
    { a: 21.4, b: 24.1, text: "止損連鎖觸發，30 秒內衝上 61,322。" },
    { a: 24.2, b: 28.3, text: "5 分鐘內 OI 減少 821 BTC：推價的是空單回補，不是新多單。" },
    { a: 28.4, b: 32.7, text: "觸頂 20 秒後，主動賣出接手：−396、−484、−569。" },
    { a: 32.8, b: 37.1, text: "按價位看：60.8k 買 2,146、賣 52，是吃牆的瞬間。" },
    { a: 37.2, b: 40.9, text: "賣出集中在牆上方；兩所 10 分鐘淨賣約 3,000 BTC。" },
    { a: 41.0, b: 45.1, text: "15 分鐘內跌回牆下，約 1 小時後來到 60,216。" },
    { a: 45.2, b: 48.9, text: "追突破的多單被套；回補的空單，買在高點。" },
    { a: 49.0, b: 54, text: "先製造被迫的買盤，再把部位賣給他們。" },
  ],
  flashes: [
    { t: CRACK, amt: 0.45, decay: 6 },
    { t: 24.0, amt: 0.2, decay: 8 },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    ...Array.from({ length: 12 }, (_, i) => ({ t: 2.4 + i * 0.17, kind: "blip", vel: 0.18 })),
    { t: 4.6, kind: "stamp" },
    { t: 5.4, kind: "swell", dur: 1.4 },
    { t: 7.4, kind: "blip", vel: 0.3 },
    { t: T.ladder, kind: "whoosh", dur: 1.2 },
    ...HITS.filter((_, k) => k % 2 === 0).map((t0) => ({
      t: t0 + 0.34,
      kind: "fill",
      price: 100,
      side: "buy",
      soft: true,
    })),
    { t: 13.4, kind: "blip", vel: 0.3 },
    ...[15.7, 15.9, 16.1, 16.3].map((t) => ({ t, kind: "tick", vel: 0.3 })),
    { t: 18.2, kind: "riser", dur: 1.2 },
    { t: CRACK, kind: "impact", big: true },
    ...[0, 1, 2, 3].map((i) => ({ t: CRACK + 0.15 + i * 0.12, kind: "fill", price: 101 + i, side: "buy" })),
    { t: T.ladderOut[0], kind: "whoosh", dur: 0.8 },
    ...STOPS.map((_, i) => ({ t: tOfTau(STOP_TAU[i]), kind: "fill", price: 104 + i * 2, side: "buy" })),
    { t: 24.0, kind: "fill", price: 116, side: "buy", big: true },
    { t: 24.6, kind: "drain", dur: 1.0 },
    { t: T.sells, kind: "thud" },
    ...[0, 1, 2].map((k) => ({ t: T.sells + k * 0.35, kind: "fill", price: 104 - k * 2, side: "sell" })),
    { t: 29.3, kind: "stamp" },
    { t: T.profile, kind: "whoosh", dur: 1.0 },
    { t: 33.6, kind: "rise", dur: 0.6 },
    { t: 35.4, kind: "stamp" },
    { t: 37.2, kind: "crack", price: 100, loud: true },
    { t: 38.8, kind: "thud" },
    { t: T.back, kind: "whoosh", dur: 1.4 },
    { t: T.reveal[0], kind: "rumble", dur: 2.0 },
    { t: 44.6, kind: "thud" },
    ...RECAP.map((_, i) => ({ t: T.recap + i * 0.45, kind: "blip", vel: 0.35 })),
    { t: T.end, kind: "swell", dur: 2.0 },
    { t: 52.4, kind: "stamp" },
  ],
  draw(ctx, t) {
    const [sx, sy] = shake(t, CRACK, 16, 0.6, 5);
    // ---- overview (opening and closing) ----
    const ovA = tw(t, 2.0, 2.6) * (1 - tw(t, T.ladder + 0.6, T.ladder + 1.2)) + tw(t, T.back, T.back + 0.8);
    if (ovA > 0) {
      const closing = t >= T.back;
      const s = closing ? tw(t, T.reveal[0] - 0.2, T.reveal[1]) : 0;
      const n = closing ? N_ALL : N_OPEN;
      const cam = closing
        ? camPath(t, [
            { t: T.shift[0], x: 955, y: 540, z: 1 },
            { t: T.shift[1], x: 955, y: 370, z: 0.8 },
          ])
        : camPath(t, [
            { t: T.ladder, x: 955, y: 540, z: 1 },
            { t: T.ladder + 1.2, x: X(32, 0), y: PY(WALL), z: 3.2 },
          ]);
      camera(ctx, cam, () => {
        priceGrid(ctx, t, { alpha: 0.25 * ovA, step: 68, oy: PY(60800) });
        overview(ctx, t, clamp(ovA), s, n, {
          wall: tw(t, 4.4, 5.0),
          zone: tw(t, 5.2, 5.6) * (closing ? 0.6 : 1),
          zoneP: tw(t, 5.2, 6.0),
          spike: closing ? 1 - tw(t, T.shift[0], T.shift[1]) : tw(t, 7.2, 7.7),
          dimWall: !closing && t > 5.4,
          zoneLabel: closing ? 1 - tw(t, T.shift[0], T.shift[1]) : 1,
        });
        if (closing) {
          const s1 = tw(t, 43.6, 44.1) * (1 - tw(t, T.shift[0], T.shift[1]));
          if (s1 > 0) {
            tag(ctx, "15 分鐘內跌回牆下", X(56, s) + 40, PY(61000, s), { color: C.sell, alpha: s1, size: 22 });
            arrow(ctx, X(56, s) + 60, PY(61000, s) + 22, X(55, s) + 4, PY(WALL, s) - 8, C.sell, tw(t, 43.8, 44.3), {
              width: 2,
              head: 10,
              alpha: s1,
            });
          }
          const lo = tw(t, 44.6, 45.1);
          if (lo > 0) {
            const x = X(LOW_AT, s);
            ring(ctx, x, PY(60216, s), t, 44.6, { r1: 80, color: C.sell, w: 2 });
            line(ctx, x, PY(60216, s) + 10, x, PY(60216, s) + 34, C.sell, 2, lo);
            text(ctx, "約 1 小時後 · 60,216", x - 24, PY(60216, s) + 44, {
              family: F.tc,
              size: 24,
              weight: 800,
              color: C.sell,
              align: "right",
              alpha: lo,
            });
          }
        }
      });
      const hist = tw(t, 2.8, 3.3) * (1 - tw(t, T.ladder - 0.4, T.ladder));
      if (hist > 0) tag(ctx, "已完成行情 · 台北時間 05:30–06:40", 190, 150, { color: C.muted, alpha: hist, size: 22 });
    }
    // ---- the wall, up close ----
    const la = tw(t, T.ladderIn[0], T.ladderIn[1]) * (1 - tw(t, T.ladderOut[0], T.ladderOut[1]));
    if (la > 0) {
      ctx.save();
      ctx.translate(sx, sy);
      ladder(ctx, t, la);
      ctx.restore();
      sidePanels(ctx, t, la);
      const lq = la * tw(t, 11.6, 12.1) * (1 - tw(t, 15.2, 15.6));
      if (lq > 0)
        tag(ctx, "05:30 前後：一天中流動性最薄的時段", 1060, 150, {
          align: "center",
          color: C.gold,
          alpha: lq,
          size: 24,
        });
    }
    // ---- 10-second flow + OI ----
    const fa = tw(t, T.flowIn[0], T.flowIn[1]) * (1 - tw(t, T.profile, T.profile + 0.6));
    if (fa > 0) {
      flowChart(ctx, t, fa);
      oiPanel(ctx, t, fa * tw(t, 24.2, 24.7));
    }
    // ---- taker volume by price band ----
    const pa = tw(t, T.profile + 0.4, T.profile + 1.0) * (1 - tw(t, T.back, T.back + 0.6));
    profile(ctx, t, pa);
    // ---- recap ----
    RECAP.forEach(([n, str, col], i) => {
      const p = ease.outBack(prog(t, T.recap + i * 0.45, T.recap + 0.45 + i * 0.45));
      if (p <= 0) return;
      const x = 150 + i * 410;
      const al = clamp(p) * (1 - tw(t, 53.2, 54));
      panel(ctx, x, 244 + (1 - p) * 20, 390, 64, { alpha: al, color: col, borderAlpha: 0.6, accent: col });
      text(ctx, n, x + 24, 285 + (1 - p) * 20, { family: F.tc, size: 26, weight: 900, color: col, alpha: al });
      text(ctx, str, x + 64, 285 + (1 - p) * 20, { family: F.tc, size: 20, weight: 700, color: C.text, alpha: al });
    });
    const it = tw(t, 50.2, 50.8);
    if (it > 0)
      tag(ctx, "一種解讀：流動性獵取（buy to sell）", W / 2, 352, {
        align: "center",
        color: C.gold,
        alpha: it,
        size: 22,
      });
    statement(
      ctx,
      t,
      T.end,
      [
        { text: "先製造被迫的買盤，", size: 50 },
        { text: "再把部位賣給他們。", size: 50 },
      ],
      { y: 130, gap: 70 },
    );
    titleCard(ctx, t, {
      num: "S5",
      kicker: "STORY 05 · BTC CASE STUDY",
      title: "真實盤面上的訂單塊",
      sub: "2026.07.02 清晨 · Binance BTC 永續",
      titleSize: 72,
      outA: 1.9,
      outB: 2.5,
    });
  },
};
