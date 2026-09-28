// Core motion toolkit shared by the academy lessons and the showreel. Every
// helper is a pure function of time, so any frame renders in isolation:
// scrubbing, parallel video export and exact audio sync all rely on it.

export const W = 1920;
export const H = 1080;

/** Viewer preferences read by effects (camera shake, flashes). */
export const prefs = { reduced: false };

export const C = {
  bg: "#060b13",
  ink: "#080e18",
  panel: "#0f1a24",
  line: "#1c2c38",
  grid: "#132230",
  text: "#edf2ed",
  muted: "#94a8b9",
  dim: "#4f6474",
  teal: "#78e1d5",
  buy: "#78e1d5",
  sell: "#f09a5a",
  gold: "#e8bd7d",
  white: "#ffffff",
};

export const F = {
  tc: '"Noto Sans TC Variable", "WenQuanYi Zen Hei", sans-serif',
  display: '"Barlow Condensed", "Noto Sans TC Variable", sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, monospace',
};

// ---------- math ----------
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
export const TAU = Math.PI * 2;

export const ease = {
  lin: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t ** 3,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t) => 1 - (1 - t) ** 4,
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  inExpo: (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  inBack: (t, s = 1.70158) => (s + 1) * t ** 3 - s * t * t,
};

/** Tween: eased progress of t inside [a, b]. */
export const tw = (t, a, b, fn = ease.inOutCubic) => fn(prog(t, a, b));

/** Damped spring settling from 0 to 1 once t passes t0. */
export function spring(t, t0, freq = 14, damp = 7) {
  const x = t - t0;
  if (x <= 0) return 0;
  return 1 - Math.exp(-damp * x) * Math.cos(freq * x);
}

/** Sharp attack, exponential release — for flashes and hits. */
export function pulse(t, t0, decay = 6) {
  const x = t - t0;
  return x < 0 ? 0 : Math.exp(-decay * x);
}

/** Sum of pulses at many times. */
export const pulses = (t, times, decay = 6) => times.reduce((s, t0) => s + pulse(t, t0, decay), 0);

// ---------- deterministic randomness ----------
export function hash(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export const rnd = (seed, i = 0) => hash(seed * 7919 + i * 104729);
export const rrange = (seed, i, a, b) => lerp(a, b, rnd(seed, i));

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x, seed = 1) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(rnd(seed, i) * 2 - 1, rnd(seed, i + 1) * 2 - 1, u);
}

/** Camera shake offset triggered at t0. */
export function shake(t, t0, amp = 14, dur = 0.5, seed = 3) {
  const x = t - t0;
  if (prefs.reduced) return [0, 0];
  if (x < 0 || x > dur) return [0, 0];
  const k = (1 - x / dur) ** 2 * amp;
  return [noise1(x * 38, seed) * k, noise1(x * 38, seed + 9) * k];
}

// ---------- color ----------
export function rgba(hex, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function hexMix(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16);
  const b = parseInt(h2.slice(1), 16);
  const ch = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, clamp(t)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

// ---------- font bookkeeping (lets the page preload every glyph it draws) ----------
export const fontUsage = new Map();
export function fontStr(family, size, weight = 400) {
  return `${weight} ${size}px ${family}`;
}
function note(font, str) {
  const set = fontUsage.get(font) ?? new Set();
  for (const ch of str) set.add(ch);
  fontUsage.set(font, set);
}

// ---------- text ----------
/**
 * Draw a text run. opts: family, size, weight, color, align, base, alpha, ls
 * (letter spacing px), glow (px) and glowColor.
 */
export function text(ctx, str, x, y, o = {}) {
  str = String(str);
  const font = fontStr(o.family ?? F.tc, o.size ?? 32, o.weight ?? 400);
  note(font, str);
  if ((o.alpha ?? 1) <= 0.001) return 0;
  ctx.save();
  ctx.font = font;
  ctx.letterSpacing = `${o.ls ?? 0}px`;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = o.base ?? "alphabetic";
  ctx.globalAlpha *= o.alpha ?? 1;
  if (o.glow) {
    ctx.shadowColor = o.glowColor ?? o.color ?? C.text;
    ctx.shadowBlur = o.glow;
  }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.lineWidth ?? 2;
    ctx.strokeText(str, x, y);
  } else {
    ctx.fillStyle = o.color ?? C.text;
    ctx.fillText(str, x, y);
  }
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

export function measure(ctx, str, o = {}) {
  const font = fontStr(o.family ?? F.tc, o.size ?? 32, o.weight ?? 400);
  note(font, String(str));
  ctx.save();
  ctx.font = font;
  ctx.letterSpacing = `${o.ls ?? 0}px`;
  const w = ctx.measureText(String(str)).width;
  ctx.restore();
  return w;
}

/**
 * Per-character kinetic reveal. Each glyph rises, sharpens and fades in with a
 * stagger; `out` (0..1) plays the exit (glyphs lift away in the same order).
 */
export function revealText(ctx, str, x, y, o = {}, t = 1, out = 0) {
  const chars = [...String(str)];
  const stagger = o.stagger ?? 0.035;
  const dur = o.dur ?? 0.5;
  const rise = o.rise ?? 36;
  const total = measure(ctx, str, o);
  let cx = o.align === "center" ? x - total / 2 : o.align === "right" ? x - total : x;
  chars.forEach((ch, i) => {
    const p = ease.outCubic(prog(t, i * stagger, i * stagger + dur));
    const q = ease.inCubic(prog(out, i / chars.length / 2, i / chars.length / 2 + 0.5));
    const w = measure(ctx, ch, o);
    if (p > 0 && q < 1) {
      ctx.save();
      if (o.blur && p < 1) ctx.filter = `blur(${(1 - p) * o.blur}px)`;
      text(ctx, ch, cx, y + (1 - p) * rise - q * rise, {
        ...o,
        align: "left",
        alpha: (o.alpha ?? 1) * p * (1 - q),
      });
      ctx.restore();
    }
    cx += w;
  });
  return total;
}

// ---------- shapes ----------
export function rrect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rr);
}

const glowCache = new Map();
function glowSprite(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const c = new OffscreenCanvas(256, 256);
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, rgba(color, 1));
  grd.addColorStop(0.18, rgba(color, 0.55));
  grd.addColorStop(0.45, rgba(color, 0.14));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  glowCache.set(color, c);
  return c;
}

/** Additive soft light blob. */
export function glow(ctx, x, y, r, color, alpha = 1) {
  if (alpha <= 0.002 || r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha *= clamp(alpha, 0, 4);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Polyline with a layered neon glow. */
export function neonPath(ctx, pts, color, width = 3, alpha = 1, glowAmt = 1) {
  if (pts.length < 2 || alpha <= 0) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const passes =
    glowAmt > 0
      ? [
          [width * 7, 0.05 * glowAmt],
          [width * 3.2, 0.12 * glowAmt],
          [width, 1],
        ]
      : [[width, 1]];
  for (const [lw, a] of passes) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = rgba(color, a * alpha);
    ctx.lineWidth = lw;
    ctx.globalCompositeOperation = a < 1 ? "lighter" : "source-over";
    ctx.stroke();
  }
  ctx.restore();
}

export function line(ctx, x1, y1, x2, y2, color, width = 1, alpha = 1, dash) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** Expanding shockwave ring. */
export function ring(ctx, x, y, t, t0, o = {}) {
  const a = t - t0;
  const dur = o.dur ?? 0.8;
  if (a < 0 || a > dur) return;
  const p = a / dur;
  const r = lerp(o.r0 ?? 6, o.r1 ?? 160, ease.outExpo(p));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba(o.color ?? C.teal, (1 - p) ** 2 * (o.alpha ?? 0.9));
  ctx.lineWidth = lerp(o.w ?? 3, 0.5, p);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Deterministic radial spark burst. */
export function burst(ctx, x, y, t, t0, o = {}) {
  const a = t - t0;
  const life = o.life ?? 0.7;
  if (a < 0 || a > life * 1.4) return;
  const n = o.n ?? 18;
  const seed = o.seed ?? 1;
  const color = o.color ?? C.teal;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const l = life * rrange(seed, i, 0.6, 1.4);
    if (a > l) continue;
    const p = a / l;
    const ang = (o.dir ?? 0) + (rnd(seed, i + 50) - 0.5) * (o.spread ?? TAU);
    const sp = rrange(seed, i + 99, 0.4, 1) * (o.speed ?? 420);
    const d = sp * a * (1 - p * 0.55);
    const px = x + Math.cos(ang) * d;
    const py = y + Math.sin(ang) * d + (o.gravity ?? 0) * a * a;
    const tail = Math.min(d, 26 * (1 - p));
    ctx.strokeStyle = rgba(color, (1 - p) ** 1.5);
    ctx.lineWidth = lerp(2.6, 0.6, p);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.cos(ang) * tail, py - Math.sin(ang) * tail);
    ctx.stroke();
  }
  ctx.restore();
  glow(ctx, x, y, (o.flare ?? 90) * (1 + a * 2), color, pulse(t, t0, 7) * 0.9);
}

// ---------- brand glyphs ----------
const BEAR = "M15 25C4 12 20 5 25 19Q32 16 39 19C45 5 60 13 49 26Q55 47 33 51Q10 48 15 25Z";
let bearPath;
const bearP = () => (bearPath ??= new Path2D(BEAR));

/** One bear = one unit of order size (the academy's counting token). */
export function bear(ctx, x, y, size, color, alpha = 1, o = {}) {
  if (alpha <= 0.002 || size <= 0) return;
  const s = size / 46;
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(s, s);
  ctx.translate(-32, -30);
  ctx.globalAlpha *= alpha;
  if (o.outline) {
    ctx.strokeStyle = color;
    ctx.lineWidth = (3 / Math.max(s, 0.2)) * 0.9;
    ctx.lineJoin = "round";
    ctx.stroke(bearP());
  } else {
    ctx.fillStyle = color;
    ctx.fill(bearP());
    ctx.fillStyle = rgba(C.ink, 0.55);
    ctx.beginPath();
    ctx.arc(26, 33, 2.6, 0, TAU);
    ctx.arc(38, 33, 2.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export const MARK = {
  head: BEAR,
  sticks: ["M25 29v10", "M39 25v14"],
  bodies: ["M22 31h6v5h-6z", "M36 28h6v8h-6z"],
  smile: "m28 42 4 4 5-4",
};

const lenCache = new Map();
/** SVG path length (browser only), cached. */
export function pathLength(d) {
  if (lenCache.has(d)) return lenCache.get(d);
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  const l = p.getTotalLength();
  lenCache.set(d, l);
  return l;
}

/** Stroke an SVG path partially drawn (0..1). */
export function drawStroke(ctx, d, p, color, width, glowAmt = 0) {
  if (p <= 0) return;
  const len = pathLength(d);
  const path = new Path2D(d);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([len * p, len * 2]);
  if (glowAmt) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glowAmt;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.restore();
}

/** The MetaBear mark, drawn on progressively (p: 0..1). */
export function drawMark(ctx, cx, cy, size, p, alpha = 1) {
  if (alpha <= 0 || p <= 0) return;
  const s = size / 64;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx - 32 * s, cy - 30 * s);
  ctx.scale(s, s);
  const head = ease.inOutCubic(prog(p, 0, 0.55));
  drawStroke(ctx, MARK.head, head, C.teal, 3, 10);
  const sticks = ease.outCubic(prog(p, 0.45, 0.7));
  MARK.sticks.forEach((d) => drawStroke(ctx, d, sticks, C.gold, 2));
  MARK.bodies.forEach((d, i) => {
    const b = ease.outBack(prog(p, 0.55 + i * 0.08, 0.8 + i * 0.08));
    if (b <= 0) return;
    const r = new Path2D(d);
    ctx.save();
    const [bx, by] = i ? [39, 32] : [25, 33.5];
    ctx.translate(bx, by);
    ctx.scale(1, b);
    ctx.translate(-bx, -by);
    ctx.fillStyle = C.gold;
    ctx.shadowColor = C.gold;
    ctx.shadowBlur = 8;
    ctx.fill(r);
    ctx.restore();
  });
  drawStroke(ctx, MARK.smile, ease.outCubic(prog(p, 0.78, 1)), C.teal, 2, 6);
  ctx.restore();
}

// ---------- market glyphs ----------
/**
 * Candle between price-space y values. Colors follow the academy: rising =
 * teal, falling = orange.
 */
export function candle(ctx, x, w, yO, yH, yL, yC, o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const up = o.color ? null : yC <= yO;
  const col = o.color ?? (up ? C.buy : C.sell);
  ctx.save();
  ctx.globalAlpha *= alpha;
  const wickGlow = o.wickGlow ?? 0;
  if (wickGlow > 0) {
    ctx.save();
    ctx.shadowColor = o.wickGlowColor ?? C.gold;
    ctx.shadowBlur = 24 * wickGlow;
    line(ctx, x, yH, x, yL, o.wickGlowColor ?? C.gold, 3 + 2 * wickGlow, 1);
    ctx.restore();
  }
  line(ctx, x, yH, x, yL, col, o.wickWidth ?? 3, 1);
  const top = Math.min(yO, yC);
  const h = Math.max(Math.abs(yC - yO), o.minBody ?? 3);
  ctx.fillStyle = col;
  if (o.glow) {
    ctx.shadowColor = col;
    ctx.shadowBlur = o.glow;
  }
  rrect(ctx, x - w / 2, top, w, h, Math.min(4, w / 6));
  if (o.hollow) {
    ctx.fillStyle = C.bg;
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else ctx.fill();
  ctx.restore();
}

export const fmt = (n) => Math.round(n).toLocaleString("en-US");
export const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));

/** Pill label with a tinted fill. */
export function pill(ctx, str, x, y, o = {}) {
  const size = o.size ?? 22;
  const pad = o.pad ?? 14;
  const w = measure(ctx, str, o) + pad * 2;
  const h = size * 1.7;
  const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  rrect(ctx, x0, y - h / 2, w, h, h / 2);
  ctx.fillStyle = rgba(o.bg ?? o.color ?? C.teal, o.bgAlpha ?? 0.14);
  ctx.fill();
  ctx.strokeStyle = rgba(o.color ?? C.teal, o.borderAlpha ?? 0.55);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  text(ctx, str, x0 + pad, y + 1, {
    ...o,
    align: "left",
    base: "middle",
    color: o.textColor ?? o.color ?? C.teal,
  });
  return w;
}
