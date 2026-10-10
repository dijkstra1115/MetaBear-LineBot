// Shared scene kit, injected into every composition by scripts/build.mjs. Expects SCENE = { id, T0, DUR }.
// Everything visual is a pure function of film time: DOM entrances on the GSAP timeline, and one
// render(ft) driver per scene for canvas charts, counters, chrome and camera.
const BAR = 2.0689655;
const BEAT = BAR / 4;
const D0 = 0; // film bar 0 is song bar 4: the cut starts on a downbeat
const bar = (n, beat = 0) => +(D0 + n * BAR + beat * BEAT).toFixed(4);
const ROOT = document.querySelector('[data-composition-id="' + SCENE.id + '"]');
const $ = (s) => ROOT.querySelector(s);
const $$ = (s) => Array.from(ROOT.querySelectorAll(s));
const el = (x) => (typeof x === "string" ? $$(x) : x);
const tl = gsap.timeline({ paused: true });
const L = (t) => Math.max(0, +(t - SCENE.T0).toFixed(4));

// ---- entrances (each a different attack; see DESIGN.md) ----
const slam = (x, t, o = {}) =>
  tl.fromTo(
    el(x),
    { opacity: 0, scale: o.from ?? 1.6, filter: `blur(${o.blur ?? 16}px)`, x: o.x ?? 0, y: o.y ?? 0 },
    { opacity: 1, scale: 1, filter: "blur(0px)", x: 0, y: 0, duration: o.d ?? 0.2, ease: o.ease ?? "power4.out", stagger: o.stagger ?? 0, immediateRender: o.ir ?? true },
    L(t),
  );
const snap = (x, t, o = {}) =>
  tl.fromTo(
    el(x),
    { opacity: 0, x: o.dx ?? -180, skewX: o.skew ?? -14 },
    { opacity: 1, x: 0, skewX: 0, duration: o.d ?? 0.3, ease: "expo.out", stagger: o.stagger ?? 0, immediateRender: o.ir ?? true },
    L(t),
  );
const rise = (x, t, o = {}) =>
  tl.fromTo(
    el(x),
    { opacity: 0, y: o.dy ?? 80, clipPath: "inset(0% 0% 100% 0%)" },
    { opacity: 1, y: 0, clipPath: "inset(0% 0% 0% 0%)", duration: o.d ?? 0.38, ease: o.ease ?? "circ.out", stagger: o.stagger ?? 0, immediateRender: o.ir ?? true },
    L(t),
  );
const wipe = (x, t, o = {}) =>
  tl.fromTo(
    el(x),
    { opacity: 1, clipPath: o.from ?? "inset(0% 100% 0% 0%)" },
    { clipPath: "inset(0% 0% 0% 0%)", duration: o.d ?? 0.34, ease: o.ease ?? "power3.inOut", stagger: o.stagger ?? 0, immediateRender: o.ir ?? true },
    L(t),
  );
const pop = (x, t, o = {}) =>
  tl.fromTo(
    el(x),
    { opacity: 0, scale: o.from ?? 0.3, rotation: o.rot ?? -10 },
    { opacity: 1, scale: 1, rotation: 0, duration: o.d ?? 0.42, ease: "back.out(1.6)", stagger: o.stagger ?? 0, immediateRender: o.ir ?? true },
    L(t),
  );
const fade = (x, t, d = 0.3, to = 1, from = 0) =>
  tl.fromTo(el(x), { opacity: from }, { opacity: to, duration: d, ease: "power2.out", immediateRender: false }, L(t));
const out = (x, t, o = {}) =>
  tl.to(
    el(x),
    { opacity: 0, x: o.dx ?? 0, y: o.dy ?? 0, scale: o.scale ?? 1, filter: `blur(${o.blur ?? 0}px)`, duration: o.d ?? 0.2, ease: o.ease ?? "power2.in", stagger: o.stagger ?? 0 },
    L(t),
  );
const hide = (x, t) => tl.set(el(x), { opacity: 0 }, L(t));
const flash = (x, t, peak = 0.85, d = 0.4) =>
  tl.fromTo(el(x), { opacity: peak }, { opacity: 0, duration: d, ease: "power2.out", immediateRender: false }, L(t));
const kick = (x, t, s = 1.14, d = 0.26) =>
  tl.fromTo(el(x), { scale: s }, { scale: 1, duration: d, ease: "power2.out", immediateRender: false }, L(t));
const drift = (x, t0, t1, from, to) =>
  tl.fromTo(el(x), from, { ...to, duration: Math.max(0.01, t1 - t0), ease: "sine.inOut", immediateRender: false }, L(t0));

// ---- numbers and text ----
const usd = (v) => "$" + Math.round(v).toLocaleString("en-US");
const yi = (v, d = 2) => (v / 1e8).toFixed(d);
const int = (v) => Math.round(v).toLocaleString("en-US");
const two = (n) => String(n).padStart(2, "0");
const clock = (s) => {
  s = Math.max(0, Math.floor(s));
  return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
};
const setText = (node, s) => {
  if (node.__t !== s) {
    node.textContent = s;
    node.__t = s;
  }
};

// ---- pure time functions ----
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const EASE = {
  lin: (x) => x,
  in: (x) => x * x * x,
  in2: (x) => x * x,
  out: (x) => 1 - (1 - x) ** 3,
  out4: (x) => 1 - (1 - x) ** 4,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  expo: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  step: (x) => (x >= 1 ? 1 : 0),
};
const mix = (a, b, x) =>
  typeof a === "number" ? a + (b - a) * x : Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + (b[k] - a[k]) * x]));
// keys: [[t, value, ease?], ...] — a key's ease shapes the segment that ends at it
const track = (keys, t) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k[0]) {
      const p = keys[i - 1];
      return mix(p[1], k[1], EASE[k[2] || "lin"]((t - p[0]) / (k[0] - p[0] || 1)));
    }
  }
  return keys[keys.length - 1][1];
};
const prog = (t, t0, t1, e = "lin") => EASE[e](clamp((t - t0) / (t1 - t0), 0, 1));
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const sample = (a, x) => {
  if (x <= 0) return a[0];
  const n = a.length - 1;
  if (x >= n) return a[n];
  const i = Math.floor(x);
  return a[i] + (a[i + 1] - a[i]) * (x - i);
};
// deterministic camera shake from impact events [[t, amplitude, duration], ...]
const shake = (t, hits) => {
  let x = 0, y = 0, r = 0;
  for (const [t0, amp, dur] of hits) {
    if (t < t0 || t > t0 + dur) continue;
    const env = (1 - (t - t0) / dur) ** 2 * amp;
    const k = Math.floor(t * 60);
    x += (hash(k * 3 + 1) - 0.5) * 2 * env;
    y += (hash(k * 5 + 2) - 0.5) * 2 * env;
    r += (hash(k * 7 + 3) - 0.5) * 0.06 * env;
  }
  return { x, y, r };
};

// ---- canvas ----
const canvas = (sel) => {
  const c = $(sel);
  const ctx = c.getContext("2d");
  return ctx;
};
const yMap = (v, r) =>
  v.log
    ? (p) => r.y + r.h * (1 - (Math.log(p) - Math.log(v.y0)) / (Math.log(v.y1) - Math.log(v.y0)))
    : (p) => r.y + r.h * (1 - (p - v.y0) / (v.y1 - v.y0));
const xMap = (v, r) => (t) => r.x + ((t - v.x0) / (v.x1 - v.x0)) * r.w;
// price line from game second `from` to `to` (fractional) in view v inside rect r
const priceLine = (ctx, a, from, to, v, r, o = {}) => {
  const X = xMap(v, r), Y = yMap(v, r);
  const t0 = Math.max(from, v.x0), t1 = Math.min(to, v.x1, a.length - 1);
  if (t1 <= t0) return null;
  const step = Math.max(0.25, (v.x1 - v.x0) / r.w);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x - 4, r.y - (o.over ?? 0), r.w + 8, r.h + (o.over ?? 0) * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(X(t0), Y(sample(a, t0)));
  for (let t = t0 + step; t < t1; t += step) ctx.lineTo(X(t), Y(sample(a, t)));
  const end = sample(a, t1);
  const hx = X(t1), hy = Y(end);
  ctx.lineTo(hx, hy);
  const color = o.color ?? "236,242,247";
  if (o.fill) {
    ctx.save();
    ctx.lineTo(hx, r.y + r.h);
    ctx.lineTo(X(t0), r.y + r.h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, `rgba(${color},${o.fill})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(X(t0), Y(sample(a, t0)));
    for (let t = t0 + step; t < t1; t += step) ctx.lineTo(X(t), Y(sample(a, t)));
    ctx.lineTo(hx, hy);
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = `rgba(${color},${(o.glow ?? 0.16) * (o.alpha ?? 1)})`;
  ctx.lineWidth = (o.lw ?? 4) * 5;
  ctx.stroke();
  ctx.strokeStyle = `rgba(${color},${o.alpha ?? 1})`;
  ctx.lineWidth = o.lw ?? 4;
  ctx.stroke();
  ctx.restore();
  return { x: hx, y: hy, p: end };
};
const head = (ctx, x, y, color = "236,242,247", s = 1) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 46 * s);
  g.addColorStop(0, `rgba(${color},0.55)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 46 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgb(${color})`;
  ctx.beginPath();
  ctx.arc(x, y, 9 * s, 0, Math.PI * 2);
  ctx.fill();
};
// readable price ticks for any view (linear or log): coarse round numbers first, then finer ones
// wherever they still keep minPx apart
const niceTicks = (v, r, minPx = 70) => {
  const Y = yMap(v, r);
  const lo = Math.min(v.y0, v.y1), hi = Math.max(v.y0, v.y1);
  // across a wide log range only round mantissas read as round (100k, 150k, 200k, 300k…)
  const wide = hi / lo > 2.5;
  const roundish = (p) => {
    const m = p / 10 ** Math.floor(Math.log10(p));
    return [1, 1.5, 2, 3, 4, 5, 6, 8].some((x) => Math.abs(m - x) < 1e-9);
  };
  const steps = [];
  for (let k = Math.floor(Math.log10(hi)); k >= Math.floor(Math.log10(Math.max(1, hi - lo))) - 1; k--)
    for (const m of [5, 2, 1]) steps.push(m * 10 ** k);
  const keep = [];
  for (const step of steps)
    for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
      const y = Y(p);
      if (y < r.y + 20 || y > r.y + r.h - 8 || (wide && !roundish(p))) continue;
      if (keep.every((q) => Math.abs(Y(q) - y) >= minPx)) keep.push(p);
    }
  return keep;
};
// faint price grid with labels on the right edge of r
const grid = (ctx, v, r, prices, o = {}) => {
  const Y = yMap(v, r);
  ctx.save();
  ctx.font = `700 ${o.size ?? 22}px "JetBrains Mono"`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  for (const p of prices) {
    const y = Y(p);
    if (y < r.y - 2 || y > r.y + r.h + 2) continue;
    ctx.fillStyle = `rgba(236,242,247,${o.line ?? 0.08})`;
    ctx.fillRect(r.x, Math.round(y), r.w, 2);
    ctx.fillStyle = `rgba(147,163,180,${o.label ?? 0.85})`;
    ctx.fillText(usd(p), r.x + r.w, y - 8);
  }
  ctx.restore();
};
const bgGrid = (ctx, alpha = 0.05, ox = 0, oy = 0) => {
  ctx.fillStyle = `rgba(236,242,247,${alpha})`;
  const sx = ((ox % 60) + 60) % 60, sy = ((oy % 60) + 60) % 60;
  for (let x = sx; x < 1920; x += 60) ctx.fillRect(Math.round(x), 0, 1, 1080);
  for (let y = sy; y < 1080; y += 60) ctx.fillRect(0, Math.round(y), 1920, 1);
};
// ballistic particle burst, a pure function of time since t0
const burst = (ctx, t, t0, x, y, o = {}) => {
  const tau = t - t0;
  const life = o.life ?? 1.2;
  if (tau < 0 || tau > life) return;
  const n = o.n ?? 40;
  const color = o.color ?? "45,226,166";
  for (let i = 0; i < n; i++) {
    const a = (o.angle ?? -Math.PI / 2) + (hash(i * 7 + (o.seed ?? 1)) - 0.5) * (o.arc ?? Math.PI * 1.2);
    const sp = (o.speed ?? 900) * (0.35 + hash(i * 13 + (o.seed ?? 1)) * 0.9);
    const px = x + Math.cos(a) * sp * tau;
    const py = y + Math.sin(a) * sp * tau + 0.5 * (o.g ?? 900) * tau * tau;
    const k = 1 - tau / life;
    const s = (o.size ?? 6) * (0.5 + hash(i * 3 + 9));
    ctx.fillStyle = `rgba(${color},${k * k})`;
    ctx.fillRect(px - s / 2, py - s / 2, s, s * (o.stretch ?? 1));
  }
};

// ---- broadcast chrome: REPLAY bug, game clock, 24-turn scrubber ----
const chrome = (box, who, seed) => {
  box.insertAdjacentHTML(
    "beforeend",
    // the overlay's vignette deliberately grades the frame corners over the broadcast chrome
    `<div class="bug"><div class="rec" data-layout-allow-occlusion><i></i>REPLAY</div><div class="who" data-layout-allow-occlusion>${who}<span data-layout-allow-occlusion>SEED ${seed}</span></div></div>` +
      `<div class="clockbox"><span data-layout-allow-occlusion>T+</span><b class="ck" data-layout-allow-occlusion>00:00:00</b><span data-layout-allow-occlusion>/ 02:00:00</span></div>` +
      `<div class="scrub"><div class="rail"></div>${Array.from({ length: 23 }, (_, i) => `<div class="tick" style="left:${((i + 1) / 24) * 1776}px"></div>`).join("")}<div class="fill"></div><div class="head"></div></div>`,
  );
  const ck = box.querySelector(".ck"), fill = box.querySelector(".fill"), hd = box.querySelector(".head");
  return (gameT) => {
    const g = clamp(gameT, 0, 7200);
    setText(ck, clock(g));
    fill.style.transform = `scaleX(${g / 7200})`;
    hd.style.transform = `translateX(${(g / 7200) * 1776}px)`;
  };
};
// one driver: render(ft) for the whole scene
const drive = (render) => {
  const c = { v: 0 };
  render(SCENE.T0);
  tl.to(c, { v: SCENE.DUR, duration: SCENE.DUR, ease: "none", onUpdate: () => render(SCENE.T0 + c.v) }, 0);
};
