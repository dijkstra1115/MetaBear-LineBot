#!/usr/bin/env node
// Render the score for motion lessons (or the showreel) from their cue sheets.
//
//   node motion/audio.mjs                 every lesson → public/orderflow/motion/audio/<id>.m4a
//   node motion/audio.mjs footprint wick  selected lessons
//   node motion/audio.mjs showreel        → motion/showreel/out/soundtrack.wav
//
// Encoding to AAC needs ffmpeg (FFMPEG env var, ffmpeg-static, or ffmpeg on PATH).
import { readdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderScore, writeWav } from "./synth.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const lessonsDir = join(root, "public/orderflow/motion/lessons");
const audioDir = join(root, "public/orderflow/motion/audio");
const require = createRequire(join(root, "package.json"));

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    return require("ffmpeg-static");
  } catch {
    return "ffmpeg";
  }
}
const run = (cmd, argv) =>
  new Promise((ok, fail) =>
    spawn(cmd, argv, { stdio: ["ignore", "inherit", "inherit"] }).on("close", (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}`)),
    ),
  );

async function lessonAudio(id) {
  const { lesson } = await import(pathToFileURL(join(lessonsDir, `${id}.js`)).href);
  const started = Date.now();
  const score = renderScore({ duration: lesson.duration, cues: lesson.cues ?? [], music: lesson.music });
  const wav = join(here, "out/audio", `${id}.wav`);
  await writeWav(wav, score);
  const out = join(audioDir, `${id}.m4a`);
  await run(ffmpegPath(), [
    "-y",
    "-loglevel",
    "error",
    "-i",
    wav,
    "-c:a",
    "aac",
    "-b:a",
    "112k",
    "-movflags",
    "+faststart",
    out,
  ]);
  await rm(wav);
  console.log(`${id}: ${lesson.duration}s score → ${out} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

async function showreelAudio() {
  const { CUES, TOTAL, MUSIC } = await import(pathToFileURL(join(here, "showreel/src/timeline.js")).href);
  const score = renderScore({ duration: TOTAL, cues: CUES, music: MUSIC });
  const wav = join(here, "showreel/out/soundtrack.wav");
  await writeWav(wav, score);
  console.log(`showreel → ${wav}`);
}

const ids = process.argv.slice(2);
if (ids.includes("showreel")) await showreelAudio();
const lessonIds = ids.filter((id) => id !== "showreel");
const all = (await readdir(lessonsDir)).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3));
for (const id of lessonIds.length ? lessonIds : ids.length ? [] : all) await lessonAudio(id);
