// Chapter 01 — 一筆成交，怎麼變成 K 線？
// Book and candle share one price axis: every fill lands on the candle at the
// exact height it traded. Prices/sizes follow the academy primer (MetaBear 熊).
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
  fmt,
  measure,
  hexMix,
} from "../core.js";
import { chapterCard, captions, priceGrid, floatChip } from "../common.js";

const PY = (p) => 540 - (p - 104) * 46;
const COL = 760; // price label column
const ASK0 = 842;
const BID0 = 678;
const STEP = 42;
const BEAR = 34;
const CX = 1360; // candle
const CW = 88;

// ---- resting (maker) orders ----
const makers = [];
const add = (side, price, n, t0, from) => {
  for (let i = 0; i < n; i++)
    makers.push({
      side,
      price,
      idx: i,
      arrive: t0 + i * 0.07,
      from,
      id: makers.length,
    });
};
add("bid", 99, 5, 2.55, "left");
add("bid", 98, 3, 2.8, "left");
add("ask", 101, 2, 2.7, "right");
add("ask", 110, 1, 2.95, "right");
add("ask", 103, 2, 4.15, "swoop");
add("bid", 103, 5, 9.2, "left");
add("ask", 99, 1, 13.15, "right");

// ---- fills (taker side, time, price, qty) ----
const fills = [
  { t: 6.2, side: "buy", price: 101, qty: 2, clock: "14:30:16.006" },
  { t: 7.0, side: "buy", price: 103, qty: 2, clock: "14:30:16.012" },
  {
    t: 8.25,
    side: "buy",
    price: 110,
    qty: 1,
    clock: "14:30:16.018",
    big: true,
  },
  { t: 10.55, side: "sell", price: 103, qty: 2, clock: "14:30:31.204" },
  { t: 11.95, side: "sell", price: 103, qty: 3, clock: "14:30:44.310" },
  { t: 12.4, side: "sell", price: 99, qty: 5, clock: "14:30:44.318" },
  { t: 12.85, side: "sell", price: 98, qty: 1, clock: "14:30:44.325" },
  { t: 13.9, side: "buy", price: 99, qty: 1, clock: "14:30:58.912" },
];

// Assign each fill's makers FIFO at its level.
const consumed = new Map();
for (const f of fills) {
  const side = f.side === "buy" ? "ask" : "bid";
  const queue = makers.filter(
    (m) => m.side === side && m.price === f.price && !consumed.has(m.id),
  );
  f.makers = queue.slice(0, f.qty);
  f.makers.forEach((m) => consumed.set(m.id, f.t));
}

// Taker groups: where their bears wait before firing.
const takerGroups = [
  {
    side: "buy",
    fills: [0, 1, 2],
    enter: 4.9,
    stage: [360, PY(105.2)],
    label: "買 5 隻 · 最多 110 元",
  },
  {
    side: "sell",
    fills: [3],
    enter: 9.95,
    stage: [1080, PY(105.3)],
    label: "賣 2 隻",
  },
  {
    side: "sell",
    fills: [4, 5, 6],
    enter: 11.2,
    stage: [1080, PY(105.3)],
    label: "賣 9 隻",
  },
  {
    side: "buy",
    fills: [7],
    enter: 13.3,
    stage: [360, PY(101.5)],
    label: "買 1 隻",
  },
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
        k,
        stage: [g.stage[0] + ox, g.stage[1] + row * 40],
        launch: f.t - 0.42 - (f.makers.length - 1 - j) * 0.04,
      });
      k++;
    });
  }
}

export const cues = [
  { t: 0, kind: "impact" },
  ...makers.map((m) => ({ t: m.arrive + 0.35, kind: "blip", vel: 0.25 })),
  { t: 4.15, kind: "whoosh", dur: 0.5 },
  ...takerGroups.map((g) => ({ t: g.enter, kind: "whoosh", dur: 0.45 })),
  ...fills.map((f) => ({
    t: f.t,
    kind: "fill",
    price: f.price,
    qty: f.qty,
    side: f.side,
    big: !!f.big,
  })),
  ...[104, 105, 106, 107, 108, 109].map((p, i) => ({
    t: 7.55 + i * 0.1,
    kind: "scan",
    price: p,
  })),
  { t: 8.25, kind: "impact" },
  { t: 15.05, kind: "stamp" },
  { t: 16.4, kind: "riser", dur: 1.6 },
];

// ---- derived market state ----
function tradesUntil(t) {
  return fills.filter((f) => f.t <= t);
}
function ohlc(t) {
  let o = 100;
  let h = 100;
  let l = 100;
  let c = 100;
  for (const f of tradesUntil(t)) {
    h = Math.max(h, f.price);
    l = Math.min(l, f.price);
    c = f.price;
  }
  return { o, h, l, c };
}
/** Visual (animated) candle extremes: each fill eases the candle out over 0.28 s. */
function candleY(t) {
  let prev = { o: 100, h: 100, l: 100, c: 100 };
  let y = { h: PY(100), l: PY(100), c: PY(100) };
  for (const f of fills) {
    const next = {
      o: 100,
      h: Math.max(prev.h, f.price),
      l: Math.min(prev.l, f.price),
      c: f.price,
    };
    const p = ease.outCubic(prog(t, f.t + 0.12, f.t + (f.big ? 0.34 : 0.4)));
    y = {
      h: lerp(PY(prev.h), PY(next.h), p),
      l: lerp(PY(prev.l), PY(next.l), p),
      c: lerp(PY(prev.c), PY(next.c), p),
    };
    if (t < f.t + 0.12) {
      y = { h: PY(prev.h), l: PY(prev.l), c: PY(prev.c) };
      break;
    }
    prev = next;
  }
  return y;
}

function slotOf(m, t) {
  // Makers ahead in the same queue that have been consumed slide the queue forward.
  const ahead = makers.filter(
    (o) =>
      o.side === m.side &&
      o.price === m.price &&
      o.idx < m.idx &&
      consumed.has(o.id),
  );
  let slot = m.idx;
  for (const o of ahead) slot -= spring(t, consumed.get(o.id) + 0.1, 16, 9);
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
  let fy = y;
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
  const scanLevels = [104, 105, 106, 107, 108, 109];
  for (let p = 96; p <= 112; p++) {
    const y = PY(p);
    const hasOrders = makers.some(
      (m) =>
        m.price === p &&
        m.arrive <= t &&
        (!consumed.has(m.id) || consumed.get(m.id) > t),
    );
    const scan = scanLevels.includes(p)
      ? pulse(t, 7.55 + scanLevels.indexOf(p) * 0.1, 5)
      : 0;
    const rowA = hasOrders ? 0.5 : 0.18;
    line(ctx, 480, y, 1080, y, C.line, 1, rowA + scan);
    if (scan > 0.02) {
      ctx.save();
      ctx.fillStyle = rgba(C.sell, 0.12 * scan);
      ctx.fillRect(480, y - 20, 600, 40);
      ctx.restore();
    }
    const isLast = ohlc(t).c === p;
    text(ctx, String(p), COL, y, {
      family: F.mono,
      size: 22,
      weight: isLast ? 700 : 500,
      align: "center",
      base: "middle",
      color: isLast ? C.gold : hasOrders ? C.text : C.dim,
    });
  }
  // 104–109 "no trades" note.
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
  // side headers
  text(ctx, "買方掛單 BID", BID0 + 18, PY(112.6), {
    family: F.mono,
    size: 16,
    weight: 600,
    color: C.buy,
    align: "right",
    ls: 3,
  });
  text(ctx, "ASK 賣方掛單", ASK0 - 18, PY(112.6), {
    family: F.mono,
    size: 16,
    weight: 600,
    color: C.sell,
    ls: 3,
  });
  ctx.restore();
}

function drawMakers(ctx, t, alpha) {
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
  // Highlight the queue-jumper.
  const qj = tw(t, 4.5, 4.8) * (1 - tw(t, 5.6, 6.0));
  if (qj > 0) {
    text(ctx, "較便宜的賣價，排在前面", ASK0 + 110, PY(103) - 34, {
      family: F.tc,
      size: 22,
      weight: 600,
      color: C.sell,
      alpha: qj,
    });
  }
}

function drawTakers(ctx, t, alpha) {
  for (const g of takerGroups) {
    const mine = takers.filter((k) => k.g === g);
    const enterP = ease.outCubic(prog(t, g.enter, g.enter + 0.55));
    if (enterP <= 0) continue;
    const alive = mine.filter((k) => t < k.f.t);
    if (!alive.length) continue;
    const col = g.side === "buy" ? C.buy : C.sell;
    // capsule
    const xs = alive.map((k) => k.stage[0]);
    const ys = alive.map((k) => k.stage[1]);
    const capA =
      enterP *
      clamp((Math.min(...alive.map((k) => k.launch)) - t) / 0.2 + 1) *
      alpha;
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
      const [sx, sy] = [k.stage[0] + slideIn, k.stage[1]];
      const fp = ease.inOutCubic(prog(t, k.launch, k.f.t));
      const [tx, ty] = makerPos(k.m, k.f.t);
      const x = lerp(sx, tx - (g.side === "buy" ? 22 : -22), fp);
      const y = lerp(sy, ty, fp) - Math.sin(fp * Math.PI) * 70;
      const trailA = fp > 0 && fp < 1 ? 0.6 : 0;
      if (trailA) glow(ctx, x, y, 40, col, 0.5);
      bear(ctx, x, y, BEAR, col, alpha * enterP, {
        rot: (g.side === "buy" ? 1 : -1) * Math.sin(fp * Math.PI) * 0.3,
      });
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
    ring(ctx, x, y, t, f.t, {
      r1: f.big ? 260 : 120,
      color: f.big ? C.gold : C.white,
      w: f.big ? 4 : 2,
    });
    floatChip(
      ctx,
      `${f.price} × ${f.qty}`,
      x + (f.side === "buy" ? 60 : -60),
      y - 44,
      t,
      f.t + 0.02,
      { color: C.gold, size: f.big ? 44 : 32 },
    );
    // particle stream along the shared price row into the candle
    for (let i = 0; i < 10; i++) {
      const d = i * 0.022;
      const p = ease.inOutCubic(prog(t, f.t + d, f.t + d + 0.34));
      if (p <= 0 || p >= 1) continue;
      const px = lerp(x, CX, p);
      const py = y + Math.sin(p * Math.PI) * (i % 2 ? -14 : 14) * (1 - p);
      glow(ctx, px, py, 14, col, 0.9);
    }
  }
}

function drawCandle(ctx, t, alpha) {
  if (alpha <= 0) return;
  const s = ohlc(t);
  const y = candleY(t);
  const closed = t >= 15.0;
  const down = s.c < s.o;
  const col = hexMix(C.buy, C.sell, tw(t, 12.4, 12.8));
  const hitGlow = fills.reduce((a, f) => a + pulse(t, f.t + 0.3, 6), 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  // time frame
  text(ctx, "14:30 · 一分鐘 K 線", CX, PY(112.6), {
    family: F.mono,
    size: 16,
    weight: 600,
    color: C.muted,
    align: "center",
    ls: 2,
  });
  const wickHi = pulse(t, 10.9, 1.2) * tw(t, 10.8, 11.1);
  candle(ctx, CX, CW, PY(100), y.h, y.l, y.c, {
    color: col,
    glow: 18 + hitGlow * 30,
    wickWidth: 4,
    minBody: 4,
    wickGlow: tw(t, 10.7, 11.2) * (1 - tw(t, 16.4, 16.8)) * (0.6 + wickHi),
    wickGlowColor: C.gold,
  });
  // last-price hairline across to book
  const lastY = PY(s.c);
  line(ctx, 1080, lastY, CX - CW / 2 - 14, lastY, C.gold, 1.5, 0.5, [4, 6]);
  const tag = closed ? `收盤 ${s.c}` : `最新成交 ${s.c}`;
  const tw_ = measure(ctx, tag, { family: F.tc, size: 22, weight: 700 }) + 24;
  rrect(ctx, CX + CW / 2 + 20, lastY - 18, tw_, 36, 8);
  ctx.fillStyle = closed ? C.gold : rgba(C.gold, 0.16);
  ctx.fill();
  text(ctx, tag, CX + CW / 2 + 32, lastY + 1, {
    family: F.tc,
    size: 22,
    weight: 700,
    color: closed ? C.ink : C.gold,
    base: "middle",
  });
  // open marker
  line(ctx, CX - 80, PY(100), CX - CW / 2 - 6, PY(100), C.muted, 1, 0.6);
  text(ctx, "開 100", CX - 88, PY(100), {
    family: F.tc,
    size: 20,
    weight: 500,
    color: C.muted,
    align: "right",
    base: "middle",
  });
  ctx.restore();

  // Wick callout.
  const wa = tw(t, 10.85, 11.3) * (1 - tw(t, 14.2, 14.6));
  if (wa > 0) {
    const wx = CX - 16;
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
  // OHLC readout after the close.
  const labels = [
    ["開", 100, PY(100)],
    ["高", s.h, PY(s.h)],
    ["低", s.l, PY(s.l)],
    ["收", s.c, PY(s.c)],
  ];
  labels.forEach(([k, v, yy], i) => {
    const a = tw(t, 14.55 + i * 0.12, 14.85 + i * 0.12);
    if (a <= 0 || i === 0 || i === 3) return;
    const x = CX - CW / 2 - 24 - (1 - a) * 30;
    text(ctx, `${k} ${v}`, x - 60, yy, {
      family: F.display,
      size: 30,
      weight: 700,
      color: i === 3 ? C.gold : C.text,
      align: "right",
      base: "middle",
      alpha: a,
    });
    line(ctx, x - 50, yy, CX - CW / 2 - 8, yy, C.muted, 1, a * 0.6);
  });
}

function drawTape(ctx, t, alpha) {
  if (alpha <= 0) return;
  const x = 1610;
  const y0 = PY(111);
  text(ctx, "成交紀錄", x, y0 - 10, {
    family: F.tc,
    size: 20,
    weight: 700,
    color: C.muted,
    alpha,
  });
  const done = fills.filter((f) => f.t <= t);
  done
    .slice(-8)
    .reverse()
    .forEach((f, i) => {
      const age = t - f.t;
      const inP = ease.outCubic(clamp(age / 0.3));
      const y = y0 + 34 + i * 40 - (1 - inP) * 20;
      const col = f.side === "buy" ? C.buy : C.sell;
      const a = alpha * inP * (i === 0 ? 1 : 0.62);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = rgba(col, 0.9);
      ctx.fillRect(x, y - 12, 4, 24);
      ctx.restore();
      text(ctx, f.clock.slice(6), x + 14, y, {
        family: F.mono,
        size: 16,
        weight: 500,
        color: C.muted,
        base: "middle",
        alpha: a,
      });
      text(ctx, `${f.price}`, x + 150, y, {
        family: F.mono,
        size: 20,
        weight: 700,
        color: col,
        base: "middle",
        alpha: a,
      });
      text(ctx, `×${f.qty}`, x + 200, y, {
        family: F.mono,
        size: 18,
        weight: 500,
        color: C.text,
        base: "middle",
        alpha: a,
      });
    });
}

const CAPS = [
  {
    a: 2.7,
    b: 4.9,
    text: "買方、賣方，各自掛出價格",
    sub: "掛單只是在等待——最新成交仍是 100",
  },
  {
    a: 5.0,
    b: 7.35,
    text: "一張買單：最多付 110 元，買 5 隻",
    sub: "先吃最便宜的賣單：101，再來 103",
  },
  {
    a: 7.45,
    b: 9.25,
    text: "104–109 沒人賣，價格直接跳到 110",
    sub: "價格只在成交的那一刻改變",
    color: C.sell,
  },
  {
    a: 9.35,
    b: 11.35,
    text: "主動賣出 2 隻，K 線退回 103",
    sub: "110 的高點，留成上影線",
  },
  {
    a: 11.45,
    b: 14.35,
    text: "賣單接連湧入，跌破開盤",
    sub: "103 → 99 → 98：每一格都是真實成交",
    color: C.sell,
  },
  {
    a: 14.45,
    b: 16.5,
    text: "一分鐘結束：開 100・高 110・低 98・收 99",
    sub: "K 線，是這一分鐘所有成交的摘要",
    color: C.gold,
  },
];

export function draw(ctx, t) {
  const stageA = tw(t, 2.2, 2.8);
  const exitZoom = tw(t, 16.5, 18.0, ease.inExpo);
  const [sx, sy] = shake(t, 8.25, 16, 0.55);
  const [sx2, sy2] = shake(t, 12.4, 7, 0.4, 8);

  ctx.save();
  const baseZ = lerp(1, 1.035, tw(t, 2, 16));
  const focusX = lerp(W / 2, CX, tw(t, 14.3, 15.3));
  const focusY = lerp(
    lerp(H / 2, PY(104), tw(t, 14.3, 15.3)),
    PY(108.5),
    tw(t, 16.4, 17.3, ease.inOutCubic),
  );
  const z = baseZ * lerp(1, 1.12, tw(t, 14.3, 15.3)) * (1 + exitZoom * 9);
  ctx.translate(W / 2 + sx + sx2, H / 2 + sy + sy2);
  ctx.scale(z, z);
  ctx.translate(-focusX, -focusY);
  if (exitZoom > 0.1) ctx.filter = `blur(${exitZoom * 5}px)`;

  priceGrid(ctx, t, { alpha: 0.6 * stageA, step: 46, oy: PY(104) });
  drawBook(
    ctx,
    t,
    stageA * (1 - tw(t, 14.3, 15.0) * 0.8) * (1 - tw(t, 15.4, 16.0)),
  );
  drawMakers(ctx, t, stageA * (1 - tw(t, 14.3, 15.0)));
  drawTakers(ctx, t, stageA);
  drawCandle(ctx, t, stageA);
  drawFills(ctx, t);
  drawTape(ctx, t, stageA * (1 - tw(t, 14.3, 14.8)));
  // Jump beam for the 110 fill.
  const jb = tw(t, 8.0, 8.25, ease.inExpo) * (1 - tw(t, 8.5, 9.2));
  if (jb > 0) {
    line(
      ctx,
      ASK0 - 10,
      PY(103),
      ASK0 - 10,
      lerp(PY(103), PY(110), tw(t, 8.0, 8.25, ease.inExpo)),
      C.gold,
      3,
      jb,
    );
    glow(ctx, ASK0 - 10, PY(110), 90, C.gold, jb);
  }
  ctx.restore();

  chapterCard(ctx, t, {
    num: "01",
    kicker: "CHAPTER 01 · MATCHING",
    title: "一筆成交，怎麼變成 K 線？",
    sub: "撮合：買方、賣方、交易所，和一根 K 線的誕生",
    outA: 2.0,
    outB: 2.6,
  });
  captions(ctx, t, CAPS);
}
