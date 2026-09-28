// C01 K 線 — 一筆成交，怎麼變成 K 線？
// Book and candle share one price axis: every fill lands on the candle at the
// height it traded. Numbers follow the academy primer (MetaBear 熊, 元, 隻):
// 14:30 opens 100, a 5-unit buy lifts 101 → 103 → 110, sells return it to 98,
// close 99. The next minute forms O99 H101 L98 C100.
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
  bear,
  candle,
  line,
  pulse,
  spring,
  shake,
  rrect,
  measure,
  hexMix,
} from "../core.js";
import { titleCard, priceGrid, floatChip, camera, camPath, statement, scrim, tag } from "../kit.js";

const PY = (p) => 540 - (p - 104) * 46;
const COL = 760;
const ASK0 = 842;
const BID0 = 678;
const STEP = 42;
const BEAR = 34;
const CX = 1360;
const CW = 88;
const NX = 1220; // 14:31 candle

// ---- resting (maker) orders ----
const makers = [];
const add = (side, price, n, t0, from) => {
  for (let i = 0; i < n; i++) makers.push({ side, price, idx: i, arrive: t0 + i * 0.07, from, id: makers.length });
};
add("bid", 99, 5, 2.55, "left");
add("bid", 98, 3, 2.8, "left");
add("ask", 101, 2, 2.7, "right");
add("ask", 110, 1, 2.95, "right");
add("ask", 103, 2, 4.15, "swoop");
add("bid", 103, 5, 9.2, "left");
add("ask", 99, 1, 13.15, "right");

const fills = [
  { t: 6.2, side: "buy", price: 101, qty: 2, clock: "16.006" },
  { t: 7.0, side: "buy", price: 103, qty: 2, clock: "16.012" },
  { t: 8.25, side: "buy", price: 110, qty: 1, clock: "16.018", big: true },
  { t: 10.55, side: "sell", price: 103, qty: 2, clock: "31.204" },
  { t: 11.95, side: "sell", price: 103, qty: 3, clock: "44.310" },
  { t: 12.4, side: "sell", price: 99, qty: 5, clock: "44.318" },
  { t: 12.85, side: "sell", price: 98, qty: 1, clock: "44.325" },
  { t: 13.9, side: "buy", price: 99, qty: 1, clock: "58.912" },
];
const consumed = new Map();
for (const f of fills) {
  const side = f.side === "buy" ? "ask" : "bid";
  const queue = makers.filter((m) => m.side === side && m.price === f.price && !consumed.has(m.id));
  f.makers = queue.slice(0, f.qty);
  f.makers.forEach((m) => consumed.set(m.id, f.t));
}
const takerGroups = [
  { side: "buy", fills: [0, 1, 2], enter: 4.9, stage: [360, PY(105.2)], label: "買 5 隻 · 最多 110 元" },
  { side: "sell", fills: [3], enter: 9.95, stage: [1080, PY(105.3)], label: "賣 2 隻" },
  { side: "sell", fills: [4, 5, 6], enter: 11.2, stage: [1080, PY(105.3)], label: "賣 9 隻" },
  { side: "buy", fills: [7], enter: 13.3, stage: [360, PY(101.5)], label: "買 1 隻" },
];
const takers = [];
for (const g of takerGroups) {
  let k = 0;
  const n = g.fills.reduce((s, i) => s + fills[i].qty, 0);
  for (const fi of g.fills) {
    const f = fills[fi];
    f.makers.forEach((m, j) => {
      const col = k % 6;
      const row = Math.floor(k / 6);
      const dir = g.side === "buy" ? 1 : -1;
      const ox = (col - Math.min(n, 6) / 2 + 0.5) * 40 * dir;
      takers.push({
        g,
        f,
        m,
        stage: [g.stage[0] + ox, g.stage[1] + row * 40],
        launch: f.t - 0.42 - (f.makers.length - 1 - j) * 0.04,
      });
      k++;
    });
  }
}

// Next minute (14:31): trades that build O99 H101 L98 C100.
const NEXT = [
  { t: 18.5, price: 99, side: "sell" },
  { t: 19.2, price: 100, side: "buy" },
  { t: 19.8, price: 101, side: "buy" },
  { t: 20.6, price: 98, side: "sell" },
  { t: 21.4, price: 100, side: "buy" },
];
const HISTORY = [
  { x: 620, o: 100, h: 103, l: 99, c: 102, label: "14:26" },
  { x: 740, o: 102, h: 104, l: 101, c: 101, label: "14:27" },
  { x: 860, o: 101, h: 102, l: 97, c: 98, label: "14:28" },
  { x: 980, o: 98, h: 101, l: 97, c: 100, label: "14:29" },
];

function ohlc(t) {
  let h = 100;
  let l = 100;
  let c = 100;
  for (const f of fills)
    if (f.t <= t) {
      h = Math.max(h, f.price);
      l = Math.min(l, f.price);
      c = f.price;
    }
  return { o: 100, h, l, c };
}
function candleY(t) {
  let prev = { h: 100, l: 100, c: 100 };
  for (const f of fills) {
    const next = { h: Math.max(prev.h, f.price), l: Math.min(prev.l, f.price), c: f.price };
    if (t < f.t + 0.12) break;
    const p = ease.outCubic(prog(t, f.t + 0.12, f.t + (f.big ? 0.34 : 0.4)));
    if (p < 1)
      return {
        h: lerp(PY(prev.h), PY(next.h), p),
        l: lerp(PY(prev.l), PY(next.l), p),
        c: lerp(PY(prev.c), PY(next.c), p),
      };
    prev = next;
  }
  return { h: PY(prev.h), l: PY(prev.l), c: PY(prev.c) };
}
function nextCandle(t) {
  const done = NEXT.filter((n) => n.t <= t);
  if (!done.length) return null;
  const ps = done.map((n) => n.price);
  return { o: 99, h: Math.max(...ps), l: Math.min(...ps), c: ps[ps.length - 1] };
}

function slotOf(m, t) {
  let slot = m.idx;
  for (const o of makers)
    if (o.side === m.side && o.price === m.price && o.idx < m.idx && consumed.has(o.id))
      slot -= spring(t, consumed.get(o.id) + 0.1, 16, 9);
  return slot;
}
function makerPos(m, t) {
  const slot = slotOf(m, t);
  const x = m.side === "ask" ? ASK0 + slot * STEP : BID0 - slot * STEP;
  const y = PY(m.price);
  const a = t - m.arrive;
  if (a >= 0.45) return [x, y, 1];
  const p = ease.outCubic(clamp(a / 0.45));
  let fx;
  let fy;
  if (m.from === "left") [fx, fy] = [-80, y + 90];
  else if (m.from === "right") [fx, fy] = [W + 80, y - 90];
  else [fx, fy] = [x + 380, PY(110) - 60];
  const arc = Math.sin(p * Math.PI) * (m.from === "swoop" ? -70 : -40);
  return [lerp(fx, x, p), lerp(fy, y, p) + arc, clamp(a / 0.15)];
}

function drawBook(ctx, t, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const scan = [104, 105, 106, 107, 108, 109];
  const last = ohlc(t).c;
  for (let p = 96; p <= 112; p++) {
    const y = PY(p);
    const has = makers.some((m) => m.price === p && m.arrive <= t && (!consumed.has(m.id) || consumed.get(m.id) > t));
    const s = scan.includes(p) ? pulse(t, 7.55 + scan.indexOf(p) * 0.1, 5) : 0;
    line(ctx, 480, y, 1080, y, C.line, 1, (has ? 0.5 : 0.18) + s);
    if (s > 0.02) {
      ctx.fillStyle = rgba(C.sell, 0.12 * s);
      ctx.fillRect(480, y - 20, 600, 40);
    }
    text(ctx, String(p), COL, y, {
      family: F.mono,
      size: 22,
      weight: last === p ? 700 : 500,
      align: "center",
      base: "middle",
      color: last === p ? C.gold : has ? C.text : C.dim,
    });
  }
  const gapA = tw(t, 7.6, 7.9) * (1 - tw(t, 9.3, 9.7));
  if (gapA > 0) {
    ctx.save();
    ctx.globalAlpha *= gapA;
    ctx.strokeStyle = rgba(C.sell, 0.7);
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    rrect(ctx, 502, PY(109) - 24, 560, PY(104) - PY(109) + 48, 12);
    ctx.stroke();
    ctx.restore();
    text(ctx, "104–109 無人掛賣", 1040, PY(106.5), {
      family: F.tc,
      size: 26,
      weight: 700,
      color: C.sell,
      align: "right",
      base: "middle",
      alpha: gapA,
    });
  }
  text(ctx, "買方掛單 BID", BID0 + 18, PY(112.6), {
    family: F.mono,
    size: 16,
    weight: 600,
    color: C.buy,
    align: "right",
    ls: 3,
  });
  text(ctx, "ASK 賣方掛單", ASK0 - 18, PY(112.6), { family: F.mono, size: 16, weight: 600, color: C.sell, ls: 3 });
  ctx.restore();
}

function drawMakers(ctx, t, alpha) {
  if (alpha <= 0) return;
  for (const m of makers) {
    if (t < m.arrive) continue;
    const ct = consumed.get(m.id);
    if (ct !== undefined && t > ct + 0.02) continue;
    const [x, y, a] = makerPos(m, t);
    const col = m.side === "ask" ? C.sell : C.buy;
    const land = pulse(t, m.arrive + 0.45, 8);
    bear(ctx, x, y, BEAR * (1 + land * 0.18), col, a * alpha);
    if (m.from === "swoop") glow(ctx, x, y, 60, C.sell, land * 0.8);
  }
  const qj = tw(t, 4.5, 4.8) * (1 - tw(t, 5.6, 6.0));
  if (qj > 0)
    text(ctx, "較便宜的賣價，排在前面", ASK0 + 110, PY(103) - 34, {
      family: F.tc,
      size: 22,
      weight: 600,
      color: C.sell,
      alpha: qj * alpha,
    });
}

function drawTakers(ctx, t, alpha) {
  for (const g of takerGroups) {
    const mine = takers.filter((k) => k.g === g);
    const enterP = ease.outCubic(prog(t, g.enter, g.enter + 0.55));
    if (enterP <= 0) continue;
    const alive = mine.filter((k) => t < k.f.t);
    if (!alive.length) continue;
    const col = g.side === "buy" ? C.buy : C.sell;
    const xs = alive.map((k) => k.stage[0]);
    const ys = alive.map((k) => k.stage[1]);
    const capA = enterP * clamp((Math.min(...alive.map((k) => k.launch)) - t) / 0.2 + 1) * alpha;
    const x0 = Math.min(...xs) - 30;
    const x1 = Math.max(...xs) + 30;
    const y0 = Math.min(...ys) - 28;
    const y1 = Math.max(...ys) + 28;
    const slideIn = (1 - enterP) * (g.side === "buy" ? -500 : 500);
    ctx.save();
    ctx.globalAlpha = capA;
    ctx.translate(slideIn, 0);
    rrect(ctx, x0, y0, x1 - x0, y1 - y0, 26);
    ctx.fillStyle = rgba(col, 0.08);
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, g.label, g.side === "buy" ? x0 : x1, y0 - 14, {
      family: F.tc,
      size: 22,
      weight: 700,
      color: col,
      align: g.side === "buy" ? "left" : "right",
    });
    ctx.restore();
    for (const k of mine) {
      if (t >= k.f.t) continue;
      const fp = ease.inOutCubic(prog(t, k.launch, k.f.t));
      const [tx, ty] = makerPos(k.m, k.f.t);
      const x = lerp(k.stage[0] + slideIn, tx - (g.side === "buy" ? 22 : -22), fp);
      const y = lerp(k.stage[1], ty, fp) - Math.sin(fp * Math.PI) * 70;
      if (fp > 0 && fp < 1) glow(ctx, x, y, 40, col, 0.5);
      bear(ctx, x, y, BEAR, col, alpha * enterP, { rot: (g.side === "buy" ? 1 : -1) * Math.sin(fp * Math.PI) * 0.3 });
    }
  }
}

function drawFills(ctx, t) {
  for (const f of fills) {
    if (t < f.t - 0.01 || t > f.t + 1.6) continue;
    const y = PY(f.price);
    const x = f.side === "buy" ? ASK0 - 10 : BID0 + 10;
    const col = f.side === "buy" ? C.buy : C.sell;
    burst(ctx, x, y, t, f.t, {
      n: f.big ? 40 : 22,
      speed: f.big ? 700 : 420,
      seed: f.price * 3 + f.qty,
      color: f.big ? C.gold : col,
      flare: f.big ? 180 : 100,
    });
    ring(ctx, x, y, t, f.t, { r1: f.big ? 260 : 120, color: f.big ? C.gold : C.white, w: f.big ? 4 : 2 });
    floatChip(ctx, `${f.price} × ${f.qty}`, x + (f.side === "buy" ? 60 : -60), y - 44, t, f.t + 0.02, {
      color: C.gold,
      size: f.big ? 44 : 32,
    });
    for (let i = 0; i < 10; i++) {
      const d = i * 0.022;
      const p = ease.inOutCubic(prog(t, f.t + d, f.t + d + 0.34));
      if (p <= 0 || p >= 1) continue;
      glow(ctx, lerp(x, CX, p), y + Math.sin(p * Math.PI) * (i % 2 ? -14 : 14) * (1 - p), 14, col, 0.9);
    }
  }
}

function drawCandle(ctx, t, alpha, cx) {
  const s = ohlc(t);
  const y = candleY(t);
  const closed = t >= 15.0;
  const col = hexMix(C.buy, C.sell, tw(t, 12.4, 12.8));
  const hitGlow = fills.reduce((a, f) => a + pulse(t, f.t + 0.3, 6), 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  text(ctx, "14:30", cx, PY(112.6), { family: F.mono, size: 18, weight: 600, color: C.muted, align: "center", ls: 2 });
  candle(ctx, cx, CW, PY(100), y.h, y.l, y.c, {
    color: col,
    glow: 18 + hitGlow * 30,
    wickWidth: 4,
    minBody: 4,
    wickGlow: tw(t, 10.7, 11.2) * (1 - tw(t, 17.2, 17.7)) * 0.7,
    wickGlowColor: C.gold,
  });
  ctx.restore();
  if (t > 17.6) return;
  const lastY = PY(s.c);
  const la = alpha * (1 - tw(t, 15.3, 15.6));
  line(ctx, 1080, lastY, cx - CW / 2 - 14, lastY, C.gold, 1.5, 0.5 * la, [4, 6]);
  tag(ctx, closed ? `收盤 ${s.c}` : `最新成交 ${s.c}`, cx + CW / 2 + 20, lastY, {
    solid: closed,
    color: C.gold,
    alpha: la,
  });
  const oa = alpha * (1 - tw(t, 14.3, 14.7));
  line(ctx, cx - 80, PY(100), cx - CW / 2 - 6, PY(100), C.muted, 1, 0.6 * oa);
  text(ctx, "開 100", cx - 88, PY(100), {
    family: F.tc,
    size: 20,
    weight: 500,
    color: C.muted,
    align: "right",
    base: "middle",
    alpha: oa,
  });
  const wa = tw(t, 10.85, 11.3) * (1 - tw(t, 14.2, 14.6));
  if (wa > 0) {
    const wx = cx - 16;
    const wy = PY(109.5);
    line(ctx, wx, wy, wx - 70 * wa, wy + 50 * wa, C.gold, 1.5, wa);
    text(ctx, "上影線", wx - 84, wy + 44, {
      family: F.tc,
      size: 30,
      weight: 800,
      color: C.gold,
      alpha: wa,
      align: "right",
      base: "middle",
    });
    text(ctx, "曾成交過的最高價", wx - 84, wy + 82, {
      family: F.tc,
      size: 22,
      weight: 500,
      color: C.text,
      alpha: wa,
      align: "right",
      base: "middle",
    });
  }
}

// Candle anatomy after the close.
function drawAnatomy(ctx, t, cx) {
  const a = tw(t, 14.5, 14.9) * (1 - tw(t, 17.1, 17.6));
  if (a <= 0) return;
  const rows = [
    ["高 110", PY(110), C.text, 14.55],
    ["開 100", PY(100), C.muted, 14.7],
    ["收 99", PY(99), C.gold, 14.85],
    ["低 98", PY(98), C.text, 15.0],
  ];
  rows.forEach(([s, y, col, t0], i) => {
    const p = tw(t, t0, t0 + 0.3, ease.outCubic);
    const x = cx - CW / 2 - 28 - (1 - p) * 30;
    const yy = i === 2 ? y + 8 : i === 1 ? y - 8 : y;
    line(ctx, x + 6, y, cx - CW / 2 - 6, y, col, 1, 0.6 * p * a);
    text(ctx, s, x, yy, {
      family: F.display,
      size: 32,
      weight: 700,
      color: col,
      align: "right",
      base: "middle",
      alpha: p * a,
    });
  });
  const b = tw(t, 15.4, 15.8, ease.outCubic) * a;
  const rx = cx + CW / 2 + 26;
  ctx.save();
  ctx.globalAlpha = b;
  ctx.strokeStyle = C.muted;
  ctx.lineWidth = 1.5;
  for (const [y0, y1, label, col] of [
    [PY(110), PY(100), "上影線", C.gold],
    [PY(100), PY(99), "實體", C.sell],
    [PY(99), PY(98), "下影線", C.text],
  ]) {
    ctx.beginPath();
    ctx.moveTo(rx, y0 + 3);
    ctx.lineTo(rx + 12, y0 + 3);
    ctx.lineTo(rx + 12, y1 - 3);
    ctx.lineTo(rx, y1 - 3);
    ctx.stroke();
    text(ctx, label, rx + 24, (y0 + y1) / 2, { family: F.tc, size: 24, weight: 700, color: col, base: "middle" });
  }
  ctx.restore();
  const r = tw(t, 16.0, 16.4) * a;
  if (r > 0) tag(ctx, "收 < 開，K 線畫成橘色", cx + 60, PY(106.5), { color: C.sell, alpha: r, size: 24 });
}

function drawNext(ctx, t) {
  const k = nextCandle(t);
  const a = tw(t, 17.8, 18.2);
  if (a <= 0) return;
  const x = NX;
  text(ctx, "14:31", x, PY(112.6), {
    family: F.mono,
    size: 18,
    weight: 600,
    color: C.muted,
    align: "center",
    ls: 2,
    alpha: a,
  });
  if (!k) {
    line(ctx, x - 40, PY(99), x + 40, PY(99), C.muted, 1, 0.4 * a, [4, 6]);
    text(ctx, "等待第一筆成交…", x, PY(99) - 30, {
      family: F.tc,
      size: 20,
      weight: 500,
      color: C.muted,
      align: "center",
      alpha: a * (0.6 + 0.4 * Math.sin(t * 6)),
    });
    return;
  }
  const up = k.c >= k.o;
  candle(ctx, x, CW, PY(k.o), PY(k.h), PY(k.l), PY(k.c), {
    color: up ? C.buy : C.sell,
    glow: 18,
    wickWidth: 4,
    minBody: 4,
    alpha: a,
  });
  for (const n of NEXT) {
    const col = n.side === "buy" ? C.buy : C.sell;
    burst(ctx, x, PY(n.price), t, n.t, { n: 14, speed: 300, seed: n.price + 40, color: col, flare: 70 });
    floatChip(ctx, String(n.price), x + 90, PY(n.price), t, n.t, { color: col, size: 28, rise: 30, dur: 0.8 });
  }
}

function drawHistory(ctx, t) {
  const a = tw(t, 22.6, 23.6);
  if (a <= 0) return;
  HISTORY.forEach((h, i) => {
    const p = tw(t, 22.6 + i * 0.12, 23.2 + i * 0.12, ease.outCubic);
    candle(ctx, h.x, CW * 0.8, PY(h.o), PY(h.h), PY(h.l), PY(h.c), { alpha: p * 0.75, wickWidth: 3 });
    text(ctx, h.label, h.x, PY(112.6), {
      family: F.mono,
      size: 18,
      weight: 600,
      color: C.dim,
      align: "center",
      alpha: p,
    });
  });
}

export const lesson = {
  id: "matching",
  title: "K 線",
  duration: 28,
  description:
    "買賣雙方的掛單與一張 5 隻的買單逐筆成交；每筆成交都落在右側 K 線的同一價格高度，最後讀出開 100、高 110、低 98、收 99，並形成下一分鐘的 K 線。",
  note: "價格留下形狀，\n成交留下紀錄。",
  footer: "教學用合成行情：一隻熊代表一個委託單位，價格單位為元。",
  audio: "./motion/audio/matching.m4a",
  music: {
    palette: "deep",
    sections: [
      { t: 0, level: 0 },
      { t: 2.4, level: 1 },
      { t: 4.8, level: 2 },
      { t: 14.4, level: 1 },
      { t: 17.6, level: 2 },
      { t: 24.4, level: 0 },
    ],
  },
  chapters: [
    { t: 0, label: "買賣雙方，各自掛出價格" },
    { t: 4.9, label: "一張買單，吃掉三檔" },
    { t: 9.2, label: "賣出，留下上影線" },
    { t: 14.4, label: "收盤，讀懂開高低收" },
    { t: 17.6, label: "下一分鐘，下一根 K" },
  ],
  captions: [
    { a: 2.6, b: 4.9, text: "掛單只是在等待，價格還不會動。" },
    { a: 5.0, b: 7.4, text: "買 5 隻、最多付 110：先吃最便宜的 101。" },
    { a: 7.45, b: 9.2, text: "104–109 沒人賣，價格直接跳到 110。" },
    { a: 9.3, b: 11.3, text: "賣出 2 隻，K 線退回 103，高點留成上影線。" },
    { a: 11.4, b: 14.3, text: "賣單接連成交，跌破開盤價 100。" },
    { a: 14.4, b: 17.5, text: "收盤：開 100・高 110・低 98・收 99。" },
    { a: 17.6, b: 22.5, text: "下一分鐘的成交，畫出下一根 K 線。" },
    { a: 22.6, b: 28, text: "每根 K 線，都是一段時間成交的摘要。" },
  ],
  flashes: [],
  cues: [
    { t: 0, kind: "impact" },
    { t: 1.05, kind: "shimmer" },
    ...makers.map((m) => ({ t: m.arrive + 0.35, kind: "blip", vel: 0.25 })),
    { t: 4.15, kind: "whoosh", dur: 0.5 },
    ...takerGroups.map((g) => ({ t: g.enter, kind: "whoosh", dur: 0.45 })),
    ...fills.map((f) => ({ t: f.t, kind: "fill", price: f.price, side: f.side, big: !!f.big })),
    ...[104, 105, 106, 107, 108, 109].map((p, i) => ({ t: 7.55 + i * 0.1, kind: "scan", price: p })),
    { t: 8.25, kind: "impact" },
    { t: 15.0, kind: "stamp" },
    { t: 17.6, kind: "whoosh", dur: 0.8 },
    ...NEXT.map((n) => ({ t: n.t, kind: "fill", price: n.price, side: n.side, soft: true })),
    { t: 22.6, kind: "swell", dur: 1.6 },
    { t: 24.6, kind: "stamp" },
  ],
  draw(ctx, t) {
    const stageA = tw(t, 2.2, 2.8);
    const [sx, sy] = shake(t, 8.25, 16, 0.55);
    const [sx2, sy2] = shake(t, 12.4, 7, 0.4, 8);
    const cam = camPath(t, [
      { t: 0, x: W / 2, y: H / 2, z: 1 },
      { t: 14.3, x: W / 2, y: H / 2, z: 1.03 },
      { t: 15.3, x: CX + 50, y: PY(104), z: 1.5 },
      { t: 17.4, x: CX + 50, y: PY(104), z: 1.5 },
      { t: 18.6, x: 1180, y: PY(103.5), z: 1.4 },
      { t: 22.6, x: 1180, y: PY(103.5), z: 1.4 },
      { t: 24.2, x: 920, y: PY(101), z: 1.05 },
    ]);
    const bookA = stageA * (1 - tw(t, 14.3, 15.0) * 0.85) * (1 - tw(t, 16.8, 17.6));
    // The 14:30 candle slides left to make room for 14:31.
    const cx = lerp(CX, 1100, tw(t, 17.6, 18.4, ease.inOutCubic));
    camera(ctx, { ...cam, sx: sx + sx2, sy: sy + sy2 }, () => {
      priceGrid(ctx, t, { alpha: 0.6 * stageA, step: 46, oy: PY(104) });
      drawBook(ctx, t, bookA);
      drawMakers(ctx, t, stageA * (1 - tw(t, 14.3, 15.0)));
      drawTakers(ctx, t, stageA);
      drawHistory(ctx, t);
      drawCandle(ctx, t, stageA, cx);
      drawAnatomy(ctx, t, cx);
      drawNext(ctx, t);
      drawFills(ctx, t);
      const axisA = tw(t, 17.8, 18.4);
      if (axisA > 0)
        for (let p = 96; p <= 112; p += 2)
          text(ctx, String(p), 1540, PY(p), {
            family: F.mono,
            size: 20,
            weight: 500,
            color: C.dim,
            align: "left",
            base: "middle",
            alpha: axisA,
          });
      const jb = tw(t, 8.0, 8.25, ease.inExpo) * (1 - tw(t, 8.5, 9.2));
      if (jb > 0) {
        line(ctx, ASK0 - 10, PY(103), ASK0 - 10, lerp(PY(103), PY(110), tw(t, 8.0, 8.25, ease.inExpo)), C.gold, 3, jb);
        glow(ctx, ASK0 - 10, PY(110), 90, C.gold, jb);
      }
    });
    const sA = tw(t, 24.4, 25.0);
    scrim(ctx, sA * 0.55, 700, 1080);
    statement(
      ctx,
      t,
      24.6,
      [
        { text: "每一段時間的成交，", size: 60 },
        { text: "留下一根 K 線。", size: 60 },
      ],
      { y: 850 },
    );
    titleCard(ctx, t, {
      num: "01",
      kicker: "CONCEPT 01 · CANDLESTICK",
      title: "K 線",
      sub: "一筆成交，怎麼變成 K 線？",
      outA: 1.9,
      outB: 2.5,
    });
  },
};
