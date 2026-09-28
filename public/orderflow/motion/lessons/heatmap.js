// C03 熱力圖 — resting orders leave bands over time; trades leave dots.
// Numbers follow HEATMAP-LESSON-PLAN: bids 100×30, 99×45, 98×20; asks 101×20,
// 102×40, 103×25, 104×15. Market 8 s sell 8@100; 16 s, 20 s buy 10@101;
// 30 s add 40@102 (→80); 40 s buy 25@102 (→55); 50 s cancel 40 (→15).
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
import { titleCard, priceGrid, floatChip, camera, camPath, statement, tag, legend } from "../kit.js";

const PY = (p) => 540 - (p - 101) * 74;
const X0 = 300;
const X1 = 1360; // heatmap time axis 0–60 market seconds
const BOOK = 1410; // current book bars start
const MX = (m) => lerp(X0, X1, m / 60);

// Scene time → market seconds.
const KEYS = [
  [2.4, 0],
  [7.5, 25],
  [9.0, 30],
  [14.0, 40],
  [19.5, 50],
  [24.6, 60],
];
function market(t) {
  if (t <= KEYS[0][0]) return 0;
  for (let i = 1; i < KEYS.length; i++)
    if (t <= KEYS[i][0]) return lerp(KEYS[i - 1][1], KEYS[i][1], (t - KEYS[i - 1][0]) / (KEYS[i][0] - KEYS[i - 1][0]));
  return 60;
}
function sceneT(m) {
  for (let i = 1; i < KEYS.length; i++)
    if (m <= KEYS[i][1]) return lerp(KEYS[i - 1][0], KEYS[i][0], (m - KEYS[i - 1][1]) / (KEYS[i][1] - KEYS[i - 1][1]));
  return KEYS.at(-1)[0];
}

const TRADES = [
  { m: 8, side: "sell", price: 100, qty: 8 },
  { m: 16, side: "buy", price: 101, qty: 10 },
  { m: 20, side: "buy", price: 101, qty: 10 },
  { m: 40, side: "buy", price: 102, qty: 25 },
].map((tr) => ({ ...tr, t: sceneT(tr.m) }));

/** Visible depth at market second m: { price: [side, qty] }. */
function book(m) {
  const b = {
    100: ["bid", 30],
    99: ["bid", 45],
    98: ["bid", 20],
    101: ["ask", 20],
    102: ["ask", 40],
    103: ["ask", 25],
    104: ["ask", 15],
  };
  if (m >= 8) b[100][1] -= 8;
  if (m >= 16) b[101][1] -= 10;
  if (m >= 20) b[101][1] -= 10;
  if (m >= 30) b[102][1] += 40;
  if (m >= 40) b[102][1] -= 25;
  if (m >= 50) b[102][1] -= 40;
  return b;
}
function lastPrice(m) {
  let p = 101;
  for (const tr of TRADES) if (tr.m <= m) p = tr.price;
  return p;
}
function heat(q) {
  const u = clamp(q / 80);
  return u < 0.5 ? hexMix("#123a44", C.teal, u / 0.5) : hexMix(C.teal, "#f6fffc", (u - 0.5) / 0.5);
}

export const lesson = {
  id: "heatmap",
  title: "熱力圖",
  duration: 30,
  description:
    "熱力圖橫向是時間、縱向是價格，色帶亮度是當時可見掛單量。102 元新增 40 隻賣單變亮，成交 25 隻留下圓點，撤單 40 隻只變暗、沒有圓點。",
  note: "色帶是等待，\n圓點是成交。",
  footer: "色帶亮度只看當時可見的掛單量（本課 0–80 隻）；圓點大小代表成交量。",
  audio: "./motion/audio/heatmap.m4a",
  music: {
    palette: "glass",
    key: 2,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 9, level: 2 },
      { t: 24.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "掛單留下時間軌跡" },
    { t: 7.5, label: "掛單越多，色帶越亮" },
    { t: 14, label: "成交與撤單的差別" },
    { t: 24.6, label: "回到完整熱力圖" },
  ],
  captions: [
    { a: 2.4, b: 7.4, text: "每一刻的掛單，都會留下色帶。" },
    { a: 7.5, b: 8.9, text: "橫向是時間，縱向是價格。" },
    { a: 9.0, b: 13.9, text: "102 元新增掛賣 40 隻：色帶變亮。" },
    { a: 14.0, b: 19.4, text: "成交 25 隻：掛單剩 55，留下圓點。" },
    { a: 19.5, b: 24.5, text: "撤單 40 隻：變暗了，卻沒有成交。" },
    { a: 24.6, b: 30, text: "色帶是掛單，圓點是成交。" },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    { t: 2.4, kind: "swell", dur: 4 },
    ...TRADES.map((tr) => ({ t: tr.t, kind: "fill", price: tr.price, side: tr.side, soft: tr.m < 30 })),
    { t: 7.5, kind: "whoosh", dur: 0.8 },
    { t: 9.0, kind: "rise", dur: 0.5 },
    { t: 19.5, kind: "drain", dur: 0.6 },
    { t: 24.6, kind: "whoosh", dur: 1 },
    { t: 26.2, kind: "stamp" },
  ],
  draw(ctx, t) {
    const m = market(t);
    const stageA = tw(t, 2.0, 2.6);
    const cam = camPath(t, [
      { t: 0, x: W / 2, y: PY(101), z: 0.9 },
      { t: 7.5, x: W / 2, y: PY(101), z: 0.9 },
      { t: 8.8, x: 1230, y: PY(102), z: 1.55 },
      { t: 24.4, x: 1230, y: PY(102), z: 1.55 },
      { t: 25.9, x: W / 2, y: PY(101.2), z: 0.86 },
    ]);
    const b = book(m);
    const last = lastPrice(m);
    camera(ctx, cam, () => {
      priceGrid(ctx, t, { alpha: 0.4 * stageA, step: 66, oy: PY(101) + 37 });
      // Heat columns up to "now".
      const cols = 120;
      const cw = (X1 - X0) / cols;
      const upto = (m / 60) * cols;
      for (let i = 0; i < Math.ceil(upto); i++) {
        const mm = ((i + 0.5) / cols) * 60;
        const reveal = clamp(upto - i);
        const bb = book(mm);
        for (const [p, [side, q]] of Object.entries(bb)) {
          if (q <= 0) continue;
          const u = clamp(q / 80);
          ctx.fillStyle = rgba(
            side === "bid" ? heat(q) : hexMix(heat(q), C.gold, 0.25),
            (0.14 + 0.86 * u) * reveal * stageA,
          );
          ctx.fillRect(X0 + i * cw, PY(Number(p)) - 26, cw - 0.5, 52);
        }
      }
      // Axes.
      for (let p = 97; p <= 105; p++)
        text(ctx, String(p), X0 - 34, PY(p), {
          family: F.mono,
          size: 22,
          weight: p === last ? 700 : 500,
          color: p === last ? C.gold : C.dim,
          align: "right",
          base: "middle",
          alpha: stageA,
        });
      [0, 15, 30, 45, 60].forEach((s) =>
        text(ctx, `14:30:${String(s % 60).padStart(2, "0")}${s === 60 ? "→" : ""}`, MX(s), PY(96.3), {
          family: F.mono,
          size: 18,
          weight: 500,
          color: C.dim,
          align: "center",
          alpha: stageA,
        }),
      );
      text(ctx, "時間 →", X1, PY(95.6), {
        family: F.tc,
        size: 20,
        weight: 600,
        color: C.muted,
        align: "right",
        alpha: stageA * 0.8,
      });
      // "Now" line.
      const nx = MX(m);
      if (t > 2.4 && m < 60) {
        line(ctx, nx, PY(105.5), nx, PY(96.7), C.white, 1.5, 0.35 * stageA);
        glow(ctx, nx, PY(last), 30, C.white, 0.5);
      }
      // Last-price trace.
      ctx.save();
      ctx.strokeStyle = rgba(C.white, 0.9 * stageA);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let prev = lastPrice(0);
      ctx.moveTo(MX(0), PY(prev));
      for (const tr of TRADES) {
        if (tr.m > m) break;
        ctx.lineTo(MX(tr.m), PY(prev));
        ctx.lineTo(MX(tr.m), PY(tr.price));
        prev = tr.price;
      }
      if (t > 2.4) ctx.lineTo(nx, PY(prev));
      ctx.stroke();
      ctx.restore();
      // Trade dots.
      for (const tr of TRADES) {
        if (tr.m > m) continue;
        const r = 8 + tr.qty * 0.9;
        const pop = ease.outBack(prog(t, tr.t, tr.t + 0.35));
        ctx.save();
        ctx.globalAlpha = stageA;
        ctx.beginPath();
        ctx.arc(MX(tr.m), PY(tr.price), r * pop, 0, Math.PI * 2);
        ctx.fillStyle = rgba(tr.side === "buy" ? C.buy : C.sell, 0.85);
        ctx.fill();
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        ring(ctx, MX(tr.m), PY(tr.price), t, tr.t, { r1: 90, color: C.white, w: 2 });
        if (tr.m === 40)
          floatChip(ctx, "成交 25", MX(tr.m), PY(tr.price) - 50, t, tr.t, { color: C.buy, size: 30, dur: 1.6 });
      }
      // Current book (right).
      text(ctx, "此刻的掛單", BOOK, PY(105.7), { family: F.tc, size: 22, weight: 700, color: C.muted, alpha: stageA });
      for (const [p, [side, q]] of Object.entries(b)) {
        const y = PY(Number(p));
        const w = q * 3.2;
        ctx.save();
        ctx.globalAlpha = stageA;
        rrect(ctx, BOOK, y - 20, Math.max(0, w), 40, 6);
        ctx.fillStyle = rgba(side === "bid" ? C.buy : C.sell, Number(p) === 102 ? 0.85 : 0.5);
        ctx.fill();
        ctx.restore();
        if (q > 0)
          text(ctx, `${side === "bid" ? "買" : "賣"} ${q}`, BOOK + w + 12, y + 1, {
            family: F.display,
            size: 26,
            weight: 700,
            color: side === "bid" ? C.buy : C.sell,
            base: "middle",
            alpha: stageA,
          });
      }
      // Event labels at 102.
      const add = tw(t, 9, 9.3) * (1 - tw(t, 13.4, 13.8));
      if (add > 0) {
        tag(ctx, "新增掛賣 +40 → 80", MX(30), PY(103.2), { color: C.gold, alpha: add, size: 22 });
        glow(ctx, MX(30), PY(102), 70, C.white, pulse(t, 9, 3));
      }
      const cxl = tw(t, 19.5, 19.8) * (1 - tw(t, 24.2, 24.6));
      if (cxl > 0) {
        tag(ctx, "撤單 −40 → 15 · 沒有圓點", MX(50) + 30, PY(103.5), {
          align: "right",
          color: C.sell,
          alpha: cxl,
          size: 22,
        });
        ring(ctx, MX(50), PY(102), t, 19.5, { r1: 70, color: C.sell, w: 2, dur: 0.6 });
      }
    });
    legend(
      ctx,
      140,
      930,
      [
        { color: C.teal, label: "色帶：掛單量（越亮越多）" },
        { color: C.white, label: "白線：最新成交價" },
        { color: C.buy, label: "圓點：成交" },
      ],
      { alpha: tw(t, 25.8, 26.4) * 0.9 },
    );
    statement(ctx, t, 26.2, [{ text: "色帶是掛單，圓點是成交。", size: 56 }], { y: 150 });
    titleCard(ctx, t, {
      num: "03",
      kicker: "CONCEPT 03 · HEATMAP",
      title: "熱力圖",
      sub: "掛單的時間軌跡",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
