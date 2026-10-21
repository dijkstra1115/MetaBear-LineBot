// Records a lab replay case (?case=<id>&rec=1) to video, one frame at a time on Playwright's fake
// clock, so the result is smooth however slow the machine draws. Vertical 1080×1920 by default.
//
//   npm run preview:academy                       # in another terminal, serves public/ on :8790
//   node scripts/replay-cases/record.mjs --id 2026-09-14
//   node scripts/replay-cases/record.mjs --id 2026-09-14 --w 1920 --h 1080 --scale 1   # landscape
//
// With FFMPEG (or ffmpeg on PATH) built with libx264 the output is MP4; otherwise it falls back to
// Playwright's own ffmpeg, which only writes WebM (VP8). Output: motion/out/replay-<id>.<ext>,
// plus stills every 10 s in motion/out/replay-<id>-stills/ for review.
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const args = Object.fromEntries(process.argv.slice(2).flatMap((x, i, all) => (x.startsWith("--") ? [[x.slice(2), all[i + 1]]] : [])));
const ID = args.id;
if (!/^[\w-]+$/.test(ID ?? "")) throw new Error("Need --id <case id>");
const W = Number(args.w ?? 432);
const H = Number(args.h ?? 768);
const SCALE = Number(args.scale ?? 2.5);
const FPS = Number(args.fps ?? 30);
const BASE = args.base ?? "http://127.0.0.1:8790";
const TAIL_MS = 2000; // keep the last frame a moment after the replay ends
const MAX_MS = 10 * 60_000;

async function encoder() {
  for (const bin of [process.env.FFMPEG, "ffmpeg"].filter(Boolean)) {
    const probe = spawnSync(bin, ["-hide_banner", "-encoders"], { encoding: "utf8" });
    if (probe.status === 0 && /libx264/.test(probe.stdout)) return { bin, ext: "mp4", out: ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-movflags", "+faststart"] };
  }
  const root = join(homedir(), "AppData", "Local", "ms-playwright");
  const dir = (await readdir(root).catch(() => [])).find((d) => d.startsWith("ffmpeg-"));
  if (!dir) throw new Error("No ffmpeg: install one with libx264, or run `npx playwright install ffmpeg`");
  const bin = join(root, dir, (await readdir(join(root, dir))).find((f) => /^ffmpeg/.test(f)));
  return { bin, ext: "webm", out: ["-c:v", "libvpx", "-b:v", "8M", "-crf", "8", "-qmin", "0", "-qmax", "30"] };
}

const outDir = fileURLToPath(new URL("../../motion/out/", import.meta.url));
const stills = join(outDir, `replay-${ID}-stills`);
await mkdir(stills, { recursive: true });
const enc = await encoder();
const file = join(outDir, `replay-${ID}.${enc.ext}`);
// JPEG frames stream into ffmpeg; "pipe:0" rather than "-", which Playwright's build rejects.
const ff = spawn(enc.bin, ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "pipe:0", ...enc.out, file], { stdio: ["pipe", "inherit", "inherit"] });
const ffDone = new Promise((ok, fail) => ff.on("close", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)))));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
page.on("pageerror", (e) => console.error("[page]", e.message));
await page.clock.install({ time: Date.parse("2026-10-20T00:00:00Z") });
await page.goto(`${BASE}/lab/orderflow/index.html?case=${ID}&rec=1`);
await page.waitForFunction(() => document.getElementById("status")?.hidden === true, null, { timeout: 60_000 });
await page.evaluate(() => document.fonts.ready);
// From here on the page's time moves only when we step it.
await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 50));

const step = 1000 / FPS;
let frames = 0;
let endedAt = null;
for (let ms = 0; ms < MAX_MS; ms += step) {
  await page.clock.runFor(step);
  const jpeg = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(jpeg)) await new Promise((ok) => ff.stdin.once("drain", ok));
  if (frames % (FPS * 10) === 0) await writeFile(join(stills, `${String(Math.round(ms / 1000)).padStart(3, "0")}s.jpg`), jpeg);
  frames++;
  if (endedAt == null && (await page.textContent("#live")) === "回放結束") endedAt = ms;
  if (endedAt != null && ms - endedAt >= TAIL_MS) break;
  if (frames % (FPS * 5) === 0) process.stdout.write(`\r${(ms / 1000).toFixed(0)} s recorded`);
}
ff.stdin.end();
await ffDone;
await browser.close();
console.log(`\n${frames} frames (${(frames / FPS).toFixed(1)} s) → ${file}`);
