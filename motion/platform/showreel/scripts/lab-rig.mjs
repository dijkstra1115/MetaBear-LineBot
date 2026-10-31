// Drives the real lab page (public/lab/orderflow) one frame at a time on Playwright's fake clock.
// API responses and WebSocket frames are taped once from the live site, then replayed, so a shot
// can be re-recorded and the numbers on screen stay the numbers the market really printed.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT = join(HERE, "..");
export const REPO = join(HERE, "..", "..", "..", "..");
export const TAPE = join(PROJECT, ".tape"); // live responses and frames; local only
export const FF = process.env.FFMPEG || "ffmpeg";
const BASE = "http://127.0.0.1:8790";

export function startServer() {
  const child = spawn(process.execPath, [join(REPO, "scripts/orderflow-preview.mjs"), "--api", "https://metabear.io"], { stdio: "ignore", cwd: REPO });
  return { stop: () => child.kill(), ready: new Promise((ok) => setTimeout(ok, 1200)) };
}

const apiKey = (url) => {
  const u = new URL(url);
  return createHash("sha1").update(u.pathname + u.search).digest("hex").slice(0, 16);
};
const apiFamily = (url) => {
  const u = new URL(url);
  return createHash("sha1").update(u.pathname + "|" + (u.searchParams.get("ex") ?? "") + "|" + (u.searchParams.get("d") ?? "")).digest("hex").slice(0, 16);
};

/** Serves /api/orderflow/* from the tape; a miss is fetched once and kept (never in frozen mode). */
export async function tapeApi(page, { frozen = false } = {}) {
  const dir = join(TAPE, "api");
  mkdirSync(dir, { recursive: true });
  await page.route("**/api/orderflow/**", async (route) => {
    const url = route.request().url();
    const exact = join(dir, apiKey(url) + ".json");
    const family = join(dir, "f-" + apiFamily(url) + ".json");
    if (existsSync(exact)) return route.fulfill({ status: 200, contentType: "application/json", body: readFileSync(exact) });
    // Polls ask for "recent since <minute>", a URL that moves with the clock: the newest tape stands in.
    if (frozen && existsSync(family)) return route.fulfill({ status: 200, contentType: "application/json", body: readFileSync(family) });
    if (frozen) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    const res = await route.fetch();
    const body = await res.body();
    if (res.status() === 200) {
      writeFileSync(exact, body);
      writeFileSync(family, body);
    }
    return route.fulfill({ status: res.status(), contentType: "application/json", body });
  });
}

export const NO_GUIDE = () => {
  try {
    localStorage.setItem("mb-lab-guide-v1", "1");
  } catch {}
};

/** Tapes every WebSocket frame of the page for `ms` milliseconds against the live exchanges. */
export async function recordSockets(page) {
  const conns = [];
  const t0 = Date.now();
  await page.routeWebSocket(/.*/, (ws) => {
    const url = ws.url();
    const conn = { url, n: conns.filter((c) => c.url === url).length, at: Date.now() - t0, frames: [] };
    conns.push(conn);
    const server = ws.connectToServer();
    server.onMessage((m) => {
      const bin = typeof m !== "string";
      conn.frames.push([Date.now() - t0, bin ? 1 : 0, bin ? Buffer.from(m).toString("base64") : m]);
      ws.send(m);
    });
    ws.onMessage((m) => server.send(m));
  });
  return { t0, save: () => writeFileSync(join(TAPE, "sockets.json.gz"), gzipSync(JSON.stringify({ t0, conns }))) };
}

/** Replays taped frames on the same URLs; pump(ms) delivers everything up to ms after the tape's start. */
export async function replaySockets(page) {
  const tape = JSON.parse(gunzipSync(readFileSync(join(TAPE, "sockets.json.gz"))).toString());
  const open = [];
  const seen = new Map();
  await page.routeWebSocket(/.*/, (ws) => {
    const url = ws.url();
    const n = seen.get(url) ?? 0;
    seen.set(url, n + 1);
    const conn = tape.conns.find((c) => c.url === url && c.n === n);
    if (conn) open.push({ ws, conn, i: 0 });
    ws.onMessage(() => {});
  });
  return {
    t0: tape.t0,
    end: Math.max(...tape.conns.map((c) => c.frames.at(-1)?.[0] ?? 0)),
    async pump(ms) {
      for (const o of open) {
        const f = o.conn.frames;
        while (o.i < f.length && f[o.i][0] <= ms) {
          const [, bin, data] = f[o.i++];
          o.ws.send(bin ? Buffer.from(data, "base64") : data);
        }
      }
    },
  };
}

/** The tape's start, the instant the page's clock is set to. */
export const tapeTime = () => JSON.parse(gunzipSync(readFileSync(join(TAPE, "sockets.json.gz"))).toString()).t0;

export async function encoder(file, fps) {
  mkdirSync(dirname(file), { recursive: true });
  const ff = spawn(FF, ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "pipe:0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "15", "-preset", "medium", "-g", String(fps), "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, fail) => ff.on("close", (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exited ${c}`)))));
  return {
    async write(jpeg) {
      if (!ff.stdin.write(jpeg)) await new Promise((ok) => ff.stdin.once("drain", ok));
    },
    async close() {
      ff.stdin.end();
      await done;
    },
  };
}

export async function newLab({ w = 1440, h = 810, scale = 2, init = [] } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, locale: "zh-TW", timezoneId: "Asia/Taipei", bypassCSP: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("[page]", e.message));
  await page.addInitScript(NO_GUIDE);
  for (const fn of init) await page.addInitScript(fn);
  return { browser, context, page, url: (q) => `${BASE}/lab/orderflow/index.html${q}`, base: BASE };
}

// A cursor the viewer can follow; the page has none of its own in a headless capture.
export const CURSOR = `
  const c = document.createElement("div");
  c.id = "__cursor";
  c.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;z-index:99999;pointer-events:none;will-change:transform;transform:translate(-40px,-40px);filter:drop-shadow(0 2px 4px rgba(0,0,0,.7))";
  c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 2.5l14 9.2-6.4 1.4-3.3 6.2z" fill="#edf2ed" stroke="#05090f" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(c);
  window.__moveCursor = (x, y) => { c.style.transform = "translate(" + (x - 5) + "px," + (y - 3) + "px)"; };
`;

/**
 * Records one shot: `steps` is a sorted list of [ms, async fn]. mouse(x,y,dur) tweens the real
 * Playwright mouse together with the visible cursor, in step with the frames.
 */
export async function shot({ page, file, fps = 30, ms, steps = [], sockets = null, stills = [], check = false, checkFrames = null, beforeFrame = null, onFrame = null }) {
  // A check run keeps only a still every half second and skips the encoder.
  const enc = check ? { write: async () => {}, close: async () => {} } : await encoder(file, fps);
  const checkEvery = Math.round(fps / 2);
  const dt = 1000 / fps;
  const queue = [...steps].sort((a, b) => a[0] - b[0]);
  let moves = [];
  const api = {
    move(x, y, dur = 400, ease = (u) => 1 - Math.pow(1 - u, 3)) {
      moves.push({ x0: api.x, y0: api.y, x, y, t0: now, dur, ease });
    },
    x: 0,
    y: 0,
  };
  let now = 0;
  const frames = Math.round(ms / dt);
  for (let f = 0; f < frames; f++) {
    now = f * dt;
    while (queue.length && queue[0][0] <= now) await queue.shift()[1](api);
    for (const m of moves) {
      const u = Math.min(1, (now - m.t0) / m.dur);
      const k = m.ease(u);
      api.x = m.x0 + (m.x - m.x0) * k;
      api.y = m.y0 + (m.y - m.y0) * k;
      await page.mouse.move(api.x, api.y);
      await page.evaluate(([x, y]) => window.__moveCursor?.(x, y), [api.x, api.y]);
    }
    moves = moves.filter((m) => now - m.t0 < m.dur);
    if (sockets) await sockets.pump();
    await beforeFrame?.(f);
    // The clock only takes whole milliseconds, and rounding every frame the same way drifts 2 % at 60 fps.
    await page.clock.runFor(Math.round((f + 1) * dt) - Math.round(f * dt));
    await onFrame?.(f);
    if (check && (checkFrames ? !checkFrames.includes(f) : f % checkEvery)) continue;
    const jpeg = await page.screenshot({ type: "jpeg", quality: 94 });
    await enc.write(jpeg);
    if (check || stills.includes(f)) writeFileSync(file.replace(/\.mp4$/, `-${String(f).padStart(4, "0")}.jpg`), jpeg);
    if (f % fps === 0) process.stdout.write(`\r${file.split(/[\\/]/).pop()} ${(now / 1000).toFixed(0)}s`);
  }
  await enc.close();
  console.log(`\n${frames} frames → ${file}`);
}
