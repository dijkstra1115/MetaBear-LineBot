// Frame-perfect capture of real academy lessons (player stage only) for the narrated film.
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
  "fp": lessonClip("footprint", 4.6, 7),
  "wall": lessonClip("btc-wall", 14, 10),
  "replay": lessonClip("btc-wall", 1.6, 7),
  "ev1": lessonClip("trend-pullback", 23.6, 2.2),
  "ev2": lessonClip("trend-pullback", 27.6, 2.2),
  "ev3": lessonClip("trend-pullback", 30.6, 2.2),
  "ev4": lessonClip("trend-pullback", 41.6, 2.2),
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
