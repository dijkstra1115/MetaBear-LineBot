// Frame-perfect capture of a real FLOW ARENA session for the trailer.
// The page runs on a virtual clock (timers, rAF, performance.now and CSS animations all advance only
// when we step a frame), so every frame is complete no matter how slow the screenshot is.
// Needs `npm run preview:academy` on :8790 and ffmpeg on PATH (or FFMPEG=).
// Usage: node scripts/capture.mjs [shot] [--fps 60] [--scale 1.5] [--seed 30]
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const SHOT = argv[0] && !argv[0].startsWith("--") ? argv[0] : "main";
const FPS = Number(opt("fps", 60));
const SCALE = Number(opt("scale", 1.5));
const SEED = Number(opt("seed", 30));
const OUT = path.resolve(opt("out", "assets/video"));
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const W = 1920;
const H = 1080;

const SHIM = `(() => {
  let now = 0;
  const epoch = 1790000000000;
  const timers = new Map();
  const rafs = new Map();
  let nextId = 1;
  performance.now = () => now;
  Date.now = () => epoch + now;
  window.setTimeout = (fn, ms = 0, ...a) => { const id = nextId++; timers.set(id, { at: now + Math.max(0, +ms || 0), fn, a }); return id; };
  window.setInterval = (fn, ms = 0, ...a) => { const every = Math.max(1, +ms || 0); const id = nextId++; timers.set(id, { at: now + every, fn, a, every }); return id; };
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  window.requestAnimationFrame = (fn) => { const id = nextId++; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => rafs.delete(id);
  const run = (fn, a) => { try { typeof fn === "function" ? fn(...a) : (0, eval)(fn); } catch (e) { console.error(e); } };
  window.__vt = {
    get now() { return now; },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let id = null, best = null;
        for (const [k, t] of timers) if (t.at <= target && (!best || t.at < best.at)) { id = k; best = t; }
        if (!best) break;
        now = Math.max(now, best.at);
        if (best.every) best.at += best.every; else timers.delete(id);
        run(best.fn, best.a);
      }
      now = target;
      const cbs = [...rafs.values()];
      rafs.clear();
      for (const cb of cbs) run(cb, [now]);
      this.sync(ms);
    },
    // CSS animations and transitions: freeze each one and drive it from the virtual clock.
    sync(step) {
      for (const an of document.getAnimations()) {
        if (an.__t0 == null) {
          an.__t0 = now - Math.min(step, Math.max(0, an.currentTime || 0));
          an.pause();
        }
        an.currentTime = now - an.__t0;
      }
    },
  };
})();`;

// ---------- the director: a list of timed actions per shot ----------
// Every action fires at its virtual time `t` (seconds from the start of recording).
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// Size 5,000, leverage 5x, the side, then execute: the whole order in about three seconds.
const quickPlan = (b, side) => {
  const btn = side === "buy" ? b.buy : b.sell;
  return [
    { t: 0, move: [b.chart.x + b.chart.w * 0.7, b.chart.y + b.chart.h * 0.45], dur: 0 },
    { t: 0.3, move: [b.size[4].cx, b.size[4].cy], dur: 0.5, tag: "hover-size-4" },
    { t: 0.95, click: "size-5000" },
    { t: 1.1, move: [b.lev[2].cx, b.lev[2].cy], dur: 0.3, tag: "hover-lev" },
    { t: 1.5, click: "lev-5" },
    { t: 1.7, move: [btn.cx, btn.cy], dur: 0.35, tag: "hover-" + side },
    { t: 2.15, click: side },
    { t: 2.35, move: [b.run.cx, b.run.cy], dur: 0.45, tag: "hover-run" },
    { t: 2.95, click: "run" },
    { t: 3.2, move: [b.position.cx, b.position.cy + 40], dur: 0.9 },
  ];
};

const SHOTS = {
  // The hero run: read the heatmap, load 5,000 BTC at 5x, buy, execute, ride the cascade, close near the top.
  main: {
    seed: SEED,
    prep: { leverage: 3, speed: 1 },
    // fewer candles on screen so the push draws as fat candles instead of a hairline
    wheel: 8,
    duration: 25,
    plan: (b) => [
      { t: 0, move: [b.chart.x + b.chart.w * 0.86, b.chart.y + b.chart.h * 0.55], dur: 0 },
      { t: 0.2, move: [b.chart.x + b.chart.w * 0.62, b.chart.y + b.chart.h * 0.32], dur: 1.3 },
      { t: 1.6, move: [b.chart.x + b.chart.w * 0.78, b.chart.y + b.chart.h * 0.16], dur: 1.0 },
      { t: 2.7, move: [b.fuelShort.cx, b.fuelShort.cy], dur: 0.8, tag: "hover-fuel" },
      { t: 3.9, move: [b.size[0].cx, b.size[0].cy], dur: 0.55, tag: "hover-size-0" },
      { t: 4.55, move: [b.size[1].cx, b.size[1].cy], dur: 0.16, tag: "hover-size-1" },
      { t: 4.8, move: [b.size[2].cx, b.size[2].cy], dur: 0.16, tag: "hover-size-2" },
      { t: 5.05, move: [b.size[3].cx, b.size[3].cy], dur: 0.16, tag: "hover-size-3" },
      { t: 5.3, move: [b.size[4].cx, b.size[4].cy], dur: 0.16, tag: "hover-size-4" },
      { t: 5.6, click: "size-5000" },
      { t: 5.85, move: [b.lev[2].cx, b.lev[2].cy], dur: 0.3, tag: "hover-lev" },
      { t: 6.25, click: "lev-5" },
      { t: 6.5, move: [b.preview.cx, b.preview.cy], dur: 0.35, tag: "hover-preview" },
      { t: 7.2, move: [b.buy.cx, b.buy.cy], dur: 0.3, tag: "hover-buy" },
      { t: 7.65, click: "buy" },
      { t: 7.95, move: [b.run.cx, b.run.cy], dur: 0.55, tag: "hover-run" },
      { t: 8.75, click: "run" },
      { t: 9.0, move: [b.position.cx, b.position.cy + 40], dur: 0.9 },
      // close when the push has run its course (see closeWhen) — fallback time below
      { t: 21.5, move: [b.close.cx, b.close.cy], dur: 0.35, tag: "hover-close", once: "close" },
      { t: 21.95, click: "close", once: "close" },
    ],
    // Close on the first meaningful pullback after a big run (decided live, from the page).
    closeWhen: { after: 13, drawdown: 0.035 },
  },
  // A fast short: 5,000 BTC sold at 5x into the long liquidations below (seed 19 runs into a red cascade).
  short: {
    seed: 19,
    prep: { leverage: 3, speed: 1 },
    wheel: 8,
    duration: 18,
    plan: (b) => quickPlan(b, "sell").concat([
      { t: 14.0, move: [b.close.cx, b.close.cy], dur: 0.35, tag: "hover-close", once: "close" },
      { t: 14.45, click: "close", once: "close" },
    ]),
    closeWhen: { after: 6, drawdown: 0.035 },
  },
  // An iceberg wall: the visible book promised a big move, a hidden bid absorbed the sell (seed 14).
  wall: {
    seed: 14,
    prep: { leverage: 3, speed: 1 },
    wheel: 8,
    duration: 8,
    plan: (b) => quickPlan(b, "sell"),
  },
  // The reveal layer: the true liquidation / stop / take-profit map drawn over the chart.
  reveal: {
    seed: SEED,
    prep: { leverage: 3, speed: 1 },
    wheel: 8,
    duration: 5,
    plan: (b) => [
      { t: 0, move: [b.chart.x + b.chart.w * 0.9, b.chart.y + b.chart.h * 0.7], dur: 0 },
      { t: 0.5, key: "r", tag: "reveal" },
      { t: 0.7, move: [b.chart.x + b.chart.w * 0.55, b.chart.y + b.chart.h * 0.2], dur: 1.6 },
      { t: 2.5, move: [b.chart.x + b.chart.w * 0.7, b.chart.y + b.chart.h * 0.85], dur: 1.8 },
    ],
  },
  // Ranked mode opening: the RANKED · 24 TURNS banner over a fresh market.
  ranked: {
    seed: SEED,
    query: "ranked",
    preroll: 0.25,
    prep: { leverage: 3, speed: 1 },
    wheel: 0,
    duration: 4,
    plan: (b) => [{ t: 0, move: [b.run.cx - 260, b.run.cy + 300], dur: 0 }],
  },
};

// ---------- run ----------
const shot = SHOTS[SHOT];
if (!shot) throw Error(`unknown shot ${SHOT}`);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--force-color-profile=srgb", "--hide-scrollbars"] });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
await context.addInitScript(SHIM);
await context.addInitScript(({ prep }) => {
  const set = (k, v) => localStorage.setItem(`flow-arena-sandbox:${k}`, JSON.stringify(v));
  set("tourSeen", true);
  set("sound", false);
  set("effects", true);
  set("speed", prep.speed);
  set("leverage", prep.leverage);
  set("alerts", { bigFlow: false, cascade: false, own: false, move: false, event: false });
}, { prep: shot.prep });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[page]", m.text()); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
// Playwright's context scale is lost when the page navigates to the local server; set it through CDP.
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
await page.goto(`http://127.0.0.1:8790/arena/?debug&${shot.query ?? `seed=${shot.seed}`}`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const step = 1000 / FPS;
const advance = (ms) => page.evaluate((m) => window.__vt.advance(m), ms);
// let the market build and the loading veil clear
for (let i = 0; i < Math.round((shot.preroll ?? 3) * 30); i++) await advance(33.333);

const box = (sel, i = 0) => page.$$eval(sel, (els, i) => {
  const r = els[i].getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
}, i);
const b = {
  chart: await box("#market-chart"),
  fuelShort: await box(".fuel-row.short"),
  size: await Promise.all([0, 1, 2, 3, 4].map((i) => box("[data-size]", i))),
  lev: await Promise.all([0, 1, 2, 3, 4].map((i) => box("[data-leverage]", i))),
  preview: await box("#order-preview"),
  buy: await box("#buy-button"),
  sell: await box("#sell-button"),
  run: await box("#run-button"),
  position: await box("#position"),
  close: await box("#close-position"),
  hud: await box("#position-hud").catch(() => null),
  stage: await box("#stage"),
};

if (shot.wheel) {
  await page.mouse.move(b.chart.x + b.chart.w * 0.5, b.chart.y + b.chart.h * 0.5);
  for (let i = 0; i < shot.wheel; i++) { await page.mouse.wheel(0, -100); await advance(33.333); }
  for (let i = 0; i < 15; i++) await advance(33.333);
}
const file = path.join(OUT, `${SHOT}.mp4`);
const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });

const actions = shot.plan(b).sort((x, y) => x.t - y.t);
const log = { shot: SHOT, seed: shot.seed, fps: FPS, scale: SCALE, size: [W, H], boxes: b, frames: [], events: [] };
await page.mouse.move(actions[0].move[0], actions[0].move[1]);
let mx = actions[0].move[0], my = actions[0].move[1];
let tween = null;
let next = 0;
let closed = false;
let peak = -Infinity;
const total = Math.round(Number(opt("dur", shot.duration)) * FPS);
const t0 = Date.now();

for (let f = 0; f < total; f++) {
  const t = f / FPS;
  // live close decision
  if (shot.closeWhen && !closed && t > shot.closeWhen.after) {
    const s = await page.evaluate(() => ({ eq: window.arenaDebug.player.equity(), pos: window.arenaDebug.player.account.position }));
    if (s.pos) {
      peak = Math.max(peak, s.eq);
      if (peak > 1e6 && s.eq < peak * (1 - shot.closeWhen.drawdown)) {
        closed = true;
        const tag = actions.findIndex((a, i) => i >= next && a.once === "close");
        if (tag >= 0) {
          const rest = actions.filter((a) => a.once === "close");
          const base = rest[0].t;
          for (const a of rest) a.t = t + 0.02 + (a.t - base);
          actions.sort((x, y) => x.t - y.t);
        }
      }
    }
  }
  while (next < actions.length && actions[next].t <= t + 1e-6) {
    const a = actions[next++];
    if (a.move) {
      if (!a.dur) { mx = a.move[0]; my = a.move[1]; await page.mouse.move(mx, my); }
      else tween = { x0: mx, y0: my, x1: a.move[0], y1: a.move[1], t0: t, dur: a.dur };
      if (a.tag) log.events.push({ t: t + (a.dur || 0), ev: "hover", tag: a.tag });
    }
    if (a.key) {
      log.events.push({ t, ev: "key", tag: a.tag ?? a.key });
      await page.keyboard.press(a.key);
    }
    if (a.click) {
      log.events.push({ t, ev: "click", tag: a.click });
      await page.mouse.down();
      await advance(step / 2);
      await page.mouse.up();
    }
  }
  if (tween) {
    const k = Math.min(1, (t - tween.t0) / tween.dur);
    const e = ease(k);
    mx = tween.x0 + (tween.x1 - tween.x0) * e;
    my = tween.y0 + (tween.y1 - tween.y0) * e;
    await page.mouse.move(mx, my);
    if (k >= 1) tween = null;
  }
  await advance(step);
  const state = await page.evaluate(() => {
    const d = window.arenaDebug;
    const txt = (id) => document.getElementById(id)?.textContent?.trim();
    return { price: d.sim.last, eq: Math.round(d.player.equity()), pos: d.player.account.position, pnl: txt("hud-pnl"), ign: txt("ignited-total"), cascade: document.getElementById("cascade-meter")?.hidden ? null : txt("cascade-count") };
  });
  log.frames.push({ t: +t.toFixed(4), x: +mx.toFixed(1), y: +my.toFixed(1), ...state });
  const shotData = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 93, optimizeForSpeed: true });
  if (!ff.stdin.write(Buffer.from(shotData.data, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 60 === 0) console.log(`frame ${f}/${total}  t=${t.toFixed(2)}  ${state.pnl}  cascade=${state.cascade ?? "-"}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
fs.writeFileSync(path.join(OUT, `${SHOT}.json`), JSON.stringify(log));
await browser.close();
console.log("wrote", file);
// The cold open's rewind: the hero run up to its peak, reversed into one second.
if (SHOT === "main") {
  const rw = spawn(FFMPEG, ["-y", "-loglevel", "error", "-t", "13.7", "-i", file, "-vf", "fps=60*0.9375/13.7,scale=1920:1080:flags=lanczos,reverse,setpts=N/(60*TB)",
    "-r", "60", "-c:v", "libx264", "-crf", "16", "-g", "30", "-pix_fmt", "yuv420p", "-an", path.join(OUT, "rewind.mp4")], { stdio: "inherit" });
  await new Promise((r) => rw.on("close", r));
  console.log("wrote rewind.mp4");
}
