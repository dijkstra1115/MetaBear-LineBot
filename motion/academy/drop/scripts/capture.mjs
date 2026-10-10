// Frame-perfect capture of the real academy pages (lesson player, end screen, learning map).
// The page runs on a virtual clock (timers, rAF, performance.now and CSS animations advance only when we
// step a frame), so every frame is complete no matter how slow the screenshot is. The cursor is not in the
// screenshots: its path is logged to <shot>.json and redrawn in the video.
// Needs `npm run preview:academy` on :8790 and ffmpeg on PATH (or FFMPEG=).
// Usage: node scripts/capture.mjs <shot|all> [--fps 60] [--scale 1.5]
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const FPS = Number(opt("fps", 60));
const SCALE = Number(opt("scale", 1.5));
const OUT = path.resolve(opt("out", "assets/video"));
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const W = 1920;
const H = 1080;
const BASE = "http://127.0.0.1:8790/orderflow/";

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

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// A clip of one lesson playing from `from`, framed to the player stage only.
const lessonClip = (id, from, duration) => ({ page: `${id}.html`, region: "stage", duration, prep: { seek: from, play: true }, plan: () => [] });

const SHOTS = {
  // The cold open: click play on the real BTC wall lesson, let it run, then grab the playhead and drag it back.
  open: {
    page: "btc-wall.html",
    duration: 7.5,
    prep: { seek: 3.2, play: false },
    plan: (b) => {
      const at = (t) => b.range.x + (b.range.w * t) / b.D;
      const y = b.range.cy;
      return [
        { t: 0, move: [b.play.cx + 14, b.play.cy + 10], dur: 0 },
        { t: 0.3, click: "play" },
        { t: 0.5, move: [b.play.cx + 260, b.play.cy + 120], dur: 1.2 },
        // lesson ≈ 5.6 s when the cursor reaches the playhead
        { t: 2.1, move: [at(5.6), y], dur: 0.45, tag: "hover-scrub" },
        { t: 2.6, down: true },
        { t: 2.65, move: [at(0.9), y], dur: 0.9, tag: "drag-back", raw: true },
        { t: 3.6, move: [at(1.4), y], dur: 0.25, raw: true },
        { t: 3.95, up: true },
        { t: 4.2, move: [at(1.4) + 220, y - 330], dur: 1.0 },
      ];
    },
  },
  // End of the same lesson: the real "本課完成 ✓" screen, then the cursor goes for the next lesson.
  end: {
    page: "btc-wall.html",
    duration: 4.5,
    prep: { seek: 52.6, play: true },
    plan: (b) => [
      { t: 0, move: [b.stage.x + b.stage.w * 0.62, b.stage.y + b.stage.h * 0.7], dur: 0 },
      { t: 1.9, find: ".motion-next", move: "center", dur: 0.8, tag: "hover-next" },
    ],
  },
  // The learning map: hero line and the 23 / 11 / 0 counters, then a smooth scroll down into the course cards.
  map: {
    page: "courses.html",
    duration: 5,
    prep: {},
    scroll: [
      { t: 0.9, to: 1060, dur: 1.6 },
      { t: 2.9, to: 2160, dur: 1.4 },
    ],
    plan: (b) => [
      { t: 0, move: [1300, 760], dur: 0 },
      { t: 0.3, move: [700, 905], dur: 0.7 },
      { t: 2.5, move: [1130, 420], dur: 0.6 },
      { t: 3.9, move: [800, 330], dur: 0.6 },
    ],
  },
  // Lesson moments for the feedback montage (stage only).
  "m-trend": lessonClip("trend-pullback", 40.6, 3),
  "m-sr": lessonClip("support-resistance", 43.6, 3),
  "m-liq": lessonClip("liquidation", 23.2, 3),
  "m-wall": lessonClip("btc-wall", 18.6, 3),
  "m-flip": lessonClip("support-resistance", 58.6, 3),
  "m-rewind": lessonClip("trend-pullback", 49.8, 3),
  "m-heat": lessonClip("heatmap", 11.5, 3),
  "m-fib": lessonClip("fibonacci", 28, 3),
  "m-fp": lessonClip("footprint", 14, 3),
};

async function capture(name) {
  const shot = SHOTS[name];
  if (!shot) throw Error(`unknown shot ${name}`);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--force-color-profile=srgb", "--hide-scrollbars"] });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  await context.addInitScript(SHIM);
  // Keep lessons muted: unmuted playback follows the audio clock, which runs in real time, not virtual time.
  await context.addInitScript(() => localStorage.setItem("metabear-motion-sound", "off"));
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await page.goto(BASE + shot.page, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const step = 1000 / FPS;
  const advance = (ms) => page.evaluate((m) => window.__vt.advance(m), ms);
  for (let i = 0; i < 40; i++) await advance(33.333);

  const isLesson = await page.evaluate(() => !!window.motionPlayer);
  if (isLesson) {
    await page.evaluate(({ seek, play }) => {
      const p = window.motionPlayer;
      p.pause();
      p.seek(seek ?? 0, false);
      if (play) p.start();
    }, shot.prep);
    for (let i = 0; i < 6; i++) await advance(step);
  }
  const box = async (sel) => {
    const r = await page.$eval(sel, (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    return { ...r, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
  };
  const b = {};
  if (isLesson) {
    b.stage = await box(".motion-stage");
    b.play = await box(".motion-bigplay");
    b.range = await box(".motion-range");
    b.D = await page.$eval(".motion-range", (e) => Number(e.max) / 1000);
  }

  const region = shot.region === "stage" ? b.stage : null;
  const clip = region ? { x: region.x, y: region.y, width: region.w, height: region.h, scale: 1 } : null;
  const file = path.join(OUT, `${name}.mp4`);
  const vf = region ? ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"] : [];
  const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", ...vf,
    "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });

  const actions = shot.plan(b).sort((x, y) => x.t - y.t);
  const log = { shot: name, page: shot.page, fps: FPS, scale: SCALE, size: [W, H], region: region ?? null, boxes: b, frames: [], events: [] };
  let mx = actions[0]?.move?.[0] ?? W / 2;
  let my = actions[0]?.move?.[1] ?? H / 2;
  await page.mouse.move(mx, my);
  let tween = null;
  let scroll = null;
  let next = 0;
  let nextScroll = 0;
  const scrolls = shot.scroll ?? [];
  const total = Math.round(shot.duration * FPS);
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    while (next < actions.length && actions[next].t <= t + 1e-6) {
      const a = actions[next++];
      if (a.find) a.move = await box(a.find).then((r) => [r.cx, r.cy]);
      if (a.move) {
        if (!a.dur) {
          mx = a.move[0];
          my = a.move[1];
          await page.mouse.move(mx, my);
        } else tween = { x0: mx, y0: my, x1: a.move[0], y1: a.move[1], t0: t, dur: a.dur, raw: a.raw };
        if (a.tag) log.events.push({ t: +(t + (a.dur || 0)).toFixed(4), ev: "hover", tag: a.tag });
      }
      if (a.click) {
        log.events.push({ t, ev: "click", tag: a.click, x: mx, y: my });
        await page.mouse.down();
        await advance(step / 2);
        await page.mouse.up();
      }
      if (a.down) {
        log.events.push({ t, ev: "down", x: mx, y: my });
        await page.mouse.down();
      }
      if (a.up) {
        log.events.push({ t, ev: "up", x: mx, y: my });
        await page.mouse.up();
      }
    }
    while (nextScroll < scrolls.length && scrolls[nextScroll].t <= t + 1e-6) {
      const s = scrolls[nextScroll++];
      scroll = { y0: await page.evaluate(() => scrollY), y1: s.to, t0: t, dur: s.dur };
    }
    if (tween) {
      const k = Math.min(1, (t - tween.t0) / tween.dur);
      const e = tween.raw ? k * k * (3 - 2 * k) : ease(k);
      mx = tween.x0 + (tween.x1 - tween.x0) * e;
      my = tween.y0 + (tween.y1 - tween.y0) * e;
      await page.mouse.move(mx, my, { steps: 1 });
      if (k >= 1) tween = null;
    }
    if (scroll) {
      const k = Math.min(1, (t - scroll.t0) / scroll.dur);
      await page.evaluate((y) => window.scrollTo(0, y), scroll.y0 + (scroll.y1 - scroll.y0) * ease(k));
      if (k >= 1) scroll = null;
    }
    await advance(step);
    const lt = isLesson ? await page.evaluate(() => window.motionPlayer.time) : null;
    log.frames.push({ t: +t.toFixed(4), x: +mx.toFixed(1), y: +my.toFixed(1), lt: lt == null ? null : +lt.toFixed(3) });
    const shotData = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 93, optimizeForSpeed: true, ...(clip ? { clip } : {}) });
    if (!ff.stdin.write(Buffer.from(shotData.data, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 60 === 0) console.log(`${name} frame ${f}/${total} t=${t.toFixed(2)} lesson=${lt ?? "-"} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(log));
  await browser.close();
  console.log("wrote", file);
}

fs.mkdirSync(OUT, { recursive: true });
const which = argv[0] && !argv[0].startsWith("--") ? argv[0] : "all";
for (const name of which === "all" ? Object.keys(SHOTS) : which.split(",")) await capture(name);
