// Mixes the soundtrack for "surge": the licensed song, cut and treated to the edit, plus a few low SFX.
// - song bars 0–15, then a splice straight into the drop (song bar 20), equal-power 6 ms crossfade
// - breakdown (film bars 12–15): the song sinks under a low-pass, then opens up into the drop;
//   the last beat before the drop is held almost silent, like the flagship's 33.75 s release
// - SFX are warm and low (clicks, a reverse swell into the drop, sub hits); the song carries the energy
// Reads assets/audio/raya.mp3 and assets/audio/cues.json (from scripts/build.mjs).
// Usage: node scripts/music.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const SR = 48000;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const CUES = JSON.parse(fs.readFileSync("assets/audio/cues.json", "utf8"));
const DUR = CUES.duration;
const N = Math.ceil(DUR * SR);
const [OUT, IN] = CUES.splice;
const BARS = CUES.bars;
const BEAT = 60 / CUES.bpm;
const DROP = CUES.drop;

// decode the song to float stereo
const raw = execFileSync(FFMPEG, ["-v", "error", "-i", "assets/audio/raya.mp3", "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { maxBuffer: 1 << 30 });
const song = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const songLen = song.length / 2;
const sL = (i) => (i >= 0 && i < songLen ? song[i * 2] : 0);
const sR = (i) => (i >= 0 && i < songLen ? song[i * 2 + 1] : 0);

const L = new Float32Array(N), R = new Float32Array(N);
const out = Math.round(OUT * SR), inn = Math.round(IN * SR), XF = Math.round(0.006 * SR);
for (let n = 0; n < N; n++) {
  // before the splice: song as is; after: song from the drop; across the seam: equal-power blend
  const a = n, b = n - out + inn;
  if (n < out - XF / 2) {
    L[n] = sL(a);
    R[n] = sR(a);
  } else if (n >= out + XF / 2) {
    L[n] = sL(b);
    R[n] = sR(b);
  } else {
    const x = (n - (out - XF / 2)) / XF;
    const ga = Math.cos((x * Math.PI) / 2), gb = Math.sin((x * Math.PI) / 2);
    L[n] = sL(a) * ga + sL(b) * gb;
    R[n] = sR(a) * ga + sR(b) * gb;
  }
}

// breakdown filter: cutoff and gain curves over film time
const lerp = (a, b, x) => a + (b - a) * Math.min(1, Math.max(0, x));
const cutoffAt = (t) => {
  if (t < BARS[12]) return 20000;
  if (t < BARS[13]) return Math.exp(lerp(Math.log(20000), Math.log(650), (t - BARS[12]) / (BARS[13] - BARS[12])));
  if (t < BARS[14]) return 650;
  if (t < DROP) return Math.exp(lerp(Math.log(650), Math.log(9000), Math.pow((t - BARS[14]) / (DROP - BARS[14]), 1.6)));
  return 20000;
};
const gainAt = (t) => {
  if (t < BARS[12] || t >= DROP) return 1;
  if (t < BARS[13]) return lerp(1, 0.72, (t - BARS[12]) / (BARS[13] - BARS[12]));
  const hold = BARS[15] + 3 * BEAT;
  if (t < hold) return lerp(0.72, 0.95, (t - BARS[13]) / (hold - BARS[13]));
  // the held breath: down to a whisper in 40 ms, back to full on the drop
  return lerp(0.95, 0.06, (t - hold) / 0.04);
};
{
  const st = [0, 0, 0, 0];
  for (let n = Math.round((BARS[12] - 0.01) * SR); n < Math.round((DROP + 0.01) * SR) && n < N; n++) {
    const t = n / SR;
    const k = 1 - Math.exp((-2 * Math.PI * cutoffAt(t)) / SR);
    st[0] += k * (L[n] - st[0]);
    st[1] += k * (st[0] - st[1]);
    st[2] += k * (R[n] - st[2]);
    st[3] += k * (st[2] - st[3]);
    const g = gainAt(t);
    L[n] = st[1] * g;
    R[n] = st[3] * g;
  }
}
// outro fade
for (let n = Math.round((DUR - 2.2) * SR); n < N; n++) {
  const x = (n - (DUR - 2.2) * SR) / (2.2 * SR);
  const g = Math.cos((Math.min(1, x) * Math.PI) / 2) ** 2;
  L[n] *= g;
  R[n] *= g;
}

// ---------- SFX ----------
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const NZ = new Float32Array(SR * 2).map(() => rnd() * 2 - 1);
const noise = (i) => NZ[((i % NZ.length) + NZ.length) % NZ.length];
const lp1 = () => {
  let y = 0;
  return (x, fc) => (y += (1 - Math.exp((-2 * Math.PI * fc) / SR)) * (x - y));
};
const fx = { L: new Float32Array(N), R: new Float32Array(N) };
const add = (i, l, r = l) => {
  if (i >= 0 && i < N) {
    fx.L[i] += l;
    fx.R[i] += r;
  }
};
function click(t0, amp) {
  const s0 = Math.round(t0 * SR);
  const lp = lp1();
  for (let k = 0; k < 0.09 * SR; k++) {
    const t = k / SR;
    const v = (lp(noise(k + s0), 2600) * Math.exp(-t / 0.006) * 0.8 + Math.sin(2 * Math.PI * (130 - 300 * t) * t) * Math.exp(-t / 0.03)) * amp;
    add(s0 + k, v);
  }
}
function sub(t0, amp, len = 1.4) {
  const s0 = Math.round(t0 * SR);
  let ph = 0;
  const lp = lp1();
  for (let k = 0; k < len * SR; k++) {
    const t = k / SR;
    ph += (2 * Math.PI * (34 + 70 * Math.exp(-t / 0.06))) / SR;
    const v = (Math.tanh(Math.sin(ph) * 1.4) * Math.exp(-t / (len * 0.35)) + lp(noise(k + s0), 900) * Math.exp(-t / 0.05) * 0.6) * amp;
    add(s0 + k, v);
  }
}
function swell(t1, dur, amp) {
  const s1 = Math.round(t1 * SR);
  const lp = lp1();
  let ph = 0;
  for (let k = Math.round(dur * SR); k > 0; k--) {
    const x = 1 - k / (dur * SR);
    ph += (40 + 80 * x * x) / SR;
    const v = (lp(noise(k * 3), 300 + 2600 * x * x) * 1.3 + Math.sin(2 * Math.PI * ph) * 0.4) * x * x * amp;
    add(s1 - k, v, v * 0.95);
  }
}
function whoosh(t0, dur, amp) {
  const s0 = Math.round((t0 - dur * 0.6) * SR);
  const lp = lp1();
  for (let k = 0; k < dur * SR; k++) {
    const x = k / (dur * SR);
    const v = lp(noise(k * 2 + s0), 200 + 1600 * Math.sin(Math.PI * x)) * Math.sin(Math.PI * x) ** 2 * amp;
    add(s0 + k, v * (1.2 - x), v * (0.2 + x));
  }
}
for (const c of CUES.cues) {
  if (c.type === "click") click(c.t, c.tag === "run" ? 0.55 : 0.32);
  else if (c.type === "whip") whoosh(c.t, 0.3, 0.35);
  else if (c.type === "freeze") swell(DROP, DROP - c.t, 0.5);
  else if (c.type === "drop") sub(c.t, 0.75, 1.8);
  else if (c.type === "final") sub(c.t, 0.5, 1.6);
  else if (c.type === "hit" && c.k >= 0.9 && c.t > 1 && Math.abs(c.t - DROP) > 0.01) sub(c.t, 0.3, 0.9);
}

// ---------- mix ----------
const master = { L: new Float32Array(N), R: new Float32Array(N) };
const MG = 0.84, SG = 0.7;
for (let n = 0; n < N; n++) {
  master.L[n] = L[n] * MG + fx.L[n] * SG;
  master.R[n] = R[n] * MG + fx.R[n] * SG;
}
// look-ahead peak limiter at about -1 dBFS
{
  const CEIL = 0.88, LA = Math.round(0.004 * SR), rel = Math.exp(-1 / (0.08 * SR));
  const need = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const pk = Math.max(Math.abs(master.L[n]), Math.abs(master.R[n]));
    need[n] = pk > CEIL ? CEIL / pk : 1;
  }
  let g = 1;
  for (let n = 0; n < N; n++) {
    let m = 1;
    for (let k = 0; k < LA && n + k < N; k += 6) m = Math.min(m, need[n + k]);
    g = m < g ? m : m + (g - m) * rel;
    master.L[n] *= g;
    master.R[n] *= g;
  }
}
const data = Buffer.alloc(44 + N * 4);
data.write("RIFF", 0);
data.writeUInt32LE(36 + N * 4, 4);
data.write("WAVEfmt ", 8);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(2, 22);
data.writeUInt32LE(SR, 24);
data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32);
data.writeUInt16LE(16, 34);
data.write("data", 36);
data.writeUInt32LE(N * 4, 40);
// master output level: 8 dB under the limiter ceiling; the rendered video lands near -19.8 LUFS
const OUT_GAIN = 0.398;
for (let n = 0; n < N; n++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, master.L[n] * OUT_GAIN)) * 32767), 44 + n * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, master.R[n] * OUT_GAIN)) * 32767), 46 + n * 4);
}
fs.writeFileSync("assets/audio/soundtrack.wav", data);
console.log(`wrote ${DUR}s soundtrack · splice ${OUT}→${IN} · drop at ${DROP}s`);
