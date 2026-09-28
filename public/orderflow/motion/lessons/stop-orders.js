// C10 停損單 — trigger at last price 99; market stop vs stop-limit (min 98).
// STOP-ORDERS-LESSON-PLAN: bids 101×2 (already traded), 100×3, 99×5, 98×10, 97×20.
// Market: holding 20, fills 98×10 + 97×10 → avg 97.50. Rewind to the same start;
// limit: fills 98×10, 10 remain resting at 98.
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
} from "../core.js";
import { titleCard, priceGrid, floatChip, camera, camPath, statement, tag, panel } from "../kit.js";

const PY = (p) => 560 - (p - 99) * 96;
const PX = 820;
const QW = 20;
const RESET = 16.0;
const B = [
  { m: { bg1: 3.0, bg2: 5.5, send: 7.0, f1: 9.2, f2: 11.8 } },
  { m: { bg1: 19.0, bg2: 21.5, send: 23.0, f1: 24.5 } },
];

function branch(t) {
  return t < RESET ? 0 : 1;
}
function state(t) {
  const br = branch(t);
  const e = B[br].m;
  const bids = { 100: 3, 99: 5, 98: 10, 97: 20 };
  let last = 101;
  let filled = 0;
  let cost = 0;
  let resting = 0;
  let triggered = false;
  if (t >= e.bg1) {
    bids[100] = 0;
    last = 100;
  }
  if (t >= e.bg2) {
    bids[99] = 0;
    last = 99;
    triggered = true;
  }
  if (t >= e.f1) {
    bids[98] = 0;
    last = 98;
    filled += 10;
    cost += 980;
  }
  if (br === 0 && t >= e.f2) {
    bids[97] -= 10;
    last = 97;
    filled += 10;
    cost += 970;
  }
  if (br === 1 && t >= e.f1 + 0.6) resting = 10;
  return { br, bids, last, filled, avg: filled ? cost / filled : null, resting, triggered, sent: t >= e.send };
}

export const lesson = {
  id: "stop-orders",
  title: "停損單",
  duration: 32,
  description:
    "持有 20 隻、最新成交價跌到 99 觸發。市價停損依序賣出 98 的 10 隻與 97 的 10 隻，均價 97.50；回到同一起點，限價停損最低賣 98，只成交 10 隻，剩 10 隻掛在 98 等待。",
  note: "觸發之後，\n市價搶成交，限價守價格。",
  footer: "本例以最新成交價作觸發參考、觸發價 99；背景成交來自其他賣方。無手續費，非建議下單參數。",
  audio: "./motion/audio/stop-orders.m4a",
  music: {
    palette: "tense",
    key: -2,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 5.5, level: 2 },
      { t: 15.4, level: 0 },
      { t: 18, level: 1 },
      { t: 21.5, level: 2 },
      { t: 27.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "設定停損：跌到 99 觸發" },
    { t: 7.0, label: "市價停損：逐價成交" },
    { t: RESET, label: "回到同一起點：限價停損" },
    { t: 27.6, label: "兩種結果" },
  ],
  captions: [
    { a: 2.4, b: 5.4, text: "持有 20 隻：最新成交價跌到 99，就觸發。" },
    { a: 5.5, b: 8.9, text: "成交到 99，觸發！送出市價賣單。" },
    { a: 9.0, b: 11.7, text: "先賣給最高的掛買：98 元 10 隻。" },
    { a: 11.8, b: 15.9, text: "98 賣完，再賣 97 元 10 隻：均價 97.50。" },
    { a: 16.0, b: 22.9, text: "回到同一起點：改用限價停損，最低賣 98。" },
    { a: 23.0, b: 27.5, text: "98 只接得住 10 隻；剩下 10 隻掛在 98 等待。" },
    { a: 27.6, b: 32, text: "市價優先成交；限價守住價格，但可能等不到。" },
  ],
  flashes: [{ t: RESET, amt: 0.35, pre: 0.15, decay: 7 }],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    ...[3.0, 5.5, 19.0, 21.5].map((t) => ({ t, kind: "fill", price: t % 16 < 4 ? 100 : 99, side: "sell", soft: true })),
    { t: 5.55, kind: "alarm" },
    { t: 21.55, kind: "alarm" },
    { t: 7.0, kind: "whoosh", dur: 0.6 },
    { t: 9.2, kind: "fill", price: 98, side: "sell" },
    { t: 11.8, kind: "fill", price: 97, side: "sell" },
    { t: RESET - 0.3, kind: "riser", dur: 0.3 },
    { t: RESET, kind: "impact" },
    { t: 23.0, kind: "whoosh", dur: 0.6 },
    { t: 24.5, kind: "fill", price: 98, side: "sell" },
    { t: 25.3, kind: "blip", freq: 900 },
    { t: 27.6, kind: "whoosh", dur: 1 },
    { t: 28.4, kind: "stamp" },
  ],
  draw(ctx, t) {
    const a = tw(t, 2.0, 2.6);
    const s = state(t);
    const e = B[s.br].m;
    const rew = tw(t, RESET - 0.5, RESET, ease.inQuad) * (1 - tw(t, RESET, RESET + 0.6));
    const cam = camPath(t, [
      { t: 0, x: 980, y: 540, z: 1.08 },
      { t: 7.2, x: 980, y: 540, z: 1.08 },
      { t: 8.2, x: 900, y: 600, z: 1.14 },
      { t: 15.4, x: 900, y: 600, z: 1.14 },
      { t: 16.4, x: 980, y: 540, z: 1.08 },
      { t: 23.2, x: 980, y: 540, z: 1.08 },
      { t: 24.0, x: 900, y: 600, z: 1.14 },
      { t: 27.6, x: 900, y: 600, z: 1.14 },
      { t: 28.8, x: 1010, y: 560, z: 1.0 },
    ]);
    const [sx, sy] = shake(t, e.bg2, 10, 0.4, 3);
    camera(ctx, { ...cam, sx, sy }, () => {
      priceGrid(ctx, t, { alpha: 0.35 * a, step: 96, oy: PY(99) + 48 });
      text(ctx, "掛買 BID", PX - 40, PY(101.8), {
        family: F.mono,
        size: 18,
        weight: 600,
        color: C.buy,
        align: "right",
        ls: 3,
        alpha: a,
      });
      text(ctx, "ASK 掛賣", PX + 40, PY(101.8), {
        family: F.mono,
        size: 18,
        weight: 600,
        color: C.sell,
        ls: 3,
        alpha: a,
      });
      for (let p = 97; p <= 101; p++) {
        const y = PY(p);
        const trig = p === 99 ? pulse(t, e.bg2, 2.5) : 0;
        text(ctx, String(p), PX, y, {
          family: F.mono,
          size: 30,
          weight: 700,
          color: p === s.last ? C.gold : C.muted,
          align: "center",
          base: "middle",
          alpha: a,
          glow: trig * 30,
          glowColor: C.sell,
        });
        if (p === 99) ring(ctx, PX, y, t, e.bg2, { r1: 120, color: C.sell, w: 3 });
        const q = p === 101 ? 0 : s.bids[p];
        if (q > 0) {
          ctx.save();
          ctx.globalAlpha = a;
          rrect(ctx, PX - 48 - q * QW, y - 30, q * QW, 60, 8);
          ctx.fillStyle = rgba(C.buy, 0.55);
          ctx.fill();
          ctx.restore();
          text(ctx, `買 ${q}`, PX - 60 - q * QW, y + 1, {
            family: F.display,
            size: 32,
            weight: 700,
            color: C.buy,
            align: "right",
            base: "middle",
            alpha: a,
          });
        }
      }
      if (s.resting) {
        const g = ease.outBack(prog(t, e.f1 + 0.6, e.f1 + 1.0));
        ctx.save();
        ctx.globalAlpha = a;
        rrect(ctx, PX + 48, PY(98) - 30, 10 * QW * g, 60, 8);
        ctx.fillStyle = rgba(C.sell, 0.85);
        ctx.fill();
        ctx.strokeStyle = C.white;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        text(ctx, "我的限價賣 10 · 在 98 等待", PX + 48, PY(98) + 58, {
          family: F.tc,
          size: 26,
          weight: 800,
          color: C.sell,
          base: "middle",
          alpha: a * clamp(g),
        });
      }
      // Background sells.
      for (const [tt, p, q] of [
        [e.bg1, 100, 3],
        [e.bg2, 99, 5],
      ]) {
        const pr = prog(t, tt - 0.5, tt);
        if (pr > 0 && pr < 1)
          tag(ctx, `其他人賣出 ${q}`, lerp(PX + 380, PX, ease.inOutCubic(pr)), PY(p), {
            align: "center",
            color: C.muted,
            solid: true,
            size: 22,
          });
        burst(ctx, PX - 48, PY(p), t, tt, { n: 14, speed: 280, seed: p + tt, color: C.muted, flare: 60 });
      }
      // My stop sells.
      const fills =
        s.br === 0
          ? [
              [e.f1, 98],
              [e.f2, 97],
            ]
          : [[e.f1, 98]];
      for (const [tt, p] of fills) {
        const pr = prog(t, tt - 0.6, tt);
        if (pr > 0 && pr < 1)
          tag(ctx, "我的停損賣 10", lerp(1300, PX, ease.inOutCubic(pr)), lerp(420, PY(p), ease.inOutCubic(pr)), {
            align: "center",
            color: C.sell,
            solid: true,
            size: 24,
          });
        burst(ctx, PX - 48, PY(p), t, tt, { n: 26, speed: 460, seed: p, color: C.sell, flare: 110 });
        floatChip(ctx, `10 × ${p}`, PX - 260, PY(p) - 50, t, tt, { color: C.gold, size: 36 });
      }
    });
    // Last price badge (screen space).
    panel(ctx, 140, 150, 250, 120, { alpha: a, color: C.gold, borderAlpha: 0.5 });
    text(ctx, "最新成交", 165, 192, { family: F.tc, size: 22, weight: 600, color: C.muted, alpha: a });
    text(ctx, String(s.last), 165, 252, {
      family: F.display,
      size: 60,
      weight: 700,
      color: C.gold,
      alpha: a,
      glow: 10 + pulse(t, e.bg2, 3) * 30,
    });
    // Order card (screen space).
    const cx = 1230;
    const cy = 230;
    const cardA = a * (1 - rew);
    panel(ctx, cx, cy, 540, 300, {
      alpha: cardA,
      color: s.triggered ? C.sell : C.line,
      borderAlpha: 0.6 + pulse(t, e.bg2, 3) * 0.4,
      accent: s.br ? C.gold : C.sell,
    });
    text(ctx, s.br ? "限價停損單" : "市價停損單", cx + 30, cy + 56, {
      family: F.tc,
      size: 34,
      weight: 900,
      color: C.text,
      alpha: cardA,
    });
    text(ctx, "持有 20 隻 · 觸發價 99", cx + 30, cy + 104, {
      family: F.tc,
      size: 24,
      weight: 500,
      color: C.muted,
      alpha: cardA,
    });
    text(ctx, s.br ? "觸發後：限價賣出，最低 98" : "觸發後：市價賣出", cx + 30, cy + 144, {
      family: F.tc,
      size: 24,
      weight: 700,
      color: s.br ? C.gold : C.sell,
      alpha: cardA,
    });
    const status = !s.triggered
      ? "等待觸發"
      : !s.sent
        ? "觸發！"
        : s.resting
          ? "部分成交，其餘等待"
          : s.filled === 20
            ? "全部成交"
            : "送出，成交中";
    tag(ctx, status, cx + 30, cy + 196, {
      color: s.triggered ? C.sell : C.muted,
      solid: s.triggered && !s.sent,
      alpha: cardA,
      size: 24,
    });
    const bw = 480;
    ctx.save();
    ctx.globalAlpha = cardA;
    rrect(ctx, cx + 30, cy + 240, bw, 12, 6);
    ctx.fillStyle = "#ffffff1c";
    ctx.fill();
    rrect(ctx, cx + 30, cy + 240, (bw * s.filled) / 20, 12, 6);
    ctx.fillStyle = C.sell;
    ctx.fill();
    ctx.restore();
    text(ctx, `已賣出 ${s.filled} / 20${s.avg ? ` · 均價 ${s.avg.toFixed(2)}` : ""}`, cx + 30, cy + 284, {
      family: F.tc,
      size: 22,
      weight: 600,
      color: C.text,
      alpha: cardA,
    });
    // Rewind overlay.
    if (rew > 0) {
      text(ctx, "⟲ 回到同一起點", W / 2, H / 2, {
        family: F.tc,
        size: 70,
        weight: 900,
        color: C.text,
        align: "center",
        base: "middle",
        alpha: rew,
        glow: 30,
      });
    }
    const res = tw(t, 28.2, 28.8);
    if (res > 0) {
      tag(ctx, "市價停損：成交 20 · 均價 97.50", 1230, 600, { color: C.sell, alpha: res, size: 28, solid: true });
      tag(ctx, "限價停損：成交 10 · 均價 98 · 等待 10", 1230, 672, {
        color: C.gold,
        alpha: tw(t, 28.5, 29.1),
        size: 28,
      });
    }
    statement(ctx, t, 28.8, [{ text: "市價搶成交，限價守價格。", size: 52 }], { y: 920 });
    titleCard(ctx, t, {
      num: "10",
      kicker: "CONCEPT 10 · STOP ORDERS",
      title: "停損單",
      sub: "市價止損與限價止損",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
