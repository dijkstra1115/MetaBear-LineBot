// C14 足跡不平衡 — buy imbalance compares Ask(p) with Bid(p − 1), diagonally.
// IMBALANCE-LESSON-PLAN: 14:30 Bid|Ask: 104 8|12, 103 0|15, 102 10|40, 101 10|30,
// 100 10|5. 30/10 = 3 ✓, 40/10 = 4 ✓, 15/10 = 1.5 ✗, 12/0 not counted. Threshold 3×.
import { C, F, W, H, clamp, ease, lerp, prog, tw, text, rgba, glow, ring, burst, line, pulse, rrect } from "../core.js";
import { titleCard, priceGrid, camera, camPath, statement, tag, panel, arrow } from "../kit.js";

const PY = (p) => 540 - (p - 102) * 88;
const CW = 150;
const CH = 72;
const FX = [520, 960, 1400];
const FP = [
  { label: "14:29", rows: { 104: [5, 4], 103: [6, 8], 102: [9, 12], 101: [11, 10], 100: [7, 6] } },
  { label: "14:30", rows: { 104: [8, 12], 103: [0, 15], 102: [10, 40], 101: [10, 30], 100: [10, 5] } },
  { label: "14:31", rows: { 104: [6, 9], 103: [12, 10], 102: [8, 14], 101: [9, 11], 100: [10, 6] } },
];
const STEPS = [
  { p: 101, t: 5.2, ask: 30, bid: 10, ok: true },
  { p: 102, t: 11.2, ask: 40, bid: 10, ok: true },
  { p: 103, t: 15.2, ask: 15, bid: 10, ok: false },
  { p: 104, t: 19.2, ask: 12, bid: 0, ok: null },
];
const OUT = 24.6;
const lit = (t) => STEPS.filter((s) => s.ok && t >= s.t + 2.6).map((s) => s.p);

function footprint(ctx, i, t, a, o = {}) {
  const f = FP[i];
  const x = FX[i];
  text(ctx, f.label, x, PY(104.9), {
    family: F.mono,
    size: 24,
    weight: 600,
    color: i === 1 ? C.gold : C.muted,
    align: "center",
    alpha: a,
  });
  for (let p = 100; p <= 104; p++) {
    const [b, s] = f.rows[p];
    const y = PY(p);
    const litAsk = i === 1 && lit(t).includes(p);
    const focusBid = o.focus && o.focus.p - 1 === p;
    const focusAsk = o.focus && o.focus.p === p;
    for (const [cx, v, col, side] of [
      [x - 6 - CW, b, C.sell, "bid"],
      [x + 6, s, C.buy, "ask"],
    ]) {
      const hl = side === "ask" ? (focusAsk ? o.fa : 0) : focusBid ? o.fa : 0;
      const on = side === "ask" && litAsk;
      ctx.save();
      ctx.globalAlpha = a * (o.dim && !hl && !on ? 0.4 : 1);
      rrect(ctx, cx, y - CH / 2, CW, CH - 6, 8);
      ctx.fillStyle = on ? rgba(C.buy, 0.75) : rgba(col, 0.07 + clamp(v / 40) * 0.3);
      if (on) {
        ctx.shadowColor = C.buy;
        ctx.shadowBlur = 24;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = rgba(hl ? C.gold : col, 0.3 + hl * 0.7);
      ctx.lineWidth = 1.5 + hl * 2;
      ctx.stroke();
      ctx.restore();
      text(ctx, String(v), cx + CW / 2, y - 2, {
        family: F.display,
        size: 38,
        weight: 700,
        color: on ? C.ink : v ? C.text : C.dim,
        align: "center",
        base: "middle",
        alpha: a * (o.dim && !hl && !on ? 0.5 : 1),
      });
    }
    if (i === 0)
      text(ctx, String(p), x - CW - 34, y, {
        family: F.mono,
        size: 22,
        weight: 500,
        color: C.dim,
        align: "right",
        base: "middle",
        alpha: a,
      });
  }
  if (i === 1) {
    text(ctx, "Bid 主動賣", x - 6 - CW / 2, PY(99.3), {
      family: F.tc,
      size: 22,
      weight: 700,
      color: C.sell,
      align: "center",
      alpha: a,
    });
    text(ctx, "Ask 主動買", x + 6 + CW / 2, PY(99.3), {
      family: F.tc,
      size: 22,
      weight: 700,
      color: C.buy,
      align: "center",
      alpha: a,
    });
  }
}

export const lesson = {
  id: "imbalance",
  title: "足跡不平衡",
  duration: 30,
  description:
    "本例買方不平衡：較高價位的主動買（Ask）和低一檔的主動賣（Bid）對角比較。30 ÷ 10 = 3 倍、40 ÷ 10 = 4 倍，達到 3 倍門檻而標亮；15 ÷ 10 = 1.5 倍未達；12 ÷ 0 分母為零，不計。",
  note: "不是同一列左右比，\n是往下斜著比。",
  footer: "本課採「Ask(價位) ÷ Bid(低一檔)」與 3 倍門檻，零分母不比較；門檻與規則依平台設定，並非通用法則。",
  audio: "./motion/audio/imbalance.m4a",
  music: {
    palette: "glass",
    key: 3,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 5.2, level: 2 },
      { t: 24.6, level: 1 },
      { t: 26.2, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "三根已完成的足跡" },
    { t: 4.2, label: "斜著比：30 ÷ 10" },
    { t: 11.2, label: "下一組：4 倍與 1.5 倍" },
    { t: 19.2, label: "零分母不計，回到全景" },
  ],
  captions: [
    { a: 2.4, b: 4.1, text: "三根已完成的足跡；看中間 14:30。" },
    { a: 4.2, b: 7.7, text: "不是同一列左右比，而是右上比左下。" },
    { a: 7.8, b: 11.1, text: "101 的買 30 ÷ 100 的賣 10 = 3 倍：標亮。" },
    { a: 11.2, b: 15.1, text: "102 的 40 ÷ 101 的 10 = 4 倍：也標亮。" },
    { a: 15.2, b: 19.1, text: "103 的 15 ÷ 10 = 1.5 倍：未達 3 倍。" },
    { a: 19.2, b: 24.5, text: "104 的 12 ÷ 0：分母是零，本例不計。" },
    { a: 24.6, b: 30, text: "對角比例達 3 倍，右上格標亮。" },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    { t: 4.2, kind: "whoosh", dur: 0.8 },
    { t: 5.6, kind: "alarm" },
    ...STEPS.flatMap((s) => [
      { t: s.t + 1.2, kind: "blip", vel: 0.3 },
      { t: s.t + 2.6, kind: s.ok ? "coin" : "drain", dur: 0.4 },
    ]),
    { t: OUT, kind: "whoosh", dur: 1.2 },
    { t: 26.4, kind: "stamp" },
  ],
  draw(ctx, t) {
    const a = tw(t, 2.0, 2.6);
    const cur = [...STEPS].reverse().find((s) => t >= s.t && t < OUT);
    const cam = camPath(t, [
      { t: 0, x: 960, y: PY(102) - 10, z: 1.18 },
      { t: 4.2, x: 960, y: PY(102) - 10, z: 1.18 },
      { t: 5.2, x: 1080, y: PY(100.5), z: 1.35 },
      { t: 11.0, x: 1080, y: PY(100.5), z: 1.35 },
      { t: 11.8, x: 1080, y: PY(101.5), z: 1.35 },
      { t: 15.0, x: 1080, y: PY(101.5), z: 1.35 },
      { t: 15.8, x: 1080, y: PY(102.5), z: 1.35 },
      { t: 19.0, x: 1080, y: PY(102.5), z: 1.35 },
      { t: 19.8, x: 1080, y: PY(103.5), z: 1.35 },
      { t: OUT, x: 1080, y: PY(103.5), z: 1.35 },
      { t: OUT + 1.6, x: 960, y: PY(102) - 20, z: 1.12 },
    ]);
    const zoomed = tw(t, 4.2, 5.0) * (1 - tw(t, OUT, OUT + 0.8));
    camera(ctx, cam, () => {
      priceGrid(ctx, t, { alpha: 0.3 * a, step: 88, oy: PY(102) + 44 });
      footprint(ctx, 0, t, a * (1 - 0.95 * zoomed));
      footprint(ctx, 2, t, a * (1 - 0.95 * zoomed));
      const fa = cur ? tw(t, cur.t, cur.t + 0.4) : 0;
      footprint(ctx, 1, t, a, { focus: cur, fa, dim: zoomed > 0.5 });
      // Same-row comparison is crossed out once.
      const wrong = tw(t, 4.4, 4.8) * (1 - tw(t, 6.6, 7.0));
      if (wrong > 0) {
        const y = PY(101);
        line(ctx, FX[1] - 80, y, FX[1] + 80, y, "#ff6b61", 4, wrong);
        text(ctx, "✕ 同一列左右比", FX[1] - 6 - CW - 20, y, {
          family: F.tc,
          size: 26,
          weight: 800,
          color: "#ff8a7f",
          align: "right",
          base: "middle",
          alpha: wrong,
        });
      }
      if (cur) {
        const ax = FX[1] + 6 + CW / 2;
        const ay = PY(cur.p);
        const bx = FX[1] - 6 - CW / 2;
        const by = PY(cur.p - 1);
        const d = ease.outCubic(prog(t, cur.t + 0.4, cur.t + 1.2));
        arrow(ctx, ax - 30, ay + 20, bx + 30, by - 20, C.gold, d, { width: 4, head: 16 });
        // Ratio panel.
        const pa = tw(t, cur.t + 1.2, cur.t + 1.6);
        const px = FX[1] + CW + 60;
        const py = (ay + by) / 2 - 90;
        panel(ctx, px, py, 420, 180, { alpha: pa, color: cur.ok ? C.buy : C.line, borderAlpha: 0.7, fillAlpha: 0.97 });
        text(ctx, `${cur.p} 買 ${cur.ask} ÷ ${cur.p - 1} 賣 ${cur.bid}`, px + 24, py + 50, {
          family: F.tc,
          size: 26,
          weight: 700,
          color: C.text,
          alpha: pa,
        });
        const ratio = cur.bid ? cur.ask / cur.bid : null;
        text(
          ctx,
          ratio === null ? "分母為 0：不計" : `= ${ratio % 1 ? ratio.toFixed(1) : ratio} 倍`,
          px + 24,
          py + 112,
          {
            family: F.display,
            size: 48,
            weight: 700,
            color: cur.ok ? C.buy : cur.ok === false ? C.muted : "#ff8a7f",
            alpha: pa,
          },
        );
        // Threshold meter.
        const mx = px + 24;
        const mw = 370;
        const my = py + 150;
        const scale = (v) => mx + (Math.min(v, 5) / 5) * mw;
        line(ctx, mx, my, mx + mw, my, C.line, 6, pa);
        if (ratio !== null) {
          const fill = ease.outCubic(prog(t, cur.t + 1.6, cur.t + 2.6));
          line(ctx, mx, my, lerp(mx, scale(ratio), fill), my, cur.ok ? C.buy : C.muted, 6, pa);
        }
        line(ctx, scale(3), my - 14, scale(3), my + 14, C.gold, 3, pa);
        text(ctx, "門檻 3", scale(3), my + 38, {
          family: F.mono,
          size: 18,
          weight: 600,
          color: C.gold,
          align: "center",
          alpha: pa,
        });
        const verdict = tw(t, cur.t + 2.6, cur.t + 3.0);
        if (verdict > 0) {
          tag(
            ctx,
            cur.ok ? "≥ 3 倍：標亮右上格" : cur.ok === false ? "未達 3 倍：不標" : "零分母：不比較",
            px,
            py + 222,
            {
              color: cur.ok ? C.buy : cur.ok === false ? C.muted : "#ff8a7f",
              solid: !!cur.ok,
              alpha: verdict,
              size: 24,
            },
          );
          if (cur.ok) ring(ctx, ax, ay, t, cur.t + 2.6, { r1: 140, color: C.buy, w: 3 });
        }
      }
    });
    statement(ctx, t, 26.4, [{ text: "對角比例達 3 倍，右上格標亮。", size: 52 }], { y: 150 });
    titleCard(ctx, t, {
      num: "14",
      kicker: "CONCEPT 14 · IMBALANCE",
      title: "足跡不平衡",
      sub: "相鄰價位的主動成交",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
