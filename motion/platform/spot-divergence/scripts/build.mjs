// index.html from scripts/template.html with the cue times of scripts/cues.json filled in, and
// assets/video/rewind.mp4: the trade take from entry to target played backwards, fast.
// node scripts/build.mjs   (FFMPEG= points at ffmpeg)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FF, PROJECT } from "./rig.mjs";

const cues = JSON.parse(readFileSync(join(PROJECT, "scripts/cues.json"), "utf8"));
const names = Object.keys(cues).filter((k) => typeof cues[k] === "number");
const calc = new Function(...names, "expr", "return eval(expr)");
const html = readFileSync(join(PROJECT, "scripts/template.html"), "utf8")
  .replace(/\{\{([^}]+)\}\}/g, (_, expr) => String(Math.round(calc(...names.map((k) => cues[k]), expr) * 1000) / 1000))
  .replace("/*CUES*/", JSON.stringify(cues));
writeFileSync(join(PROJECT, "index.html"), html);

const take = join(PROJECT, "assets/video/trade.mp4");
const out = join(PROJECT, "assets/video/rewind.mp4");
const span = cues.context - cues.rewind + 0.2;
if (existsSync(take)) {
  // 18:27 entry (2.33 s) to the target (5.4 s) backwards in `span` seconds.
  const r = spawnSync(FF, ["-y", "-loglevel", "error", "-ss", "2.2", "-t", "3.2", "-i", take, "-vf", `reverse,setpts=PTS*${(span / 3.2).toFixed(4)},fps=30`, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-movflags", "+faststart", out], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg rewind failed");
}
console.log("index.html, rewind.mp4");
