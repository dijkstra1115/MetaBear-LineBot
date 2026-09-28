// C07 合約強平 — 100 margin at 5× opens a 500 position; losses drain the margin.
// LIQUIDATION-LESSON-PLAN: linear isolated long, open 100, 5 units, maintenance 0.5%,
// fees ignored. −5% → −25 (75 left); −10% → −50; −15% → −75; liquidation at mark
// price 80.402 (≈ −19.6%, equity ≈ 2.01). −20% is only the no-liquidation zero point.
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
  shake,
  fmt,
} from "../core.js";
import { titleCard, priceGrid, floatChip, statement, tag, panel } from "../kit.js";

const LIQ = (500 - 100) / (5 * (1 - 0.005)); // 80.40201…
const STEPS = [
  { t: 8, p: 95 },
  { t: 14, p: 90 },
  { t: 19, p: 85 },
  { t: 22.5, p: LIQ, liq: true },
];
const TX0 = 360;
const TX1 = 1560;
const PXE = (TX1 - TX0) / 100; // px per 元 of margin
const TY = 700;

function priceAt(t) {
  let p = 100;
  for (const s of STEPS) if (t >= s.t) p = s.p;
  return p;
}
/** Animated equity for the tank (eases after each price event). */
function equityVis(t) {
  let prev = 100;
  for (const s of STEPS) {
    const next = 100 + 5 * (s.p - 100);
    if (t < s.t) break;
    const u = ease.outCubic(prog(t, s.t, s.t + 0.6));
    if (u < 1) return lerp(prev, next, u);
    prev = next;
  }
  return prev;
}
const fmt2 = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2));

export const lesson = {
  id: "liquidation",
  title: "合約強平",
  duration: 32,
  description:
    "100 元保證金、5 倍槓桿開 500 元部位。價格跌 5% 虧 25、跌 10% 虧 50、跌 15% 虧 75；本例在約跌 19.6% 時觸及維持保證金門檻而強平，跌 20% 只是假設不強平時的保證金歸零點。",
  note: "虧損先吃保證金，\n強平比歸零更早到。",
  footer: "教學用線性逐倉做多：開倉 100、5 隻，維持保證金率假設 0.5%，以標記價判定，忽略費用；非任何平台通則。",
  audio: "./motion/audio/liquidation.m4a",
  music: {
    palette: "tense",
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 6, level: 2 },
      { t: 19, level: 3 },
      { t: 22.5, level: 0 },
      { t: 25.5, level: 1 },
      { t: 28.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "100 元撐起 500 元部位" },
    { t: 6.0, label: "跌 5%、跌 10%" },
    { t: 15.0, label: "逼近維持保證金" },
    { t: 24.0, label: "強平與理論歸零點" },
  ],
  captions: [
    { a: 2.4, b: 5.9, text: "100 元保證金、5 倍槓桿：開出 500 元部位。" },
    { a: 6.0, b: 13.9, text: "跌 5%：每格虧 5，共虧 25，保證金剩 75。" },
    { a: 14.0, b: 18.9, text: "跌 10%：虧 50，保證金只剩一半。" },
    { a: 19.0, b: 22.4, text: "跌 15%：虧 75，逼近維持保證金門檻。" },
    { a: 22.5, b: 25.9, text: "約跌 19.6%，觸發強制平倉。" },
    { a: 26.0, b: 32, text: "跌 20% 才歸零——但強平會先發生。" },
  ],
  flashes: [{ t: 22.5, amt: 0.35, decay: 6 }],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    { t: 2.8, kind: "rise", dur: 0.6 },
    ...[0, 1, 2, 3, 4].map((i) => ({ t: 3.3 + i * 0.12, kind: "blip", vel: 0.3 })),
    ...STEPS.filter((s) => !s.liq).map((s) => ({ t: s.t, kind: "fill", price: s.p - 4, side: "sell" })),
    ...STEPS.filter((s) => !s.liq).map((s) => ({ t: s.t + 0.05, kind: "drain", dur: 0.5 })),
    { t: 22.5, kind: "alarm" },
    { t: 22.5, kind: "impact", big: true },
    { t: 24.0, kind: "whoosh", dur: 1 },
    { t: 26.2, kind: "stamp" },
  ],
  draw(ctx, t) {
    const stageA = tw(t, 2.0, 2.6);
    const p = priceAt(t);
    const liq = t >= 22.5;
    const eq = equityVis(t);
    const [sx, sy] = shake(t, 22.5, 16, 0.7, 5);
    ctx.save();
    ctx.translate(sx, sy);
    priceGrid(ctx, t, { alpha: 0.3 * stageA, step: 60 });
    // Margin → ×5 → five 100-元 cells (drawn 70 px lower).
    ctx.save();
    ctx.translate(0, 70);
    panel(ctx, 250, 200, 220, 150, { alpha: stageA, color: C.gold, borderAlpha: 0.6 });
    text(ctx, "保證金", 360, 246, {
      family: F.tc,
      size: 24,
      weight: 600,
      color: C.muted,
      align: "center",
      alpha: stageA,
    });
    text(ctx, "100", 360, 320, {
      family: F.display,
      size: 70,
      weight: 700,
      color: C.gold,
      align: "center",
      alpha: stageA,
      glow: 12,
    });
    const beam = tw(t, 2.8, 3.4, ease.outCubic);
    if (beam > 0) {
      ctx.save();
      ctx.globalAlpha = stageA;
      ctx.fillStyle = rgba(C.gold, 0.55);
      ctx.beginPath();
      ctx.moveTo(480, 262);
      ctx.lineTo(lerp(480, 610, beam), 240);
      ctx.lineTo(lerp(480, 610, beam), 310);
      ctx.lineTo(480, 288);
      ctx.fill();
      ctx.restore();
      text(ctx, "×5", 545, 276, {
        family: F.display,
        size: 40,
        weight: 700,
        color: C.white,
        align: "center",
        base: "middle",
        alpha: stageA * beam,
      });
    }
    const loss = 100 - p;
    for (let i = 0; i < 5; i++) {
      const x = 640 + i * 150;
      const pop = ease.outBack(prog(t, 3.3 + i * 0.12, 3.7 + i * 0.12));
      if (pop <= 0) continue;
      const col = loss > 0 ? C.sell : C.muted;
      ctx.save();
      ctx.globalAlpha = stageA * clamp(pop) * (liq ? 0.55 : 1);
      ctx.translate(x + 64, 275);
      ctx.scale(pop, pop);
      rrect(ctx, -64, -70, 128, 140, 14);
      ctx.fillStyle = rgba(col, loss > 0 ? 0.2 + loss / 40 : 0.1);
      ctx.fill();
      ctx.strokeStyle = rgba(col, 0.8);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      text(ctx, "部位 100", x + 64, 250, {
        family: F.tc,
        size: 22,
        weight: 700,
        color: C.text,
        align: "center",
        alpha: stageA * clamp(pop),
      });
      text(ctx, loss > 0 ? `−${fmt2(loss)}` : "0", x + 64, 305, {
        family: F.display,
        size: 40,
        weight: 700,
        color: loss > 0 ? C.sell : C.muted,
        align: "center",
        alpha: stageA * clamp(pop),
      });
      for (const s of STEPS)
        if (!s.liq) floatChip(ctx, "−5", x + 64, 190, t, s.t + i * 0.05, { color: C.sell, size: 30, dur: 1.1 });
    }
    text(ctx, "開倉部位 500", 1030, 390, {
      family: F.tc,
      size: 24,
      weight: 700,
      color: C.muted,
      align: "center",
      alpha: stageA,
    });
    // Mark price.
    const fl = STEPS.reduce((a, s) => a + pulse(t, s.t, 4), 0);
    panel(ctx, 1450, 200, 300, 150, { alpha: stageA, color: loss > 0 ? C.sell : C.line, borderAlpha: 0.5 + fl * 0.5 });
    text(ctx, "標記價格", 1476, 246, { family: F.tc, size: 24, weight: 600, color: C.muted, alpha: stageA });
    text(ctx, p === 100 ? "100" : p.toFixed(p === LIQ ? 2 : 0), 1476, 320, {
      family: F.display,
      size: 64,
      weight: 700,
      color: loss > 0 ? C.sell : C.text,
      alpha: stageA,
      glow: 10 + fl * 20,
    });
    text(ctx, loss > 0 ? `−${((loss / 100) * 100).toFixed(loss === 100 - LIQ ? 1 : 0)}%` : "", 1724, 322, {
      family: F.display,
      size: 34,
      weight: 700,
      color: C.sell,
      align: "right",
      alpha: stageA,
    });

    ctx.restore();
    // Margin tank.
    const ta = tw(t, 4.0, 4.6);
    text(ctx, "剩餘保證金（權益）", TX1, TY - 78, {
      family: F.tc,
      size: 26,
      weight: 700,
      color: C.text,
      align: "right",
      alpha: ta,
    });
    ctx.save();
    ctx.globalAlpha = ta;
    rrect(ctx, TX0, TY - 50, TX1 - TX0, 100, 18);
    ctx.fillStyle = "#0b161c";
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    rrect(ctx, TX0, TY - 50, TX1 - TX0, 100, 18);
    ctx.clip();
    const ex = TX0 + eq * PXE;
    const g = ctx.createLinearGradient(TX0, 0, ex, 0);
    g.addColorStop(0, rgba(C.gold, 0.9));
    g.addColorStop(1, rgba(C.gold, 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(TX0, TY - 50, Math.max(0, ex - TX0), 100);
    // Loss region hatch.
    ctx.fillStyle = rgba(C.sell, 0.18);
    ctx.fillRect(ex, TY - 50, TX1 - ex, 100);
    ctx.strokeStyle = rgba(C.sell, 0.35);
    ctx.lineWidth = 2;
    for (let x = ex - 100; x < TX1 + 100; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, TY + 50);
      ctx.lineTo(x + 60, TY - 50);
      ctx.stroke();
    }
    // Maintenance zone.
    const mm = 5 * LIQ * 0.005;
    ctx.fillStyle = rgba("#ff5a4f", 0.45 + (liq ? 0.3 : 0));
    ctx.fillRect(TX0, TY - 50, mm * PXE, 100);
    ctx.restore();
    ctx.restore();
    if (ta > 0) {
      text(ctx, fmt2(eq), Math.max(TX0 + 70, ex - 18), TY + 2, {
        family: F.display,
        size: 54,
        weight: 700,
        color: C.ink,
        align: "right",
        base: "middle",
        alpha: ta * (eq > 12 ? 1 : 0),
      });
      if (100 - eq > 3)
        text(ctx, `已虧 ${fmt2(100 - eq)}`, Math.min(TX1 - 20, ex + 24), TY + 2, {
          family: F.tc,
          size: 32,
          weight: 800,
          color: C.sell,
          base: "middle",
          alpha: ta,
        });
    }
    // Scale: drop percentages aligned with losses.
    const sa = tw(t, 4.4, 5.0);
    for (const [pct, label] of [
      [0, "0%"],
      [5, "−5%"],
      [10, "−10%"],
      [15, "−15%"],
    ]) {
      const x = TX1 - pct * 5 * PXE;
      line(ctx, x, TY + 56, x, TY + 76, C.muted, 1.5, sa);
      text(ctx, label, x, TY + 104, {
        family: F.mono,
        size: 22,
        weight: 600,
        color: C.muted,
        align: "center",
        alpha: sa,
      });
    }
    text(ctx, "價格跌幅 →", TX1, TY + 142, {
      family: F.tc,
      size: 20,
      weight: 500,
      color: C.dim,
      align: "right",
      alpha: sa,
    });
    // Threshold markers.
    const mA = tw(t, 19.4, 19.9);
    if (mA > 0) {
      const x = TX0 + 5 * LIQ * 0.005 * PXE;
      line(ctx, x, TY - 70, x, TY + 76, "#ff5a4f", 2.5, mA);
      text(ctx, "維持保證金門檻", x + 6, TY - 88, {
        family: F.tc,
        size: 22,
        weight: 700,
        color: "#ff8a7f",
        alpha: mA * (1 - tw(t, 22.5, 22.8)),
      });
    }
    const rA = tw(t, 22.8, 23.2);
    if (rA > 0)
      text(ctx, `權益剩 ${(100 + 5 * (LIQ - 100)).toFixed(2)}，碰到門檻`, TX0 + 5 * LIQ * 0.005 * PXE + 8, TY - 88, {
        family: F.tc,
        size: 22,
        weight: 700,
        color: "#ff8a7f",
        alpha: rA * (1 - tw(t, 25.8, 26.2)),
      });
    const zA = tw(t, 26.0, 26.6);
    if (zA > 0) {
      line(ctx, TX0, TY - 90, TX0, TY + 90, C.muted, 2, zA, [6, 6]);
      text(ctx, "−20%：假設不強平的歸零點", TX0 - 10, TY + 146, {
        family: F.tc,
        size: 22,
        weight: 600,
        color: C.muted,
        align: "left",
        alpha: zA,
      });
      text(ctx, "−19.6%", TX0 + 24 + 5 * LIQ * 0.005 * PXE, TY + 104, {
        family: F.mono,
        size: 22,
        weight: 700,
        color: "#ff8a7f",
        alpha: zA,
      });
    }
    ctx.restore();
    // Liquidation stamp.
    if (liq) {
      const s = ease.outBack(prog(t, 22.5, 22.9), 2.5);
      const out = tw(t, 25.6, 26.0);
      ctx.save();
      ctx.globalAlpha = clamp(s) * (1 - out);
      ctx.translate(W / 2, 540);
      ctx.rotate(-0.06);
      ctx.scale(lerp(1.8, 1, clamp(s)), lerp(1.8, 1, clamp(s)));
      rrect(ctx, -300, -58, 600, 116, 14);
      ctx.fillStyle = "rgba(40,6,6,0.85)";
      ctx.fill();
      ctx.strokeStyle = "#ff5a4f";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
      text(ctx, "強制平倉", W / 2, 540, {
        family: F.tc,
        size: 70,
        weight: 900,
        color: "#ff6b61",
        align: "center",
        base: "middle",
        alpha: clamp(s) * (1 - out),
        glow: 20,
        glowColor: "#ff5a4f",
      });
      ring(ctx, W / 2, 540, t, 22.5, { r1: 700, color: "#ff5a4f", w: 4, dur: 1 });
    }
    statement(
      ctx,
      t,
      26.8,
      [
        { text: "虧損先吃掉保證金；", size: 50 },
        { text: "還沒歸零，強平就先到。", size: 50 },
      ],
      { y: 500, gap: 70 },
    );
    titleCard(ctx, t, {
      num: "07",
      kicker: "CONCEPT 07 · LIQUIDATION",
      title: "合約強平",
      sub: "虧損如何吃掉保證金",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
