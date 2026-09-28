// C08 成交量 — trades drop into a time bar; compare against same-length bars.
// VOLUME-LESSON-PLAN: 14:27–14:29 volumes 24/30/36 (average 30); 14:30 trades
// buy 20@101, sell 15@100, buy 25@102 → 60 (2×), OHLC 101/102/100/102; 14:31 = 15
// (0.5×). 80 resting units are not volume. Bar colour follows open/close only.
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
import { titleCard, priceGrid, floatChip, camera, camPath, statement, tag, legend } from "../kit.js";

const PY = (p) => 400 - (p - 100.5) * 74;
const VB = 880; // volume baseline
const VS = 5; // px per unit
const XS = [560, 760, 960, 1160, 1360];
const BARS = [
  { label: "14:27", o: 100, h: 101, l: 99, c: 101, v: 24 },
  { label: "14:28", o: 101, h: 102, l: 100, c: 100, v: 30 },
  { label: "14:29", o: 100, h: 101, l: 99, c: 101, v: 36 },
  { label: "14:30", o: 101, h: 102, l: 100, c: 102, v: 60 },
  { label: "14:31", o: 102, h: 102, l: 100, c: 101, v: 15 },
];
const TR = [
  { t: 5.6, side: "buy", price: 101, qty: 20 },
  { t: 8.0, side: "sell", price: 100, qty: 15 },
  { t: 10.4, side: "buy", price: 102, qty: 25 },
];
const REPLAY = 4.6;
const BACK = 15.4;

function selected(t) {
  if (t < REPLAY || t >= BACK) return { ...BARS[3], vis: BARS[3].v };
  const done = TR.filter((x) => x.t <= t);
  if (!done.length) return { ...BARS[3], o: null, v: 0, vis: 0 };
  const ps = done.map((x) => x.price);
  let vis = 0;
  for (const x of done) vis += x.qty * ease.outCubic(prog(t, x.t, x.t + 0.4));
  return {
    label: "14:30",
    o: 101,
    h: Math.max(...ps),
    l: Math.min(...ps),
    c: ps.at(-1),
    v: done.reduce((s, x) => s + x.qty, 0),
    vis,
  };
}

function bar(ctx, x, b, a, o = {}) {
  if (a <= 0) return;
  const up = b.c >= b.o;
  const col = up ? C.buy : C.sell;
  if (b.o != null)
    candle(ctx, x, 54, PY(b.o), PY(b.h), PY(b.l), PY(b.c), {
      color: col,
      alpha: a,
      wickWidth: 3,
      minBody: 6,
      glow: o.glow,
    });
  const v = b.vis ?? b.v;
  ctx.save();
  ctx.globalAlpha = a;
  rrect(ctx, x - 40, VB - v * VS, 80, v * VS, 6);
  ctx.fillStyle = rgba(col, 0.55 + (o.hl ?? 0) * 0.3);
  ctx.fill();
  ctx.restore();
  text(ctx, String(b.v), x, VB - v * VS - 18, {
    family: F.display,
    size: 36,
    weight: 700,
    color: C.text,
    align: "center",
    alpha: a * (b.v > 0 ? 1 : 0),
  });
  text(ctx, b.label, x, VB + 36, {
    family: F.mono,
    size: 22,
    weight: 600,
    color: o.labelColor ?? C.muted,
    align: "center",
    alpha: a,
  });
}

export const lesson = {
  id: "volume",
  title: "成交量",
  duration: 30,
  description:
    "五根一分鐘 K 線與量柱。回看 14:30：買入 20、賣出 15、買入 25，量柱從 20、35 到 60；等待中的 80 隻掛單不算成交量。以前三根均量 30 為基準，60 是兩倍，下一根 15 是一半。",
  note: "量柱記錄成交，\n比較要有基準。",
  footer: "量柱統計同樣一分鐘內的成交隻數；本課柱色跟隨 K 線開收，不代表主動買賣量。",
  audio: "./motion/audio/volume.m4a",
  music: {
    palette: "deep",
    key: 3,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 5.2, level: 2 },
      { t: 12, level: 1 },
      { t: 17, level: 2 },
      { t: 25.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "價格與成交量" },
    { t: 4.6, label: "成交，落進量柱" },
    { t: 12.2, label: "掛單不是成交量" },
    { t: 15.4, label: "用相同時間比較" },
  ],
  captions: [
    { a: 2.4, b: 4.5, text: "K 線記價格，量柱記成交數量。" },
    { a: 4.6, b: 7.9, text: "回看 14:30：買入 20 隻，量柱到 20。" },
    { a: 8.0, b: 10.3, text: "賣出 15 隻也是成交：量柱到 35。" },
    { a: 10.4, b: 12.1, text: "再買 25 隻：這分鐘成交 60 隻。" },
    { a: 12.2, b: 15.3, text: "等待中的 80 隻掛單，不算成交量。" },
    { a: 15.4, b: 20.9, text: "前三根均量 30：60 是它的兩倍。" },
    { a: 21.0, b: 25.4, text: "同一個基準，下一根 15 只有一半。" },
    { a: 25.5, b: 30, text: "相同時間，成交更多，就是放量。" },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    ...XS.map((_, i) => ({ t: 2.3 + i * 0.12, kind: "blip", vel: 0.25 })),
    { t: 3.9, kind: "whoosh", dur: 0.8 },
    { t: REPLAY, kind: "drain", dur: 0.4 },
    ...TR.map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side })),
    { t: 12.3, kind: "blip", freq: 700 },
    { t: BACK, kind: "whoosh", dur: 1 },
    { t: 17.6, kind: "swell", dur: 1.2 },
    { t: 19.0, kind: "coin" },
    { t: 22.0, kind: "drain", dur: 0.4 },
    { t: 26.0, kind: "stamp" },
  ],
  draw(ctx, t) {
    const a = tw(t, 2.0, 2.6);
    const cam = camPath(t, [
      { t: 0, x: 960, y: 590, z: 1.12 },
      { t: 3.9, x: 960, y: 590, z: 1.12 },
      { t: 4.9, x: 1160, y: 560, z: 1.4 },
      { t: BACK, x: 1160, y: 560, z: 1.4 },
      { t: BACK + 1.3, x: 930, y: 600, z: 1.08 },
    ]);
    const sel = selected(t);
    camera(ctx, cam, () => {
      priceGrid(ctx, t, { alpha: 0.35 * a, step: 74, oy: PY(100.5) });
      text(ctx, "價格", 420, PY(102.6), { family: F.tc, size: 22, weight: 700, color: C.muted, alpha: a });
      text(ctx, "成交量（隻）", 420, VB - 330, { family: F.tc, size: 22, weight: 700, color: C.muted, alpha: a });
      for (let p = 99; p <= 102; p++)
        text(ctx, String(p), 1480, PY(p), {
          family: F.mono,
          size: 20,
          weight: 500,
          color: C.dim,
          base: "middle",
          alpha: a,
        });
      line(ctx, 440, VB, 1450, VB, C.line, 2, a);
      BARS.forEach((b, i) => {
        if (i === 3) return;
        const pop = tw(t, 2.1 + i * 0.12, 2.6 + i * 0.12);
        const away = tw(t, 3.9, 4.8) * (1 - tw(t, BACK, BACK + 1));
        const hide = i === 4 ? 1 - tw(t, 12, 12.4) * (1 - tw(t, 15, 15.4)) : 1;
        bar(ctx, XS[i], { ...b, vis: b.v * ease.outCubic(pop) }, pop * (1 - 0.8 * away) * hide);
      });
      bar(ctx, XS[3], sel, tw(t, 2.45, 2.95), { labelColor: C.gold, glow: 12 });
      const rp = tw(t, REPLAY - 0.2, REPLAY) * (1 - tw(t, REPLAY + 0.8, REPLAY + 1.4));
      if (rp > 0) tag(ctx, "回看 14:30", XS[3], PY(103.2), { align: "center", color: C.gold, alpha: rp });
      // Trade chips fall into the bar.
      for (const x of TR) {
        if (t < REPLAY || t >= BACK) continue;
        const buy = x.side === "buy";
        const p = prog(t, x.t - 0.6, x.t);
        if (p > 0 && p < 1) {
          const e = ease.inOutCubic(p);
          tag(
            ctx,
            `${buy ? "主動買入" : "主動賣出"} ${x.qty}`,
            lerp(XS[3] + 300, XS[3], e),
            lerp(PY(x.price), VB - 40, e * e),
            { align: "center", color: buy ? C.buy : C.sell, solid: true, size: 22 },
          );
        }
        burst(ctx, XS[3], VB - sel.v * VS, t, x.t, {
          n: 16,
          speed: 300,
          seed: x.qty,
          color: buy ? C.buy : C.sell,
          flare: 70,
        });
        floatChip(ctx, `+${x.qty}`, XS[3] + 90, VB - sel.v * VS, t, x.t + 0.1, { color: C.gold, size: 32 });
        burst(ctx, XS[3], PY(x.price), t, x.t, {
          n: 10,
          speed: 220,
          seed: x.price,
          color: buy ? C.buy : C.sell,
          flare: 50,
        });
      }
      // Waiting orders are not volume.
      const wA = tw(t, 12.2, 12.6) * (1 - tw(t, 15.0, 15.4));
      if (wA > 0) {
        const x = XS[3] + 120;
        ctx.save();
        ctx.globalAlpha = wA;
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 2;
        rrect(ctx, x, VB - 80 * VS, 70, 80 * VS, 6);
        ctx.stroke();
        ctx.restore();
        text(ctx, "掛單 80", x + 35, VB - 80 * VS - 18, {
          family: F.display,
          size: 30,
          weight: 700,
          color: C.muted,
          align: "center",
          alpha: wA,
        });
        line(ctx, x - 6, VB - 80 * VS - 50, x + 76, VB + 6, "#ff6b61", 4, wA * tw(t, 13, 13.4));
        tag(ctx, "等待中，不算成交", x + 100, VB - 220, { color: "#ff8a7f", alpha: wA * tw(t, 13, 13.4), size: 22 });
      }
      // Baseline.
      const bA = tw(t, 17.0, 17.6);
      if (bA > 0) {
        const y = VB - 30 * VS;
        line(ctx, XS[0] - 60, y, lerp(XS[0] - 60, XS[4] + 60, tw(t, 17, 18, ease.outCubic)), y, C.gold, 3, bA, [12, 8]);
        tag(ctx, "前三根均量 30", XS[0] - 76, y, { align: "right", color: C.gold, alpha: bA, size: 24 });
        text(ctx, "(24+30+36)÷3", XS[0] - 76, y + 40, {
          family: F.mono,
          size: 18,
          weight: 500,
          color: C.muted,
          align: "right",
          alpha: bA,
        });
      }
      const x2 = tw(t, 18.6, 19.0);
      if (x2 > 0) {
        tag(ctx, "2 倍", XS[3] + 70, VB - 45 * VS, { color: C.buy, alpha: x2, size: 30, solid: true });
        line(ctx, XS[3] + 50, VB - 30 * VS, XS[3] + 50, VB - 60 * VS, C.buy, 3, x2);
      }
      const x3 = tw(t, 21.8, 22.2);
      if (x3 > 0)
        tag(ctx, "0.5 倍", XS[4] + 50, VB - 15 * VS - 30, { color: C.sell, alpha: x3, size: 30, solid: true });
    });
    legend(
      ctx,
      140,
      150,
      [
        { color: C.buy, label: "收 ≥ 開" },
        { color: C.sell, label: "收 < 開（柱色依設定，不等於主動買賣量）" },
      ],
      { alpha: tw(t, 23, 23.6) * 0.9 },
    );
    statement(ctx, t, 26, [{ text: "相同時間，成交更多，就是放量。", size: 52 }], { y: 200 });
    titleCard(ctx, t, {
      num: "08",
      kicker: "CONCEPT 08 · VOLUME",
      title: "成交量",
      sub: "成交量與比較基準",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
