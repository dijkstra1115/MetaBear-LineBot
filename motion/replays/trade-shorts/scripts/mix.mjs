// Mixes assets/audio/soundtrack.wav for the case built last (scripts/.cues.json): the synthesized effects
// from scripts/sfx.py only, no music: a click on each slow 1-minute bar, a two-note ping on each
// alert, a blip on the entry, a chime on the target, a swell into the end card.
// Run from this folder: python scripts/sfx.py && node scripts/mix.mjs   (needs ffmpeg; FFMPEG= to override)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const Q = JSON.parse(readFileSync("scripts/.cues.json", "utf8")); // written by build.mjs
const { END, ENDCARD_AT, EVENTS, REVEAL1 } = Q;
const FF = process.env.FFMPEG || "ffmpeg";
const inputs = ["-f", "lavfi", "-t", String(END), "-i", "anullsrc=r=48000:cl=stereo"];
const chains = ["[0:a]anull[m0]"];
const mixes = ["[m0]"];
let n = 1;
function play(name, times, gainDb) {
  if (!times.length) return;
  inputs.push("-i", `assets/audio/sfx/synth/${name}.wav`);
  const idx = n++;
  chains.push(`[${idx}:a]asplit=${times.length}${times.map((_, k) => `[${name}${k}]`).join("")}`);
  times.forEach((at, k) => {
    const label = `m${mixes.length}`;
    chains.push(`[${name}${k}]adelay=${Math.round(at * 1000)}:all=1,volume=${gainDb}dB[${label}]`);
    mixes.push(`[${label}]`);
  });
}
// Clicks where bars are at least 1/12 s apart.
const ticks = [];
for (let i = 0; i + 1 < REVEAL1.length; i++) if (REVEAL1[i] > 0 && REVEAL1[i] < 1e8 && REVEAL1[i + 1] - REVEAL1[i] >= 1 / 12 && REVEAL1[i + 1] < 1e8) ticks.push(REVEAL1[i]);
const at = (type) => EVENTS.filter((e) => e.type === type).map((e) => e.t);
play("tick", ticks, -10);
play("alert", at("alert"), -4);
play("entry", at("entry"), 0);
play(Q.STOP ? "stop" : "target", at("exit"), Q.STOP ? 1 : -1);
play("swell", [ENDCARD_AT - 0.5], -4);
const graph = `${chains.join(";")};${mixes.join("")}amix=inputs=${mixes.length}:normalize=0,alimiter=limit=0.95,atrim=0:${END}[out]`;
execFileSync(FF, ["-y", "-v", "error", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ac", "2", "-ar", "48000", "assets/audio/soundtrack.wav"], { stdio: "inherit" });
console.log(`soundtrack.wav: ${END}s, ${ticks.length} clicks, ${at("alert").length} alerts`);
