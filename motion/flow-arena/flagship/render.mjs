#!/usr/bin/env node
// Renders the FLOW ARENA flagship film. Every frame is a pure function of time, so parallel
// headless-Chromium workers render disjoint ranges, ffmpeg joins them losslessly and muxes the
// synthesized score.
//
//   node render.mjs                      → motion/out/flow-arena-flagship.mp4 (1080p60 + score)
//   node render.mjs --still 15,33.8      → motion/out/stills/flagship-*.png
//   node render.mjs --sheet 0:60:2       → motion/out/stills/flagship-sheet.png (contact sheet)
//   node render.mjs --serve              → preview URL (scrub / play with the score)
//   options: --fps 60  --workers 4  --from 0  --to 60  --crf 18  --no-audio
//   CHROMIUM_PATH=/path/to/chrome when Playwright's bundled browser is not installed.
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const outDir = join(root, "motion/out");
const PAGE = "/motion/flow-arena/flagship/index.html?render";
const NAME = "flow-arena-flagship";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

function serve(port = 0) {
  const allowed = [join(root, "public") + sep, join(root, "motion") + sep];
  const files = [join(root, "metabear-logo-white-bg-original.png")];
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = resolve(root, "." + path);
      if (!allowed.some((a) => file.startsWith(a)) && !files.includes(file)) throw new Error("outside");
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

async function launch() {
  const { chromium } = await import("playwright");
  // Everything is drawn and finished on the CPU; no GPU process work is needed.
  const options = { args: ["--disable-gpu", "--disable-gpu-compositing"] };
  if (process.env.CHROMIUM_PATH) options.executablePath = process.env.CHROMIUM_PATH;
  try {
    return await chromium.launch(options);
  } catch (error) {
    console.error("Chromium failed to start. Set CHROMIUM_PATH to a Chrome/Chromium binary if Playwright's is missing.");
    throw error;
  }
}

function run(cmd, argv, stdio = ["ignore", "inherit", "inherit"]) {
  const p = spawn(cmd, argv, { stdio });
  const done = new Promise((ok, fail) =>
    p.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}`)))),
  );
  return { p, done };
}
const ff = process.env.FFMPEG || "ffmpeg";

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  // A module that fails to load never defines window.ready, so fail on the first page error.
  const failed = new Promise((_, fail) => page.on("pageerror", (e) => fail(e)));
  page.on("console", (m) => m.type() === "error" && console.error("[console]", m.text()));
  await page.goto(url, { timeout: 180000 });
  await Promise.race([
    failed,
    page.waitForFunction(() => window.ready !== undefined, null, { timeout: 180000 }).then(() => page.evaluate(() => window.ready)),
  ]);
  return page;
}

const grab = (page, t, i, type, quality = 0.95) =>
  page.evaluate(
    ([t, i, type, quality]) => {
      window.renderFrame(t, i);
      const url = document.getElementById("stage").toDataURL(`image/${type}`, quality);
      return url.slice(url.indexOf(",") + 1);
    },
    [t, i, type, quality],
  );

async function stills(url, times) {
  const browser = await launch();
  const page = await openPage(browser, url);
  const dir = join(outDir, "stills");
  await mkdir(dir, { recursive: true });
  for (const t of times) {
    const b64 = await grab(page, t, Math.round(t * 60), "png");
    const file = join(dir, `flagship-${t.toFixed(2).padStart(6, "0")}.png`);
    await writeFile(file, Buffer.from(b64, "base64"));
    console.log(file);
  }
  await browser.close();
}

async function sheet(url, spec) {
  const [a, b, s] = spec.split(":").map(Number);
  const times = [];
  for (let t = a; t < b - 1e-6; t += s) times.push(Math.round(t * 1000) / 1000);
  const browser = await launch();
  const page = await openPage(browser, url);
  const b64 = await page.evaluate((times) => {
    const cols = 4;
    const tw = 480;
    const th = 270;
    const rows = Math.ceil(times.length / cols);
    const c = document.createElement("canvas");
    c.width = cols * tw;
    c.height = rows * (th + 22);
    const g = c.getContext("2d");
    g.fillStyle = "#111";
    g.fillRect(0, 0, c.width, c.height);
    const stage = document.getElementById("stage");
    times.forEach((t, i) => {
      window.renderFrame(t, Math.round(t * 60));
      const x = (i % cols) * tw;
      const y = Math.floor(i / cols) * (th + 22);
      g.drawImage(stage, x, y, tw, th);
      g.fillStyle = "#fff";
      g.font = "14px monospace";
      g.fillText(t.toFixed(2) + "s", x + 6, y + th + 16);
    });
    const url = c.toDataURL("image/png");
    return url.slice(url.indexOf(",") + 1);
  }, times);
  const dir = join(outDir, "stills");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `flagship-sheet-${a}-${b}.png`);
  await writeFile(file, Buffer.from(b64, "base64"));
  console.log(file);
  await browser.close();
}

async function video(url, { fps, workers, from, to, crf, audio }) {
  const browser = await launch();
  const probe = await openPage(browser, url);
  const total = await probe.evaluate(() => window.TOTAL);
  await probe.close();
  const end = Math.min(to ?? total, total);
  const first = Math.round(from * fps);
  const last = Math.round(end * fps);
  const count = last - first;
  const segDir = join(outDir, `segments-${NAME}`);
  await rm(segDir, { recursive: true, force: true });
  await mkdir(segDir, { recursive: true });
  // Work queue of short chunks, each encoded as its own segment: expensive passages (zoom blurs,
  // cascades) spread across all workers instead of stalling one.
  const CHUNK = fps;
  const chunks = [];
  for (let a = first; a < last; a += CHUNK) chunks.push([a, Math.min(last, a + CHUNK)]);
  const segs = chunks.map((_, k) => join(segDir, `seg${String(k).padStart(4, "0")}.mkv`));
  let next = 0;
  const started = Date.now();
  let doneFrames = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      const page = await openPage(browser, url);
      while (next < chunks.length) {
        const k = next++;
        const [a, b] = chunks[k];
        // Frames travel as q0.96 JPEG (full-range BT.601) and are re-matrixed to BT.709 TV range.
        const enc = run(
          ff,
          [
            "-y", "-loglevel", "error",
            "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
            "-vf", "scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=tv,format=yuv420p",
            "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-tune", "film",
            "-x264-params", `keyint=${fps}:min-keyint=${fps}`,
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            segs[k],
          ],
          ["pipe", "inherit", "inherit"],
        );
        for (let i = a; i < b; i++) {
          const buf = Buffer.from(await grab(page, i / fps, i, "jpeg", 0.96), "base64");
          if (!enc.p.stdin.write(buf)) await new Promise((ok) => enc.p.stdin.once("drain", ok));
          doneFrames++;
          if (doneFrames % 120 === 0) {
            const el = (Date.now() - started) / 1000;
            const rate = doneFrames / el;
            console.log(`${doneFrames}/${count}  ${rate.toFixed(1)} fps  eta ${((count - doneFrames) / rate).toFixed(0)}s`);
          }
        }
        enc.p.stdin.end();
        await enc.done;
      }
      await page.close();
    }),
  );
  await browser.close();
  const list = join(segDir, "list.txt");
  await writeFile(list, segs.map((s) => `file '${s}'`).join("\n"));
  const silent = join(segDir, "video.mkv");
  await run(ff, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent]).done;
  const out = join(outDir, `${NAME}${from > 0 || end < total ? `-${from}-${end}` : ""}.mp4`);
  const wav = join(outDir, `${NAME}.wav`);
  const mux = ["-y", "-loglevel", "error", "-i", silent];
  if (audio && existsSync(wav)) {
    mux.push("-ss", String(from), "-t", String(end - from), "-i", wav, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "320k");
  }
  mux.push("-c:v", "copy", "-movflags", "+faststart", out);
  await run(ff, mux).done;
  console.log(`${out}  (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}

const server = await serve(Number(opt("port", 0)));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  if (flag("serve")) {
    console.log(`${base}/motion/flow-arena/flagship/index.html`);
    await new Promise(() => {});
  } else if (opt("still")) {
    await stills(base + PAGE, opt("still").split(",").map(Number));
  } else if (opt("sheet")) {
    await sheet(base + PAGE, opt("sheet"));
  } else {
    if (!flag("no-audio")) await run(process.execPath, [join(here, "audio/score.mjs")]).done;
    await video(base + PAGE, {
      fps: Number(opt("fps", 60)),
      workers: Number(opt("workers", Math.max(1, Math.min(4, cpus().length)))),
      from: Number(opt("from", 0)),
      to: opt("to") ? Number(opt("to")) : undefined,
      crf: Number(opt("crf", 18)),
      audio: !flag("no-audio"),
    });
  }
} finally {
  server.close();
}
