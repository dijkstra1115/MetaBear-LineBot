// Drawing toolkit for the film. Everything is a pure function of its inputs: randomness comes from
// integer hashes, motion from closed-form curves, so any frame can be rendered in any order.

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const inv = (a, b, v) => clamp((v - a) / (b - a));
export const smooth = (k) => k * k * (3 - 2 * k);
export const smoother = (k) => k * k * k * (k * (k * 6 - 15) + 10);

export const ease = {
  in2: (k) => k * k,
  in3: (k) => k * k * k,
  in4: (k) => k ** 4,
  out2: (k) => 1 - (1 - k) ** 2,
  out3: (k) => 1 - (1 - k) ** 3,
  out4: (k) => 1 - (1 - k) ** 4,
  out5: (k) => 1 - (1 - k) ** 5,
  outExpo: (k) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k)),
  inExpo: (k) => (k <= 0 ? 0 : 2 ** (10 * k - 10)),
  inOut3: (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  inOutExpo: (k) =>
    k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 2 ** (20 * k - 10) / 2 : (2 - 2 ** (-20 * k + 10)) / 2,
  outBack: (k, s = 1.70158) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2,
  outElastic: (k) =>
    k <= 0 ? 0 : k >= 1 ? 1 : 2 ** (-10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

/** Progress of t through [a, b], eased. */
export const seg = (t, a, b, fn = (k) => k) => fn(inv(a, b, t));
/** 0 → 1 → 0 envelope: rises over [a, a+fadeIn], holds, falls over [b-fadeOut, b]. */
export const env = (t, a, b, fadeIn = 0.2, fadeOut = 0.2) =>
  Math.min(inv(a, a + fadeIn, t), 1 - inv(b - fadeOut, b, t));
/** Exponential decay after a trigger time. */
export const decay = (t, at, rate) => (t < at ? 0 : Math.exp(-(t - at) * rate));

// ---------- Deterministic noise ----------

export function hash(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export const rnd = (i, j = 0) => hash(i * 7919 + j * 104729 + 13);
export const rr = (i, j, a, b) => a + rnd(i, j) * (b - a);
/** Gaussian-ish sample from two hashes. */
export const gauss = (i, j = 0) =>
  Math.sqrt(-2 * Math.log(1 - rnd(i, j * 2 + 1) * 0.9999)) * Math.cos(TAU * rnd(i, j * 2 + 2));

export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = rnd(i, seed) * 2 - 1;
  const b = rnd(i + 1, seed) * 2 - 1;
  return lerp(a, b, smoother(f));
}
export function fbm(x, seed = 0, oct = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    v += noise1(x * f, seed + o * 31) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return v;
}

// ---------- Color ----------

export const C = {
  bg: [4, 7, 11],
  ink: [233, 241, 248],
  ink2: [166, 182, 199],
  ink3: [106, 124, 144],
  line: [140, 178, 214],
  long: [45, 226, 166],
  longInk: [147, 247, 212],
  short: [255, 79, 110],
  shortInk: [255, 166, 182],
  fuel: [255, 173, 66],
  gold: [255, 215, 122],
  violet: [169, 139, 255],
  info: [108, 182, 255],
  white: [255, 255, 255],
};
export const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// The arena's liquidation-heat ramp: deep violet → magenta → amber → white-hot.
const HEAT = [
  [0, [26, 10, 46]],
  [0.25, [92, 22, 120]],
  [0.48, [214, 40, 128]],
  [0.7, [255, 128, 52]],
  [0.86, [255, 206, 102]],
  [1, [255, 250, 232]],
];
export function heat(k) {
  k = clamp(k);
  for (let i = 1; i < HEAT.length; i++) {
    if (k <= HEAT[i][0]) {
      const [a, ca] = HEAT[i - 1];
      const [b, cb] = HEAT[i];
      return mix(ca, cb, (k - a) / (b - a));
    }
  }
  return HEAT[HEAT.length - 1][1];
}

// ---------- Sprites ----------

const sprites = new Map();
/** Soft radial glow sprite (64px), tinted. Drawn scaled for every glow and particle head. */
export function glow(c, hard = 0) {
  const key = c.join(",") + "|" + hard;
  let s = sprites.get(key);
  if (s) return s;
  s = document.createElement("canvas");
  s.width = s.height = 128;
  const g = s.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  const core = hard ? 0.35 : 0.12;
  gr.addColorStop(0, rgba(mix(c, C.white, 0.75), 1));
  gr.addColorStop(core, rgba(c, 0.85));
  gr.addColorStop(0.4, rgba(c, 0.22));
  gr.addColorStop(0.7, rgba(c, 0.05));
  gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  sprites.set(key, s);
  return s;
}
export function blob(ctx, x, y, r, c, a = 1, hard = 0) {
  if (a <= 0.002 || r <= 0.1) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(glow(c, hard), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// ---------- Text ----------

export const F = {
  display: (w, px) => `${w} ${px}px "Barlow Condensed", "Noto Sans TC Variable", sans-serif`,
  mono: (w, px) => `${w} ${px}px "JetBrains Mono Variable", ui-monospace, monospace`,
  zh: (w, px) => `${w} ${px}px "Noto Sans TC Variable", sans-serif`,
};

export function text(ctx, str, x, y, { font, color = C.ink, alpha = 1, align = "left", base = "alphabetic", track = 0 } = {}) {
  if (alpha <= 0.002) return 0;
  ctx.font = font;
  ctx.letterSpacing = `${track}px`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = typeof color === "string" ? color : rgba(color);
  ctx.fillText(str, x, y);
  ctx.globalAlpha = 1;
  const w = ctx.measureText(str).width;
  ctx.letterSpacing = "0px";
  return w;
}
export function measure(ctx, str, font, track = 0) {
  ctx.font = font;
  ctx.letterSpacing = `${track}px`;
  const w = ctx.measureText(str).width - track;
  ctx.letterSpacing = "0px";
  return w;
}

/**
 * Kinetic headline: each word rises out of a mask with a staggered expo ease and leaves with a
 * soft lift. `p` is the time since the line started, `out` the time until it leaves (negative = gone).
 */
export function headline(ctx, words, cx, y, { size = 96, color = C.ink, track = 2, stagger = 0.06, p, out = 9, weight = 700, accent = -1, accentColor = C.fuel, align = "center" }) {
  const font = F.display(weight, size);
  const space = size * 0.24;
  const widths = words.map((w) => measure(ctx, w, font, track));
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let x = align === "center" ? cx - total / 2 : align === "right" ? cx - total : cx;
  const outK = clamp(1 - out / 0.35);
  for (let i = 0; i < words.length; i++) {
    const k = ease.outExpo(clamp((p - i * stagger) / 0.55));
    const ko = ease.in3(clamp(outK * 1.4 - i * 0.08));
    const a = clamp(k * 1.6) * (1 - ko);
    if (a > 0.002) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - size, y - size * 1.05, widths[i] + size * 2, size * 1.32);
      ctx.clip();
      const dy = (1 - k) * size * 1.05 - ko * size * 0.35;
      text(ctx, words[i], x, y + dy, { font, color: i === accent ? accentColor : color, alpha: a, track });
      ctx.restore();
    }
    x += widths[i] + space;
  }
  return total;
}

/** Secondary Chinese line with a per-character fade-up. */
export function subline(ctx, str, cx, y, { size = 30, color = C.ink2, p, out = 9, track = 6, weight = 500, align = "center" }) {
  const font = F.zh(weight, size);
  const chars = [...str];
  const widths = chars.map((ch) => measure(ctx, ch, font, 0) + track);
  const total = widths.reduce((a, b) => a + b, 0) - track;
  let x = align === "center" ? cx - total / 2 : align === "right" ? cx - total : cx;
  const fo = clamp(1 - out / 0.3);
  for (let i = 0; i < chars.length; i++) {
    const k = ease.out3(clamp((p - 0.12 - i * 0.022) / 0.45));
    const a = k * (1 - fo);
    if (a > 0.002) text(ctx, chars[i], x, y + (1 - k) * 14, { font, color, alpha: a });
    x += widths[i];
  }
}

/** Small HUD label (mono, tracked caps). */
export function label(ctx, str, x, y, { size = 15, color = C.ink3, alpha = 1, align = "left", track = 3, weight = 600 } = {}) {
  return text(ctx, str, x, y, { font: F.mono(weight, size), color, alpha, align, track });
}

/** Typewriter: reveals characters over [0, dur] with a scrambling leading edge. */
export function typeOn(str, p, dur = 0.5, seed = 0) {
  if (p >= dur) return str;
  const n = str.length;
  const shown = clamp(p / dur) * n;
  let out = "";
  const glyphs = "0123456789ABCDEF#$%+-×·";
  for (let i = 0; i < n; i++) {
    if (i < shown - 1.5) out += str[i];
    else if (i < shown + 1.5 && str[i] !== " ") out += glyphs[Math.floor(rnd(i + seed, Math.floor(p * 30)) * glyphs.length)];
    else if (i < shown) out += str[i];
  }
  return out;
}

export const fmt = (v, d = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const money = (v) => (v < 0 ? "−$" : "+$") + fmt(Math.abs(v));

// ---------- Shapes ----------

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Arena-style glass panel. */
export function glass(ctx, x, y, w, h, { r = 16, alpha = 1, tint = C.line, fill = 0.78, edge = 0.16 } = {}) {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, `rgba(16,25,38,${fill + 0.08})`);
  g.addColorStop(1, `rgba(8,13,21,${fill})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = rgba(tint, edge);
  ctx.stroke();
  // Top sheen.
  ctx.beginPath();
  ctx.moveTo(x + r, y + 0.5);
  ctx.lineTo(x + w - r, y + 0.5);
  const sg = ctx.createLinearGradient(x, 0, x + w, 0);
  sg.addColorStop(0, "rgba(255,255,255,0)");
  sg.addColorStop(0.5, `rgba(255,255,255,${edge * 1.2})`);
  sg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = sg;
  ctx.stroke();
  ctx.restore();
}

/** Thin line with glow: a wide faint pass under a crisp core. */
export function glowLine(ctx, pts, c, { width = 2, glowW = 10, a = 1, ga = 0.25, cap = "round" } = {}) {
  if (pts.length < 2 || a <= 0.002) return;
  ctx.save();
  ctx.lineCap = cap;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba(c, ga * a);
  ctx.lineWidth = glowW;
  ctx.stroke();
  ctx.strokeStyle = rgba(mix(c, C.white, 0.25), a);
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

// ---------- 3D ----------

/**
 * Pinhole camera. `yaw` turns about the vertical axis (0 looks down +z), `pitch` tilts up/down.
 * Returns screen [x, y, depth] or null behind the near plane.
 */
export function camera({ x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, f = 1000, cx = 960, cy = 540 }) {
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const project = (px, py, pz) => {
    let dx = px - x;
    let dy = py - y;
    let dz = pz - z;
    // yaw
    let tx = dx * cyw - dz * syw;
    let tz = dx * syw + dz * cyw;
    dx = tx;
    dz = tz;
    // pitch
    let ty = dy * cp - dz * sp;
    tz = dy * sp + dz * cp;
    dy = ty;
    dz = tz;
    if (dz < 1) return null;
    const s = f / dz;
    let sx = dx * s;
    let sy = -dy * s;
    tx = sx * cr - sy * sr;
    ty = sx * sr + sy * cr;
    return [cx + tx, cy + ty, dz, s];
  };
  return { project, f };
}

/** Draws `img` into the quad tl,tr,br,bl using vertical strips (correct perspective for yaw). */
export function drawQuad(ctx, img, q, { strips = 32, alpha = 1, sw = img.width, sh = img.height } = {}) {
  if (!q.every(Boolean) || alpha <= 0.002) return;
  const [tl, tr, br, bl] = q;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Perspective-correct parameterisation along the strip axis using the depth of each corner.
  const zl = tl[2];
  const zr = tr[2];
  for (let i = 0; i < strips; i++) {
    const u0 = i / strips;
    const u1 = (i + 1) / strips;
    const pc = (u) => (u / zr) / ((1 - u) / zl + u / zr);
    const a0 = pc(u0);
    const a1 = pc(u1);
    const top0 = [lerp(tl[0], tr[0], u0), lerp(tl[1], tr[1], u0)];
    const top1 = [lerp(tl[0], tr[0], u1), lerp(tl[1], tr[1], u1)];
    const bot0 = [lerp(bl[0], br[0], u0), lerp(bl[1], br[1], u0)];
    const sx0 = a0 * sw;
    const sx1 = a1 * sw;
    const swd = Math.max(0.5, sx1 - sx0);
    // Affine map: source (sx0,0)→top0, (sx1,0)→top1, (sx0,sh)→bot0.
    const m11 = (top1[0] - top0[0]) / swd;
    const m12 = (top1[1] - top0[1]) / swd;
    const m21 = (bot0[0] - top0[0]) / sh;
    const m22 = (bot0[1] - top0[1]) / sh;
    ctx.setTransform(m11, m12, m21, m22, top0[0] - m11 * sx0, top0[1] - m12 * sx0);
    ctx.drawImage(img, sx0, 0, swd + 0.6, sh, sx0, 0, swd + 0.6, sh);
  }
  ctx.restore();
}

// ---------- Particles ----------

/**
 * Closed-form ballistic particle with linear drag: position after `age` seconds.
 * vx, vy in px/s; g in px/s² (positive = down); k = drag rate.
 */
export function ballistic(x0, y0, vx, vy, g, k, age) {
  const e = Math.exp(-k * age);
  const d = (1 - e) / k;
  return [x0 + vx * d, y0 + vy * d + (g / k) * (age - d)];
}

/**
 * Burst of sparks at (x, y) fired at time t0 (in the clock passed as `t`). Streaks are drawn
 * between two closely spaced ages, so fast sparks get motion-blurred trails for free.
 */
export function sparks(ctx, t, t0, x, y, { n = 60, seed = 1, speed = 900, angle = -Math.PI / 2, arc = TAU, g = 900, k = 2.6, life = 1, color = C.gold, size = 2.2, trail = 0.045, alpha = 1 } = {}) {
  const age = t - t0;
  if (age < 0 || age > life * 1.2) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const L = life * rr(seed, i * 5, 0.45, 1);
    if (age > L) continue;
    const dir = angle + (rnd(seed, i * 5 + 1) - 0.5) * arc;
    const v = speed * rr(seed, i * 5 + 2, 0.2, 1);
    const vx = Math.cos(dir) * v;
    const vy = Math.sin(dir) * v;
    const p1 = ballistic(x, y, vx, vy, g, k, age);
    const p0 = ballistic(x, y, vx, vy, g, k, Math.max(0, age - trail));
    const fade = (1 - age / L) ** 1.4;
    const s = size * rr(seed, i * 5 + 3, 0.6, 1.4);
    const hot = mix(color, C.white, 0.6 * fade);
    ctx.strokeStyle = rgba(hot, fade * alpha);
    ctx.lineWidth = s;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.stroke();
    if (i % 3 === 0) blob(ctx, p1[0], p1[1], s * 6, color, fade * 0.5 * alpha);
  }
  ctx.restore();
}

/** Expanding shockwave ring. */
export function ring(ctx, t, t0, x, y, { r0 = 10, r1 = 420, dur = 0.7, color = C.white, width = 3, alpha = 1, sy = 1 } = {}) {
  const age = t - t0;
  if (age < 0 || age > dur) return;
  const k = age / dur;
  const r = lerp(r0, r1, ease.out4(k));
  const a = (1 - k) ** 1.6 * alpha;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  ctx.scale(1, sy);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.strokeStyle = rgba(color, a * 0.25);
  ctx.lineWidth = width * 6 * (1 - k * 0.5);
  ctx.stroke();
  ctx.strokeStyle = rgba(mix(color, C.white, 0.5), a);
  ctx.lineWidth = width * (1 - k * 0.6);
  ctx.stroke();
  ctx.restore();
}

/** Embers: slow drifting motes in a rectangle, looping forever (pure function of t). */
export function embers(ctx, t, { n = 80, seed = 7, x = 0, y = 0, w = 1920, h = 1080, color = C.fuel, size = 2, alpha = 1, rise = 40 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const period = rr(seed, i, 4, 9);
    const ph = (t / period + rnd(seed, i + 500)) % 1;
    const px = x + rnd(seed, i + 900) * w + Math.sin(t * rr(seed, i + 40, 0.3, 0.9) + i) * 18;
    const py = y + h - ph * (h + rise * period * 0.2) + 20;
    const fl = 0.55 + 0.45 * Math.sin(t * rr(seed, i + 77, 3, 9) + i * 1.7);
    const a = Math.sin(ph * Math.PI) * fl * alpha;
    blob(ctx, px, py, size * rr(seed, i + 3, 2, 5), color, a * 0.9, 1);
  }
  ctx.restore();
}
