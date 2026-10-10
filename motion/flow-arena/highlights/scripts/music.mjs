// Mixes the soundtrack: the user's song cut to the film, plus a few low, short hits.
// - song 0–50.506 s, then a bar-aligned splice to 81.541 s (song bar 39, the second breath), with a
//   6 ms equal-power crossfade; the bars before both seams are harmonically close (chroma 0.98)
// - SFX stay under the song: soft clicks for deyo's 31 market orders, a sub drop on the ×10 second,
//   a bell for 時間到, a sub hit under the thesis
// - fade out at the end
// Reads assets/audio/song.mp3 and assets/audio/cues.json (from scripts/build.mjs).
// Usage: node scripts/music.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const SR = 48000;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const CUES = JSON.parse(fs.readFileSync("assets/audio/cues.json", "utf8"));
const N = Math.ceil(CUES.duration * SR);
const [OUT, IN] = CUES.splice;

const raw = execFileSync(FFMPEG, ["-v", "error", "-i", "assets/audio/song.mp3", "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { maxBuffer: 1 << 30 });
const song = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const songLen = song.length / 2;
const s = (i, c) => (i >= 0 && i < songLen ? song[i * 2 + c] : 0);

const SONG_GAIN = 0.8;
const L = new Float32Array(N), R = new Float32Array(N);
const out = Math.round(OUT * SR), inn = Math.round(IN * SR), XF = Math.round(0.006 * SR);
for (let n = 0; n < N; n++) {
  const a = n, b = n - out + inn;
  let gl = 1, gr = 0;
  if (n >= out + XF / 2) (gl = 0), (gr = 1);
  else if (n >= out - XF / 2) {
    const x = (n - (out - XF / 2)) / XF;
    gl = Math.cos((x * Math.PI) / 2);
    gr = Math.sin((x * Math.PI) / 2);
  }
  // the master is hot (−5.8 dB mean, 0 dBFS peaks): leave headroom for the hits
  L[n] = (s(a, 0) * gl + s(b, 0) * gr) * SONG_GAIN;
  R[n] = (s(a, 1) * gl + s(b, 1) * gr) * SONG_GAIN;
}

// ---- SFX ----
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0), seed / 4294967296);
const add = (t, fn, len, gain = 1, pan = 0) => {
  const n0 = Math.round(t * SR);
  const gL = gain * Math.cos(((pan + 1) * Math.PI) / 4), gR = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < len * SR; i++) {
    const n = n0 + i;
    if (n < 0 || n >= N) continue;
    const v = fn(i / SR);
    L[n] += v * gL;
    R[n] += v * gR;
  }
};
// order click: a short band-limited tick
const click = (pitch) => {
  let lp = 0;
  return (t) => {
    const env = Math.exp(-t * 90);
    lp += 0.35 * ((rnd() * 2 - 1) - lp);
    return (lp * 0.6 + Math.sin(2 * Math.PI * pitch * t) * 0.5) * env;
  };
};
// sub drop: sine sweeping down with a soft attack
const sub = (f0, f1, dur) => {
  let ph = 0;
  return (t) => {
    ph += (2 * Math.PI * f0 * Math.pow(f1 / f0, Math.min(1, t / dur))) / SR;
    return Math.sin(ph) * Math.min(1, t / 0.006) * Math.exp(-t * 3.2);
  };
};
// bell: inharmonic partials with long decay
const bell = (f) => (t) => {
  const parts = [[1, 1, 1.4], [2.76, 0.5, 2.2], [5.4, 0.25, 3.5], [8.9, 0.12, 5], [0.5, 0.35, 1.0]];
  let v = 0;
  for (const [m, a, d] of parts) v += Math.sin(2 * Math.PI * f * m * t) * a * Math.exp(-t * d);
  return v * Math.min(1, t / 0.002) * 0.5;
};

const { start, count, span } = CUES.orders;
for (let i = 0; i < count; i++) {
  const t = start + (span * i) / count;
  add(t, click(1800 + (i % 4) * 140), 0.06, 0.16, ((i % 5) - 2) * 0.3);
}
add(CUES.hits.spike, sub(110, 32, 0.5), 1.6, 0.55);
add(CUES.hits.bell - 0.01, bell(784), 3.2, 0.28, -0.15);
add(CUES.hits.bell - 0.01, bell(1175), 3.2, 0.14, 0.2);
add(CUES.hits.thesis, sub(90, 30, 0.45), 1.4, 0.45);

// ---- fade out + safety limiter ----
const [f0, f1] = CUES.fadeOut;
for (let n = Math.round(f0 * SR); n < N; n++) {
  const x = Math.min(1, (n / SR - f0) / (f1 - f0));
  const g = Math.cos((x * Math.PI) / 2) ** 1.4;
  L[n] *= g;
  R[n] *= g;
}
let peak = 0;
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
const soft = (v) => (Math.abs(v) < 0.9 ? v : Math.sign(v) * (0.9 + 0.1 * Math.tanh((Math.abs(v) - 0.9) / 0.1)));

// 16-bit WAV
const data = Buffer.alloc(N * 4);
for (let n = 0; n < N; n++) {
  data.writeInt16LE(Math.round(soft(L[n]) * 32767), n * 4);
  data.writeInt16LE(Math.round(soft(R[n]) * 32767), n * 4 + 2);
}
const head = Buffer.alloc(44);
head.write("RIFF", 0);
head.writeUInt32LE(36 + data.length, 4);
head.write("WAVEfmt ", 8);
head.writeUInt32LE(16, 16);
head.writeUInt16LE(1, 20);
head.writeUInt16LE(2, 22);
head.writeUInt32LE(SR, 24);
head.writeUInt32LE(SR * 4, 28);
head.writeUInt16LE(4, 32);
head.writeUInt16LE(16, 34);
head.write("data", 36);
head.writeUInt32LE(data.length, 40);
fs.writeFileSync("assets/audio/soundtrack.wav", Buffer.concat([head, data]));
console.log(`assets/audio/soundtrack.wav  ${CUES.duration}s  peak before limiter ${peak.toFixed(3)}`);
