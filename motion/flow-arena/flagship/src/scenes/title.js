// Bars 8–10. The drop: white-out, shockwave, the letterbox snaps open and FLOW ARENA cuts in as
// sliding slices. A gleam crosses it on the half-bar; then the camera dives through the "O".

import { bar } from "../cues.js";
import { glyph, wordmarkCanvas } from "../brand.js";
import { C, blob, clamp, decay, ease, embers, heat, inv, label, lerp, noise1, rgba, ring, rr, sparks, subline } from "../lib.js";

export const ZH = "永續合約訂單流沙盤・";
export const tail = 0;

const SIZE = 236;
let mark;
let gleam;
export function init() {
  mark = wordmarkCanvas(SIZE);
  gleam = document.createElement("canvas");
  gleam.width = mark.w;
  gleam.height = mark.h;
}

const GLYPH = SIZE * 0.9;
const GAP = SIZE * 0.2;

export function backdrop(ctx, t, alpha = 1, { horizon = 600 } = {}) {
  // Horizon glow.
  const hg = ctx.createRadialGradient(960, horizon, 0, 960, horizon, 1100);
  hg.addColorStop(0, `rgba(255,140,60,${0.16 * alpha})`);
  hg.addColorStop(0.35, `rgba(150,40,140,${0.08 * alpha})`);
  hg.addColorStop(1, "rgba(4,7,11,0)");
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Perspective floor grid rolling toward the viewer.
  ctx.strokeStyle = `rgba(140,178,214,${0.07 * alpha})`;
  ctx.lineWidth = 1;
  const vy = horizon + 40;
  for (let i = -24; i <= 24; i++) {
    ctx.beginPath();
    ctx.moveTo(960 + i * 18, vy);
    ctx.lineTo(960 + i * 260, 1080);
    ctx.stroke();
  }
  for (let k = 0; k < 14; k++) {
    const z = ((k + (t * 0.9) % 1) / 14) ** 2.2;
    const y = vy + z * (1080 - vy);
    ctx.globalAlpha = Math.min(1, z * 3) * alpha;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1920, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Anamorphic heat streaks: the liquidation bands, out of focus behind the title.
  for (let i = 0; i < 16; i++) {
    const y = 170 + rr(i, 1, 0, 1) * 720;
    const col = heat(rr(i, 2, 0.35, 0.95));
    const a = rr(i, 3, 0.12, 0.4) * alpha * (0.75 + 0.25 * noise1(t * 0.7 + i, 5));
    const len = rr(i, 4, 700, 1900);
    const x = ((rr(i, 5, 0, 2400) + t * rr(i, 6, -60, 60)) % 2400) - 300;
    const g = ctx.createLinearGradient(x - len / 2, 0, x + len / 2, 0);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.5, rgba(col, a));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    const th = rr(i, 7, 2, 26);
    ctx.fillRect(x - len / 2, y - th / 2, len, th);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x - len / 2, y - 0.75, len, 1.5);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function draw(ctx, t, lt, look) {
  const t0 = bar(8);
  const out0 = bar(9.5);
  const exit = ease.in3(inv(out0, bar(10), t));
  backdrop(ctx, t, ease.out3(inv(t0, t0 + 0.6, t)));
  embers(ctx, t, { n: 70, seed: 11, color: C.fuel, alpha: 0.8 });

  // Layout: glyph + wordmark, centred.
  const total = GLYPH + GAP + mark.w * 0.86;
  const gx = 960 - total / 2;
  const mx = gx + GLYPH + GAP - mark.w * 0.07;
  const my = 470 - mark.h * 0.62;
  // Settle push-in, then the dive through the O.
  const push = 1 + 0.035 * ease.out2(inv(t0 + 0.4, out0, t));
  const ox = mx + mark.o[0];
  const oy = my + mark.o[1];
  const dive = Math.exp(Math.log(46) * exit);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(push * dive, push * dive);
  ctx.translate(-ox, -oy);

  // Slices slam in from alternating sides.
  const SL = 18;
  const sh = mark.h / SL;
  for (let i = 0; i < SL; i++) {
    const k = ease.outExpo(clamp((lt - 0.02 - Math.abs(i - SL / 2) * 0.012) / 0.55));
    const dir = i % 2 ? 1 : -1;
    const dx = (1 - k) * dir * (700 + (i % 3) * 260);
    const a = clamp(k * 3);
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.drawImage(mark.canvas, 0, i * sh, mark.w, sh + 0.5, mx + dx, my + i * sh, mark.w, sh + 0.5);
  }
  ctx.globalAlpha = 1;

  // Gleam: a diagonal band of light across the letters on the half-bar.
  const gk = inv(bar(8.5), bar(8.5) + 0.7, t);
  if (gk > 0 && gk < 1) {
    const g = gleam.getContext("2d");
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, gleam.width, gleam.height);
    g.drawImage(mark.canvas, 0, 0);
    g.globalCompositeOperation = "source-in";
    const cx = lerp(-300, mark.w + 300, ease.inOut3(gk));
    const lg = g.createLinearGradient(cx - 160, 0, cx + 160, mark.h * 0.4);
    lg.addColorStop(0, "rgba(255,255,255,0)");
    lg.addColorStop(0.5, "rgba(255,255,255,0.95)");
    lg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = lg;
    g.fillRect(0, 0, gleam.width, gleam.height);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(gleam, mx, my);
    ctx.restore();
  }

  glyph(ctx, gx, 470 - GLYPH * 0.62, GLYPH, { k: inv(t0 + 0.08, t0 + 0.9, t), width: 1.15, glowAmt: 0.45 });
  ctx.restore();

  // Subtitle.
  const sp = t - bar(8.5);
  const sa = (1 - exit * 3) * ease.out3(clamp(sp / 0.5));
  if (sp > 0 && sa > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(sa);
    const lw = label(ctx, "BTC PERPETUAL  ·  ORDER-FLOW SANDBOX", 960, 640 + (1 - ease.out3(clamp(sp / 0.5))) * 16, { size: 22, color: C.ink2, align: "center", track: 9 });
    ctx.restore();
    const half = lw / 2 + 40;
    subline(ctx, "永續合約 ・ 訂單流沙盤", 960, 690, { size: 30, p: sp, out: 9, track: 10, color: C.ink, weight: 500 });
    // Hairline rules either side of the subtitle.
    const rw = 220 * ease.outExpo(clamp(sp / 0.7));
    ctx.fillStyle = rgba(C.line, 0.4 * clamp(sa));
    ctx.fillRect(960 - half - rw, 632, rw, 1);
    ctx.fillRect(960 + half, 632, rw, 1);
  }

  // Impact: shockwaves and a two-colour spark burst.
  ring(ctx, t, t0, 960, 470, { r1: 1300, dur: 0.9, color: C.white, width: 4 });
  ring(ctx, t, t0 + 0.06, 960, 470, { r1: 900, dur: 1.1, color: C.fuel, width: 3, sy: 0.35 });
  sparks(ctx, t, t0, 960, 470, { n: 150, seed: 801, speed: 2300, g: 500, k: 2.2, life: 1.3, color: C.gold, size: 2.4, trail: 0.03 });
  sparks(ctx, t, t0, 960, 470, { n: 70, seed: 802, speed: 1800, g: 300, k: 2.6, life: 1.1, color: C.long, size: 2, trail: 0.03 });
  const fl = decay(t, t0, 5.5);
  if (fl > 0.01) {
    // Anamorphic flare across the frame.
    const g = ctx.createLinearGradient(0, 0, 1920, 0);
    g.addColorStop(0, "rgba(108,182,255,0)");
    g.addColorStop(0.5, `rgba(220,240,255,${0.9 * fl})`);
    g.addColorStop(1, "rgba(108,182,255,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(0, 466, 1920, 8);
    blob(ctx, 960, 470, 520 * fl + 80, C.gold, fl);
    ctx.restore();
  }

  Object.assign(look, {
    letterbox: 1 - ease.out4(inv(t0, t0 + 0.5, t)),
    flash: decay(t, t0, 7) * 1.1 + exit ** 3 * 0.2,
    flashColor: [1, 0.93, 0.82],
    bloom: 0.75 + decay(t, t0, 3) * 2.2,
    threshold: lerp(0.5, 0.8, inv(t0 + 0.2, t0 + 1.2, t)),
    ca: 0.0016 + decay(t, t0, 4) * 0.012 + exit * 0.01,
    zoomBlur: exit * 1.2 + decay(t, t0, 6) * 0.6,
    zoomCenter: [ox / 1920, 1 - oy / 1080],
    vignette: 0.6,
    grain: 0.04,
    glitch: decay(t, t0, 10) * 0.9,
  });
}
