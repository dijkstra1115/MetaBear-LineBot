// Drives the real lab page (public/lab/orderflow) one frame at a time on Playwright's fake clock,
// in its replay mode with this case's data, at a phone's width so the capture is 9:16. Adapted
// from motion/platform/showreel/scripts/lab-rig.mjs: no live API (the case data is all it shows)
// and its own preview port, so it can run beside another preview on 8790.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT = join(HERE, "..");
export const REPO = join(HERE, "..", "..", "..", "..");
export const TAPE = join(PROJECT, ".tape"); // case data and check stills; local only
export const FF = process.env.FFMPEG || "ffmpeg";
const PORT = 8796;
const BASE = `http://127.0.0.1:${PORT}`;
// The phone layout's viewport; captured at 2× → 1080 × 1920.
export const W = 540;
export const H = 960;

export function startServer() {
  const child = spawn(process.execPath, [join(REPO, "scripts/orderflow-preview.mjs"), "--port", String(PORT), "--api", "https://example.invalid"], { stdio: "ignore", cwd: REPO });
  return { stop: () => child.kill(), ready: new Promise((ok) => setTimeout(ok, 1200)) };
}

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

export async function newLab({ scale = 2 } = {}) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale, locale: "zh-TW", timezoneId: "Asia/Taipei", bypassCSP: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("[page]", e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("mb-lab-guide-v1", "1");
    } catch {}
  });
  // Replay mode reads only the case files; anything live is answered empty.
  await page.route("**/api/orderflow/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.routeWebSocket(/.*/, (ws) => ws.onMessage(() => {}));
  return { browser, context, page, url: (q) => `${BASE}/lab/orderflow/index.html${q}` };
}

/** Records one shot of `ms`: beforeFrame(f) runs before the clock steps, onFrame(f) after. */
export async function shot({ page, file, fps = 30, ms, check = false, checkEvery = null, beforeFrame = null, onFrame = null }) {
  const enc = check ? { write: async () => {}, close: async () => {} } : await encoder(file, fps);
  const every = checkEvery ?? Math.round(fps / 2);
  const dt = 1000 / fps;
  const frames = Math.round(ms / dt);
  for (let f = 0; f < frames; f++) {
    await beforeFrame?.(f);
    // The clock only takes whole milliseconds; rounding every frame the same way drifts.
    await page.clock.runFor(Math.round((f + 1) * dt) - Math.round(f * dt));
    await onFrame?.(f);
    if (check && f % every) continue;
    const jpeg = await page.screenshot({ type: "jpeg", quality: 94 });
    if (check) writeFileSync(file.replace(/\.mp4$/, `-${String(f).padStart(4, "0")}.jpg`), jpeg);
    else await enc.write(jpeg);
    if (f % fps === 0) process.stdout.write(`\r${file.split(/[\\/]/).pop()} ${((f * dt) / 1000).toFixed(0)}s`);
  }
  await enc.close();
  console.log(`\n${frames} frames → ${file}`);
}
