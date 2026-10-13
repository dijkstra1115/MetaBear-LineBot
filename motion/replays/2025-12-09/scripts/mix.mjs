// Mixes assets/audio/soundtrack.wav. Every sound is generated here (ffmpeg aevalsrc and
// anoisesrc): a low bed, landings, laser lines, the break, a whoosh back up, check ticks,
// the three same-pitch absorption hits, the reclaim chord, the entry, a waiting pulse and
// the two targets. Run from this folder: node scripts/mix.mjs   (needs ffmpeg with rubberband)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { C, CHUNKS, CHUNK_START, END, EV_DUR, EV_T0, VOICE_FX } from "./cues.mjs";

const FF = process.env.FFMPEG || "ffmpeg";
const inputs = [];
const chains = [];
const mixes = [];
let n = 0;
const input = (args) => (inputs.push(...args), n++);
const synth = (expr, dur) => input(["-f", "lavfi", "-t", String(dur), "-i", `aevalsrc=${expr}:s=48000:c=stereo`]);
const noise = (dur, color = "pink") => input(["-f", "lavfi", "-t", String(dur), "-i", `anoisesrc=d=${dur}:c=${color}:r=48000:a=0.6`]);
function place(idx, at, gainDb, extra = "") {
  const label = `m${mixes.length}`;
  chains.push(`[${idx}:a]${extra}${extra ? "," : ""}aformat=channel_layouts=stereo,adelay=${Math.round(at * 1000)}:all=1,volume=${gainDb}dB[${label}]`);
  mixes.push(`[${label}]`);
}
// One synthesized sound placed at several times.
function many(expr, dur, times, gainDb, extra = "") {
  times.forEach((t) => place(synth(expr, dur), t, gainDb, extra));
}

// Sound palette.
const LAND = "0.8*sin(2*PI*(70-30*t)*t)*exp(-t*9)"; // low landing
const LASER = "0.35*sin(2*PI*(600+2600*t)*t)*exp(-t*5)"; // rising line
const TICK = "0.5*sin(2*PI*900*t)*exp(-t*40)"; // a small tap
// Two notes a little apart (lavfi arguments cannot contain commas, so no gt()).
const CHECK_LO = "0.4*sin(2*PI*1320*t)*exp(-t*18)";
const CHECK_HI = "0.32*sin(2*PI*1760*t)*exp(-t*18)";
const DROP = "0.9*sin(2*PI*(110*exp(-t*1.6)+38)*t)*exp(-t*1.4)"; // the break
const ABSORB = "0.55*sin(2*PI*330*t)*exp(-t*10)+0.2*sin(2*PI*660*t)*exp(-t*14)"; // same pitch each time
const NEEDLE = "0.5*sin(2*PI*1980*t)*exp(-t*30)+0.6*sin(2*PI*60*t)*exp(-t*8)";
const TARGET = "0.45*(sin(2*PI*880*t)+0.6*sin(2*PI*1318.5*t)+0.4*sin(2*PI*1760*t))*exp(-t*3.2)";
const PULSE = "0.6*sin(2*PI*55*t)*exp(-t*12)";

// Narration: the recorded chunks back to back (a chunk not recorded yet is skipped).
CHUNKS.forEach((c, i) => {
  if (existsSync(c.file)) place(input(["-i", c.file]), CHUNK_START[i], 0, VOICE_FX);
  else console.log(`(no ${c.file} yet: silent there)`);
});

// Bed: two low sines with a slow beat for the whole film.
place(synth("0.13*sin(2*PI*43*t)+0.08*sin(2*PI*64.6*t)+0.03*sin(2*PI*86*t)", END), 0, -7, `afade=t=in:d=0.3,afade=t=out:st=${(END - 3).toFixed(2)}:d=3`);
// Camera travel: a band-passed noise swell on each dive, pass-through and whip.
const whoosh = (t, dur, f, gain) => place(noise(dur), t, gain, `bandpass=f=${f}:w=${f},afade=t=in:d=${(dur * 0.6).toFixed(2)},afade=t=out:st=${(dur * 0.6).toFixed(2)}:d=${(dur * 0.4).toFixed(2)}`);

// Hook: the break first (it is what the first words say), then the hard cut to the surge and
// its two targets, then the four words on the beat.
whoosh(0, 0.5, 500, -14);
place(synth(DROP, 1.6), 0.5, -2);
whoosh(C.hook2 - 0.1, 0.6, 1200, -14);
many(TARGET, 1.2, [C.hook2 + 0.75, C.hook2 + 1.15], -6);
whoosh(C.four - 0.4, 0.5, 600, -16);
many(LAND, 0.5, [C.four, C.four + 0.24, C.four + 0.48, C.four + 0.72], -5);
// 2. Location: two laser lines and the OI jump.
many(LASER, 0.5, [C.low, C.val], -14);
many(TICK, 0.2, [C.newOi + 0.3], -6);
// 3. The dive into the bar, the break, the bounce.
whoosh(C.s3 + 0.1, 0.8, 500, -12);
place(synth(DROP, 2.4), C.brk, -1);
place(noise(0.6, "brown"), C.brk, -10, "lowpass=f=400,afade=t=out:d=0.6");
whoosh(C.back - 0.35, 1.1, 1800, -16);
// 4–7. Confirmations: OI cliff, pass-through into the footprint, three absorption hits, three lows, reclaim chord.
whoosh(C.s4 + 0.1, 0.8, 500, -14);
place(synth(DROP, 1.2), C.oiDrop, -9);
whoosh(C.s5 + 0.1, 1.2, 700, -11);
many(ABSORB, 0.45, [C.sold, C.sold + 0.38, C.sold + 0.76], -6);
whoosh(C.s6 + 0.1, 0.9, 600, -14);
many(TICK, 0.2, [C.lessSell - 1.2, C.lessSell - 0.8, C.lessSell - 0.4], -9);
const chord = "0.07*sin(2*PI*220*t)+0.06*sin(2*PI*277.18*t)+0.05*sin(2*PI*329.63*t)+0.04*sin(2*PI*440*t)";
place(synth(chord, 3.2), C.reclaim, -2, "afade=t=in:d=0.4,afade=t=out:st=1.6:d=1.6");
const checks = EV_T0.map((t) => t + EV_DUR);
many(CHECK_LO, 0.3, checks, -7);
many(CHECK_HI, 0.3, checks.map((t) => t + 0.07), -7);
// 8. Execution: into the re-test footprint, the imbalance taps, back out, the entry, the risk lines.
whoosh(C.s8 + 0.1, 1.0, 700, -12);
many(TICK, 0.2, [C.imb + 0.4, C.imb + 0.7], -7);
whoosh(C.entry - 0.6, 0.6, 1400, -14);
place(synth(NEEDLE, 0.6), C.entry, -3);
many(LASER, 0.5, [C.stop + 0.3, C.targets + 0.3, C.targets + 1.2], -15);
// 9. The wait: a slow pulse that quickens into the surge; the whip up; the two targets.
for (let t = C.s9 + 0.3, gap = 0.62; t < C.surge; t += gap, gap = Math.max(0.28, gap * 0.95)) many(PULSE, 0.3, [t], -7);
whoosh(C.surge - 0.2, 0.7, 1200, -12);
place(synth(TARGET, 1.6), C.t1, -4);
place(synth(TARGET, 1.8), C.t2, -3);
// 10. Pull back; a last landing under the end card.
whoosh(C.s10, 1.4, 400, -14);
many(LAND, 0.6, [C.s10 + 0.6], -5);

const graph = `${chains.join(";")};${mixes.join("")}amix=inputs=${mixes.length}:normalize=0,atrim=0:${END},loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
execFileSync(FF, ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", "-ac", "2", "assets/audio/soundtrack.wav"], { stdio: "inherit" });
console.log(`soundtrack.wav ${END}s, ${mixes.length} layers`);
