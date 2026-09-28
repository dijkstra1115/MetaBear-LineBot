// Chapter 04 — 買入又多了，價格怎麼還回不去？
// CVD from 14:33:30. Checkpoints (bear units) match the delta story:
// :48 buy 462 / sell 58 → +404, :52 price 97 with CVD +230, :59 buy 502 / sell 282 → +220.
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
  shake,
  rrect,
  fmt,
  signed,
  revealText,
  measure,
  rnd,
} from "../core.js";
import {
  chapterCard,
  captions,
  priceGrid,
  floatChip,
  counter,
} from "../common.js";

const X0 = 250;
const X1 = 1440;
const PPY = (p) => 470 - (p - 96) * 44; // price panel
const CVY = (v) => 830 - v * 0.46; // cvd panel
const sx = (s) => lerp(X0, X1, (s - 30) / 29);

// ---- market seconds ↔ scene time ----
const KEYS = [
  [2.2, 30],
  [4.4, 34.5],
  [8.6, 48],
  [10.6, 54],
  [11.8, 59],
];
function mkt(t) {
  if (t <= KEYS[0][0]) return 30;
  for (let i = 1; i < KEYS.length; i++) {
    const [ta, sa] = KEYS[i - 1];
    const [tb, sb] = KEYS[i];
    if (t <= tb) return lerp(sa, sb, (t - ta) / (tb - ta));
  }
  return 59;
}
function sceneT(s) {
  for (let i = 1; i < KEYS.length; i++) {
    const [ta, sa] = KEYS[i - 1];
    const [tb, sb] = KEYS[i];
    if (s <= sb) return lerp(ta, tb, (s - sa) / (sb - sa));
  }
  return KEYS[KEYS.length - 1][0];
}

// ---- trades (market second, side, qty, price) ----
const trades = [
  [31.0, "buy", 40, 101],
  [32.2, "sell", 10, 100],
  [33.6, "buy", 42, 101],
];
{
  const q = [
    28, 14, 22, 18, 30, 12, 20, 26, 16, 24, 18, 22, 14, 30, 20, 16, 24, 12, 14,
  ];
  q.forEach((v, i) => trades.push([35 + i * 0.64, "buy", v, 101]));
  [37.3, 40.5, 43.7, 46.3].forEach((s) => trades.push([s, "sell", 12, 100]));
}
trades.push(
  [49.0, "sell", 40, 100],
  [50.0, "sell", 50, 99],
  [51.1, "sell", 44, 98],
  [52.0, "sell", 40, 97],
);
trades.push(
  [55.0, "buy", 20, 98],
  [56.0, "sell", 30, 97],
  [57.5, "buy", 20, 98],
  [58.5, "sell", 20, 97],
);
trades.sort((a, b) => a[0] - b[0]);
const TRADES = trades.map(([s, side, qty, price]) => ({
  s,
  side,
  qty,
  price,
  t: sceneT(s),
}));

function stateAt(s) {
  let buy = 0;
  let sell = 0;
  let price = 100;
  for (const tr of TRADES) {
    if (tr.s > s) break;
    if (tr.side === "buy") buy += tr.qty;
    else sell += tr.qty;
    price = tr.price;
  }
  return { buy, sell, cvd: buy - sell, price };
}

export const cues = [
  { t: 0, kind: "impact" },
  ...TRADES.map((tr) => ({
    t: tr.t,
    kind: "fill",
    price: tr.price,
    qty: 1,
    side: tr.side,
    soft: tr.s > 34.5 && tr.s < 48,
  })),
  { t: 8.6, kind: "impact" },
  { t: 9.9, kind: "swell", dur: 1.4 },
  { t: 11.9, kind: "stamp" },
  { t: 12.8, kind: "riser", dur: 1.2 },
];

function stepPath(fnY, sNow) {
  const pts = [[sx(30), fnY(stateAt(30))]];
  for (const tr of TRADES) {
    if (tr.s > sNow) break;
    const st = stateAt(tr.s);
    pts.push([sx(tr.s), pts[pts.length - 1][1]]);
    pts.push([sx(tr.s), fnY(st)]);
  }
  pts.push([sx(sNow), pts[pts.length - 1][1]]);
  return pts;
}

function drawPanels(ctx, t, a) {
  const s = mkt(t);
  // frames
  ctx.save();
  ctx.globalAlpha = a;
  for (const [y0, y1, label] of [
    [PPY(103.6), PPY(95.4), "成交價"],
    [CVY(470), CVY(-60), "CVD 主動成交差額 · 自 14:33:30 起算"],
  ]) {
    rrect(ctx, X0 - 20, y0, X1 - X0 + 40, y1 - y0, 14);
    ctx.fillStyle = rgba(C.panel, 0.55);
    ctx.fill();
    ctx.strokeStyle = rgba(C.line, 1);
    ctx.stroke();
    text(ctx, label, X0, y0 - 14, {
      family: F.tc,
      size: 20,
      weight: 700,
      color: C.muted,
    });
  }
  ctx.restore();
  for (let p = 96; p <= 103; p++) {
    line(ctx, X0, PPY(p), X1, PPY(p), C.line, 1, a * 0.5);
    text(ctx, String(p), X0 - 34, PPY(p), {
      family: F.mono,
      size: 16,
      weight: 500,
      color: C.dim,
      align: "right",
      base: "middle",
      alpha: a,
    });
  }
  // CVD grid
  for (const v of [0, 200, 400]) {
    line(
      ctx,
      X0,
      CVY(v),
      X1,
      CVY(v),
      v === 0 ? C.muted : C.line,
      v === 0 ? 1.5 : 1,
      a * (v === 0 ? 0.8 : 0.5),
      v === 0 ? [6, 6] : undefined,
    );
    text(ctx, v ? `+${v}` : "0", X0 - 34, CVY(v), {
      family: F.mono,
      size: 16,
      weight: 500,
      color: v ? C.dim : C.text,
      align: "right",
      base: "middle",
      alpha: a,
    });
  }
  // time labels
  [30, 40, 50, 59].forEach((m) =>
    text(ctx, `:${m}`, sx(m), CVY(-60) + 26, {
      family: F.mono,
      size: 15,
      weight: 500,
      color: C.dim,
      align: "center",
      alpha: a,
    }),
  );

  // Ceiling at 101 while buyers keep hitting it.
  const ceil = tw(t, 4.6, 5.2) * (1 - tw(t, 8.8, 9.3));
  if (ceil > 0) {
    line(ctx, X0, PPY(101), X1, PPY(101), C.sell, 2, ceil * 0.9, [10, 6]);
    text(ctx, "101 的賣單：被吃掉，又補回來", X1 - 10, PPY(101) - 22, {
      family: F.tc,
      size: 22,
      weight: 800,
      color: C.sell,
      align: "right",
      alpha: ceil,
    });
  }

  if (t < 2.2) return;
  // price step line
  const pp = stepPath((st) => PPY(st.price), s);
  ctx.save();
  ctx.globalAlpha = a;
  drawStep(ctx, pp, C.gold, 3);
  // cvd area + line
  const cp = stepPath((st) => CVY(st.cvd), s);
  const grd = ctx.createLinearGradient(0, CVY(450), 0, CVY(0));
  grd.addColorStop(0, rgba(C.teal, 0.32));
  grd.addColorStop(1, rgba(C.teal, 0.02));
  ctx.beginPath();
  ctx.moveTo(cp[0][0], CVY(0));
  cp.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(cp[cp.length - 1][0], CVY(0));
  ctx.closePath();
  ctx.fillStyle = grd;
  ctx.fill();
  drawStep(ctx, cp, C.teal, 3);
  ctx.restore();

  // playhead
  const x = sx(s);
  line(ctx, x, PPY(103.6), x, CVY(-60), C.white, 1, a * 0.35);
  const st = stateAt(s);
  glow(ctx, x, PPY(st.price), 36, C.gold, a);
  glow(ctx, x, CVY(st.cvd), 36, C.teal, a);
  const la = a * (1 - tw(t, 9.8, 10.1) + tw(t, 11.7, 12.0));
  text(ctx, `${st.price}`, x + 14, PPY(st.price) - 18, {
    family: F.display,
    size: 30,
    weight: 700,
    color: C.gold,
    alpha: la,
  });
  text(ctx, signed(st.cvd), x + 14, CVY(st.cvd) - 18, {
    family: F.display,
    size: 30,
    weight: 700,
    color: C.teal,
    alpha: la,
  });
  text(
    ctx,
    `14:33:${String(Math.floor(s)).padStart(2, "0")}`,
    x,
    PPY(103.6) - 14,
    {
      family: F.mono,
      size: 16,
      weight: 600,
      color: C.text,
      align: "center",
      alpha: a,
    },
  );

  // trade sparks on each print
  for (const tr of TRADES) {
    if (t < tr.t || t > tr.t + 0.6) continue;
    const col = tr.side === "buy" ? C.buy : C.sell;
    ring(ctx, sx(tr.s), PPY(tr.price), t, tr.t, {
      r1: tr.qty > 30 ? 70 : 40,
      color: col,
      w: 2,
      dur: 0.5,
    });
    if (tr.s >= 48)
      burst(ctx, sx(tr.s), PPY(tr.price), t, tr.t, {
        n: 16,
        speed: 360,
        seed: tr.price,
        color: C.sell,
        flare: 60,
        gravity: 300,
      });
  }
}

function drawStep(ctx, pts, color, w) {
  ctx.lineJoin = "miter";
  for (const [lw, al] of [
    [w * 5, 0.08],
    [w * 2.2, 0.18],
    [w, 1],
  ]) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = rgba(color, al);
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function drawCounters(ctx, t, a) {
  const s = mkt(t);
  const st = stateAt(s);
  const x = 1510;
  const w = 330;
  const intro = t < 4.6;
  const fl = (side) =>
    TRADES.filter((tr) => tr.side === side).reduce(
      (acc, tr) => acc + pulse(t, tr.t + 0.25, 8),
      0,
    );
  counter(ctx, x, 170, "主動買入", `+${fmt(st.buy)}`, {
    color: C.buy,
    alpha: a,
    unit: "隻",
    w,
    flash: fl("buy"),
  });
  counter(ctx, x, 320, "主動賣出", `−${fmt(st.sell)}`, {
    color: C.sell,
    alpha: a,
    unit: "隻",
    w,
    flash: fl("sell"),
  });
  counter(ctx, x, 470, "累計差額 CVD", signed(st.cvd), {
    color: C.gold,
    alpha: a,
    unit: "隻",
    w,
    flash: fl("buy") + fl("sell"),
    size: 76,
    h: 140,
  });
  text(ctx, "每筆成交只按主動方計一次", x, 650, {
    family: F.tc,
    size: 19,
    weight: 500,
    color: C.muted,
    alpha: a * tw(t, 2.6, 3.0),
  });
  text(ctx, "新掛單不計入 CVD", x, 680, {
    family: F.tc,
    size: 19,
    weight: 500,
    color: C.muted,
    alpha: a * tw(t, 2.8, 3.2),
  });
  // Flying chips in the intro.
  if (intro)
    for (const tr of TRADES.filter((q) => q.s < 34.5)) {
      const p = prog(t, tr.t, tr.t + 0.3);
      if (p <= 0 || p >= 1) continue;
      const tx = x + 40;
      const ty = tr.side === "buy" ? 240 : 390;
      const cx = lerp(sx(tr.s), tx, ease.inOutCubic(p));
      const cy =
        lerp(PPY(tr.price), ty, ease.inOutCubic(p)) -
        Math.sin(p * Math.PI) * 80;
      text(ctx, `${tr.side === "buy" ? "+" : "−"}${tr.qty}`, cx, cy, {
        family: F.display,
        size: 34,
        weight: 700,
        color: tr.side === "buy" ? C.buy : C.sell,
        align: "center",
        base: "middle",
        glow: 16,
      });
    }
}

function drawDivergence(ctx, t, a) {
  const d = tw(t, 9.9, 10.3) * (1 - tw(t, 11.7, 12.1));
  if (d <= 0) return;
  const x = sx(52) - 24;
  ctx.save();
  ctx.globalAlpha = d * a;
  // bracket spanning both panels, on the quiet left side of the drop
  ctx.strokeStyle = rgba(C.gold, 0.9);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, PPY(97));
  ctx.lineTo(x - 30, PPY(97));
  ctx.lineTo(x - 30, CVY(230));
  ctx.lineTo(x, CVY(230));
  ctx.stroke();
  ctx.restore();
  pillTxt(ctx, "價格跌到 97", x - 46, PPY(97), C.sell, d * a, true);
  pillTxt(ctx, "CVD 仍為 +230", x - 46, CVY(230), C.teal, d * a, true);
}
function pillTxt(ctx, s, x, y, col, a, right = false) {
  const w = measure(ctx, s, { family: F.tc, size: 24, weight: 800 }) + 28;
  if (right) x -= w;
  ctx.save();
  ctx.globalAlpha = a;
  rrect(ctx, x, y - 22, w, 44, 22);
  ctx.fillStyle = rgba(col, 0.18);
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.restore();
  text(ctx, s, x + 14, y + 1, {
    family: F.tc,
    size: 24,
    weight: 800,
    color: col,
    base: "middle",
    alpha: a,
  });
}

const CAPS = [
  {
    a: 2.3,
    b: 4.5,
    text: "買入記加，賣出記減",
    sub: "+40、−10、+42：累計起來，就是 CVD",
  },
  {
    a: 4.6,
    b: 8.5,
    text: "CVD 一路上升，價格卻卡在 101",
    sub: "主動買入確實較多——但上方賣單一直補回來",
    color: C.buy,
  },
  {
    a: 8.7,
    b: 11.7,
    text: "賣單一來，價格跌到 97",
    sub: "CVD 下降，但仍是正值：正值是累計，方向才是當下",
    color: C.sell,
  },
];

export function draw(ctx, t) {
  const stageA = tw(t, 1.9, 2.5);
  const dim = 1 - tw(t, 11.8, 12.4) * 0.88;
  const exit = tw(t, 13.1, 14.0, ease.inExpo);
  const [kx, ky] = shake(t, 8.6, 10, 0.4, 3);
  ctx.save();
  ctx.translate(W / 2 + kx, H / 2 + ky);
  ctx.scale(1 - exit * 0.9, 1 - exit * 0.9);
  ctx.translate(-W / 2, -H / 2);
  ctx.globalAlpha = dim * (1 - exit);
  priceGrid(ctx, t, { alpha: 0.35 * stageA, step: 44, oy: PPY(96) });
  drawPanels(ctx, t, stageA);
  drawCounters(ctx, t, stageA);
  drawDivergence(ctx, t, stageA);
  ctx.restore();

  const sOut = tw(t, 13.0, 13.5);
  revealText(
    ctx,
    "主動買得多，",
    W / 2,
    470,
    {
      family: F.tc,
      size: 76,
      weight: 900,
      color: C.text,
      align: "center",
      stagger: 0.05,
      rise: 30,
      blur: 10,
    },
    t - 11.9,
    sOut,
  );
  revealText(
    ctx,
    "不代表價格就能上去。",
    W / 2,
    575,
    {
      family: F.tc,
      size: 76,
      weight: 900,
      color: C.gold,
      align: "center",
      stagger: 0.05,
      rise: 30,
      blur: 10,
    },
    t - 12.25,
    sOut,
  );
  revealText(
    ctx,
    "推進的距離，還要看對側的掛單。",
    W / 2,
    660,
    {
      family: F.tc,
      size: 32,
      weight: 400,
      color: C.muted,
      align: "center",
      stagger: 0.02,
      rise: 16,
    },
    t - 12.7,
    sOut,
  );

  chapterCard(ctx, t, {
    num: "04",
    kicker: "CHAPTER 04 · CUMULATIVE VOLUME DELTA",
    title: "買入又多了，價格怎麼還回不去？",
    sub: "CVD：主動買入減主動賣出，一筆一筆累加",
    outA: 1.8,
    outB: 2.4,
  });
  captions(ctx, t, CAPS);
}
