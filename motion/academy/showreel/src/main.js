import {
  C,
  F,
  W,
  H,
  clamp,
  ease,
  prog,
  tw,
  text,
  rgba,
  fontUsage,
  drawMark,
  pulse,
  lerp,
} from "./core.js";
import { SCENES, TOTAL, FLASHES, CHAPTERS } from "./timeline.js";

const canvas = document.getElementById("stage");
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext("2d", { alpha: false });

// ---------- post-processing buffers ----------
const small = new OffscreenCanvas(W / 4, H / 4);
const sctx = small.getContext("2d");
const bloom = new OffscreenCanvas(W / 4, H / 4);
const bctx = bloom.getContext("2d");

const grains = Array.from({ length: 4 }, (_, k) => {
  const c = new OffscreenCanvas(512, 512);
  const g = c.getContext("2d");
  const img = g.createImageData(512, 512);
  let s = 1234567 + k * 99991;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const v = (s >>> 24) & 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
});

const flashGradient = (() => {
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, "rgba(235,255,250,1)");
  g.addColorStop(0.25, "rgba(150,235,225,0.55)");
  g.addColorStop(1, "rgba(120,225,213,0)");
  return g;
})();

const vignette = (() => {
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(
    W / 2,
    H / 2,
    H * 0.35,
    W / 2,
    H / 2,
    H * 1.05,
  );
  grd.addColorStop(0, "rgba(0,0,0,0)");
  grd.addColorStop(1, "rgba(0,0,0,0.72)");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  return c;
})();

const backdrop = (() => {
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext("2d");
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  const a = g.createRadialGradient(
    W * 0.72,
    H * 0.2,
    0,
    W * 0.72,
    H * 0.2,
    W * 0.7,
  );
  a.addColorStop(0, "rgba(40,90,110,0.20)");
  a.addColorStop(1, "rgba(40,90,110,0)");
  g.fillStyle = a;
  g.fillRect(0, 0, W, H);
  const b = g.createRadialGradient(
    W * 0.15,
    H * 0.95,
    0,
    W * 0.15,
    H * 0.95,
    W * 0.6,
  );
  b.addColorStop(0, "rgba(232,189,125,0.07)");
  b.addColorStop(1, "rgba(232,189,125,0)");
  g.fillStyle = b;
  g.fillRect(0, 0, W, H);
  return c;
})();

function hud(t) {
  const a = tw(t, 12.4, 13.2) * (1 - tw(t, 75.4, 76.2));
  if (a <= 0) return;
  const ch = CHAPTERS.findIndex((c) => t >= c.a && t < c.b);
  ctx.save();
  ctx.globalAlpha = a;
  drawMark(ctx, 116, 70, 34, 1, 0.9);
  text(ctx, "METABEAR ACADEMY", 148, 64, {
    family: F.mono,
    size: 15,
    weight: 600,
    color: C.text,
    ls: 4,
  });
  text(ctx, "訂單流學院 · 四個故事", 148, 88, {
    family: F.tc,
    size: 15,
    weight: 400,
    color: C.muted,
    ls: 2,
  });
  text(ctx, "SIMULATED MARKET · 教學用模擬行情", W - 110, 64, {
    family: F.mono,
    size: 14,
    weight: 500,
    color: C.dim,
    align: "right",
    ls: 2,
  });
  // chapter progress
  const x0 = 140;
  const x1 = W - 140;
  const gap = 14;
  const segW = (x1 - x0 - gap * 3) / 4;
  CHAPTERS.forEach((c, i) => {
    const x = x0 + i * (segW + gap);
    const p = prog(t, c.a, c.b);
    ctx.fillStyle = rgba(C.line, 1);
    ctx.fillRect(x, 1040, segW, 3);
    ctx.fillStyle = i === ch ? C.teal : rgba(C.teal, 0.55);
    ctx.fillRect(x, 1040, segW * p, 3);
    text(ctx, `${c.n}  ${c.label}`, x, 1026, {
      family: F.mono,
      size: 13,
      weight: 500,
      color: i === ch ? C.text : C.dim,
      ls: 2,
    });
  });
  ctx.restore();
}

export function renderFrame(t, frameIndex = Math.round(t * 60)) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.drawImage(backdrop, 0, 0);

  for (const s of SCENES) {
    if (t < s.start - (s.pre ?? 0) || t >= s.start + s.dur + (s.post ?? 0))
      continue;
    ctx.save();
    s.draw(ctx, t - s.start, t);
    ctx.restore();
  }

  hud(t);

  // Bloom: crude threshold via contrast, blur at quarter resolution, add back.
  sctx.filter = "contrast(2.6) brightness(0.9)";
  sctx.drawImage(canvas, 0, 0, W / 4, H / 4);
  bctx.clearRect(0, 0, W / 4, H / 4);
  bctx.filter = "blur(7px)";
  bctx.drawImage(small, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.5;
  ctx.drawImage(bloom, 0, 0, W, H);

  // Flashes on cuts.
  let flash = 0;
  for (const f of FLASHES) {
    const amt = f.amt ?? 0.8;
    flash +=
      t < f.t
        ? f.pre
          ? tw(t, f.t - f.pre, f.t, ease.inExpo) * amt
          : 0
        : pulse(t, f.t, f.decay ?? 5) * amt;
  }
  if (flash > 0.002) {
    // Radial light burst rather than a flat fill, so cuts glow instead of greying out.
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = clamp(flash);
    ctx.fillStyle = flashGradient;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(vignette, 0, 0);

  // Film grain.
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.07;
  const g = grains[frameIndex % 4];
  const ox = -((frameIndex * 197) % 512);
  const oy = -((frameIndex * 331) % 512);
  for (let x = ox; x < W; x += 512)
    for (let y = oy; y < H; y += 512) ctx.drawImage(g, x, y);

  // Fade from / to black at the very ends.
  const black = 1 - tw(t, 0, 0.4) + tw(t, TOTAL - 1.2, TOTAL - 0.05);
  if (black > 0) {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = clamp(black);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** Render a sparse pass to discover every glyph, then preload those fonts. */
async function preloadFonts() {
  await new Promise((ok) => setTimeout(ok, 0));
  for (let t = 0; t < TOTAL; t += 0.25) renderFrame(t);
  const loads = [];
  for (const [font, chars] of fontUsage)
    loads.push(document.fonts.load(font, [...chars].join("")));
  await Promise.all(loads);
  await document.fonts.ready;
}

window.TOTAL = TOTAL;
window.renderFrame = renderFrame;
window.ready = (async () => {
  await preloadFonts();
  renderFrame(0);
  return true;
})();

// ---------- interactive preview ----------
const params = new URLSearchParams(location.search);
if (params.has("preview")) {
  const ui = document.getElementById("ui");
  ui.hidden = false;
  const scrub = document.getElementById("scrub");
  const label = document.getElementById("time");
  const audio = document.getElementById("audio");
  audio.src = "./out/soundtrack.wav";
  scrub.max = TOTAL;
  let playing = false;
  let origin = 0;
  let at = Number(params.get("t") ?? 0);
  const show = () => {
    renderFrame(at);
    scrub.value = at;
    label.textContent = at.toFixed(2) + "s";
  };
  const loop = (now) => {
    if (!playing) return;
    at =
      !audio.paused && audio.readyState > 2
        ? audio.currentTime
        : (now - origin) / 1000;
    if (at >= TOTAL) {
      playing = false;
      at = TOTAL;
    }
    show();
    requestAnimationFrame(loop);
  };
  const toggle = () => {
    playing = !playing;
    if (playing) {
      origin = performance.now() - at * 1000;
      audio.currentTime = at;
      audio.play().catch(() => {});
      requestAnimationFrame(loop);
    } else audio.pause();
  };
  document.getElementById("play").onclick = toggle;
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      toggle();
    }
  });
  scrub.oninput = () => {
    at = Number(scrub.value);
    audio.currentTime = at;
    origin = performance.now() - at * 1000;
    show();
  };
  window.ready.then(show);
}
