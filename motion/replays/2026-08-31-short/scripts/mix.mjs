// Mixes assets/audio/soundtrack.wav: sound effects carry it, all synthesized by scripts/sfx.py as
// one family (a click on each bar while bars come slowly, a two-note ping on each alert, a blip on
// each entry, a chime on each target, a muted fall on a stop, a swell into the end card). The
// licensed song sits under them at −28 dB (−50 dB was inaudible on a phone), so the film reads as
// a working tool, not an advert.
// Run from this folder: python scripts/sfx.py && node scripts/mix.mjs   (needs ffmpeg; FFMPEG= to override)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { END, ENDCARD_AT, EVENTS, REVEAL } from "./cues.mjs";

const D = JSON.parse(readFileSync("assets/data/replay.json", "utf8"));
const FF = process.env.FFMPEG || "ffmpeg";
// A silent bed, so the mix always runs the full length, then the song.
const inputs = ["-f", "lavfi", "-t", String(END), "-i", "anullsrc=r=48000:cl=stereo", "-t", String(END), "-i", "assets/audio/song.mp3"];
const chains = ["[0:a]anull[m0]", `[1:a]aresample=48000,afade=t=in:d=1.5,afade=t=out:st=${(END - 2).toFixed(2)}:d=2,volume=-28dB[m1]`];
const mixes = ["[m0]", "[m1]"];
let n = 2;

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
console.log(`soundtrack.wav: ${END}s, ${ticks.length} bar clicks, ${at("alert").length} alerts, ${at("entry").length} entries, song at -28 dB, synthesized effects`);
