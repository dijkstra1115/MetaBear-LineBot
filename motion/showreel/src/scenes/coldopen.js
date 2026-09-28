import {
  C,
  F,
  W,
  H,
  clamp,
  ease,
  lerp,
  prog,
  tw,
  text,
  revealText,
  rgba,
  glow,
  neonPath,
  ring,
  noise1,
  candle,
  pulse,
  rnd,
} from "../core.js";
import { priceGrid } from "../common.js";

// One synthetic minute of trades: drift, a sharp spike, a fast return.
const N = 220;
const T0 = 0.5;
const T1 = 3.7;
const X0 = 330;
const X1 = 1590;
const pts = Array.from({ length: N + 1 }, (_, i) => {
  const u = i / N;
  const drift = noise1(u * 9, 4) * 26 + noise1(u * 31, 7) * 9;
  const spike =
    -330 * Math.exp(-(((u - 0.63) / 0.07) ** 2)) -
    120 * Math.exp(-(((u - 0.7) / 0.03) ** 2));
  const y = 590 + drift + spike + (rnd(11, i) - 0.5) * 10;
  return [lerp(X0, X1, u), y];
});
const yOpen = pts[0][1];
const yClose = pts[N][1] - 18;
const yHigh = Math.min(...pts.map((p) => p[1]));
const yLow = Math.max(...pts.map((p) => p[1]));
const priceAt = (y) => Math.round(100 + (590 - y) / 9.5);

const TICKS = Array.from({ length: 26 }, (_, k) => T0 + k * 0.125);

export const cues = [
  ...TICKS.map((t, k) => ({
    t,
    kind: "tick",
    vel: 0.35 + 0.4 * (k % 4 === 0),
  })),
  { t: 3.7, kind: "whoosh", dur: 0.9 },
  { t: 4.55, kind: "thud" },
  { t: 4.0, kind: "riser", dur: 2.0 },
];

export function draw(ctx, t) {
  const head = clamp((t - T0) / (T1 - T0)) * N;
  const morph = tw(t, 3.75, 4.55, ease.inOutExpo);
  const zoomOut = tw(t, 5.3, 6.0, ease.inExpo);
  const cx = 960;

  ctx.save();
  const s = lerp(1.0, 1.08, tw(t, 0, 3.7, ease.inOutQuad)) * (1 + zoomOut * 5);
  ctx.translate(W / 2, H / 2);
  ctx.scale(s, s);
  const focusY = lerp(540, (yOpen + yClose) / 2 - 40, morph);
  ctx.translate(-W / 2, -focusY);

  priceGrid(ctx, t, {
    alpha: tw(t, 0.1, 1.2) * (1 - morph * 0.6),
    ox: -t * 30,
  });

  // The price trail, collapsing horizontally into a single wick.
  const n = Math.floor(head);
  const trail = [];
  for (let i = 0; i <= n; i++) {
    const [x, y] = pts[i];
    trail.push([lerp(x, cx, morph), y]);
  }
  if (n < N && head > 0) {
    const f = head - n;
    const a = pts[n];
    const b = pts[n + 1];
    trail.push([lerp(lerp(a[0], b[0], f), cx, morph), lerp(a[1], b[1], f)]);
  }
  const trailAlpha = 1 - tw(t, 4.4, 4.9);
  neonPath(ctx, trail, C.teal, lerp(2.5, 4, morph), trailAlpha, 1.2);

  // Tick markers and floating prints while the trail is live.
  if (morph < 0.02) {
    TICKS.forEach((tt, k) => {
      if (t < tt) return;
      const i = Math.min(N, Math.floor(((tt - T0) / (T1 - T0)) * N));
      const [x, y] = pts[i];
      ring(ctx, x, y, t, tt, {
        r1: 36,
        dur: 0.5,
        color: k % 4 ? C.teal : C.gold,
        w: 2,
      });
      const age = t - tt;
      if (age < 1.2) {
        text(ctx, String(priceAt(y)), x + 10, y - 16 - age * 60, {
          family: F.mono,
          size: 18,
          weight: 500,
          color: k % 4 ? C.muted : C.gold,
          alpha: (1 - age / 1.2) * 0.85,
        });
      }
    });
    if (head > 0 && head < N) {
      const last = trail[trail.length - 1];
      glow(ctx, last[0], last[1], 70, C.teal, 0.9);
      glow(ctx, last[0], last[1], 16, C.white, 1);
    }
  }

  // Candle condenses out of the collapsed trail.
  const body = tw(t, 4.3, 4.9, (x) => ease.outBack(x, 2.2));
  if (body > 0) {
    const bw = 92 * body;
    candle(ctx, cx, bw, yOpen, yHigh, yLow, yClose, {
      alpha: clamp(body * 1.5),
      wickWidth: 4,
      glow: 30,
      wickGlow: 0.6 * body,
      wickGlowColor: C.teal,
    });
    glow(ctx, cx, (yOpen + yClose) / 2, 200, C.teal, pulse(t, 4.55, 4) * 0.8);
    ring(ctx, cx, (yOpen + yClose) / 2, t, 4.55, {
      r1: 420,
      dur: 1.1,
      w: 3,
      color: C.teal,
    });
  }
  ctx.restore();

  // Clock readout during the minute.
  const clockA = tw(t, 0.4, 0.9) * (1 - tw(t, 3.8, 4.2));
  const secs = clamp((t - T0) / (T1 - T0)) * 60;
  text(
    ctx,
    `14:30:${String(Math.floor(Math.min(secs, 59.999))).padStart(2, "0")}.${String(Math.floor((secs % 1) * 1000)).padStart(3, "0")}`,
    140,
    110,
    {
      family: F.mono,
      size: 26,
      weight: 500,
      color: C.muted,
      alpha: clockA,
      ls: 2,
    },
  );
  text(ctx, "一分鐘的成交", 140, 150, {
    family: F.tc,
    size: 22,
    weight: 400,
    color: C.dim,
    alpha: clockA,
  });

  // Lines under the candle.
  const out = tw(t, 5.3, 5.7);
  revealText(
    ctx,
    "一分鐘，幾百筆成交。",
    cx,
    900,
    {
      family: F.tc,
      size: 46,
      weight: 700,
      color: C.text,
      align: "center",
      stagger: 0.03,
      rise: 24,
      blur: 8,
    },
    t - 4.6,
    out,
  );
  revealText(
    ctx,
    "最後，只留下一根 K 線。",
    cx,
    962,
    {
      family: F.tc,
      size: 34,
      weight: 400,
      color: C.muted,
      align: "center",
      stagger: 0.03,
      rise: 18,
    },
    t - 4.95,
    out,
  );
}
