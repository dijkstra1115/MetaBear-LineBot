// C11 未平倉量（OI） — each trade is one contract; OI counts open long = open short.
// OPEN-INTEREST-LESSON-PLAN: selection 14:30 starts at OI 2 (longs A, C; shorts B, D).
// 1) I open long / J open short → 3 (+1). 2) J close short / I close long → 2 (−1).
// 3) E open long / A close long → 2 (0). 4) B close short / F open short → 2 (0).
// 14:30 prices 104/102/103/101 → OHLC 104/104/101/101. Every trade adds 1 to volume.
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
  TAU,
} from "../core.js";
import { titleCard, priceGrid, floatChip, statement, tag, panel } from "../kit.js";

const MINUTES = [
  { label: "14:28", px: [100, 101, 99, 100], oi: [1, 2, 2, 2] },
  { label: "14:29", px: [100, 102, 103, 102], oi: [2, 3, 2, 2] },
  { label: "14:30", px: [104, 102, 103, 101], oi: [3, 2, 2, 2] },
  { label: "14:31", px: [101, 103, 104, 102], oi: [3, 3, 2, 2] },
  { label: "14:32", px: [102, 100, 99, 100], oi: [2, 3, 2, 2] },
];
const TRADES = [
  { t: 8, buyer: ["I", "開多"], seller: ["J", "開空"], d: +1, price: 104 },
  { t: 14, buyer: ["J", "平空"], seller: ["I", "平多"], d: -1, price: 102 },
  { t: 20, buyer: ["E", "開多"], seller: ["A", "平多"], d: 0, price: 103 },
  { t: 26, buyer: ["B", "平空"], seller: ["F", "開空"], d: 0, price: 101 },
];
const CHIPS = [
  { id: "A", side: "long", in: -1, out: 20.3 },
  { id: "C", side: "long", in: -1, out: 99 },
  { id: "I", side: "long", in: 8.3, out: 14.3 },
  { id: "E", side: "long", in: 20.3, out: 99 },
  { id: "B", side: "short", in: -1, out: 26.3 },
  { id: "D", side: "short", in: -1, out: 99 },
  { id: "J", side: "short", in: 8.3, out: 14.3 },
  { id: "F", side: "short", in: 26.3, out: 99 },
];
const MINI_IN = [5.2, 6.6];
const MINI_OUT = [30.2, 32.2];
const doneTrades = (t) => TRADES.filter((x) => t >= x.t).length;
const oiNow = (t) => 2 + TRADES.filter((x) => t >= x.t + 0.3).reduce((s, x) => s + x.d, 0);

/** Chart in a rect; `sel` limits 14:30 nodes during replay (-1 = full history). */
function chart(ctx, t, r, a, sel) {
  if (a <= 0) return;
  const cw = r.w / 5;
  const pTop = r.y;
  const pH = r.h * 0.52;
  const oTop = r.y + r.h * 0.62;
  const oH = r.h * 0.34;
  const PY = (p) => pTop + ((105 - p) / 7) * pH;
  const OY = (v) => oTop + oH - (v / 4) * oH;
  const s = r.w / 1200;
  panel(ctx, r.x - 30 * s, r.y - 50 * s, r.w + 60 * s, r.h + 110 * s, { alpha: a * 0.6, fillAlpha: 0.55, r: 16 * s });
  text(ctx, "價格", r.x, r.y - 16 * s, { family: F.tc, size: 22 * s, weight: 700, color: C.muted, alpha: a });
  text(ctx, "未平倉量 OI", r.x, oTop - 14 * s, { family: F.tc, size: 22 * s, weight: 700, color: C.gold, alpha: a });
  const pts = [];
  MINUTES.forEach((m, i) => {
    const cx = r.x + cw * (i + 0.5);
    const replay = sel >= 0 && i === 2;
    const n = replay ? sel : 4;
    const hide = sel >= 0 && i > 2;
    const ps = m.px.slice(0, n);
    const hl = i === 2 ? 1 : 0;
    if (ps.length && !hide) {
      const o = m.px[0];
      candle(ctx, cx, 46 * s, PY(o), PY(Math.max(...ps)), PY(Math.min(...ps)), PY(ps.at(-1)), {
        alpha: a * (hl || sel < 0 ? 1 : 0.7),
        wickWidth: 3 * s,
        minBody: 5 * s,
      });
    }
    text(ctx, m.label, cx, r.y + r.h + 40 * s, {
      family: F.mono,
      size: 20 * s,
      weight: 600,
      color: hl ? C.gold : C.muted,
      align: "center",
      alpha: a * (hide ? 0.35 : 1),
    });
    if (hide) return;
    for (let k = 0; k < n; k++) pts.push([r.x + cw * (i + (k + 0.5) / 4), OY(m.oi[k])]);
  });
  if (sel >= 0) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = C.gold;
    ctx.setLineDash([6 * s, 5 * s]);
    ctx.lineWidth = 2;
    rrect(ctx, r.x + cw * 2 + 6 * s, r.y - 20 * s, cw - 12 * s, r.h + 36 * s, 10 * s);
    ctx.stroke();
    ctx.restore();
  }
  // Start point: OI 2 before the first trade of 14:28 is 0.
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 3;
  ctx.shadowColor = C.gold;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
  for (const [x, y] of pts) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(x, y, 5 * s, 0, TAU);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.restore();
  }
  for (const v of [0, 2, 4])
    text(ctx, String(v), r.x - 14 * s, OY(v), {
      family: F.mono,
      size: 18 * s,
      weight: 500,
      color: C.dim,
      align: "right",
      base: "middle",
      alpha: a,
    });
}

function lerpRect(a, b, u) {
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), w: lerp(a.w, b.w, u), h: lerp(a.h, b.h, u) };
}
const FULL = { x: 360, y: 200, w: 1200, h: 560 };
const MINI = { x: 150, y: 170, w: 560, h: 250 };

function chipsDraw(ctx, t, a) {
  const rows = {
    long: { x: 360, y: 820, col: C.buy, label: "多單 LONG" },
    short: { x: 1040, y: 820, col: C.sell, label: "空單 SHORT" },
  };
  for (const [side, r] of Object.entries(rows)) {
    text(ctx, r.label, r.x, r.y - 70, { family: F.tc, size: 26, weight: 800, color: r.col, alpha: a });
    const list = CHIPS.filter((c) => c.side === side);
    // Smooth slot = number of earlier chips alive (eased around transitions).
    list.forEach((c, i) => {
      const alive = (x) =>
        (t >= x.in ? ease.outCubic(prog(t, x.in, x.in + 0.5)) : 0) * (1 - ease.inCubic(prog(t, x.out, x.out + 0.5)));
      const vis = alive(c);
      if (vis <= 0.001) return;
      const slot = list.slice(0, i).reduce((s, o) => s + alive(o), 0);
      const x = r.x + 60 + slot * 120;
      const y = r.y;
      const leaving = t >= c.out;
      ctx.save();
      ctx.globalAlpha = a * vis;
      ctx.translate(x, y + (leaving ? -40 : 0) * (1 - vis) + (t < c.in + 0.5 ? 30 * (1 - vis) : 0));
      ctx.scale(0.6 + 0.4 * vis, 0.6 + 0.4 * vis);
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, TAU);
      ctx.fillStyle = rgba(r.col, 0.25);
      ctx.fill();
      ctx.strokeStyle = r.col;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
      text(ctx, c.id, x, y + 2, {
        family: F.display,
        size: 44,
        weight: 700,
        color: C.text,
        align: "center",
        base: "middle",
        alpha: a * vis,
      });
    });
  }
}

function traderCard(ctx, x, y, who, role, action, col, a) {
  if (a <= 0) return;
  panel(ctx, x - 170, y - 80, 340, 160, { alpha: a, color: col, borderAlpha: 0.7, accent: col });
  text(ctx, `${role} ${who}`, x - 140, y - 24, { family: F.tc, size: 30, weight: 800, color: C.text, alpha: a });
  tag(ctx, action, x - 140, y + 34, { color: col, solid: true, alpha: a, size: 28 });
}

export const lesson = {
  id: "open-interest",
  title: "未平倉量（OI）",
  duration: 36,
  description:
    "五根 K 線與 OI 折線。回看 14:30：起點 OI 2。I 開多、J 開空，OI 3；J 平空、I 平多，OI 2；E 開多、A 平多，OI 不變；B 平空、F 開空，OI 不變。每筆成交量都 +1。",
  note: "一口多單，\n對應一口空單。",
  footer: "OI 以合約口數計，每份未平倉合約只算一次；教材已知每個帳戶是開倉還是平倉，一般成交資料未必看得到。",
  audio: "./motion/audio/open-interest.m4a",
  music: {
    palette: "lift",
    key: 2,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 6.6, level: 2 },
      { t: 30.2, level: 1 },
      { t: 32.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "K 線與 OI 全景" },
    { t: 5.2, label: "開開：+1" },
    { t: 12.0, label: "平平：−1" },
    { t: 18.0, label: "一開一平：不變" },
    { t: 30.2, label: "回到同一段行情" },
  ],
  captions: [
    { a: 2.4, b: 5.1, text: "K 線下方，是同一段成交推導出的 OI。" },
    { a: 5.2, b: 7.9, text: "回看 14:30：起點有 2 口多單、2 口空單，OI = 2。" },
    { a: 8.0, b: 11.9, text: "I 開多、J 開空：新增一口，OI 3，成交量 +1。" },
    { a: 12.0, b: 17.9, text: "J 平空、I 平多：減少一口，OI 回到 2。" },
    { a: 18.0, b: 23.9, text: "E 開多、A 平多：多單換手，OI 不變。" },
    { a: 24.0, b: 30.1, text: "B 平空、F 開空：空單換手，OI 還是 2。" },
    { a: 30.2, b: 36, text: "開開 +1、平平 −1，一開一平不變。" },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    { t: 2.4, kind: "swell", dur: 2.6 },
    { t: 5.2, kind: "whoosh", dur: 1 },
    ...TRADES.flatMap((x) => [
      { t: x.t - 2, kind: "blip", vel: 0.3 },
      { t: x.t, kind: "fill", price: x.price, side: "buy" },
      { t: x.t + 0.3, kind: x.d > 0 ? "rise" : x.d < 0 ? "drain" : "blip", dur: 0.4, freq: 1200 },
    ]),
    { t: 30.2, kind: "whoosh", dur: 1.2 },
    { t: 33.2, kind: "stamp" },
  ],
  draw(ctx, t) {
    const a = tw(t, 2.0, 2.6);
    const m = tw(t, ...MINI_IN, ease.inOutCubic) * (1 - tw(t, ...MINI_OUT, ease.inOutCubic));
    const replay = t >= MINI_IN[0] && t < MINI_OUT[1];
    const sel = replay ? doneTrades(t) : -1;
    priceGrid(ctx, t, { alpha: 0.3 * a, step: 60 });
    chart(ctx, t, lerpRect(FULL, MINI, m), a, sel);
    if (a > 0 && t < 5.4)
      tag(ctx, "已完成的模擬行情", 1560, 150, {
        align: "right",
        color: C.muted,
        alpha: a * (1 - tw(t, 5, 5.4)),
        size: 22,
      });
    const d = m * a;
    if (d > 0.01) {
      tag(ctx, "選段回看 · 14:30", 150, 120, { color: C.gold, alpha: d, size: 22 });
      // OI + volume counters.
      const oi = oiNow(t);
      const vol = TRADES.filter((x) => t >= x.t).length;
      const fl = TRADES.reduce((s, x) => s + pulse(t, x.t + 0.3, 3), 0);
      panel(ctx, 820, 170, 420, 250, { alpha: d, color: C.gold, borderAlpha: 0.4 + fl * 0.6 });
      text(ctx, "未平倉量 OI", 850, 222, { family: F.tc, size: 26, weight: 700, color: C.muted, alpha: d });
      text(ctx, String(oi), 850, 350, {
        family: F.display,
        size: 130,
        weight: 700,
        color: C.gold,
        alpha: d,
        glow: 14 + fl * 30,
      });
      text(ctx, `成交量 ${vol}`, 1210, 222, {
        family: F.tc,
        size: 24,
        weight: 600,
        color: C.text,
        align: "right",
        alpha: d,
      });
      for (const x of TRADES) {
        floatChip(ctx, x.d > 0 ? "+1" : x.d < 0 ? "−1" : "±0", 1100, 330, t, x.t + 0.3, {
          color: x.d > 0 ? C.buy : x.d < 0 ? C.sell : C.muted,
          size: 56,
          dur: 1.4,
        });
        floatChip(ctx, "+1", 1180, 250, t, x.t, { color: C.text, size: 30, dur: 1 });
      }
      // Current pair of traders.
      for (const x of TRADES) {
        const ca = tw(t, x.t - 2, x.t - 1.6) * (1 - tw(t, x.t + 3.2, x.t + 3.8));
        if (ca <= 0) continue;
        const meet = ease.inOutCubic(prog(t, x.t - 0.5, x.t)) * (1 - ease.inOutCubic(prog(t, x.t + 0.4, x.t + 1.0)));
        traderCard(ctx, 1480 - meet * 40, 250, x.buyer[0], "買方", x.buyer[1], C.buy, ca * d);
        traderCard(ctx, 1480 - meet * 40, 450, x.seller[0], "賣方", x.seller[1], C.sell, ca * d);
        burst(ctx, 1480, 350, t, x.t, { n: 22, speed: 380, seed: x.price, color: C.gold, flare: 100 });
        const lab = x.d > 0 ? "兩邊都開倉：新增一口" : x.d < 0 ? "兩邊都平倉：減少一口" : "一開一平：部位換手";
        tag(ctx, lab, 1310, 580, {
          color: x.d > 0 ? C.buy : x.d < 0 ? C.sell : C.gold,
          alpha: ca * d * tw(t, x.t + 0.3, x.t + 0.6),
          size: 24,
        });
      }
      chipsDraw(ctx, t, d);
      text(ctx, "多單數 = 空單數 = OI", W / 2, 950, {
        family: F.tc,
        size: 24,
        weight: 700,
        color: C.muted,
        align: "center",
        alpha: d,
      });
    }
    statement(ctx, t, 33.0, [{ text: "開開 +1、平平 −1，一開一平不變。", size: 52 }], { y: 120 });
    titleCard(ctx, t, {
      num: "11",
      kicker: "CONCEPT 11 · OPEN INTEREST",
      title: "未平倉量（OI）",
      sub: "開倉、平倉與成交量",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
