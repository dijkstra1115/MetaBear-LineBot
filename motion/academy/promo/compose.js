// Frame compositor for the promo at any aspect (1920×1080 or 1080×1920):
// backdrop, scene, bloom, cut flashes, vignette, film grain, fades.
// Output depends only on (t, frame).
import { C, clamp, ease, tw, pulse } from "../../../public/orderflow/motion/core.js";

const mk = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

export function createPromoCompositor(canvas, w, h) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  const small = mk(Math.round(w / 4), Math.round(h / 4));
  const sctx = small.getContext("2d");
  const bloom = mk(small.width, small.height);
  const bctx = bloom.getContext("2d");
  const vignette = mk(w, h);
  const m = Math.max(w, h);
  {
    const g = vignette.getContext("2d");
    const r = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, m * 0.72);
    r.addColorStop(0, "rgba(0,0,0,0)");
    r.addColorStop(1, "rgba(0,0,0,0.72)");
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  }
  const backdrop = mk(w, h);
  {
    const g = backdrop.getContext("2d");
    g.fillStyle = C.bg;
    g.fillRect(0, 0, w, h);
    const a = g.createRadialGradient(w * 0.75, h * 0.18, 0, w * 0.75, h * 0.18, m * 0.7);
    a.addColorStop(0, "rgba(40,90,110,0.22)");
    a.addColorStop(1, "rgba(40,90,110,0)");
    g.fillStyle = a;
    g.fillRect(0, 0, w, h);
    const b = g.createRadialGradient(w * 0.15, h * 0.92, 0, w * 0.15, h * 0.92, m * 0.6);
    b.addColorStop(0, "rgba(232,189,125,0.08)");
    b.addColorStop(1, "rgba(232,189,125,0)");
    g.fillStyle = b;
    g.fillRect(0, 0, w, h);
  }
  const flashGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, m * 0.62);
  flashGrad.addColorStop(0, "rgba(235,255,250,1)");
  flashGrad.addColorStop(0.25, "rgba(150,235,225,0.55)");
  flashGrad.addColorStop(1, "rgba(120,225,213,0)");
  const grains = Array.from({ length: 4 }, (_, n) => {
    const c = mk(256, 256);
    const g = c.getContext("2d");
    const img = g.createImageData(256, 256);
    let s = 7654321 + n * 99991;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const v = (s >>> 24) & 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  });

  function render(film, t, frame = Math.round(t * 60)) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.drawImage(backdrop, 0, 0);
    ctx.save();
    film.draw(ctx, t);
    ctx.restore();

    sctx.filter = "contrast(2.4) brightness(0.9)";
    sctx.drawImage(canvas, 0, 0, small.width, small.height);
    bctx.clearRect(0, 0, bloom.width, bloom.height);
    bctx.filter = `blur(${Math.max(2, 7 * (small.width / 480))}px)`;
    bctx.drawImage(small, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(bloom, 0, 0, w, h);

    let flash = 0;
    for (const f of film.flashes ?? []) {
      const amt = f.amt ?? 0.6;
      flash += t < f.t ? (f.pre ? tw(t, f.t - f.pre, f.t, ease.inExpo) * amt : 0) : pulse(t, f.t, f.decay ?? 9) * amt;
    }
    if (flash > 0.002) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(flash);
      ctx.fillStyle = flashGrad;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(vignette, 0, 0);

    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.07;
    const g = grains[((frame % 4) + 4) % 4];
    const ox = -((frame * 97) % 256);
    const oy = -((frame * 151) % 256);
    for (let x = ox; x < w; x += 256) for (let y = oy; y < h; y += 256) ctx.drawImage(g, x, y);

    const black = 1 - tw(t, 0, 0.3) + tw(t, film.duration - 0.8, film.duration - 0.05);
    if (black > 0) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = clamp(black);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }
  return { render, canvas };
}
