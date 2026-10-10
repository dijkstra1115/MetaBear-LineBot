// Records the real FLOW ARENA page (public/arena/) replaying a leaderboard game: the ranked market is
// opened on the stored seed and every logged action is applied on the exact tick it was recorded, so
// the page plays the same game the server scored. The page runs on a virtual clock (timers, rAF,
// performance.now, Date.now and CSS animations advance only when we step), so each frame is complete
// however slow the screenshot is. A rate schedule (game seconds per video second) fast-forwards the
// quiet stretches and slows the big moments; the ranked result panel is recorded in real time.
// Serves public/ itself and blocks every request that is not local, so nothing is ever uploaded.
// Usage: node scripts/capture.mjs <liu|easy|deyo> [--fps 60] [--scale 1.5] [--probe 0,2227,7161]
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const GAME = argv[0];
const FPS = Number(opt("fps", 60));
const SCALE = Number(opt("scale", 1.5));
const PROBE = opt("probe", null);
const OUT = path.resolve(opt("out", "assets/video"));
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const W = 1920, H = 1080;
const PUBLIC = fileURLToPath(new URL("../../../../public", import.meta.url));

const games = Object.fromEntries(JSON.parse(fs.readFileSync("assets/data/games.json", "utf8")).map((g) => [g.key, g]));
// Rate schedule per game: [game second from, game seconds per video second]; `tail` is the real-time
// recording of the result panel after the market closes.
const PLANS = {
  deyo: { rate: [[0, 3600], [7130, 30], [7152, 4], [7166, 30], [7192, 6]], tail: 4.2 },
  easy: { rate: [[0, 3000], [5790, 160], [6760, 1500], [7190, 6]], tail: 4.2 },
  liu: { rate: [[0, 900], [2200, 330], [4000, 110], [4680, 1800], [7190, 6]], tail: 4.6 },
};
const game = games[GAME];
const plan = PLANS[GAME];
if (!game || !plan) throw Error(`usage: capture.mjs <${Object.keys(PLANS).join("|")}>`);
const rateAt = (g) => plan.rate.filter(([from]) => g >= from).at(-1)[1];

// ---------- a static server for public/ ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".json": "application/json", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.resolve(PUBLIC, "." + p);
    if (!file.startsWith(PUBLIC)) throw Error("outside");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ---------- virtual clock, seeded randomness ----------
const SHIM = `(() => {
  let now = 0;
  const epoch = 1790000000000;
  const timers = new Map();
  const rafs = new Map();
  let nextId = 1;
  performance.now = () => now;
  Date.now = () => epoch + now;
  let s = 0x2545f491;
  Math.random = () => {
    if (window.__nextRandom != null) { const v = window.__nextRandom; window.__nextRandom = null; return v; }
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
        if (an.__t0 == null) { an.__t0 = now - Math.min(step, Math.max(0, an.currentTime || 0)); an.pause(); }
        an.currentTime = now - an.__t0;
      }
    },
  };
})();`;

const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--force-color-profile=srgb", "--hide-scrollbars"] });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
await context.route("**/*", (route) => (route.request().url().startsWith(ORIGIN) ? route.continue() : route.abort()));
await context.addInitScript(SHIM);
await context.addInitScript(({ leverage }) => {
  const set = (k, v) => localStorage.setItem(`flow-arena-sandbox:${k}`, JSON.stringify(v));
  set("tourSeen", true);
  set("sound", false);
  set("effects", true);
  set("speed", 4);
  set("leverage", leverage);
  set("alerts", { turn: false, bigFlow: false, cascade: false, own: false, move: false, event: false });
}, { leverage: game.leverage });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[page]", m.text()); });
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
await page.goto(`${ORIGIN}/arena/?debug&seed=1`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const advance = (ms) => page.evaluate((m) => window.__vt.advance(m), ms);
// The page refreshes its panels every 120 ms of page time; in slow motion that would freeze them, so
// every recorded frame redraws them from the current state.
const refresh = () => page.evaluate(() => window.arenaDebug?.render());
for (let i = 0; i < 40; i++) await advance(33.333);

// Open the ranked market on the stored seed: randomSeed() is 1 + floor(Math.random() * 0xfffffffe).
await page.evaluate((seed) => (window.__nextRandom = (seed - 1 + 0.5) / 0xfffffffe), game.seed);
await page.click("#ranked-button");
for (let i = 0; i < 20; i++) await advance(33.333);
if (await page.evaluate(() => document.getElementById("ranked-notice").open)) await page.click("#ranked-notice-continue");
for (let i = 0; i < 30; i++) await advance(33.333);

// Apply the log on its ticks (the leverage at t=0 went in when the market opened).
const setup = await page.evaluate(({ actions, seed }) => {
  const d = window.arenaDebug;
  const sim = d.sim, player = d.player, log = d.ranked.log;
  const start = log.start;
  const rest = actions.filter((a, i) => !(i === 0 && a.op === "leverage" && a.t === 0));
  let next = 0;
  const tick = sim.tick.bind(sim);
  sim.tick = () => {
    while (next < rest.length && rest[next].t === sim.time - start) {
      const a = rest[next++];
      log.apply(player, a.op, a.args);
    }
    return tick();
  };
  window.__replay = { start, left: () => rest.length - next };
  return { seed: sim.seed, leverage: player.leverage, logged: log.actions.map((a) => a.op), t: sim.time - start };
}, { actions: game.actions, seed: game.seed });
if (setup.seed !== game.seed) throw Error(`market seed ${setup.seed} != ${game.seed}`);
console.log(`${game.name}: ranked market #${setup.seed}, ${setup.leverage}x, ${game.actions.length} actions to replay`);
await page.click("#run-button");

const state = () =>
  page.evaluate(() => {
    const d = window.arenaDebug;
    const r = d.ranked;
    return {
      g: d.sim.time - window.__replay.start,
      price: d.sim.last,
      eq: Math.round(d.player.equity()),
      pos: d.player.account.position,
      rz: Math.round(d.player.account.realized - d.player.fees),
      over: Boolean(r.over),
      done: Boolean(r.result),
      pnl: r.result?.pnl ?? null,
      notice: document.getElementById("ranked-notice").open,
      running: !document.getElementById("pause-card").hidden ? "paused" : "ok",
    };
  });

// keep the market running: dismiss the final-turn notice if it shows, restart after any stop
const keepRunning = async (s) => {
  if (s.notice) await page.click("#ranked-notice-continue");
  else if (!s.over && (await page.evaluate(() => !document.getElementById("pause-card").hidden))) await page.click("#pause-continue");
};

const shoot = async () => (await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true })).data;

if (PROBE) {
  // stills at chosen game seconds, for framing decisions
  fs.mkdirSync(OUT, { recursive: true });
  for (const target of PROBE.split(",").map(Number)) {
    let s = await state();
    while (s.g < target && !s.over) {
      await keepRunning(s);
      await advance(100);
      s = await state();
    }
    await refresh();
    fs.writeFileSync(path.join(OUT, `probe-${GAME}-${target}.jpg`), Buffer.from(await shoot(), "base64"));
    console.log("probe", target, JSON.stringify(s));
  }
  await browser.close();
  server.close();
  process.exit(0);
}

// ---------- record ----------
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `${GAME}.mp4`);
const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-g", String(FPS / 2), "-keyint_min", String(FPS / 2), "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
const write = async (b64) => {
  if (!ff.stdin.write(Buffer.from(b64, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
};
const frames = [];
const frameMs = 1000 / FPS;
let s = await state();
let tailFrames = null;
const t0 = Date.now();
for (let f = 0; ; f++) {
  await keepRunning(s);
  if (!s.over) {
    // game seconds this frame should cover; 30 ticks per real second at 1x, 4x speed, <=100 ms per rAF
    const want = rateAt(s.g) / FPS;
    let ms = (want / (30 * 4)) * 1000;
    while (ms > 100) {
      await advance(100);
      ms -= 100;
    }
    await advance(Math.max(ms, 0.5));
  } else {
    await advance(frameMs);
    if (s.done && tailFrames == null) tailFrames = Math.round(plan.tail * FPS);
  }
  await refresh();
  s = await state();
  frames.push({ f, ...s });
  await write(await shoot());
  if (f % 60 === 0) console.log(`frame ${f}  game ${s.g}s  ${(s.eq / 1e8).toFixed(2)}億  pos ${s.pos}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (tailFrames != null && --tailFrames <= 0) break;
  if (f > FPS * 120) throw Error("recording ran away");
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
const final = await state();
fs.writeFileSync(path.join(OUT, `${GAME}.json`), JSON.stringify({ game: GAME, name: game.name, seed: game.seed, fps: FPS, scale: SCALE, stored: game.pnl, replayed: final.pnl, frames }));
await browser.close();
server.close();
console.log(`wrote ${file}  ${frames.length} frames  page PnL ${final.pnl} vs stored ${game.pnl} ${final.pnl === game.pnl ? "✓" : "✗ MISMATCH"}`);
if (final.pnl !== game.pnl) process.exit(2);
