// C13 成交量分布圖 — the same trades regrouped from time bars into price rows.
// VOLUME-PROFILE-LESSON-PLAN: 14:30 100×10 → 101×20 → 102×10 (40); 14:31 101×20 →
// 102×20 → 103×20 (60); 14:32 102×10 → 101×20 → 100×10 (40). By price:
// 103 20, 102 40, 101 60 (POC), 100 20; total 140. Pending + moving + sorted = 140.
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
} from "../core.js";
import { titleCard, priceGrid, floatChip, camera, camPath, statement, tag, panel } from "../kit.js";

const PY = (p) => 470 - (p - 101.5) * 90;
const VB = 900;
const VS = 3.2; // px per unit (time bars)
const HS = 5.2; // px per unit (profile)
const XS = [460, 700, 940];
const PX0 = 1180; // profile origin
const MIN = [
  {
    label: "14:30",
    seq: [
      [100, 10],
      [101, 20],
      [102, 10],
    ],
  },
  {
    label: "14:31",
    seq: [
      [101, 20],
      [102, 20],
      [103, 20],
    ],
  },
  {
    label: "14:32",
    seq: [
      [102, 10],
      [101, 20],
      [100, 10],
    ],
  },
];
// Nine pieces, each moving from its minute's bar to its price row.
const PIECES = [];
{
  let k = 0;
  MIN.forEach((m, i) => {
    let base = 0;
    m.seq.forEach(([price, qty]) => {
      PIECES.push({ i, price, qty, base, t: 5.2 + k * 1.75 });
      base += qty;
      k++;
    });
  });
}
const FLY = 1.0;
const SORTED = PIECES.at(-1).t + FLY; // ≈ 20.2

function profileAt(t) {
  const p = { 100: 0, 101: 0, 102: 0, 103: 0 };
  for (const x of PIECES) if (t >= x.t + FLY) p[x.price] += x.qty;
  return p;
}
const counts = (t) => {
  let pending = 0;
  let moving = 0;
  let sorted = 0;
  for (const x of PIECES) {
    if (t < x.t) pending += x.qty;
    else if (t < x.t + FLY) moving += x.qty;
    else sorted += x.qty;
  }
  return { pending, moving, sorted };
};

export const lesson = {
  id: "volume-profile",
  title: "成交量分布圖",
  duration: 30,
  description:
    "三分鐘量柱 40、60、40，共 140 隻。九段成交依價格搬到右側：103 元 20、102 元 40、101 元 60、100 元 20；101 成交最多，是這段範圍的 POC。",
  note: "同一批成交，\n換一個方向數。",
  footer: "統計範圍 14:30–14:33、每列 1 元；分布圖是已成交量，不是等待中的掛單。",
  audio: "./motion/audio/volume-profile.m4a",
  music: {
    palette: "glass",
    key: -1,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 5, level: 2 },
      { t: 20.4, level: 1 },
      { t: 25.2, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "三分鐘的成交量" },
    { t: 4.6, label: "搬到對應的價格" },
    { t: 13.0, label: "同一價位累加" },
    { t: 20.4, label: "成交最多的價位：POC" },
  ],
  captions: [
    { a: 2.4, b: 4.5, text: "三分鐘的量柱：40、60、40，共 140 隻。" },
    { a: 4.6, b: 12.9, text: "把每段成交，搬到它成交的價格。" },
    { a: 13.0, b: 20.3, text: "同一價位的量累加；總數一直是 140。" },
    { a: 20.4, b: 25.1, text: "101 元累積 60 隻，成交最多：POC。" },
    { a: 25.2, b: 30, text: "分布圖記錄的是已成交量，不是掛單。" },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    ...XS.map((_, i) => ({ t: 2.3 + i * 0.15, kind: "blip", vel: 0.25 })),
    { t: 4.6, kind: "whoosh", dur: 0.8 },
    ...PIECES.map((x) => ({ t: x.t + FLY, kind: "pluck", note: x.price - 100 + 2 })),
    { t: SORTED + 0.3, kind: "impact" },
    { t: 21.2, kind: "coin" },
    { t: 25.4, kind: "stamp" },
  ],
  draw(ctx, t) {
    const a = tw(t, 2.0, 2.6);
    const cam = camPath(t, [
      { t: 0, x: 780, y: 560, z: 1.05 },
      { t: 4.6, x: 780, y: 560, z: 1.05 },
      { t: 5.6, x: 960, y: 560, z: 1.0 },
      { t: 20.4, x: 960, y: 560, z: 1.0 },
      { t: 21.6, x: 1150, y: PY(101) + 60, z: 1.35 },
      { t: 24.8, x: 1150, y: PY(101) + 60, z: 1.35 },
      { t: 26.0, x: 960, y: 560, z: 1.0 },
    ]);
    const prof = profileAt(t);
    camera(ctx, cam, () => {
      priceGrid(ctx, t, { alpha: 0.3 * a, step: 90, oy: PY(101.5) + 45 });
      for (let p = 100; p <= 103; p++) {
        line(ctx, 340, PY(p), 1700, PY(p), C.line, 1, a * 0.6);
        text(ctx, String(p), 320, PY(p), {
          family: F.mono,
          size: 24,
          weight: 600,
          color: p === 101 && t > SORTED ? C.gold : C.muted,
          align: "right",
          base: "middle",
          alpha: a,
        });
      }
      text(ctx, "按時間：每分鐘成交量", 400, 110, { family: F.tc, size: 26, weight: 800, color: C.text, alpha: a });
      text(ctx, "按價格：成交量分布", PX0, 110, {
        family: F.tc,
        size: 26,
        weight: 800,
        color: C.gold,
        alpha: a * tw(t, 4.8, 5.4),
      });
      line(ctx, 380, VB, 1060, VB, C.line, 2, a);
      MIN.forEach((m, i) => {
        const x = XS[i];
        const ps = m.seq.map((s) => s[0]);
        candle(ctx, x, 40, PY(ps[0]), PY(Math.max(...ps)), PY(Math.min(...ps)), PY(ps.at(-1)), {
          alpha: a * 0.9,
          wickWidth: 3,
        });
        const total = m.seq.reduce((s, q) => s + q[1], 0);
        // Remaining (pending) segments stacked in the bar.
        let y = VB;
        let rem = 0;
        m.seq.forEach(([price, qty], j) => {
          const piece = PIECES.find(
            (q) => q.i === i && q.price === price && q.base === m.seq.slice(0, j).reduce((s, v) => s + v[1], 0),
          );
          const h = qty * VS;
          if (t < piece.t) {
            ctx.save();
            ctx.globalAlpha = a;
            rrect(ctx, x - 40, y - h + 2, 80, h - 2, 4);
            ctx.fillStyle = rgba(C.teal, 0.55);
            ctx.fill();
            ctx.restore();
            rem += qty;
          } else {
            ctx.save();
            ctx.globalAlpha = a * 0.5;
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = C.dim;
            rrect(ctx, x - 40, y - h + 2, 80, h - 2, 4);
            ctx.stroke();
            ctx.restore();
          }
          y -= h;
        });
        text(ctx, `${rem} / ${total}`, x, VB - total * VS - 18, {
          family: F.display,
          size: 30,
          weight: 700,
          color: C.text,
          align: "center",
          alpha: a,
        });
        text(ctx, m.label, x, VB + 34, {
          family: F.mono,
          size: 20,
          weight: 600,
          color: C.muted,
          align: "center",
          alpha: a,
        });
      });
      // Profile bars.
      for (let p = 100; p <= 103; p++) {
        const v = prof[p];
        const poc = p === 101 && t > SORTED;
        ctx.save();
        ctx.globalAlpha = a;
        rrect(ctx, PX0, PY(p) - 32, Math.max(0, v * HS), 64, 6);
        ctx.fillStyle = rgba(poc ? C.gold : C.teal, poc ? 0.85 : 0.55);
        if (poc) {
          ctx.shadowColor = C.gold;
          ctx.shadowBlur = 20 + pulse(t, SORTED + 0.3, 2) * 30;
        }
        ctx.fill();
        ctx.restore();
        if (v > 0)
          text(ctx, String(v), PX0 + v * HS + 14, PY(p) + 1, {
            family: F.display,
            size: 34,
            weight: 700,
            color: poc ? C.gold : C.text,
            base: "middle",
            alpha: a,
          });
      }
      line(ctx, PX0, PY(103.6), PX0, PY(99.6), C.muted, 2, a * tw(t, 4.8, 5.4));
      // Moving pieces.
      for (const x of PIECES) {
        const p = prog(t, x.t, x.t + FLY);
        if (p <= 0 || p >= 1) continue;
        const e = ease.inOutCubic(p);
        const sx = XS[x.i] - 40;
        const sy = VB - (x.base + x.qty) * VS;
        const tx = PX0 + prof[x.price] * HS;
        const ty = PY(x.price) - 32;
        const w = lerp(80, x.qty * HS, e);
        const h = lerp(x.qty * VS, 64, e);
        const cx = lerp(sx, tx, e);
        const cy = lerp(sy, ty, e) - Math.sin(e * Math.PI) * 80;
        ctx.save();
        rrect(ctx, cx, cy, w, h, 6);
        ctx.fillStyle = rgba(C.gold, 0.9);
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 24;
        ctx.fill();
        ctx.restore();
        text(ctx, `${x.price} × ${x.qty}`, cx + w / 2, cy - 16, {
          family: F.display,
          size: 28,
          weight: 700,
          color: C.gold,
          align: "center",
        });
      }
      // POC label.
      const pa = tw(t, SORTED + 0.3, SORTED + 0.8);
      if (pa > 0)
        tag(ctx, "POC · 成交最多的價位", PX0 + 60 * HS + 90, PY(101), {
          color: C.gold,
          solid: true,
          alpha: pa,
          size: 26,
        });
    });
    // Conservation strip.
    const c = counts(t);
    const sa = tw(t, 5.0, 5.4) * (1 - tw(t, 20.4, 20.8));
    if (sa > 0)
      tag(ctx, `待歸類 ${c.pending} + 移動中 ${c.moving} + 已歸類 ${c.sorted} = 140`, W / 2, 990, {
        align: "center",
        color: C.text,
        alpha: sa,
        size: 26,
      });
    statement(ctx, t, 25.4, [{ text: "同一批成交，換成按價格來數。", size: 52 }], { y: 215 });
    titleCard(ctx, t, {
      num: "13",
      kicker: "CONCEPT 13 · VOLUME PROFILE",
      title: "成交量分布圖",
      sub: "把量放回價格",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
