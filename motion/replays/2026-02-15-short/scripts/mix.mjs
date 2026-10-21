// Mixes assets/audio/soundtrack.wav: the licensed song (cut so the drop lands on the last exit,
// see cues.mjs) with a pop on each entry, a chime on each target and a low thud on the stop.
// Run from this folder: node scripts/mix.mjs   (needs ffmpeg; FFMPEG= to override)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { END, ENDCARD_AT, EVENTS, SONG_OFFSET } from "./cues.mjs";

const D = JSON.parse(readFileSync("assets/data/replay.json", "utf8"));
const FF = process.env.FFMPEG || "ffmpeg";
const inputs = ["-ss", String(SONG_OFFSET), "-t", String(END), "-i", "assets/audio/song.mp3"];
const chains = [`[0:a]aresample=48000,afade=t=in:d=0.12,afade=t=out:st=${(END - 1.4).toFixed(2)}:d=1.4,volume=-4dB[m0]`];
const mixes = ["[m0]"];
let n = 1;
function place(file, at, gainDb) {
  inputs.push("-i", `assets/audio/sfx/${file}.mp3`);
  const label = `m${mixes.length}`;
  chains.push(`[${n++}:a]aresample=48000,adelay=${Math.round(at * 1000)}:all=1,volume=${gainDb}dB[${label}]`);
  mixes.push(`[${label}]`);
}
for (const e of EVENTS) {
  if (e.type === "entry") place("ui-3-pop", e.t, -2);
  else if (D.trades[e.trade].result === "tp") place("ui-5-glass", e.t, -3);
  else {
    place("ui-thud", e.t, 0);
    place("sub-drop", e.t - 0.05, -4);
  }
}
place("whoosh-deep", ENDCARD_AT - 0.35, -8);
const graph = `${chains.join(";")};${mixes.join("")}amix=inputs=${mixes.length}:normalize=0,alimiter=limit=0.95,atrim=0:${END}[out]`;
execFileSync(FF, ["-y", "-v", "error", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ac", "2", "-ar", "48000", "assets/audio/soundtrack.wav"], { stdio: "inherit" });
console.log(`soundtrack.wav: ${END}s, song from ${SONG_OFFSET}s, ${EVENTS.length} cues`);
