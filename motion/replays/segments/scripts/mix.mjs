// Mixes assets/audio/soundtrack.wav for one stretch: the synthesized effects from scripts/sfx.py
// only, no music, as the case shorts (a click on each slow bar, a two-note ping on each alert, a
// blip on each entry, a chime on a target, a muted fall on a stop, a swell into the end card).
// Run from this folder: python scripts/sfx.py && node scripts/mix.mjs 2026-09-14   (needs ffmpeg; FFMPEG= to override)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { END, ENDCARD_AT, EVENTS, REVEAL } from "./cues.mjs";

const D = JSON.parse(readFileSync(`assets/data/${process.argv[2]}.json`, "utf8"));
const FF = process.env.FFMPEG || "ffmpeg";
const inputs = ["-f", "lavfi", "-t", String(END), "-i", "anullsrc=r=48000:cl=stereo"];
const chains = ["[0:a]anull[m0]"];
const mixes = ["[m0]"];
let n = 1;
// Each effect is decoded once and split to every time it plays.
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
// Bar clicks only where bars are at least 1/12 s apart: near a signal and while a position is open.
const ticks = [];
for (let i = D.history; i + 1 < REVEAL.length; i++) if (REVEAL[i + 1] - REVEAL[i] >= 1 / 12) ticks.push(REVEAL[i]);
const at = (type, pick = () => true) => EVENTS.filter((e) => e.type === type && pick(e)).map((e) => e.t);
play("tick", ticks, -10);
play("alert", at("alert"), -4);
play("entry", at("entry"), 0);
play("target", at("exit", (e) => D.trades[e.trade].result === "tp"), -1);
play("stop", at("exit", (e) => D.trades[e.trade].result === "stop"), 1);
play("swell", [ENDCARD_AT - 0.5], -4);

const graph = `${chains.join(";")};${mixes.join("")}amix=inputs=${mixes.length}:normalize=0,alimiter=limit=0.95,atrim=0:${END}[out]`;
execFileSync(FF, ["-y", "-v", "error", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ac", "2", "-ar", "48000", "assets/audio/soundtrack.wav"], { stdio: "inherit" });
console.log(`soundtrack.wav: ${END}s, ${ticks.length} bar clicks, ${at("alert").length} alerts, ${at("entry").length} entries`);
