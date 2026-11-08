// index.html from scripts/template.html with the film's clock (assets/audio/vo/timeline.json) filled
// in: {{expr}} placeholders, the timeline object for the script, and one subtitle clip per
// narration line (中文 above, English below), shown while that line is spoken.
// node scripts/build.mjs   (run scripts/timeline.mjs first)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FF, PROJECT } from "./rig.mjs";

const T = JSON.parse(readFileSync(join(PROJECT, "assets/audio/vo/timeline.json"), "utf8"));
const names = Object.keys(T).filter((k) => typeof T[k] === "number");
const calc = new Function(...names, "expr", "return eval(expr)");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
// The closing line is on screen as large type, so it gets no subtitle; the first one is up at frame 0.
const subs = T.lines
  .filter((l) => !l.claim)
  .map((l, k) => {
    const from = k === 0 ? 0 : l.at;
    return `      <div id="s${String(l.n).replace(".", "b")}" class="clip sub" data-start="${from}" data-duration="${Math.round((l.until - from) * 100) / 100}" data-track-index="3"><div class="zh">${esc(l.zh)}</div><div class="en">${esc(l.en)}</div></div>`;
  })
  .join("\n");
const html = readFileSync(join(PROJECT, "scripts/template.html"), "utf8")
  .replace(/\{\{([^}]+)\}\}/g, (_, expr) => String(Math.round(calc(...names.map((k) => T[k]), expr) * 1000) / 1000))
  .replace("/*TIMELINE*/", JSON.stringify(T))
  .replace("<!--SUBS-->", subs);
writeFileSync(join(PROJECT, "index.html"), html);
// assets/video/rewind.mp4: the result take from the target back to 21:48, fast and backwards,
// filling the hook's rewind into the evening.
const take = join(PROJECT, "assets/video/result.mp4");
if (existsSync(take)) {
  const len = T.reaches - T.result + 0.6;
  const span = T.context - T.rewind + 0.3;
  const r = spawnSync(FF, ["-y", "-loglevel", "error", "-t", String(len), "-i", take, "-vf", `reverse,setpts=PTS*${(span / len).toFixed(4)},fps=30`, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-movflags", "+faststart", join(PROJECT, "assets/video/rewind.mp4")], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg rewind failed");
}
console.log(`index.html: ${T.lines.length - 1} subtitles, ${T.duration} s`);
