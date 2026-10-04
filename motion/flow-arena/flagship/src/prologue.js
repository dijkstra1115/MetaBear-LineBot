// Shared 3D world for the first eight bars: the price line, the crowd behind it, the stops and
// liquidations dropping out of the crowd, and the heat strata they pile into. One camera path runs
// across the open → fuel cut so the move is continuous.

import { bar } from "./cues.js";
import { BANDS, KY, RUN_END, crowd, py, runPrice } from "./world.js";
import { C, TAU, blob, camera, clamp, ease, heat, inv, lerp, mix, noise1, rgba, rnd, rr, smooth } from "./lib.js";

const IGNITE = bar(0.25);
const X0 = -2300;
const TARGET = BANDS.find((b) => b.target);

/** Head x of the price line at time t. */
export function headX(t) {
  if (t < IGNITE) return X0;
  if (t < bar(4)) return lerp(X0, 0, ease.out2(inv(IGNITE, bar(4), t)) * 0.35 + inv(IGNITE, bar(4), t) * 0.65);
  return lerp(0, RUN_END, ease.in3(inv(bar(4), bar(7.75), t)) * 0.85 + inv(bar(4), bar(7.75), t) * 0.15);
}

/** World y of the line at x: history, then the run that climbs to the target band. */
export function lineY(x) {
  return py(runPrice(x));
}

/** Camera path: macro close-up → wide side view → orbit → chase cam → hold before the drop. */
export function cam(t) {
  const xh = headX(t);
  const yh = lineY(xh);
  // Side view: pull back from a macro on the ignition to the full crowd.
  const pull = ease.inOut3(inv(bar(0.2), bar(3.6), t));
  const dist = lerp(240, 1650, pull);
  const nx = noise1(t * 0.3, 1) * 20;
  const ny = noise1(t * 0.25, 2) * 16;
  const nyaw = noise1(t * 0.2, 3) * 0.02;
  let x = xh - lerp(10, 520, pull) + nx;
  let y = lerp(yh, yh * 0.35 - 30, pull) + ny;
  let z = -dist;
  let yaw = nyaw;
  let pitch = 0;
  let roll = 0;
  let f = 1000;
  // Fuel: drift in, orbit to a three-quarter view, then close in on the brightest band.
  const drift = ease.inOut3(inv(bar(4), bar(5.5), t));
  if (t >= bar(4)) {
    const u = ease.inOut3(inv(bar(5.25), bar(6.9), t));
    const rush = ease.inOut3(inv(bar(6.6), bar(7.75), t));
    const d = lerp(lerp(lerp(1650, 1380, drift), 820, u), 360, rush);
    const ang = lerp(0, 0.8, u);
    const tx = lerp(xh - lerp(520, 400, drift), xh + 160, u);
    const ty = lerp(yh * 0.35 - 30, yh + 20, u);
    x = tx - Math.sin(ang) * d + nx * (1 - u);
    z = -Math.cos(ang) * d;
    y = ty + ny * (1 - u) - rush * 30;
    yaw = ang + nyaw * (1 - u);
    pitch = lerp(0, 0.05, u) + rush * 0.05;
    roll = lerp(0, -0.05, u);
    f = lerp(1000, 940, u) - rush * 60;
  }
  return { x, y, z, yaw, pitch, roll, f, xh, yh };
}

// Arrival time of each crowd member's stop / liquidation streak.
const STREAK = 0.55;
const stopStart = (d) => bar(4) + 0.1 + rnd(d.i, 41) * bar(0.9);
const liqStart = (d) => bar(5) + 0.05 + rnd(d.i, 42) * bar(0.95);
const arrivals = BANDS.map(() => []);
for (const d of crowd) {
  if (d.late) continue;
  if (d.hasStop) arrivals[BANDS.indexOf(d.short ? BANDS[0] : BANDS[4])].push(stopStart(d) + STREAK);
  arrivals[BANDS.indexOf(d.band)].push(liqStart(d) + STREAK);
}
arrivals.forEach((a) => a.sort((p, q) => p - q));
const count = (a, t) => {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m] <= t) lo = m + 1;
    else hi = m;
  }
  return lo;
};

/** Heat of each band at time t (0 before any streak lands, up to its heat once all have). */
export function bandHeat(i, t) {
  const b = BANDS[i];
  const k = count(arrivals[i], t) / Math.max(1, arrivals[i].length);
  const ignite = ease.out3(inv(bar(6), bar(6.4), t));
  const base = 0.07 * inv(bar(2.6), bar(3.9), t);
  return clamp(b.heat * (base + (1 - base) * smooth(k)) * lerp(0.78, 1.1, ignite), 0, 1.1);
}

/** Appearance of a crowd member: they enter once the price has passed their time. */
const appearK = (d, t) => clamp((headX(t) - d.x) / 160 - d.appear * 0.4);

export function drawWorld(ctx, t, { crowdAlpha = 1, streaks = true, lineAlpha = 1 } = {}) {
  const c = cam(t);
  const { project } = camera(c);
  const xh = c.xh;

  // Heat strata: a soft gradient body on the chart plane, light strands across depth, and a
  // white-hot core on the bands that carry the most fuel.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const xs = [];
  for (let x = X0 - 600; x <= RUN_END + 2600; x += 100) xs.push(x);
  BANDS.forEach((b, i) => {
    const hk = bandHeat(i, t);
    if (hk < 0.01) return;
    const yc = py(b.price);
    const hw = b.w * KY * 1.4;
    const col = heat(0.42 + 0.58 * hk);
    const breathe = 0.86 + 0.14 * Math.sin((t * TAU) / 1.6 + i * 0.7);
    // Body: stacked sub-strips with a gaussian profile; exact under any perspective.
    const ba = Math.min(0.9, 0.62 * hk * breathe);
    const STRIPS = 11;
    const edges = [];
    for (let k = 0; k <= STRIPS; k++) {
      const off = (k / STRIPS - 0.5) * 2 * hw * 2.1;
      edges.push(xs.map((x) => project(x, yc + off, 0)));
    }
    for (let k = 0; k < STRIPS; k++) {
      const mid = ((k + 0.5) / STRIPS - 0.5) * 2 * 2.1;
      const prof = Math.exp(-mid * mid * 1.1);
      const a = ba * prof;
      if (a < 0.01) continue;
      const up = edges[k];
      const dn = edges[k + 1];
      ctx.beginPath();
      let n = 0;
      for (let j = 0; j < xs.length; j++) if (up[j] && dn[j]) (n++ ? ctx.lineTo : ctx.moveTo).call(ctx, up[j][0], up[j][1]);
      for (let j = xs.length - 1; j >= 0; j--) if (up[j] && dn[j]) ctx.lineTo(dn[j][0], dn[j][1]);
      if (n < 2) continue;
      ctx.closePath();
      ctx.fillStyle = rgba(mix(col, C.white, prof * prof * 0.2 * hk), a);
      ctx.fill();
    }
    // Strands, fading out with distance so the far end dissolves instead of converging hard.
    const ny = 5;
    for (let zi = -1; zi <= 1; zi++) {
      const z = zi * 170;
      for (let yi = 0; yi < ny; yi++) {
        const off = (yi / (ny - 1) - 0.5) * 2 * hw;
        const prof = Math.exp(-((off / hw) ** 2) * 1.4);
        const a = Math.min(1, hk * prof * (zi === 0 ? 1.0 : 0.5) * breathe);
        if (a < 0.015) continue;
        const pts = [];
        for (const x of xs) {
          const p = project(x, yc + off + noise1(x / 260 + yi * 3.1, i * 7 + zi) * hw * 0.3, z);
          if (p) pts.push(p);
        }
        if (pts.length < 2) continue;
        ctx.beginPath();
        pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        const strandCol = mix(col, C.white, prof * 0.3 * hk);
        if (c.yaw > 0.3) {
          // Depth fog: brightest near the camera, gone by ~4000 units.
          let pn = pts[0];
          let pf = pts[pts.length - 1];
          for (const p of pts) {
            if (p[2] < pn[2]) pn = p;
            if (p[2] > pf[2]) pf = p;
          }
          const g = ctx.createLinearGradient(pn[0], pn[1], pf[0], pf[1]);
          g.addColorStop(0, rgba(strandCol, a));
          g.addColorStop(0.35, rgba(strandCol, a * 0.6));
          g.addColorStop(1, rgba(strandCol, 0));
          ctx.strokeStyle = g;
        } else {
          ctx.strokeStyle = rgba(strandCol, a);
        }
        ctx.lineWidth = 1.2 + prof * 1.3;
        ctx.stroke();
      }
    }
    // Hot core with travelling light on the strongest bands.
    if (hk > 0.55) {
      const ck = inv(0.55, 1, hk);
      ctx.beginPath();
      let started = false;
      for (const x of xs) {
        const p = project(x, yc, 0);
        if (!p) continue;
        if (started) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        started = true;
      }
      ctx.strokeStyle = rgba(mix(col, C.white, 0.6), 0.75 * ck * breathe);
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let k = 0; k < 3; k++) {
        const px = X0 + ((t * 900 + k * 1400 + i * 500) % 4600);
        const p = project(px, yc, 0);
        if (p) blob(ctx, p[0], p[1], 70 * p[3] + 20, mix(col, C.white, 0.4), 0.7 * ck, 1);
      }
    }
  });
  ctx.restore();

  // Embers lifting off the hot bands once the fuel ignites.
  const emberK = ease.out2(inv(bar(5.8), bar(6.4), t));
  if (emberK > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    BANDS.forEach((b, bi) => {
      const hk = bandHeat(bi, t);
      if (hk < 0.5) return;
      const n = Math.round(60 * hk);
      for (let k = 0; k < n; k++) {
        const id = bi * 1000 + k;
        const period = rr(id, 1, 2.5, 5);
        const ph = (t / period + rnd(id, 2)) % 1;
        const ex = c.xh + rr(id, 3, -1600, 1800);
        const ey = py(b.price) + (ph - 0.3) * 160 * (b.side === "short" ? 1 : -1);
        const ez = rr(id, 4, -260, 260);
        const p = project(ex, ey, ez);
        if (!p) continue;
        const a = Math.sin(ph * Math.PI) * hk * emberK * (0.6 + 0.4 * Math.sin(t * 9 + k));
        blob(ctx, p[0], p[1], Math.min(30, 9 * p[3] + 2), heat(0.75 + 0.25 * hk), a, 1);
      }
    });
    ctx.restore();
  }

  // Crowd: positions as motes, entering as the price passes them.
  if (crowdAlpha > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const d of crowd) {
      const k = appearK(d, t);
      if (k <= 0) continue;
      const bob = noise1(t * 0.35 + d.i * 0.13, 61) * 6;
      const p = project(d.x, d.y + bob, d.z);
      if (!p || p[0] < -40 || p[0] > 1960 || p[1] < -40 || p[1] > 1120) continue;
      const col = d.short ? mix(C.short, C.shortInk, 0.3) : mix(C.long, C.longInk, 0.3);
      const pop = k < 1 ? ease.outBack(k) : 1;
      const r = Math.min(26, d.size * p[3] * 7.5) * pop;
      const tw = 0.75 + 0.25 * Math.sin(t * rr(d.i, 63, 1.5, 4) + d.i);
      blob(ctx, p[0], p[1], r, col, 0.55 * crowdAlpha * Math.min(1, k * 1.5) * tw, 1);
    }
    ctx.restore();
  }

  // Stops and liquidations falling out of the crowd into the bands.
  if (streaks) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const d of crowd) {
      if (d.late) continue;
      for (const kind of ["stop", "liq"]) {
        if (kind === "stop" && !d.hasStop) continue;
        const s0 = kind === "stop" ? stopStart(d) : liqStart(d);
        const age = t - s0;
        if (age < 0 || age > STREAK + 0.5) continue;
        const target = kind === "stop" ? d.stop : d.liq;
        const k = clamp(age / STREAK);
        const head = lerp(d.y, target, ease.in2(k));
        const tail = lerp(d.y, target, ease.in2(clamp((age - 0.12) / STREAK)));
        const p1 = project(d.x, head, d.z);
        const p0 = project(d.x, tail, d.z);
        if (!p0 || !p1) continue;
        const col = kind === "stop" ? C.fuel : heat(0.55 + d.band.heat * 0.35);
        const a = age < STREAK ? 0.7 : 0.7 * (1 - (age - STREAK) / 0.5);
        ctx.strokeStyle = rgba(col, a * 0.8);
        ctx.lineWidth = Math.max(1, p1[3] * 2.2);
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.stroke();
        if (age >= STREAK && age < STREAK + 0.3) {
          blob(ctx, p1[0], p1[1], 14 * p1[3] + 6, col, (1 - (age - STREAK) / 0.3) * 0.9, 1);
        }
      }
    }
    ctx.restore();
  }

  // The price line and its head.
  if (t >= IGNITE && lineAlpha > 0.01) {
    const pts = [];
    const from = Math.max(X0, xh - 6000);
    for (let x = from; x <= xh; x += 10) {
      const p = project(x, lineY(x), 0);
      if (p) pts.push(p);
    }
    const hp = project(xh, lineY(xh), 0);
    if (hp) pts.push(hp);
    if (pts.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      // Fade the trail toward the past with three passes over shrinking tails.
      const passes = [
        [1, 0.16, 14],
        [0.45, 0.5, 5],
        [0.18, 0.95, 2.4],
      ];
      for (const [frac, a, wdt] of passes) {
        const start = Math.floor(pts.length * (1 - frac));
        ctx.beginPath();
        for (let k = start; k < pts.length; k++) (k === start ? ctx.moveTo : ctx.lineTo).call(ctx, pts[k][0], pts[k][1]);
        ctx.strokeStyle = rgba(mix(C.long, C.white, a > 0.9 ? 0.35 : 0), a * lineAlpha);
        ctx.lineWidth = wdt;
        ctx.stroke();
      }
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = rgba(C.long, 0.35 * lineAlpha);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
    if (hp) {
      const ig = ease.outExpo(inv(IGNITE, IGNITE + 0.35, t));
      const beatPulse = Math.exp(-((t - IGNITE) % (bar(1) / 2)) * 5);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      blob(ctx, hp[0], hp[1], 90 * ig + 30 * beatPulse, C.long, 0.5 * lineAlpha, 0);
      blob(ctx, hp[0], hp[1], 16 + 6 * beatPulse, C.white, lineAlpha, 1);
      // Ignition flare: a horizontal anamorphic streak.
      const fl = Math.exp(-(t - IGNITE) * 2.2);
      if (fl > 0.01) {
        const g = ctx.createLinearGradient(hp[0] - 700, 0, hp[0] + 700, 0);
        g.addColorStop(0, "rgba(45,226,166,0)");
        g.addColorStop(0.5, rgba(mix(C.long, C.white, 0.5), 0.7 * fl));
        g.addColorStop(1, "rgba(45,226,166,0)");
        ctx.fillStyle = g;
        ctx.fillRect(hp[0] - 700, hp[1] - 2.5, 1400, 5);
      }
      ctx.restore();
    }
  }
  return { cam: c, project };
}

export { TARGET, IGNITE };
