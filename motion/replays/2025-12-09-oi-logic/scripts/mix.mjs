// Mixes the two audio tracks: assets/audio/vo.wav (the narration, placed per scene and sped up,
// pitch kept) and assets/audio/score.wav (a synthesized bed and every sound effect, generated
// here with ffmpeg aevalsrc/anoisesrc). Run from this folder: node scripts/mix.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { C, END, SCENE, SPEED } from "./cues.mjs";

const FF = process.env.FFMPEG || "ffmpeg";
const S = C;

// The graph goes through a script file: hundreds of generated sources overflow a Windows command line.
function run(inputs, chains, mixes, out, post) {
  const graph = `${chains.join(";\n")};\n${mixes.join("")}amix=inputs=${mixes.length}:normalize=0,atrim=0:${END},${post}[out]`;
  const file = `${out}.graph.txt`;
  writeFileSync(file, graph);
  execFileSync(FF, ["-y", "-v", "error", ...inputs, "-/filter_complex", file, "-map", "[out]", "-ar", "48000", "-ac", "2", out], { stdio: "inherit", maxBuffer: 1 << 26 });
}

// ---------- narration ----------
{
  const inputs = [];
  const chains = [];
  const mixes = [];
  Object.values(SCENE).forEach((s, i) => {
    inputs.push("-i", s.voFile);
    // The file starts at s.vo at film speed; adelay is in output (sped-up) time.
    chains.push(`[${i}:a]atempo=${SPEED},highpass=f=75,equalizer=f=3000:t=q:w=1.2:g=1.5,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=160:makeup=2,aformat=channel_layouts=stereo,adelay=${Math.round(Math.max(0, s.vo) * 1000)}:all=1[v${i}]`);
    mixes.push(`[v${i}]`);
  });
  run(inputs, chains, mixes, "assets/audio/vo.wav", `loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur=${END}`);
  console.log("vo.wav ok");
}

// ---------- score ----------
const inputs = [];
const chains = [];
const mixes = [];
// Sources live inside the graph (no -i inputs): synth/noise return a pad label.
let n = 0;
const source = (src) => (chains.push(`${src}[s${n}]`), `s${n++}`);
const synth = (expr, dur) => source(`aevalsrc=${expr}:s=48000:c=stereo:d=${dur}`);
const noise = (dur, color = "pink") => source(`anoisesrc=d=${dur}:c=${color}:r=48000:a=0.6`);
function place(pad, at, gainDb, extra = "") {
  const label = `m${mixes.length}`;
  chains.push(`[${pad}]${extra}${extra ? "," : ""}aformat=channel_layouts=stereo,adelay=${Math.round(Math.max(0, at) * 1000)}:all=1,volume=${gainDb}dB[${label}]`);
  mixes.push(`[${label}]`);
}
const many = (expr, dur, times, gainDb, extra = "") => times.forEach((t) => place(synth(expr, dur), t, gainDb, extra));

// Palette (lavfi expressions cannot contain commas).
const SLAM = "0.9*sin(2*PI*(120*exp(-t*2.2)+36)*t)*exp(-t*1.8)";
const DROP = "0.9*sin(2*PI*(110*exp(-t*1.6)+38)*t)*exp(-t*1.4)";
const TICK = "0.5*sin(2*PI*900*t)*exp(-t*40)";
const POP = "0.5*sin(2*PI*(520+900*t)*t)*exp(-t*22)";
const CHIME = "0.35*(sin(2*PI*1046.5*t)+0.7*sin(2*PI*1568*t)+0.4*sin(2*PI*2093*t))*exp(-t*4.5)";
const THUD = "0.7*sin(2*PI*(90-40*t)*t)*exp(-t*10)";
const LASER = "0.32*sin(2*PI*(600+2600*t)*t)*exp(-t*5)";
const ABSORB = "0.55*sin(2*PI*330*t)*exp(-t*10)+0.2*sin(2*PI*660*t)*exp(-t*14)";
const NEEDLE = "0.5*sin(2*PI*1980*t)*exp(-t*30)+0.6*sin(2*PI*60*t)*exp(-t*8)";
const TARGET = "0.45*(sin(2*PI*880*t)+0.6*sin(2*PI*1318.5*t)+0.4*sin(2*PI*1760*t))*exp(-t*3.2)";
const PULSE = "0.6*sin(2*PI*55*t)*exp(-t*12)";
const STAMP = "0.8*sin(2*PI*(160*exp(-t*6)+50)*t)*exp(-t*6)";
const SWELL = (f) => `0.22*(sin(2*PI*${f}*t)+0.8*sin(2*PI*${f * 1.25}*t)+0.6*sin(2*PI*${f * 1.5}*t))*(1-exp(-t*2))*exp(-t*0.9)`;
// Whooshes ride camera moves: pink noise through a 2.5-octave band, level with the other event sounds.
// (Until 2026-10-14 they were a near-silent narrow band, ~10 dB under the bed: nobody could hear them.)
function whoosh(at, dur, hz, gainDb) {
  place(noise(dur), at, gainDb, `bandpass=f=${hz}:width_type=o:w=2.5,afade=t=in:d=${(dur * 0.6).toFixed(2)},afade=t=out:st=${(dur * 0.6).toFixed(2)}:d=${(dur * 0.4).toFixed(2)}`);
}
// Rain: a crackle of tiny ticks for pairs pouring into (or splitting out of) the pool.
function rain(t0, t1, perSec, pitch, gainDb, seed) {
  let k = seed;
  for (let t = t0; t < t1; t += 1 / perSec) {
    k = (k * 9301 + 49297) % 233280;
    const f = pitch * (0.8 + (k / 233280) * 0.5);
    place(synth(`0.3*sin(2*PI*${f.toFixed(0)}*t)*exp(-t*55)`, 0.12), t + (k / 233280) * (0.6 / perSec), gainDb);
  }
}

// When the playhead reaches market minute `m` inside a scrub [t0→t1, v0→v1] eased like src/terminal.js.
function hitTime(t0, t1, v0, v1, m) {
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  for (let k = 0; k <= 1; k += 0.0005) if (v0 + (v1 - v0) * ease(k) >= m) return t0 + (t1 - t0) * k;
  return t1;
}
const M = (hhmm) => (Number(hhmm.slice(0, 2)) - 10) * 60 + Number(hhmm.slice(3));
const hookHits = ["23:37", "23:44"].map((h) => hitTime(S.hook.and - 0.05, S.setup.start - 0.15, M("23:28"), M("23:46"), M(h)));
const resultHits = ["23:37", "23:44"].map((h) => hitTime(S.result.targets - 0.1, S.result.apart + 0.9, M("23:34"), M("23:46"), M(h)));

// Bed: a quiet low drone; the terminal look wants restraint, not a score.
place(synth("0.10*sin(2*PI*55*t)+0.05*sin(2*PI*82.41*t)+0.03*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.07*t))", END), 0, -12, `afade=t=in:d=0.3,afade=t=out:st=${(END - 3).toFixed(2)}:d=3`);
place(synth(SWELL(220), 7), S.turn.up - 0.5, -15);
place(synth(SWELL(196), 9), S.close.start, -13);

// Hook: the break, a hard cut, the two targets.
place(synth(DROP, 2.2), S.hook.brk + 0.2, -2);
place(noise(0.6, "brown"), S.hook.brk + 0.2, -12, "lowpass=f=400,afade=t=out:d=0.6");
whoosh(S.hook.and - 0.35, 0.4, 1600, 7);
place(synth(THUD, 0.6), S.hook.and - 0.05, -6);
hookHits.forEach((t, i) => place(synth(TARGET, 1.4), t, i ? -5 : -7));
whoosh(S.setup.start - 0.3, 0.5, 900, 5);
// Setup.
place(synth(DROP, 1.2), S.setup.cvd + 0.3, -11);
place(synth(CHIME, 1.4), S.setup.oi - 0.05, -11);
many(TICK, 0.2, [S.setup.rule - 0.1, S.setup.shorts - 0.2], -10);
// Sweep.
place(synth(DROP, 2.2), S.sweep.brk + 0.25, -3);
place(noise(0.6, "brown"), S.sweep.brk + 0.25, -12, "lowpass=f=380,afade=t=out:d=0.6");
many(TICK, 0.2, [S.sweep.minute - 0.1], -9);
many(LASER, 0.6, [S.sweep.lows - 0.1, S.sweep.never - 0.1], -17);
many(ABSORB, 0.45, [0, 0.24, 0.48].map((d) => S.sweep.absorb + 0.8 + d), -8);
// Turn.
place(synth("0.3*sin(2*PI*(300+500*t)*t)*exp(-t*2)", 1.2), S.turn.up - 0.1, -14);
place(synth(CHIME, 1.4), S.turn.oi - 0.05, -10);
many(TICK, 0.2, [S.turn.rule - 0.1, S.turn.cover - 0.2], -10);
whoosh(S.turn.chasers - 0.1, 0.9, 1100, 4);
// Reclaim and entry.
place(synth(SWELL(220), 3), S.reclaim.reclaim + 0.3, -9);
place(synth(STAMP, 0.9), S.reclaim.failed - 0.15, -7);
many(TICK, 0.2, [S.reclaim.stack - 0.05, S.reclaim.busiest - 0.05], -10);
place(synth(CHIME, 1.4), S.reclaim.entry - 0.05, -10);
place(synth(NEEDLE, 0.6), S.reclaim.entry + 0.05, -5);
// Result: the time-lapse ticks tighten, then the targets.
for (let t = S.reclaim.speechEnd - 0.2, gap = 0.36; t < resultHits[0] - 0.3; t += gap, gap = Math.max(0.16, gap * 0.86)) many(PULSE, 0.25, [t], -11);
resultHits.forEach((t, i) => place(synth(TARGET, 1.6), t, i ? -4 : -6));
// Camera: tilts to the CVD plane, the match cut into minutes, the dives into the footprints.
whoosh(S.setup.cvd - 0.35, 0.9, 500, 4);
whoosh(S.turn.up - 0.3, 0.9, 500, 4);
whoosh(S.sweep.brk - 0.8, 0.7, 900, 6);
whoosh(S.sweep.absorb - 0.4, 0.9, 600, 6);
whoosh(S.reclaim.retest - 0.6, 0.9, 600, 6);
whoosh(S.reclaim.entry + 0.1, 0.9, 500, 5);
// Close.
whoosh(S.close.academy - 0.4, 1.2, 400, 5);

run(inputs, chains, mixes, "assets/audio/score.wav", "loudnorm=I=-24:TP=-3:LRA=14");
console.log(`score.wav ${END}s, ${mixes.length} layers`);
