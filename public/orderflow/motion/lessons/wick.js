// S01 衝上去，怎麼又回來？ — nine candles, one long upper wick; zoom into 14:32.
// Wick story numbers (bear units): 1,106 bought at 101–102 moves price only 2 元;
// 119 bought through 3-unit asks lifts 102 → 136; 4,980 sold into 130–324-unit
// bids returns it; close 103. Candle 14:32: O100 H136 L100 C103.
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
} from "../core.js";
import { titleCard, priceGrid, counter, statement, tag, panel } from "../kit.js";

// ---------------- overview (nine one-minute candles) ----------------
const NINE = [
  ["14:24", 98, 100, 97, 99],
  ["14:25", 99, 101, 98, 100],
  ["14:26", 100, 101, 98, 99],
  ["14:27", 99, 100, 97, 98],
  ["14:28", 98, 100, 97, 100],
  ["14:29", 100, 102, 99, 101],
  ["14:30", 100, 110, 98, 99],
  ["14:31", 99, 101, 98, 100],
  ["14:32", 100, 136, 100, 103],
];
const OVY = (p) => 930 - (p - 95) * 17;
const OVX = (i) => 420 + i * 140;

function overview(ctx, t, a, reveal = 9) {
  if (a <= 0) return;
  for (let p = 96; p <= 136; p += 8) {
    line(ctx, 330, OVY(p), 1640, OVY(p), C.line, 1, a * 0.5);
    text(ctx, String(p), 1660, OVY(p), {
      family: F.mono,
      size: 20,
      weight: 500,
      color: C.dim,
      base: "middle",
      alpha: a,
    });
  }
  NINE.forEach(([label, o, h, l, c], i) => {
    const pop = tw(t, 2.3 + i * 0.12, 2.8 + i * 0.12);
    if (i >= reveal) return;
    const hero = i === 8;
    candle(ctx, OVX(i), 64, OVY(o), OVY(h), OVY(l), OVY(c), {
      alpha: a * pop,
      wickWidth: hero ? 5 : 3,
      glow: hero ? 16 : 0,
      wickGlow: hero ? 0.6 + 0.3 * Math.sin(t * 3) : 0,
      wickGlowColor: C.gold,
    });
    text(ctx, label, OVX(i), 980, {
      family: F.mono,
      size: 20,
      weight: 600,
      color: hero ? C.gold : C.dim,
      align: "center",
      alpha: a * pop,
    });
  });
}

// ---------------- the minute (same engine as the showreel chapter) ----------------
const DT = 0.01;
const COL = 820;
const ASKX = 862;
const BIDX = 778;
const CX = 1290;
const PXQ = 0.85;
function rawPrice(s) {
  if (s < 2.5) return 100;
  if (s < 2.8) return 101;
  if (s < 6.85) return noise1(s * 7, 21) > -0.25 ? 102 : 101;
  if (s < 9.3) return Math.floor(102 + 34 * ease.inOutQuad(prog(s, 6.85, 9.25)) + 1e-9);
  if (s < 11.2) return noise1(s * 6, 5) > 0.2 ? 135 : 136;
  if (s < 14.0) {
    const p = 136 - 35 * ease.inOutQuad(prog(s, 11.2, 13.9));
    return Math.round(p + 3.4 * Math.exp(-(((s - 12.55) / 0.18) ** 2)));
  }
  if (s < 15.0) return 101 + Math.round(2 * ease.inOutQuad(prog(s, 14.1, 14.9)));
  return 103;
}
const N = Math.ceil(20 / DT) + 1;
const PR = new Float32Array(N);
const HI = new Float32Array(N);
const LO = new Float32Array(N);
for (let i = 0; i < N; i++) {
  PR[i] = rawPrice(i * DT);
  HI[i] = Math.max(i ? HI[i - 1] : 100, PR[i]);
  LO[i] = Math.min(i ? LO[i - 1] : 100, PR[i]);
}
const at = (arr, s) => arr[clamp(Math.floor(s / DT), 0, N - 1)];
const price = (s) => at(PR, s);
function crossTime(level, from, to, dir) {
  for (let i = Math.floor(from / DT); i < Math.floor(to / DT); i++)
    if (dir > 0 ? PR[i] >= level : PR[i] < level) return i * DT;
  return Infinity;
}
const askEaten = {};
for (let p = 103; p <= 135; p++) askEaten[p] = crossTime(p + 1, 6.8, 9.4, 1);
askEaten[136] = Infinity;
const bidEaten = {};
for (let p = 101; p <= 135; p++) bidEaten[p] = crossTime(p, 11.2, 14.0, -1);
const bidQty = (p) => (p === 135 ? 314 : p === 134 ? 324 : p === 133 ? 250 : Math.round(rrange(9, p, 130, 210)));
const PULSES = Array.from({ length: 12 }, (_, i) => 2.85 + i * 0.27);
const LAST = [6.05, 6.3, 6.55, 6.8];
function wallQty(s) {
  let q = 320;
  for (const tp of PULSES) {
    q -= 55 * ease.outCubic(prog(s, tp, tp + 0.08));
    q += 55 * ease.outCubic(prog(s, tp + 0.12, tp + 0.24));
  }
  LAST.forEach((tp, i) => (q -= (i < 3 ? 105 : 15) * ease.outCubic(prog(s, tp, tp + 0.08))));
  return Math.max(0, q);
}
function cam(s) {
  const z = tw(s, 6.8, 8.9, ease.inOutQuad);
  const z2 = tw(s, 14.4, 15.3, ease.inOutCubic);
  return { k: lerp(lerp(66, 19, z), 12, z2), pc: lerp(lerp(101.6, 118, z), 110, z2) };
}

function ladder(ctx, s, a, K) {
  const PY = (p) => 540 - (p - K.pc) * K.k;
  const bh = clamp(K.k * 0.7, 5, 38);
  const step = K.k < 30 ? 2 : 1;
  const last = price(s);
  for (let p = 96; p <= 140; p++) {
    const y = PY(p);
    if (y < 140 || y > 910) continue;
    if (p % step === 0 || p === last)
      text(ctx, String(p), COL, y, {
        family: F.mono,
        size: K.k < 30 ? 16 : 22,
        weight: p === last ? 700 : 500,
        align: "center",
        base: "middle",
        color: p === last ? C.gold : C.dim,
        alpha: a,
      });
    let aq = 0;
    if (p === 102) aq = s < 6.8 ? wallQty(s) : 0;
    else if (p >= 103 && p <= 136) {
      aq = s < askEaten[p] ? 3 : 0;
      if (p === 136 && s > 9.3) aq = 3 + 70 * (0.5 + 0.5 * Math.sin(s * 9)) * (1 - tw(s, 10.8, 11.2));
    }
    if (aq > 0) {
      const w = Math.max(6, aq * PXQ);
      ctx.save();
      ctx.globalAlpha = a;
      rrect(ctx, ASKX, y - bh / 2, w, bh, 3);
      ctx.fillStyle = rgba(C.sell, p === 102 ? 0.85 : 0.6);
      ctx.fill();
      ctx.restore();
      if (p === 102 && s < 6.9)
        text(ctx, `${fmt(aq)} 隻`, ASKX + w + 14, y, {
          family: F.mono,
          size: 22,
          weight: 700,
          color: C.sell,
          base: "middle",
          alpha: a,
        });
    }
    let bq = 0;
    const early = { 101: 60, 100: 95, 99: 70, 98: 120, 97: 85, 96: 60 };
    if (early[p] && s < 9.5) bq = early[p];
    if (p >= 100 && p <= 135 && s > 9.55) {
      const appear = 9.55 + (135 - p) * 0.035;
      const eat = bidEaten[p] ?? Infinity;
      bq = bidQty(p) * ease.outCubic(prog(s, appear, appear + 0.4)) * (1 - ease.inCubic(prog(s, eat - 0.08, eat)));
    }
    if (bq > 0.5) {
      ctx.save();
      ctx.globalAlpha = a;
      rrect(ctx, BIDX - bq * PXQ, y - bh / 2, bq * PXQ, bh, 3);
      ctx.fillStyle = rgba(C.buy, 0.62);
      ctx.fill();
      ctx.restore();
    }
    const eat = bidEaten[p];
    if (eat && isFinite(eat) && s >= eat && s < eat + 0.9)
      burst(ctx, BIDX - bidQty(p) * PXQ * 0.5, y, s, eat, {
        n: 16,
        speed: 520,
        seed: p,
        color: C.sell,
        life: 0.6,
        flare: 70,
        gravity: 500,
      });
    const ae = askEaten[p];
    if (ae && isFinite(ae) && s >= ae && s < ae + 0.5)
      burst(ctx, ASKX + 4, y, s, ae, { n: 8, speed: 260, seed: p + 70, color: C.buy, life: 0.4, flare: 40 });
  }
  text(ctx, "被動買單 BID", BIDX, 128, {
    family: F.mono,
    size: 16,
    weight: 600,
    color: C.buy,
    align: "right",
    ls: 3,
    alpha: a,
  });
  text(ctx, "ASK 被動賣單", ASKX, 128, { family: F.mono, size: 16, weight: 600, color: C.sell, ls: 3, alpha: a });
  const thin = tw(s, 6.9, 7.3) * (1 - tw(s, 9.6, 10.0));
  if (thin > 0)
    text(ctx, "每一檔只有 3 隻", ASKX + 26, PY(112), {
      family: F.tc,
      size: 26,
      weight: 700,
      color: C.sell,
      base: "middle",
      alpha: thin * a,
    });
  const thick = tw(s, 10.0, 10.4) * (1 - tw(s, 11.4, 11.8));
  if (thick > 0)
    text(ctx, "每一檔 130–324 隻", BIDX - 330, PY(120), {
      family: F.tc,
      size: 26,
      weight: 700,
      color: C.buy,
      align: "right",
      base: "middle",
      alpha: thick * a,
    });
}

function flows(ctx, s, K) {
  const PY = (p) => 540 - (p - K.pc) * K.k;
  for (const tp of [...PULSES, ...LAST]) {
    const p = prog(s, tp - 0.28, tp);
    if (p > 0 && p < 1) {
      const x = lerp(430, ASKX - 6, ease.inCubic(p));
      const y = lerp(PY(98.5), PY(102), ease.outCubic(p));
      glow(ctx, x, y, 26, C.buy, 0.9);
    }
  }
  if (s > 6.8 && s < 9.4)
    for (let i = 0; i < 26; i++) {
      const t0 = 6.8 + i * 0.09;
      const p = prog(s, t0, t0 + 0.3);
      if (p <= 0 || p >= 1) continue;
      const target = PY(price(t0 + 0.3));
      glow(ctx, lerp(520, ASKX - 4, ease.inCubic(p)), lerp(target + 120, target, ease.outCubic(p)), 18, C.buy, 0.8);
    }
  if (s > 11.1 && s < 14.4) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (let i = 0; i < 280; i++) {
      const t0 = 11.1 + i * 0.0105;
      const p = prog(s, t0, t0 + 0.32);
      if (p <= 0 || p >= 1) continue;
      const target = PY(price(t0 + 0.32)) + rrange(3, i, -10, 10);
      const sx = 1060 + rnd(4, i) * 260;
      const sy = -40 - rnd(5, i) * 120;
      const x = lerp(sx, BIDX - 4, ease.inQuad(p));
      const y = lerp(sy, target, ease.inQuad(p));
      const dx = BIDX - 4 - sx;
      const dy = target - sy;
      const m = Math.hypot(dx, dy);
      const len = 40 + 60 * p;
      ctx.strokeStyle = rgba(C.sell, 0.55 * (1 - p * 0.3));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (dx / m) * len, y - (dy / m) * len);
      ctx.stroke();
    }
    ctx.restore();
    glow(ctx, BIDX, PY(price(s)), 120, C.sell, 0.7);
  }
}

function minuteCandle(ctx, s, a, K) {
  const PY = (p) => 540 - (p - K.pc) * K.k;
  const hi = at(HI, s);
  const c = price(s);
  candle(ctx, CX, 72, PY(100), PY(hi), PY(at(LO, s)), PY(c), {
    alpha: a,
    glow: 20,
    wickWidth: 4,
    wickGlow: tw(s, 13.6, 14.4) * (0.8 + 0.4 * Math.sin(s * 5)),
    wickGlowColor: C.gold,
  });
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
      alpha: a * tw(s, 9.2, 9.5),
    });
  }
  text(ctx, "14:32 · 選段回看", CX, 128, {
    family: F.mono,
    size: 16,
    weight: 600,
    color: C.gold,
    align: "center",
    ls: 2,
    alpha: a,
  });
}

function counters(ctx, s, a) {
  const x = 1500;
  const w = 330;
  const pf = PULSES.reduce((q, tp) => q + pulse(s, tp, 10), 0) * 0.5;
  const aA = a * tw(s, 2.7, 3.1);
  counter(ctx, x, 190, "前段主動買入", fmt(Math.round(1106 * ease.inOutQuad(prog(s, 2.85, 6.8)))), {
    color: C.buy,
    alpha: aA,
    unit: "隻",
    w,
    flash: pf,
  });
  text(ctx, "價格 100 → 102", x + w - 20, 296, {
    family: F.tc,
    size: 20,
    weight: 600,
    color: C.text,
    align: "right",
    alpha: aA,
  });
  const aB = a * tw(s, 6.9, 7.3);
  counter(ctx, x, 340, "上衝主動買入", fmt(Math.round(119 * ease.inOutQuad(prog(s, 6.85, 9.25)))), {
    color: C.gold,
    alpha: aB,
    unit: "隻",
    w,
    flash: pulse(s, 9.3, 4),
  });
  text(ctx, `價格 102 → ${Math.max(102, Math.min(136, price(s)))}`, x + w - 20, 446, {
    family: F.tc,
    size: 20,
    weight: 600,
    color: C.text,
    align: "right",
    alpha: aB,
  });
  const aC = a * tw(s, 11.2, 11.5);
  counter(ctx, x, 490, "回落主動賣出", fmt(Math.round(4980 * ease.inOutQuad(prog(s, 11.2, 13.9)))), {
    color: C.sell,
    alpha: aC,
    unit: "隻",
    w,
    flash: pulse(s, 11.2, 3),
  });
}

// ---------------- lesson timing ----------------
const OFF = 6.0; // story time s = t − OFF
const IN = [6.4, 8.2]; // overview → minute
const BACK = [27.0, 28.8]; // minute → overview

export const lesson = {
  id: "wick",
  title: "衝上去，怎麼又回來？",
  duration: 36,
  description:
    "九根 K 線裡，14:32 留下長上影線。回看這一分鐘：先買 1,106 隻價格只多 2 元；接著只買 119 隻，就穿過每檔 3 隻的賣單衝上 136；高處的買單厚得多，4,980 隻主動賣出逐檔吃掉買單，收在 103。",
  note: "暴漲不一定是買盤強，\n也可能是賣單薄。",
  footer: "教學用合成行情，數字以熊、元、隻呈現；累計量不代表單一交易者。",
  audio: "./motion/audio/wick.m4a",
  music: {
    palette: "deep",
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 8.4, level: 2 },
      { t: 17.2, level: 3 },
      { t: 20.0, level: 2 },
      { t: 22, level: 1 },
      { t: 30.4, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "九根 K 裡的一根上影線" },
    { t: 6.4, label: "買了很多，價格卻不動" },
    { t: 12.8, label: "只買一點，價格衝上去" },
    { t: 15.3, label: "大量賣出，逐檔回落" },
    { t: 20.6, label: "上衝與回落，是兩件事" },
  ],
  captions: [
    { a: 2.4, b: 6.3, text: "九根 K 線裡，14:32 衝到 136，又回到 103。" },
    { a: 6.4, b: 8.4, text: "回看 14:32：從同一分鐘的起點開始。" },
    { a: 8.5, b: 12.7, text: "買了 1,106 隻，價格只多 2 元：102 的賣單一直補回來。" },
    { a: 12.8, b: 15.2, text: "只買 119 隻，價格衝上 136：上方每檔只有 3 隻。" },
    { a: 15.3, b: 17.1, text: "衝到高處停住了；下方的被動買單厚得多。" },
    { a: 17.2, b: 20.5, text: "4,980 隻主動賣出，逐檔吃掉買單，回到 103。" },
    { a: 20.6, b: 26.9, text: "上衝是賣單薄；回落是主動賣出多。" },
    { a: 27.0, b: 36, text: "突然暴漲，不一定代表主動買盤很強。" },
  ],
  flashes: [{ t: 17.2, amt: 0.3, decay: 7 }],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    ...NINE.map((_, i) => ({ t: 2.3 + i * 0.12, kind: "blip", vel: 0.25 })),
    { t: 3.4, kind: "swell", dur: 2.4 },
    { t: IN[0], kind: "whoosh", dur: 1.6 },
    { t: 7.6, kind: "drain", dur: 0.4 },
    ...PULSES.map((p) => ({ t: p + OFF, kind: "fill", price: 102, side: "buy", soft: true })),
    ...LAST.map((p) => ({ t: p + OFF, kind: "fill", price: 102, side: "buy", soft: true })),
    ...Object.entries(askEaten)
      .filter(([, v]) => isFinite(v))
      .map(([p, v]) => ({ t: v + OFF, kind: "fill", price: Number(p), side: "buy", soft: true, arp: true })),
    { t: 9.3 + OFF, kind: "impact" },
    { t: 9.6 + OFF, kind: "swell", dur: 1.6 },
    { t: 11.2 + OFF, kind: "impact", big: true },
    { t: 11.2 + OFF, kind: "rumble", dur: 2.9 },
    ...Object.entries(bidEaten)
      .filter(([, v]) => isFinite(v))
      .map(([p, v]) => ({ t: v + OFF, kind: "crack", price: Number(p) })),
    { t: 20.8, kind: "stamp" },
    { t: BACK[0], kind: "whoosh", dur: 1.6 },
    { t: 30.4, kind: "stamp" },
  ],
  draw(ctx, t) {
    const a0 = tw(t, 2.0, 2.6);
    const s = t - OFF;
    const inP = tw(t, ...IN, ease.inOutCubic);
    const backP = tw(t, ...BACK, ease.inOutCubic);
    const minuteA = inP * (1 - backP);
    // Overview with a push-in on the hero candle (and back out at the end).
    const ovA = a0 * (1 - clamp(minuteA * 3));
    if (ovA > 0.01) {
      const z = 1 + inP * (1 - backP) * 5;
      ctx.save();
      const fx = OVX(8);
      const fy = OVY(101);
      ctx.translate(fx, fy);
      ctx.scale(z, z);
      ctx.translate(-fx, -fy);
      priceGrid(ctx, t, { alpha: 0.3 * ovA, step: 68 });
      overview(ctx, t, ovA);
      ctx.restore();
      const q = tw(t, 3.6, 4.2) * (1 - tw(t, 6.2, 6.6));
      if (q > 0) {
        tag(ctx, "已完成的模擬行情", 330, 150, { color: C.muted, alpha: q, size: 22 });
        line(ctx, OVX(8) - 120, OVY(136), OVX(8) - 20, OVY(136), C.gold, 2, q);
        text(ctx, "衝上 136", OVX(8) - 130, OVY(136), {
          family: F.tc,
          size: 28,
          weight: 800,
          color: C.gold,
          align: "right",
          base: "middle",
          alpha: q,
        });
        text(ctx, "收回 103", OVX(8) - 130, OVY(103), {
          family: F.tc,
          size: 28,
          weight: 800,
          color: C.buy,
          align: "right",
          base: "middle",
          alpha: q,
        });
      }
      const fin = tw(t, 29.0, 29.6);
      if (fin > 0) {
        const fin2 = tw(t, 29.3, 29.9);
        // Both notes point at the 14:32 wick; keep them clear of the 14:30 wick (high 110).
        line(ctx, OVX(8) - 38, OVY(126), OVX(8) - 8, OVY(126), C.gold, 2, fin);
        tag(ctx, "上衝：被動賣單很薄", OVX(8) - 40, OVY(126), { align: "right", color: C.gold, alpha: fin, size: 26 });
        line(ctx, OVX(8) - 38, OVY(117), OVX(8) - 8, OVY(117), C.sell, 2, fin2);
        tag(ctx, "回落：大量主動賣出", OVX(8) - 40, OVY(117), {
          align: "right",
          color: C.sell,
          alpha: fin2,
          size: 26,
        });
      }
    }
    if (minuteA > 0.01) {
      const K = cam(s);
      const [sx, sy] = shake(s, 11.2, 18, 0.7, 12);
      const rum = s > 11.2 && s < 14.0 ? [noise1(s * 40, 2) * 4, noise1(s * 40, 8) * 4] : [0, 0];
      ctx.save();
      ctx.globalAlpha = minuteA;
      ctx.translate(sx + rum[0], sy + rum[1]);
      priceGrid(ctx, t, { alpha: 0.55, step: K.k * (K.k < 30 ? 2 : 1), oy: 540 - (104 - K.pc) * K.k, ox: -t * 20 });
      const dimBook = 1 - tw(s, 14.4, 15.0) * 0.85;
      ladder(ctx, s, dimBook, K);
      flows(ctx, s, K);
      minuteCandle(ctx, s, 1, K);
      counters(ctx, s, 1 - tw(s, 14.4, 14.9));
      ctx.restore();
      // Comparison cards.
      const cards = [
        { col: C.buy, head: "上衝", l1: "被動賣單很薄", l2: "119 隻 → +34 元" },
        { col: C.sell, head: "回落", l1: "大量主動賣出", l2: "4,980 隻 → −33 元" },
      ];
      cards.forEach((c, i) => {
        const p = ease.outBack(prog(t, 20.6 + i * 0.18, 21.1 + i * 0.18));
        if (p <= 0) return;
        const y = 300 + i * 190;
        ctx.save();
        ctx.globalAlpha = clamp(p) * minuteA;
        ctx.translate(-(1 - p) * 120, 0);
        panel(ctx, 140, y, 470, 160, { color: c.col, borderAlpha: 0.6 });
        text(ctx, c.head, 168, y + 58, { family: F.tc, size: 36, weight: 900, color: c.col });
        text(ctx, c.l1, 270, y + 58, { family: F.tc, size: 30, weight: 700, color: C.text });
        text(ctx, c.l2, 168, y + 122, { family: F.display, size: 40, weight: 700, color: c.col });
        ctx.restore();
      });
    }
    statement(
      ctx,
      t,
      30.4,
      [
        { text: "突然暴漲，", size: 60 },
        { text: "不一定代表主動買盤很強。", size: 60 },
      ],
      { y: 150, gap: 80 },
    );
    titleCard(ctx, t, {
      num: "S1",
      kicker: "STORY 01 · THE WICK",
      title: "衝上去，怎麼又回來？",
      sub: "走進一根上影線",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
