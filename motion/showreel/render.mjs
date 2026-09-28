#!/usr/bin/env node
// Renders the showreel frame-by-frame in headless Chromium and encodes it with
// ffmpeg. Every frame is a pure function of time, so workers render disjoint
// ranges in parallel and the segments are concatenated losslessly.
//
//   node motion/showreel/render.mjs                 full render → out/metabear-academy-showreel.mp4
//   node motion/showreel/render.mjs --still 3,14.5  PNG stills into out/stills/
//   node motion/showreel/render.mjs --serve         preview at http://127.0.0.1:8791/?preview
//   options: --fps 60  --workers 4  --from 0 --to 86  --crf 16
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const outDir = join(here, "out");
const require = createRequire(join(root, "package.json"));

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const fontPkgs = {
  "noto-sans-tc": "@fontsource-variable/noto-sans-tc",
  "barlow-condensed": "@fontsource/barlow-condensed",
  "jetbrains-mono": "@fontsource-variable/jetbrains-mono",
};
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".mp4": "video/mp4",
};

function serve(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let file;
      const m = path.match(/^\/fonts\/([^/]+)\/(.+)$/);
      if (m && fontPkgs[m[1]]) file = join(pkgDir(fontPkgs[m[1]]), m[2]);
      else file = join(here, path === "/" ? "index.html" : path);
      if (!file.startsWith(here) && !m) throw new Error("outside root");
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": types[extname(file)] ?? "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((ok) =>
    server.listen(port, "127.0.0.1", () => ok(server)),
  );
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
    p.on("close", (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}`)),
    ),
  );
  return { p, done };
}

async function openPage(browser, url) {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => console.error("[page]", e.message));
  page.on(
    "console",
    (m) => m.type() === "error" && console.error("[console]", m.text()),
  );
  await page.goto(url, { timeout: 180000 });
  await page.evaluate(() => window.ready);
  return page;
}

// PNG encoding costs ~4x the draw itself, so video frames travel as q0.95 JPEG
// (visually lossless ahead of x264); stills stay PNG.
const grab = (page, t, i, type = "png") =>
  page.evaluate(
    ([t, i, type]) => {
      window.renderFrame(t, i);
      const url = document
        .getElementById("stage")
        .toDataURL(`image/${type}`, 0.95);
      return url.slice(url.indexOf(",") + 1);
    },
    [t, i, type],
  );

async function stills(url, times) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await openPage(browser, url);
  const dir = join(outDir, "stills");
  await mkdir(dir, { recursive: true });
  for (const t of times) {
    const b64 = await grab(page, t, Math.round(t * 60));
    const file = join(dir, `t${t.toFixed(2).padStart(6, "0")}.png`);
    await writeFile(file, Buffer.from(b64, "base64"));
    console.log(file);
  }
  await browser.close();
}

async function video(url, { fps, workers, from, to, crf }) {
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
  const segDir = join(outDir, "segments");
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
        const b64 = await grab(page, i / fps, i, "jpeg");
        const buf = Buffer.from(b64, "base64");
        if (!enc.p.stdin.write(buf))
          await new Promise((ok) => enc.p.stdin.once("drain", ok));
        doneFrames++;
        if (doneFrames % 120 === 0) {
          const el = (Date.now() - started) / 1000;
          console.log(
            `frames ${doneFrames}/${count}  ${(doneFrames / el).toFixed(1)} fps  eta ${Math.round((count - doneFrames) / (doneFrames / el))}s`,
          );
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
  await run(ff, [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c",
    "copy",
    silent,
  ]).done;

  const wav = join(outDir, "soundtrack.wav");
  const final = join(
    outDir,
    from === 0 && end === total
      ? "metabear-academy-showreel.mp4"
      : `showreel-${from}-${end}.mp4`,
  );
  if (existsSync(wav)) {
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
      wav,
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "256k",
      "-shortest",
      "-movflags",
      "+faststart",
      final,
    ]).done;
  } else {
    await run(ff, [
      "-y",
      "-loglevel",
      "error",
      "-i",
      silent,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      final,
    ]).done;
  }
  console.log(
    `done in ${((Date.now() - started) / 1000).toFixed(0)}s → ${final}`,
  );
}

const server = await serve(flag("serve") ? Number(opt("port", 8791)) : 0);
const url = `http://127.0.0.1:${server.address().port}/`;
if (flag("serve")) {
  console.log(`preview: ${url}?preview`);
} else {
  await mkdir(outDir, { recursive: true });
  const still = opt("still");
  if (still) await stills(url, still.split(",").map(Number));
  else
    await video(url, {
      fps: Number(opt("fps", 60)),
      workers: Number(opt("workers", Math.max(1, Math.min(4, cpus().length)))),
      from: Number(opt("from", 0)),
      to: opt("to") ? Number(opt("to")) : undefined,
      crf: Number(opt("crf", 16)),
    });
  server.close();
}
