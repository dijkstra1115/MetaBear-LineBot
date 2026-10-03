// The FLOW ARENA wordmark as the game draws it: two wave strokes (mint price, amber fuel), "FLOW"
// in white and "ARENA" in a fuel→gold gradient, Barlow Condensed 700 at 0.06em tracking.

import { C, F, clamp, ease, measure, rgba } from "./lib.js";

const GLYPH = [
  { d: "M3 15c3-1 4.5-6 7.5-6s3 5 6 5S20 9 21 8", color: C.long },
  { d: "M3 20c3-1 4.5-4 7.5-4s3 3 6 3 3.5-2 4.5-3", color: C.fuel },
];
const GLYPH_LEN = 24; // approximate path length in the 24-unit viewBox

/** Draws the two-wave glyph in a box of `size` px at (x, y) (top-left). k = stroke progress 0..1. */
export function glyph(ctx, x, y, size, { k = 1, alpha = 1, width = 2.2, glowAmt = 1 } = {}) {
  if (alpha <= 0.002) return;
  const s = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  GLYPH.forEach((g, i) => {
    const kk = ease.inOut3(clamp(k * 1.25 - i * 0.25));
    if (kk <= 0) return;
    const path = new Path2D(g.d);
    ctx.setLineDash([GLYPH_LEN * kk, GLYPH_LEN]);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(g.color, 0.28 * alpha * glowAmt);
    ctx.lineWidth = width * 3.2;
    ctx.stroke(path);
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = rgba(g.color, alpha);
    ctx.lineWidth = width;
    ctx.stroke(path);
  });
  ctx.restore();
}

/**
 * Renders the full wordmark into an offscreen canvas sized to fit, returning it with the glyph and
 * the "O" positions so callers can animate slices, gleams and zooms on it.
 */
export function wordmarkCanvas(size) {
  const font = F.display(700, size);
  const track = size * 0.06;
  const scratch = document.createElement("canvas").getContext("2d");
  const wFlow = measure(scratch, "FLOW", font, track);
  const wArena = measure(scratch, "ARENA", font, track);
  const gap = size * 0.22;
  const pad = size * 0.3;
  const w = Math.ceil(wFlow + gap + wArena + pad * 2);
  const h = Math.ceil(size * 1.3);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  const base = h * 0.84;
  g.font = font;
  g.letterSpacing = `${track}px`;
  g.textBaseline = "alphabetic";
  g.fillStyle = "#f4f8fc";
  g.fillText("FLOW", pad, base);
  const ax = pad + wFlow + gap;
  const grad = g.createLinearGradient(ax, 0, ax + wArena, 0);
  grad.addColorStop(0, rgba(C.fuel));
  grad.addColorStop(1, rgba(C.gold));
  g.fillStyle = grad;
  g.fillText("ARENA", ax, base);
  // Centre of the "O" in FLOW, for push-in transitions.
  const wFl = measure(scratch, "FL", font, track) + track;
  const wO = measure(scratch, "O", font, 0);
  return { canvas, w, h, o: [pad + wFl + wO / 2, base - size * 0.36], base };
}
