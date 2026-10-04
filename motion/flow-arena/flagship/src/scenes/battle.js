// Bars 12–24: one continuous chart. Push the market, hit a hidden iceberg, freeze into PLAN, reveal
// the real liquidations, EXECUTE, and ride a five-level cascade into slow motion and the cash-out.
// Everything that moves with the market runs on the game clock, so PLAN freezes sparks mid-air and
// the slow-motion slows them, exactly as the game's time scale does.

import { BATTLE, BEAT, LEVELS, WAVES, bar } from "../cues.js";
import { BP, EVENTS, HISTORY, POSITION, WAVE_DATA, bookSize, candle, price, tau } from "../world.js";
import {
  C, F, TAU, blob, clamp, decay, ease, env, fmt, glass, headline, inv, label, lerp, measure, mix, money, noise1, rgba, ring, rnd, rr, roundRect, sparks, subline, text,
} from "../lib.js";

export const ZH =
  "你的資金大到能推動市場人群會反擊撞牆！有人在吸收應推到實際市場暫停換你思考揭曉他們藏起來的底牌計畫中執行回合待送出市價買入多單均價未實現距強平總損益遊戲時間剩你引爆的強平連環強平爆倉波數點燃了落袋平倉空單燃料止損觸價進場盤勢低波盤整隱藏情緒偏空冰山被吃光撞穿";

const T = bar;
const fxOf = (g) => T(12) + (g - HISTORY) * BEAT; // game clock → seconds for particle physics
const FX = {
  push1: fxOf(EVENTS.push1),
  wall: fxOf(EVENTS.wall),
  exec: fxOf(EVENTS.exec),
  waves: EVENTS.waves.map(fxOf),
};

// Fuel on the chart: what the third-party heatmap shows (estimate) and what the reveal shows (truth).
const HEAT_BANDS = [
  { p: 103470, w: 46, h: 0.72 },
  { p: 103790, w: 70, h: 1.0 },
  { p: 104360, w: 52, h: 0.66 },
  { p: 105080, w: 64, h: 0.82 },
  { p: 105760, w: 44, h: 0.6 },
  { p: 102260, w: 40, h: 0.5 },
  { p: 101890, w: 56, h: 0.72 },
];
const TRUTH = [
  { p: 103520, size: 680, zh: "止損", en: "STOPS" },
  { p: 103790, size: 2140, zh: "空單強平", en: "SHORT LIQ" },
  { p: 104360, size: 420, zh: "空單強平", en: "SHORT LIQ" },
  { p: 105080, size: 1380, zh: "空單強平", en: "SHORT LIQ" },
  { p: 102240, size: 940, zh: "多單強平", en: "LONG LIQ" },
];

// ---------- View ----------

function view(t) {
  const g = tau(t);
  const p = price(g);
  // Camera price centre and scale per phase.
  const plan = ease.inOut3(inv(T(16), T(16.6), t)) * (1 - ease.inOut3(inv(T(17.8), T(18.1), t)));
  const casc = ease.inOut3(inv(T(18), T(19), t));
  const slow = ease.inOut3(inv(T(22), T(22.6), t));
  let k = lerp(0.5, 0.34, plan);
  k = lerp(k, 0.36, casc);
  k = lerp(k, 0.5, slow);
  // Smoothed follow of the price (average over the last candle) keeps the camera from jittering.
  let avg = 0;
  for (let i = 0; i < 6; i++) avg += price(g - i * 0.15);
  avg /= 6;
  let pc = lerp(103120 + (avg - 102800) * 0.4, 103800, plan);
  pc = lerp(pc, avg + 380, casc);
  pc = lerp(pc, avg + 80, slow);
  const zoom = 1 + 0.06 * slow + 0.03 * ease.out3(inv(T(12), T(12.6), t)) * (1 - casc);
  return { g, p, k, pc, cy: 600, xNow: 1340, sp: 23, zoom, plan, casc, slow };
}
const Y = (v, price) => v.cy - (price - v.pc) * v.k;

// Shake: trauma from each impact, squared, rolled through smooth noise.
function trauma(t) {
  let tr = 0;
  const hit = (at, amp, rate = 4) => {
    if (t >= at) tr += amp * Math.exp(-(t - at) * rate);
  };
  hit(T(BATTLE.push1Click), 0.55);
  hit(T(BATTLE.wallClick) + 0.12, 0.85, 3);
  hit(T(BATTLE.resume), 0.7);
  WAVES.forEach((w, i) => hit(T(w), 0.18 + (i / WAVES.length) * 0.5, 5));
  hit(T(21.25), 0.6, 2);
  if (t > T(BATTLE.freeze) && t < T(BATTLE.resume)) tr *= 0.05;
  return Math.min(1, tr);
}

// ---------- Drawing helpers ----------

function backdrop(ctx, t, v) {
  const bg = ctx.createLinearGradient(0, 0, 0, 1080);
  bg.addColorStop(0, "#060b12");
  bg.addColorStop(1, "#04070b");
  ctx.fillStyle = bg;
  ctx.fillRect(-200, -200, 2320, 1480);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  blob(ctx, 500, 120, 900, C.long, 0.07);
  blob(ctx, 1500, 1000, 900, C.violet, 0.08);
  ctx.strokeStyle = "rgba(140,178,214,0.035)";
  ctx.lineWidth = 1;
  for (let x = 0; x < 1920; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, -200);
    ctx.lineTo(x, 1280);
    ctx.stroke();
  }
  const off = ((v.pc * v.k) % 46 + 46) % 46;
  for (let y = -200 + off; y < 1280; y += 46) {
    ctx.beginPath();
    ctx.moveTo(-200, y);
    ctx.lineTo(2120, y);
    ctx.stroke();
  }
  ctx.restore();
}

function heatBands(ctx, t, v) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const plan = v.plan;
  HEAT_BANDS.forEach((b, i) => {
    // A band burns off once the price trades through it (the heatmap clears crossed levels).
    const crossed = v.p > b.p + b.w * 0.3 && b.p > 103000;
    let burn = 1;
    if (crossed) {
      // Find when it was crossed: first wave whose price passes the band.
      const w = WAVE_DATA.find((wd) => wd.price > b.p);
      const at = w ? fxOf(w.at) : FX.exec;
      const fx = fxOf(v.g);
      burn = Math.exp(-Math.max(0, fx - at) * 3);
    }
    const hk = b.h * burn;
    if (hk < 0.02) return;
    const y = Y(v, b.p);
    const hw = Math.max(5, b.w * v.k * 0.55);
    const col = mix([110, 30, 140], [255, 196, 96], hk);
    const breathe = 0.82 + 0.18 * Math.sin((fxOf(v.g) * TAU) / 1.6 + i);
    const g = ctx.createLinearGradient(0, y - hw * 2, 0, y + hw * 2);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.5, rgba(mix(col, C.white, 0.12 * hk), 0.3 * hk * breathe * (1 - plan * 0.35)));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(60, y - hw * 2, 1460, hw * 4);
    // Fine bins inside the band, like the arena's fixed-size heatmap cells.
    for (let j = -2; j <= 2; j++) {
      const a = (0.5 - Math.abs(j) * 0.15) * hk * breathe;
      ctx.fillStyle = rgba(mix(col, C.white, j === 0 ? 0.35 : 0.1), a * 0.6);
      ctx.fillRect(60, y + j * hw * 0.55 - 0.6, 1460, 1.2);
    }
    if (hk > 0.8) {
      const lx = 60 + ((fxOf(v.g) * 520 + i * 400) % 1460);
      blob(ctx, lx, y, 40, mix(col, C.white, 0.5), 0.45 * hk);
    }
    if (b.p === 103790 && hk > 0.5) {
      label(ctx, "空單燃料 SHORT FUEL", 1500, y - hw * 2 - 6, { size: 13, color: C.fuel, alpha: 0.85 * hk * (1 - plan), track: 2, align: "right" });
    }
    // Burn-off flash.
    if (crossed && burn > 0.05 && burn < 1) {
      ctx.fillStyle = rgba(C.white, 0.5 * burn);
      ctx.fillRect(60, y - 2, 1460, 4);
    }
  });
  ctx.restore();
}

function candles(ctx, t, v) {
  const first = Math.floor(v.g) - 62;
  const xs = (c) => v.xNow - (v.g - c - 0.5) * v.sp;
  // EMAs over the visible + warmup candles.
  const closes = [];
  for (let c = first - 60; c <= Math.floor(v.g); c++) {
    const cd = candle(c, v.g);
    if (cd) closes.push([c, cd.c]);
  }
  const ema = (n) => {
    const a = 2 / (n + 1);
    let e = closes[0][1];
    return closes.map(([c, cl]) => [c, (e = e + a * (cl - e))]);
  };
  for (const [n, col] of [[20, C.fuel], [50, C.violet]]) {
    const pts = ema(n).filter(([c]) => c >= first);
    ctx.beginPath();
    pts.forEach(([c, e], j) => (j ? ctx.lineTo : ctx.moveTo).call(ctx, xs(c), Y(v, e)));
    ctx.strokeStyle = rgba(col, 0.55);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  for (let c = first; c <= Math.floor(v.g); c++) {
    const cd = candle(c, v.g);
    if (!cd) continue;
    const x = xs(c);
    if (x < 40) continue;
    const up = cd.c >= cd.o;
    const col = up ? C.long : C.short;
    const live = c === Math.floor(v.g);
    ctx.fillStyle = rgba(col, live ? 1 : 0.88);
    ctx.fillRect(x - 0.9, Y(v, cd.h), 1.8, Math.max(1, Y(v, cd.l) - Y(v, cd.h)));
    const y0 = Y(v, Math.max(cd.o, cd.c));
    const y1 = Y(v, Math.min(cd.o, cd.c));
    ctx.fillRect(x - 6.5, y0, 13, Math.max(1.5, y1 - y0));
    // Volume.
    const vh = Math.min(90, cd.vol * 0.12);
    ctx.fillStyle = rgba(col, 0.3);
    ctx.fillRect(x - 6.5, 1000 - vh, 13, vh);
    if (live) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      blob(ctx, x, y0, 34, col, 0.25);
      ctx.restore();
    }
  }
}

// Depth ladder on the right, on the chart's own price scale.
function ladder(ctx, t, v) {
  const STEP = 20;
  const x1 = 1890;
  const x0 = 1600;
  glass(ctx, x0 - 16, 140, x1 - x0 + 26, 900, { r: 14, alpha: 0.9, fill: 0.6 });
  label(ctx, "ORDER BOOK", x0, 172, { size: 13, color: C.ink3, track: 3 });
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 16, 190, x1 - x0 + 26, 845);
  ctx.clip();
  const fx = fxOf(v.g);
  const base = Math.round(v.p / STEP) * STEP;
  for (let i = -46; i <= 46; i++) {
    const lp = base + i * STEP;
    const y = Y(v, lp);
    if (y < 180 || y > 1040) continue;
    const ask = lp > v.p;
    let size = bookSize(Math.round(lp / STEP), Math.abs(i), ask ? "ask" : "bid", v.g);
    // Asks swept by the pushes vanish, then the maker re-quotes them.
    if (ask) {
      for (const [at, from, to] of [[FX.push1, BP.start, BP.push1Peak], [FX.exec, BP.wallSettle, BP.execPeak]]) {
        if (lp > from && lp < to) {
          const eatAt = at + ((lp - from) / (to - from)) * 0.25;
          const k = clamp((fx - eatAt) / 0.05) * (1 - clamp((fx - at - 1.2) / 0.6));
          size *= 1 - k;
          if (fx > eatAt && fx < eatAt + 0.25) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = rgba(C.white, 0.6 * (1 - (fx - eatAt) / 0.25));
            ctx.fillRect(x0, y - 4, x1 - x0, 8);
            ctx.restore();
          }
        }
      }
    }
    const w = Math.min(x1 - x0 - 72, size * 1.25);
    const col = ask ? C.short : C.long;
    ctx.fillStyle = rgba(col, 0.28);
    ctx.fillRect(x1 - w, y - 4.5, w, 9);
    ctx.fillStyle = rgba(col, 0.75);
    ctx.fillRect(x1 - w, y - 4.5, 2, 9);
    if (Math.abs(i) % 2 === 0) text(ctx, fmt(lp), x0, y + 4, { font: F.mono(500, 11), color: ask ? C.shortInk : C.longInk, alpha: 0.7 });
  }
  // The iceberg at the wall price.
  const ice = env(t, T(BATTLE.wallClick) - 0.05, T(BATTLE.resume) + 0.2, 0.05, 0.25);
  if (ice > 0.01) {
    const y = Y(v, BP.wallActual);
    const pulse = 0.6 + 0.4 * Math.sin(t * 14);
    ctx.strokeStyle = rgba(C.violet, ice * pulse);
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(x0 - 6, y - 9, x1 - x0 + 8, 18);
    ctx.setLineDash([]);
    label(ctx, "ICEBERG", x0 + 90, y + 4, { size: 11, color: C.violet, alpha: ice });
  }
  ctx.restore();
}

function priceTag(ctx, t, v) {
  const y = Y(v, v.p);
  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = rgba(C.long, 0.5);
  ctx.beginPath();
  ctx.moveTo(60, y);
  ctx.lineTo(1520, y);
  ctx.stroke();
  ctx.setLineDash([]);
  roundRect(ctx, 1450, y - 17, 136, 34, 7);
  ctx.fillStyle = rgba(C.long, 0.95);
  ctx.fill();
  text(ctx, fmt(v.p, 1), 1518, y + 7, { font: F.mono(700, 19), color: [3, 32, 24], align: "center" });
  ctx.restore();
}

// ---------- HUD ----------

function pnlAt(t, v) {
  const fx = fxOf(v.g);
  const p = v.p;
  let pos = 0;
  let avg = 0;
  if (fx > FX.push1 + 0.2) [pos, avg] = [1250, 102950];
  if (fx > FX.wall + 0.15) [pos, avg] = [2500, 103045];
  if (fx > FX.exec + 0.25) [pos, avg] = [POSITION.size, POSITION.avg];
  const closed = t > T(BATTLE.cash);
  const unreal = pos * (p - avg);
  const fees = pos * avg * 0.0005;
  if (closed) return { pos: 0, avg, unreal: 0, total: POSITION.realized - 781600, closed };
  return { pos, avg, unreal, total: unreal - fees, closed };
}

function ignitedAt(v) {
  let n = 0;
  let sum = 0;
  for (const w of WAVE_DATA) {
    if (v.g > w.at) {
      n++;
      sum += w.size;
    }
  }
  return { n, sum, mine: sum * 0.61 };
}

function scoreboard(ctx, t, v) {
  const a = ease.out3(inv(T(12), T(12) + 0.4, t));
  const y = 34;
  glass(ctx, 40, y, 1840, 82, { r: 16, alpha: a, fill: 0.72 });
  ctx.save();
  ctx.globalAlpha = a;
  // Turn ring.
  const execA = [T(12), T(BATTLE.freeze)];
  const execB = [T(BATTLE.resume), T(24)];
  const inPlan = t >= T(BATTLE.freeze) && t < T(BATTLE.resume);
  const turn = t < T(BATTLE.freeze) ? 7 : 8;
  const prog = inPlan ? 0 : t < T(BATTLE.freeze) ? inv(execA[0], execA[1], t) : inv(execB[0], execB[1], t);
  ctx.lineWidth = 4;
  ctx.strokeStyle = rgba(C.line, 0.2);
  ctx.beginPath();
  ctx.arc(92, y + 41, 22, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba(inPlan ? C.fuel : C.long);
  ctx.beginPath();
  ctx.arc(92, y + 41, 22, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.001, prog));
  ctx.stroke();
  label(ctx, "TURN", 130, y + 32, { size: 11, color: C.ink3 });
  text(ctx, String(turn).padStart(2, "0"), 130, y + 64, { font: F.mono(700, 28), color: C.ink });
  // Clock.
  const mins = 9 * 60 + 5 + Math.floor(v.g - HISTORY);
  label(ctx, "遊戲時間", 230, y + 32, { size: 11, color: C.ink3, track: 1 });
  text(ctx, `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`, 230, y + 64, { font: F.mono(600, 26), color: C.ink });
  // PnL.
  const pnl = pnlAt(t, v);
  label(ctx, "總損益 USDT", 400, y + 32, { size: 11, color: C.ink3, track: 1 });
  text(ctx, money(Math.round(pnl.total)), 400, y + 66, { font: F.mono(700, 30), color: pnl.total >= 0 ? C.longInk : C.shortInk });
  // Ignited.
  const ig = ignitedAt(v);
  label(ctx, "你引爆的強平", 760, y + 32, { size: 11, color: C.ink3, track: 1 });
  text(ctx, `${fmt(ig.mine, 1)} BTC`, 760, y + 66, { font: F.mono(700, 30), color: ig.mine > 0 ? C.fuel : C.ink2 });
  // Status pill.
  const sx = 1170;
  roundRect(ctx, sx, y + 24, 132, 34, 17);
  ctx.fillStyle = rgba(inPlan ? C.fuel : C.long, 0.12);
  ctx.fill();
  ctx.strokeStyle = rgba(inPlan ? C.fuel : C.long, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  blob(ctx, sx + 20, y + 41, 10, inPlan ? C.fuel : C.long, 1, 1);
  text(ctx, inPlan ? "計畫中 PLAN" : "執行中 LIVE", sx + 34, y + 47, { font: F.zh(700, 15), color: inPlan ? C.gold : C.longInk });
  // Speed chips.
  const speed = t >= T(BATTLE.resume) ? 2 : 0;
  ["1×", "2×", "4×"].forEach((s, i) => {
    const x = 1322 + i * 48;
    if (i === speed) {
      roundRect(ctx, x, y + 25, 42, 32, 8);
      ctx.fillStyle = rgba(C.line, 0.16);
      ctx.fill();
    }
    text(ctx, s, x + 21, y + 47, { font: F.mono(600, 15), color: i === speed ? C.ink : C.ink3, align: "center" });
  });
  // Reveal button.
  const rv = env(t, T(BATTLE.reveal), T(BATTLE.resume), 0.05, 0.2);
  roundRect(ctx, 1480, y + 22, 120, 38, 10);
  ctx.fillStyle = rgba(C.violet, 0.08 + rv * 0.25);
  ctx.fill();
  ctx.strokeStyle = rgba(C.violet, 0.3 + rv * 0.6);
  ctx.stroke();
  text(ctx, "揭曉  R", 1540, y + 48, { font: F.zh(700, 16), color: rv > 0.2 ? C.white : C.ink2, align: "center" });
  // Execute button: gold, pressed on the cue.
  const press = Math.exp(-Math.max(0, t - T(BATTLE.execute)) * 9) * (t > T(BATTLE.execute) ? 1 : 0);
  const ready = env(t, T(BATTLE.queue), T(BATTLE.resume) + 0.3, 0.2, 0.3);
  const bs = 1 - press * 0.08;
  ctx.save();
  ctx.translate(1740, y + 41);
  ctx.scale(bs, bs);
  roundRect(ctx, -124, -27, 248, 54, 12);
  const gg = ctx.createLinearGradient(0, -27, 0, 27);
  gg.addColorStop(0, rgba(C.gold));
  gg.addColorStop(1, rgba(C.fuel));
  ctx.fillStyle = gg;
  ctx.globalAlpha = a * (0.75 + 0.25 * ready);
  ctx.fill();
  ctx.globalAlpha = a;
  text(ctx, "▶  執行回合 EXECUTE", 0, 7, { font: F.zh(800, 19), color: [40, 22, 0], align: "center" });
  ctx.restore();
  if (ready > 0.05 || press > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    blob(ctx, 1740, y + 41, 200 + press * 260, C.gold, 0.18 * ready + press * 0.8);
    ctx.restore();
    ring(ctx, t, T(BATTLE.execute), 1740, y + 41, { r1: 520, dur: 0.6, color: C.gold, width: 3 });
  }
  ctx.restore();
}

function positionCard(ctx, t, v) {
  const pnl = pnlAt(t, v);
  const a = ease.out3(inv(T(BATTLE.push1Click) + 0.15, T(BATTLE.push1Click) + 0.5, t)) * (1 - ease.in3(inv(T(BATTLE.cash) + 0.6, T(BATTLE.cash) + 1.0, t)));
  if (a <= 0.01) return;
  const x = 100;
  const y = 846;
  glass(ctx, x, y, 470, 122, { r: 14, alpha: a, fill: 0.8 });
  ctx.save();
  ctx.globalAlpha = a;
  const pos = pnl.closed ? POSITION.size : pnl.pos;
  roundRect(ctx, x + 20, y + 18, 70, 26, 6);
  ctx.fillStyle = rgba(C.long, 0.18);
  ctx.fill();
  text(ctx, "多單", x + 55, y + 37, { font: F.zh(800, 15), color: C.longInk, align: "center" });
  text(ctx, `${fmt(pos)} BTC`, x + 104, y + 39, { font: F.mono(700, 22), color: C.ink });
  label(ctx, `均價 ${fmt(pnl.avg, 1)} · ${POSITION.lev}×`, x + 290, y + 37, { size: 13, color: C.ink2, track: 1 });
  label(ctx, pnl.closed ? "平倉 CLOSED" : "未實現", x + 20, y + 74, { size: 12, color: C.ink3, track: 1 });
  text(ctx, pnl.closed ? "100%" : money(Math.round(pnl.unreal)), x + 20, y + 104, { font: F.mono(700, 26), color: pnl.unreal >= 0 ? C.longInk : C.shortInk });
  // Distance to liquidation: full while far away.
  label(ctx, "距強平", x + 280, y + 74, { size: 12, color: C.ink3, track: 1 });
  roundRect(ctx, x + 280, y + 88, 170, 10, 5);
  ctx.fillStyle = rgba(C.line, 0.15);
  ctx.fill();
  roundRect(ctx, x + 280, y + 88, 170, 10, 5);
  ctx.fillStyle = rgba(C.long, 0.85);
  ctx.fill();
  ctx.restore();
}

function tape(ctx, t, v) {
  const a = env(t, T(BATTLE.resume) + 0.1, T(BATTLE.slowmo) + 0.6, 0.3, 0.4);
  if (a <= 0.01) return;
  const x = 100;
  const y = 300;
  glass(ctx, x, y, 420, 470, { r: 14, alpha: a, fill: 0.78 });
  ctx.save();
  ctx.globalAlpha = a;
  label(ctx, "LIQUIDATIONS", x + 22, y + 34, { size: 13, color: C.ink3, track: 3 });
  blob(ctx, x + 330, y + 29, 8, C.long, 1, 1);
  label(ctx, "LIVE", x + 344, y + 34, { size: 12, color: C.longInk, track: 2 });
  ctx.beginPath();
  ctx.rect(x, y + 50, 420, 410);
  ctx.clip();
  const fx = fxOf(v.g);
  const done = WAVE_DATA.filter((w) => v.g > w.at);
  const rows = done.slice(-11).reverse();
  rows.forEach((w, j) => {
    const age = fx - fxOf(w.at);
    const slide = ease.outExpo(clamp(age / 0.3));
    const ry = y + 86 + j * 36 + (j === 0 ? (1 - slide) * -30 : 0);
    const flash = Math.exp(-age * 6);
    if (flash > 0.02) {
      ctx.fillStyle = rgba(C.long, 0.25 * flash);
      ctx.fillRect(x + 8, ry - 24, 404, 34);
    }
    ctx.fillStyle = rgba(C.long, 0.9);
    ctx.fillRect(x + 22, ry - 16, 3, 20);
    text(ctx, "空單強平", x + 36, ry, { font: F.zh(700, 15), color: C.longInk, alpha: j === 0 ? slide : 1 });
    text(ctx, `${fmt(w.size, 1)} BTC`, x + 130, ry, { font: F.mono(700, 16), color: C.ink, alpha: j === 0 ? slide : 1 });
    text(ctx, `@${fmt(w.price)}`, x + 400, ry, { font: F.mono(500, 15), color: C.ink2, align: "right", alpha: j === 0 ? slide : 1 });
  });
  ctx.restore();
}

function counter(ctx, t, v) {
  const ig = ignitedAt(v);
  const a = env(t, T(BATTLE.resume) + 0.05, T(BATTLE.slowmo) + 0.8, 0.2, 0.5);
  if (a <= 0.01 || ig.n === 0) return;
  let level = 1;
  for (const l of LEVELS) if (t >= T(l.at)) level = l.level;
  const jitter = level >= 4 ? noise1(t * 40, 3) * (level - 3) * 2.5 : 0;
  const cx = 960 + jitter;
  const y = 150;
  glass(ctx, cx - 330, y, 660, 92, { r: 16, alpha: a, fill: 0.8, tint: C.long, edge: 0.4 });
  ctx.save();
  ctx.globalAlpha = a;
  roundRect(ctx, cx - 312, y + 22, 76, 48, 10);
  ctx.fillStyle = rgba(mix(C.long, C.gold, (level - 1) / 4), 0.2);
  ctx.fill();
  label(ctx, "LV", cx - 300, y + 42, { size: 11, color: C.ink3 });
  text(ctx, String(level), cx - 274, y + 64, { font: F.mono(800, 30), color: mix(C.long, C.gold, (level - 1) / 4) });
  label(ctx, "連環強平 · 波數", cx - 214, y + 38, { size: 12, color: C.ink3, track: 1 });
  text(ctx, `×${ig.n}`, cx - 214, y + 76, { font: F.mono(800, 32), color: C.ink });
  label(ctx, "燒掉", cx - 90, y + 38, { size: 12, color: C.ink3, track: 1 });
  text(ctx, `${fmt(ig.sum)} BTC`, cx - 90, y + 76, { font: F.mono(800, 32), color: C.longInk });
  const pct = ((v.p - BP.wallSettle) / BP.wallSettle) * 100;
  label(ctx, "價格", cx + 150, y + 38, { size: 12, color: C.ink3, track: 1 });
  text(ctx, `+${pct.toFixed(2)}%`, cx + 150, y + 76, { font: F.mono(800, 32), color: C.gold });
  ctx.restore();
  // "You ignited…" under the counter.
  const ya = a * ease.out3(inv(T(18.25), T(18.6), t));
  if (ya > 0.01) {
    text(ctx, `你點燃了 ${fmt(ig.mine)} BTC`, 960, y + 134, { font: F.zh(800, 26), color: C.fuel, align: "center", alpha: ya, track: 3 });
  }
}

// Cascade banners, queued so only one is up at a time.
function banners(ctx, t) {
  for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i];
    const a0 = T(L.at);
    const a1 = i + 1 < LEVELS.length ? T(LEVELS[i + 1].at) : T(BATTLE.slowmo) + 0.2;
    if (t < a0 || t > a1 + 0.3) continue;
    const p = t - a0;
    const out = clamp((t - a1 + 0.25) / 0.3);
    const punch = 1 + 0.35 * Math.exp(-p * 9) - out * 0.1;
    const a = clamp(p / 0.06) * (1 - out);
    const zh = /[一-鿿]/.test(L.label);
    const size = zh ? 118 : L.level === 5 ? 150 : 136;
    const font = zh ? F.zh(900, size) : F.display(700, size);
    const col = L.level === 5 ? C.white : L.level === 4 ? C.gold : C.longInk;
    ctx.save();
    ctx.translate(960, 560);
    ctx.scale(punch, punch);
    // Light bar behind.
    ctx.globalCompositeOperation = "lighter";
    const bw = measure(ctx, L.label, font, zh ? 8 : 10) + 220;
    const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    const bc = L.level === 5 ? C.short : C.long;
    g.addColorStop(0, rgba(bc, 0));
    g.addColorStop(0.5, rgba(bc, 0.35 * a));
    g.addColorStop(1, rgba(bc, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-bw / 2, -size * 0.62, bw, size * 0.9);
    ctx.globalCompositeOperation = "source-over";
    // Chromatic split on the way in.
    const split = 14 * Math.exp(-p * 7) + (L.level === 5 ? 4 + 4 * Math.abs(noise1(t * 30, 9)) : 0);
    ctx.globalCompositeOperation = "lighter";
    text(ctx, L.label, -split, 0, { font, color: [255, 40, 80], alpha: a * 0.7, align: "center", base: "middle", track: zh ? 8 : 10 });
    text(ctx, L.label, split, 0, { font, color: [40, 200, 255], alpha: a * 0.7, align: "center", base: "middle", track: zh ? 8 : 10 });
    ctx.globalCompositeOperation = "source-over";
    text(ctx, L.label, 0, 0, { font, color: col, alpha: a, align: "center", base: "middle", track: zh ? 8 : 10 });
    if (L.en) label(ctx, L.en, 0, size * 0.62, { size: 20, color: C.ink, alpha: a * 0.85, align: "center", track: 10 });
    ctx.restore();
  }
}

// ---------- Main ----------

export function draw(ctx, t, lt, look) {
  const v = view(t);
  const fx = fxOf(v.g);
  const tr = trauma(t);
  const sx = noise1(t * 22, 1) * tr * tr * 46;
  const sy = noise1(t * 22, 2) * tr * tr * 34;
  const rot = noise1(t * 14, 3) * tr * tr * 0.012;

  // Opening settle from the READ dive.
  const settle = 1 - ease.out4(clamp(lt / 0.45));

  ctx.save();
  ctx.translate(960 + sx, 540 + sy);
  ctx.rotate(rot);
  ctx.scale(v.zoom * (1 + settle * 0.25), v.zoom * (1 + settle * 0.25));
  ctx.translate(-960, -540);
  backdrop(ctx, t, v);
  heatBands(ctx, t, v);

  // Reveal: the truth, in violet, behind the candles.
  const rv = env(t, T(BATTLE.reveal), T(BATTLE.resume) + 0.4, 0.5, 0.4);
  if (rv > 0.01) {
    const scan = inv(T(BATTLE.reveal), T(BATTLE.reveal) + 0.55, t);
    const sy2 = lerp(120, 1060, ease.inOut3(scan));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 1920, sy2);
    ctx.clip();
    ctx.fillStyle = rgba(C.violet, 0.06 * rv);
    ctx.fillRect(60, 120, 1460, 940);
    TRUTH.forEach((b, i) => {
      const y = Y(v, b.p);
      const w = b.size * 0.24 * ease.outExpo(clamp((t - T(BATTLE.reveal) - 0.15 - i * 0.05) / 0.5));
      const g = ctx.createLinearGradient(1520 - w, 0, 1520, 0);
      g.addColorStop(0, rgba(C.violet, 0.1 * rv));
      g.addColorStop(1, rgba(C.violet, 0.75 * rv));
      ctx.fillStyle = g;
      ctx.fillRect(1520 - w, y - 9, w, 18);
      ctx.fillStyle = rgba(mix(C.violet, C.white, 0.5), rv);
      ctx.fillRect(1520 - w, y - 9, 2, 18);
      text(ctx, `${b.zh} ${b.en}`, 1510 - w - 14, y - 2, { font: F.zh(700, 15), color: C.violet, alpha: rv, align: "right" });
      text(ctx, `${fmt(b.size)} BTC`, 1510 - w - 14, y + 18, { font: F.mono(700, 15), color: C.ink, alpha: rv, align: "right" });
    });
    ctx.restore();
    if (scan > 0 && scan < 1) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(0, sy2 - 60, 0, sy2 + 4);
      g.addColorStop(0, rgba(C.violet, 0));
      g.addColorStop(1, rgba(C.violet, 0.5));
      ctx.fillStyle = g;
      ctx.fillRect(0, sy2 - 60, 1920, 64);
      ctx.fillStyle = rgba(mix(C.violet, C.white, 0.6), 0.9);
      ctx.fillRect(0, sy2 - 1.5, 1920, 3);
      ctx.restore();
    }
  }

  candles(ctx, t, v);

  // Push beams: a sweep from where the price was to where the order took it.
  const xh = v.xNow;
  // `filmAt` gates on film time too: PLAN freezes the game clock exactly at EXECUTE, so anything
  // keyed to that instant would otherwise sit at age 0 through the whole freeze.
  const beam = (at, filmAt, from, to, col, seed) => {
    const age = fx - at;
    if (t < filmAt || age < 0 || age > 1.4) return;
    const k = ease.out4(clamp(age / 0.22));
    const y0 = Y(v, from);
    const y1 = Y(v, lerp(from, to, k));
    const fade = Math.exp(-Math.max(0, age - 0.2) * 3);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(1, rgba(mix(col, C.white, 0.4), 0.9 * fade));
    ctx.fillStyle = g;
    ctx.fillRect(xh - 9, y1, 18, y0 - y1);
    ctx.fillRect(xh - 2, y1, 4, y0 - y1);
    blob(ctx, xh, y1, 160 * fade + 40, col, fade);
    ctx.restore();
    ring(ctx, fx, at + 0.2, xh, Y(v, to), { r1: 340, dur: 0.6, color: col, width: 3 });
    sparks(ctx, fx, at + 0.2, xh, Y(v, to), { n: 70, seed, speed: 900, angle: -Math.PI / 2, arc: 2.2, g: 1300, life: 1.1, color: col, size: 2.2 });
  };
  beam(FX.push1, T(BATTLE.push1Click), BP.start, BP.push1Peak, C.long, 11);
  beam(FX.wall, T(BATTLE.wallClick), BP.chase, BP.wallActual, C.long, 12);
  beam(FX.exec, T(BATTLE.resume), BP.wallSettle, BP.execPeak, C.gold, 13);

  // Push 1 impact readout.
  const p1 = fx - FX.push1;
  if (p1 > 0.1 && p1 < 3.2) {
    const a = clamp((p1 - 0.1) / 0.15) * (1 - clamp((p1 - 2.6) / 0.6));
    const y = Y(v, BP.push1Peak) - 40;
    text(ctx, `+$${fmt(BP.push1Peak - BP.start)}  ·  +${(((BP.push1Peak - BP.start) / BP.start) * 100).toFixed(2)}%`, xh - 34, y, { font: F.mono(800, 34), color: C.longInk, alpha: a, align: "right" });
    label(ctx, "1,250 BTC 推價 · PUSH", xh - 34, y + 28, { size: 14, color: C.ink2, alpha: a, track: 2, align: "right" });
  }

  // The wall: expected vs actual, shards that freeze mid-air in PLAN.
  const wa = fx - FX.wall;
  if (wa > 0) {
    const a = clamp(wa / 0.12) * (1 - inv(T(BATTLE.resume) + 0.1, T(BATTLE.resume) + 0.5, t));
    const ye = Y(v, BP.wallExpected);
    const ya = Y(v, BP.wallActual);
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = rgba(C.ink2, 0.75 * a);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xh - 340, ye);
    ctx.lineTo(xh + 40, ye);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    label(ctx, `應推到 EXPECTED ${fmt(BP.wallExpected)}`, xh - 340, ye - 12, { size: 15, color: C.ink2, alpha: a, track: 1 });
    // Wall slab.
    const slab = 1 - clamp((wa - 0.12) / 0.08);
    if (slab > 0) {
      ctx.fillStyle = rgba(C.violet, 0.8 * slab);
      ctx.fillRect(xh - 90, ya - 26, 180, 10);
    }
    // Shards.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 46; i++) {
      const age = wa - 0.12;
      if (age < 0) break;
      const dir = -Math.PI / 2 + (rnd(i, 401) - 0.5) * 2.6;
      const vel = rr(i, 402, 200, 900);
      const k = 2.2;
      const e = Math.exp(-k * age);
      const d = (1 - e) / k;
      const px = xh + rr(i, 403, -80, 80) + Math.cos(dir) * vel * d;
      const py = ya - 20 + Math.sin(dir) * vel * d + (700 / k) * (age - d);
      const life = rr(i, 404, 1.2, 2.4);
      const al = (1 - clamp(age / life)) * a;
      if (al <= 0.01) continue;
      const sz = rr(i, 405, 5, 16);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(age * rr(i, 406, -8, 8));
      ctx.fillStyle = rgba(mix(C.violet, C.white, 0.35), al * 0.85);
      ctx.beginPath();
      ctx.moveTo(-sz, -sz * 0.3);
      ctx.lineTo(sz * 0.6, -sz * 0.5);
      ctx.lineTo(sz * 0.2, sz * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    ring(ctx, fx, FX.wall + 0.12, xh, ya - 20, { r1: 260, dur: 0.5, color: C.violet, width: 4 });
    // Callout.
    const ca = clamp((wa - 0.12) / 0.1) * (1 - inv(T(BATTLE.reveal) - 0.2, T(BATTLE.reveal), t));
    if (ca > 0.01) {
      const bx = xh - 520;
      const by = ya + 60;
      glass(ctx, bx, by, 430, 92, { r: 12, alpha: ca, tint: C.violet, edge: 0.5 });
      text(ctx, "撞牆！有人在吸收", bx + 22, by + 40, { font: F.zh(800, 26), color: C.white, alpha: ca });
      label(ctx, `ICEBERG · 實際 ${fmt(BP.wallActual)}`, bx + 22, by + 72, { size: 14, color: C.violet, alpha: ca, track: 2 });
    }
  }

  ladder(ctx, t, v);
  priceTag(ctx, t, v);

  // Cascade waves: beam across the hit price, shockwave and upward sparks per wave.
  WAVE_DATA.forEach((w, i) => {
    const at = fxOf(w.at);
    const age = fx - at;
    if (t < T(WAVES[i]) || age < 0 || age > 1.6) return;
    const y = Y(v, w.price);
    const lvl = i / (WAVE_DATA.length - 1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const fade = Math.exp(-age * 5);
    const g = ctx.createLinearGradient(60, 0, 1520, 0);
    g.addColorStop(0, rgba(C.long, 0));
    g.addColorStop(0.85, rgba(mix(C.long, C.white, 0.4), 0.85 * fade));
    g.addColorStop(1, rgba(C.white, fade));
    ctx.fillStyle = g;
    ctx.fillRect(60, y - 3 - lvl * 3, 1460, 6 + lvl * 6);
    ctx.restore();
    ring(ctx, fx, at, xh, y, { r1: 220 + lvl * 380, dur: 0.7, color: lvl > 0.75 ? C.gold : C.long, width: 3 + lvl * 3 });
    sparks(ctx, fx, at, xh, y, { n: 40 + Math.round(lvl * 90), seed: 900 + i, speed: 700 + lvl * 1100, angle: -Math.PI / 2, arc: 1.9, g: 1100, life: 1.2, color: i % 3 === 0 ? C.gold : C.long, size: 2 + lvl * 1.4 });
  });

  ctx.restore(); // camera

  // HUD (not shaken as hard: a fraction of the camera shake).
  ctx.save();
  ctx.translate(sx * 0.25, sy * 0.25);
  scoreboard(ctx, t, v);
  positionCard(ctx, t, v);
  tape(ctx, t, v);
  counter(ctx, t, v);

  // Order chips.
  const chip = (at, until, str, col) => {
    const a = env(t, at, until, 0.15, 0.25);
    if (a <= 0.01) return;
    const k = ease.outBack(clamp((t - at) / 0.35));
    const w = measure(ctx, str, F.zh(800, 22), 2) + 64;
    const x = 1560 - w;
    const y = 960 + (1 - k) * 40;
    glass(ctx, x, y, w, 56, { r: 12, alpha: a, tint: col, edge: 0.6 });
    blob(ctx, x + 26, y + 28, 9, col, a, 1);
    text(ctx, str, x + 44, y + 36, { font: F.zh(800, 22), color: C.ink, alpha: a, track: 2 });
  };
  chip(T(12.25), T(BATTLE.push1Click) + 0.3, "市價買入 1,250 BTC", C.long);
  chip(T(BATTLE.wallClick) - 0.45, T(BATTLE.wallClick) + 0.3, "市價買入 1,250 BTC", C.long);
  chip(T(BATTLE.queue), T(BATTLE.resume) + 0.2, "待送出 · 市價買入 5,000 BTC · 20×", C.gold);
  chip(T(BATTLE.cash) - 0.35, T(BATTLE.cash) + 0.6, "平倉 100%", C.short);

  banners(ctx, t);

  // Headlines.
  const hl = (from, to, words, zh, accent, accentColor) => {
    if (t < T(from) || t > T(to) + 0.5) return;
    headline(ctx, words, 100, 222, { size: 76, p: t - T(from), out: T(to) - t, track: 3, align: "left", accent, accentColor, stagger: 0.05 });
    subline(ctx, zh, 102, 270, { size: 28, p: t - T(from), out: T(to) - t, align: "left", color: C.ink, weight: 600, track: 4 });
  };
  hl(12, 13.9, ["YOUR", "SIZE", "MOVES", "THE", "MARKET."], "你的資金，大到能推動市場。", 2, C.long);
  hl(14, 15.85, ["THE", "CROWD", "PUSHES", "BACK."], "人群會反擊。", 2, C.violet);
  hl(16, 16.92, ["THE", "MARKET", "WAITS.", "YOU", "THINK."], "市場暫停，換你思考。", 4, C.gold);
  hl(17, 17.95, ["REVEAL", "WHAT", "THEY", "HIDE."], "揭曉他們藏起來的底牌。", 0, C.violet);

  // Cash-out: the realised number lands in the slow motion with a coin burst.
  const cp = t - T(BATTLE.cash);
  if (cp > 0) {
    const a = clamp(cp / 0.08) * (1 - inv(T(23.75), T(24), t));
    const roll = ease.out4(clamp(cp / 0.7));
    const s = 1 + 0.25 * Math.exp(-cp * 8);
    ctx.save();
    ctx.translate(960, 600);
    ctx.scale(s, s);
    const halo = ctx.createRadialGradient(0, -20, 0, 0, -20, 700);
    halo.addColorStop(0, `rgba(4,7,11,${0.7 * a})`);
    halo.addColorStop(1, "rgba(4,7,11,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-900, -500, 1800, 900);
    label(ctx, "落袋 · REALIZED", 0, -110, { size: 24, color: C.gold, alpha: a, align: "center", track: 10 });
    text(ctx, money(Math.round(POSITION.realized * roll / 10) * 10), 0, 30, { font: F.mono(800, 156), color: C.gold, alpha: a, align: "center", track: -2 });
    label(ctx, `7,500 BTC  ·  ${fmt(POSITION.avg, 1)} → ${fmt(BP.exitAvg)}`, 0, 92, { size: 22, color: C.ink2, alpha: a, align: "center", track: 3 });
    ctx.restore();
    // Coins: squashed spinning ellipses, on the slowed clock.
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const age = (fx - fxOf(tau(T(BATTLE.cash)))) * 6 + 0.05;
      const dir = -Math.PI / 2 + (rnd(i, 501) - 0.5) * 2.4;
      const vel = rr(i, 502, 500, 1500);
      const k2 = 0.8;
      const e = Math.exp(-k2 * age);
      const d = (1 - e) / k2;
      const px = 960 + Math.cos(dir) * vel * d;
      const py = 560 + Math.sin(dir) * vel * d + (1600 / k2) * (age - d);
      if (py > 1200) continue;
      const spin = Math.abs(Math.cos(age * rr(i, 503, 6, 14) + i));
      const r = rr(i, 504, 9, 17);
      ctx.fillStyle = rgba(mix(C.gold, C.fuel, spin * 0.5), a);
      ctx.beginPath();
      ctx.ellipse(px, py, r * (0.2 + 0.8 * spin), r, rr(i, 505, -0.5, 0.5), 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(C.white, 0.6 * spin * a);
      ctx.beginPath();
      ctx.ellipse(px - r * 0.2 * spin, py - r * 0.3, r * 0.25 * spin, r * 0.35, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();

  // Edge glow by cascade level; red crisis pulse never happens here (the player is long and safe).
  let level = 0;
  for (const l of LEVELS) if (t >= T(l.at)) level = l.level;
  if (t >= T(BATTLE.resume) && t < T(BATTLE.slowmo) + 0.5) level = Math.max(level, 1);
  else level = 0;
  if (level > 0) {
    const rate = 1 + level * 0.9;
    const pulse = 0.55 + 0.45 * Math.sin(t * TAU * rate);
    const a = (0.12 + level * 0.07) * pulse * (1 - inv(T(BATTLE.slowmo), T(BATTLE.slowmo) + 0.5, t));
    const eg = ctx.createRadialGradient(960, 540, 520, 960, 540, 1150);
    eg.addColorStop(0, rgba(C.long, 0));
    eg.addColorStop(1, rgba(C.long, a));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = eg;
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.restore();
  }

  // Look.
  const inPlan = ease.out3(inv(T(BATTLE.freeze), T(BATTLE.freeze) + 0.25, t)) * (1 - ease.out3(inv(T(BATTLE.resume), T(BATTLE.resume) + 0.15, t)));
  const slow = ease.inOut3(inv(T(BATTLE.slowmo), T(BATTLE.slowmo) + 0.4, t));
  const hb = t > T(BATTLE.slowmo) ? Math.exp(-((t - T(BATTLE.slowmo)) % (BEAT * 2)) * 6) : 0;
  const exit = ease.in3(inv(T(23.5), T(24), t));
  Object.assign(look, {
    bloom: 0.95 + slow * 0.5 + decay(t, T(BATTLE.resume), 4) * 0.8 + (level >= 5 ? 0.4 : 0),
    threshold: 0.62 - slow * 0.08,
    sat: lerp(1.08, 0.22, inPlan) - slow * 0.15,
    tint: inPlan > 0 ? [lerp(1, 0.84, inPlan), lerp(1, 0.93, inPlan), lerp(1, 1.12, inPlan)] : [1, 1, 1],
    vignette: 0.55 + inPlan * 0.3 + slow * 0.25 + hb * 0.25,
    ca: 0.0016 + tr * 0.012 + settle * 0.01 + (level >= 5 ? 0.004 : 0),
    zoomBlur: settle * 0.9 + exit * 1.2,
    zoomCenter: [0.5, 0.45],
    flash: decay(t, T(BATTLE.resume), 8) * 0.28 + decay(t, T(BATTLE.wallClick) + 0.12, 9) * 0.3 + decay(t, T(BATTLE.cash), 5) * 0.35 + exit ** 3 * 0.6,
    flashColor: t > T(BATTLE.cash) ? [1, 0.85, 0.5] : t > T(BATTLE.resume) - 0.1 ? [0.7, 1, 0.85] : [0.75, 0.65, 1],
    glitch: (t > T(21.25) && t < T(BATTLE.slowmo) ? 0.35 + 0.35 * Math.abs(noise1(t * 6, 4)) : 0) + decay(t, T(BATTLE.freeze), 10) * 0.6,
    grain: 0.04 + inPlan * 0.02,
    exposure: 1 - inPlan * 0.08,
  });
}
