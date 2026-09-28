// S04 訂單塊到底長怎樣？ — a named buyer A absorbs passively, then buys actively.
// ORDER-BLOCK-LESSON-PLAN: prior high 105. 14:30 trades 103×4, 104×3 (others), 103×12,
// 102×18, 101×20 (sellers hit A's bids = 50), 102×3 (other buyer) → O103 H104 L101 C102.
// 14:31: A buys 5 each at 102…107 → O102 H107 L102 C107. A = 50 + 30 = 80, never sells.
// Close above 105 confirms; zone = whole 14:30 range 101–104.
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
  shake,
} from "../core.js";
import { titleCard, priceGrid, floatChip, camera, camPath, statement, tag, panel } from "../kit.js";

const PY = (p) => 560 - (p - 104.5) * 62;
const X = (i) => 290 + i * 112;
const DOMX = 1500;
const HIST = [
  [104, 105, 103, 104],
  [104, 105, 103, 103],
  [103, 104, 102, 104],
  [104, 105, 103, 104],
  [104, 104, 102, 103],
  [103, 104, 102, 102],
  [102, 104, 102, 103],
  null,
  null,
  [107, 108, 106, 108],
  [108, 109, 107, 107],
];
const LABELS = Array.from({ length: 11 }, (_, i) => `14:${String(23 + i).padStart(2, "0")}`);
const T1 = [
  { t: 9.4, price: 103, qty: 4, who: "other" },
  { t: 10.4, price: 104, qty: 3, who: "other" },
  { t: 11.6, price: 103, qty: 12, who: "A" },
  { t: 13.4, price: 102, qty: 18, who: "A" },
  { t: 15.2, price: 101, qty: 20, who: "A" },
  { t: 16.8, price: 102, qty: 3, who: "other" },
];
const T2 = [102, 103, 104, 105, 106, 107].map((p, i) => ({ t: 20.6 + i * 1.0, price: p, qty: 5 }));
const REPLAY = 6.8;
const CLOSE1 = 18.2;
const CONFIRM = 27.2;
const ZONE = 29.8;
const OUT = [32.6, 34.4];

function candleOf(trades, t, full) {
  const tr = trades.filter((x) => full || x.t <= t);
  if (!tr.length) return null;
  const ps = tr.map((x) => x.price);
  return { o: ps[0], h: Math.max(...ps), l: Math.min(...ps), c: ps.at(-1) };
}
const aBought = (t) =>
  T1.filter((x) => x.who === "A" && x.t <= t).reduce((s, x) => s + x.qty, 0) +
  T2.filter((x) => x.t <= t).reduce((s, x) => s + x.qty, 0);
function aBids(t) {
  const b = { 103: 12, 102: 18, 101: 20 };
  for (const x of T1) if (x.who === "A" && x.t <= t) b[x.price] -= x.qty;
  return b;
}

export const lesson = {
  id: "order-block",
  title: "訂單塊到底長怎樣？",
  duration: 38,
  description:
    "具名的模擬買家 A 要買 80 隻：先在 103、102、101 掛買，承接主動賣出 50 隻，這根 K 線反而收跌；期限接近，A 改用主動買入，逐檔買完 30 隻把價格推到 107，收盤越過前高 105。起漲前那根收跌 K 的 101–104，就是本例畫出的訂單塊。",
  note: "大買家在買，\n也可能先留下收跌 K。",
  footer:
    "具名買家與執行目標是模擬設定；K 線形狀本身無法證明機構身分或必然回訪。本課以「最後收跌 K＋收盤越過前高＋整根高低」為畫法。",
  audio: "./motion/audio/order-block.m4a",
  music: {
    palette: "deep",
    key: -2,
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 9.2, level: 2 },
      { t: 18.2, level: 1 },
      { t: 20.4, level: 3 },
      { t: 26.8, level: 2 },
      { t: 34.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "十一根完整行情" },
    { t: 6.8, label: "A 先掛買承接" },
    { t: 18.2, label: "收跌，但還差 30" },
    { t: 20.4, label: "改用主動買入" },
    { t: 29.8, label: "畫出訂單塊" },
  ],
  captions: [
    { a: 2.4, b: 6.7, text: "十一根 K 線：價格從 14:30 附近起漲。" },
    { a: 6.8, b: 11.5, text: "回看：模擬買家 A 要買 80 隻，先在 103、102、101 掛買。" },
    { a: 11.6, b: 18.1, text: "賣方主動賣出，A 的掛買一路承接；價格反而往下走。" },
    { a: 18.2, b: 20.3, text: "這根收跌 K 裡，A 已買 50 隻，還差 30。" },
    { a: 20.4, b: 27.1, text: "期限接近，A 改用主動買入：每檔 5 隻，逐檔推到 107。" },
    { a: 27.2, b: 29.7, text: "收在 107，越過前高 105。" },
    { a: 29.8, b: 38, text: "起漲前那根收跌 K 的 101–104：本例的訂單塊。" },
  ],
  flashes: [{ t: CONFIRM, amt: 0.3, decay: 7 }],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    ...HIST.map((_, i) => ({ t: 2.3 + i * 0.1, kind: "blip", vel: 0.2 })),
    { t: 5.2, kind: "whoosh", dur: 1.4 },
    { t: REPLAY, kind: "drain", dur: 0.4 },
    { t: 7.4, kind: "rise", dur: 0.5 },
    ...[7.8, 8.1, 8.4].map((t) => ({ t, kind: "blip", vel: 0.3 })),
    ...T1.map((x) => ({
      t: x.t,
      kind: "fill",
      price: x.price,
      side: x.who === "A" ? "sell" : "buy",
      soft: x.who !== "A",
    })),
    { t: CLOSE1, kind: "stamp" },
    { t: 19.2, kind: "blip", vel: 0.3 },
    { t: 20.3, kind: "alarm" },
    ...T2.map((x) => ({ t: x.t, kind: "fill", price: x.price, side: "buy" })),
    { t: CONFIRM, kind: "impact", big: true },
    { t: ZONE, kind: "swell", dur: 1.6 },
    { t: OUT[0], kind: "whoosh", dur: 1.6 },
    { t: 35, kind: "stamp" },
  ],
  draw(ctx, t) {
    const a = tw(t, 2.0, 2.6);
    const full = t < REPLAY || t >= OUT[0];
    const c30 = candleOf(T1, t, full);
    const c31 = candleOf(T2, t, full);
    const cam = camPath(t, [
      { t: 0, x: 900, y: 540, z: 1.0 },
      { t: 5.2, x: 900, y: 540, z: 1.0 },
      { t: 6.6, x: 1230, y: PY(104), z: 1.2 },
      { t: OUT[0], x: 1230, y: PY(104), z: 1.2 },
      { t: OUT[1], x: 900, y: 560, z: 1.0 },
    ]);
    const [sx, sy] = shake(t, CONFIRM, 12, 0.5, 4);
    camera(ctx, { ...cam, sx, sy }, () => {
      priceGrid(ctx, t, { alpha: 0.3 * a, step: 62, oy: PY(104.5) });
      for (let p = 100; p <= 109; p++) {
        line(ctx, 230, PY(p), 1440, PY(p), C.line, 1, a * 0.35);
        text(ctx, String(p), DOMX, PY(p), {
          family: F.mono,
          size: 20,
          weight: 500,
          color: C.muted,
          align: "center",
          base: "middle",
          alpha: a,
        });
      }
      // Prior high 105.
      const ph = tw(t, 3.4, 3.9);
      line(ctx, X(0) - 30, PY(105), X(8) + 40, PY(105), C.muted, 1.5, ph * 0.8 * a, [8, 8]);
      text(ctx, "前高 105", X(0) - 40, PY(105), {
        family: F.tc,
        size: 22,
        weight: 700,
        color: C.muted,
        align: "right",
        base: "middle",
        alpha: ph * a,
      });
      // Zone.
      const z = tw(t, ZONE, ZONE + 0.8, ease.outCubic);
      if (z > 0) {
        const x0 = X(7) - 34;
        const x1 = lerp(x0 + 68, X(10) + 60, z);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = rgba(C.gold, 0.14);
        ctx.fillRect(x0, PY(104), x1 - x0, PY(101) - PY(104));
        ctx.strokeStyle = rgba(C.gold, 0.8);
        ctx.lineWidth = 2;
        ctx.strokeRect(x0, PY(104), x1 - x0, PY(101) - PY(104));
        ctx.restore();
        text(ctx, "訂單塊 101–104（本例畫法）", x0 + 10, PY(101) + 30, {
          family: F.tc,
          size: 24,
          weight: 800,
          color: C.gold,
          alpha: a * z,
        });
      }
      // Candles.
      HIST.forEach((b, i) => {
        const pop = tw(t, 2.2 + i * 0.1, 2.7 + i * 0.1);
        text(ctx, LABELS[i], X(i), PY(99.4), {
          family: F.mono,
          size: 18,
          weight: 600,
          color: i === 7 || i === 8 ? C.gold : C.dim,
          align: "center",
          alpha: a * pop,
        });
        let k = b ? { o: b[0], h: b[1], l: b[2], c: b[3] } : i === 7 ? c30 : c31;
        const hidden = i > 8 && !full;
        if (!k || hidden) {
          if (!full && (i === 7 || i === 8 || i > 8)) {
            ctx.save();
            ctx.globalAlpha = a * 0.3;
            ctx.strokeStyle = C.line;
            ctx.setLineDash([5, 6]);
            rrect(ctx, X(i) - 28, PY(109), 56, PY(100.5) - PY(109), 6);
            ctx.stroke();
            ctx.restore();
          }
          return;
        }
        candle(ctx, X(i), 56, PY(k.o), PY(k.h), PY(k.l), PY(k.c), {
          alpha: a * pop * (i < 7 && !full ? 0.6 : 1),
          wickWidth: 3,
          minBody: 5,
          glow: (i === 7 || i === 8) && !full ? 14 : 0,
        });
      });
      // A's resting bids and the next minute's asks.
      if (!full) {
        const bids = aBids(t);
        const ba = tw(t, 7.4, 8.6);
        for (const [p, q] of Object.entries(bids)) {
          if (q <= 0) continue;
          const pop = ease.outBack(prog(t, 7.6 + (103 - p) * 0.3, 8.0 + (103 - p) * 0.3));
          ctx.save();
          ctx.globalAlpha = a * clamp(pop);
          rrect(ctx, DOMX - 36 - q * 7 * pop, PY(Number(p)) - 22, q * 7 * pop, 44, 5);
          ctx.fillStyle = rgba(C.buy, 0.7);
          ctx.fill();
          ctx.restore();
          text(ctx, `A 掛買 ${q}`, DOMX - 46 - q * 7, PY(Number(p)) + 1, {
            family: F.display,
            size: 26,
            weight: 700,
            color: C.buy,
            align: "right",
            base: "middle",
            alpha: a * ba,
          });
        }
        const askA = tw(t, 19.0, 19.6);
        if (askA > 0)
          for (const x of T2) {
            if (t >= x.t) continue;
            ctx.save();
            ctx.globalAlpha = a * askA;
            rrect(ctx, DOMX + 36, PY(x.price) - 22, 5 * 7, 44, 5);
            ctx.fillStyle = rgba(C.sell, 0.7);
            ctx.fill();
            ctx.restore();
            text(ctx, "賣 5", DOMX + 80, PY(x.price) + 1, {
              family: F.display,
              size: 24,
              weight: 700,
              color: C.sell,
              base: "middle",
              alpha: a * askA,
            });
          }
        for (const x of T1) {
          const col = x.who === "A" ? C.buy : C.muted;
          burst(ctx, X(7), PY(x.price), t, x.t, {
            n: x.who === "A" ? 20 : 10,
            speed: 320,
            seed: x.price + x.qty,
            color: col,
            flare: 60 + x.qty * 2,
          });
          if (x.who === "A") {
            const p = prog(t, x.t - 0.6, x.t);
            if (p > 0 && p < 1)
              tag(ctx, `主動賣出 ${x.qty}`, lerp(DOMX + 300, DOMX - 40, ease.inOutCubic(p)), PY(x.price), {
                align: "center",
                color: C.sell,
                solid: true,
                size: 22,
              });
            floatChip(ctx, `A +${x.qty}`, X(7) + 90, PY(x.price) - 30, t, x.t, { color: C.buy, size: 30 });
          } else
            floatChip(ctx, `其他 ${x.qty}`, X(7) - 90, PY(x.price) - 30, t, x.t, {
              color: C.muted,
              size: 24,
              dur: 0.9,
            });
        }
        for (const x of T2) {
          const p = prog(t, x.t - 0.5, x.t);
          if (p > 0 && p < 1) glow(ctx, lerp(X(8) - 200, DOMX + 36, ease.inCubic(p)), PY(x.price), 26, C.buy, 1);
          burst(ctx, X(8), PY(x.price), t, x.t, { n: 16, speed: 360, seed: x.price * 3, color: C.buy, flare: 80 });
          floatChip(ctx, "A 主動 +5", X(8) + 100, PY(x.price) - 30, t, x.t, { color: C.buy, size: 26, dur: 0.9 });
        }
      }
      const cl = tw(t, CLOSE1, CLOSE1 + 0.4) * (1 - tw(t, 20.2, 20.6));
      if (cl > 0)
        tag(ctx, "收跌 K · A 已買 50", X(7), PY(100.2), { align: "center", color: C.sell, alpha: cl, size: 22 });
      const cf = tw(t, CONFIRM, CONFIRM + 0.4) * (1 - tw(t, OUT[0], OUT[0] + 0.4));
      if (cf > 0) {
        tag(ctx, "收盤 107 > 前高 105", X(8) + 70, PY(107), { color: C.buy, solid: true, alpha: cf, size: 24 });
        ring(ctx, X(8), PY(107), t, CONFIRM, { r1: 200, color: C.buy, w: 3 });
      }
    });
    // A's progress card.
    const ca = a * tw(t, 7.0, 7.5) * (1 - tw(t, OUT[0], OUT[0] + 0.5));
    if (ca > 0) {
      const got = aBought(t);
      const passive = Math.min(got, 50);
      panel(ctx, 140, 120, 380, 200, { alpha: ca, color: C.buy, borderAlpha: 0.6, accent: C.buy });
      text(ctx, "模擬買家 A", 166, 164, { family: F.tc, size: 26, weight: 900, color: C.text, alpha: ca });
      text(ctx, t >= 20.3 ? "期限接近：改用主動買入" : "目標 80 隻：先掛買等人賣", 166, 204, {
        family: F.tc,
        size: 20,
        weight: 600,
        color: t >= 20.3 ? C.gold : C.muted,
        alpha: ca,
      });
      text(ctx, `${got}`, 166, 282, { family: F.display, size: 64, weight: 700, color: C.buy, alpha: ca, glow: 12 });
      text(ctx, "/ 80", 166 + 30 + String(got).length * 28, 280, {
        family: F.display,
        size: 34,
        weight: 700,
        color: C.muted,
        alpha: ca,
      });
      const bw = 330;
      ctx.save();
      ctx.globalAlpha = ca;
      rrect(ctx, 166, 298, bw, 10, 5);
      ctx.fillStyle = "#ffffff1c";
      ctx.fill();
      rrect(ctx, 166, 298, (bw * passive) / 80, 10, 5);
      ctx.fillStyle = C.teal;
      ctx.fill();
      if (got > 50) {
        rrect(ctx, 166 + (bw * 50) / 80, 298, (bw * (got - 50)) / 80, 10, 5);
        ctx.fillStyle = C.gold;
        ctx.fill();
      }
      ctx.restore();
      text(ctx, "掛買承接", 320, 282, { family: F.tc, size: 16, weight: 600, color: C.teal, alpha: ca });
      text(ctx, "主動買入", 420, 282, {
        family: F.tc,
        size: 16,
        weight: 600,
        color: C.gold,
        alpha: ca * (got > 50 ? 1 : 0.4),
      });
    }
    const hist = tw(t, 2.8, 3.2) * (1 - tw(t, 5.2, 5.6));
    if (hist > 0) tag(ctx, "已完成的模擬行情", 140, 150, { color: C.muted, alpha: hist, size: 22 });
    const rp = tw(t, REPLAY - 0.2, REPLAY + 0.2) * (1 - tw(t, 8.6, 9.2));
    if (rp > 0) tag(ctx, "回看 14:30–14:31", W / 2, 140, { align: "center", color: C.gold, alpha: rp, size: 24 });
    statement(
      ctx,
      t,
      35,
      [
        { text: "大買家先承接、再主動買完：", size: 50 },
        { text: "起漲前，留下一根收跌 K。", size: 50 },
      ],
      { y: 150, gap: 72 },
    );
    titleCard(ctx, t, {
      num: "S4",
      kicker: "STORY 04 · ORDER BLOCK",
      title: "訂單塊到底長怎樣？",
      sub: "大買家如何留下起漲區",
      titleSize: 76,
      outA: 1.9,
      outB: 2.5,
    });
  },
};
