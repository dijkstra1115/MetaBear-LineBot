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
  line,
  glow,
  measure,
} from "./core.js";

export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;

/**
 * Large chapter card: outlined index number, question title and English
 * kicker. `t` is local scene time; it builds 0..~1.4 and exits at [outA, outB].
 */
export function chapterCard(ctx, t, o) {
  const outA = o.outA ?? 2.0;
  const outB = o.outB ?? 2.6;
  const out = tw(t, outA, outB, ease.inCubic);
  if (out >= 1) return;
  const slide = -out * 220;
  ctx.save();
  ctx.translate(slide, 0);
  const x = 200;
  const y = 470;

  // Giant outlined numeral with a sweeping fill.
  const nIn = tw(t, 0, 0.7, ease.outExpo);
  ctx.save();
  ctx.globalAlpha = nIn * (1 - out);
  text(ctx, o.num, x - 16, y + 60 + (1 - nIn) * 60, {
    family: F.display,
    size: 360,
    weight: 700,
    stroke: rgba(C.teal, 0.55),
    lineWidth: 2,
    ls: -6,
  });
  const fill = tw(t, 0.2, 1.1, ease.inOutCubic);
  ctx.beginPath();
  ctx.rect(x - 30, y + 60 - 300 * fill + 20, 460, 300 * fill);
  ctx.clip();
  text(ctx, o.num, x - 16, y + 60 + (1 - nIn) * 60, {
    family: F.display,
    size: 360,
    weight: 700,
    color: rgba(C.teal, 0.1),
    ls: -6,
  });
  ctx.restore();

  // Rule sweep.
  const rule = tw(t, 0.25, 0.9, ease.outQuart);
  line(
    ctx,
    x + 400,
    y - 150,
    x + 400 + 1100 * rule,
    y - 150,
    C.teal,
    2,
    0.8 * (1 - out),
  );
  glow(
    ctx,
    x + 400 + 1100 * rule,
    y - 150,
    60,
    C.teal,
    0.6 * (1 - rule) * (1 - out),
  );

  text(ctx, o.kicker, x + 402, y - 176, {
    family: F.mono,
    size: 22,
    weight: 500,
    color: C.gold,
    ls: 5,
    alpha: tw(t, 0.35, 0.8) * (1 - out),
  });
  revealText(
    ctx,
    o.title,
    x + 400,
    y - 40,
    {
      family: F.tc,
      size: 76,
      weight: 800,
      color: C.text,
      stagger: 0.04,
      dur: 0.55,
      rise: 48,
      blur: 10,
    },
    t - 0.4,
    out,
  );
  revealText(
    ctx,
    o.sub,
    x + 402,
    y + 40,
    {
      family: F.tc,
      size: 32,
      weight: 400,
      color: C.muted,
      stagger: 0.02,
      dur: 0.5,
      rise: 20,
    },
    t - 0.9,
    out,
  );
  ctx.restore();
}

/**
 * Timed caption stack in the lower third. items: {a, b, text, sub, color}.
 */
export function captions(ctx, t, items, o = {}) {
  const x = o.x ?? 140;
  const y = o.y ?? 948;
  for (const it of items) {
    if (t < it.a - 0.05 || t > it.b + 0.5) continue;
    const local = t - it.a;
    const out = tw(t, it.b, it.b + 0.35, ease.inCubic);
    const bar = tw(local, 0, 0.35, ease.outQuart) * (1 - out);
    const color = it.color ?? C.gold;
    ctx.save();
    ctx.fillStyle = rgba(color, 0.9);
    ctx.fillRect(x - 28, y - 44, 5, 92 * bar);
    ctx.restore();
    revealText(
      ctx,
      it.text,
      x,
      y,
      {
        family: F.tc,
        size: o.size ?? 44,
        weight: 700,
        color: C.text,
        stagger: 0.022,
        dur: 0.4,
        rise: 22,
      },
      local,
      out,
    );
    if (it.sub)
      revealText(
        ctx,
        it.sub,
        x,
        y + 46,
        {
          family: F.tc,
          size: 26,
          weight: 400,
          color: C.muted,
          stagger: 0.012,
          dur: 0.4,
          rise: 14,
        },
        local - 0.2,
        out,
      );
  }
}

/** Faint price-grid backdrop with parallax. */
export function priceGrid(ctx, t, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const step = o.step ?? 60;
  const ox = (((o.ox ?? -t * 12) % step) + step) % step;
  const oy = (((o.oy ?? 0) % step) + step) % step;
  ctx.save();
  ctx.strokeStyle = rgba(C.grid, 0.9 * alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ox - step; x < W + step; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = oy - step; y < H + step; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Floating value chip that rises and fades after t0. */
export function floatChip(ctx, str, x, y, t, t0, o = {}) {
  const a = t - t0;
  const dur = o.dur ?? 1.1;
  if (a < 0 || a > dur) return;
  const p = a / dur;
  const s = ease.outBack(clamp(a / 0.25));
  const alpha = (1 - ease.inCubic(prog(p, 0.55, 1))) * clamp(a / 0.08);
  ctx.save();
  ctx.translate(x, y - ease.outCubic(p) * (o.rise ?? 50));
  ctx.scale(s, s);
  text(ctx, str, 0, 0, {
    family: o.family ?? F.display,
    size: o.size ?? 34,
    weight: 700,
    color: o.color ?? C.text,
    align: "center",
    base: "middle",
    alpha,
    glow: 14,
    glowColor: o.color ?? C.teal,
  });
  ctx.restore();
}

/** Counter tile with label and a big number. */
export function counter(ctx, x, y, label, value, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const color = o.color ?? C.teal;
  const w = o.w ?? 300;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = rgba(C.panel, 0.82);
  ctx.strokeStyle = rgba(color, 0.35 + (o.flash ?? 0) * 0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, o.h ?? 128, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(x, y + 22, 4, 36);
  ctx.restore();
  text(ctx, label, x + 24, y + 48, {
    family: F.tc,
    size: 24,
    weight: 500,
    color: C.muted,
    alpha,
  });
  text(ctx, value, x + 24, y + 108, {
    family: F.display,
    size: o.size ?? 64,
    weight: 700,
    color,
    alpha,
    glow: 10 + (o.flash ?? 0) * 30,
  });
  if (o.unit)
    text(
      ctx,
      o.unit,
      x +
        30 +
        measure(ctx, value, {
          family: F.display,
          size: o.size ?? 64,
          weight: 700,
        }),
      y + 106,
      {
        family: F.tc,
        size: 24,
        weight: 500,
        color: C.muted,
        alpha,
      },
    );
}

export { lerp };
