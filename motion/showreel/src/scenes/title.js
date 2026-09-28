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
  revealText,
  rgba,
  glow,
  ring,
  burst,
  drawMark,
  pill,
  measure,
  TAU,
  pulse,
} from "../core.js";

const CHIPS = [
  "01  撮合與 K 線",
  "02  影線",
  "03  足跡・熱圖",
  "04  主動成交差額 CVD",
];

export const cues = [
  { t: 0, kind: "impact", big: true },
  { t: 1.05, kind: "shimmer" },
  { t: 2.6, kind: "pluck", note: 0 },
  ...CHIPS.map((_, i) => ({
    t: 3.7 + i * 0.25,
    kind: "pluck",
    note: 2 + i * 2,
  })),
  { t: 5.0, kind: "riser", dur: 1.0 },
];

function dial(ctx, cx, cy, r, t, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.12);
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * TAU;
    const long = i % 15 === 0;
    const r0 = r - (long ? 22 : 10);
    ctx.strokeStyle = long ? rgba(C.gold, 0.7) : rgba(C.teal, 0.28);
    ctx.lineWidth = long ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.rotate(-t * 0.3);
  ctx.strokeStyle = rgba(C.teal, 0.18);
  ctx.setLineDash([4, 10]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function draw(ctx, t) {
  const exit = tw(t, 5.0, 6.0, ease.inExpo);
  // Zoom through the first chapter chip.
  const chipY = 880;
  const gap = 24;
  const widths = CHIPS.map(
    (s) => measure(ctx, s, { family: F.tc, size: 24, weight: 600 }) + 36,
  );
  const total = widths.reduce((a, b) => a + b, 0) + gap * 3;
  const chip0x = 960 - total / 2;
  ctx.save();
  const z = 1 + exit * 14;
  const fx = lerp(
    W / 2,
    chip0x + widths[0] / 2,
    ease.inOutCubic(tw(t, 4.9, 5.4)),
  );
  const fy = lerp(H / 2, chipY, ease.inOutCubic(tw(t, 4.9, 5.4)));
  ctx.translate(fx, fy);
  ctx.scale(z, z);
  ctx.translate(-fx, -fy);
  if (exit > 0.05) ctx.filter = `blur(${exit * 6}px)`;

  const cx = 960;
  const my = 300;
  dial(ctx, cx, my, 250, t, tw(t, 0.1, 1.2) * 0.9);
  glow(ctx, cx, my, 520, C.teal, 0.18 + pulse(t, 0, 3) * 0.6);
  ring(ctx, cx, my, t, 0, { r1: 900, dur: 1.4, w: 4, color: C.teal });
  ring(ctx, cx, my, t, 0.12, { r1: 700, dur: 1.3, w: 2, color: C.gold });
  burst(ctx, cx, my, t, 0.02, {
    n: 48,
    speed: 900,
    life: 1.1,
    seed: 5,
    color: C.teal,
    flare: 160,
  });

  drawMark(ctx, cx, my, 250, tw(t, 0.05, 1.5, ease.lin));
  glow(ctx, cx, my, 180, C.gold, pulse(t, 1.05, 5) * 0.8);

  // Wordmark.
  const word = "MetaBear";
  revealText(
    ctx,
    word,
    cx,
    560,
    {
      family: F.display,
      size: 150,
      weight: 700,
      color: C.text,
      align: "center",
      stagger: 0.045,
      rise: 60,
      blur: 14,
      ls: 2,
    },
    t - 0.9,
  );
  const lsp = lerp(34, 14, tw(t, 1.4, 2.4, ease.outCubic));
  text(ctx, "ORDER FLOW ACADEMY · 交易學院", cx, 624, {
    family: F.mono,
    size: 24,
    weight: 600,
    color: C.gold,
    align: "center",
    ls: lsp,
    alpha: tw(t, 1.4, 2.0),
  });

  // Tagline and underline sweep.
  revealText(
    ctx,
    "讀懂市場，再進場。",
    cx,
    736,
    {
      family: F.tc,
      size: 60,
      weight: 800,
      color: C.text,
      align: "center",
      stagger: 0.06,
      rise: 30,
      blur: 10,
    },
    t - 2.2,
  );
  const tagW = measure(ctx, "讀懂市場，再進場。", {
    family: F.tc,
    size: 60,
    weight: 800,
  });
  const u = tw(t, 2.6, 3.3, ease.outQuart);
  ctx.save();
  const grd = ctx.createLinearGradient(cx - tagW / 2, 0, cx + tagW / 2, 0);
  grd.addColorStop(0, rgba(C.teal, 0));
  grd.addColorStop(0.5, C.gold);
  grd.addColorStop(1, rgba(C.teal, 0));
  ctx.fillStyle = grd;
  ctx.fillRect(cx - (tagW / 2) * u, 760, tagW * u, 3);
  ctx.restore();

  // Chapter chips.
  let x = cx - total / 2;
  CHIPS.forEach((s, i) => {
    const p = ease.outBack(prog(t, 3.7 + i * 0.25, 4.2 + i * 0.25));
    if (p > 0) {
      ctx.save();
      ctx.translate(x + widths[i] / 2, chipY);
      ctx.scale(p, p);
      pill(ctx, s, 0, 0, {
        family: F.tc,
        size: 24,
        weight: 600,
        align: "center",
        color: i === 0 ? C.gold : C.teal,
        alpha: clamp(p),
        textColor: C.text,
      });
      ctx.restore();
    }
    x += widths[i] + gap;
  });
  ctx.restore();
}
