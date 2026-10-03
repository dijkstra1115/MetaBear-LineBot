// Bars 24–26. A CLOSED MARKET: every account on one ledger. Trades move BTC from row to row as
// tracers; the bars shift, and the net sum stays 0.00 the whole time.

import { bar, BEAT } from "../cues.js";
import { C, F, blob, clamp, decay, ease, fmt, glass, headline, inv, label, lerp, mix, rgba, ring, roundRect, subline, text } from "../lib.js";

export const ZH = "封閉的市場沒有外部資金你買進的每一顆都是場內有人賣給你造市商突破動能支撐壓力均線均值回歸情緒追價雜訊散戶長線承接保險基金歷史對手淨部位帳本守恆未平倉量";

const ACCOUNTS = [
  { zh: "你", en: "YOU", net: 2500, you: true },
  { zh: "造市商", en: "MARKET MAKER", net: -1840 },
  { zh: "突破動能", en: "BREAKOUT", net: 1240 },
  { zh: "支撐壓力", en: "S / R", net: -910 },
  { zh: "ICT／SMC", en: "ICT / SMC", net: -1630 },
  { zh: "均線／MACD", en: "MA / MACD", net: 620 },
  { zh: "均值回歸", en: "MEAN REVERSION", net: -1870 },
  { zh: "情緒追價", en: "FOMO", net: 2310 },
  { zh: "雜訊散戶", en: "NOISE", net: -380 },
  { zh: "長線承接", en: "LONG-TERM BIDS", net: -3060 },
  { zh: "保險基金", en: "INSURANCE FUND", net: 180 },
  { zh: "歷史對手", en: "LEGACY", net: 0 },
];
ACCOUNTS[11].net = -ACCOUNTS.slice(0, 11).reduce((s, a) => s + a.net, 0);

// Trades: seller → buyer, quantity, start bar. Each tracer flies for 0.42 s.
const TRADES = [
  [9, 0, 250], [1, 7, 180], [4, 2, 140], [6, 5, 90], [3, 0, 300], [8, 7, 60],
  [9, 2, 220], [1, 0, 400], [6, 10, 40], [4, 7, 150], [11, 1, 260], [7, 3, 120],
].map(([from, to, q], j) => ({ from, to, q, at: bar(24.5) + j * BEAT * 0.5 }));
const FLY = 0.42;

function nets(t) {
  const n = ACCOUNTS.map((a) => a.net);
  for (const tr of TRADES) {
    const k = ease.inOut3(clamp((t - tr.at - FLY * 0.6) / 0.25));
    n[tr.from] -= tr.q * k;
    n[tr.to] += tr.q * k;
  }
  return n;
}

const X0 = 300;
const X1 = 1620;
const AX = 1090; // zero axis
const ROW = 46;
const Y0 = 318;
const SCALE = 0.13;
const rowY = (i) => Y0 + i * ROW;

export function draw(ctx, t, lt, look) {
  const t0 = bar(24);
  const settle = 1 - ease.out4(clamp(lt / 0.5));
  // Backdrop.
  const bg = ctx.createRadialGradient(960, 560, 0, 960, 560, 1150);
  bg.addColorStop(0, "#0a121d");
  bg.addColorStop(1, "#04070b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  blob(ctx, 960, 560, 900, C.long, 0.05);
  ctx.restore();

  ctx.save();
  ctx.translate(960, 560);
  ctx.scale(1 + settle * 0.12, 1 + settle * 0.12);
  ctx.translate(-960, -560);

  const n = nets(t);
  glass(ctx, X0 - 30, Y0 - 52, X1 - X0 + 60, ROW * 12 + 150, { r: 20, alpha: ease.out3(clamp(lt / 0.3)), fill: 0.7 });
  label(ctx, "ACCOUNT · 帳戶", X0, Y0 - 18, { size: 13, color: C.ink3, track: 3 });
  label(ctx, "SHORT", AX - 20, Y0 - 18, { size: 13, color: C.shortInk, track: 4, align: "right" });
  label(ctx, "LONG", AX + 20, Y0 - 18, { size: 13, color: C.longInk, track: 4 });
  label(ctx, "NET BTC", X1, Y0 - 18, { size: 13, color: C.ink3, track: 3, align: "right" });

  ACCOUNTS.forEach((a, i) => {
    const at = t0 + i * BEAT / 4;
    const k = ease.outExpo(clamp((t - at) / 0.4));
    if (k <= 0) return;
    const y = rowY(i);
    const dx = (1 - k) * -80;
    ctx.save();
    ctx.globalAlpha = clamp(k * 1.5);
    if (a.you) {
      roundRect(ctx, X0 - 14, y - 4, X1 - X0 + 28, ROW - 6, 9);
      ctx.fillStyle = rgba(C.gold, 0.08);
      ctx.fill();
    } else if (i % 2) {
      ctx.fillStyle = "rgba(140,178,214,0.03)";
      ctx.fillRect(X0 - 14, y - 4, X1 - X0 + 28, ROW - 6);
    }
    text(ctx, a.zh, X0 + dx, y + 26, { font: F.zh(700, 21), color: a.you ? C.gold : C.ink });
    label(ctx, a.en, X0 + 150 + dx, y + 25, { size: 12, color: C.ink3, track: 2 });
    const v = n[i];
    const w = Math.abs(v) * SCALE * k;
    const col = a.you ? C.gold : v >= 0 ? C.long : C.short;
    const bx = v >= 0 ? AX : AX - w;
    const g = ctx.createLinearGradient(bx, 0, bx + w, 0);
    g.addColorStop(v >= 0 ? 0 : 1, rgba(col, 0.25));
    g.addColorStop(v >= 0 ? 1 : 0, rgba(col, 0.75));
    ctx.fillStyle = g;
    ctx.fillRect(bx, y + 8, w, ROW - 22);
    ctx.fillStyle = rgba(mix(col, C.white, 0.4), 0.95);
    ctx.fillRect(v >= 0 ? AX + w - 2 : AX - w, y + 8, 2, ROW - 22);
    text(ctx, (v >= 0 ? "+" : "−") + fmt(Math.abs(v)), X1, y + 26, { font: F.mono(700, 19), color: a.you ? C.gold : v >= 0 ? C.longInk : C.shortInk, align: "right" });
    ctx.restore();
  });

  // Zero axis: the ledger's spine.
  const axisA = ease.out3(inv(t0, t0 + 0.6, t));
  const zeroHit = decay(t, bar(25), 3);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = rgba(mix(C.ink, C.gold, zeroHit), 0.35 + 0.5 * zeroHit);
  ctx.fillRect(AX - 1, Y0 - 6, 2, ROW * 12 * axisA);
  ctx.restore();

  // Trade tracers: arcs from the seller's bar to the buyer's.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const tr of TRADES) {
    const k = (t - tr.at) / FLY;
    if (k < 0 || k > 1.3) continue;
    const ya = rowY(tr.from) + ROW / 2 - 4;
    const yb = rowY(tr.to) + ROW / 2 - 4;
    const xa = AX + n[tr.from] * SCALE;
    const xb = AX + n[tr.to] * SCALE;
    const curve = (u) => {
      const x = lerp(xa, xb, u) + Math.sin(u * Math.PI) * (tr.to > tr.from ? 140 : -140);
      return [x, lerp(ya, yb, ease.inOut3(u))];
    };
    const u = ease.inOut3(clamp(k));
    ctx.beginPath();
    for (let s = 0; s <= 16; s++) {
      const uu = Math.max(0, u - 0.35) + (u - Math.max(0, u - 0.35)) * (s / 16);
      const [x, y] = curve(uu);
      s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    const fade = k > 1 ? 1 - (k - 1) / 0.3 : 1;
    const col = ACCOUNTS[tr.to].you ? C.gold : C.info;
    ctx.strokeStyle = rgba(col, 0.7 * fade);
    ctx.lineWidth = 2;
    ctx.stroke();
    const [hx, hy] = curve(u);
    blob(ctx, hx, hy, 18, col, fade, 1);
    if (k >= 1) ring(ctx, t, tr.at + FLY, xb, yb, { r1: 40, dur: 0.3, color: col, width: 2 });
    label(ctx, `${fmt(tr.q)}`, hx + 12, hy - 10, { size: 12, color: col, alpha: fade * (k < 1 ? 1 : 0) });
  }
  ctx.restore();

  // Sum row.
  const sy = Y0 + ROW * 12 + 30;
  const sa = ease.out3(inv(t0 + 0.4, t0 + 0.8, t));
  ctx.fillStyle = rgba(C.line, 0.18 * sa);
  ctx.fillRect(X0 - 14, sy - 18, X1 - X0 + 28, 1);
  text(ctx, "Σ 淨部位 NET", X0, sy + 24, { font: F.zh(800, 22), color: C.ink, alpha: sa });
  const sum = n.reduce((s, v) => s + v, 0);
  const glow = zeroHit;
  text(ctx, `${Math.abs(sum) < 0.005 ? "0.00" : sum.toFixed(2)} BTC`, X1, sy + 30, { font: F.mono(800, 40), color: mix(C.ink, C.gold, 0.4 + glow * 0.6), alpha: sa, align: "right" });
  label(ctx, "帳本守恆 · LEDGER BALANCED", AX, sy + 22, { size: 14, color: C.longInk, alpha: sa * ease.out3(inv(bar(25), bar(25) + 0.3, t)), align: "center", track: 3 });
  if (glow > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    blob(ctx, X1 - 110, sy + 16, 220, C.gold, glow * 0.6);
    ctx.restore();
    ring(ctx, t, bar(25), X1 - 110, sy + 16, { r1: 260, dur: 0.6, color: C.gold, width: 3 });
  }
  ctx.restore();

  // Headlines: the statement, then the consequence.
  const h1 = t - (t0 + 0.02);
  headline(ctx, ["A", "CLOSED", "MARKET."], 960, 170, { size: 96, p: h1, out: bar(24.95) - t, track: 5, accent: 1, accentColor: C.gold });
  subline(ctx, "封閉的市場：沒有外部資金。", 960, 222, { size: 30, p: h1, out: bar(24.95) - t, color: C.ink, weight: 600, track: 8 });
  const h2 = t - bar(25);
  if (h2 > 0) {
    headline(ctx, ["EVERY", "BTC", "YOU", "BUY,", "SOMEONE", "HERE", "SOLD."], 960, 170, { size: 80, p: h2, out: bar(25.92) - t, track: 3, accent: 4, accentColor: C.gold, stagger: 0.04 });
    subline(ctx, "你買進的每一顆 BTC，都是場內有人賣給你的。", 960, 222, { size: 28, p: h2, out: bar(25.92) - t, color: C.ink, weight: 600, track: 4 });
  }

  const exit = ease.in3(inv(bar(25.75), bar(26), t));
  Object.assign(look, {
    bloom: 0.85 + zeroHit * 0.6,
    threshold: 0.66,
    vignette: 0.6,
    grain: 0.04,
    ca: 0.0016 + settle * 0.01 + exit * 0.008,
    zoomBlur: settle * 0.8 + exit * 0.9,
    zoomCenter: [0.5, 0.5],
    flash: decay(t, t0, 8) * 0.5,
    flashColor: [1, 0.85, 0.5],
  });
}
