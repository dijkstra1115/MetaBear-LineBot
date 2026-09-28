// Reusable motion-lesson building blocks. All take the lesson time `t` and are
// pure: the same `t` always paints the same frame.
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
  rrect,
  bear,
  drawMark,
  pulse,
} from "./core.js";

/**
 * Opening title: outlined lesson number, kicker, kinetic title and subtitle.
 * Builds over ~1.2 s and slides away between outA and outB.
 */
export function titleCard(ctx, t, o) {
  const outA = o.outA ?? 2.0;
  const outB = o.outB ?? 2.6;
  const out = tw(t, outA, outB, ease.inCubic);
  if (out >= 1 || t < 0) return;
  ctx.save();
  ctx.translate(-out * 240, 0);
  const x = 210;
  const y = 500;
  const nIn = tw(t, 0, 0.7, ease.outExpo);
  ctx.save();
  ctx.globalAlpha = nIn * (1 - out);
  const numY = y + 50 + (1 - nIn) * 60;
  text(ctx, o.num, x - 16, numY, {
    family: F.display,
    size: 320,
    weight: 700,
    stroke: rgba(o.color ?? C.teal, 0.55),
    lineWidth: 2,
    ls: -6,
  });
  const fill = tw(t, 0.2, 1.1, ease.inOutCubic);
  ctx.beginPath();
  ctx.rect(x - 30, numY - 250 * fill + 10, 440, 260 * fill);
  ctx.clip();
  text(ctx, o.num, x - 16, numY, {
    family: F.display,
    size: 320,
    weight: 700,
    color: rgba(o.color ?? C.teal, 0.12),
    ls: -6,
  });
  ctx.restore();

  const rx = x + 360;
  const rule = tw(t, 0.25, 0.9, ease.outQuart);
  line(ctx, rx, y - 140, rx + 1080 * rule, y - 140, o.color ?? C.teal, 2, 0.8 * (1 - out));
  glow(ctx, rx + 1080 * rule, y - 140, 60, o.color ?? C.teal, 0.6 * (1 - rule) * (1 - out));
  text(ctx, o.kicker, rx + 2, y - 164, {
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
    rx,
    y - 34,
    {
      family: F.tc,
      size: o.titleSize ?? 84,
      weight: 800,
      color: C.text,
      stagger: 0.045,
      dur: 0.55,
      rise: 48,
      blur: 10,
    },
    t - 0.35,
    out,
  );
  if (o.sub)
    revealText(
      ctx,
      o.sub,
      rx + 2,
      y + 44,
      {
        family: F.tc,
        size: 32,
        weight: 400,
        color: C.muted,
        stagger: 0.02,
        dur: 0.5,
        rise: 20,
      },
      t - 0.85,
      out,
    );
  ctx.restore();
}

/** Lower-third captions, used when captions are burned into exported video. */
export function burnCaptions(ctx, t, items) {
  const cur = items.find((c) => t >= c.a && t < c.b + 0.4);
  if (!cur) return;
  const a = tw(t, cur.a, cur.a + 0.3) * (1 - tw(t, cur.b, cur.b + 0.35));
  if (a <= 0) return;
  const w = measure(ctx, cur.text, { family: F.tc, size: 44, weight: 700 }) + 64;
  ctx.save();
  ctx.globalAlpha = a;
  rrect(ctx, W / 2 - w / 2, 968, w, 72, 36);
  ctx.fillStyle = "rgba(6,11,19,0.78)";
  ctx.fill();
  ctx.restore();
  text(ctx, cur.text, W / 2, 1006, {
    family: F.tc,
    size: 44,
    weight: 700,
    color: C.text,
    align: "center",
    base: "middle",
    alpha: a,
  });
}

/** Faint price-grid backdrop with parallax drift. */
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

/** Value chip that pops, rises and fades after t0. */
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

/** Rounded translucent panel. */
export function panel(ctx, x, y, w, h, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  rrect(ctx, x, y, w, h, o.r ?? 16);
  ctx.fillStyle = rgba(o.fill ?? C.panel, o.fillAlpha ?? 0.86);
  ctx.fill();
  ctx.strokeStyle = rgba(o.color ?? C.line, o.borderAlpha ?? 1);
  ctx.lineWidth = o.lineWidth ?? 1.5;
  ctx.stroke();
  if (o.accent) {
    ctx.fillStyle = o.accent;
    ctx.fillRect(x, y + 20, 4, Math.min(36, h - 40));
  }
  ctx.restore();
}

/** Counter tile: label + big number (+ unit). */
export function counter(ctx, x, y, label, value, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const color = o.color ?? C.teal;
  const w = o.w ?? 300;
  const h = o.h ?? 128;
  const size = o.size ?? 64;
  panel(ctx, x, y, w, h, {
    alpha,
    color,
    borderAlpha: 0.35 + (o.flash ?? 0) * 0.6,
    accent: color,
  });
  text(ctx, label, x + 24, y + 46, { family: F.tc, size: 24, weight: 500, color: C.muted, alpha });
  text(ctx, value, x + 24, y + h - 22, {
    family: F.display,
    size,
    weight: 700,
    color,
    alpha,
    glow: 10 + (o.flash ?? 0) * 30,
  });
  if (o.unit)
    text(ctx, o.unit, x + 30 + measure(ctx, value, { family: F.display, size, weight: 700 }), y + h - 24, {
      family: F.tc,
      size: 24,
      weight: 500,
      color: C.muted,
      alpha,
    });
}

/** Focus the camera on world point (x, y) at zoom z; `fn` draws in world space. */
export function camera(ctx, cam, fn) {
  ctx.save();
  ctx.translate(W / 2 + (cam.sx ?? 0), H / 2 + (cam.sy ?? 0));
  ctx.scale(cam.z ?? 1, cam.z ?? 1);
  if (cam.rot) ctx.rotate(cam.rot);
  ctx.translate(-(cam.x ?? W / 2), -(cam.y ?? H / 2));
  fn();
  ctx.restore();
}

/** Interpolate between keyframed cameras [{t, x, y, z}] with easing. */
export function camPath(t, keys, fn = ease.inOutCubic) {
  if (t <= keys[0].t) return { ...keys[0] };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (t <= b.t) {
      const u = fn(prog(t, a.hold ?? a.t, b.t));
      return {
        x: lerp(a.x, b.x, u),
        y: lerp(a.y, b.y, u),
        z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), u)),
      };
    }
  }
  return { ...keys[keys.length - 1] };
}

/** Closing statement: one or two lines revealed character by character. */
export function statement(ctx, t, t0, lines, o = {}) {
  const x = o.x ?? W / 2;
  let y = o.y ?? 470;
  const out = o.out ?? 0;
  lines.forEach((ln, i) => {
    const size = ln.size ?? o.size ?? 68;
    revealText(
      ctx,
      ln.text,
      x,
      y,
      {
        family: F.tc,
        size,
        weight: ln.weight ?? 900,
        color: ln.color ?? (i ? C.gold : C.text),
        align: o.align ?? "center",
        stagger: ln.stagger ?? 0.045,
        rise: 30,
        blur: 10,
      },
      t - t0 - (ln.delay ?? i * 0.35),
      out,
    );
    y += ln.gap ?? size * 1.4;
  });
}

/** Soft dark scrim behind closing statements. */
export function scrim(ctx, alpha, y0 = 0, y1 = H) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(6,11,19,0.82)";
  ctx.fillRect(0, y0, W, y1 - y0);
  ctx.restore();
}

/** A row of bear tokens (one bear = one unit in these lessons). */
export function bearRow(ctx, x, y, n, color, o = {}) {
  const step = o.step ?? 40;
  const dir = o.dir ?? 1;
  for (let i = 0; i < n; i++) {
    const pop =
      o.t0 !== undefined
        ? ease.outBack(prog(o.t, o.t0 + i * (o.stagger ?? 0.05), o.t0 + i * (o.stagger ?? 0.05) + 0.35))
        : 1;
    if (pop <= 0) continue;
    bear(ctx, x + i * step * dir, y, (o.size ?? 32) * pop, color, (o.alpha ?? 1) * clamp(pop));
  }
}

/** Small colour legend: [{color, label}] laid out horizontally. */
export function legend(ctx, x, y, items, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  let cx = x;
  for (const it of items) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = it.color;
    rrect(ctx, cx, y - 7, 14, 14, 4);
    ctx.fill();
    ctx.restore();
    cx += 22;
    cx +=
      text(ctx, it.label, cx, y + 1, {
        family: F.tc,
        size: o.size ?? 20,
        weight: 500,
        color: C.muted,
        base: "middle",
        alpha,
      }) + 30;
  }
}

/** Tag with a filled backing plate, e.g. price labels on a hairline. */
export function tag(ctx, str, x, y, o = {}) {
  const size = o.size ?? 22;
  const pad = o.pad ?? 12;
  const w = measure(ctx, str, { family: o.family ?? F.tc, size, weight: o.weight ?? 700 }) + pad * 2;
  const h = size * 1.6;
  const x0 = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return w;
  ctx.save();
  ctx.globalAlpha *= alpha;
  rrect(ctx, x0, y - h / 2, w, h, o.r ?? 8);
  ctx.fillStyle = o.solid ? (o.color ?? C.gold) : rgba(o.color ?? C.gold, 0.16);
  ctx.fill();
  if (!o.solid) {
    ctx.strokeStyle = rgba(o.color ?? C.gold, 0.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
  text(ctx, str, x0 + pad, y + 1, {
    family: o.family ?? F.tc,
    size,
    weight: o.weight ?? 700,
    color: o.solid ? C.ink : (o.textColor ?? o.color ?? C.gold),
    base: "middle",
    alpha,
  });
  return w;
}

/** Arrow from (x1,y1) to (x2,y2), drawn progressively (p 0..1). */
export function arrow(ctx, x1, y1, x2, y2, color, p = 1, o = {}) {
  if (p <= 0) return;
  const x = lerp(x1, x2, p);
  const y = lerp(y1, y2, p);
  line(ctx, x1, y1, x, y, color, o.width ?? 3, o.alpha ?? 1, o.dash);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const s = o.head ?? 14;
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(ang - 0.45) * s, y - Math.sin(ang - 0.45) * s);
  ctx.lineTo(x - Math.cos(ang + 0.45) * s, y - Math.sin(ang + 0.45) * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** In-frame brand watermark and data disclaimer (video export look). */
export function watermark(ctx, alpha = 1, label = "SIMULATED MARKET · 教學用模擬行情") {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawMark(ctx, 116, 70, 34, 1, 0.9);
  text(ctx, "METABEAR ACADEMY", 148, 64, { family: F.mono, size: 15, weight: 600, color: C.text, ls: 4 });
  text(ctx, "互動學院 · 動態教材", 148, 88, { family: F.tc, size: 15, weight: 400, color: C.muted, ls: 2 });
  text(ctx, label, W - 110, 64, {
    family: F.mono,
    size: 14,
    weight: 500,
    color: C.dim,
    align: "right",
    ls: 2,
  });
  ctx.restore();
}

/** Sum of short flashes for a list of event times (for highlight pulses). */
export const flashes = (t, times, decay = 8) => times.reduce((s, t0) => s + pulse(t, t0, decay), 0);

export { lerp };
