// C09 Delta 與 CVD — per-minute aggressive buy minus sell, then accumulated.
// DELTA-CONCEPT-LESSON-PLAN: 14:30 buy 40 / sell 15 → +25; 14:31 buy 10 / sell 20 → −10;
// 14:32 buy 25 / sell 10 → +15. CVD reset at 14:30: 25, 15, 30.
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
  signed,
} from "../core.js";
import { titleCard, priceGrid, floatChip, camera, camPath, statement, tag, panel } from "../kit.js";

const XS = [560, 960, 1360];
const MIN = [
  { label: "14:30", rows: { 102: [0, 20], 101: [15, 20] } },
  { label: "14:31", rows: { 102: [0, 10], 101: [20, 0] } },
  { label: "14:32", rows: { 102: [0, 25], 101: [10, 0] } },
].map((m) => {
  const buy = Object.values(m.rows).reduce((s, r) => s + r[1], 0);
  const sell = Object.values(m.rows).reduce((s, r) => s + r[0], 0);
  return { ...m, buy, sell, delta: buy - sell };
});
let run = 0;
const CVD = MIN.map((m) => (run += m.delta));
const RY = { 102: 250, 101: 322 };
const CELL = 100;
const DB = 640; // delta baseline
const DS = 5;
const CB = 930; // cvd zero
const CS = 3.6;
// When each minute's delta is revealed.
const REVEAL = [10.2, 14.6, 16.4];
const CVD_T = [20.2, 21.6, 23.0];

function column(ctx, i, t, a) {
  const m = MIN[i];
  const x = XS[i];
  text(ctx, m.label, x, 196, {
    family: F.mono,
    size: 24,
    weight: 600,
    color: i === 0 ? C.gold : C.muted,
    align: "center",
    alpha: a,
  });
  for (const p of [102, 101]) {
    const y = RY[p];
    const [sv, bv] = m.rows[p];
    for (const [cx, v, col] of [
      [x - 6 - CELL, sv, C.sell],
      [x + 6, bv, C.buy],
    ]) {
      ctx.save();
      ctx.globalAlpha = a;
      rrect(ctx, cx, y - 30, CELL, 60, 8);
      ctx.fillStyle = rgba(col, 0.06 + clamp(v / 30) * 0.4);
      ctx.fill();
      ctx.strokeStyle = rgba(col, 0.35);
      ctx.stroke();
      ctx.restore();
      text(ctx, String(v), cx + CELL / 2, y + 1, {
        family: F.display,
        size: 36,
        weight: 700,
        color: v ? C.text : C.dim,
        align: "center",
        base: "middle",
        alpha: a,
      });
    }
    if (i === 0)
      text(ctx, String(p), x - CELL - 30, y, {
        family: F.mono,
        size: 22,
        weight: 500,
        color: C.dim,
        align: "right",
        base: "middle",
        alpha: a,
      });
  }
}

export const lesson = {
  id: "delta-concept",
  title: "Delta 與 CVD",
  duration: 30,
  description:
    "三分鐘足跡：14:30 主動買 40、主動賣 15，Delta +25；14:31 為 −10；14:32 為 +15。CVD 從 14:30 歸零開始累加，依序是 25、15、30。",
  note: "Delta 看每一段，\nCVD 看一路累加。",
  footer: "Delta＝主動買入量 − 主動賣出量；CVD 從明示的起點累加，不同圖表的起點與重置設定可能不同。",
  audio: "./motion/audio/delta-concept.m4a",
  music: {
    palette: "glass",
    key: 1,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 5, level: 2 },
      { t: 18, level: 1 },
      { t: 19.6, level: 2 },
      { t: 25.4, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "三分鐘的成交足跡" },
    { t: 4.4, label: "一分鐘的 Delta" },
    { t: 12.6, label: "每一段都算一次" },
    { t: 18.2, label: "CVD：從起點累加" },
  ],
  captions: [
    { a: 2.4, b: 4.3, text: "三分鐘的足跡：左格主動賣、右格主動買。" },
    { a: 4.4, b: 7.9, text: "14:30 主動買入加起來：20 + 20 = 40。" },
    { a: 8.0, b: 9.9, text: "主動賣出：15。" },
    { a: 10.0, b: 12.5, text: "Delta = 40 − 15 = +25。" },
    { a: 12.6, b: 18.1, text: "同樣算法：14:31 是 −10，14:32 是 +15。" },
    { a: 18.2, b: 24.9, text: "CVD 從 14:30 歸零，一路累加：25、15、30。" },
    { a: 25.0, b: 30, text: "Delta 看每一段，CVD 看從起點累加。" },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    ...XS.map((_, i) => ({ t: 2.3 + i * 0.15, kind: "blip", vel: 0.25 })),
    { t: 4.4, kind: "whoosh", dur: 0.8 },
    { t: 6.0, kind: "fill", price: 102, side: "buy", soft: true },
    { t: 6.4, kind: "fill", price: 101, side: "buy", soft: true },
    { t: 8.4, kind: "fill", price: 101, side: "sell", soft: true },
    ...REVEAL.map((t, i) => ({
      t,
      kind: "fill",
      price: MIN[i].delta > 0 ? 104 : 99,
      side: MIN[i].delta > 0 ? "buy" : "sell",
    })),
    { t: 12.6, kind: "whoosh", dur: 0.9 },
    { t: 18.6, kind: "stamp" },
    ...CVD_T.map((t, i) => ({ t, kind: "pluck", note: [4, 2, 6][i] })),
    { t: 25.4, kind: "stamp" },
  ],
  draw(ctx, t) {
    const a = tw(t, 2.0, 2.6);
    const cam = camPath(t, [
      { t: 0, x: 960, y: 330, z: 1.3 },
      { t: 4.4, x: 960, y: 330, z: 1.3 },
      { t: 5.3, x: 600, y: 420, z: 1.45 },
      { t: 12.6, x: 600, y: 420, z: 1.45 },
      { t: 13.7, x: 960, y: 440, z: 1.12 },
      { t: 18.2, x: 960, y: 440, z: 1.12 },
      { t: 19.2, x: 960, y: 560, z: 1 },
    ]);
    camera(ctx, cam, () => {
      priceGrid(ctx, t, { alpha: 0.3 * a, step: 72 });
      MIN.forEach((_, i) =>
        column(ctx, i, t, a * (i === 0 ? 1 : 1 - 0.75 * tw(t, 4.4, 5.2) * (1 - tw(t, 12.6, 13.4)))),
      );
      // Totals for minute 1 (flying cells).
      const x = XS[0];
      const fl = (t0, fromX, fromY, toX, toY, label, col) => {
        const p = prog(t, t0 - 0.5, t0);
        if (p > 0 && p < 1) {
          const e = ease.inOutCubic(p);
          text(ctx, label, lerp(fromX, toX, e), lerp(fromY, toY, e) - Math.sin(e * Math.PI) * 40, {
            family: F.display,
            size: 36,
            weight: 700,
            color: col,
            align: "center",
            base: "middle",
            glow: 14,
          });
        }
      };
      fl(6.0, x + 56, RY[102], x + 70, 430, "20", C.buy);
      fl(6.4, x + 56, RY[101], x + 70, 430, "20", C.buy);
      fl(8.4, x - 56, RY[101], x - 70, 430, "15", C.sell);
      MIN.forEach((m, i) => {
        const tb = i === 0 ? 6.4 : REVEAL[i] - 0.6;
        const ts = i === 0 ? 8.4 : REVEAL[i] - 0.6;
        const ba = tw(t, tb, tb + 0.3);
        const sa = tw(t, ts, ts + 0.3);
        text(ctx, i === 0 && t < 6.4 ? "買 20" : `買 ${m.buy}`, XS[i] + 70, 440, {
          family: F.tc,
          size: 28,
          weight: 800,
          color: C.buy,
          align: "center",
          alpha: Math.max(ba, i === 0 ? tw(t, 6.0, 6.3) : 0) * a,
        });
        text(ctx, `賣 ${m.sell}`, XS[i] - 70, 440, {
          family: F.tc,
          size: 28,
          weight: 800,
          color: C.sell,
          align: "center",
          alpha: sa * a,
        });
        const ra = tw(t, REVEAL[i] - 0.4, REVEAL[i]);
        if (ra > 0)
          text(ctx, `${m.buy} − ${m.sell} = ${signed(m.delta)}`, XS[i], 500, {
            family: F.display,
            size: 36,
            weight: 700,
            color: C.text,
            align: "center",
            alpha: ra * a,
          });
        // Delta bar.
        const g = ease.outBack(prog(t, REVEAL[i], REVEAL[i] + 0.5));
        if (g > 0) {
          const h = m.delta * DS * g;
          const col = m.delta >= 0 ? C.buy : C.sell;
          ctx.save();
          ctx.globalAlpha = a;
          rrect(ctx, XS[i] - 50, h > 0 ? DB - h : DB, 100, Math.abs(h), 6);
          ctx.fillStyle = rgba(col, 0.8);
          ctx.shadowColor = col;
          ctx.shadowBlur = 16;
          ctx.fill();
          ctx.restore();
          text(ctx, `Delta ${signed(m.delta)}`, XS[i] + 64, DB - h / 2, {
            family: F.display,
            size: 30,
            weight: 700,
            color: col,
            base: "middle",
            alpha: a * clamp(g),
          });
        }
      });
      line(ctx, 380, DB, 1540, DB, C.muted, 1.5, a * tw(t, 9.6, 10));
      text(ctx, "0", 370, DB, {
        family: F.mono,
        size: 20,
        weight: 600,
        color: C.muted,
        align: "right",
        base: "middle",
        alpha: a * tw(t, 9.6, 10),
      });
      // CVD panel.
      const ca = tw(t, 18.2, 18.8);
      if (ca > 0) {
        panel(ctx, 360, 740, 1200, 230, { alpha: ca * 0.8, fillAlpha: 0.6 });
        text(ctx, "CVD（14:30 起算）", 390, 780, { family: F.tc, size: 24, weight: 800, color: C.gold, alpha: ca });
        line(ctx, 400, CB, 1520, CB, C.muted, 1.5, ca, [6, 6]);
        const sx = 420;
        ctx.save();
        ctx.globalAlpha = ca;
        ctx.beginPath();
        ctx.arc(sx, CB, 9, 0, Math.PI * 2);
        ctx.fillStyle = C.gold;
        ctx.fill();
        ctx.restore();
        text(ctx, "起點 0", sx + 16, CB + 30, { family: F.tc, size: 20, weight: 700, color: C.gold, alpha: ca });
        let px = sx;
        let py = CB;
        CVD.forEach((v, i) => {
          const p = ease.inOutCubic(prog(t, CVD_T[i] - 0.5, CVD_T[i]));
          if (p <= 0) return;
          const x2 = XS[i];
          const y2 = CB - v * CS;
          line(ctx, px, py, lerp(px, x2, p), lerp(py, y2, p), C.gold, 4, ca);
          if (p >= 1) {
            glow(ctx, x2, y2, 30, C.gold, 0.8);
            ctx.save();
            ctx.globalAlpha = ca;
            ctx.beginPath();
            ctx.arc(x2, y2, 9, 0, Math.PI * 2);
            ctx.fillStyle = C.gold;
            ctx.fill();
            ctx.restore();
            text(ctx, String(v), x2, y2 - 24, {
              family: F.display,
              size: 34,
              weight: 700,
              color: C.gold,
              align: "center",
              alpha: ca,
            });
            text(
              ctx,
              `${i ? CVD[i - 1] : 0} ${MIN[i].delta >= 0 ? "+" : "−"} ${Math.abs(MIN[i].delta)}`,
              x2 + 64,
              y2 + 6,
              { family: F.mono, size: 18, weight: 500, color: C.muted, alpha: ca },
            );
          }
          px = x2;
          py = y2;
        });
      }
    });
    statement(ctx, t, 25.4, [{ text: "Delta 看每一段，CVD 看一路累加。", size: 52 }], { y: 120 });
    titleCard(ctx, t, {
      num: "09",
      kicker: "CONCEPT 09 · DELTA & CVD",
      title: "Delta 與 CVD",
      sub: "當段差額與累計差額",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
