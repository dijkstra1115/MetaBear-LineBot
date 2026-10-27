// Exports the rendered cases as a 720×1280 web encode and a poster (the frame where the result
// lands) per case into ../../out/web/, with their card data in ../../out/web/cases.json. The
// homepage case wall now shows motion/replays/segments, whose export writes web/case-wall-data.js.
// Run from this folder after render-all.sh: node scripts/export-web.mjs   (FFMPEG= to override)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { CASES } from "./cases.mjs";
import { cues } from "./cues.mjs";

const FF = process.env.FFMPEG || "ffmpeg";
const OUT = "../../out/web";
mkdirSync(OUT, { recursive: true });
const tpe = (ms) => new Date(ms + 8 * 3600_000).toISOString();
const cases = [];
for (const id of Object.keys(CASES).sort().reverse()) {
  const D = JSON.parse(readFileSync(`assets/data/${id}.json`, "utf8"));
  const Q = cues(D);
  const src = `../../out/case-${id}.mp4`;
  const exitAt = Q.EVENTS.find((e) => e.type === "exit").t + 0.6;
  execFileSync(FF, ["-v", "error", "-y", "-i", src, "-vf", "scale=720:1280", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "96k", `${OUT}/case-${id}.mp4`]);
  execFileSync(FF, ["-v", "error", "-y", "-ss", String(exitAt), "-i", src, "-frames:v", "1", "-vf", "scale=540:960", "-c:v", "libwebp", "-quality", "78", `${OUT}/case-${id}.webp`]);
  const T = D.trade;
  const signalT = D.ones[T.signal][0];
  cases.push({
    id,
    no: D.no,
    title: D.title,
    tag: D.tag,
    dir: D.dir,
    date: tpe(signalT).slice(0, 10),
    entryAt: tpe(signalT + 60_000).slice(11, 16),
    entry: T.entry,
    stop: T.stop,
    target: T.tp,
    r: T.r,
    riskPct: +((Math.abs(T.entry - T.stop) / T.entry) * 100).toFixed(2),
    minutes: Math.round((D.ones[T.exit][0] - signalT) / 60_000),
    evidence: D.alerts.map((a) => ({ at: tpe(a.at).slice(11, 16), text: a.text })),
    seconds: +Q.END.toFixed(1),
  });
  const mb = (f) => (statSync(f).size / 1e6).toFixed(2);
  console.log(`${id}: video ${mb(`${OUT}/case-${id}.mp4`)} MB, poster ${mb(`${OUT}/case-${id}.webp`)} MB`);
}
writeFileSync(`${OUT}/cases.json`, JSON.stringify(cases, null, 2));
console.log(`${OUT}/cases.json: ${cases.length} cases`);
