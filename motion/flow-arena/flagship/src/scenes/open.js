// Bars 0–4. Black → a single mint point ignites → the price line draws and the crowd materialises
// behind it as the camera pulls back from a macro. Eight strategy cohorts get tagged in passing.

import { bar } from "../cues.js";
import { drawWorld, lineY, IGNITE } from "../prologue.js";
import { COHORTS, crowd, P0, KY } from "../world.js";
import { C, F, blob, clamp, ease, env, fmt, glass, headline, inv, label, measure, rgba, subline, text, typeOn } from "../lib.js";

export const ZH = "每個市場都是一群人每一筆部位有它的強平價突破動能支撐壓力均線均值回歸情緒追價雜訊散戶長線承接策略族群，。";
export const tail = 0;

// One anchor per cohort, spread across the visible history.
const anchors = COHORTS.map((c, k) => {
  const lo = -2050 + k * 255;
  const pick = crowd
    .filter((d) => d.cohort === k && d.x > lo && d.x < lo + 255 && Math.abs(d.z) < 120)
    .sort((a, b) => Math.abs(a.z) - Math.abs(b.z))[0];
  return { ...c, d: pick ?? crowd[k] };
});

export function draw(ctx, t, lt, look) {
  const { project, cam: c } = drawWorld(ctx, t, { streaks: false });

  // Ticker over the head: the live price in the macro shot.
  if (t > IGNITE + 0.15) {
    const hp = project(c.xh, lineY(c.xh), 0);
    if (hp) {
      const a = ease.out3(inv(IGNITE + 0.15, IGNITE + 0.6, t)) * (1 - inv(bar(1.3), bar(1.7), t));
      const price = P0 + lineY(c.xh) / KY;
      const s = clamp(hp[3] * 2.2, 0.55, 1.6);
      ctx.save();
      ctx.translate(hp[0] + 26 * s, hp[1] - 34 * s);
      ctx.scale(s, s);
      label(ctx, "BTC-PERP", 0, -26, { size: 12, color: C.longInk, alpha: a * 0.8, track: 3 });
      text(ctx, typeOn(fmt(price, 1), t - IGNITE, 0.45, 3), 0, 0, { font: F.mono(600, 26), color: C.ink, alpha: a });
      ctx.restore();
    }
  }

  // Cohort tags: a leader line from a member of each cohort to a small glass tag.
  const tagIn = bar(1.5);
  anchors.forEach((an, k) => {
    const t0 = tagIn + k * bar(0.125);
    const a = ease.out3(inv(t0, t0 + 0.35, t)) * (1 - inv(bar(3.1), bar(3.6), t));
    if (a <= 0.01) return;
    const d = an.d;
    const p = project(d.x, d.y, d.z);
    if (!p || p[0] < 60 || p[0] > 1600 || p[1] < 220 || p[1] > 760) return;
    const up = k % 2 === 0 ? -1 : 1;
    const len = 70 + (k % 3) * 22;
    const ex = p[0] + 28;
    const ey = p[1] + up * len;
    const grow = ease.outExpo(inv(t0, t0 + 0.3, t));
    ctx.save();
    ctx.strokeStyle = rgba(C.line, 0.55 * a);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(p[0] + (ex - p[0]) * grow, p[1] + (ey - p[1]) * grow);
    ctx.stroke();
    blob(ctx, p[0], p[1], 16, d.short ? C.short : C.long, a, 1);
    ctx.strokeStyle = rgba(C.ink, 0.8 * a);
    ctx.beginPath();
    ctx.arc(p[0], p[1], 7, 0, Math.PI * 2);
    ctx.stroke();
    const wEn = measure(ctx, an.en, F.mono(600, 12), 2);
    const wZh = measure(ctx, an.zh, F.zh(600, 17), 2);
    const w = Math.max(wEn, wZh) + 28;
    const h = 52;
    const ty = up < 0 ? ey - h : ey;
    glass(ctx, ex, ty, w * grow, h, { r: 9, alpha: a, fill: 0.7 });
    if (grow > 0.6) {
      const ta = a * inv(0.6, 1, grow);
      label(ctx, `0${k + 1} ${an.en}`, ex + 14, ty + 20, { size: 11, color: C.ink3, alpha: ta, track: 2 });
      text(ctx, an.zh, ex + 14, ty + 42, { font: F.zh(600, 17), color: C.ink, alpha: ta, track: 2 });
    }
    ctx.restore();
  });
  const head = env(t, tagIn - 0.1, bar(3.6), 0.4, 0.4);
  if (head > 0.01) {
    label(ctx, "8 STRATEGY COHORTS · 八個策略族群", 120, 190, { size: 14, color: C.ink2, alpha: head, track: 5 });
  }

  // Headlines (lower third, inside the 2.39:1 frame).
  const y = 836;
  const l1 = bar(0.75);
  const o1 = bar(2.25);
  if (t > l1 && t < o1 + 0.5) {
    headline(ctx, ["EVERY", "MARKET", "IS", "A", "CROWD."], 960, y, { size: 78, p: t - l1, out: o1 - t, track: 3 });
    subline(ctx, "每個市場，都是一群人。", 960, y + 52, { size: 28, p: t - l1, out: o1 - t });
  }
  const l2 = bar(2.5);
  const o2 = bar(3.92);
  if (t > l2 && t < o2 + 0.5) {
    headline(ctx, ["EVERY", "POSITION", "HAS", "A", "BREAKING", "POINT."], 960, y, { size: 78, p: t - l2, out: o2 - t, track: 3, accent: 4, accentColor: C.fuel });
    subline(ctx, "每一筆部位，都有它的強平價。", 960, y + 52, { size: 28, p: t - l2, out: o2 - t });
  }

  // Look: letterboxed, dark and soft; the ignition blooms hard.
  const ig = Math.exp(-Math.max(0, t - IGNITE) * 3) * (t > IGNITE ? 1 : 0);
  Object.assign(look, {
    letterbox: 1,
    bloom: 1.15 + ig * 1.5,
    threshold: 0.5,
    vignette: 0.75,
    grain: 0.045,
    ca: 0.0018 + ig * 0.004,
    flash: ig * 0.12,
    flashColor: [0.6, 1, 0.85],
  });
}
