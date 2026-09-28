// S02 突破誘多，高位吸收，反轉出貨 — one ledger drives candles, volume, CVD and book.
// ABSORPTION-STORY-LESSON-PLAN: bars 0–2 vol 20 (Δ+10); tests 3/4/5 vol 100/120/150
// (Δ+60/+80/+110, high 104); bar 6 breakout O104 H106 L104 C106 vol 110 Δ+90;
// bar 7 high absorption at 106: buy 260 / sell 20, H106; bar 8 sell 280 / buy 40 → 102.
// Total 1140, CVD peak 620, final 370. 104 wall 180 → (−120) 60 → cancel 50 → 10.
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
  fmt,
  shake,
} from "../core.js";
import { titleCard, priceGrid, floatChip, camera, camPath, statement, tag, panel } from "../kit.js";

const PY = (p) => 470 - (p - 104) * 62;
const X = (i) => 300 + i * 118;
const VB = 900;
const VS = 0.42;
const DOMX = 1480; // book price column
const HIST = [
  { o: 100, h: 101, l: 100, c: 101, v: 20, d: 10 },
  { o: 101, h: 102, l: 100, c: 101, v: 20, d: 10 },
  { o: 101, h: 102, l: 101, c: 102, v: 20, d: 10 },
  { o: 102, h: 104, l: 102, c: 103, v: 100, d: 60 },
  { o: 103, h: 104, l: 102, c: 103, v: 120, d: 80 },
];
// Replayed trades (bars 5–8).
const TR = [
  [8.4, 5, "buy", 103, 10],
  [9.0, 5, "sell", 103, 10],
  [9.8, 5, "buy", 104, 40],
  [10.8, 5, "buy", 104, 30],
  [11.4, 5, "sell", 103, 10],
  [12.0, 5, "buy", 104, 50],
  [12.6, 5, "buy", 104, 0],
  [14.6, 6, "buy", 104, 10],
  [15.4, 6, "buy", 105, 30],
  [16.2, 6, "buy", 106, 30],
  [17.0, 6, "sell", 105, 10],
  [17.8, 6, "buy", 106, 30],
  [20.6, 7, "buy", 106, 40],
  [21.9, 7, "buy", 106, 70],
  [22.6, 7, "buy", 106, 50],
  [23.7, 7, "sell", 105, 20],
  [24.3, 7, "buy", 106, 60],
  [25.0, 7, "buy", 106, 40],
  [28.4, 8, "buy", 106, 10],
  [29.2, 8, "sell", 105, 60],
  [30.0, 8, "sell", 104, 60],
  [30.8, 8, "buy", 104, 30],
  [31.6, 8, "sell", 103, 80],
  [32.6, 8, "sell", 102, 80],
]
  .filter((x) => x[4] > 0)
  .map(([t, bar, side, price, qty]) => ({ t, bar, side, price, qty }));
// Book events at 104 and 106 (asks).
const ADDS106 = [
  [21.2, 120],
  [23.2, 100],
  [25.6, 80],
];
const CANCEL104 = 13.5;
const REPLAY = 7.6;
const OUT = [36.2, 38.2];

function barsAt(t) {
  const bars = HIST.map((b) => ({ ...b, vis: b.v }));
  const replaying = t >= REPLAY;
  // Before the replay only bars 0–5 exist; 6–8 form as the replay reaches them.
  // After the zoom-out the full history (including the new bars) is kept.
  const complete = t >= OUT[0];
  for (let i = 5; i <= 8; i++) {
    const trades = TR.filter((x) => x.bar === i && (complete || (replaying ? x.t <= t : i === 5)));
    if (!trades.length) {
      bars.push(null);
      continue;
    }
    const ps = trades.map((x) => x.price);
    const buy = trades.filter((x) => x.side === "buy").reduce((s, x) => s + x.qty, 0);
    const sell = trades.filter((x) => x.side === "sell").reduce((s, x) => s + x.qty, 0);
    const vis = trades.reduce(
      (s, x) => s + x.qty * (replaying && !complete ? ease.outCubic(prog(t, x.t, x.t + 0.35)) : 1),
      0,
    );
    bars.push({ o: ps[0], h: Math.max(...ps), l: Math.min(...ps), c: ps.at(-1), v: buy + sell, d: buy - sell, vis });
  }
  return bars;
}
function cvdAt(t) {
  let v = 30 + 60 + 80;
  for (const x of TR) if (t < REPLAY ? x.bar === 5 : x.t <= t) v += x.side === "buy" ? x.qty : -x.qty;
  return v;
}
function ask104(t) {
  if (t < REPLAY) return 180;
  let q = 180;
  for (const x of TR) if (x.price === 104 && x.side === "buy" && x.bar === 5 && x.t <= t) q -= x.qty;
  if (t >= CANCEL104) q -= 50;
  if (t >= 14.6) q -= 10;
  return Math.max(0, q);
}
function ask106(t) {
  if (t < REPLAY) return 100;
  let q = 100;
  for (const x of TR) if (x.price === 106 && x.side === "buy" && x.t <= t) q -= x.qty;
  for (const [ta, qa] of ADDS106) if (t >= ta) q += qa;
  return Math.max(0, q);
}
const lastPrice = (t) => {
  let p = 104;
  for (const x of TR) if (x.t <= t) p = x.price;
  return t < REPLAY ? 102 : p;
};

export const lesson = {
  id: "absorption-story",
  title: "突破誘多，高位吸收，反轉出貨",
  duration: 44,
  description:
    "三次放量測試 104 都沒站上；104 的賣單被買掉 120、又撤掉 50，只剩 10，下一根突破到 106。高位主動買入 260 隻，106 的賣單卻一再補回，價格停在 106；最後主動賣出 280 隻，一路回到 102。",
  note: "買得最多的地方，\n賣單也一直補。",
  footer:
    "教學用合成行情，逐筆帳本同時產生 K 線、量柱、CVD 與掛單；「出貨」是本例路徑的敘事解讀，匿名成交無法證實同一人所為。",
  audio: "./motion/audio/absorption-story.m4a",
  music: {
    palette: "tense",
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 8.2, level: 2 },
      { t: 14.4, level: 3 },
      { t: 18.6, level: 2 },
      { t: 28.2, level: 3 },
      { t: 33.4, level: 1 },
      { t: 38.6, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "三次測壓 104" },
    { t: 7.6, label: "賣單被吃、又被撤" },
    { t: 14.2, label: "突破到 106" },
    { t: 20.2, label: "高位吸收" },
    { t: 28.2, label: "賣方接手" },
    { t: 36.2, label: "回到九根全景" },
  ],
  captions: [
    { a: 2.4, b: 7.5, text: "三次放量測試 104，都沒有站上去。" },
    { a: 7.6, b: 13.4, text: "回看第三次：104 的 180 隻賣單，被買掉 120。" },
    { a: 13.5, b: 14.1, text: "接著撤掉 50：只剩 10 隻。" },
    { a: 14.2, b: 20.1, text: "賣單變薄，下一根的買單直接突破到 106。" },
    { a: 20.2, b: 28.1, text: "主動買入 260 隻，106 的賣單卻一再補回：價格停住。" },
    { a: 28.2, b: 36.1, text: "賣方接手：主動賣出 280 隻，一路回到 102。" },
    { a: 36.2, b: 44, text: "放量突破後被高位吸收，再由賣方接手：一種可能的出貨路徑。" },
  ],
  flashes: [
    { t: 16.2, amt: 0.25, decay: 8 },
    { t: 29.2, amt: 0.3, decay: 7 },
  ],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    ...HIST.map((_, i) => ({ t: 2.3 + i * 0.14, kind: "blip", vel: 0.25 })),
    ...[3, 4].map((i) => ({ t: 2.3 + i * 0.14 + 0.25, kind: "scan", price: 104 })),
    { t: 6.2, kind: "whoosh", dur: 1.2 },
    { t: REPLAY, kind: "drain", dur: 0.4 },
    ...TR.map((x) => ({ t: x.t, kind: "fill", price: x.price, side: x.side, soft: x.bar === 7 })),
    { t: CANCEL104, kind: "drain", dur: 0.5 },
    { t: 16.2, kind: "impact" },
    ...ADDS106.map(([t]) => ({ t, kind: "rise", dur: 0.4 })),
    { t: 28.2, kind: "impact", big: true },
    { t: 29.0, kind: "rumble", dur: 3.8 },
    { t: OUT[0], kind: "whoosh", dur: 1.6 },
    { t: 38.8, kind: "stamp" },
  ],
  draw(ctx, t) {
    const a = tw(t, 2.0, 2.6);
    const bars = barsAt(t);
    const last = lastPrice(t);
    const cam = camPath(t, [
      { t: 0, x: 1040, y: 560, z: 0.95 },
      { t: 6.2, x: 1040, y: 560, z: 0.95 },
      { t: 7.6, x: 1320, y: 560, z: 1.2 },
      { t: OUT[0], x: 1320, y: 560, z: 1.2 },
      { t: OUT[1], x: 1040, y: 560, z: 0.95 },
    ]);
    const [sx, sy] = shake(t, 28.2, 12, 0.5, 6);
    camera(ctx, { ...cam, sx, sy }, () => {
      priceGrid(ctx, t, { alpha: 0.3 * a, step: 62, oy: PY(104) });
      for (let p = 100; p <= 107; p++) {
        line(ctx, 240, PY(p), 1400, PY(p), C.line, 1, a * 0.4);
        text(ctx, String(p), DOMX, PY(p), {
          family: F.mono,
          size: 22,
          weight: p === last ? 700 : 500,
          color: p === last ? C.gold : C.muted,
          align: "center",
          base: "middle",
          alpha: a,
        });
      }
      // Resistance ceiling at 104 during the tests.
      const ceil = tw(t, 3.0, 3.5) * (1 - tw(t, 16, 16.6));
      if (ceil > 0) {
        line(ctx, X(2), PY(104) - 6, X(5) + 60, PY(104) - 6, C.sell, 2.5, ceil, [10, 8]);
        text(ctx, "104 · 三次測試", X(3) - 40, PY(104) - 30, {
          family: F.tc,
          size: 24,
          weight: 800,
          color: C.sell,
          alpha: ceil,
        });
      }
      // Candles + volume.
      bars.forEach((b, i) => {
        const pop = i < 6 ? tw(t, 2.2 + i * 0.14, 2.7 + i * 0.14) : 1;
        if (!b) {
          ctx.save();
          ctx.globalAlpha = a * 0.3;
          ctx.strokeStyle = C.line;
          ctx.setLineDash([5, 6]);
          rrect(ctx, X(i) - 30, PY(107), 60, PY(100) - PY(107), 6);
          ctx.stroke();
          ctx.restore();
          return;
        }
        const replayBar = i >= 5 && t >= REPLAY && t < OUT[0];
        candle(ctx, X(i), 58, PY(b.o), PY(b.h), PY(b.l), PY(b.c), {
          alpha: a * pop,
          wickWidth: 3,
          minBody: 5,
          glow: replayBar ? 14 : 0,
        });
        const col = b.c >= b.o ? C.buy : C.sell;
        ctx.save();
        ctx.globalAlpha = a * pop;
        rrect(ctx, X(i) - 28, VB - b.vis * VS, 56, b.vis * VS, 4);
        ctx.fillStyle = rgba(col, 0.55);
        ctx.fill();
        ctx.restore();
        text(ctx, String(b.v), X(i), VB - b.vis * VS - 14, {
          family: F.display,
          size: 24,
          weight: 700,
          color: C.text,
          align: "center",
          alpha: a * pop,
        });
        text(ctx, `Δ ${signed(b.d)}`, X(i), VB + 30, {
          family: F.mono,
          size: 16,
          weight: 600,
          color: b.d >= 0 ? C.buy : C.sell,
          align: "center",
          alpha: a * pop * 0.9,
        });
      });
      text(ctx, "量", 250, VB - 20, { family: F.tc, size: 20, weight: 700, color: C.muted, alpha: a });
      // Book (asks at 104/106, bids for the drop).
      const q104 = ask104(t);
      const q106 = ask106(t);
      const bids = { 105: 60, 104: 90, 103: 80, 102: 120 };
      for (const x of TR) if (x.side === "sell" && x.bar === 8 && x.t <= t) bids[x.price] -= x.qty;
      const bookA = a;
      const bar = (p, q, side, hl) => {
        if (q <= 0) return;
        const w = q * 1.4;
        const y = PY(p);
        ctx.save();
        ctx.globalAlpha = bookA;
        if (side === "ask") rrect(ctx, DOMX + 36, y - 22, w, 44, 5);
        else rrect(ctx, DOMX - 36 - w, y - 22, w, 44, 5);
        ctx.fillStyle = rgba(side === "ask" ? C.sell : C.buy, 0.55 + hl * 0.35);
        if (hl) {
          ctx.shadowColor = side === "ask" ? C.sell : C.buy;
          ctx.shadowBlur = 20 * hl;
        }
        ctx.fill();
        ctx.restore();
        text(ctx, String(Math.round(q)), side === "ask" ? DOMX + 46 + w : DOMX - 46 - w, y + 1, {
          family: F.display,
          size: 26,
          weight: 700,
          color: side === "ask" ? C.sell : C.buy,
          align: side === "ask" ? "left" : "right",
          base: "middle",
          alpha: bookA,
        });
      };
      bar(104, q104, "ask", pulse(t, CANCEL104, 3));
      bar(105, t < 15.4 ? 30 : 0, "ask", 0);
      bar(
        106,
        q106,
        "ask",
        ADDS106.reduce((s, [ta]) => s + pulse(t, ta, 3), 0),
      );
      bar(107, 60, "ask", 0);
      if (t >= 28) for (const [p, q] of Object.entries(bids)) bar(Number(p), q, "bid", 0);
      text(ctx, "掛單簿", DOMX, PY(107.8), {
        family: F.tc,
        size: 22,
        weight: 800,
        color: C.muted,
        align: "center",
        alpha: a,
      });
      // Event labels.
      const cxl = tw(t, CANCEL104, CANCEL104 + 0.3) * (1 - tw(t, 14.4, 14.8));
      if (cxl > 0) tag(ctx, "撤單 −50：沒有成交", DOMX + 60, PY(103.2), { color: "#ff8a7f", alpha: cxl, size: 22 });
      for (const [ta, qa] of ADDS106)
        floatChip(ctx, `補 +${qa}`, DOMX + 150, PY(106) - 44, t, ta, { color: C.sell, size: 30, dur: 1.2 });
      const brk = tw(t, 16.2, 16.6) * (1 - tw(t, 19.6, 20));
      if (brk > 0)
        tag(ctx, "突破 104", X(6), PY(107.4), { align: "center", color: C.buy, solid: true, alpha: brk, size: 24 });
      const abs = tw(t, 22.0, 22.4) * (1 - tw(t, 27.8, 28.2));
      if (abs > 0) {
        line(ctx, X(6) - 40, PY(106) - 6, DOMX - 40, PY(106) - 6, C.sell, 3, abs, [10, 8]);
        tag(ctx, "高位吸收：買入 260，價格仍是 106", X(7), PY(107.3), {
          align: "center",
          color: C.sell,
          alpha: abs,
          size: 24,
        });
      }
      const dist = tw(t, 33.2, 33.6);
      if (dist > 0)
        tag(ctx, "可能的出貨路徑", X(8) + 10, PY(101.1), { align: "center", color: C.gold, alpha: dist, size: 24 });
      // Trade sparks.
      for (const x of TR) {
        if (t < REPLAY || t >= OUT[0]) continue;
        const col = x.side === "buy" ? C.buy : C.sell;
        burst(ctx, X(x.bar), PY(x.price), t, x.t, {
          n: x.qty >= 50 ? 22 : 12,
          speed: 300 + x.qty * 3,
          seed: x.price * 7 + x.bar,
          color: col,
          flare: 50 + x.qty,
        });
        burst(ctx, DOMX + (x.side === "buy" ? 36 : -36), PY(x.price), t, x.t, {
          n: 8,
          speed: 200,
          seed: x.qty + 3,
          color: col,
          flare: 40,
        });
      }
    });
    // CVD readout (screen space).
    const cv = cvdAt(t);
    const cA = a * tw(t, 2.6, 3.2);
    panel(ctx, 1540, 120, 300, 130, { alpha: cA, color: C.gold, borderAlpha: 0.5, accent: C.gold });
    text(ctx, "CVD（本段累計）", 1566, 162, { family: F.tc, size: 22, weight: 600, color: C.muted, alpha: cA });
    text(ctx, signed(cv), 1566, 226, { family: F.display, size: 56, weight: 700, color: C.gold, alpha: cA, glow: 10 });
    const rp = tw(t, REPLAY - 0.2, REPLAY + 0.2) * (1 - tw(t, 9.2, 9.8));
    if (rp > 0)
      tag(ctx, "回看第三次測試 · 前面各根不變", W / 2, 140, { align: "center", color: C.gold, alpha: rp, size: 24 });
    const hist = tw(t, 2.8, 3.2) * (1 - tw(t, 6, 6.4));
    if (hist > 0) tag(ctx, "已完成的模擬行情", 140, 150, { color: C.muted, alpha: hist, size: 22 });
    statement(
      ctx,
      t,
      38.8,
      [
        { text: "突破後買得最多的地方，", size: 54 },
        { text: "賣單也一直補上。", size: 54 },
      ],
      { y: 150, gap: 76 },
    );
    titleCard(ctx, t, {
      num: "S2",
      kicker: "STORY 02 · ABSORPTION",
      title: "突破誘多，高位吸收，反轉出貨",
      sub: "測壓、吸收與賣出接手",
      titleSize: 68,
      outA: 1.9,
      outB: 2.5,
    });
  },
};
