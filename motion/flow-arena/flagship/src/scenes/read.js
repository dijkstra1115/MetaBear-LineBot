// Bars 10–12. READ THE FLOW: the four instruments the game gives you land on the beat as glass
// panels in an arc (CVD, footprint, open interest, order book), then the camera dives into the book.

import { bar } from "../cues.js";
import { C, F, blob, camera, clamp, decay, drawQuad, ease, fmt, glass, headline, inv, label, lerp, noise1, rgba, rnd, rr, subline, text } from "../lib.js";

export const ZH = "讀懂訂單流累積主動買賣差足跡圖未平倉量委託簿背離冰山吸收";
export const lead = 0;

const PW = 1000;
const PH = 660;
const panels = [];
export function init() {
  for (let i = 0; i < 4; i++) {
    const c = document.createElement("canvas");
    c.width = PW;
    c.height = PH;
    panels.push(c);
  }
}

const SPEC = [
  { en: "CVD", zh: "累積主動買賣差", draw: cvd },
  { en: "FOOTPRINT", zh: "足跡圖", draw: footprint },
  { en: "OPEN INTEREST", zh: "未平倉量", draw: oi },
  { en: "ORDER BOOK", zh: "委託簿", draw: book },
];

function frame(g, i, lt, flash) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, PW, PH);
  glass(g, 4, 4, PW - 8, PH - 8, { r: 28, fill: 0.86, edge: 0.22 + flash * 0.6, tint: flash > 0.05 ? C.ink : C.line });
  label(g, `0${i + 1}`, 44, 74, { size: 24, color: C.fuel, track: 4 });
  label(g, SPEC[i].en, 104, 74, { size: 26, color: C.ink, track: 6, weight: 700 });
  text(g, SPEC[i].zh, PW - 44, 74, { font: F.zh(600, 28), color: C.ink3, align: "right", track: 4 });
  g.fillStyle = rgba(C.line, 0.14);
  g.fillRect(44, 100, PW - 88, 2);
  SPEC[i].draw(g, lt);
  // Arrival sweep.
  if (flash > 0.01) {
    const x = lerp(-200, PW + 200, 1 - flash);
    const lg = g.createLinearGradient(x - 120, 0, x + 120, 0);
    lg.addColorStop(0, "rgba(255,255,255,0)");
    lg.addColorStop(0.5, `rgba(255,255,255,${0.16 * flash})`);
    lg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = lg;
    g.fillRect(4, 4, PW - 8, PH - 8);
  }
}

function cvd(g, lt) {
  const k = ease.out3(clamp(lt / 0.9));
  const x0 = 60;
  const x1 = PW - 60;
  const n = 90;
  const priceY = (j) => 300 + noise1(j * 0.18, 3) * 26 + j * 0.25;
  const cvdY = (j) => 560 - Math.pow(j / n, 1.3) * 300 + noise1(j * 0.3 + lt, 4) * 10;
  const m = Math.max(2, Math.floor(n * k));
  // CVD area.
  g.beginPath();
  g.moveTo(x0, 600);
  for (let j = 0; j <= m; j++) g.lineTo(lerp(x0, x1, j / n), cvdY(j));
  g.lineTo(lerp(x0, x1, m / n), 600);
  g.closePath();
  const ag = g.createLinearGradient(0, 240, 0, 600);
  ag.addColorStop(0, rgba(C.long, 0.35));
  ag.addColorStop(1, rgba(C.long, 0));
  g.fillStyle = ag;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = rgba(C.long);
  g.beginPath();
  for (let j = 0; j <= m; j++) (j ? g.lineTo : g.moveTo).call(g, lerp(x0, x1, j / n), cvdY(j));
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = rgba(C.ink2, 0.8);
  g.beginPath();
  for (let j = 0; j <= m; j++) (j ? g.lineTo : g.moveTo).call(g, lerp(x0, x1, j / n), priceY(j));
  g.stroke();
  label(g, "PRICE", 70, 262, { size: 20, color: C.ink3 });
  label(g, "CVD", 70, 548, { size: 20, color: C.long });
  text(g, `+${fmt(1284 * k)} BTC`, PW - 60, 172, { font: F.mono(700, 46), color: C.longInk, align: "right" });
  const tag = ease.outBack(clamp((lt - 1) / 0.4));
  if (tag > 0) {
    g.save();
    g.globalAlpha = clamp(tag);
    g.strokeStyle = rgba(C.fuel);
    g.lineWidth = 3;
    g.setLineDash([10, 8]);
    g.beginPath();
    g.moveTo(PW - 120, 236);
    g.lineTo(PW - 120, 290);
    g.stroke();
    g.setLineDash([]);
    text(g, "DIVERGENCE · 背離", 60, 172, { font: F.zh(700, 30), color: C.fuel });
    g.restore();
  }
}

function footprint(g, lt) {
  const rows = 12;
  const top = 130;
  const rh = 38;
  const cx = PW / 2;
  const poc = 7;
  for (let r = 0; r < rows; r++) {
    const k = ease.out3(clamp((lt - r * 0.04) / 0.4));
    if (k <= 0) continue;
    const y = top + r * rh;
    const tick = Math.floor(lt * 6);
    const sell = Math.round(rr(r, 1, 10, 160) + (r === poc ? 240 : 0) + rnd(r, tick) * 8);
    const buy = Math.round(rr(r, 2, 10, 160) + (r === poc ? 310 : 0) + (r < 5 ? 120 : 0) + rnd(r + 50, tick) * 8);
    const imb = buy > sell * 2.2 ? 1 : sell > buy * 2.2 ? -1 : 0;
    g.globalAlpha = k;
    if (imb) {
      g.fillStyle = rgba(imb > 0 ? C.long : C.short, 0.16);
      g.fillRect(imb > 0 ? cx + 40 : 60, y + 3, cx - 100, rh - 6);
    }
    // Candle body column, numbers either side.
    g.fillStyle = rgba(r >= 3 && r <= 10 ? C.long : C.line, r >= 3 && r <= 10 ? 0.55 : 0.25);
    g.fillRect(cx - 14, y + 2, 28, rh - 4);
    text(g, String(sell), cx - 40, y + 28, { font: F.mono(600, 26), color: imb < 0 ? C.shortInk : C.ink2, align: "right" });
    text(g, String(buy), cx + 40, y + 28, { font: F.mono(600, 26), color: imb > 0 ? C.longInk : C.ink2 });
    if (r === poc) {
      g.strokeStyle = rgba(C.gold, 0.95);
      g.lineWidth = 3;
      g.strokeRect(150, y + 1, PW - 300, rh - 2);
      label(g, "POC", PW - 140, y + 28, { size: 20, color: C.gold });
    }
    g.globalAlpha = 1;
  }
  label(g, "SELL × BUY", 60, 620, { size: 20, color: C.ink3 });
}

function oi(g, lt) {
  const n = 26;
  const k = ease.out3(clamp(lt / 0.8));
  const base = 560;
  const deltas = [];
  for (let j = 0; j < n; j++) deltas.push((rnd(j, 31) - 0.35) * 120 + (j > 17 ? 90 : 0));
  const totals = [];
  let total = 0;
  for (const d of deltas) totals.push((total += d));
  const lo = Math.min(0, ...totals);
  const hi = Math.max(...totals);
  const pts = [];
  deltas.forEach((d, j) => {
    const x = 80 + j * ((PW - 160) / n);
    const h = Math.abs(d) * 0.75 * k;
    g.fillStyle = rgba(d > 0 ? C.long : C.short, 0.75);
    if (d > 0) g.fillRect(x, base - h, 22, h);
    else g.fillRect(x, base, 22, h);
    // OI line scaled into the band between the header and the bars.
    pts.push([x + 11, lerp(440, 250, ((totals[j] - lo) / (hi - lo)) * k)]);
  });
  g.strokeStyle = rgba(C.info);
  g.lineWidth = 4;
  g.beginPath();
  pts.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.stroke();
  blob(g, pts[n - 1][0], pts[n - 1][1], 40, C.info, 0.8 * k, 1);
  g.fillStyle = rgba(C.line, 0.2);
  g.fillRect(60, base, PW - 120, 2);
  text(g, `${fmt(48210 + 1940 * k)} BTC`, 60, 172, { font: F.mono(700, 46), color: C.ink });
  label(g, `+${fmt(1940 * k)} BTC · 5M`, 60, 210, { size: 20, color: C.longInk });
}

function book(g, lt) {
  const rows = 8;
  const rh = 30;
  const mid = 380;
  const k = ease.out3(clamp(lt / 0.5));
  for (let side = -1; side <= 1; side += 2) {
    for (let r = 0; r < rows; r++) {
      const y = mid + side * (r + 0.5) * rh + (side > 0 ? 18 : -18);
      const size = (rr(r, side + 5, 20, 120) + r * 12) * (1 + 0.25 * noise1(lt * 3 + r, side + 9));
      const w = size * 2.6 * k;
      const col = side < 0 ? C.short : C.long;
      g.fillStyle = rgba(col, 0.22);
      g.fillRect(PW - 60 - w, y - rh / 2 + 2, w, rh - 4);
      const priceV = 102640 + (side < 0 ? 1 : -1) * (r + 1) * 6;
      text(g, fmt(priceV, 1), 60, y + 9, { font: F.mono(600, 24), color: side < 0 ? C.shortInk : C.longInk });
      text(g, fmt(size, 1), PW - 70, y + 9, { font: F.mono(500, 24), color: C.ink2, align: "right" });
      // The iceberg: a level that keeps refilling.
      if (side < 0 && r === 4) {
        const pulse = 0.5 + 0.5 * Math.sin(lt * 8);
        g.save();
        g.strokeStyle = rgba(C.violet, 0.6 + 0.4 * pulse);
        g.lineWidth = 3;
        g.setLineDash([12, 8]);
        g.strokeRect(46, y - rh / 2, PW - 92, rh);
        g.restore();
        label(g, "ICEBERG? · 冰山吸收", 360, y + 8, { size: 20, color: C.violet });
      }
    }
  }
  g.fillStyle = rgba(C.line, 0.1);
  g.fillRect(44, mid - 14, PW - 88, 28);
  text(g, "102,640.0", 60, mid + 9, { font: F.mono(700, 26), color: C.ink });
  label(g, "SPREAD $12", PW - 70, mid + 8, { size: 20, color: C.ink3, align: "right" });
}

// Panel layout: an arc facing the camera.
const LAYOUT = [-1.5, -0.5, 0.5, 1.5].map((u, i) => {
  const cx = u * 600;
  return { i, cx, cy: -170, cz: Math.abs(u) * 190, phi: u * 0.16 };
});

export function draw(ctx, t, lt, look) {
  const t0 = bar(10);
  const dive = ease.in3(inv(bar(11.6), bar(12), t));
  const settle = 1 - ease.out3(clamp(lt / 0.5));

  // Backdrop: deep gradient + faint grid + aurora.
  const bg = ctx.createRadialGradient(960, 600, 0, 960, 600, 1200);
  bg.addColorStop(0, "#0b1320");
  bg.addColorStop(1, "#04070b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(140,178,214,0.035)";
  ctx.lineWidth = 1;
  const off = (t * 30) % 44;
  for (let x = -off; x < 1920; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1080);
    ctx.stroke();
  }
  for (let y = 0; y < 1080; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1920, y);
    ctx.stroke();
  }
  blob(ctx, 420, 180, 700, C.long, 0.1);
  blob(ctx, 1500, 900, 700, C.violet, 0.1);
  ctx.restore();

  // Camera: settles from the title dive, trucks left, then dives into the order book.
  const target = LAYOUT[3];
  const truck = ease.inOut3(inv(t0, bar(11.1), t));
  const reveal = ease.inOut3(inv(bar(10.85), bar(11.5), t));
  // The dive ends square-on to the order book: yaw = -phi, standing off along its normal.
  const D = 300;
  const camX = lerp(lerp(lerp(-720, 640, truck), 0, reveal), target.cx + Math.sin(target.phi) * D, dive);
  const camZ = lerp(lerp(-760, -1260, reveal) - settle * 700, target.cz - Math.cos(target.phi) * D, dive);
  const camY = lerp(lerp(-110, -70, reveal), target.cy, dive);
  const yaw = lerp(lerp(-0.1, 0.1, truck) * (1 - reveal), -target.phi, dive);
  const cam = camera({ x: camX, y: camY, z: camZ, yaw, roll: lerp(0.012, -0.012, truck) * (1 - reveal), f: 1000 });

  // Panels, back to front.
  const order = [...LAYOUT].sort((a, b) => b.cz - a.cz);
  for (const L of order) {
    const at = t0 + L.i * bar(0.25);
    const k = ease.outExpo(inv(at, at + 0.55, t));
    if (k <= 0) continue;
    const flash = decay(t, at, 3.2) * (t > at ? 1 : 0);
    const g = panels[L.i].getContext("2d");
    frame(g, L.i, t - at, flash);
    const z = L.cz + (1 - k) * 1600;
    const cos = Math.cos(L.phi);
    const sin = Math.sin(L.phi);
    const hw = 270;
    const hh = 178;
    const q = [
      cam.project(L.cx - hw * cos, L.cy + hh, z - hw * sin),
      cam.project(L.cx + hw * cos, L.cy + hh, z + hw * sin),
      cam.project(L.cx + hw * cos, L.cy - hh, z + hw * sin),
      cam.project(L.cx - hw * cos, L.cy - hh, z - hw * sin),
    ];
    if (q.some((p) => !p)) continue;
    // Soft shadow glow under each panel.
    const c = q.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    blob(ctx, c[0], c[1], 420 * q[0][3], L.i === 3 ? C.violet : C.long, 0.1 * k + flash * 0.25);
    ctx.restore();
    drawQuad(ctx, panels[L.i], q, { strips: 28, alpha: clamp(k * 1.4) });
  }

  // Headline.
  const hp = t - (t0 + 0.05);
  const hy = 220;
  headline(ctx, ["READ", "THE", "FLOW."], 960, hy, { size: 132, p: hp, out: bar(11.65) - t, track: 6, accent: 2, accentColor: C.long, stagger: 0.07 });
  subline(ctx, "讀懂訂單流。", 960, hy + 62, { size: 34, p: hp, out: bar(11.65) - t, track: 14, color: C.ink, weight: 600 });

  Object.assign(look, {
    bloom: 0.85,
    threshold: 0.66,
    vignette: 0.6,
    grain: 0.04,
    ca: 0.0016 + dive * 0.01 + settle * 0.008,
    zoomBlur: settle * 0.9 + dive * 1.1,
    zoomCenter: [0.5, 0.45],
    flash: dive ** 8 * 0.35,
    flashColor: [0.85, 0.9, 1],
    glitch: decay(t, bar(11), 9) * 0.7,
  });
}
