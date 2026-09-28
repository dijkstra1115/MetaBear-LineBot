// C06 合約槓桿 — margin × leverage = position; P&L follows position × price move.
// LEVERAGE-LESSON-PLAN: open 100. 100 margin ×1 → 1 unit, ×5 → 5 units.
// 101: +1 / +5; 99: −1 / −5. Then 500×1 vs 100×5 (both 5 units): at 101 both +5,
// return on margin +1% vs +5%. Linear long, no fees.
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
import { titleCard, priceGrid, floatChip, statement, tag, panel } from "../kit.js";

const TA = 400;
const TB = 700;
const MX = 390; // margin block centre
const CX0 = 790; // first cell
const CW = 128;
const CG = 16;

const PRICE = [
  { t: 0, p: 100 },
  { t: 8.5, p: 101 },
  { t: 12.5, p: 99 },
  { t: 19.5, p: 100 },
  { t: 24.5, p: 101 },
];
const priceAt = (t) => PRICE.filter((e) => t >= e.t).at(-1).p;
const phase2 = (t) => t >= 19.5;

function track(ctx, y, t, o) {
  const a = o.alpha;
  if (a <= 0) return;
  const p = priceAt(t);
  const pnl = o.units * (p - 100);
  // Margin block (coin stack).
  const mw = 200;
  panel(ctx, MX - mw / 2, y - 70, mw, 140, { alpha: a, color: C.gold, borderAlpha: 0.6, fillAlpha: 0.9 });
  text(ctx, "保證金", MX, y - 26, { family: F.tc, size: 24, weight: 600, color: C.muted, align: "center", alpha: a });
  text(ctx, `${o.margin}`, MX, y + 36, {
    family: F.display,
    size: 64,
    weight: 700,
    color: C.gold,
    align: "center",
    alpha: a,
    glow: 10 + pulse(t, o.marginFlash ?? -9, 3) * 30,
  });
  // Leverage beam.
  const beam = o.beam;
  const bx0 = MX + mw / 2 + 10;
  const bx1 = CX0 - 30;
  if (beam > 0) {
    ctx.save();
    ctx.globalAlpha = a;
    const grd = ctx.createLinearGradient(bx0, 0, bx1, 0);
    grd.addColorStop(0, rgba(C.gold, 0.8));
    grd.addColorStop(1, rgba(C.teal, 0.8));
    ctx.fillStyle = grd;
    ctx.beginPath();
    const x1 = lerp(bx0, bx1, beam);
    ctx.moveTo(bx0, y - 10);
    ctx.lineTo(x1, y - 10 - o.units * 6 * beam);
    ctx.lineTo(x1, y + 10 + o.units * 6 * beam);
    ctx.lineTo(bx0, y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const lx = (bx0 + bx1) / 2;
    ctx.save();
    ctx.globalAlpha = a * beam;
    ctx.beginPath();
    ctx.arc(lx, y, 40, 0, Math.PI * 2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    text(ctx, `×${o.lev}`, lx, y + 2, {
      family: F.display,
      size: 40,
      weight: 700,
      color: C.white,
      align: "center",
      base: "middle",
      alpha: a * beam,
    });
  }
  // Position cells.
  for (let i = 0; i < 5; i++) {
    const x = CX0 + i * (CW + CG);
    const show = i < o.units ? ease.outBack(prog(t, o.cellT + i * 0.12, o.cellT + i * 0.12 + 0.4)) : 0;
    const ghost = i >= o.units;
    ctx.save();
    ctx.globalAlpha = a * (ghost ? 0.25 : 1);
    ctx.strokeStyle = C.line;
    ctx.setLineDash([6, 6]);
    rrect(ctx, x, y - 60, CW, 120, 14);
    ctx.stroke();
    ctx.restore();
    if (show <= 0) continue;
    const col = p > 100 ? C.buy : p < 100 ? C.sell : C.muted;
    ctx.save();
    ctx.globalAlpha = a * clamp(show);
    ctx.translate(x + CW / 2, y);
    ctx.scale(show, show);
    rrect(ctx, -CW / 2, -60, CW, 120, 14);
    ctx.fillStyle = rgba(col, p === 100 ? 0.12 : 0.28);
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    text(ctx, "1 隻", x + CW / 2, y - 18, {
      family: F.tc,
      size: 24,
      weight: 700,
      color: C.text,
      align: "center",
      alpha: a * clamp(show),
    });
    text(ctx, "開倉 100", x + CW / 2, y + 22, {
      family: F.tc,
      size: 20,
      weight: 500,
      color: C.muted,
      align: "center",
      alpha: a * clamp(show),
    });
    for (const e of PRICE) {
      if (!e.t || e.p === 100 || (o.phase2 !== undefined && e.t >= 19.5 !== o.phase2)) continue;
      floatChip(ctx, signed(e.p - 100), x + CW / 2, y - 88, t, e.t + i * 0.05, {
        color: e.p > 100 ? C.buy : C.sell,
        size: 32,
        dur: 1.2,
      });
    }
  }
  // P&L.
  const px = CX0 + 5 * (CW + CG) + 30;
  text(ctx, "損益", px, y - 26, { family: F.tc, size: 24, weight: 600, color: C.muted, alpha: a });
  text(ctx, pnl === 0 ? "0" : signed(pnl), px, y + 36, {
    family: F.display,
    size: 64,
    weight: 700,
    color: pnl > 0 ? C.buy : pnl < 0 ? C.sell : C.text,
    alpha: a,
    glow: 12,
  });
  if (o.roe !== undefined && o.roe > 0)
    tag(ctx, `報酬率 ${signed((pnl / o.margin) * 100)}%`, px, y + 90, {
      color: pnl > 0 ? C.buy : C.muted,
      alpha: a * o.roe,
      size: 26,
      solid: true,
    });
}

export const lesson = {
  id: "leverage",
  title: "合約槓桿",
  duration: 30,
  description:
    "保證金 × 槓桿 = 部位。100 元保證金開 1 倍是 1 隻、開 5 倍是 5 隻；價格漲 1 元，損益分別 +1 與 +5。改成 500 元 1 倍與 100 元 5 倍，同樣 5 隻、同樣 +5，報酬率卻是 +1% 與 +5%。",
  note: "槓桿放大部位，\n損益跟著部位走。",
  footer: "教學用線性做多合約：開倉價 100，忽略手續費與資金費；部位價值指開倉時的名目金額。",
  audio: "./motion/audio/leverage.m4a",
  music: {
    palette: "tense",
    key: 2,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 6, level: 2 },
      { t: 16, level: 1 },
      { t: 19.5, level: 2 },
      { t: 25.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "保證金與部位" },
    { t: 6.0, label: "價格一動，損益跟著部位" },
    { t: 16.0, label: "換一組設定比較" },
    { t: 24.5, label: "同樣損益，不同報酬率" },
  ],
  captions: [
    { a: 2.4, b: 5.9, text: "同樣 100 元保證金：1 倍開 1 隻，5 倍開 5 隻。" },
    { a: 6.0, b: 11.9, text: "價格 100 → 101：每隻 +1，上面 +1、下面 +5。" },
    { a: 12.0, b: 15.9, text: "跌到 99：每隻 −1，5 隻就是 −5。" },
    { a: 16.0, b: 24.4, text: "換一組設定：500 元開 1 倍、100 元開 5 倍，都是 5 隻。" },
    { a: 24.5, b: 30, text: "同樣 +5：報酬率一個 +1%、一個 +5%。" },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    { t: 2.8, kind: "rise", dur: 0.6 },
    ...[0, 1, 2, 3, 4].map((i) => ({ t: 3.4 + i * 0.12, kind: "blip", vel: 0.3 })),
    { t: 8.5, kind: "fill", price: 101, side: "buy" },
    { t: 8.5, kind: "coin" },
    { t: 12.5, kind: "fill", price: 99, side: "sell" },
    { t: 12.5, kind: "drain", dur: 0.4 },
    { t: 16.0, kind: "whoosh", dur: 0.8 },
    { t: 19.5, kind: "stamp" },
    { t: 24.5, kind: "fill", price: 101, side: "buy", big: true },
    { t: 25.4, kind: "coin" },
  ],
  draw(ctx, t) {
    const stageA = tw(t, 2.0, 2.6);
    const p = priceAt(t);
    priceGrid(ctx, t, { alpha: 0.3 * stageA, step: 60 });
    // Price ticker.
    const flash = PRICE.reduce((s, e) => s + (e.t ? pulse(t, e.t, 4) : 0), 0);
    panel(ctx, W / 2 - 170, 150, 340, 110, {
      alpha: stageA,
      color: p > 100 ? C.buy : p < 100 ? C.sell : C.line,
      borderAlpha: 0.5 + flash * 0.5,
    });
    text(ctx, "價格", W / 2 - 140, 214, {
      family: F.tc,
      size: 26,
      weight: 600,
      color: C.muted,
      base: "middle",
      alpha: stageA,
    });
    text(ctx, String(p), W / 2 + 140, 212, {
      family: F.display,
      size: 78,
      weight: 700,
      color: p > 100 ? C.buy : p < 100 ? C.sell : C.text,
      align: "right",
      base: "middle",
      alpha: stageA,
      glow: 10 + flash * 30,
    });
    const p2 = phase2(t);
    const swap = tw(t, 19.1, 20.1, ease.inOutCubic);
    const cellsA = p2 ? 5 : 1;
    track(ctx, TA, t, {
      alpha: stageA,
      margin: p2 ? 500 : 100,
      lev: 1,
      units: cellsA,
      beam: tw(t, 2.8, 3.4, ease.outCubic),
      cellT: p2 ? 19.6 : 3.2,
      marginFlash: 19.5,
      phase2: p2,
      roe: tw(t, 25.2, 25.6),
    });
    track(ctx, TB, t, {
      alpha: stageA,
      margin: 100,
      lev: 5,
      units: 5,
      beam: tw(t, 2.9, 3.5, ease.outCubic),
      cellT: 3.3,
      roe: tw(t, 25.3, 25.7),
    });
    if (swap > 0 && swap < 1) glow(ctx, MX, TA, 160, C.gold, Math.sin(swap * Math.PI) * 0.8);
    const note = tw(t, 16.2, 16.6) * (1 - tw(t, 24.2, 24.6));
    if (note > 0)
      tag(ctx, "另一組開倉設定：500 × 1 與 100 × 5，同樣 5 隻", W / 2, 560 - 5, {
        align: "center",
        color: C.gold,
        alpha: note,
        size: 24,
      });
    const same = tw(t, 25.8, 26.2);
    if (same > 0)
      tag(ctx, "損益金額相同，保證金報酬率不同", W / 2, 555, { align: "center", color: C.text, alpha: same, size: 26 });
    statement(ctx, t, 26.4, [{ text: "損益跟著部位；報酬率看保證金。", size: 52 }], { y: 930 });
    titleCard(ctx, t, {
      num: "06",
      kicker: "CONCEPT 06 · LEVERAGE",
      title: "合約槓桿",
      sub: "保證金與部位",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
