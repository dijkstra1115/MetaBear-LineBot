// Chapter 03 — 同樣回到這裡，怎麼這次穿過去了？
// Footprint of 14:32:50–:33:00 → volume profile → single-level heatmap of
// visible bids at 101 (130 → 40 → 12) → 60 隻 sold through 101/100/99.
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
  shake,
  rrect,
  fmt,
  rnd,
  hexMix,
  revealText,
  measure,
} from "../core.js";
import { chapterCard, captions, priceGrid, floatChip } from "../common.js";

const PY = (p) => 540 - (p - 102) * 56;
const LBL = 540;
const C32 = 610; // 14:32 candle
const C33 = 700; // 14:33 candle
const FP0 = 800; // footprint x
const HX0 = 790; // heatmap x range
const HX1 = 1760;
const PX0 = 240; // profile origin
const HT0 = 7.3;
const HT1 = 11.9;

// Footprint trades (14:32:50–:33:00): sells at 101 sum 200, buys at 103 sum 86.
const TR = [
  [2.35, 101, "sell", 20],
  [2.55, 103, "buy", 10],
  [2.75, 101, "sell", 30],
  [2.95, 101, "sell", 10],
  [3.15, 103, "buy", 20],
  [3.35, 101, "sell", 40],
  [3.6, 101, "sell", 20],
  [3.8, 103, "buy", 16],
  [4.0, 101, "sell", 30],
  [4.25, 103, "buy", 40],
  [4.5, 101, "sell", 50],
].map(([t, price, side, qty]) => ({ t, price, side, qty }));
const cellVal = (t, price, side) =>
  TR.filter((r) => r.t <= t && r.price === price && r.side === side).reduce(
    (s, r) => s + r.qty,
    0,
  );

// Break: 60 隻 sold in three slices.
const BRK = [
  { t: 10.3, price: 101, qty: 12 },
  { t: 10.8, price: 100, qty: 16 },
  { t: 11.25, price: 99, qty: 32 },
];

function bidQty(level, t) {
  switch (level) {
    case 101:
      return t < 7.9
        ? 130
        : t < 8.4
          ? lerp(130, 40, ease.inOutCubic(prog(t, 7.9, 8.4)))
          : t < 8.9
            ? 40
            : t < 9.5
              ? 20
              : t < 10.3
                ? 12
                : 0;
    case 100:
      return t < 10.8 ? 16 : 0;
    case 99:
      return t < 11.25 ? 32 : t < 11.55 ? 0 : 44;
    case 98:
      return 28;
    case 97:
      return 22;
    case 96:
      return 30;
    default:
      return 0;
  }
}
const askQty = (level) =>
  ({ 102: 30, 103: 46, 104: 22, 105: 38, 106: 18 })[level] ?? 0;

function lastPrice(t) {
  if (t < 6.2) return 103;
  if (t < 7.3) {
    const u = prog(t, 6.2, 7.2);
    return Math.round(
      u < 0.45
        ? lerp(103, 108, ease.outCubic(u / 0.45))
        : lerp(108, 101, ease.inOutCubic((u - 0.45) / 0.55)),
    );
  }
  if (t < 10.8) return 101;
  if (t < 11.25) return 100;
  if (t < 11.7) return 99;
  return 100;
}
function candle33(t) {
  if (t < 6.2) return null;
  let h = 103;
  let l = 103;
  for (let u = 6.2; u <= t; u += 0.02) {
    const p = lastPrice(u);
    h = Math.max(h, p);
    l = Math.min(l, p);
  }
  return { o: 103, h, l, c: lastPrice(t) };
}

export const cues = [
  { t: 0, kind: "impact" },
  ...TR.map((r) => ({
    t: r.t,
    kind: "fill",
    price: r.price,
    qty: 1,
    side: r.side,
    soft: true,
  })),
  { t: 4.85, kind: "whoosh", dur: 0.9 },
  { t: 6.2, kind: "whoosh", dur: 0.6 },
  { t: 7.3, kind: "swell", dur: 2.6 },
  { t: 7.9, kind: "drain", dur: 0.5 },
  { t: 8.9, kind: "fill", price: 101, qty: 1, side: "sell", soft: true },
  { t: 9.5, kind: "drain", dur: 0.3 },
  ...BRK.map((b) => ({ t: b.t, kind: "crack", price: b.price, loud: true })),
  { t: 11.9, kind: "stamp" },
  { t: 12.6, kind: "riser", dur: 1.4 },
];

function heatColor(q) {
  const u = clamp(q / 130);
  if (u <= 0) return null;
  const c =
    u < 0.5
      ? hexMix("#0f3a44", C.teal, u / 0.5)
      : hexMix(C.teal, "#f4fffb", (u - 0.5) / 0.5);
  return c;
}

function drawAxis(ctx, t, a) {
  for (let p = 96; p <= 108; p++) {
    const y = PY(p);
    const hot = p === 101;
    text(ctx, String(p), LBL, y, {
      family: F.mono,
      size: 20,
      weight: hot ? 700 : 500,
      align: "center",
      base: "middle",
      color: hot ? C.gold : C.dim,
      alpha: a,
    });
    line(ctx, LBL + 28, y, HX1, y, C.line, 1, a * 0.35);
  }
}

function drawCandles(ctx, t, a) {
  // 14:32 — the wick candle from chapter 02, its high far above.
  candle(ctx, C32, 52, PY(100), -40, PY(100), PY(103), {
    alpha: a * 0.8,
    wickWidth: 3,
  });
  text(ctx, "↑ 高 136", C32, 150, {
    family: F.tc,
    size: 18,
    weight: 600,
    color: C.muted,
    align: "center",
    alpha: a,
  });
  text(ctx, "14:32", C32, 880, {
    family: F.mono,
    size: 16,
    weight: 500,
    color: C.dim,
    align: "center",
    alpha: a,
  });
  const k = candle33(t);
  if (k) {
    const ap = tw(t, 6.2, 6.4);
    candle(ctx, C33, 52, PY(k.o), PY(k.h), PY(k.l), PY(k.c), {
      alpha: a * ap,
      wickWidth: 3,
      glow: 14,
    });
    text(ctx, "14:33 形成中", C33, 880, {
      family: F.mono,
      size: 16,
      weight: 500,
      color: C.muted,
      align: "center",
      alpha: a * ap,
    });
  }
}

function drawFootprint(ctx, t) {
  const a = tw(t, 2.1, 2.4);
  const col = tw(t, 4.9, 5.9, ease.inOutCubic); // collapse into profile
  if (a <= 0) return;
  const cw = 170;
  const ch = 48;
  for (let p = 99; p <= 105; p++) {
    const y = PY(p);
    const sv = cellVal(t, p, "sell");
    const bv = cellVal(t, p, "buy");
    const cells = [
      ["sell", sv, FP0],
      ["buy", bv, FP0 + cw + 6],
    ];
    for (const [side, v, x] of cells) {
      const heat = clamp(v / 200);
      const flash = TR.filter((r) => r.price === p && r.side === side).reduce(
        (s, r) => s + pulse(t, r.t, 7),
        0,
      );
      // collapse: cells shrink to a bar that slides to the profile
      const cx = lerp(x, PX0, col);
      const w = lerp(cw, 0, col);
      const alpha = a * (1 - col);
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      rrect(ctx, cx, y - ch / 2, w, ch, 6);
      ctx.fillStyle = rgba(
        side === "sell" ? C.sell : C.buy,
        0.05 + heat * 0.55 + flash * 0.3,
      );
      ctx.fill();
      ctx.strokeStyle = rgba(
        side === "sell" ? C.sell : C.buy,
        0.25 + flash * 0.6,
      );
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      text(ctx, v ? fmt(v) : "·", cx + w / 2, y + 1, {
        family: F.display,
        size: v ? 32 : 20,
        weight: 700,
        align: "center",
        base: "middle",
        color: v ? C.text : C.dim,
        alpha,
      });
    }
  }
  const ha = a * (1 - col);
  text(ctx, "主動賣", FP0 + cw / 2, PY(105.9), {
    family: F.tc,
    size: 18,
    weight: 700,
    color: C.sell,
    align: "center",
    alpha: ha,
  });
  text(ctx, "主動買", FP0 + cw * 1.5 + 6, PY(105.9), {
    family: F.tc,
    size: 18,
    weight: 700,
    color: C.buy,
    align: "center",
    alpha: ha,
  });
  text(ctx, "FOOTPRINT · 14:32:50–14:33:00", FP0, PY(106.6), {
    family: F.mono,
    size: 15,
    weight: 600,
    color: C.muted,
    ls: 2,
    alpha: ha,
  });
  // trade dots flying from candle to cells
  for (const r of TR) {
    const p = prog(t, r.t - 0.25, r.t);
    if (p <= 0 || p >= 1) continue;
    const tx = r.side === "sell" ? FP0 + cw / 2 : FP0 + cw * 1.5 + 6;
    glow(
      ctx,
      lerp(C32 + 20, tx, ease.inCubic(p)),
      PY(r.price),
      20,
      r.side === "sell" ? C.sell : C.buy,
      1,
    );
  }
}

function drawProfile(ctx, t) {
  const a = tw(t, 5.3, 5.9);
  if (a <= 0) return;
  const bars = [
    [101, 200],
    [103, 86],
  ];
  const flash = pulse(t, 10.35, 2.5) * tw(t, 10.3, 10.4);
  for (const [p, v] of bars) {
    const w = v * 1.15 * ease.outCubic(prog(t, 5.3, 6.1));
    const y = PY(p);
    ctx.save();
    rrect(ctx, PX0, y - 18, w, 36, 4);
    ctx.fillStyle = rgba(C.gold, 0.35 + (p === 101 ? flash * 0.5 : 0));
    ctx.fill();
    ctx.strokeStyle = rgba(C.gold, 0.8);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    text(ctx, `${v}`, PX0 + 12, y + 1, {
      family: F.display,
      size: 26,
      weight: 700,
      color: C.text,
      base: "middle",
      alpha: a,
    });
  }
  text(ctx, "成交量分布 · 過去 10 秒", PX0, PY(104.3), {
    family: F.tc,
    size: 18,
    weight: 600,
    color: C.gold,
    alpha: a,
  });
  const hint = tw(t, 10.5, 10.9) * (1 - tw(t, 12.0, 12.4));
  if (hint > 0)
    text(ctx, "紀錄還在", PX0, PY(101) + 44, {
      family: F.tc,
      size: 22,
      weight: 800,
      color: C.gold,
      alpha: hint,
    });
}

function drawHeat(ctx, t) {
  if (t < HT0) return;
  const now = Math.min(t, HT1);
  const cols = 60;
  const cw = (HX1 - HX0) / cols;
  const ch = 50;
  const upto = ((now - HT0) / (HT1 - HT0)) * cols;
  for (let i = 0; i < Math.ceil(upto); i++) {
    const tau = HT0 + ((i + 0.5) / cols) * (HT1 - HT0);
    const reveal = clamp(upto - i);
    for (let p = 96; p <= 106; p++) {
      const y = PY(p);
      const bq = bidQty(p, tau);
      const aq = askQty(p);
      let fill = null;
      let alpha = 0;
      if (bq > 0) {
        fill = heatColor(bq);
        alpha = 0.12 + 0.88 * clamp(bq / 130);
      } else if (aq > 0) {
        fill = C.sell;
        alpha = 0.1 + 0.25 * clamp(aq / 60);
      }
      if (!fill) continue;
      ctx.fillStyle = rgba(fill, alpha * reveal);
      ctx.fillRect(HX0 + i * cw, y - ch / 2, cw - 1, ch - 2);
    }
  }
  // highlight band at 101
  const bandA = tw(t, 7.5, 7.9) * (1 - tw(t, 12.0, 12.4));
  if (bandA > 0) {
    ctx.save();
    ctx.strokeStyle = rgba(C.gold, 0.7 * bandA);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    rrect(ctx, HX0 - 6, PY(101) - 29, HX1 - HX0 + 12, 58, 8);
    ctx.stroke();
    ctx.restore();
  }
  // price trace (white)
  const pts = [];
  for (let u = HT0; u <= now; u += 0.02)
    pts.push([HX0 + ((u - HT0) / (HT1 - HT0)) * (HX1 - HX0), PY(lastPrice(u))]);
  if (pts.length > 1) {
    ctx.save();
    ctx.strokeStyle = rgba(C.white, 0.95);
    ctx.lineWidth = 3;
    ctx.shadowColor = C.white;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
    const [hx, hy] = pts[pts.length - 1];
    glow(ctx, hx, hy, 40, C.white, 0.8);
  }
  // live readout on the band
  const q = Math.round(bidQty(101, now));
  const ra = tw(t, 7.6, 8.0) * (1 - tw(t, 11.8, 12.2));
  if (ra > 0) {
    const cx = HX0 + ((now - HT0) / (HT1 - HT0)) * (HX1 - HX0);
    text(
      ctx,
      `101 可見買量 ${q} 隻`,
      Math.min(cx + 16, HX1 - 250),
      PY(101) - 46,
      {
        family: F.tc,
        size: 24,
        weight: 800,
        color: q > 60 ? C.white : q > 0 ? C.teal : C.sell,
        alpha: ra,
      },
    );
  }
  // time axis
  const ta = tw(t, HT0, HT0 + 0.4) * (1 - tw(t, 12.0, 12.4));
  ["14:33:15", "14:33:20", "14:33:25", "14:33:30"].forEach((s, i) => {
    text(ctx, s, HX0 + (i / 3) * (HX1 - HX0), PY(95.6), {
      family: F.mono,
      size: 15,
      weight: 500,
      color: C.dim,
      align: i === 3 ? "right" : i ? "center" : "left",
      alpha: ta,
    });
  });
  text(ctx, "HEATMAP · 亮度 = 當下可見被動買量", HX0, PY(107.2), {
    family: F.mono,
    size: 15,
    weight: 600,
    color: C.muted,
    ls: 2,
    alpha: ta,
  });
}

function drawBreak(ctx, t) {
  for (const b of BRK) {
    const x = HX0 + ((b.t - HT0) / (HT1 - HT0)) * (HX1 - HX0);
    const y = PY(b.price);
    burst(ctx, x, y, t, b.t, {
      n: 26,
      speed: 520,
      seed: b.price,
      color: C.sell,
      flare: 120,
      gravity: 300,
    });
    ring(ctx, x, y, t, b.t, { r1: 150, color: C.sell, w: 3 });
    floatChip(ctx, `${b.qty} 隻 @${b.price}`, x - 90, y + 44, t, b.t, {
      color: C.sell,
      size: 30,
      rise: 24,
      dur: 0.85,
    });
  }
}

const CAPS = [
  {
    a: 2.2,
    b: 4.8,
    text: "成交足跡：這個價位，成交了多少？",
    sub: "101 主動賣出 200 隻；103 主動買入 86 隻",
  },
  {
    a: 4.9,
    b: 7.1,
    text: "把成交留在地圖上：成交量分布",
    sub: "它記錄的是過去 10 秒，不是現在的掛單",
    color: C.gold,
  },
  {
    a: 7.3,
    b: 10.1,
    text: "價格回到 101。亮過的買量，正在退去",
    sub: "130 → 40 → 12 隻：撤單不會留下成交紀錄",
    color: C.buy,
  },
  {
    a: 10.2,
    b: 11.8,
    text: "剩下的 12 隻很快用完，價格穿了過去",
    sub: "12 隻 @101 → 16 隻 @100 → 32 隻 @99",
    color: C.sell,
  },
];

export function draw(ctx, t) {
  const stageA = tw(t, 1.9, 2.5);
  const pan = tw(t, 13.0, 14.0, ease.inExpo);
  const [sx, sy] = shake(t, 10.3, 8, 0.4, 2);
  const [sx2, sy2] = shake(t, 11.25, 12, 0.5, 6);
  ctx.save();
  ctx.translate(sx + sx2 - pan * 700, sy + sy2);
  const statementDim = 1 - tw(t, 11.9, 12.5) * 0.7;
  ctx.globalAlpha = statementDim;
  priceGrid(ctx, t, { alpha: 0.5 * stageA, step: 56, oy: PY(102) });
  drawAxis(ctx, t, stageA);
  drawHeat(ctx, t);
  drawProfile(ctx, t);
  drawCandles(ctx, t, stageA);
  drawFootprint(ctx, t);
  drawBreak(ctx, t);
  ctx.restore();

  const scrim = tw(t, 11.9, 12.4) * (1 - tw(t, 13.3, 13.8));
  if (scrim > 0) {
    const g = ctx.createLinearGradient(0, 700, 0, 1080);
    g.addColorStop(0, "rgba(6,11,19,0)");
    g.addColorStop(0.35, "rgba(6,11,19,0.92)");
    g.addColorStop(1, "rgba(6,11,19,0.96)");
    ctx.save();
    ctx.globalAlpha = scrim;
    ctx.fillStyle = g;
    ctx.fillRect(0, 700, W, 380);
    ctx.restore();
  }
  const sOut = tw(t, 13.2, 13.7);
  revealText(
    ctx,
    "過去成交很多，",
    1190,
    880,
    {
      family: F.tc,
      size: 60,
      weight: 900,
      color: C.text,
      align: "center",
      stagger: 0.05,
      rise: 30,
      blur: 10,
    },
    t - 12.0,
    sOut,
  );
  revealText(
    ctx,
    "不代表現在仍有人接。",
    1190,
    966,
    {
      family: F.tc,
      size: 60,
      weight: 900,
      color: C.gold,
      align: "center",
      stagger: 0.05,
      rise: 30,
      blur: 10,
    },
    t - 12.35,
    sOut,
  );

  chapterCard(ctx, t, {
    num: "03",
    kicker: "CHAPTER 03 · FOOTPRINT · PROFILE · HEATMAP",
    title: "同樣回到這裡，怎麼這次穿過去了？",
    sub: "已成交的量，和現在的掛單，是兩件事",
    outA: 1.8,
    outB: 2.4,
  });
  captions(ctx, t, CAPS);
}
