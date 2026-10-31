// Exports the rendered single-trade shorts for the case wall's player: a 720×1280 web encode and a
// poster (the frame where the result lands) per trade into ../../out/website/web/. The case wall links each
// trade in a stretch's list to trade-<stretch>-<n> (web/case-wall-data.js, written by
// motion/replays/segments/scripts/export-web.mjs). The media are uploaded to R2 separately.
// Run from this folder after rendering ../../out/website/trade-<id>.mp4: node scripts/export-web.mjs   (FFMPEG= to override)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { cues } from "./cues.mjs";
import { trades } from "./trades.mjs";

const FF = process.env.FFMPEG || "ffmpeg";
const OUT = "../../out/website/web";
mkdirSync(OUT, { recursive: true });
for (const { id } of trades()) {
  const D = JSON.parse(readFileSync(`assets/data/${id}.json`, "utf8"));
  const exitAt = cues(D).EVENTS.find((e) => e.type === "exit").t + 0.6;
  const src = `../../out/website/trade-${id}.mp4`;
  execFileSync(FF, ["-v", "error", "-y", "-i", src, "-vf", "scale=720:1280", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "96k", `${OUT}/trade-${id}.mp4`]);
  execFileSync(FF, ["-v", "error", "-y", "-ss", String(exitAt), "-i", src, "-frames:v", "1", "-vf", "scale=540:960", "-c:v", "libwebp", "-quality", "78", `${OUT}/trade-${id}.webp`]);
  const mb = (f) => (statSync(f).size / 1e6).toFixed(2);
  console.log(`${id}: video ${mb(`${OUT}/trade-${id}.mp4`)} MB, poster ${mb(`${OUT}/trade-${id}.webp`)} MB`);
}
