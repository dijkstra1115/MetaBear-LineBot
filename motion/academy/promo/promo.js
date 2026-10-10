// MetaBear Academy — promo film. One timeline, two aspect ratios (16:9 and
// 9:16). Real lesson footage is rendered live from the lessons' own
// draw(ctx, t) and composited as screens, so every frame is a pure function
// of time. 120 BPM: every cut and slam lands on a beat.
import {
  C,
  F,
  clamp,
  ease,
  lerp,
  prog,
  tw,
  text,
  measure,
  revealText,
  glow,
  line,
  ring,
  burst,
  candle,
  rrect,
  rgba,
  shake,
  spring,
  pulse,
  rnd,
  rrange,
  noise1,
  drawMark,
  neonPath,
} from "../../../public/orderflow/motion/core.js";
import { createCompositor } from "../../../public/orderflow/motion/compositor.js";
import { POSTER_T } from "../../../public/orderflow/motion/preview.js";

export const DURATION = 46;
const BEAT = 0.5;

// ---------------- the sound track (shared by both formats) ----------------
const TRADES = [
  [0.7, 100, "buy"],
  [0.86, 101, "buy"],
  [1.02, 102, "buy"],
  [1.18, 101, "sell"],
  [1.34, 103, "buy"],
  [1.5, 104, "buy"],
  [1.66, 103, "sell"],
  [1.82, 105, "buy"],
  [1.98, 104, "sell"],
  [2.14, 102, "sell"],
  [2.3, 101, "sell"],
  [2.46, 102, "buy"],
  [2.62, 103, "buy"],
  [2.78, 104, "buy"],
  [2.94, 103.5, "sell"],
  [3.1, 104.5, "buy"],
];
const BOOM = 3.5;
const Q = [5, 7, 9];
const ANSWER = 11;
const LOGO = 12.5;
const WALL = 15;
const DIVE = 19.6;
const FULL = 21;
const CRACK = FULL + (19.45 - 18.2);
const FEAT = [23, 27, 31];
const STATS = 35;
const END = 40;

export const music = {
  bpm: 120,
  palette: "lift",
  key: -2,
  sections: [
    { t: 0, level: 0 },
    { t: BOOM, level: 2 },
    { t: ANSWER, level: 1 },
    { t: LOGO, level: 2 },
    { t: WALL, level: 3 },
    { t: FEAT[0], level: 2 },
    { t: STATS, level: 3 },
    { t: END, level: 1 },
    { t: 44, level: 0 },
  ],
};
export const cues = [
  { t: 0.15, kind: "tick", vel: 0.5 },
  ...TRADES.map(([t, p, s]) => ({ t, kind: "fill", price: p, side: s, soft: true })),
  { t: 0.6, kind: "type", n: 7 },
  { t: 2.0, kind: "type", n: 11 },
  { t: 2.3, kind: "riser", dur: 1.2 },
  { t: BOOM, kind: "impact", big: true },
  { t: BOOM, kind: "fill", price: 110, side: "buy", big: true },
  ...Q.flatMap((t) => [
    { t: t - 0.25, kind: "whoosh", dur: 0.5 },
    { t, kind: "impact" },
    { t: t + 0.18, kind: "thud" },
    { t: t + 0.55, kind: "thud", vel: 0.6 },
  ]),
  { t: ANSWER - 0.2, kind: "whoosh", dur: 0.8 },
  { t: ANSWER, kind: "swell", dur: 1.4 },
  { t: ANSWER + 0.3, kind: "type", n: 8 },
  { t: LOGO, kind: "shimmer" },
  { t: LOGO, kind: "stamp" },
  { t: 14.1, kind: "riser", dur: 0.9 },
  { t: WALL, kind: "impact", big: true },
  { t: WALL, kind: "whoosh", dur: 1.2 },
  ...Array.from({ length: 19 }, (_, i) => ({
    t: WALL + 0.25 + i * 0.07,
    kind: "blip",
    vel: 0.22,
    freq: 1200 + i * 60,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({ t: 17.4 + i * 0.11, kind: "tick", vel: 0.35 })),
  { t: 18.5, kind: "stamp" },
  { t: DIVE - 0.1, kind: "riser", dur: 1.5 },
  { t: FULL, kind: "whoosh", dur: 0.6 },
  { t: CRACK - 0.7, kind: "riser", dur: 0.7 },
  { t: CRACK, kind: "impact", big: true },
  { t: CRACK, kind: "fill", price: 112, side: "buy", big: true },
  ...FEAT.flatMap((t) => [
    { t: t - 0.2, kind: "whoosh", dur: 0.5 },
    { t, kind: "impact", vel: 0.7 },
  ]),
  ...Array.from({ length: 14 }, (_, i) => ({ t: 23.3 + i * 0.26, kind: "tick", vel: 0.25 })),
  { t: 28.2, kind: "drain", dur: 0.9 },
  { t: 29.2, kind: "rise", dur: 0.9 },
  { t: 31.8, kind: "stamp" },
  { t: 34.0, kind: "riser", dur: 1.0 },
  ...[0, 1, 2, 3].flatMap((i) => [
    { t: STATS + i, kind: "impact", vel: 0.8 + i * 0.06 },
    { t: STATS + i, kind: "stamp" },
  ]),
  { t: 39, kind: "coin", vel: 0.5 },
  { t: END, kind: "impact", big: true },
  { t: END, kind: "shimmer" },
  { t: END + 1.6, kind: "type", n: 21 },
  { t: 44.2, kind: "swell", dur: 1.6 },
];
export const flashes = [
  { t: BOOM, amt: 0.7, decay: 5 },
  ...Q.map((t) => ({ t, amt: 0.28, decay: 9 })),
  { t: LOGO, amt: 0.3, decay: 6 },
  { t: WALL, amt: 0.45, decay: 6 },
  { t: CRACK, amt: 0.55, decay: 5 },
  ...FEAT.map((t) => ({ t, amt: 0.22, decay: 9 })),
  ...[0, 1, 2, 3].map((i) => ({ t: STATS + i, amt: 0.18, decay: 10 })),
  { t: END, amt: 0.45, decay: 5 },
];

// ---------------- footage: lessons rendered into offscreen screens ----------------
function makeShots(lessons) {
  const pool = new Map();
  return (id, t, width, quality = "high") => {
    const key = `${id}@${width}`;
    let s = pool.get(key);
    if (!s) {
      const canvas = document.createElement("canvas");
      s = { canvas, comp: createCompositor(canvas, { width, quality }) };
      pool.set(key, s);
    }
    const lesson = lessons[id];
    const lt = clamp(t, 0.5, lesson.duration - 0.05);
    s.comp.render(lesson, lt, Math.round(lt * 60), { watermark: false });
    return s.canvas;
  };
}

// ---------------- the film ----------------
export function makePromo({ w, h, lessons, courses }) {
  const WIDE = w > h;
  const U = Math.min(w, h) / 1080;
  const cx = w / 2;
  const cy = h / 2;
  const shot = makeShots(lessons);
  const course = Object.fromEntries(courses.map((c) => [c.id, c]));
  const order = courses.map((c) => c.id);

  const T = (ctx, str, x, y, size, o = {}) =>
    text(ctx, str, x, y, { family: F.tc, weight: 900, size: size * U, base: "middle", ...o });
  const R = (ctx, str, x, y, size, t, out, o = {}) =>
    revealText(
      ctx,
      str,
      x,
      y,
      { family: F.tc, weight: 900, size: size * U, base: "middle", rise: 40 * U, blur: 10, stagger: 0.04, ...o },
      t,
      out,
    );
  const mono = (ctx, str, x, y, size, o = {}) =>
    text(ctx, str, x, y, {
      family: F.mono,
      weight: 700,
      size: size * U,
      ls: size * U * 0.28,
      base: "middle",
      color: C.muted,
      ...o,
    });

  /** A 16:9 screen of lesson footage with frame, glow and optional glitch. */
  function screen(ctx, src, x, y, sw, o = {}) {
    const sh = (sw * 9) / 16;
    const a = o.alpha ?? 1;
    if (a <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (o.skew) ctx.transform(1, 0, o.skew, 1, 0, 0);
    ctx.globalAlpha *= a;
    glow(ctx, 0, sh * 0.1, sw * 0.62, o.glowColor ?? C.teal, 0.22 * (o.glowAmt ?? 1));
    const r = o.r ?? 20 * U;
    ctx.save();
    rrect(ctx, -sw / 2, -sh / 2, sw, sh, r);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.clip();
    ctx.drawImage(src, -sw / 2, -sh / 2, sw, sh);
    const g = o.glitch ?? 0;
    if (g > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.45 * g * a;
      ctx.drawImage(src, -sw / 2 + 16 * U * g, -sh / 2, sw, sh);
      ctx.globalAlpha = 0.3 * g * a;
      ctx.drawImage(src, -sw / 2 - 12 * U * g, -sh / 2 + 4 * U * g, sw, sh);
    }
    ctx.restore();
    rrect(ctx, -sw / 2, -sh / 2, sw, sh, r);
    ctx.strokeStyle = rgba(o.border ?? C.teal, 0.38);
    ctx.lineWidth = 1.6 * U;
    ctx.stroke();
    ctx.restore();
  }

  function ambient(ctx, t, a) {
    if (a <= 0) return;
    const step = 84 * U;
    const ox = -((t * 18 * U) % step);
    ctx.save();
    ctx.strokeStyle = rgba(C.grid, 0.8 * a);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < w + step; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = (cy % step) - step; y < h + step; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 60; i++) {
      const sp = rrange(3, i, 8, 30) * U;
      const x = (rnd(1, i) * w + t * sp * (rnd(2, i) > 0.5 ? 1 : -1) + w * 4) % w;
      const y = (rnd(4, i) * h - t * sp * 0.6 + h * 8) % h;
      glow(ctx, x, y, rrange(5, i, 3, 9) * U, rnd(6, i) > 0.7 ? C.gold : C.teal, 0.35 * a);
    }
  }

  // ---------- S1: cold open — trades build a candle, then it bursts ----------
  const PY = (p) => cy + 110 * U - (p - 101) * 52 * U;
  function coldOpen(ctx, t) {
    if (t > 5.2) return;
    const out = tw(t, BOOM - 0.05, BOOM + 0.35);
    const ccx = cx;
    const done = TRADES.filter(([tt]) => tt <= t);
    // the first dot
    const dot = tw(t, 0.1, 0.5) * (1 - tw(t, 0.7, 0.9));
    glow(ctx, ccx, PY(100), 26 * U, C.teal, dot * (0.8 + 0.2 * Math.sin(t * 20)));
    if (done.length && out < 1) {
      const ps = done.map((d) => d[1]);
      const o = ps[0];
      const c = ps.at(-1);
      const hi = Math.max(...ps);
      const lo = Math.min(...ps);
      const kick = pulse(t, done.at(-1)[0], 14);
      ctx.save();
      ctx.globalAlpha = 1 - out;
      candle(ctx, ccx, 84 * U * (1 + kick * 0.06), PY(o), PY(hi), PY(lo), PY(c), {
        wickWidth: 5 * U,
        glow: 30,
        minBody: 6 * U,
      });
      ctx.restore();
      // price tag
      T(ctx, c.toFixed(c % 1 ? 1 : 0), ccx + 90 * U, PY(c), 34, {
        family: F.display,
        weight: 700,
        color: c >= o ? C.teal : C.sell,
        alpha: 1 - out,
      });
    }
    // incoming trades
    for (const [tt, p, side] of TRADES) {
      const k = prog(t, tt - 0.32, tt);
      if (k > 0 && k < 1) {
        const from = side === "buy" ? -1 : 1;
        const x = lerp(ccx + from * 520 * U * (WIDE ? 1 : 0.8), ccx, ease.inCubic(k));
        glow(ctx, x, PY(p), 14 * U, side === "buy" ? C.teal : C.sell, 0.9);
        line(ctx, x, PY(p), x + from * 60 * U * (1 - k), PY(p), side === "buy" ? C.teal : C.sell, 2 * U, 0.6);
      }
      burst(ctx, ccx, PY(p), t, tt, {
        n: 8,
        speed: 180 * U,
        seed: tt * 100,
        color: side === "buy" ? C.teal : C.sell,
        flare: 30 * U,
      });
    }
    // copy
    const yT = cy - (WIDE ? 320 : 360) * U;
    R(ctx, "每一根 K 線", cx, yT, WIDE ? 80 : 86, t - 0.6, out, { align: "center" });
    R(ctx, "背後，都是一筆筆成交。", cx, yT + (WIDE ? 104 : 116) * U, WIDE ? 58 : 60, t - 2.0, out, {
      align: "center",
      color: C.gold,
      weight: 800,
    });
    // the burst: trades scatter into streams of light
    burst(ctx, ccx, PY(102.5), t, BOOM, { n: 90, speed: 1500 * U, seed: 7, color: C.teal, flare: 260 * U, life: 1.1 });
    burst(ctx, ccx, PY(102.5), t, BOOM + 0.04, {
      n: 60,
      speed: 1100 * U,
      seed: 9,
      color: C.gold,
      flare: 120 * U,
      life: 1.0,
    });
    ring(ctx, ccx, PY(102.5), t, BOOM, { r1: 900 * U, color: C.teal, w: 6 * U, dur: 1.0 });
    if (t > BOOM) {
      const a = 1 - tw(t, 4.4, 5.1);
      for (let i = 0; i < 70; i++) {
        const ang = rnd(11, i) * Math.PI * 2;
        const sp = rrange(12, i, 300, 1400) * U;
        const d = sp * (t - BOOM);
        const x = ccx + Math.cos(ang) * d;
        const y = PY(102.5) + Math.sin(ang) * d * 0.7;
        const col = rnd(13, i) > 0.3 ? C.teal : C.gold;
        neonPath(
          ctx,
          [
            [x, y],
            [x - Math.cos(ang) * 60 * U, y - Math.sin(ang) * 42 * U],
          ],
          col,
          2 * U,
          a * 0.8,
          0.6,
        );
      }
    }
  }

  // ---------- S2: three questions over lesson footage ----------
  const QS = [
    { id: "wick", lt: 10.3, lines: ["衝上去的價格，", "為什麼又回來？"] },
    { id: "btc-wall", lt: 12.6, lines: ["一道賣牆，", "38 分鐘不破？"] },
    { id: "breakout-volume", lt: 8.6, lines: ["放量突破，", "真的站穩了嗎？"] },
  ];
  function questions(ctx, t) {
    QS.forEach((q, i) => {
      const t0 = Q[i];
      const t1 = t0 + 2;
      if (t < t0 - 0.05 || t > t1 + 0.05) return;
      const k = t - t0;
      const inn = ease.outExpo(prog(k, 0, 0.45));
      const outA = tw(t, t1 - 0.12, t1);
      const side = i % 2 ? -1 : 1;
      const src = shot(q.id, q.lt + k, WIDE ? 1280 : 1080);
      const [sx, sy] = shake(t, t0, 18 * U, 0.35, 5 + i);
      const sw = WIDE ? w * 0.47 : w * 0.92;
      const x = WIDE ? w * 0.735 + side * 14 * U * k : cx;
      const y = WIDE ? cy : h * 0.32;
      screen(ctx, src, x + sx, y + sy, sw * lerp(1.18, 1, inn) * (1 + k * 0.02), {
        rot: side * lerp(0.09, 0.035, inn),
        alpha: inn * (1 - outA),
        glitch: pulse(t, t0, 10) + pulse(t, t1 - 0.1, 20),
        glowAmt: 1.4,
      });
      // copy
      const size = WIDE ? 80 : 92;
      const x0 = WIDE ? w * 0.07 : cx;
      const y0 = WIDE ? cy - 70 * U : h * 0.66;
      const align = WIDE ? "left" : "center";
      mono(ctx, `QUESTION 0${i + 1} / 03`, x0, y0 - 110 * U, 18, { align, color: C.teal, alpha: inn * (1 - outA) });
      q.lines.forEach((ln, j) => {
        const s = spring(t, t0 + 0.08 + j * 0.2, 16, 8);
        if (s <= 0) return;
        ctx.save();
        const lx = x0;
        const ly = y0 + j * (size + 26) * U;
        ctx.translate(lx, ly);
        ctx.scale(lerp(1.5, 1, clamp(s, 0, 1.2)), lerp(1.5, 1, clamp(s, 0, 1.2)));
        T(ctx, ln, 0, 0, size, {
          align,
          color: j ? C.gold : C.text,
          alpha: clamp(s * 1.6) * (1 - outA),
          glow: j ? 18 : 0,
        });
        ctx.restore();
      });
    });
  }

  // ---------- S3: answer + logo ----------
  function answer(ctx, t) {
    if (t < ANSWER - 0.1 || t > WALL + 0.1) return;
    const out1 = tw(t, LOGO - 0.25, LOGO);
    const streak = ease.outExpo(prog(t, ANSWER, ANSWER + 0.7));
    const lw = lerp(0, w * 0.9, streak) * (1 - out1);
    neonPath(
      ctx,
      [
        [cx - lw / 2, cy],
        [cx + lw / 2, cy],
      ],
      C.teal,
      3 * U,
      1 - out1,
      1.4,
    );
    for (let i = 0; i < 18; i++) {
      const p = (((t - ANSWER) * 0.8 + rnd(21, i)) % 1) * streak;
      glow(ctx, cx - lw / 2 + p * lw, cy, 10 * U, rnd(22, i) > 0.5 ? C.teal : C.gold, (1 - out1) * 0.9);
    }
    const s = WIDE ? 104 : 96;
    R(ctx, "答案，", cx, cy - 110 * U, s, t - ANSWER - 0.2, out1, { align: "center" });
    R(ctx, "都在成交裡。", cx, cy + 120 * U, s, t - ANSWER - 0.55, out1, { align: "center", color: C.gold });
    // logo
    if (t < LOGO) return;
    const out = tw(t, WALL - 0.45, WALL);
    const push = 1 + out * 0.6;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(push, push);
    ctx.globalAlpha = 1 - out;
    drawMark(ctx, 0, -190 * U, 190 * U, tw(t, LOGO, LOGO + 1.2, ease.lin), 1);
    glow(ctx, 0, -190 * U, 260 * U, C.teal, 0.25 * tw(t, LOGO + 0.6, LOGO + 1.2));
    R(ctx, "MetaBear 互動學院", 0, 50 * U, WIDE ? 96 : 88, t - LOGO - 0.5, 0, { align: "center" });
    mono(ctx, "ORDERFLOW  ACADEMY", 0, 138 * U, 22, {
      align: "center",
      color: C.teal,
      alpha: tw(t, LOGO + 0.9, LOGO + 1.3),
    });
    R(ctx, "看見過程，才讀得懂市場。", 0, 220 * U, 44, t - LOGO - 1.2, 0, {
      align: "center",
      color: C.text,
      weight: 600,
      stagger: 0.03,
    });
    ctx.restore();
  }

  // ---------- S4: the lesson wall ----------
  const cols = WIDE ? 5 : 3;
  const rows = Math.ceil((order.length + 1) / cols);
  const tileW = WIDE ? 520 : 400;
  const tileH = (tileW * 9) / 16;
  const labelH = 64;
  const gap = 40;
  const cellH = tileH + labelH;
  const wallW = cols * tileW + (cols - 1) * gap;
  const wallH = rows * cellH + (rows - 1) * gap;
  const tilePos = (i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return [c * (tileW + gap) - wallW / 2 + tileW / 2, r * (cellH + gap) - wallH / 2 + tileH / 2];
  };
  const zFit = Math.min((w * 0.9) / wallW, (h * (WIDE ? 0.66 : 0.7)) / wallH);
  const fitY = wallH * (WIDE ? 0.14 : 0.12);
  const zFill = (WIDE ? w : w * 0.94) / tileW;
  const bw = order.indexOf("btc-wall");
  const btcLT = (t) => 18.2 + (t - FULL);
  function wallCam(t) {
    const [ax, ay] = tilePos(order.indexOf("footprint"));
    const [bx, by] = tilePos(bw);
    const keys = [
      { t: WALL, x: ax, y: ay, z: zFill * 0.85 },
      { t: 17.8, x: 0, y: fitY, z: zFit },
      { t: DIVE, x: 30, y: fitY - 20, z: zFit * 1.05 },
      { t: FULL, x: bx, y: by, z: zFill },
    ];
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1];
      const b = keys[i];
      if (t <= b.t) {
        const u = (i === 3 ? ease.inOutQuart : i === 1 ? ease.inOutCubic : ease.lin)(prog(t, a.t, b.t));
        return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), u)) };
      }
    }
    return keys.at(-1);
  }
  function lessonWall(ctx, t) {
    if (t < WALL - 0.05 || t > FULL + 0.05) return;
    const cam = wallCam(t);
    const tilt = lerp(-0.05, 0, tw(t, 17.0, FULL));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(cam.z, cam.z);
    ctx.rotate(tilt);
    ctx.translate(-cam.x, -cam.y);
    const slots = cols * rows;
    for (let i = 0; i < slots; i++) {
      const [x, y] = tilePos(i);
      const pop = ease.outBack(prog(t, WALL + 0.1 + i * 0.07, WALL + 0.5 + i * 0.07));
      if (pop <= 0) continue;
      const id = order[i];
      const focus = i === bw ? 1 : 1 - 0.55 * tw(t, DIVE, FULL);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pop, pop);
      ctx.globalAlpha = clamp(pop) * focus;
      if (id) {
        const c = course[id];
        const hi = i === bw && t > FULL - 0.8;
        const lt = i === bw ? btcLT(t) : (POSTER_T[id] ?? 10) - 3 + (t - WALL) * 0.8;
        const src = shot(id, lt, hi ? Math.min(1920, Math.round(tileW * zFill)) : 384, hi ? "high" : "low");
        screen(ctx, src, 0, 0, tileW, { r: 16, glowAmt: i === bw ? 1.5 : 0.35 });
        const ly = tileH / 2 + labelH / 2 + 4;
        text(ctx, `${c.kind === "concept" ? "C" : "S"}${c.number}`, -tileW / 2 + 4, ly, {
          family: F.display,
          size: 34,
          weight: 700,
          color: c.kind === "concept" ? C.teal : C.gold,
          base: "middle",
        });
        text(ctx, c.title, -tileW / 2 + 70, ly, {
          family: F.tc,
          size: 28,
          weight: 800,
          color: C.text,
          base: "middle",
        });
      } else {
        const lines = i === order.length ? ["免費 · 免登入", "FREE"] : ["手機電腦都能看", "ANY SCREEN"];
        rrect(ctx, -tileW / 2, -tileH / 2, tileW, tileH, 16);
        ctx.fillStyle = rgba(C.teal, 0.08);
        ctx.fill();
        ctx.strokeStyle = rgba(C.teal, 0.5);
        ctx.lineWidth = 2;
        ctx.stroke();
        text(ctx, lines[0], 0, -10, {
          family: F.tc,
          size: 44,
          weight: 900,
          color: C.teal,
          align: "center",
          base: "middle",
        });
        text(ctx, lines[1], 0, 44, {
          family: F.mono,
          size: 18,
          weight: 700,
          color: C.muted,
          align: "center",
          base: "middle",
          ls: 6,
        });
      }
      ctx.restore();
    }
    ctx.restore();
    // counter
    const ca = tw(t, 17.3, 17.7) * (1 - tw(t, DIVE, DIVE + 0.4));
    if (ca > 0) {
      const n = Math.round(19 * ease.outCubic(prog(t, 17.4, 18.5)));
      const x = WIDE ? w * 0.06 : cx;
      const y = WIDE ? h * 0.885 : h * 0.9;
      ctx.save();
      const plate = WIDE ? [0, y - 190 * U, w, 320 * U] : [0, y - 170 * U, w, 260 * U];
      const g = ctx.createLinearGradient(0, plate[1], 0, plate[1] + plate[3]);
      g.addColorStop(0, "rgba(5,9,15,0)");
      g.addColorStop(0.5, "rgba(5,9,15,0.85)");
      g.addColorStop(1, "rgba(5,9,15,0.85)");
      ctx.globalAlpha = ca;
      ctx.fillStyle = g;
      ctx.fillRect(...plate);
      ctx.restore();
      const sz = WIDE ? 170 : 180;
      const nw = measure(ctx, String(n), { family: F.display, size: sz * U, weight: 700 });
      const nx = WIDE ? x : x - (nw + 300 * U) / 2;
      T(ctx, String(n), nx, y - 20 * U, sz, {
        family: F.display,
        weight: 700,
        color: C.text,
        alpha: ca,
        glow: 24,
        glowColor: C.teal,
      });
      T(ctx, "堂動態課程", nx + nw + 24 * U, y - 60 * U, 56, { alpha: ca, align: "left" });
      mono(ctx, "14 名詞圖解 · 5 市場故事", nx + nw + 26 * U, y + 10 * U, 20, {
        alpha: ca,
        color: C.teal,
        align: "left",
      });
    }
  }

  // ---------- S4b: full-frame BTC wall break ----------
  function fullFrame(ctx, t) {
    if (t < FULL || t > FEAT[0] + 0.6) return;
    const out = tw(t, FEAT[0] - 0.05, FEAT[0] + 0.5, ease.inCubic);
    const src = shot("btc-wall", btcLT(t), Math.min(1920, WIDE ? w : Math.round(w * 0.94)), "high");
    const [sx, sy] = shake(t, CRACK, 22 * U, 0.6, 9);
    if (WIDE) {
      ctx.save();
      ctx.globalAlpha = 1 - out;
      ctx.translate(cx + sx - out * w * 0.6, cy + sy);
      ctx.scale(1 - out * 0.3, 1 - out * 0.3);
      ctx.drawImage(src, -w / 2, -h / 2, w, h);
      ctx.restore();
      const a = tw(t, FULL + 0.3, FULL + 0.7) * (1 - out);
      const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
      g.addColorStop(0, "rgba(5,9,15,0)");
      g.addColorStop(1, "rgba(5,9,15,0.92)");
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
      ctx.restore();
      mono(ctx, "STORY 05 · REAL MARKET · 真實盤面", w * 0.06, h * 0.8, 20, { color: C.gold, alpha: a });
      R(ctx, "一道賣牆，最後倒給了誰？", w * 0.06, h * 0.88, 64, t - FULL - 0.4, out, {});
    } else {
      const y = lerp(cy, h * 0.34, tw(t, FULL, FULL + 0.8));
      screen(ctx, src, cx + sx - out * w, y + sy, w * 0.94, { alpha: 1 - out, glowAmt: 1.6, glowColor: C.gold });
      const a = tw(t, FULL + 0.4, FULL + 0.8) * (1 - out);
      mono(ctx, "STORY 05 · REAL MARKET", cx, h * 0.56, 20, { color: C.gold, alpha: a, align: "center" });
      R(ctx, "一道賣牆，", cx, h * 0.63, 84, t - FULL - 0.5, out, { align: "center" });
      R(ctx, "最後倒給了誰？", cx, h * 0.63 + 110 * U, 84, t - FULL - 0.8, out, { align: "center", color: C.gold });
    }
  }

  // ---------- S5: three product beats ----------
  const scrubKeys = [
    [27.0, 20.0],
    [28.2, 27.5],
    [29.2, 8.5],
    [30.2, 14.5],
    [31.2, 15.4],
  ];
  const scrub = (t) => {
    for (let i = 1; i < scrubKeys.length; i++) {
      const [a, va] = scrubKeys[i - 1];
      const [b, vb] = scrubKeys[i];
      if (t <= b) return lerp(va, vb, ease.inOutCubic(prog(t, a, b)));
    }
    return scrubKeys.at(-1)[1];
  };
  const FEATS = [
    {
      id: "footprint",
      lt: (t) => 1.2 + (t - FEAT[0]) * 7,
      kicker: "01 · SHORT & SHARP",
      lines: ["一堂約 30 秒，", "只講一件事。"],
      body: ["14 堂名詞圖解打底，", "5 堂市場故事串起因果。"],
    },
    {
      id: "wick",
      lt: scrub,
      kicker: "02 · YOUR PACE",
      lines: ["暫停、回拖、跳章，", "每一格都看得清。"],
      body: ["同一個時間點，", "永遠是同一個畫面。"],
    },
    {
      id: "btc-wall",
      lt: (t) => 5.4 + (t - FEAT[2]) * 0.8,
      kicker: "03 · REAL MARKET",
      lines: ["真實盤面，", "也拆給你看。"],
      body: ["2026.07.02 清晨 BTC：", "38 根 K 線，同一個最高價。"],
    },
  ];
  function features(ctx, t) {
    FEATS.forEach((f, i) => {
      const t0 = FEAT[i];
      const t1 = t0 + 4;
      if (t < t0 - 0.05 || t > t1 + 0.05) return;
      const inn = ease.outExpo(prog(t, t0, t0 + 0.6));
      const out = ease.inCubic(prog(t, t1 - 0.3, t1));
      const lt = f.lt(t);
      const sw = WIDE ? w * 0.54 : w * 0.92;
      const sh = (sw * 9) / 16;
      const x = (WIDE ? w * 0.33 : cx) + lerp(WIDE ? 240 : 0, 0, inn) * U - out * (WIDE ? 300 : 0) * U;
      const y = (WIDE ? cy - 20 * U : h * 0.3) + (WIDE ? 0 : lerp(120, 0, inn) * U);
      const src = shot(f.id, lt, Math.round(Math.min(1600, sw)), "high");
      const alpha = inn * (1 - out);
      screen(ctx, src, x, y, sw, {
        alpha,
        skew: lerp(-0.12, 0, inn) + out * 0.1,
        glitch: pulse(t, t0, 12),
        glowAmt: 1.3,
        glowColor: i === 2 ? C.gold : C.teal,
      });
      // overlays tied to the screen
      const bx = x - sw / 2;
      const by = y + sh / 2 + 40 * U;
      const lesson = lessons[f.id];
      if (i < 2) {
        // chapter-segmented bar with playhead
        const chapters = lesson.chapters;
        chapters.forEach((ch, j) => {
          const a = ch.t / lesson.duration;
          const b = (chapters[j + 1]?.t ?? lesson.duration) / lesson.duration;
          const fill = clamp((lt / lesson.duration - a) / (b - a));
          rrect(ctx, bx + a * sw + 3 * U, by - 4 * U, (b - a) * sw - 6 * U, 8 * U, 4 * U);
          ctx.fillStyle = rgba(C.text, 0.14 * alpha);
          ctx.fill();
          if (fill > 0) {
            rrect(ctx, bx + a * sw + 3 * U, by - 4 * U, ((b - a) * sw - 6 * U) * fill, 8 * U, 4 * U);
            ctx.fillStyle = rgba(C.teal, alpha);
            ctx.fill();
          }
        });
        const px = bx + (lt / lesson.duration) * sw;
        glow(ctx, px, by, 22 * U, C.teal, alpha);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = C.text;
        ctx.beginPath();
        ctx.arc(px, by, 9 * U, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const mm = (s) => `0:${String(Math.floor(s)).padStart(2, "0")}`;
        mono(ctx, `${mm(lt)} / ${mm(lesson.duration)}`, bx, by + 42 * U, 20, { color: C.text, alpha, ls: 2 });
        const chapter = [...chapters].reverse().find((c) => c.t <= lt + 1e-6);
        T(ctx, chapter?.label ?? "", bx + sw, by + 42 * U, 24, { align: "right", weight: 700, color: C.muted, alpha });
      }
      if (i === 0) {
        // fast-forward badge + timer ring on the screen corner
        const rx = x + sw / 2 - 80 * U;
        const ry = y - sh / 2 + 80 * U;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(rx, ry, 54 * U, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(5,9,15,0.75)";
        ctx.fill();
        ctx.lineWidth = 6 * U;
        ctx.strokeStyle = rgba(C.teal, 0.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rx, ry, 54 * U, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(lt / lesson.duration));
        ctx.strokeStyle = C.teal;
        ctx.stroke();
        ctx.restore();
        T(ctx, `${Math.floor(lt)}s`, rx, ry, 34, { family: F.display, weight: 700, align: "center", alpha });
        mono(ctx, "▶▶ ×7", rx, ry + 84 * U, 16, { align: "center", color: C.gold, alpha });
      }
      if (i === 1) {
        const dv = scrub(t + 0.05) - scrub(t - 0.05);
        const label = dv < -0.2 ? "◀◀  回拖" : dv > 0.2 ? "▶▶  快轉" : "❚❚  暫停";
        const a = alpha * (Math.abs(dv) > 0.2 || (t > 30.2 && t < 30.9) ? 1 : 0.4);
        const lx = x - sw / 2 + 40 * U;
        const ly = y - sh / 2 + 54 * U;
        rrect(ctx, lx - 16 * U, ly - 30 * U, 210 * U, 60 * U, 30 * U);
        ctx.fillStyle = `rgba(5,9,15,${0.75 * alpha})`;
        ctx.fill();
        T(ctx, label, lx + 8 * U, ly, 26, { weight: 800, color: dv < -0.2 ? C.gold : C.teal, alpha: a });
      }
      if (i === 2) {
        const a = alpha * tw(t, t0 + 0.8, t0 + 1.2);
        const lx = x - sw / 2 + 36 * U;
        const ly = y - sh / 2 + 48 * U;
        rrect(ctx, lx - 14 * U, ly - 26 * U, 380 * U, 52 * U, 26 * U);
        ctx.fillStyle = `rgba(5,9,15,${0.8 * a})`;
        ctx.fill();
        mono(ctx, "REAL MARKET · BINANCE", lx + 4 * U, ly, 17, { color: C.gold, alpha: a });
        const sa = alpha * tw(t, t0 + 1.4, t0 + 1.8);
        T(ctx, "60,800.00 × 38", x, by + 30 * U, 60, {
          family: F.display,
          weight: 700,
          color: C.gold,
          align: "center",
          alpha: sa,
          glow: 20,
        });
      }
      // copy
      const x0 = WIDE ? w * 0.645 : cx;
      const y0 = WIDE ? cy - 130 * U : h * 0.63;
      const align = WIDE ? "left" : "center";
      const ca = tw(t, t0 + 0.15, t0 + 0.5) * (1 - out);
      mono(ctx, f.kicker, x0, y0 - 70 * U, 19, { color: i === 2 ? C.gold : C.teal, align, alpha: ca });
      f.lines.forEach((ln, j) =>
        R(ctx, ln, x0, y0 + j * 96 * U, WIDE ? 70 : 76, t - t0 - 0.2 - j * 0.25, out, {
          align,
          color: j ? (i === 2 ? C.gold : C.teal) : C.text,
        }),
      );
      f.body.forEach((ln, j) =>
        T(ctx, ln, x0, y0 + (220 + j * 46) * U, 30, {
          align,
          weight: 500,
          color: C.muted,
          alpha: ca * tw(t, t0 + 0.9, t0 + 1.3),
        }),
      );
    });
  }

  // ---------- S6: numbers on the beat ----------
  const STAT = [
    ["19", "堂動態課程", C.text],
    ["14", "名詞圖解", C.teal],
    ["5", "市場故事", C.gold],
    ["0", "元・免登入", C.teal],
  ];
  function stats(ctx, t) {
    if (t < STATS - 0.1 || t > END + 0.1) return;
    const out = tw(t, END - 0.3, END);
    // pulsing order-book bars along the bottom
    const nb = WIDE ? 64 : 36;
    for (let i = 0; i < nb; i++) {
      const beat = pulse(t, STATS + Math.floor((t - STATS) / BEAT) * BEAT, 6);
      const hh = (0.25 + 0.75 * (0.5 + 0.5 * noise1(i * 0.4 + t * 1.4, 4))) * (1 + beat * 0.5) * 220 * U;
      const bwid = w / nb;
      const bid = i < nb / 2;
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - out) * tw(t, STATS, STATS + 0.4);
      ctx.fillStyle = bid ? rgba(C.teal, 0.5) : rgba(C.sell, 0.45);
      ctx.fillRect(i * bwid + 3, h - hh, bwid - 6, hh);
      ctx.restore();
    }
    STAT.forEach(([n, label, col], i) => {
      const t0 = STATS + i;
      const s = spring(t, t0, 18, 9);
      if (s <= 0) return;
      const x = WIDE ? w * (0.14 + 0.24 * i) : w * (0.28 + 0.44 * (i % 2));
      const y = WIDE ? cy - 40 * U : h * (0.36 + 0.26 * Math.floor(i / 2));
      const roll = prog(t, t0, t0 + 0.35);
      const shown =
        roll < 1 ? String(Math.floor(rnd(31 + i, Math.floor(t * 30)) * (n === "0" ? 10 : Number(n) * 3))) : n;
      ctx.save();
      ctx.translate(x, y);
      const sc = lerp(1.6, 1, clamp(s, 0, 1.2));
      ctx.scale(sc, sc);
      T(ctx, shown, 0, 0, WIDE ? 230 : 250, {
        family: F.display,
        weight: 700,
        align: "center",
        color: col,
        alpha: clamp(s * 1.5) * (1 - out),
        glow: 30,
      });
      ctx.restore();
      T(ctx, label, x, y + (WIDE ? 150 : 160) * U, 40, {
        align: "center",
        weight: 800,
        alpha: clamp(s * 1.5) * (1 - out),
      });
    });
    const la = tw(t, 39, 39.3) * (1 - out);
    mono(ctx, "FREE · NO LOGIN · ANY SCREEN", cx, WIDE ? h * 0.2 : h * 0.16, 24, {
      align: "center",
      color: C.gold,
      alpha: la,
    });
  }

  // ---------- S7: end card ----------
  function endCard(ctx, t) {
    if (t < END - 0.05) return;
    const k = t - END;
    const markY = cy - (WIDE ? 320 : 420) * U;
    drawMark(ctx, cx, markY, (WIDE ? 120 : 150) * U, tw(t, END, END + 1.0, ease.lin), 1);
    glow(ctx, cx, markY, 220 * U, C.teal, 0.25 * tw(t, END + 0.4, END + 1));
    const size = WIDE ? 150 : 150;
    R(ctx, "讀懂市場，", cx, cy - 110 * U, size, k - 0.25, 0, { align: "center", stagger: 0.06 });
    R(ctx, "再進場。", cx, cy + 70 * U, size, k - 0.6, 0, { align: "center", color: C.gold, stagger: 0.06, glow: 8 });
    // URL pill types in
    const url = "metabear.io/orderflow";
    const n = Math.floor(clamp((k - 1.6) / 1.1) * url.length);
    const shown = url.slice(0, n);
    const pa = tw(t, END + 1.4, END + 1.8);
    const fw = measure(ctx, url, { family: F.mono, size: 40 * U, weight: 700 });
    const py = cy + (WIDE ? 250 : 300) * U;
    rrect(ctx, cx - fw / 2 - 40 * U, py - 44 * U, fw + 80 * U, 88 * U, 44 * U);
    ctx.save();
    ctx.globalAlpha = pa;
    ctx.fillStyle = "rgba(120,225,213,0.1)";
    ctx.fill();
    ctx.strokeStyle = C.teal;
    ctx.lineWidth = 2.5 * U;
    ctx.shadowColor = C.teal;
    ctx.shadowBlur = 24;
    ctx.stroke();
    ctx.restore();
    text(ctx, shown, cx - fw / 2, py + 2 * U, {
      family: F.mono,
      size: 40 * U,
      weight: 700,
      color: C.teal,
      base: "middle",
      alpha: pa,
    });
    if (n < url.length && pa > 0 && Math.floor(t * 4) % 2 === 0) {
      const cw = measure(ctx, shown, { family: F.mono, size: 40 * U, weight: 700 });
      ctx.save();
      ctx.globalAlpha = pa;
      ctx.fillStyle = C.teal;
      ctx.fillRect(cx - fw / 2 + cw + 4 * U, py - 22 * U, 4 * U, 44 * U);
      ctx.restore();
    }
    T(ctx, "MetaBear 互動學院 · 19 堂免費動態課程", cx, py + (WIDE ? 90 : 100) * U, 30, {
      align: "center",
      weight: 600,
      color: C.text,
      alpha: tw(t, END + 2.8, END + 3.2),
    });
    T(ctx, "交易概念教學，不構成投資建議；加密資產與合約交易有虧損風險。", cx, h - 64 * U, 20, {
      align: "center",
      weight: 500,
      color: C.dim,
      alpha: tw(t, END + 3.2, END + 3.6),
    });
    // rising liquidity bars
    const nb = WIDE ? 90 : 48;
    for (let i = 0; i < nb; i++) {
      const bwid = w / nb;
      const d = Math.abs(i - nb / 2) / (nb / 2);
      const hh = (0.2 + 0.8 * (0.5 + 0.5 * noise1(i * 0.5 + t * 0.6, 8))) * d * 160 * U * tw(t, END, END + 1.2);
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = i < nb / 2 ? rgba(C.teal, 0.6) : rgba(C.sell, 0.5);
      ctx.fillRect(i * bwid + 2, h - hh, bwid - 4, hh);
      ctx.restore();
    }
  }

  return {
    duration: DURATION,
    flashes,
    draw(ctx, t) {
      const amb =
        tw(t, 0.8, 2) * (1 - tw(t, Q[0] - 0.2, Q[0])) +
        tw(t, ANSWER - 0.2, ANSWER) * (1 - tw(t, WALL - 0.2, WALL)) +
        tw(t, STATS - 0.3, STATS) * 0.8;
      ambient(ctx, t, clamp(amb) * 0.9);
      coldOpen(ctx, t);
      questions(ctx, t);
      answer(ctx, t);
      lessonWall(ctx, t);
      fullFrame(ctx, t);
      features(ctx, t);
      stats(ctx, t);
      endCard(ctx, t);
    },
  };
}
