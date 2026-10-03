// Bars 4–8. Stops, then liquidations, fall out of the crowd and pile into the heat strata. The
// camera orbits behind the price and chases it at the brightest band; one beat of held breath
// before the drop.

import { bar } from "../cues.js";
import { drawWorld, TARGET } from "../prologue.js";
import { py } from "../world.js";
import { C, F, blob, clamp, ease, fmt, headline, inv, label, lerp, rgba, subline, text } from "../lib.js";

export const ZH = "他們的停損強平價你的燃料空單。";

// Time inside the world: one beat of near-stillness before the impact.
const HOLD = bar(7.75);
const worldTime = (t) => (t < HOLD ? t : HOLD + (t - HOLD) * 0.1);

export function draw(ctx, t, lt, look) {
  const tw = worldTime(t);
  const { project, cam: c } = drawWorld(ctx, tw, { streaks: true });

  // Statements.
  const y = 836;
  const beats = [
    { at: 4, out: 4.92, words: ["THEIR", "STOPS."], zh: "他們的停損。" },
    { at: 5, out: 5.92, words: ["THEIR", "LIQUIDATIONS."], zh: "他們的強平價。" },
  ];
  for (const b of beats) {
    const a = bar(b.at);
    const o = bar(b.out);
    if (t < a || t > o + 0.5) continue;
    headline(ctx, b.words, 960, y, { size: 84, p: t - a, out: o - t, track: 4, accent: 1, accentColor: b.at === 4 ? C.fuel : C.short });
    subline(ctx, b.zh, 960, y + 54, { size: 28, p: t - a, out: o - t });
  }

  // "YOUR FUEL." slams in the centre and burns off as the camera starts its run.
  const fa = bar(6);
  const fo = bar(7.2);
  if (t > fa && t < fo + 0.6) {
    const p = t - fa;
    const scale = 1 + 0.06 * (1 - ease.outExpo(clamp(p / 0.5))) + 0.04 * ease.in2(clamp((t - fo + 0.6) / 1.2));
    ctx.save();
    ctx.translate(960, 560);
    ctx.scale(scale, scale);
    // Dark halo so the type reads over the strata.
    const halo = ctx.createRadialGradient(0, -40, 0, 0, -40, 620);
    halo.addColorStop(0, `rgba(4,7,11,${0.55 * clamp(p * 3) * (1 - inv(fo, fo + 0.5, t))})`);
    halo.addColorStop(1, "rgba(4,7,11,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-900, -500, 1800, 900);
    headline(ctx, ["YOUR", "FUEL."], 0, 0, { size: 210, p, out: fo - t, track: 8, accent: 1, accentColor: C.fuel, stagger: 0.09 });
    subline(ctx, "你的燃料。", 0, 78, { size: 40, p, out: fo - t, track: 16, color: C.ink, weight: 700 });
    ctx.restore();
  }

  // Target reticle on the white-hot band once the chase begins.
  const ra = ease.out3(inv(bar(6.9), bar(7.2), t)) * (1 - inv(bar(7.95), bar(8), t));
  if (ra > 0.01) {
    const xt = c.xh + lerp(1400, 700, ease.inOut3(inv(bar(6.9), bar(7.75), tw)));
    const p = project(xt, py(TARGET.price), 0);
    if (p) {
      const s = 46 + 10 * Math.sin(t * 14);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      blob(ctx, p[0], p[1], 120, C.gold, 0.35 * ra);
      ctx.strokeStyle = rgba(C.gold, 0.95 * ra);
      ctx.lineWidth = 2.5;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(p[0] + sx * s, p[1] + sy * (s - 16));
        ctx.lineTo(p[0] + sx * s, p[1] + sy * s);
        ctx.lineTo(p[0] + sx * (s - 16), p[1] + sy * s);
        ctx.stroke();
      }
      ctx.restore();
      label(ctx, "TARGET · 空單燃料", p[0] + s + 18, p[1] - 12, { size: 14, color: C.gold, alpha: ra, track: 4 });
      text(ctx, `${fmt(TARGET.price)}  ·  2,140 BTC`, p[0] + s + 18, p[1] + 18, { font: F.mono(600, 22), color: C.ink, alpha: ra });
    }
  }

  // Speed: zoom blur builds through the run, collapses on the held beat.
  const run = ease.in2(inv(bar(6.8), bar(7.75), t));
  const hold = inv(HOLD, HOLD + 0.08, t);
  Object.assign(look, {
    letterbox: 1,
    bloom: lerp(1.2, 1.9, inv(bar(5), bar(7.75), t)),
    threshold: lerp(0.5, 0.42, inv(bar(6), bar(7.5), t)),
    vignette: 0.75,
    grain: 0.045,
    zoomBlur: run * 0.85 * (1 - hold) + hold * 0.05,
    zoomCenter: [0.5, 0.42],
    ca: 0.0018 + run * 0.006 * (1 - hold),
    flash: Math.exp(-Math.max(0, t - bar(6)) * 7) * (t > bar(6) ? 0.18 : 0),
    flashColor: [1, 0.72, 0.35],
  });
}
