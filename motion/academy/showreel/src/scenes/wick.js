// Chapter 02 — 衝上去的價格，怎麼又回來了？
// Same numbers as the wick story in bear units: 1,106 隻 bought for +2 元,
// then 119 隻 through thin asks for +34 元, then 4,980 隻 sold into thick bids.
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
  shake,
  rrect,
  fmt,
  rnd,
  rrange,
  noise1,
  measure,
  revealText,
} from "../core.js";
import { chapterCard, captions, priceGrid, counter } from "../common.js";

const DT = 0.01;
const LEN = 18;
const COL = 820;
const ASKX = 862;
const BIDX = 778;
const CX = 1290;
const PXQ = 0.85; // px per 隻

// ---- price path (stepped, as trades print) ----
function rawPrice(t) {
  if (t < 2.5) return 100;
  if (t < 2.8) return 101;
  if (t < 6.85) return noise1(t * 7, 21) > -0.25 ? 102 : 101;
  if (t < 9.3)
    return Math.floor(102 + 34 * ease.inOutQuad(prog(t, 6.85, 9.25)) + 1e-9);
  if (t < 11.2) return noise1(t * 6, 5) > 0.2 ? 135 : 136;
  if (t < 14.0) {
    const p = 136 - 35 * ease.inOutQuad(prog(t, 11.2, 13.9));
    const bounce = 3.4 * Math.exp(-(((t - 12.55) / 0.18) ** 2));
    return Math.round(p + bounce);
  }
  if (t < 15.0)
    return 101 + Math.round(2 * ease.inOutQuad(prog(t, 14.1, 14.9)));
  return 103;
}
const N = Math.ceil(LEN / DT) + 1;
const PR = new Float32Array(N);
const HI = new Float32Array(N);
const LO = new Float32Array(N);
for (let i = 0; i < N; i++) {
  PR[i] = rawPrice(i * DT);
  HI[i] = Math.max(i ? HI[i - 1] : 100, PR[i]);
  LO[i] = Math.min(i ? LO[i - 1] : 100, PR[i]);
}
const at = (arr, t) => arr[clamp(Math.floor(t / DT), 0, N - 1)];
const price = (t) => at(PR, t);

/** First time the price reaches ≥ level (asks) or ≤ level (bids) inside a window. */
function crossTime(level, from, to, dir) {
  for (let i = Math.floor(from / DT); i < Math.floor(to / DT); i++)
    if (dir > 0 ? PR[i] >= level : PR[i] < level) return i * DT;
  return Infinity;
}
const askEaten = {};
for (let p = 103; p <= 136; p++)
  askEaten[p] = crossTime(p + (p === 136 ? 0 : 1), 6.8, 9.4, 1);
askEaten[136] = Infinity;
const bidEaten = {};
for (let p = 101; p <= 135; p++) bidEaten[p] = crossTime(p, 11.2, 14.0, -1);

const bidQty = (p) =>
  p === 135
    ? 314
    : p === 134
      ? 324
      : p === 133
        ? 250
        : Math.round(rrange(9, p, 130, 210));

// Phase A buy pulses on the 102 wall (refilled until 6.0).
const PULSES = Array.from({ length: 12 }, (_, i) => 2.85 + i * 0.27);
const LAST = [6.05, 6.3, 6.55, 6.8];
function wallQty(t) {
  let q = 320;
  for (const tp of PULSES) {
    q -= 55 * ease.outCubic(prog(t, tp, tp + 0.08));
    q += 55 * ease.outCubic(prog(t, tp + 0.12, tp + 0.24));
  }
  LAST.forEach(
    (tp, i) =>
      (q -= (i < 3 ? 105 : 5 + 10) * ease.outCubic(prog(t, tp, tp + 0.08))),
  );
  return Math.max(0, q);
}

// ---- camera: pixels per 元 and centre price ----
function cam(t) {
  const z = tw(t, 6.8, 8.9, ease.inOutQuad);
  const z2 = tw(t, 14.4, 15.3, ease.inOutCubic);
  const k = lerp(lerp(66, 19, z), 12, z2);
  const pc = lerp(lerp(101.6, 118, z), 110, z2);
  return { k, pc };
}

export const cues = [
  { t: 0, kind: "impact" },
  ...PULSES.map((t) => ({
    t,
    kind: "fill",
    price: 102,
    qty: 1,
    side: "buy",
    soft: true,
  })),
  ...LAST.map((t) => ({
    t,
    kind: "fill",
    price: 102,
    qty: 1,
    side: "buy",
    soft: true,
  })),
  ...Object.entries(askEaten)
    .filter(([, t]) => isFinite(t))
    .map(([p, t]) => ({
      t,
      kind: "fill",
      price: Number(p),
      qty: 1,
      side: "buy",
      soft: true,
      arp: true,
    })),
  { t: 9.3, kind: "impact" },
  { t: 9.6, kind: "swell", dur: 1.6 },
  { t: 11.2, kind: "impact", big: true },
  { t: 11.2, kind: "rumble", dur: 2.9 },
  ...Object.entries(bidEaten)
    .filter(([, t]) => isFinite(t))
    .map(([p, t]) => ({ t, kind: "crack", price: Number(p) })),
  { t: 14.6, kind: "stamp" },
  { t: 16.2, kind: "riser", dur: 1.8 },
];

function drawLadder(ctx, t, a, K) {
  const { k, pc } = K;
  const PY = (p) => 540 - (p - pc) * k;
  const bh = clamp(k * 0.7, 5, 38);
  const step = k < 30 ? 2 : 1;
  const last = price(t);
  for (let p = 96; p <= 140; p++) {
    const y = PY(p);
    if (y < 150 || y > 900) continue;
    if (p % step === 0 || p === last)
      text(ctx, String(p), COL, y, {
        family: F.mono,
        size: k < 30 ? 15 : 22,
        weight: p === last ? 700 : 500,
        align: "center",
        base: "middle",
        color: p === last ? C.gold : C.dim,
        alpha: a,
      });
    // asks
    let aq = 0;
    if (p === 102) aq = t < 6.8 ? wallQty(t) : 0;
    else if (p >= 103 && p <= 136) {
      aq = t < askEaten[p] ? 3 : 0;
      if (p === 136 && t > 9.3)
        aq = 3 + 70 * (0.5 + 0.5 * Math.sin(t * 9)) * (1 - tw(t, 10.8, 11.2));
    }
    if (aq > 0) {
      const w = Math.max(6, aq * PXQ);
      ctx.save();
      ctx.globalAlpha = a;
      rrect(ctx, ASKX, y - bh / 2, w, bh, 3);
      ctx.fillStyle = rgba(C.sell, p === 102 ? 0.85 : 0.6);
      ctx.fill();
      ctx.restore();
      if (p === 102 && t < 6.9)
        text(ctx, `${fmt(aq)} 隻`, ASKX + w + 14, y, {
          family: F.mono,
          size: 22,
          weight: 700,
          color: C.sell,
          base: "middle",
          alpha: a,
        });
    }
    // bids
    let bq = 0;
    const early = { 101: 60, 100: 95, 99: 70, 98: 120, 97: 85, 96: 60 };
    if (early[p] && t < 9.5)
      bq =
        early[p] *
        ease.outCubic(prog(t, 2.2 + (101 - p) * 0.05, 2.7 + (101 - p) * 0.05));
    if (p >= 100 && p <= 135 && t > 9.55) {
      const appear = 9.55 + (135 - p) * 0.035;
      const grow = ease.outCubic(prog(t, appear, appear + 0.4));
      const eat = bidEaten[p] ?? Infinity;
      const shrink = 1 - ease.inCubic(prog(t, eat - 0.08, eat));
      bq = bidQty(p) * grow * shrink;
    }
    if (bq > 0.5) {
      const w = bq * PXQ;
      ctx.save();
      ctx.globalAlpha = a;
      rrect(ctx, BIDX - w, y - bh / 2, w, bh, 3);
      ctx.fillStyle = rgba(C.buy, 0.62);
      ctx.fill();
      ctx.restore();
    }
    const eat = bidEaten[p];
    if (eat && isFinite(eat) && t >= eat && t < eat + 0.9) {
      burst(ctx, BIDX - bidQty(p) * PXQ * 0.5, y, t, eat, {
        n: 16,
        speed: 520,
        seed: p,
        color: C.sell,
        life: 0.6,
        flare: 70,
        gravity: 500,
      });
    }
    const ae = askEaten[p];
    if (ae && isFinite(ae) && t >= ae && t < ae + 0.5) {
      burst(ctx, ASKX + 4, y, t, ae, {
        n: 8,
        speed: 260,
        seed: p + 70,
        color: C.buy,
        life: 0.4,
        flare: 40,
      });
    }
  }
  // Headers.
  text(ctx, "被動買單 BID", BIDX, 136, {
    family: F.mono,
    size: 16,
    weight: 600,
    color: C.buy,
    align: "right",
    ls: 3,
    alpha: a,
  });
  text(ctx, "ASK 被動賣單", ASKX, 136, {
    family: F.mono,
    size: 16,
    weight: 600,
    color: C.sell,
    ls: 3,
    alpha: a,
  });

  // "thin" annotation during the climb.
  const thin = tw(t, 6.9, 7.3) * (1 - tw(t, 9.6, 10.0));
  if (thin > 0)
    text(ctx, "每一檔只有 3 隻", ASKX + 26, PY(112), {
      family: F.tc,
      size: 24,
      weight: 700,
      color: C.sell,
      base: "middle",
      alpha: thin * a,
    });
  const thick = tw(t, 10.0, 10.4) * (1 - tw(t, 11.4, 11.8));
  if (thick > 0)
    text(ctx, "每一檔 130–324 隻", BIDX - 330, PY(120), {
      family: F.tc,
      size: 24,
      weight: 700,
      color: C.buy,
      align: "right",
      base: "middle",
      alpha: thick * a,
    });
}

function drawFlows(ctx, t, K) {
  const PY = (p) => 540 - (p - K.pc) * K.k;
  // Buy comets into the 102 wall.
  for (const tp of [...PULSES, ...LAST]) {
    const p = prog(t, tp - 0.28, tp);
    if (p > 0 && p < 1) {
      const x = lerp(430, ASKX - 6, ease.inCubic(p));
      const y = lerp(PY(98.5), PY(102), ease.outCubic(p));
      glow(ctx, x, y, 26, C.buy, 0.9);
      line(ctx, x - 50 * p, y + 14 * p, x, y, C.buy, 2, 0.6);
    }
  }
  // Rising flow during the spike.
  if (t > 6.8 && t < 9.4) {
    for (let i = 0; i < 26; i++) {
      const t0 = 6.8 + i * 0.09;
      const p = prog(t, t0, t0 + 0.3);
      if (p <= 0 || p >= 1) continue;
      const target = PY(price(t0 + 0.3));
      const x = lerp(520, ASKX - 4, ease.inCubic(p));
      const y = lerp(target + 120, target, ease.outCubic(p));
      glow(ctx, x, y, 18, C.buy, 0.8);
    }
  }
  // Sell avalanche: streaks raining into the bid front.
  if (t > 11.1 && t < 14.4) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (let i = 0; i < 280; i++) {
      const t0 = 11.1 + i * 0.0105;
      const life = 0.32;
      const p = prog(t, t0, t0 + life);
      if (p <= 0 || p >= 1) continue;
      const target = PY(price(t0 + life)) + rrange(3, i, -10, 10);
      const sx = 1060 + rnd(4, i) * 260;
      const sy = -40 - rnd(5, i) * 120;
      const x = lerp(sx, BIDX - 4, ease.inQuad(p));
      const y = lerp(sy, target, ease.inQuad(p));
      const dx = BIDX - 4 - sx;
      const dy = target - sy;
      const len = 40 + 60 * p;
      const m = Math.hypot(dx, dy);
      ctx.strokeStyle = rgba(C.sell, 0.55 * (1 - p * 0.3));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (dx / m) * len, y - (dy / m) * len);
      ctx.stroke();
    }
    ctx.restore();
    glow(ctx, BIDX, PY(price(t)), 120, C.sell, 0.7);
  }
}

function drawCandle(ctx, t, a, K) {
  const PY = (p) => 540 - (p - K.pc) * K.k;
  const hi = at(HI, t);
  const lo = at(LO, t);
  const c = price(t);
  const wickGlow = tw(t, 13.6, 14.4) * (1 - tw(t, 17.0, 17.6));
  candle(ctx, CX, 72, PY(100), PY(hi), PY(lo), PY(c), {
    alpha: a,
    glow: 20,
    wickWidth: 4,
    wickGlow: wickGlow * (0.8 + 0.4 * Math.sin(t * 5)),
    wickGlowColor: C.gold,
  });
  // last price hairline + tag
  const y = PY(c);
  line(ctx, ASKX + 300, y, CX - 110, y, C.gold, 1.5, 0.45 * a, [4, 6]);
  text(ctx, String(c), CX - 52, y, {
    family: F.display,
    size: 34,
    weight: 700,
    color: C.gold,
    align: "right",
    base: "middle",
    alpha: a,
    glow: 12,
  });
  if (hi > 110) {
    line(ctx, CX + 20, PY(hi), CX + 50, PY(hi), C.muted, 1, a * 0.6);
    text(ctx, `高 ${hi}`, CX + 56, PY(hi), {
      family: F.display,
      size: 28,
      weight: 700,
      color: C.text,
      base: "middle",
      alpha: a * tw(t, 9.2, 9.5),
    });
  }
  text(ctx, "14:32 · 一分鐘 K 線", CX, 136, {
    family: F.mono,
    size: 16,
    weight: 600,
    color: C.muted,
    align: "center",
    ls: 2,
    alpha: a,
  });
}

function drawCounters(ctx, t, a) {
  const x = 1500;
  const w = 330;
  const aA = a * tw(t, 2.7, 3.1);
  const vA = Math.round(1106 * ease.inOutQuad(prog(t, 2.85, 6.8)));
  counter(ctx, x, 190, "前段主動買入", fmt(vA), {
    color: C.buy,
    alpha: aA,
    unit: "隻",
    w,
    flash: pulses(t, PULSES),
  });
  text(ctx, "價格 100 → 102", x + w - 20, 190 + 106, {
    family: F.tc,
    size: 20,
    weight: 600,
    color: C.text,
    align: "right",
    alpha: aA,
  });
  const aB = a * tw(t, 6.9, 7.3);
  const vB = Math.round(119 * ease.inOutQuad(prog(t, 6.85, 9.25)));
  counter(ctx, x, 340, "上衝主動買入", fmt(vB), {
    color: C.gold,
    alpha: aB,
    unit: "隻",
    w,
    flash: pulse(t, 9.3, 4),
  });
  text(
    ctx,
    `價格 102 → ${Math.max(102, Math.min(136, price(t)))}`,
    x + w - 20,
    340 + 106,
    {
      family: F.tc,
      size: 20,
      weight: 600,
      color: C.text,
      align: "right",
      alpha: aB,
    },
  );
  const aC = a * tw(t, 11.2, 11.5);
  const vC = Math.round(4980 * ease.inOutQuad(prog(t, 11.2, 13.9)));
  counter(ctx, x, 490, "回落主動賣出", fmt(vC), {
    color: C.sell,
    alpha: aC,
    unit: "隻",
    w,
    flash: pulse(t, 11.2, 3),
  });
}
const pulses = (t, list) =>
  list.reduce((s, tp) => s + pulse(t, tp, 10), 0) * 0.5;

const CAPS = [
  {
    a: 2.5,
    b: 6.5,
    text: "買了 1,106 隻，價格只多 2 元",
    sub: "102 的賣單，被吃掉又補回來",
  },
  {
    a: 6.6,
    b: 9.35,
    text: "只買 119 隻，價格衝上 136",
    sub: "上方的被動賣單很薄，一路被吃穿",
    color: C.buy,
  },
  {
    a: 9.45,
    b: 11.1,
    text: "衝到高處停住了",
    sub: "下方的被動買單，比上方的賣單厚得多",
  },
  {
    a: 11.2,
    b: 14.3,
    text: "4,980 隻主動賣出，逐檔吃掉買單",
    sub: "價格回到起點附近；最高成交 136 留成上影線",
    color: C.sell,
  },
];

function statement(ctx, t) {
  const a = tw(t, 14.5, 15.0);
  if (a <= 0) return;
  const out = tw(t, 17.0, 17.5);
  ctx.save();
  ctx.globalAlpha = 1;
  // Compare cards
  const cards = [
    {
      x: 140,
      col: C.buy,
      head: "上衝",
      l1: "被動賣單很薄",
      l2: "119 隻 → +34 元",
    },
    {
      x: 140,
      col: C.sell,
      head: "回落",
      l1: "大量主動賣出",
      l2: "4,980 隻 → −33 元",
    },
  ];
  cards.forEach((c, i) => {
    const p = ease.outBack(prog(t, 14.6 + i * 0.18, 15.1 + i * 0.18));
    if (p <= 0) return;
    const y = 250 + i * 190;
    ctx.save();
    ctx.globalAlpha = clamp(p) * (1 - out);
    ctx.translate(-(1 - p) * 120, 0);
    rrect(ctx, c.x, y, 470, 160, 16);
    ctx.fillStyle = rgba(C.panel, 0.9);
    ctx.fill();
    ctx.strokeStyle = rgba(c.col, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, c.head, c.x + 28, y + 58, {
      family: F.tc,
      size: 36,
      weight: 900,
      color: c.col,
    });
    text(ctx, c.l1, c.x + 130, y + 58, {
      family: F.tc,
      size: 30,
      weight: 700,
      color: C.text,
    });
    text(ctx, c.l2, c.x + 28, y + 122, {
      family: F.display,
      size: 40,
      weight: 700,
      color: c.col,
    });
    ctx.restore();
  });
  ctx.restore();
}

export function draw(ctx, t) {
  const stageA = tw(t, 2.0, 2.6) * (1 - tw(t, 17.2, 17.8));
  const K = cam(t);
  const [sx, sy] = shake(t, 11.2, 18, 0.7, 12);
  const rumble =
    t > 11.2 && t < 14.0
      ? [noise1(t * 40, 2) * 4, noise1(t * 40, 8) * 4]
      : [0, 0];
  const [sx2, sy2] = shake(t, 9.3, 6, 0.3, 4);
  const pan = tw(t, 16.9, 18.0, ease.inExpo);

  ctx.save();
  ctx.translate(sx + rumble[0] + sx2 - pan * 900, sy + rumble[1] + sy2);
  const PYg = 540 - (104 - K.pc) * K.k;
  priceGrid(ctx, t, {
    alpha: 0.55 * stageA,
    step: K.k * (K.k < 30 ? 2 : 1),
    oy: PYg,
    ox: -t * 20,
  });
  const dimBook = 1 - tw(t, 14.4, 15.0) * 0.85;
  drawLadder(ctx, t, stageA * dimBook, K);
  drawFlows(ctx, t, K);
  drawCandle(ctx, t, stageA, K);
  drawCounters(ctx, t, stageA * (1 - tw(t, 14.4, 14.9)));
  ctx.restore();

  statement(ctx, t);
  const sOut = tw(t, 17.0, 17.6);
  revealText(
    ctx,
    "突然暴漲，",
    1300,
    790,
    {
      family: F.tc,
      size: 64,
      weight: 900,
      color: C.text,
      align: "center",
      stagger: 0.05,
      rise: 30,
      blur: 10,
    },
    t - 14.9,
    sOut,
  );
  revealText(
    ctx,
    "不一定代表主動買盤很強。",
    1300,
    880,
    {
      family: F.tc,
      size: 64,
      weight: 900,
      color: C.gold,
      align: "center",
      stagger: 0.05,
      rise: 30,
      blur: 10,
    },
    t - 15.25,
    sOut,
  );

  chapterCard(ctx, t, {
    num: "02",
    kicker: "CHAPTER 02 · THE WICK",
    title: "衝上去的價格，怎麼又回來了？",
    sub: "影線：被動掛單的厚薄，決定價格走多遠",
    outA: 2.0,
    outB: 2.6,
  });
  captions(ctx, t, CAPS);
}
