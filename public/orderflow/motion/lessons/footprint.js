// C02 足跡圖 — a footprint splits each price row into two cells: left =
// aggressive-sell volume, right = aggressive-buy volume. Numbers follow
// FOOTPRINT-LESSON-PLAN: 14:30 trades 20B@101, 15B@101, 12S@100, 8S@101,
// 10B@102, 4S@101, 5B@102 → 100: 12|0, 101: 12|35, 102: 0|15.
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
  fmt,
} from "../core.js";
import { titleCard, priceGrid, floatChip, camera, camPath, statement, scrim, tag, legend } from "../kit.js";

const PY = (p) => 540 - (p - 101) * 64;
const SPACING = 330;
const X = (i) => W / 2 + (i - 2) * SPACING;
const CELL = 112;
const ROW = 54;

const CONTEXT = [
  { label: "14:28", o: 99, h: 100, l: 98, c: 100, rows: { 98: [6, 2], 99: [10, 14], 100: [4, 9] } },
  { label: "14:29", o: 100, h: 101, l: 99, c: 99, rows: { 99: [12, 5], 100: [15, 8], 101: [3, 6] } },
  null,
  { label: "14:31", o: 102, h: 104, l: 102, c: 103, rows: { 102: [4, 10], 103: [8, 22], 104: [5, 3] } },
  { label: "14:32", o: 103, h: 104, l: 102, c: 102, rows: { 102: [14, 4], 103: [11, 7], 104: [2, 1] } },
];
const TRADES = [
  { t: 5.6, side: "buy", price: 101, qty: 20 },
  { t: 7.4, side: "buy", price: 101, qty: 15 },
  { t: 9.2, side: "sell", price: 100, qty: 12 },
  { t: 11.8, side: "sell", price: 101, qty: 8 },
  { t: 13.8, side: "buy", price: 102, qty: 10 },
  { t: 15.6, side: "sell", price: 101, qty: 4 },
  { t: 17.4, side: "buy", price: 102, qty: 5 },
];
const REPLAY = 4.6; // selected minute is cleared and replayed from here
const ZOOM_OUT = 24.2;

function selected(t) {
  const rows = {};
  let o = null;
  let h = -Infinity;
  let l = Infinity;
  let c = null;
  const replaying = t >= REPLAY && t < ZOOM_OUT;
  for (const tr of TRADES) {
    if (replaying && tr.t > t) break;
    rows[tr.price] ??= [0, 0];
    rows[tr.price][tr.side === "sell" ? 0 : 1] += tr.qty;
    o ??= tr.price;
    h = Math.max(h, tr.price);
    l = Math.min(l, tr.price);
    c = tr.price;
  }
  return { rows, o, h, l, c, label: "14:30" };
}

function footprint(ctx, x, d, t, o = {}) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const maxV = 40;
  for (let p = 98; p <= 104; p++) {
    const [sv, bv] = d.rows[p] ?? [0, 0];
    const y = PY(p);
    const hl = o.highlight === p ? o.hl : 0;
    const dim = o.focusRow != null && o.focusRow !== p ? 1 - 0.6 * (o.hl ?? 0) : 1;
    const cells = [
      [x - 20 - CELL, sv, C.sell, "sell"],
      [x + 20, bv, C.buy, "buy"],
    ];
    for (const [cx, v, col, side] of cells) {
      const fl = (o.flash?.[`${p}:${side}`] ?? 0) * a;
      const heat = clamp(v / maxV);
      ctx.save();
      ctx.globalAlpha = a * dim;
      rrect(ctx, cx, y - ROW / 2, CELL, ROW - 4, 8);
      ctx.fillStyle = rgba(col, 0.05 + heat * 0.42 + fl * 0.35);
      ctx.fill();
      ctx.strokeStyle = rgba(col, 0.22 + fl * 0.7 + hl * 0.6);
      ctx.lineWidth = 1.2 + hl * 1.5;
      ctx.stroke();
      ctx.restore();
      if (v > 0 || o.showZero)
        text(ctx, v ? String(v) : "0", cx + CELL / 2, y - 1, {
          family: F.display,
          size: 34,
          weight: 700,
          align: "center",
          base: "middle",
          color: v ? C.text : C.dim,
          alpha: a * dim,
          glow: fl * 20,
          glowColor: col,
        });
    }
  }
  if (d.o != null) {
    const up = d.c >= d.o;
    candle(ctx, x, 16, PY(d.o), PY(d.h), PY(d.l), PY(d.c), {
      color: up ? C.buy : C.sell,
      alpha: a,
      wickWidth: 3,
      minBody: 6,
    });
  }
  text(ctx, d.label, x, PY(105) - 6, {
    family: F.mono,
    size: 22,
    weight: 600,
    align: "center",
    color: o.labelColor ?? C.muted,
    alpha: a,
  });
}

export const lesson = {
  id: "footprint",
  title: "足跡圖",
  duration: 30,
  description:
    "五根已完成的一分鐘足跡圖。放大 14:30 回看七筆成交：主動買入記在右格、主動賣出記在左格，101 元最後是左 12、右 35，再回到全景。",
  note: "價格留下形狀，\n成交留下足跡。",
  footer: "左格＝主動賣出成交量，右格＝主動買入成交量；每筆成交只記一次。",
  audio: "./motion/audio/footprint.m4a",
  music: {
    palette: "glass",
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 5.2, level: 2 },
      { t: 19, level: 1 },
      { t: 25.4, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "先看整段成交足跡" },
    { t: 4.6, label: "成交，留下數字" },
    { t: 11.5, label: "同一價位，兩邊的成交" },
    { t: 19, label: "讀懂一格，回到全景" },
  ],
  captions: [
    { a: 2.4, b: 4.5, text: "每根 K 線裡，都有成交足跡。" },
    { a: 4.6, b: 8.8, text: "回看 14:30：主動買入，記在右格。" },
    { a: 8.9, b: 11.4, text: "主動賣出，記在左格。" },
    { a: 11.5, b: 18.8, text: "同一價位，兩邊都能有成交。" },
    { a: 19, b: 23.9, text: "101 元：主動賣出 12 隻、主動買入 35 隻。" },
    { a: 24, b: 30, text: "數字是成交量，每筆只記一次。" },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    ...[0, 1, 3, 4].map((i) => ({ t: 2.3 + i * 0.12, kind: "blip", vel: 0.2 })),
    { t: 3.9, kind: "whoosh", dur: 0.9 },
    { t: 4.6, kind: "drain", dur: 0.4 },
    ...TRADES.map((tr) => ({ t: tr.t, kind: "fill", price: tr.price, side: tr.side })),
    { t: 19.2, kind: "swell", dur: 1.2 },
    { t: ZOOM_OUT, kind: "whoosh", dur: 1.0 },
    { t: 26, kind: "stamp" },
  ],
  draw(ctx, t) {
    const stageA = tw(t, 2.0, 2.6);
    const cam = camPath(t, [
      { t: 0, x: W / 2, y: PY(101), z: 0.84 },
      { t: 3.9, x: W / 2, y: PY(101), z: 0.84 },
      { t: 4.9, x: W / 2 + 90, y: PY(101), z: 1.3 },
      { t: 18.9, x: W / 2 + 90, y: PY(101), z: 1.3 },
      { t: 20, x: W / 2 + 60, y: PY(101), z: 1.55 },
      { t: ZOOM_OUT, x: W / 2 + 60, y: PY(101), z: 1.55 },
      { t: ZOOM_OUT + 1.6, x: W / 2, y: PY(101.6), z: 0.84 },
    ]);
    const hl = tw(t, 19.2, 19.7) * (1 - tw(t, ZOOM_OUT - 0.2, ZOOM_OUT + 0.3));
    const flash = {};
    for (const tr of TRADES) {
      const k = `${tr.price}:${tr.side}`;
      flash[k] = Math.max(flash[k] ?? 0, t >= REPLAY && t < ZOOM_OUT ? pulse(t, tr.t, 3) : 0);
    }
    const replayMark = tw(t, REPLAY - 0.3, REPLAY) * (1 - tw(t, REPLAY + 0.6, REPLAY + 1.4));
    camera(ctx, cam, () => {
      priceGrid(ctx, t, { alpha: 0.5 * stageA, step: 64, oy: PY(101) + 32 });
      for (let p = 98; p <= 104; p++)
        text(ctx, String(p), X(0) - 230, PY(p), {
          family: F.mono,
          size: 22,
          weight: 500,
          color: C.dim,
          align: "center",
          base: "middle",
          alpha: stageA,
        });
      CONTEXT.forEach((d, i) => {
        if (!d) return;
        const pop = tw(t, 2.1 + i * 0.12, 2.6 + i * 0.12);
        const away = tw(t, 3.9, 4.8) * (1 - tw(t, ZOOM_OUT, ZOOM_OUT + 1.2));
        footprint(ctx, X(i), d, t, { alpha: pop * (1 - away * 0.9) });
      });
      const sel = selected(t);
      const pop = tw(t, 2.3, 2.8);
      // Selection frame.
      const fa = pop * (1 - tw(t, 4.6, 5.0)) + tw(t, ZOOM_OUT + 1.2, ZOOM_OUT + 1.8) * 0.8;
      if (fa > 0) {
        ctx.save();
        ctx.globalAlpha = fa;
        ctx.strokeStyle = C.gold;
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        rrect(ctx, X(2) - 160, PY(104) - 40, 320, PY(98) - PY(104) + 80, 14);
        ctx.stroke();
        ctx.restore();
      }
      footprint(ctx, X(2), sel, t, {
        alpha: pop,
        flash,
        highlight: 101,
        focusRow: hl > 0 ? 101 : null,
        hl,
        labelColor: C.gold,
        showZero: t >= REPLAY && t < ZOOM_OUT && sel.o == null,
      });
      if (replayMark > 0)
        tag(ctx, "回看 14:30 · 從第一筆成交開始", X(2), PY(105.9), {
          align: "center",
          color: C.gold,
          alpha: replayMark,
          size: 22,
        });
      // Column headers.
      const hA = tw(t, 5.0, 5.4) * (1 - tw(t, ZOOM_OUT - 0.3, ZOOM_OUT + 0.2));
      text(ctx, "主動賣出", X(2) - 20 - CELL / 2, PY(97.4), {
        family: F.tc,
        size: 24,
        weight: 800,
        color: C.sell,
        align: "center",
        alpha: hA,
      });
      text(ctx, "主動買入", X(2) + 20 + CELL / 2, PY(97.4), {
        family: F.tc,
        size: 24,
        weight: 800,
        color: C.buy,
        align: "center",
        alpha: hA,
      });
      // Trades fly in from their side.
      for (const tr of TRADES) {
        const buy = tr.side === "buy";
        const p = prog(t, tr.t - 0.55, tr.t);
        const tx = buy ? X(2) + 20 + CELL / 2 : X(2) - 20 - CELL / 2;
        const sx = buy ? X(2) + 420 : X(2) - 420;
        if (p > 0 && p < 1 && t >= REPLAY && t < ZOOM_OUT) {
          const e = ease.inOutCubic(p);
          const x = lerp(sx, tx, e);
          const y = PY(tr.price) - Math.sin(e * Math.PI) * 60;
          tag(ctx, `${buy ? "立即買進" : "立即賣出"} ${tr.qty}`, x, y, {
            align: "center",
            color: buy ? C.buy : C.sell,
            solid: true,
            size: 22,
          });
        }
        if (t >= REPLAY && t < ZOOM_OUT) {
          burst(ctx, tx, PY(tr.price), t, tr.t, {
            n: 14,
            speed: 280,
            seed: tr.qty + tr.price,
            color: buy ? C.buy : C.sell,
            flare: 80,
          });
          floatChip(ctx, `+${tr.qty}`, tx + (buy ? 92 : -92), PY(tr.price), t, tr.t, {
            color: buy ? C.buy : C.sell,
            size: 32,
            rise: 36,
          });
        }
      }
      // Read one row.
      if (hl > 0) {
        const y = PY(101);
        line(ctx, X(2) + 20 + CELL + 12, y, X(2) + 20 + CELL + 60, y, C.gold, 1.5, hl);
        text(ctx, "101 元這一列", X(2) + 20 + CELL + 72, y - 18, {
          family: F.tc,
          size: 24,
          weight: 800,
          color: C.gold,
          base: "middle",
          alpha: hl,
        });
        text(ctx, "賣出 12 ｜ 買入 35", X(2) + 20 + CELL + 72, y + 18, {
          family: F.tc,
          size: 22,
          weight: 600,
          color: C.text,
          base: "middle",
          alpha: hl,
        });
      }
    });
    legend(
      ctx,
      140,
      1000,
      [
        { color: C.sell, label: "左：主動賣出成交量" },
        { color: C.buy, label: "右：主動買入成交量" },
      ],
      {
        alpha: tw(t, ZOOM_OUT + 1.4, ZOOM_OUT + 2.0) * 0.9,
      },
    );
    statement(ctx, t, ZOOM_OUT + 1.8, [{ text: "每根 K 線，都能這樣讀。", size: 56 }], { y: 180 });
    titleCard(ctx, t, {
      num: "02",
      kicker: "CONCEPT 02 · FOOTPRINT",
      title: "足跡圖",
      sub: "成交的足跡",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
