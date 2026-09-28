// S03 放量突破，怎樣才算站穩？ — breakout, pullback to 104 absorbed by bids, rally to 109.
// BREAKOUT-VOLUME-LESSON-PLAN: bars 0–4 vol 20 (Δ+10, high 104). Bar 5 O103 H106 L103
// C106 vol 120 (buy 110/sell 10). Bar 6 O106 H107 L105 C107 vol 120 (100/20). Bar 7
// O107 H107 L104 C104 vol 100 (10/90). Bar 8 O104 H105 L104 C104 vol 260 (20/240):
// 104 bids absorb 240 with refills 100/80/60. Bar 9 O105 H109 L105 C109 vol 180 (170/10).
// CVD closes 150, 230, 150, −70, 90; total volume 880.
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
  signed,
  shake,
} from "../core.js";
import { titleCard, priceGrid, floatChip, camera, camPath, statement, tag, panel } from "../kit.js";

const PY = (p) => 520 - (p - 105) * 54;
const X = (i) => 280 + i * 110;
const VB = 930;
const VS = 0.5;
const DOMX = 1580;
const HIST = [
  { o: 101, h: 102, l: 100, c: 102 },
  { o: 102, h: 103, l: 101, c: 102 },
  { o: 102, h: 104, l: 102, c: 103 },
  { o: 103, h: 104, l: 102, c: 102 },
  { o: 102, h: 104, l: 102, c: 103 },
].map((b) => ({ ...b, v: 20, d: 10 }));
const TR = [
  [7.9, 5, "buy", 103, 10],
  [8.6, 5, "buy", 104, 30],
  [9.3, 5, "buy", 105, 30],
  [10.0, 5, "sell", 105, 10],
  [10.7, 5, "buy", 106, 40],
  [12.8, 6, "buy", 106, 30],
  [13.5, 6, "sell", 105, 20],
  [14.2, 6, "buy", 107, 40],
  [15.0, 6, "buy", 107, 30],
  [16.9, 7, "buy", 107, 10],
  [17.5, 7, "sell", 106, 20],
  [18.1, 7, "sell", 105, 30],
  [18.8, 7, "sell", 104, 40],
  [20.0, 8, "sell", 104, 40],
  [21.2, 8, "sell", 104, 60],
  [21.9, 8, "sell", 104, 40],
  [22.4, 8, "buy", 105, 10],
  [23.5, 8, "sell", 104, 50],
  [24.2, 8, "sell", 104, 30],
  [25.0, 8, "buy", 105, 10],
  [25.8, 8, "sell", 104, 20],
  [27.5, 9, "buy", 105, 20],
  [28.1, 9, "buy", 106, 30],
  [28.8, 9, "sell", 106, 10],
  [29.4, 9, "buy", 107, 40],
  [30.1, 9, "buy", 108, 40],
  [30.9, 9, "buy", 109, 40],
].map(([t, bar, side, price, qty]) => ({ t, bar, side, price, qty }));
const ADDS104 = [
  [20.5, 100],
  [22.8, 80],
  [24.7, 60],
];
const REPLAY = 7.4;
const OUT = [32.6, 34.4];

function barsAt(t) {
  const out = HIST.map((b) => ({ ...b, vis: b.v }));
  const full = t < REPLAY || t >= OUT[0];
  for (let i = 5; i <= 9; i++) {
    const tr = TR.filter((x) => x.bar === i && (full || x.t <= t));
    if (!tr.length) {
      out.push(null);
      continue;
    }
    const ps = tr.map((x) => x.price);
    const buy = tr.filter((x) => x.side === "buy").reduce((s, x) => s + x.qty, 0);
    const sell = tr.filter((x) => x.side === "sell").reduce((s, x) => s + x.qty, 0);
    const vis = tr.reduce((s, x) => s + x.qty * (full ? 1 : ease.outCubic(prog(t, x.t, x.t + 0.35))), 0);
    out.push({ o: ps[0], h: Math.max(...ps), l: Math.min(...ps), c: ps.at(-1), v: buy + sell, d: buy - sell, vis });
  }
  return out;
}
const cvdAt = (t) =>
  50 +
  TR.filter((x) => t < REPLAY || t >= OUT[0] || x.t <= t).reduce((s, x) => s + (x.side === "buy" ? x.qty : -x.qty), 0);
function bid104(t) {
  if (t < REPLAY || t >= OUT[0]) return 40;
  let q = 80;
  for (const x of TR) if (x.side === "sell" && x.price === 104 && x.t <= t) q -= x.qty;
  for (const [ta, qa] of ADDS104) if (t >= ta) q += qa;
  return Math.max(0, q);
}
const lastPrice = (t) => (t < REPLAY || t >= OUT[0] ? 109 : (TR.filter((x) => x.t <= t).at(-1)?.price ?? 103));
const absorbed = (t) => TR.filter((x) => x.bar === 8 && x.side === "sell" && x.t <= t).reduce((s, x) => s + x.qty, 0);

export const lesson = {
  id: "breakout-volume",
  title: "放量突破，怎樣才算站穩？",
  duration: 38,
  description:
    "十根 K 線：放量突破 104、在上方成交，回踩到 104。回看回踩：104 的掛買一再補上，接住 240 隻主動賣出，低點不破 104；接著新的買單逐檔推到 109。",
  note: "回踩時賣得很多，\n掛買一再接住。",
  footer: "教學用合成行情：同一份帳本產生 K 線、量柱、CVD 與掛單；這是一個具體結果，不是「放量＋回踩必成功」的條件。",
  audio: "./motion/audio/breakout-volume.m4a",
  music: {
    palette: "lift",
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 7.6, level: 2 },
      { t: 16.6, level: 1 },
      { t: 19.6, level: 2 },
      { t: 27.2, level: 3 },
      { t: 31.4, level: 2 },
      { t: 34.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "十根完整行情" },
    { t: 7.4, label: "放量突破" },
    { t: 16.6, label: "回踩 104" },
    { t: 19.6, label: "掛買接住 240 隻賣出" },
    { t: 27.2, label: "買單再推到 109" },
  ],
  captions: [
    { a: 2.4, b: 7.3, text: "十根已完成的 K 線：突破、回踩 104，再走到 109。" },
    { a: 7.4, b: 12.3, text: "回看突破那一根：成交 120 隻，是前五根均量的 6 倍。" },
    { a: 12.4, b: 16.5, text: "突破後，上方繼續成交，收在 107。" },
    { a: 16.6, b: 19.5, text: "主動賣出把價格壓回 104。" },
    { a: 19.6, b: 27.1, text: "賣了 240 隻，104 的掛買一再補上：低點沒有跌破。" },
    { a: 27.2, b: 32.5, text: "新的買單逐檔成交，一路推到 109。" },
    { a: 32.6, b: 38, text: "站穩的關鍵：回踩時，賣單有人接住。" },
  ],
  flashes: [
    { t: 10.7, amt: 0.25, decay: 8 },
    { t: 30.9, amt: 0.3, decay: 7 },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    ...Array.from({ length: 10 }, (_, i) => ({ t: 2.3 + i * 0.12, kind: "blip", vel: 0.22 })),
    { t: 6.2, kind: "whoosh", dur: 1.2 },
    { t: REPLAY, kind: "drain", dur: 0.4 },
    ...TR.map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side, soft: x.bar === 8 })),
    { t: 10.7, kind: "impact" },
    ...ADDS104.map(([t]) => ({ t, kind: "rise", dur: 0.4 })),
    { t: 25.9, kind: "stamp" },
    { t: 30.9, kind: "impact", big: true },
    { t: OUT[0], kind: "whoosh", dur: 1.6 },
    { t: 34.8, kind: "stamp" },
  ],
  draw(ctx, t) {
    const a = tw(t, 2.0, 2.6);
    const bars = barsAt(t);
    const last = lastPrice(t);
    const cam = camPath(t, [
      { t: 0, x: 1040, y: 560, z: 0.95 },
      { t: 6.2, x: 1040, y: 560, z: 0.95 },
      { t: 7.4, x: 1230, y: 570, z: 1.14 },
      { t: OUT[0], x: 1230, y: 570, z: 1.14 },
      { t: OUT[1], x: 1040, y: 600, z: 0.95 },
    ]);
    const [sx, sy] = shake(t, 30.9, 10, 0.45, 4);
    camera(ctx, { ...cam, sx, sy }, () => {
      priceGrid(ctx, t, { alpha: 0.3 * a, step: 54, oy: PY(105) });
      for (let p = 100; p <= 110; p++) {
        line(ctx, 220, PY(p), 1530, PY(p), C.line, 1, a * 0.35);
        text(ctx, String(p), DOMX, PY(p), {
          family: F.mono,
          size: 20,
          weight: p === last ? 700 : 500,
          color: p === last ? C.gold : C.muted,
          align: "center",
          base: "middle",
          alpha: a,
        });
      }
      // 104 level highlight.
      const lv = tw(t, 3.2, 3.8) * (1 - tw(t, 7.2, 7.6)) + tw(t, 16.8, 17.3) * (1 - tw(t, 27.0, 27.6));
      if (lv > 0) {
        line(ctx, X(0) - 40, PY(104) + 6, DOMX - 40, PY(104) + 6, C.buy, 2.5, lv, [10, 8]);
        text(ctx, "104", X(0) - 50, PY(104) + 6, {
          family: F.display,
          size: 30,
          weight: 700,
          color: C.buy,
          align: "right",
          base: "middle",
          alpha: lv,
        });
      }
      bars.forEach((b, i) => {
        const pop = tw(t, 2.2 + i * 0.12, 2.7 + i * 0.12);
        if (!b) {
          ctx.save();
          ctx.globalAlpha = a * 0.3;
          ctx.strokeStyle = C.line;
          ctx.setLineDash([5, 6]);
          rrect(ctx, X(i) - 28, PY(110), 56, PY(101) - PY(110), 6);
          ctx.stroke();
          ctx.restore();
          return;
        }
        candle(ctx, X(i), 54, PY(b.o), PY(b.h), PY(b.l), PY(b.c), {
          alpha: a * pop,
          wickWidth: 3,
          minBody: 5,
          glow: i >= 5 && t >= REPLAY && t < OUT[0] ? 12 : 0,
        });
        const col = b.c >= b.o ? C.buy : C.sell;
        ctx.save();
        ctx.globalAlpha = a * pop;
        rrect(ctx, X(i) - 26, VB - b.vis * VS, 52, b.vis * VS, 4);
        ctx.fillStyle = rgba(col, 0.55);
        ctx.fill();
        ctx.restore();
        text(ctx, String(b.v), X(i), VB - b.vis * VS - 12, {
          family: F.display,
          size: 22,
          weight: 700,
          color: C.text,
          align: "center",
          alpha: a * pop,
        });
      });
      // Opening markers on the completed history.
      const mk = tw(t, 3.4, 3.9) * (1 - tw(t, 6.0, 6.4));
      if (mk > 0) {
        tag(ctx, "突破", X(5), PY(107.2), { align: "center", color: C.buy, alpha: mk, size: 22 });
        tag(ctx, "回踩 104", X(8), PY(102.6), { align: "center", color: C.gold, alpha: mk, size: 22 });
        tag(ctx, "109", X(9), PY(110.2), { align: "center", color: C.buy, alpha: mk, size: 22 });
      }
      // Book: the 104 bid with refills.
      const q = bid104(t);
      const fl = ADDS104.reduce((s, [ta]) => s + pulse(t, ta, 3), 0);
      if (q > 0) {
        ctx.save();
        ctx.globalAlpha = a;
        rrect(ctx, DOMX - 36 - q * 1.6, PY(104) - 22, q * 1.6, 44, 5);
        ctx.fillStyle = rgba(C.buy, 0.6 + fl * 0.35);
        ctx.shadowColor = C.buy;
        ctx.shadowBlur = fl * 24;
        ctx.fill();
        ctx.restore();
      }
      text(ctx, `掛買 ${q}`, DOMX - 46 - q * 1.6, PY(104) + 1, {
        family: F.display,
        size: 26,
        weight: 700,
        color: C.buy,
        align: "right",
        base: "middle",
        alpha: a * (t >= 16.6 && t < OUT[0] ? 1 : 0.5),
      });
      for (const [ta, qa] of ADDS104)
        floatChip(ctx, `補 +${qa}`, DOMX - 120, PY(104) + 50, t, ta, { color: C.buy, size: 30, dur: 1.2 });
      const ab = absorbed(t);
      const aa = tw(t, 20.0, 20.4) * (1 - tw(t, 27.0, 27.4));
      if (aa > 0)
        tag(ctx, `104 接住的主動賣出：${ab} / 240`, X(7) - 40, PY(102.3), {
          color: C.buy,
          alpha: aa,
          size: 24,
          solid: ab === 240,
        });
      const six = tw(t, 10.8, 11.2) * (1 - tw(t, 16.4, 16.8));
      if (six > 0) tag(ctx, "120 ÷ 20 = 6 倍均量", X(5) + 40, VB - 90, { color: C.gold, alpha: six, size: 22 });
      for (const x of TR) {
        if (t < REPLAY || t >= OUT[0]) continue;
        const col = x.side === "buy" ? C.buy : C.sell;
        burst(ctx, X(x.bar), PY(x.price), t, x.t, {
          n: x.qty >= 40 ? 20 : 12,
          speed: 260 + x.qty * 4,
          seed: x.price * 5 + x.bar,
          color: col,
          flare: 50 + x.qty,
        });
      }
    });
    const cv = cvdAt(t);
    const cA = a * tw(t, 2.6, 3.2);
    panel(ctx, 140, 120, 280, 130, { alpha: cA, color: C.gold, borderAlpha: 0.5, accent: C.gold });
    text(ctx, "CVD", 166, 162, { family: F.tc, size: 22, weight: 600, color: C.muted, alpha: cA });
    text(ctx, signed(cv), 166, 226, {
      family: F.display,
      size: 56,
      weight: 700,
      color: cv >= 0 ? C.gold : C.sell,
      alpha: cA,
      glow: 10,
    });
    const hist = tw(t, 2.8, 3.2) * (1 - tw(t, 6, 6.4));
    if (hist > 0) tag(ctx, "已完成的模擬行情", 140, 290, { color: C.muted, alpha: hist, size: 22 });
    const rp = tw(t, REPLAY - 0.2, REPLAY + 0.2) * (1 - tw(t, 9.0, 9.6));
    if (rp > 0)
      tag(ctx, "回看：前五根不變，後五根逐筆重建", W / 2, 140, { align: "center", color: C.gold, alpha: rp, size: 24 });
    statement(
      ctx,
      t,
      34.8,
      [
        { text: "回踩時賣得很多，", size: 54 },
        { text: "104 的掛買一再接住。", size: 54 },
      ],
      { y: 150, gap: 76 },
    );
    titleCard(ctx, t, {
      num: "S3",
      kicker: "STORY 03 · BREAKOUT",
      title: "放量突破，怎樣才算站穩？",
      sub: "回踩承接，買盤再推高",
      titleSize: 72,
      outA: 1.9,
      outB: 2.5,
    });
  },
};
