// C04 市價單與限價單 — the same "buy 30" sent two ways into two identical books.
// ORDER-TYPES-LESSON-PLAN: asks 101×10, 102×25, 103×30; bid 100×20.
// Market: 10@101 + 20@102 = 3050, avg 101.67. Limit 101: fills 10@101, rests 20;
// a later sell of 8 fills it to 18, 12 still waiting. Avg 101.
import { C, F, W, H, clamp, ease, lerp, prog, tw, text, rgba, glow, ring, burst, line, pulse, rrect } from "../core.js";
import { titleCard, priceGrid, floatChip, camera, camPath, statement, tag, panel } from "../kit.js";

const PY = (p) => 540 - (p - 101.5) * 74;
const LX = 560;
const RX = 1360;
const QW = 8; // px per unit

const MKT = [
  { t: 6.0, price: 101, qty: 10 },
  { t: 7.6, price: 102, qty: 20 },
];
const LMT = [
  { t: 14.2, price: 101, qty: 10, side: "buy" },
  { t: 18.6, price: 101, qty: 8, side: "sell" },
];

function leftBook(t) {
  const a = { 101: 10, 102: 25, 103: 30 };
  for (const f of MKT) if (t >= f.t) a[f.price] -= f.qty;
  return { asks: a, bids: { 100: 20 } };
}
function rightBook(t) {
  const a = { 101: 10, 102: 25, 103: 30 };
  const b = { 100: 20, 101: 0 };
  if (t >= LMT[0].t) {
    a[101] = 0;
    b[101] = 20;
  }
  if (t >= LMT[1].t) b[101] = 12;
  return { asks: a, bids: b };
}
const mktFilled = (t) => MKT.filter((f) => t >= f.t).reduce((s, f) => s + f.qty, 0);
const lmtFilled = (t) => (t >= LMT[0].t ? 10 : 0) + (t >= LMT[1].t ? 8 : 0);

function drawBook(ctx, cx, bk, t, o) {
  const a = o.alpha;
  if (a <= 0) return;
  panel(ctx, cx - 330, PY(104.6), 660, PY(98.4) - PY(104.6), { alpha: a * 0.6, fillAlpha: 0.45 });
  text(ctx, o.title, cx, PY(104.6) - 22, {
    family: F.tc,
    size: 30,
    weight: 800,
    color: o.color,
    align: "center",
    alpha: a,
  });
  for (let p = 99; p <= 104; p++) {
    const y = PY(p);
    text(ctx, String(p), cx, y, {
      family: F.mono,
      size: 24,
      weight: 600,
      color: p === o.last ? C.gold : C.muted,
      align: "center",
      base: "middle",
      alpha: a,
    });
    const q = bk.asks[p] ?? 0;
    if (q > 0) {
      ctx.save();
      ctx.globalAlpha = a;
      rrect(ctx, cx + 40, y - 22, q * QW, 44, 6);
      ctx.fillStyle = rgba(C.sell, 0.7);
      ctx.fill();
      ctx.restore();
      text(ctx, `賣 ${q}`, cx + 52 + q * QW, y + 1, {
        family: F.display,
        size: 28,
        weight: 700,
        color: C.sell,
        base: "middle",
        alpha: a,
      });
    }
    const bq = bk.bids[p] ?? 0;
    if (bq > 0) {
      const mine = o.mine === p;
      ctx.save();
      ctx.globalAlpha = a;
      rrect(ctx, cx - 40 - bq * QW, y - 22, bq * QW, 44, 6);
      ctx.fillStyle = rgba(C.buy, mine ? 0.9 : 0.55);
      ctx.fill();
      if (mine) {
        ctx.strokeStyle = C.white;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
      text(ctx, `${mine ? "我的限價 " : "買 "}${bq}`, cx - 52 - bq * QW, y + 1, {
        family: F.display,
        size: 28,
        weight: 700,
        color: C.buy,
        align: "right",
        base: "middle",
        alpha: a,
      });
    }
  }
}

function orderChip(ctx, x, y, label, filled, t, o) {
  const a = o.alpha;
  if (a <= 0) return;
  panel(ctx, x - 250, y - 46, 500, 92, { alpha: a, color: o.color, borderAlpha: 0.7, accent: o.color });
  text(ctx, label, x - 224, y - 10, { family: F.tc, size: 28, weight: 800, color: C.text, base: "middle", alpha: a });
  const w = 450;
  ctx.save();
  ctx.globalAlpha = a;
  rrect(ctx, x - 224, y + 18, w, 10, 5);
  ctx.fillStyle = "#ffffff1c";
  ctx.fill();
  rrect(ctx, x - 224, y + 18, (w * filled) / 30, 10, 5);
  ctx.fillStyle = o.color;
  ctx.fill();
  ctx.restore();
  text(ctx, `已成交 ${filled} / 30`, x + 226, y - 10, {
    family: F.tc,
    size: 22,
    weight: 600,
    color: C.muted,
    align: "right",
    base: "middle",
    alpha: a,
  });
}

export const lesson = {
  id: "order-types",
  title: "市價單與限價單",
  duration: 30,
  description:
    "同樣買 30 隻：市價單依序吃掉 101 的 10 隻和 102 的 20 隻，均價 101.67；101 元限價單先買到 10 隻，剩 20 隻掛在 101 等待，後來有人賣出 8 隻，成交 18、還在等 12。",
  note: "市價要速度，\n限價要價格。",
  footer: "兩邊是各自獨立的模擬委託簿；不含手續費。限價單以非 Post Only、持續有效為例。",
  audio: "./motion/audio/order-types.m4a",
  music: {
    palette: "lift",
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 5.2, level: 2 },
      { t: 12, level: 1 },
      { t: 13.6, level: 2 },
      { t: 25, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "同樣買 30 隻" },
    { t: 4.4, label: "市價：一層不夠就往上" },
    { t: 12, label: "限價：價格定在 101" },
    { t: 22.2, label: "並排看結果" },
  ],
  captions: [
    { a: 2.4, b: 4.3, text: "同樣買 30 隻，你想怎麼買？" },
    { a: 4.4, b: 7.3, text: "市價單：先買最便宜的 101，10 隻。" },
    { a: 7.4, b: 11.9, text: "這一層不夠，就往上一層：102 再買 20。" },
    { a: 12.0, b: 15.9, text: "限價 101：有合適價格，也能立即成交。" },
    { a: 16.0, b: 18.4, text: "買不到的 20 隻，掛在 101 等人來賣。" },
    { a: 18.5, b: 22.1, text: "有人賣出 8 隻，成交 18，還在等 12。" },
    { a: 22.2, b: 30, text: "市價沿著掛賣成交，限價把最高買價定住。" },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    { t: 2.6, kind: "blip" },
    { t: 3.0, kind: "blip" },
    { t: 4.6, kind: "whoosh", dur: 0.6 },
    ...MKT.map((f) => ({ t: f.t, kind: "fill", price: f.price, side: "buy" })),
    { t: 9.0, kind: "coin" },
    { t: 12.2, kind: "whoosh", dur: 0.8 },
    { t: LMT[0].t, kind: "fill", price: 101, side: "buy" },
    { t: 15.2, kind: "blip", freq: 900 },
    { t: 17.9, kind: "whoosh", dur: 0.5 },
    { t: LMT[1].t, kind: "fill", price: 101, side: "sell" },
    { t: 22.2, kind: "whoosh", dur: 1 },
    { t: 24.4, kind: "stamp" },
  ],
  draw(ctx, t) {
    const stageA = tw(t, 2.0, 2.6);
    const cam = camPath(t, [
      { t: 0, x: W / 2, y: PY(101.5) + 30, z: 0.96 },
      { t: 4.4, x: W / 2, y: PY(101.5) + 30, z: 0.96 },
      { t: 5.3, x: LX + 60, y: PY(101.5) + 50, z: 1.28 },
      { t: 12.0, x: LX + 60, y: PY(101.5) + 50, z: 1.28 },
      { t: 13.1, x: RX + 20, y: PY(101.5) + 50, z: 1.28 },
      { t: 22.2, x: RX + 20, y: PY(101.5) + 50, z: 1.28 },
      { t: 23.6, x: W / 2, y: PY(101.5) + 50, z: 0.94 },
    ]);
    const lb = leftBook(t);
    const rb = rightBook(t);
    const lastL = t >= MKT[1].t ? 102 : t >= MKT[0].t ? 101 : null;
    const lastR = t >= LMT[0].t ? 101 : null;
    camera(ctx, cam, () => {
      priceGrid(ctx, t, { alpha: 0.35 * stageA, step: 74, oy: PY(101.5) + 37 });
      drawBook(ctx, LX, lb, t, {
        alpha: stageA * (1 - 0.6 * tw(t, 12, 13) * (1 - tw(t, 22.2, 23.2))),
        title: "市價買入 30",
        color: C.buy,
        last: lastL,
      });
      drawBook(ctx, RX, rb, t, {
        alpha: stageA * (1 - 0.6 * tw(t, 4.4, 5.2) * (1 - tw(t, 12, 12.8))),
        title: "限價買入 30 · 最高 101",
        color: C.gold,
        last: lastR,
        mine: 101,
      });
      // Order chips.
      orderChip(ctx, LX, PY(98.4) + 90, "市價買 30 隻", mktFilled(t), t, { alpha: stageA, color: C.buy });
      orderChip(ctx, RX, PY(98.4) + 90, "限價買 30 隻 @101", lmtFilled(t), t, { alpha: stageA, color: C.gold });
      // Market fills sweep upward.
      for (const f of MKT) {
        const x = LX + 40;
        const y = PY(f.price);
        const p = prog(t, f.t - 0.5, f.t);
        if (p > 0 && p < 1)
          glow(ctx, lerp(LX - 260, x, ease.inCubic(p)), lerp(PY(98.4) + 60, y, ease.inOutCubic(p)), 30, C.buy, 1);
        burst(ctx, x, y, t, f.t, { n: 22, speed: 420, seed: f.price, color: C.buy, flare: 100 });
        floatChip(ctx, `${f.qty} × ${f.price}`, x + 150, y - 40, t, f.t, { color: C.gold, size: 34 });
      }
      const avg = tw(t, 9.0, 9.4);
      if (avg > 0)
        tag(ctx, "均價 3050 ÷ 30 = 101.67", LX, PY(104.6) - 80, {
          align: "center",
          color: C.buy,
          alpha: avg * (1 - tw(t, 12, 12.4) + tw(t, 23.2, 23.6)),
          size: 26,
        });
      // Limit cap.
      const cap = tw(t, 13.2, 13.7) * (1 - tw(t, 22.2, 22.6));
      if (cap > 0) {
        line(ctx, RX - 320, PY(101) - 37, RX + 320, PY(101) - 37, C.gold, 3, cap, [12, 8]);
        text(ctx, "最高只付 101", RX - 318, PY(101) - 54, {
          family: F.tc,
          size: 24,
          weight: 800,
          color: C.gold,
          alpha: cap,
        });
      }
      const l0 = LMT[0];
      burst(ctx, RX + 40, PY(101), t, l0.t, { n: 22, speed: 420, seed: 7, color: C.buy, flare: 100 });
      floatChip(ctx, "10 × 101", RX + 190, PY(101) - 40, t, l0.t, { color: C.gold, size: 34 });
      const rest = tw(t, 15.0, 15.4) * (1 - tw(t, 22.2, 22.6));
      if (rest > 0)
        tag(ctx, "剩 20 隻：掛在 101 等待", RX - 40, PY(100) + 58, {
          align: "right",
          color: C.buy,
          alpha: rest,
          size: 22,
        });
      // A seller arrives and hits the resting limit.
      const s = prog(t, LMT[1].t - 0.9, LMT[1].t);
      if (s > 0 && s < 1) {
        const x = lerp(RX + 420, RX - 60, ease.inOutCubic(s));
        tag(ctx, "有人主動賣出 8", x, PY(101) - 70 * Math.sin(s * Math.PI), {
          align: "center",
          color: C.sell,
          solid: true,
          size: 22,
        });
      }
      burst(ctx, RX - 60, PY(101), t, LMT[1].t, { n: 22, speed: 420, seed: 9, color: C.sell, flare: 100 });
      floatChip(ctx, "8 × 101", RX - 200, PY(101) - 40, t, LMT[1].t, { color: C.gold, size: 34 });
      // Results.
      const res = tw(t, 23.4, 23.9);
      if (res > 0) {
        tag(ctx, "成交 30 · 均價 101.67 · 最新價 102", LX, PY(98.4) + 170, {
          align: "center",
          color: C.buy,
          alpha: res,
          size: 26,
          solid: false,
        });
        tag(ctx, "成交 18 · 均價 101 · 等待 12", RX, PY(98.4) + 170, {
          align: "center",
          color: C.gold,
          alpha: res,
          size: 26,
        });
      }
    });
    statement(ctx, t, 24.4, [{ text: "市價沿掛賣成交，限價把最高買價定住。", size: 50 }], { y: 130 });
    titleCard(ctx, t, {
      num: "04",
      kicker: "CONCEPT 04 · ORDER TYPES",
      title: "市價單與限價單",
      sub: "立即成交與指定價格",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
