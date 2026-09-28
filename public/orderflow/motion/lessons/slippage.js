// C05 滑價 — the same market buy of 30 into a deep and a shallow book.
// SLIPPAGE-LESSON-PLAN: deep asks 101/102/103/104 = 40/25/25/30 → 30@101, avg 101.
// Shallow = 5/15/0/20 → 5@101 + 15@102 + 10@104 = 3075, avg 102.50; +1.50 per unit,
// 45 in total versus the pre-trade best ask of 101.
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
  line,
  pulse,
  rrect,
  hexMix,
} from "../core.js";
import { titleCard, priceGrid, floatChip, camera, camPath, statement, tag, panel } from "../kit.js";

const SY = (p) => 470 - (p - 101) * 88; // shelf y
const TRAY = 650;
const LX = 520;
const RX = 1400;
const TOK = 13;
const STEP = 14.5;
const LEVEL = { 101: C.teal, 102: hexMix(C.teal, C.gold, 0.5), 103: C.gold, 104: C.sell };

const DEEP = { 101: 40, 102: 25, 103: 25, 104: 30 };
const SHALLOW = { 101: 5, 102: 15, 103: 0, 104: 20 };

// Units consumed: {price, idx, t (leaves shelf), slot}
const deepUnits = Array.from({ length: 30 }, (_, i) => ({ price: 101, idx: i, t: 6.0 + i * 0.07, slot: i }));
const shallowUnits = [
  ...Array.from({ length: 5 }, (_, i) => ({ price: 101, idx: i, t: 12.3 + i * 0.1 })),
  ...Array.from({ length: 15 }, (_, i) => ({ price: 102, idx: i, t: 13.2 + i * 0.08 })),
  ...Array.from({ length: 10 }, (_, i) => ({ price: 104, idx: i, t: 16.0 + i * 0.08 })),
].map((u, i) => ({ ...u, slot: i }));
const FLY = 0.45;

function avgAt(units, t) {
  const done = units.filter((u) => t >= u.t + FLY);
  if (!done.length) return null;
  return { n: done.length, avg: done.reduce((s, u) => s + u.price, 0) / done.length };
}

function shelfX(cx, idx) {
  return cx - 290 + idx * STEP;
}
function slotX(cx, slot) {
  return cx - 290 + slot * 19.8;
}

function drawSide(ctx, cx, book, units, t, o) {
  const a = o.alpha;
  if (a <= 0) return;
  panel(ctx, cx - 350, SY(104) - 90, 700, TRAY - SY(104) + 170, { alpha: a * 0.55, fillAlpha: 0.4 });
  text(ctx, o.title, cx, SY(104) - 110, {
    family: F.tc,
    size: 32,
    weight: 800,
    color: o.color,
    align: "center",
    alpha: a,
  });
  for (let p = 101; p <= 104; p++) {
    const y = SY(p);
    text(ctx, String(p), cx - 318, y, {
      family: F.mono,
      size: 24,
      weight: 600,
      color: C.muted,
      align: "right",
      base: "middle",
      alpha: a,
    });
    line(ctx, cx - 300, y + TOK, cx + 330, y + TOK, C.line, 1, a * 0.8);
    const n = book[p];
    if (!n) {
      const f = o.empty ? pulse(t, o.empty, 2.5) : 0;
      text(ctx, "沒有掛單", cx - 280, y, {
        family: F.tc,
        size: 22,
        weight: 700,
        color: f > 0.05 ? C.sell : C.dim,
        base: "middle",
        alpha: a * (0.6 + f),
      });
      if (f > 0.01) {
        ctx.save();
        ctx.globalAlpha = a * f * 0.35;
        ctx.fillStyle = C.sell;
        ctx.fillRect(cx - 300, y - 20, 630, 40);
        ctx.restore();
      }
      continue;
    }
    for (let i = 0; i < n; i++) {
      const u = units.find((q) => q.price === p && q.idx === i);
      if (u && t >= u.t) continue;
      ctx.save();
      ctx.globalAlpha = a;
      rrect(ctx, shelfX(cx, i) - TOK / 2, y - TOK / 2, TOK, TOK, 3);
      ctx.fillStyle = rgba(C.sell, 0.75);
      ctx.fill();
      ctx.restore();
    }
    text(
      ctx,
      `${units.filter((q) => q.price === p && t >= q.t).length ? n - units.filter((q) => q.price === p && t >= q.t).length : n}`,
      cx + 338,
      y,
      {
        family: F.display,
        size: 26,
        weight: 700,
        color: C.sell,
        base: "middle",
        alpha: a * 0.9,
      },
    );
  }
  // Tray.
  text(ctx, "你買到的 30 隻", cx - 300, TRAY - 36, { family: F.tc, size: 22, weight: 700, color: C.muted, alpha: a });
  for (let s = 0; s < 30; s++) {
    ctx.save();
    ctx.globalAlpha = a * 0.5;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    rrect(ctx, slotX(cx, s) - 8, TRAY - 8, 16, 16, 4);
    ctx.stroke();
    ctx.restore();
  }
  for (const u of units) {
    if (t < u.t) continue;
    const p = ease.inOutCubic(clamp((t - u.t) / FLY));
    const sx = shelfX(cx, u.idx);
    const sy = SY(u.price);
    const tx = slotX(cx, u.slot);
    const x = lerp(sx, tx, p);
    const y = lerp(sy, TRAY, p) - Math.sin(p * Math.PI) * 40;
    const col = LEVEL[u.price];
    ctx.save();
    ctx.globalAlpha = a;
    rrect(ctx, x - 8, y - 8, 16, 16, 4);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
    if (p < 1) glow(ctx, x, y, 16, col, 0.7);
  }
  // Average meter.
  const av = avgAt(units, t);
  const base = 101;
  const mx0 = cx - 300;
  const mx1 = cx + 300;
  const MX = (v) => lerp(mx0, mx1, (v - 100.5) / 4);
  const my = TRAY + 90;
  line(ctx, mx0, my, mx1, my, C.line, 3, a);
  for (let v = 101; v <= 104; v++)
    text(ctx, String(v), MX(v), my + 28, {
      family: F.mono,
      size: 18,
      weight: 500,
      color: C.dim,
      align: "center",
      alpha: a,
    });
  line(ctx, MX(base), my - 16, MX(base), my + 12, C.muted, 2, a);
  if (av) {
    const x = MX(av.avg);
    if (av.avg > base) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = rgba(C.sell, 0.45);
      ctx.fillRect(MX(base), my - 5, x - MX(base), 10);
      ctx.restore();
    }
    glow(ctx, x, my, 26, o.color, a);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(x, my, 9, 0, Math.PI * 2);
    ctx.fillStyle = C.white;
    ctx.fill();
    ctx.restore();
    text(ctx, `均價 ${av.avg.toFixed(2)}`, x, my - 26, {
      family: F.display,
      size: 34,
      weight: 700,
      color: C.text,
      align: "center",
      alpha: a,
      glow: 10,
    });
  }
}

export const lesson = {
  id: "slippage",
  title: "滑價",
  duration: 30,
  description:
    "同樣市價買 30 隻：深的委託簿全在 101 成交，均價 101；淺的委託簿依序成交 5 隻 101、15 隻 102，103 沒有掛單，再買 10 隻 104，均價 102.50，每隻比 101 多付 1.50。",
  note: "同一張單，\n深度決定均價。",
  footer: "預期基準＝送單前的最優賣價 101；不含手續費與送單期間的其他變化。",
  audio: "./motion/audio/slippage.m4a",
  music: {
    palette: "lift",
    key: -2,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 5.6, level: 2 },
      { t: 11, level: 1 },
      { t: 12, level: 2 },
      { t: 17.2, level: 3 },
      { t: 18.6, level: 2 },
      { t: 24.8, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "同樣買 30 隻" },
    { t: 5.0, label: "深的委託簿" },
    { t: 11.0, label: "淺的委託簿" },
    { t: 22.6, label: "這段價差，就是滑價" },
  ],
  captions: [
    { a: 2.4, b: 4.9, text: "同樣買 30 隻，價格會一樣嗎？" },
    { a: 5.0, b: 10.9, text: "深的委託簿：30 隻都在 101 成交。" },
    { a: 11.0, b: 14.9, text: "淺的委託簿：101 只有 5 隻，接著買 102。" },
    { a: 15.0, b: 17.9, text: "103 沒有掛單，直接買到 104。" },
    { a: 18.0, b: 22.5, text: "均價 102.50：每隻多付 1.50，共 45 元。" },
    { a: 22.6, b: 30, text: "成交均價和預期價格的差，就是滑價。" },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    { t: 5.0, kind: "whoosh", dur: 0.8 },
    ...deepUnits
      .filter((_, i) => i % 3 === 0)
      .map((u) => ({ t: u.t, kind: "fill", price: 101, side: "buy", soft: true, arp: true })),
    { t: 8.6, kind: "coin" },
    { t: 11.0, kind: "whoosh", dur: 0.8 },
    ...shallowUnits
      .filter((_, i) => i % 2 === 0)
      .map((u) => ({ t: u.t, kind: "fill", price: u.price, side: "buy", soft: true, arp: true })),
    { t: 15.0, kind: "alarm" },
    { t: 17.2, kind: "coin" },
    { t: 22.6, kind: "whoosh", dur: 1 },
    { t: 24.8, kind: "stamp" },
  ],
  draw(ctx, t) {
    const stageA = tw(t, 2.0, 2.6);
    const cam = camPath(t, [
      { t: 0, x: W / 2, y: 470, z: 0.94 },
      { t: 5.0, x: W / 2, y: 470, z: 0.94 },
      { t: 5.9, x: LX, y: 440, z: 1.25 },
      { t: 11.0, x: LX, y: 440, z: 1.25 },
      { t: 12.1, x: RX, y: 440, z: 1.25 },
      { t: 22.6, x: RX, y: 440, z: 1.25 },
      { t: 24.0, x: W / 2, y: 500, z: 0.9 },
    ]);
    camera(ctx, cam, () => {
      priceGrid(ctx, t, { alpha: 0.3 * stageA, step: 88, oy: SY(101) + 44 });
      const dimL = 1 - 0.55 * tw(t, 11, 12) * (1 - tw(t, 22.6, 23.4));
      const dimR = 1 - 0.55 * tw(t, 5, 5.8) * (1 - tw(t, 11, 11.8));
      drawSide(ctx, LX, DEEP, deepUnits, t, { alpha: stageA * dimL, title: "深的委託簿", color: C.teal });
      drawSide(ctx, RX, SHALLOW, shallowUnits, t, {
        alpha: stageA * dimR,
        title: "淺的委託簿",
        color: C.gold,
        empty: 15.0,
      });
      // Shared order chip.
      const oc = tw(t, 2.6, 3.0) * (1 - tw(t, 5.0, 5.4)) + tw(t, 23.6, 24.0) * 0;
      if (oc > 0)
        tag(ctx, "市價買入 30 隻 · 送單前最優賣價 101", W / 2, SY(104) - 190, {
          align: "center",
          color: C.text,
          alpha: oc,
          size: 26,
        });
      const d = tw(t, 18.2, 18.6) * (1 - tw(t, 22.4, 22.8));
      if (d > 0)
        tag(ctx, "每隻 +1.50 · 共多付 45 元", RX, TRAY + 170, {
          align: "center",
          color: C.sell,
          alpha: d,
          size: 26,
          solid: true,
        });
      const res = tw(t, 23.6, 24.1);
      if (res > 0) {
        tag(ctx, "滑價 0", LX, TRAY + 170, { align: "center", color: C.teal, alpha: res, size: 26 });
        tag(ctx, "滑價 +1.50 / 隻", RX, TRAY + 170, {
          align: "center",
          color: C.sell,
          alpha: res,
          size: 26,
          solid: true,
        });
      }
    });
    statement(ctx, t, 24.8, [{ text: "這段成交價差，就是本例的滑價。", size: 52 }], { y: 120 });
    titleCard(ctx, t, {
      num: "05",
      kicker: "CONCEPT 05 · SLIPPAGE",
      title: "滑價",
      sub: "一筆單，走過幾個價位",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
