// Frame compositor: lessons draw in a fixed 1920×1080 space; the compositor
// scales that to the canvas backing store and adds backdrop, bloom, grain,
// vignette and cut flashes. Output depends only on (t, frame index).
import { C, W, H, clamp, ease, tw, pulse, prefs } from "./core.js";
import { burnCaptions, watermark } from "./kit.js";

const canFilter = (ctx) => typeof ctx.filter === "string";

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function createCompositor(canvas, options = {}) {
  const ctx = canvas.getContext("2d", { alpha: false });
  let bw = 0;
  let bh = 0;
  let k = 1;
  let small;
  let sctx;
  let bloom;
  let bctx;
  let grains = [];
  let vignette;
  let backdrop;
  let flashGrad;
  let quality = options.quality ?? "high";

  function build() {
    small = makeCanvas(Math.max(1, Math.round(bw / 4)), Math.max(1, Math.round(bh / 4)));
    sctx = small.getContext("2d");
    bloom = makeCanvas(small.width, small.height);
    bctx = bloom.getContext("2d");
    vignette = makeCanvas(bw, bh);
    const vg = vignette.getContext("2d");
    const grd = vg.createRadialGradient(bw / 2, bh / 2, bh * 0.35, bw / 2, bh / 2, bh * 1.05);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(0,0,0,0.7)");
    vg.fillStyle = grd;
    vg.fillRect(0, 0, bw, bh);
    backdrop = makeCanvas(bw, bh);
    const g = backdrop.getContext("2d");
    g.fillStyle = C.bg;
    g.fillRect(0, 0, bw, bh);
    const a = g.createRadialGradient(bw * 0.72, bh * 0.2, 0, bw * 0.72, bh * 0.2, bw * 0.7);
    a.addColorStop(0, "rgba(40,90,110,0.20)");
    a.addColorStop(1, "rgba(40,90,110,0)");
    g.fillStyle = a;
    g.fillRect(0, 0, bw, bh);
    const b = g.createRadialGradient(bw * 0.15, bh * 0.95, 0, bw * 0.15, bh * 0.95, bw * 0.6);
    b.addColorStop(0, "rgba(232,189,125,0.07)");
    b.addColorStop(1, "rgba(232,189,125,0)");
    g.fillStyle = b;
    g.fillRect(0, 0, bw, bh);
    flashGrad = ctx.createRadialGradient(bw / 2, bh / 2, 0, bw / 2, bh / 2, bw * 0.62);
    flashGrad.addColorStop(0, "rgba(235,255,250,1)");
    flashGrad.addColorStop(0.25, "rgba(150,235,225,0.55)");
    flashGrad.addColorStop(1, "rgba(120,225,213,0)");
    if (!grains.length)
      grains = Array.from({ length: 4 }, (_, n) => {
        const c = makeCanvas(256, 256);
        const gg = c.getContext("2d");
        const img = gg.createImageData(256, 256);
        let s = 1234567 + n * 99991;
        for (let i = 0; i < img.data.length; i += 4) {
          s = (Math.imul(s, 1103515245) + 12345) >>> 0;
          const v = (s >>> 24) & 255;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        gg.putImageData(img, 0, 0);
        return c;
      });
  }

  /** Set backing resolution (width in device pixels, 16:9). */
  function resize(width) {
    const w = Math.max(320, Math.min(W, Math.round(width)));
    const h = Math.round((w * H) / W);
    if (w === bw && h === bh) return;
    bw = w;
    bh = h;
    k = bw / W;
    canvas.width = bw;
    canvas.height = bh;
    build();
  }
  resize(options.width ?? W);

  function render(lesson, t, frame = Math.round(t * 60), extra = {}) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.drawImage(backdrop, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.save();
    lesson.draw(ctx, t);
    ctx.restore();
    if (extra.watermark !== false) watermark(ctx, tw(t, 0.2, 0.8) * 0.9);
    if (extra.captions) burnCaptions(ctx, t, lesson.captions ?? []);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (quality === "high" && canFilter(sctx)) {
      sctx.filter = "contrast(2.6) brightness(0.9)";
      sctx.drawImage(canvas, 0, 0, small.width, small.height);
      bctx.clearRect(0, 0, bloom.width, bloom.height);
      bctx.filter = `blur(${Math.max(2, 7 * (small.width / 480))}px)`;
      bctx.drawImage(small, 0, 0);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5;
      ctx.drawImage(bloom, 0, 0, bw, bh);
    }

    let flash = 0;
    if (!prefs.reduced)
      for (const f of lesson.flashes ?? []) {
        const amt = f.amt ?? 0.6;
        flash += t < f.t ? (f.pre ? tw(t, f.t - f.pre, f.t, ease.inExpo) * amt : 0) : pulse(t, f.t, f.decay ?? 9) * amt;
      }
    if (flash > 0.002) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(flash);
      ctx.fillStyle = flashGrad;
      ctx.fillRect(0, 0, bw, bh);
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(vignette, 0, 0);

    if (quality === "high") {
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.07;
      const g = grains[((frame % 4) + 4) % 4];
      const tile = (256 * Math.max(1, Math.round(k * 2))) / 2;
      const ox = -((frame * 97) % tile);
      const oy = -((frame * 151) % tile);
      for (let x = ox; x < bw; x += tile) for (let y = oy; y < bh; y += tile) ctx.drawImage(g, x, y, tile, tile);
    }

    const black = 1 - tw(t, 0, 0.35) + (extra.fadeOut ? tw(t, extra.fadeOut[0], extra.fadeOut[1]) : 0);
    if (black > 0) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = clamp(black);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, bw, bh);
    }
    ctx.restore();
  }

  return {
    canvas,
    ctx,
    render,
    resize,
    get quality() {
      return quality;
    },
    set quality(q) {
      quality = q;
    },
  };
}

/**
 * Discover every glyph a lesson draws (via a cheap 8×8 scratch canvas), then
 * ask the browser to load exactly those font subsets before playback.
 */
export async function preloadLessonFonts(lesson, fontUsage, step = 0.5) {
  const scratch = makeCanvas(8, 8).getContext("2d");
  for (let t = 0; t <= lesson.duration; t += step) {
    scratch.save();
    try {
      lesson.draw(scratch, t);
    } finally {
      scratch.restore();
    }
  }
  watermark(scratch, 1);
  burnCaptions(scratch, 0, []);
  for (const c of lesson.captions ?? []) burnCaptions(scratch, c.a + 0.5, [c]);
  const loads = [];
  for (const [font, chars] of fontUsage) loads.push(document.fonts.load(font, [...chars].join("")));
  await Promise.allSettled(loads);
}
