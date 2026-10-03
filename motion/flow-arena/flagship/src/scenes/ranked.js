// Bars 26–28. RANKED: the real cockpit as a floating product shot, a leaderboard slamming in on
// eighths, and the game's own share line. Ends by sucking into the #1 row.

import { bar, BEAT } from "../cues.js";
import { backdrop } from "./title.js";
import { C, F, blob, camera, clamp, decay, drawQuad, ease, embers, glass, headline, inv, label, lerp, rgba, roundRect, subline, text } from "../lib.js";

export const ZH = "排名賽回合分享種子挑戰同一個市場你玩得比我好嗎？排行榜名稱損益冰山獵人熊熊不睡覺";

let shot;
export async function init() {
  shot = new Image();
  shot.src = new URL("../../assets/cockpit.jpg", import.meta.url).href;
  await shot.decode();
}

const ROWS = [
  { name: "SQUEEZE_KING", pnl: "+$18,402,110", seed: "#48213" },
  { name: "冰山獵人", pnl: "+$12,960,400", seed: "#77102" },
  { name: "flowreader", pnl: "+$9,114,250", seed: "#10294" },
  { name: "熊熊不睡覺", pnl: "+$4,388,900", seed: "#48213" },
  { name: "0xMAKO", pnl: "+$2,071,300", seed: "#93311" },
];

export function draw(ctx, t, lt, look) {
  const t0 = bar(26);
  const settle = 1 - ease.out4(clamp(lt / 0.5));
  const exit = ease.in3(inv(bar(27.75), bar(28), t));
  ctx.fillStyle = "#04070b";
  ctx.fillRect(0, 0, 1920, 1080);
  backdrop(ctx, t, 0.75, { horizon: 640 });
  embers(ctx, t, { n: 40, seed: 23, color: C.gold, alpha: 0.6 });

  // Product shot: the live cockpit on a floating screen, turned toward the board.
  const drift = inv(t0, bar(28), t);
  const cam = camera({ x: lerp(-60, 40, drift), y: 30, z: -1700 + settle * 500, yaw: lerp(-0.02, 0.02, drift), f: 1000 });
  const cx = -470;
  const cy = 10;
  const phi = lerp(0.42, 0.34, ease.inOut3(drift));
  const hw = 620;
  const hh = hw * 9 / 16;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const corner = (sx, sy) => cam.project(cx + sx * hw * cos, cy + sy * hh, sx * hw * sin);
  const q = [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)];
  const qa = ease.out3(clamp(lt / 0.45));
  if (q.every(Boolean)) {
    // Glow behind, reflection below, then the screen.
    const mid = q.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    blob(ctx, mid[0], mid[1], 760, C.fuel, 0.16 * qa);
    blob(ctx, mid[0], mid[1], 520, C.long, 0.1 * qa);
    ctx.restore();
    const refl = [corner(-1, -1), corner(1, -1), cam.project(cx + hw * cos, cy - hh * 2.2, hw * sin), cam.project(cx - hw * cos, cy - hh * 2.2, -hw * sin)];
    // Reflection: the image flipped (bottom edge mapped to the top) and faded.
    if (refl.every(Boolean)) {
      drawQuad(ctx, shot, [refl[3], refl[2], refl[1], refl[0]], { strips: 24, alpha: 0.07 * qa });
      const fg = ctx.createLinearGradient(0, refl[0][1], 0, refl[3][1]);
      fg.addColorStop(0, "rgba(4,7,11,0)");
      fg.addColorStop(1, "rgba(4,7,11,1)");
      ctx.fillStyle = fg;
      ctx.fillRect(0, Math.min(refl[0][1], refl[1][1]), 1100, 400);
    }
    drawQuad(ctx, shot, q, { strips: 40, alpha: qa });
    // Bezel and a light sweep across the glass.
    ctx.save();
    ctx.beginPath();
    q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.strokeStyle = rgba(C.ink, 0.25 * qa);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.clip();
    const sweep = lerp(-400, 1500, ease.inOut3(inv(t0 + 0.2, t0 + 1.6, t)));
    const sg = ctx.createLinearGradient(sweep - 200, 0, sweep + 200, 300);
    sg.addColorStop(0, "rgba(255,255,255,0)");
    sg.addColorStop(0.5, "rgba(255,255,255,0.16)");
    sg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.restore();
  }

  // Leaderboard.
  const bx = 1140;
  const by = 330;
  const bw = 680;
  const ba = ease.out3(inv(t0 + 0.15, t0 + 0.5, t));
  ctx.save();
  const zoomRow = 1 + exit * 2.5;
  ctx.translate(bx + bw / 2, by + 150);
  ctx.scale(zoomRow, zoomRow);
  ctx.translate(-(bx + bw / 2), -(by + 150));
  glass(ctx, bx, by, bw, 470, { r: 18, alpha: ba, fill: 0.82 });
  ctx.globalAlpha = ba;
  label(ctx, "LEADERBOARD · 排行榜", bx + 30, by + 46, { size: 15, color: C.ink2, track: 4 });
  roundRect(ctx, bx + bw - 210, by + 22, 180, 34, 17);
  ctx.fillStyle = rgba(C.gold, 0.12);
  ctx.fill();
  ctx.strokeStyle = rgba(C.gold, 0.55);
  ctx.lineWidth = 1;
  ctx.stroke();
  label(ctx, "RANKED · 24 TURNS", bx + bw - 120, by + 44, { size: 12, color: C.gold, align: "center", track: 2 });
  label(ctx, "#", bx + 30, by + 92, { size: 12, color: C.ink3 });
  label(ctx, "名稱", bx + 80, by + 92, { size: 12, color: C.ink3 });
  label(ctx, "損益 PNL", bx + 470, by + 92, { size: 12, color: C.ink3, align: "right" });
  label(ctx, "種子", bx + bw - 30, by + 92, { size: 12, color: C.ink3, align: "right" });
  ctx.globalAlpha = 1;
  ROWS.forEach((r, i) => {
    const at = bar(26.5) + i * BEAT / 2;
    const k = ease.outExpo(clamp((t - at) / 0.35));
    if (k <= 0) return;
    const y = by + 112 + i * 66;
    const dx = (1 - k) * 160;
    const first = i === 0;
    ctx.save();
    ctx.globalAlpha = clamp(k * 1.4) * ba;
    roundRect(ctx, bx + 16 + dx, y, bw - 32, 56, 10);
    ctx.fillStyle = first ? rgba(C.gold, 0.12 + decay(t, at, 4) * 0.25) : rgba(C.line, 0.05 + decay(t, at, 5) * 0.12);
    ctx.fill();
    if (first) {
      ctx.strokeStyle = rgba(C.gold, 0.6);
      ctx.stroke();
    }
    text(ctx, String(i + 1), bx + 34 + dx, y + 37, { font: F.mono(800, 22), color: first ? C.gold : C.ink2 });
    text(ctx, r.name, bx + 80 + dx, y + 37, { font: /[一-鿿]/.test(r.name) ? F.zh(700, 22) : F.mono(700, 21), color: C.ink });
    text(ctx, r.pnl, bx + 470 + dx, y + 37, { font: F.mono(700, 21), color: C.longInk, align: "right" });
    text(ctx, r.seed, bx + bw - 30 + dx, y + 37, { font: F.mono(500, 18), color: C.ink3, align: "right" });
    ctx.restore();
  });
  ctx.restore();
  if (exit > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    blob(ctx, bx + bw / 2, by + 140, 300 + exit * 900, C.gold, exit * 0.7);
    ctx.restore();
  }

  // Share line from the game's result card.
  const sa = ease.out3(inv(bar(27), bar(27) + 0.35, t)) * (1 - exit);
  if (sa > 0.01) {
    glass(ctx, bx, by + 496, bw, 70, { r: 14, alpha: sa, tint: C.long, edge: 0.4 });
    text(ctx, "同一個市場，你玩得比我好嗎？", bx + 30, by + 541, { font: F.zh(700, 24), color: C.ink, alpha: sa });
    label(ctx, "?seed=48213", bx + bw - 30, by + 539, { size: 15, color: C.longInk, alpha: sa, align: "right", track: 1 });
  }

  // Headlines.
  const h1 = t - (t0 + 0.02);
  headline(ctx, ["RANKED.", "24", "TURNS."], 960, 170, { size: 96, p: h1, out: bar(26.95) - t, track: 5, accent: 0, accentColor: C.gold });
  subline(ctx, "排名賽：24 回合，一個排行榜。", 960, 222, { size: 30, p: h1, out: bar(26.95) - t, color: C.ink, weight: 600, track: 8 });
  const h2 = t - bar(27);
  if (h2 > 0) {
    headline(ctx, ["SHARE", "THE", "SEED.", "SAME", "MARKET."], 960, 170, { size: 92, p: h2, out: bar(27.8) - t, track: 4, accent: 4, accentColor: C.long, stagger: 0.05 });
    subline(ctx, "分享種子，挑戰同一個市場。", 960, 222, { size: 30, p: h2, out: bar(27.8) - t, color: C.ink, weight: 600, track: 8 });
  }

  Object.assign(look, {
    bloom: 0.85 + exit * 0.6,
    threshold: 0.66 - exit * 0.1,
    vignette: 0.6,
    grain: 0.04,
    ca: 0.0016 + settle * 0.01 + exit * 0.01,
    zoomBlur: settle * 0.8 + exit * 0.8,
    zoomCenter: [(bx + bw / 2) / 1920, 1 - (by + 140) / 1080],
    flash: exit ** 6 * 0.6 + decay(t, t0, 8) * 0.25,
    flashColor: [1, 0.88, 0.6],
  });
}
