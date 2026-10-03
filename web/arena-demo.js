// Homepage attract mode for FLOW ARENA: a scripted 14-second round drawn on canvas. A fuel band
// glows above the price, the player buys into it, a chain of short liquidations rips through, and
// the profit is banked. The price is a pure function of time, so every loop is identical; the
// sparks and coins come from the arena's own effects layer.
import { Fx } from "../public/arena/fx.js";

const LOOP = 14;
const CANDLE = 0.3;
const COUNT = 46;
const BASE = 96420;
const PUSH_AT = 4.2;
const WAVES = [4.72, 4.98, 5.22, 5.45, 5.66, 5.86, 6.05, 6.24, 6.42];
const EXIT_AT = 8.4;
const ENTRY = BASE * 1.0042;
const SIZE = 2500;
const FUEL = BASE * 1.0098;
const LOW = BASE * 0.986;
const HIGH = BASE * 1.033;
const C = { long: "45,226,166", short: "255,79,110", fuel: "255,173,66", gold: "#ffd77a", ink: "#e9f1f8", dim: "#6a7c90" };
const MONO = '"JetBrains Mono Variable", "Noto Sans TC Variable", monospace';
const UI = '"Noto Sans TC Variable", "Microsoft JhengHei", sans-serif';
const DISPLAY = '"Barlow Condensed", "Noto Sans TC Variable", sans-serif';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - (1 - clamp(t)) ** 3;
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const noise = (t) => {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1;
};

function price(t) {
  let p = BASE * (1 + 0.0017 * noise(t * 2.1) + 0.0007 * noise(t * 7.3 + 40));
  p += BASE * 0.0082 * ease((t - PUSH_AT) / 0.35);
  WAVES.forEach((w, i) => (p += BASE * 0.0016 * (1 + i * 0.08) * ease((t - w) / 0.12)));
  p -= BASE * 0.0062 * ease((t - 7.1) / 4.5);
  return p;
}

const wavesBy = (t) => WAVES.filter((w) => w <= t).length;
const money = (v) => `${v >= 0 ? "+" : "−"}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
const BANKED = SIZE * (price(EXIT_AT) - ENTRY);

function heat(t, alpha) {
  const stops = [[38, 22, 84], [110, 38, 150], [205, 52, 120], [255, 128, 56], [255, 236, 168]];
  const x = clamp(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const k = x - i;
  return `rgba(${stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * k)).join(",")},${alpha.toFixed(3)})`;
}

export function mountArenaDemo(canvas, fxCanvas, shakeTarget, { still = false } = {}) {
  const ctx = canvas.getContext("2d");
  const fx = new Fx(fxCanvas, shakeTarget, { reducedMotion: still });
  let width = 0;
  let height = 0;
  let raf = 0;
  let start = 0;
  let lastT = 0;
  let lastNow = 0;
  let isStill = still;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (rect.width === width && rect.height === height) return;
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const layout = () => {
    const left = 14;
    const right = width - 74;
    const top = 44;
    const bottom = height - 26;
    const y = (p) => top + (HIGH - p) / (HIGH - LOW) * (bottom - top);
    const step = (right - left) / (COUNT + 1);
    return { left, right, top, bottom, y, step };
  };

  function candles(t) {
    const now = Math.floor(t / CANDLE);
    const list = [];
    for (let k = now - COUNT + 1; k <= now; k++) {
      const from = k * CANDLE;
      const to = Math.min(t, from + CANDLE);
      const open = price(from);
      let high = open;
      let low = open;
      for (let i = 1; i <= 10; i++) {
        const p = price(from + (to - from) * (i / 10));
        high = Math.max(high, p);
        low = Math.min(low, p);
      }
      list.push({ open, high, low, close: price(to) });
    }
    return list;
  }

  function draw(t, now) {
    resize();
    if (!width) return;
    const L = layout();
    const { left, right, top, bottom, y, step } = L;
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#070c13");
    bg.addColorStop(1, "#04070b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(140,178,214,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const yy = Math.round(top + (bottom - top) * i / 5) + 0.5;
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(right, yy);
      ctx.stroke();
    }

    // Liquidation heat: faint rows everywhere, the fuel band burns out as the chain runs.
    const burned = clamp(wavesBy(t) / WAVES.length);
    for (let i = 0; i < 46; i++) {
      const p = LOW + (HIGH - LOW) * (i + 0.5) / 46;
      let strength = hash(i * 3.7) ** 3 * 0.45;
      if (Math.abs(p / FUEL - 1) < 0.0012) strength = 1 - burned * 0.92;
      if (Math.abs(p / (BASE * 1.024) - 1) < 0.0012) strength = Math.max(strength, 0.6 - burned * 0.3);
      if (Math.abs(p / (BASE * 0.989) - 1) < 0.0012) strength = Math.max(strength, 0.7);
      const rowTop = y(p + (HIGH - LOW) / 92);
      ctx.fillStyle = heat(strength, 0.05 + strength * 0.42);
      ctx.fillRect(left, rowTop, right - left + 60, Math.max(2, y(p - (HIGH - LOW) / 92) - rowTop));
    }
    const breath = 0.5 + 0.5 * Math.sin(now / 260);
    for (const [p, strength] of [[FUEL, 1 - burned], [BASE * 0.989, 0.7]]) {
      if (strength < 0.05) continue;
      const yy = y(p);
      ctx.save();
      ctx.shadowColor = `rgba(255,150,60,${(0.7 * strength * (0.4 + 0.6 * breath)).toFixed(3)})`;
      ctx.shadowBlur = 20 * strength;
      ctx.fillStyle = `rgba(255,214,150,${((0.35 + strength * 0.5) * (0.4 + 0.6 * breath)).toFixed(3)})`;
      ctx.fillRect(left, yy - 1, right - left, 2);
      ctx.restore();
    }

    // Candles.
    const list = candles(t);
    list.forEach((c, i) => {
      const x = left + (i + 1) * step;
      const up = c.close >= c.open;
      ctx.strokeStyle = up ? "#4af2bb" : "#ff7a90";
      ctx.fillStyle = up ? "#1fcf96" : "#f0435f";
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, y(c.high));
      ctx.lineTo(Math.round(x) + 0.5, y(c.low));
      ctx.stroke();
      const bodyTop = Math.min(y(c.open), y(c.close));
      const w = Math.max(2, step * 0.62);
      if (i === list.length - 1) {
        ctx.save();
        ctx.shadowColor = `rgba(${up ? C.long : C.short},0.9)`;
        ctx.shadowBlur = 12;
        ctx.fillRect(x - w / 2, bodyTop, w, Math.max(1.5, Math.abs(y(c.open) - y(c.close))));
        ctx.restore();
      } else ctx.fillRect(x - w / 2, bodyTop, w, Math.max(1.5, Math.abs(y(c.open) - y(c.close))));
    });
    const liveX = left + list.length * step;
    const last = price(t);
    const holding = t >= PUSH_AT && t < EXIT_AT;

    // The position: entry line and a profit zone up to the price.
    if (holding) {
      const ey = y(ENTRY);
      const zone = ctx.createLinearGradient(left, 0, right, 0);
      zone.addColorStop(0, `rgba(${C.long},0)`);
      zone.addColorStop(1, `rgba(${C.long},0.16)`);
      ctx.fillStyle = zone;
      ctx.fillRect(left, Math.min(ey, y(last)), right - left, Math.abs(ey - y(last)));
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = C.gold;
      ctx.beginPath();
      ctx.moveTo(left, ey);
      ctx.lineTo(right, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      pill(`均價 ${Math.round(ENTRY).toLocaleString("en-US")}`, left + 8, ey + 14, C.gold);
    }
    if (burned < 0.6) pill(`🔥 空單燃料 ${Math.round(1240 * (1 - burned)).toLocaleString("en-US")} BTC`, left + (right - left) * 0.3, y(FUEL), `rgb(${C.fuel})`, "rgba(48,20,4,0.9)");

    // Price scale and the live tag.
    ctx.fillStyle = "rgba(5,8,13,0.85)";
    ctx.fillRect(right, top, width - right, bottom - top);
    ctx.font = `500 10px ${MONO}`;
    ctx.fillStyle = C.dim;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (let i = 0; i <= 5; i++) {
      const p = HIGH - (HIGH - LOW) * i / 5;
      ctx.fillText(Math.round(p).toLocaleString("en-US"), right + 8, clamp(y(p), top + 6, bottom - 6));
    }
    const lastCandle = list.at(-1);
    const rgb = lastCandle.close >= lastCandle.open ? C.long : C.short;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = `rgba(${rgb},0.6)`;
    ctx.beginPath();
    ctx.moveTo(left, y(last));
    ctx.lineTo(right, y(last));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.fillRect(right + 2, y(last) - 10, width - right - 4, 20);
    ctx.fillStyle = rgb === C.long ? "#03251a" : "#fff";
    ctx.font = `700 11px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText(Math.round(last).toLocaleString("en-US"), (right + width) / 2, y(last) + 0.5);

    // Caption: what the player is doing right now.
    const steps = [
      [0, "① 讀盤", "清算熱圖上最亮的帶子，是空單的強平燃料"],
      [PUSH_AT, "② 推價", "市價買入 2,500 BTC，把價格推進燃料區"],
      [WAVES[0], "③ 引爆", "空單連環強平，強平單自己把價格往上推"],
      [7.2, "④ 落袋", "連環一停就平倉，別等價格回頭"],
    ];
    const [, stepTitle, stepText] = steps.findLast(([at]) => t >= at);
    ctx.textAlign = "left";
    ctx.font = `800 13px ${UI}`;
    ctx.fillStyle = `rgb(${C.fuel})`;
    ctx.fillText(stepTitle, left + 4, 20);
    const titleWidth = ctx.measureText(stepTitle).width;
    ctx.font = `500 12px ${UI}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(stepText, left + 16 + titleWidth, 20);

    // Floating PnL while holding, then the banked result.
    if (holding) {
      const pnl = SIZE * (last - ENTRY);
      ctx.textAlign = "right";
      ctx.font = `800 ${Math.round(clamp(width / 26, 16, 26))}px ${MONO}`;
      ctx.fillStyle = pnl >= 0 ? `rgb(${C.long})` : `rgb(${C.short})`;
      ctx.fillText(money(pnl), right - 8, top + 18);
      ctx.font = `600 10px ${MONO}`;
      ctx.fillStyle = C.dim;
      ctx.fillText(`多 ${SIZE.toLocaleString("en-US")} BTC · 浮動損益`, right - 8, top + 38);
    }
    const waves = wavesBy(t);
    if (waves >= 2 && t < 7.6) {
      const fade = clamp((7.6 - t) / 0.5);
      ctx.globalAlpha = fade;
      ctx.textAlign = "center";
      ctx.font = `700 ${Math.round(clamp(width / 14, 28, 52))}px ${DISPLAY}`;
      ctx.fillStyle = "#fff";
      ctx.shadowColor = `rgb(${C.long})`;
      ctx.shadowBlur = 18;
      ctx.fillText(`×${waves}`, (left + right) / 2, top + 30);
      ctx.shadowBlur = 0;
      ctx.font = `800 11px ${UI}`;
      ctx.fillStyle = `rgb(${C.long})`;
      ctx.fillText(waves >= 7 ? "MEGA CASCADE" : waves >= 4 ? "連環爆倉！" : "連環強平", (left + right) / 2, top + 4);
      ctx.globalAlpha = 1;
    }
    if (t >= EXIT_AT && t < EXIT_AT + 2.4) {
      const k = (t - EXIT_AT) / 2.4;
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - clamp((k - 0.7) / 0.3);
      ctx.textAlign = "center";
      ctx.font = `800 ${Math.round(clamp(width / 12, 30, 64))}px ${MONO}`;
      const gold = ctx.createLinearGradient(0, height * 0.32, 0, height * 0.46);
      gold.addColorStop(0, "#fff6d6");
      gold.addColorStop(0.5, C.gold);
      gold.addColorStop(1, "#ff9d2e");
      ctx.fillStyle = gold;
      ctx.shadowColor = "rgba(255,173,66,0.9)";
      ctx.shadowBlur = 24;
      ctx.fillText(money(BANKED), (left + right) / 2, height * 0.4 - k * 18);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Fade between loops so the restart reads as a replay, not a jump.
    const edge = Math.min(t / 0.4, (LOOP - t) / 0.6);
    if (edge < 1) {
      ctx.fillStyle = `rgba(4,7,11,${(1 - clamp(edge)).toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }
    return { L, liveX, last };
  }

  function pill(text, x, y, accent, fill = "rgba(7,12,19,0.88)") {
    ctx.font = `600 10px ${MONO}`;
    const w = ctx.measureText(text).width + 16;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y - 9.5, w, 19, 6);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.textAlign = "left";
    ctx.fillText(text, x + 8, y + 0.5);
  }

  // Effects fire when the script clock crosses their moment.
  function cues(from, to, frame) {
    const crossed = (at) => from < at && to >= at;
    const { L, liveX } = frame;
    if (crossed(PUSH_AT)) {
      const yy = L.y(price(PUSH_AT + 0.35));
      fx.beam(liveX, { vertical: true, color: `rgb(${C.long})`, from: L.top, to: L.bottom, thickness: 34, life: 0.6 });
      fx.sparks(liveX, yy, { color: `rgb(${C.long})`, count: 30, speed: 420, angle: -Math.PI / 2, arc: Math.PI * 0.9, gravity: 400 });
      fx.ring(liveX, yy, { color: `rgb(${C.long})`, radius: 120 });
      fx.shake(0.3);
    }
    WAVES.forEach((w, i) => {
      if (!crossed(w)) return;
      const tier = Math.min(5, 1 + Math.floor(i / 2));
      const yy = L.y(price(w + 0.12));
      fx.beam(yy, { color: `rgb(${C.long})`, from: L.left, to: L.right, thickness: 14 + tier * 8, life: 0.7 });
      fx.ring(liveX, yy, { color: `rgb(${C.long})`, radius: 60 + tier * 40 });
      fx.sparks(liveX, yy, { color: `rgb(${C.long})`, count: 10 + tier * 10, speed: 300 + tier * 90, angle: -Math.PI / 2, arc: Math.PI * 1.3, gravity: 500 });
      if (tier >= 3) fx.sparks(liveX, yy, { color: C.gold, count: tier * 6, speed: 480 });
      fx.shake(0.1 + tier * 0.07);
    });
    if (crossed(EXIT_AT)) {
      fx.coins((L.left + L.right) / 2, height * 0.42, { count: 46, speed: 640 });
      fx.glow((L.left + L.right) / 2, height * 0.38, { color: C.gold, radius: width * 0.3, life: 0.8 });
    }
  }

  function loop(now) {
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    lastNow = now;
    const t = ((now - start) / 1000) % LOOP;
    const frame = draw(t, now);
    if (frame && t >= lastT) cues(lastT, t, frame);
    lastT = t;
    fx.frame(dt);
    raf = requestAnimationFrame(loop);
  }

  return {
    play() {
      if (isStill || raf) return;
      start = performance.now() - lastT * 1000;
      lastNow = 0;
      raf = requestAnimationFrame(loop);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
    setStill(on) {
      isStill = on;
      fx.reducedMotion = on;
      if (!on) return;
      this.stop();
      fx.clear();
      draw(6.3, 0);
    },
    // A still frame mid-cascade: the story in one picture.
    poster() {
      draw(6.3, 0);
    },
  };
}
