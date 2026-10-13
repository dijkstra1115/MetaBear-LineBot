// Mixes assets/audio/soundtrack.wav: narration (sped up and warmed, see cues.mjs), a low drone,
// a heartbeat under the selling, sound marks on the beats, and a pad that enters at the reclaim.
// Run from this folder: node scripts/mix.mjs   (needs ffmpeg with rubberband)
import { execFileSync } from "node:child_process";
import { C, END, OFF, VOICE_FX } from "./cues.mjs";

const FF = process.env.FFMPEG || "ffmpeg";
const inputs = [];
const chains = [];
const mixes = [];
let n = 0;

function input(args) {
  inputs.push(...args);
  return n++;
}
function place(idx, at, gainDb, extra = "") {
  const label = `m${mixes.length}`;
  chains.push(`[${idx}:a]${extra}${extra ? "," : ""}adelay=${Math.round(at * 1000)}:all=1,volume=${gainDb}dB[${label}]`);
  mixes.push(`[${label}]`);
}
const sfx = (name) => input(["-i", `assets/audio/sfx/${name}.mp3`]);
const synth = (expr, dur) => input(["-f", "lavfi", "-t", String(dur), "-i", `aevalsrc=${expr}:s=48000:c=stereo`]);

// Narration.
place(input(["-i", "assets/audio/vo-raw.wav"]), OFF, 0, VOICE_FX);

// Drone for the whole film: two low sines with a slow beat; louder from the selling to the reclaim.
const drone = synth("0.16*sin(2*PI*41*t)+0.1*sin(2*PI*55.3*t)+0.04*sin(2*PI*82.6*t)", END);
place(drone, 0, -6, `afade=t=in:d=2,afade=t=out:st=${(END - 2.5).toFixed(2)}:d=2.5,volume='if(between(t,${C.s3},${C.back}),1.9,1)':eval=frame`);

// Heartbeat under the last 25 minutes of selling, speeding up toward the 60,000 tests.
const thump = synth("0.9*sin(2*PI*52*t)*exp(-t*16)+0.5*sin(2*PI*78*t)*exp(-t*24)", 0.35);
let beat = C.s3 + 0.2;
let gap = 1.0;
const beats = [];
while (beat < C.stuck) {
  beats.push(beat, beat + 0.22);
  beat += gap;
  gap = Math.max(0.5, gap * 0.95);
}
const hb = `hb`;
chains.push(`[${thump}:a]asplit=${beats.length}${beats.map((_, i) => `[${hb}${i}]`).join("")}`);
beats.forEach((t, i) => {
  const label = `m${mixes.length}`;
  const second = i % 2 === 1;
  chains.push(`[${hb}${i}]adelay=${Math.round(t * 1000)}:all=1,volume=${second ? -9 : -4}dB[${label}]`);
  mixes.push(`[${label}]`);
});

// Sound marks.
place(sfx("sub-drop"), C.slam - 0.15, -2); // 59,800 lands
place(sfx("whoosh-deep"), C.s2 - 0.4, -8);
place(sfx("whoosh-deep"), C.s3 - 0.4, -6);
place(sfx("whoosh-bass-drop"), C.s4 - 0.5, -4); // hard cut into the footprint
place(sfx("ui-thud"), C.sixty, -8);
place(sfx("ui-thud"), C.third, -8);
place(sfx("whoosh-bass-drop"), C.pierce - 0.3, -3); // the pierce, slow motion
place(sfx("sub-drop"), C.stuck, -1); // freeze: it cannot go lower
place(sfx("whoosh-deep"), C.back - 0.3, -6); // back above 60,000
place(sfx("whoosh-deep"), C.s6 - 0.3, -7);
place(sfx("ui-thud"), C.s8, -6);

// Pad: A minor add9, enters at the reclaim, swells through the V, settles under the honesty beat.
const padLen = C.s8 + 2 - C.back;
const pad = synth(
  "0.06*sin(2*PI*110*t)+0.05*sin(2*PI*164.81*t)+0.045*sin(2*PI*220*t)+0.035*sin(2*PI*246.94*t)+0.03*sin(2*PI*329.63*t)",
  padLen,
);
const swell = `if(lt(t,${(C.s6 - C.back).toFixed(2)}),1,if(lt(t,${(C.s7 - C.back).toFixed(2)}),1.8,0.8))`;
place(pad, C.back, -3, `tremolo=f=0.2:d=0.3,volume='${swell}':eval=frame,afade=t=in:d=2.5,afade=t=out:st=${(padLen - 2.5).toFixed(2)}:d=2.5`);

const graph = `${chains.join(";")};${mixes.join("")}amix=inputs=${mixes.length}:normalize=0,atrim=0:${END},loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
execFileSync(FF, ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", "-ac", "2", "assets/audio/soundtrack.wav"], { stdio: "inherit" });
console.log(`soundtrack.wav ${END}s, ${mixes.length} layers`);
