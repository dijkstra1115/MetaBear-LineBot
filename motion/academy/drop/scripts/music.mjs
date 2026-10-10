// Mixes the soundtrack: the user-supplied song cut to the film, plus a few quiet UI sounds.
// - song bars 0–1, splice into song bar 5, then bars 6–15 as they are (equal-power 8 ms crossfade)
// - interface clicks where the cursor clicks; a noise swell through film bar 10 that cuts dead on the
//   song's own break beat, which is held almost silent, so the drop lands out of silence
// - the last bar fades out under the logo
// Reads assets/audio/song.mp3 and assets/audio/cues.json (from scripts/build.mjs); writes soundtrack.wav.
// Usage: node scripts/music.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { SPLICE, SILENT, DROP, END, bar } from "./grid.mjs";

const SR = 48000;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const CUES = JSON.parse(fs.readFileSync("assets/audio/cues.json", "utf8"));
const N = Math.ceil(END * SR);

const raw = execFileSync(FFMPEG, ["-v", "error", "-i", "assets/audio/song.mp3", "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { maxBuffer: 1 << 30 });
const song = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const songLen = song.length / 2;
// the song sits 20 dB lower than as supplied (user request); the UI clicks and the swell keep their level
const SONG_GAIN = Math.pow(10, -20 / 20);
const s = (i, c) => (i >= 0 && i < songLen ? song[i * 2 + c] * SONG_GAIN : 0);

const L = new Float32Array(N);
const R = new Float32Array(N);
const cut = Math.round(SPLICE.film * SR);
const skip = Math.round(SPLICE.skip * SR);
const XF = Math.round(0.008 * SR);
for (let n = 0; n < N; n++) {
  const a = n;
  const b = n + skip;
  let ga = n < cut - XF / 2 ? 1 : 0;
  let gb = n >= cut + XF / 2 ? 1 : 0;
  if (!ga && !gb) {
    const x = (n - (cut - XF / 2)) / XF;
    ga = Math.cos((x * Math.PI) / 2);
    gb = Math.sin((x * Math.PI) / 2);
  }
  L[n] = s(a, 0) * ga + s(b, 0) * gb;
  R[n] = s(a, 1) * ga + s(b, 1) * gb;
}

// deterministic noise
let seed = 1234567;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
};

// UI click: a short filtered tick with a tiny pitched body
const click = (t, gain = 0.22, pitch = 2400) => {
  const n0 = Math.round(t * SR);
  const len = Math.round(0.05 * SR);
  let lp = 0;
  for (let i = 0; i < len && n0 + i < N; i++) {
    const env = Math.exp(-i / (0.006 * SR));
    lp += 0.5 * (rnd() - lp);
    const v = (lp * 0.8 + Math.sin((2 * Math.PI * pitch * i) / SR) * 0.5) * env * gain;
    L[n0 + i] += v;
    R[n0 + i] += v;
  }
};
for (const c of CUES.clicks) click(c.t, c.gain ?? 0.22, c.pitch ?? 2400);

// swell: band-passed noise rising through bar 10, cut dead at the silent beat
{
  const a = bar(10);
  const b = SILENT;
  let lp1 = 0, lp2 = 0;
  for (let n = Math.round(a * SR); n < Math.round(b * SR); n++) {
    const x = Math.max(0, (n / SR - a) / (b - a));
    const k = 0.02 + 0.5 * x * x;
    const w = rnd();
    lp1 += k * (w - lp1);
    lp2 += k * (lp1 - lp2);
    const v = (lp1 - lp2) * Math.pow(x, 2.2) * 0.5;
    L[n] += v;
    R[n] += v * 0.92;
  }
}

// held breath: the song's own break beat is pulled down to a whisper, so the drop lands out of near-silence
{
  const a = Math.round(SILENT * SR);
  const b = Math.round(DROP * SR);
  const ramp = Math.round(0.04 * SR);
  for (let n = a; n < b; n++) {
    const g = 1 - 0.8 * Math.min(1, (n - a) / ramp);
    L[n] *= g;
    R[n] *= g;
  }
}

// outro fade over the last bar's second half
const fadeFrom = END - 1.5;
for (let n = Math.round(fadeFrom * SR); n < N; n++) {
  const g = Math.pow(Math.max(0, 1 - (n / SR - fadeFrom) / 1.5), 1.6);
  L[n] *= g;
  R[n] *= g;
}

// soft knee instead of normalising: the master is already hot, so only the overs get rounded off
let peak = 0;
const knee = (x) => {
  const a = Math.abs(x);
  return a < 0.9 ? x : Math.sign(x) * (0.9 + 0.09 * Math.tanh((a - 0.9) / 0.09));
};
for (let n = 0; n < N; n++) {
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  L[n] = knee(L[n]);
  R[n] = knee(R[n]);
}
const norm = 1;
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[n] * norm)) * 32767), 44 + n * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[n] * norm)) * 32767), 46 + n * 4);
}
fs.writeFileSync("assets/audio/soundtrack.wav", buf);
console.log(`soundtrack.wav ${END.toFixed(3)} s, peak ${peak.toFixed(3)}, ${CUES.clicks.length} clicks`);
