// Cuts the user's song to the film: song bars 4–15 (intro, first breath, first drop), then a
// bar-aligned splice into song bar 39 (the second breath) and the second drop, with 6 ms equal-power
// crossfades at each seam and a fade-out under the end card. The bars before the seam are
// harmonically close (chroma 0.97). No extra sound effects: the song carries the edit.
// Reads assets/audio/song.mp3 and assets/audio/cues.json (from scripts/build.mjs).
// Usage: node scripts/music.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const SR = 48000;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const CUES = JSON.parse(fs.readFileSync("assets/audio/cues.json", "utf8"));
const N = Math.ceil(CUES.duration * SR);
const GAIN = 0.85; // the master peaks at 0 dBFS; leave a little headroom
const XF = Math.round(0.006 * SR);

const raw = execFileSync(FFMPEG, ["-v", "error", "-i", "assets/audio/song.mp3", "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { maxBuffer: 1 << 30 });
const song = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const len = song.length / 2;
const at = (i, c) => (i >= 0 && i < len ? song[i * 2 + c] : 0);

// segments: [film start, song start]; each runs until the next one starts
const segs = CUES.segments.map(([film, src]) => [Math.round(film * SR), Math.round(src * SR)]);
const L = new Float32Array(N), R = new Float32Array(N);
for (let n = 0; n < N; n++) {
  let k = 0;
  while (k + 1 < segs.length && n >= segs[k + 1][0]) k++;
  const cur = n - segs[k][0] + segs[k][1];
  let l = at(cur, 0), r = at(cur, 1);
  // equal-power blend across a seam
  const next = segs[k + 1];
  if (next && n >= next[0] - XF / 2) {
    const x = (n - (next[0] - XF / 2)) / XF;
    const ga = Math.cos((x * Math.PI) / 2), gb = Math.sin((x * Math.PI) / 2);
    const nx = n - next[0] + next[1];
    l = l * ga + at(nx, 0) * gb;
    r = r * ga + at(nx, 1) * gb;
  } else if (k > 0 && n < segs[k][0] + XF / 2) {
    const x = (n - (segs[k][0] - XF / 2)) / XF;
    const ga = Math.cos((x * Math.PI) / 2), gb = Math.sin((x * Math.PI) / 2);
    const pv = n - segs[k - 1][0] + segs[k - 1][1];
    l = at(pv, 0) * ga + l * gb;
    r = at(pv, 1) * ga + r * gb;
  }
  L[n] = l * GAIN;
  R[n] = r * GAIN;
}
// short fade-in (the cut starts mid-song) and the end fade
const fin = Math.round(0.02 * SR);
for (let n = 0; n < fin; n++) (L[n] *= n / fin), (R[n] *= n / fin);
const [f0, f1] = CUES.fadeOut;
for (let n = Math.round(f0 * SR); n < N; n++) {
  const g = Math.cos((Math.min(1, (n / SR - f0) / (f1 - f0)) * Math.PI) / 2) ** 1.4;
  L[n] *= g;
  R[n] *= g;
}

const data = Buffer.alloc(N * 4);
const clip = (v) => Math.max(-1, Math.min(1, v));
for (let n = 0; n < N; n++) {
  data.writeInt16LE(Math.round(clip(L[n]) * 32767), n * 4);
  data.writeInt16LE(Math.round(clip(R[n]) * 32767), n * 4 + 2);
}
const head = Buffer.alloc(44);
head.write("RIFF", 0);
head.writeUInt32LE(36 + data.length, 4);
head.write("WAVE", 8);
head.write("fmt ", 12);
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
console.log(`assets/audio/soundtrack.wav  ${CUES.duration}s`);
