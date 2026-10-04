// Bars 28–32. The end card: on the final drop two light waves (mint price, amber fuel) sweep the
// frame and fold into the wordmark glyph; then the tagline, MetaBear and where to play.

import { bar } from "../cues.js";
import { glyph, wordmarkCanvas } from "../brand.js";
import { backdrop } from "./title.js";
import { C, F, blob, clamp, decay, ease, embers, inv, label, lerp, measure, mix, rgba, ring, roundRect, sparks, subline, text } from "../lib.js";

export const ZH = "讀懂訂單流推動市場模擬市場不涉及真實資金桌面版現已上線立即開戰";

const SIZE = 196;
let mark;
let medal;
export async function init() {
  mark = wordmarkCanvas(SIZE);
  const img = new Image();
  img.src = "/metabear-logo-white-bg-original.png";
  await img.decode();
  // The medallion is the gold ring and the bear inside it; crop it to a circle.
  medal = document.createElement("canvas");
  medal.width = medal.height = 600;
  const g = medal.getContext("2d");
  g.beginPath();
  g.arc(300, 300, 292, 0, Math.PI * 2);
  g.clip();
  g.drawImage(img, 630 - 300, 518 - 300, 600, 600, 0, 0, 600, 600);
}

// The two strokes of the glyph as full-frame waves: same shape language, phase-shifted.
function wave(ctx, k, t, { y0, amp, col, phase, width, alpha }) {
  if (alpha <= 0.01 || k <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.beginPath();
  const n = 120;
  for (let i = 0; i <= n * k; i++) {
    const x = -60 + (i / n) * 2040;
    const u = i / n;
    const y = y0 - Math.sin(u * Math.PI * 2.2 + phase + t * 0.8) * amp * (0.6 + 0.4 * Math.sin(u * 3 + phase));
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.strokeStyle = rgba(col, 0.22 * alpha);
  ctx.lineWidth = width * 5;
  ctx.stroke();
  ctx.strokeStyle = rgba(mix(col, C.white, 0.3), alpha);
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

export function draw(ctx, t, lt, look) {
  const t0 = bar(28);
  ctx.fillStyle = "#04070b";
  ctx.fillRect(0, 0, 1920, 1080);
  backdrop(ctx, t, ease.out3(clamp(lt / 1.2)) * 0.85, { horizon: 620 });
  embers(ctx, t, { n: 90, seed: 31, color: C.fuel, alpha: 0.7 });

  // Waves sweep across, then collapse toward the glyph.
  const sweep = ease.out3(inv(t0, t0 + 0.7, t));
  const fold = ease.inOut3(inv(t0 + 0.55, t0 + 1.2, t));
  const wa = (1 - fold) * clamp(lt / 0.05);
  wave(ctx, sweep, t, { y0: lerp(420, 400, fold), amp: lerp(150, 30, fold), col: C.long, phase: 0, width: 4, alpha: wa });
  wave(ctx, sweep, t, { y0: lerp(560, 440, fold), amp: lerp(110, 24, fold), col: C.fuel, phase: 0.9, width: 4, alpha: wa });

  // Wordmark.
  const gW = SIZE * 0.92;
  const gap = SIZE * 0.2;
  const total = gW + gap + mark.w * 0.86;
  const gx = 960 - total / 2;
  const mx = gx + gW + gap - mark.w * 0.07;
  const cy = 410;
  const ma = ease.out3(inv(t0 + 0.7, t0 + 1.2, t));
  const ms = 1.06 - 0.06 * ease.out4(inv(t0 + 0.7, t0 + 1.6, t)) + 0.02 * inv(t0 + 1.6, bar(32), t);
  ctx.save();
  ctx.translate(960, cy);
  ctx.scale(ms, ms);
  ctx.translate(-960, -cy);
  ctx.globalAlpha = ma;
  ctx.drawImage(mark.canvas, mx, cy - mark.h * 0.62);
  ctx.globalAlpha = 1;
  glyph(ctx, gx, cy - gW * 0.62, gW, { k: inv(t0 + 0.6, t0 + 1.3, t), width: 1.15, glowAmt: 0.45 });
  ctx.restore();

  // Tagline.
  const tp = t - bar(29);
  if (tp > 0) {
    const font = F.display(500, 46);
    const str = "READ THE FLOW.  MOVE THE MARKET.";
    const a = ease.out3(clamp(tp / 0.6));
    const track = lerp(30, 14, ease.out4(clamp(tp / 1.2)));
    const w = measure(ctx, str, font, track);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = font;
    ctx.letterSpacing = `${track}px`;
    ctx.fillStyle = rgba(C.ink);
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, 960 - w / 2, 575);
    ctx.letterSpacing = "0px";
    ctx.restore();
    subline(ctx, "讀懂訂單流，推動市場。", 960, 628, { size: 32, p: tp, out: 9, color: C.ink2, weight: 500, track: 14 });
  }

  // CTA row: MetaBear medallion, name, divider, URL button.
  const cp = t - bar(30);
  if (cp > 0) {
    const k = ease.outExpo(clamp(cp / 0.6));
    const a = clamp(cp / 0.25);
    const rowY = 770;
    const urlFont = F.mono(700, 28);
    const url = "metabear.io/arena";
    const uw = measure(ctx, url, urlFont, 1) + 120;
    const nameW = measure(ctx, "MetaBear", F.display(700, 40), 2);
    const rowW = 96 + 22 + nameW + 60 + uw;
    const x0 = 960 - rowW / 2;
    ctx.save();
    ctx.globalAlpha = a;
    // Medallion with a gold halo.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    blob(ctx, x0 + 48, rowY, 120, C.gold, 0.35 * a);
    ctx.restore();
    const ms2 = 0.8 + 0.2 * ease.outBack(clamp(cp / 0.5));
    ctx.drawImage(medal, x0 + 48 - 48 * ms2, rowY - 48 * ms2, 96 * ms2, 96 * ms2);
    text(ctx, "MetaBear", x0 + 96 + 22, rowY + 14, { font: F.display(700, 40), color: C.ink, track: 2 });
    const dvx = x0 + 96 + 22 + nameW + 30;
    ctx.fillStyle = rgba(C.line, 0.35);
    ctx.fillRect(dvx, rowY - 26, 1, 52);
    // URL button in the game's gold.
    const bx = dvx + 30;
    const bw = uw * k;
    roundRect(ctx, bx, rowY - 32, bw, 64, 14);
    const gg = ctx.createLinearGradient(0, rowY - 32, 0, rowY + 32);
    gg.addColorStop(0, rgba(C.gold));
    gg.addColorStop(1, rgba(C.fuel));
    ctx.fillStyle = gg;
    ctx.fill();
    if (k > 0.6) {
      text(ctx, "▶", bx + 30, rowY + 9, { font: F.mono(800, 22), color: [40, 22, 0], alpha: inv(0.6, 1, k) });
      text(ctx, url, bx + 66, rowY + 10, { font: urlFont, color: [40, 22, 0], alpha: inv(0.6, 1, k), track: 1 });
    }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    blob(ctx, bx + uw / 2, rowY, 260, C.gold, decay(t, bar(30), 3) * 0.6);
    ctx.restore();
    label(ctx, "NOW LIVE ON DESKTOP · 桌面版現已上線", 960, 862, { size: 16, color: C.ink2, alpha: a * ease.out3(clamp((cp - 0.3) / 0.4)), align: "center", track: 6 });
  }

  // Disclaimer.
  const da = ease.out3(inv(bar(29.5), bar(30), t));
  label(ctx, "模擬市場，不涉及真實資金  ·  SIMULATED MARKET. NO REAL FUNDS.", 960, 1018, { size: 14, color: C.ink3, alpha: da * 0.9, align: "center", track: 3 });

  // Impact.
  ring(ctx, t, t0, 960, cy, { r1: 1400, dur: 1, color: C.white, width: 4 });
  ring(ctx, t, t0 + 0.08, 960, cy, { r1: 1000, dur: 1.2, color: C.gold, width: 3, sy: 0.3 });
  sparks(ctx, t, t0, 960, cy, { n: 140, seed: 2801, speed: 2200, g: 400, k: 2, life: 1.5, color: C.gold, size: 2.4, trail: 0.03 });
  sparks(ctx, t, t0, 960, cy, { n: 60, seed: 2802, speed: 1700, g: 300, k: 2.4, life: 1.2, color: C.long, size: 2, trail: 0.03 });

  const fadeOut = ease.in2(inv(bar(31.6), bar(32), t));
  Object.assign(look, {
    flash: decay(t, t0, 6) * 1.0 + decay(t, bar(30), 6) * 0.12,
    flashColor: [1, 0.92, 0.8],
    bloom: 0.7 + decay(t, t0, 2.5) * 1.8,
    threshold: lerp(0.5, 0.8, inv(t0 + 0.2, t0 + 1.4, t)),
    ca: 0.0016 + decay(t, t0, 4) * 0.012,
    zoomBlur: decay(t, t0, 6) * 0.6,
    zoomCenter: [0.5, 1 - cy / 1080],
    glitch: decay(t, t0, 10) * 0.7,
    vignette: 0.6,
    grain: 0.04,
    exposure: 1 - fadeOut,
  });
}
