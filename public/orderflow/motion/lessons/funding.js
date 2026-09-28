// C12 資金費率 — perpetual funding moves money between longs and shorts.
// FUNDING-LESSON-PLAN: both hold 100 units at mark 100 → 10,000 USDT value.
// Settlement 1 at +0.01%: long pays short 1 (−1 / +1). Settlement 2 at −0.02%:
// short pays long 2 (cumulative +1 / −1). Leverage does not enter the formula.
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
  TAU,
  signed,
} from "../core.js";
import { titleCard, priceGrid, floatChip, statement, tag, panel } from "../kit.js";

const LX = 400;
const RX = 1520;
const DX = W / 2;
const DY = 430;
const S1 = 9.5;
const S2 = 22.0;

const rateAt = (t) => (t < 16.5 ? 0.01 : -0.02);
const ledger = (t) => {
  let long = 0;
  if (t >= S1 + 0.9) long -= 1;
  if (t >= S2 + 0.9) long += 2;
  return { long, short: -long };
};

function side(ctx, x, label, color, value, t, flash) {
  panel(ctx, x - 230, 250, 460, 330, { alpha: 1, color, borderAlpha: 0.5 + flash * 0.5, accent: color });
  text(ctx, label, x, 312, { family: F.tc, size: 40, weight: 900, color, align: "center" });
  text(ctx, "持倉 100 × 標記價 100", x, 372, { family: F.tc, size: 24, weight: 500, color: C.muted, align: "center" });
  text(ctx, "部位價值", x, 432, { family: F.tc, size: 24, weight: 600, color: C.muted, align: "center" });
  text(ctx, "10,000", x, 520, { family: F.display, size: 88, weight: 700, color: C.text, align: "center", glow: 10 });
  text(ctx, "USDT", x + 150, 520, { family: F.mono, size: 22, weight: 600, color: C.muted });
  // Ledger.
  panel(ctx, x - 230, 620, 460, 150, {
    alpha: 1,
    color: value > 0 ? C.buy : value < 0 ? C.sell : C.line,
    borderAlpha: 0.5 + flash * 0.5,
  });
  text(ctx, "本段資金費收支", x, 664, { family: F.tc, size: 24, weight: 600, color: C.muted, align: "center" });
  text(ctx, value === 0 ? "0" : signed(value), x, 740, {
    family: F.display,
    size: 70,
    weight: 700,
    color: value > 0 ? C.buy : value < 0 ? C.sell : C.text,
    align: "center",
    glow: 10 + flash * 30,
  });
}

function coins(ctx, t, t0, n, fromX, toX) {
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 6; k++) {
      const d = i * 0.18 + k * 0.03;
      const p = prog(t, t0 + d, t0 + d + 0.8);
      if (p <= 0 || p >= 1) continue;
      const e = ease.inOutCubic(p);
      const x = lerp(fromX, toX, e);
      const y = 650 - Math.sin(e * Math.PI) * 70;
      if (k === 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 30, 0, TAU);
        ctx.fillStyle = C.gold;
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 24;
        ctx.fill();
        ctx.restore();
        text(ctx, "1", x, y + 2, {
          family: F.display,
          size: 36,
          weight: 700,
          color: C.ink,
          align: "center",
          base: "middle",
        });
      } else glow(ctx, x, y, 18 - k * 2, C.gold, 0.5);
    }
  }
}

export const lesson = {
  id: "funding",
  title: "資金費率",
  duration: 32,
  description:
    "多空各持 10,000 USDT 部位。費率 +0.01% 時，結算時多方付空方 1 USDT；下一次費率 −0.02%，改由空方付多方 2 USDT。兩次結算後多方累計 +1、空方 −1。",
  note: "費率的正負，\n決定誰付給誰。",
  footer: "教學用 USDT 永續：資金費 = 結算時部位價值 × 費率，在多空持倉者之間交換；槓桿不另乘進公式。倒數為加速示意。",
  audio: "./motion/audio/funding.m4a",
  music: {
    palette: "glass",
    key: -3,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 7, level: 2 },
      { t: 16, level: 1 },
      { t: 17.5, level: 2 },
      { t: 26.4, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "多空各持 10,000 部位" },
    { t: 7.0, label: "正費率：多方付空方" },
    { t: 16.0, label: "負費率：空方付多方" },
    { t: 26.0, label: "兩次結算紀錄" },
  ],
  captions: [
    { a: 2.4, b: 6.9, text: "多空各持 10,000 USDT 部位，定期交換資金費。" },
    { a: 7.0, b: 9.4, text: "費率 +0.01%：10,000 × 0.01% = 1。" },
    { a: 9.5, b: 15.9, text: "結算時仍持倉：多方付給空方 1 USDT。" },
    { a: 16.0, b: 21.9, text: "下一次結算，費率變成 −0.02%。" },
    { a: 22.0, b: 25.9, text: "這次反過來：空方付給多方 2 USDT。" },
    { a: 26.0, b: 32, text: "費率的正負，決定誰付給誰。" },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    { t: 2.6, kind: "blip" },
    { t: 2.9, kind: "blip" },
    ...[6.6, 7.6, 8.6].map((t) => ({ t, kind: "tick", vel: 0.5 })),
    { t: S1, kind: "impact" },
    { t: S1 + 0.2, kind: "coin" },
    { t: 16.5, kind: "whoosh", dur: 0.7 },
    ...[19.1, 20.1, 21.1].map((t) => ({ t, kind: "tick", vel: 0.5 })),
    { t: S2, kind: "impact" },
    { t: S2 + 0.2, kind: "coin" },
    { t: S2 + 0.4, kind: "coin" },
    { t: 26.0, kind: "whoosh", dur: 1 },
    { t: 26.8, kind: "stamp" },
  ],
  draw(ctx, t) {
    const a = tw(t, 2.0, 2.6);
    if (a <= 0) {
      titleCard(ctx, t, {
        num: "12",
        kicker: "CONCEPT 12 · FUNDING RATE",
        title: "資金費率",
        sub: "永續合約的定期交換",
        outA: 1.9,
        outB: 2.5,
      });
      return;
    }
    const z = lerp(1, 0.9, tw(t, 26, 27.2));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2 - lerp(0, 40, tw(t, 26, 27.2)));
    priceGrid(ctx, t, { alpha: 0.3, step: 60 });
    const led = ledger(t);
    const f1 = pulse(t, S1 + 0.9, 3) + pulse(t, S2 + 0.9, 3);
    side(ctx, LX, "多方 LONG", C.buy, led.long, t, f1);
    side(ctx, RX, "空方 SHORT", C.sell, led.short, t, f1);
    // Settlement dial.
    const r = 150;
    const rate = rateAt(t);
    const phase = t < 16.5 ? [6.3, S1] : [18.8, S2];
    const cd = prog(t, phase[0], phase[1]);
    ctx.save();
    ctx.lineWidth = 10;
    ctx.strokeStyle = rgba(C.line, 1);
    ctx.beginPath();
    ctx.arc(DX, DY, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = rate > 0 ? C.buy : C.sell;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(DX, DY, r, -Math.PI / 2, -Math.PI / 2 + TAU * cd);
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 60; i++) {
      const ang = (i / 60) * TAU;
      line(
        ctx,
        DX + Math.cos(ang) * (r + 18),
        DY + Math.sin(ang) * (r + 18),
        DX + Math.cos(ang) * (r + (i % 5 ? 24 : 32)),
        DY + Math.sin(ang) * (r + (i % 5 ? 24 : 32)),
        C.muted,
        1,
        0.4,
      );
    }
    const flip = pulse(t, 16.5, 4);
    text(ctx, "資金費率", DX, DY - 50, { family: F.tc, size: 24, weight: 600, color: C.muted, align: "center" });
    text(ctx, `${rate > 0 ? "+" : "−"}${Math.abs(rate).toFixed(2)}%`, DX, DY + 18, {
      family: F.display,
      size: 76,
      weight: 700,
      color: rate > 0 ? C.buy : C.sell,
      align: "center",
      base: "middle",
      glow: 12 + flip * 40,
    });
    const settled = (t >= S1 && t < 16.5) || t >= S2;
    text(
      ctx,
      settled ? (t >= S2 ? "第 2 次結算 ✓" : "第 1 次結算 ✓") : t < 16.5 ? "距離第 1 次結算" : "距離第 2 次結算",
      DX,
      DY + 84,
      {
        family: F.tc,
        size: 22,
        weight: 600,
        color: settled ? C.gold : C.muted,
        align: "center",
      },
    );
    ring(ctx, DX, DY, t, S1, { r1: 420, color: C.gold, w: 3 });
    ring(ctx, DX, DY, t, S2, { r1: 420, color: C.gold, w: 3 });
    // Direction arrow.
    const dirA = tw(t, 7.2, 7.6) * (1 - tw(t, 16.2, 16.5)) + tw(t, 17.0, 17.4) * (1 - tw(t, 26, 26.4));
    if (dirA > 0) {
      const pay = rate > 0;
      const y = 650;
      const x1 = pay ? LX + 260 : RX - 260;
      const x2 = pay ? RX - 260 : LX + 260;
      line(ctx, x1, y, x2, y, C.gold, 3, dirA * 0.8, [10, 8]);
      ctx.save();
      ctx.globalAlpha = dirA;
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      const dir = Math.sign(x2 - x1);
      ctx.moveTo(x2, y);
      ctx.lineTo(x2 - dir * 22, y - 12);
      ctx.lineTo(x2 - dir * 22, y + 12);
      ctx.fill();
      ctx.restore();
      text(ctx, pay ? "費率為正：多方付給空方" : "費率為負：空方付給多方", DX, y - 20, {
        family: F.tc,
        size: 26,
        weight: 800,
        color: C.gold,
        align: "center",
        alpha: dirA,
      });
      text(ctx, pay ? "10,000 × 0.01% = 1" : "10,000 × 0.02% = 2", DX, y + 44, {
        family: F.display,
        size: 36,
        weight: 700,
        color: C.text,
        align: "center",
        alpha: dirA,
      });
    }
    coins(ctx, t, S1, 1, LX + 180, RX - 180);
    coins(ctx, t, S2, 2, RX - 180, LX + 180);
    floatChip(ctx, "−1", LX, 600, t, S1 + 0.9, { color: C.sell, size: 44 });
    floatChip(ctx, "+1", RX, 600, t, S1 + 0.9, { color: C.buy, size: 44 });
    floatChip(ctx, "+2", LX, 600, t, S2 + 0.9, { color: C.buy, size: 44 });
    floatChip(ctx, "−2", RX, 600, t, S2 + 0.9, { color: C.sell, size: 44 });
    // Records.
    const rec = tw(t, 26.4, 27.0);
    if (rec > 0) {
      tag(ctx, "第 1 次 · +0.01% · 多方 → 空方 1", DX, 850, { align: "center", color: C.buy, alpha: rec, size: 26 });
      tag(ctx, "第 2 次 · −0.02% · 空方 → 多方 2", DX, 910, {
        align: "center",
        color: C.sell,
        alpha: tw(t, 26.7, 27.3),
        size: 26,
      });
    }
    ctx.restore();
    statement(ctx, t, 27.2, [{ text: "費率的正負，決定誰付給誰。", size: 54 }], { y: 150 });
    titleCard(ctx, t, {
      num: "12",
      kicker: "CONCEPT 12 · FUNDING RATE",
      title: "資金費率",
      sub: "永續合約的定期交換",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
