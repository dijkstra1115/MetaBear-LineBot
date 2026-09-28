#!/usr/bin/env node
// Export motion lessons (or the showreel) to MP4 / PNG stills.
// Every frame is a pure function of time, so parallel headless-Chromium
// workers render disjoint ranges and the segments are joined losslessly.
//
//   node motion/render.mjs footprint                 → motion/out/footprint.mp4 (captions burned in)
//   node motion/render.mjs footprint --still 3,12.5  → motion/out/stills/footprint-*.png
//   node motion/render.mjs showreel                  → motion/out/showreel.mp4
//   node motion/render.mjs promo | promo-tall        → motion/out/promo.mp4 (16:9) / promo-tall.mp4 (9:16)
//   node motion/render.mjs --serve                   → http://127.0.0.1:8791/motion/export.html?lesson=<id>
//   options: --fps 60  --workers 4  --from 0 --to 30  --crf 18  --no-captions
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = join(here, "out");
const require = createRequire(join(root, "package.json"));

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);
const target = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function serve(port = 0) {
  const allowed = [join(root, "public") + sep, join(root, "motion") + sep];
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = resolve(root, "." + path);
      if (!allowed.some((a) => file.startsWith(a))) throw new Error("outside");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const g = execSync("npm root -g").toString().trim();
    return createRequire(join(g, "noop.js"))("playwright");
  }
}
function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    return require("ffmpeg-static");
  } catch {
    return "ffmpeg";
  }
}
function run(cmd, argv, stdio = ["ignore", "inherit", "inherit"]) {
  const p = spawn(cmd, argv, { stdio });
  const done = new Promise((ok, fail) =>
    p.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}`)))),
  );
  return { p, done };
}

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("[page]", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("[console]", m.text()));
  await page.goto(url, { timeout: 180000 });
  // The harness defines window.ready only after the lesson module has loaded.
  await page.waitForFunction(() => window.ready !== undefined, null, { timeout: 180000 });
  await page.evaluate(() => window.ready);
  return page;
}
// PNG encoding costs ~4x the draw, so video frames travel as q0.95 JPEG.
const grab = (page, t, i, type = "png") =>
  page.evaluate(
    ([t, i, type]) => {
      window.renderFrame(t, i);
      const url = document.getElementById("stage").toDataURL(`image/${type}`, 0.95);
      return url.slice(url.indexOf(",") + 1);
    },
    [t, i, type],
  );

async function stills(url, name, times) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await openPage(browser, url);
  const dir = join(outDir, "stills");
  await mkdir(dir, { recursive: true });
  for (const t of times) {
    const b64 = await grab(page, t, Math.round(t * 60));
    const file = join(dir, `${name}-${t.toFixed(2).padStart(6, "0")}.png`);
    await writeFile(file, Buffer.from(b64, "base64"));
    console.log(file);
  }
  await browser.close();
}

async function video(url, name, audio, { fps, workers, from, to, crf }) {
  const { chromium } = await loadPlaywright();
  const ff = ffmpegPath();
  const browser = await chromium.launch();
  const probe = await openPage(browser, url);
  const total = await probe.evaluate(() => window.TOTAL);
  await probe.close();
  const end = Math.min(to ?? total, total);
  const first = Math.round(from * fps);
  const last = Math.round(end * fps);
  const count = last - first;
  const segDir = join(outDir, `segments-${name}`);
  await rm(segDir, { recursive: true, force: true });
  await mkdir(segDir, { recursive: true });
  const per = Math.ceil(count / workers);
  const started = Date.now();
  let doneFrames = 0;
  const segs = [];
  await Promise.all(
    Array.from({ length: workers }, async (_, w) => {
      const a = first + w * per;
      const b = Math.min(last, a + per);
      if (a >= b) return;
      const seg = join(segDir, `seg${String(w).padStart(2, "0")}.mp4`);
      segs[w] = seg;
      const page = await openPage(browser, url);
      const enc = run(
        ff,
        [
          "-y",
          "-loglevel",
          "error",
          "-f",
          "image2pipe",
          "-framerate",
          String(fps),
          "-c:v",
          "mjpeg",
          "-i",
          "-",
          "-c:v",
          "libx264",
          "-preset",
          "slow",
          "-crf",
          String(crf),
          "-pix_fmt",
          "yuv420p",
          "-tune",
          "grain",
          "-x264-params",
          "keyint=120",
          seg,
        ],
        ["pipe", "inherit", "inherit"],
      );
      for (let i = a; i < b; i++) {
        const buf = Buffer.from(await grab(page, i / fps, i, "jpeg"), "base64");
        if (!enc.p.stdin.write(buf)) await new Promise((ok) => enc.p.stdin.once("drain", ok));
        doneFrames++;
        if (doneFrames % 240 === 0) {
          const el = (Date.now() - started) / 1000;
          console.log(`${name}: ${doneFrames}/${count}  ${(doneFrames / el).toFixed(1)} fps`);
        }
      }
      enc.p.stdin.end();
      await enc.done;
      await page.close();
    }),
  );
  await browser.close();
  const list = join(segDir, "list.txt");
  await writeFile(
    list,
    segs
      .filter(Boolean)
      .map((s) => `file '${s}'`)
      .join("\n"),
  );
  const silent = join(segDir, "video.mp4");
  await run(ff, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent]).done;
  const final = join(outDir, from === 0 && end === total ? `${name}.mp4` : `${name}-${from}-${end}.mp4`);
  if (audio && existsSync(audio))
    await run(ff, [
      "-y",
      "-loglevel",
      "error",
      "-i",
      silent,
      "-ss",
      String(from),
      "-t",
      String(end - from),
      "-i",
      audio,
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      final,
    ]).done;
  else await run(ff, ["-y", "-loglevel", "error", "-i", silent, "-c", "copy", "-movflags", "+faststart", final]).done;
  await rm(segDir, { recursive: true, force: true });
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s → ${final}`);
}

const server = await serve(flag("serve") ? Number(opt("port", 8791)) : 0);
const base = `http://127.0.0.1:${server.address().port}`;
if (flag("serve")) {
  console.log(`lesson export preview: ${base}/motion/export.html?lesson=<id>`);
  console.log(`showreel preview:      ${base}/motion/showreel/index.html?preview`);
  console.log(`promo preview:         ${base}/motion/promo/index.html?preview&fmt=wide|tall`);
} else {
  if (!target) throw new Error("usage: node motion/render.mjs <lesson-id|showreel> [options]");
  await mkdir(outDir, { recursive: true });
  const showreel = target === "showreel";
  const promo = target === "promo" || target === "promo-tall";
  const url = showreel
    ? `${base}/motion/showreel/index.html`
    : promo
      ? `${base}/motion/promo/index.html?fmt=${target === "promo" ? "wide" : "tall"}`
      : `${base}/motion/export.html?lesson=${target}&captions=${flag("no-captions") ? 0 : 1}`;
  const audio = showreel
    ? join(here, "showreel/out/soundtrack.wav")
    : promo
      ? join(here, "promo/out/promo.wav")
      : join(root, "public/orderflow/motion/audio", `${target}.m4a`);
  const still = opt("still");
  if (still) await stills(url, target, still.split(",").map(Number));
  else
    await video(url, target, audio, {
      fps: Number(opt("fps", 60)),
      workers: Number(opt("workers", Math.max(1, Math.min(4, cpus().length)))),
      from: Number(opt("from", 0)),
      to: opt("to") ? Number(opt("to")) : undefined,
      crf: Number(opt("crf", 18)),
    });
  server.close();
}
