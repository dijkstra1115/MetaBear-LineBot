#!/usr/bin/env node
// Procedural score + sound design for the showreel, generated from the same
// cue sheet the visuals use (src/timeline.js), so every hit lands on its frame.
// 120 BPM, D minor. Fills are pitched by trade price: higher price → higher note.
//
//   node motion/showreel/soundtrack.mjs   → motion/showreel/out/soundtrack.wav
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CUES, TOTAL } from "./src/timeline.js";

const here = dirname(fileURLToPath(import.meta.url));
const SR = 48000;
const N = Math.ceil((TOTAL + 0.5) * SR);
const TAU = Math.PI * 2;
const BEAT = 0.5;
const BAR = 2;

// Buses (stereo).
const bus = () => [new Float32Array(N), new Float32Array(N)];
const music = bus();
const drums = bus();
const sfx = bus();
const send = bus(); // reverb send

let seed = 1;
const rand = () =>
  ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function add(b, i, l, r = l) {
  if (i < 0 || i >= N) return;
  b[0][i] += l;
  b[1][i] += r;
}
const panLR = (p) => [
  Math.cos(((p + 1) * Math.PI) / 4),
  Math.sin(((p + 1) * Math.PI) / 4),
];

// ---------- instruments ----------
function kick(t, vel = 1) {
  const s0 = Math.floor(t * SR);
  let ph = 0;
  for (let k = 0; k < SR * 0.5; k++) {
    const x = k / SR;
    const f = 46 + 110 * Math.exp(-x / 0.035);
    ph += (TAU * f) / SR;
    const env = Math.exp(-x / 0.26);
    const click = k < 240 ? rand() * (1 - k / 240) * 0.35 : 0;
    const v = (Math.tanh(Math.sin(ph) * 1.6) * env + click) * 0.5 * vel;
    add(drums, s0 + k, v);
  }
}
function clap(t, vel = 1) {
  const s0 = Math.floor(t * SR);
  let lp = 0;
  let bp = 0;
  for (let k = 0; k < SR * 0.35; k++) {
    const x = k / SR;
    const bursts = [0, 0.011, 0.022].reduce(
      (a, o) =>
        a + (x >= o ? Math.exp(-(x - o) / (o === 0.022 ? 0.12 : 0.008)) : 0),
      0,
    );
    const n = rand();
    lp += 0.35 * (n - lp);
    bp += 0.5 * (n - lp - bp);
    const tone = Math.sin(TAU * 190 * x) * Math.exp(-x / 0.05) * 0.3;
    const v = (bp * bursts * 0.7 + tone) * vel * 0.55;
    add(drums, s0 + k, v * 0.95, v);
    add(send, s0 + k, v * 0.25);
  }
}
function hat(t, vel = 1, open = false, pan = 0.25) {
  const s0 = Math.floor(t * SR);
  const dur = open ? 0.18 : 0.035;
  let lp = 0;
  const [gl, gr] = panLR(pan);
  for (let k = 0; k < SR * dur * 4; k++) {
    const x = k / SR;
    const n = rand();
    lp += 0.6 * (n - lp);
    const v = (n - lp) * Math.exp(-x / dur) * 0.26 * vel;
    add(drums, s0 + k, v * gl, v * gr);
  }
}
/** Plucked bell: two-operator FM with fast decay. */
function pluck(t, midi, vel = 0.5, o = {}) {
  const s0 = Math.floor(t * SR);
  const f = mtof(midi);
  const dec = o.decay ?? 0.35;
  const idx = o.index ?? 1.6;
  const [gl, gr] = panLR(o.pan ?? 0);
  const len = Math.min(SR * dec * 5, SR * 2.5);
  for (let k = 0; k < len; k++) {
    const x = k / SR;
    const env = Math.exp(-x / dec) * Math.min(1, x / 0.002);
    const mod =
      Math.sin(TAU * f * (o.ratio ?? 2) * x) * idx * Math.exp(-x / (dec * 0.4));
    const v = Math.sin(TAU * f * x + mod) * env * vel * 0.45;
    add(sfx, s0 + k, v * gl, v * gr);
    add(send, s0 + k, v * (o.wet ?? 0.35));
  }
}
function boom(t, vel = 1, big = false) {
  const s0 = Math.floor(t * SR);
  let ph = 0;
  let lp = 0;
  const len = SR * (big ? 3.2 : 1.8);
  for (let k = 0; k < len; k++) {
    const x = k / SR;
    const f = 32 + 60 * Math.exp(-x / 0.12);
    ph += (TAU * f) / SR;
    const n = rand();
    lp += 0.08 * (n - lp);
    const env = Math.exp(-x / (big ? 1.1 : 0.6));
    const v =
      (Math.tanh(Math.sin(ph) * 2) * env * 0.9 +
        lp * Math.exp(-x / 0.25) * 1.4) *
      vel *
      0.5;
    add(sfx, s0 + k, v);
    add(send, s0 + k, v * 0.5);
  }
}
function noiseSweep(t, dur, o = {}) {
  // Band-limited noise whose cutoff sweeps f0→f1; envelope rises (riser) or swells.
  const s0 = Math.floor(t * SR);
  const len = Math.floor(dur * SR);
  let lp1 = 0;
  let lp2 = 0;
  const [gl, gr] = panLR(o.pan ?? 0);
  for (let k = 0; k < len + SR * 0.2; k++) {
    const u = Math.min(1, k / len);
    const fc = o.f0 * (o.f1 / o.f0) ** u;
    const a = clamp((TAU * fc) / SR, 0, 1);
    const n = rand();
    lp1 += a * (n - lp1);
    lp2 += a * (lp1 - lp2);
    const band = lp1 - lp2 * 0.7;
    const env =
      o.shape === "riser"
        ? u ** 2.2 * (k < len ? 1 : Math.exp(-(k - len) / (SR * 0.02)))
        : Math.sin(Math.PI * Math.min(1, u)) ** 1.5 * (k < len ? 1 : 0);
    const v = band * env * (o.vel ?? 0.5);
    add(sfx, s0 + k, v * gl, v * gr);
    add(send, s0 + k, v * 0.4);
  }
}
function riserTone(t, dur, vel = 0.12) {
  const s0 = Math.floor(t * SR);
  let ph = 0;
  for (let k = 0; k < dur * SR; k++) {
    const u = k / (dur * SR);
    const f = 110 * 2 ** (u * 3);
    ph += (TAU * f) / SR;
    const saw = ((ph / TAU) % 1) * 2 - 1;
    const v = saw * u ** 3 * vel;
    add(sfx, s0 + k, v * 0.8, v);
    add(send, s0 + k, v * 0.5);
  }
}
function click(t, freq = 3200, vel = 0.3, pan = 0) {
  const s0 = Math.floor(t * SR);
  const [gl, gr] = panLR(pan);
  for (let k = 0; k < SR * 0.05; k++) {
    const x = k / SR;
    const v =
      (Math.sin(TAU * freq * x) * Math.exp(-x / 0.008) +
        rand() * Math.exp(-x / 0.0015) * 0.5) *
      vel *
      0.4;
    add(sfx, s0 + k, v * gl, v * gr);
    add(send, s0 + k, v * 0.2);
  }
}
function glide(t, dur, f0, f1, vel = 0.2) {
  const s0 = Math.floor(t * SR);
  let ph = 0;
  for (let k = 0; k < dur * SR; k++) {
    const u = k / (dur * SR);
    ph += (TAU * f0 * (f1 / f0) ** u) / SR;
    const v = Math.sin(ph) * Math.sin(Math.PI * u) * vel;
    add(sfx, s0 + k, v);
    add(send, s0 + k, v * 0.5);
  }
}
function rumble(t, dur) {
  const s0 = Math.floor(t * SR);
  let lp = 0;
  let ph = 0;
  for (let k = 0; k < dur * SR; k++) {
    const x = k / SR;
    const u = x / dur;
    const n = rand();
    lp += 0.01 * (n - lp);
    ph += (TAU * (40 - 12 * u)) / SR;
    const env = Math.min(1, x / 0.08) * (1 - u) ** 0.7;
    const v =
      (lp * 5 + Math.sin(ph) * 0.35) *
      env *
      (0.8 + 0.2 * Math.sin(x * 60)) *
      0.35;
    add(sfx, s0 + k, v);
  }
}

// ---------- score ----------
const PROG = [
  { root: 38, notes: [50, 53, 57, 60, 64] }, // Dm9
  { root: 34, notes: [50, 53, 57, 58, 62] }, // Bbmaj7(9)
  { root: 41, notes: [53, 57, 60, 64, 65] }, // Fmaj7
  { root: 36, notes: [48, 52, 55, 57, 62] }, // C6/9
];
const chordAt = (t) => PROG[Math.floor(t / (BAR * 2)) % 4];
const SCALE = [0, 3, 5, 7, 10]; // D minor pentatonic degrees above D
const priceNote = (price, base = 62) => {
  const d = price - 96;
  const oct = Math.floor(d / 5);
  const deg = ((d % 5) + 5) % 5;
  return base + oct * 12 + SCALE[deg];
};

const groove = (t) =>
  t >= 12 &&
  t < 75.5 &&
  !(t >= 29.5 && t < 30) &&
  !(t >= 47.5 && t < 48) &&
  !(t >= 61.5 && t < 62);
const kicks = [];

// Drums.
for (let b = 0; b * BEAT < TOTAL; b++) {
  const t = b * BEAT;
  const inBar = b % 4;
  if (!groove(t)) continue;
  const card = [12, 30, 48, 62].some((c) => t >= c && t < c + 2); // chapter cards: lighter
  if (inBar === 0 || (inBar === 2 && !card)) {
    kick(t, inBar === 0 ? 1 : 0.8);
    kicks.push(t);
  }
  if (!card && inBar === 3 && b % 8 === 7) {
    kick(t + BEAT * 0.5, 0.6);
    kicks.push(t + BEAT * 0.5);
  }
  if (inBar === 1 || inBar === 3) if (!card) clap(t, 0.8);
  // hats: 8ths; 16ths during the avalanche
  const dense = t >= 41 && t < 44;
  const sub = dense ? 4 : 2;
  for (let s = 0; s < sub; s++) {
    const ht = t + (s * BEAT) / sub;
    hat(
      ht,
      s % 2 ? 0.9 : 0.5,
      !dense && s === 1 && inBar === 3,
      s % 2 ? 0.35 : -0.2,
    );
  }
}
const duck = (t) => {
  let g = 1;
  for (const k of kicks) {
    if (k > t) break;
    const x = t - k;
    if (x < 0.4) g = Math.min(g, 1 - 0.6 * Math.exp(-x / 0.11));
  }
  return g;
};

// Pads (detuned saws, low-passed), crossfaded per chord.
{
  const lp = [
    [0, 0],
    [0, 0],
  ];
  const phases = new Float64Array(PROG.length * 5 * 3);
  const det = [-0.09, 0, 0.1];
  let ki = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    while (ki < kicks.length && kicks[ki] < t - 0.4) ki++;
    let g = 1;
    for (let j = ki; j < kicks.length && kicks[j] <= t; j++)
      g = Math.min(g, 1 - 0.55 * Math.exp(-(t - kicks[j]) / 0.12));
    const seg = Math.floor(t / 4);
    const u = (t % 4) / 4;
    let l = 0;
    let r = 0;
    for (const [si, w] of [
      [seg, Math.min(1, u * 6)],
      [seg - 1, Math.max(0, 1 - u * 6)],
    ]) {
      if (si < 0 || w <= 0) continue;
      const ch = PROG[si % 4];
      ch.notes.forEach((m, n) => {
        for (let d = 0; d < 3; d++) {
          const idx = ((si % 4) * 5 + n) * 3 + d;
          phases[idx] =
            (phases[idx] + mtof(m + det[d] * (1 + n * 0.1)) / SR) % 1;
          const s = (phases[idx] * 2 - 1) * w;
          if (d === 0) l += s;
          else if (d === 2) r += s;
          else {
            l += s * 0.6;
            r += s * 0.6;
          }
        }
      });
    }
    // Section dynamics.
    const level =
      t < 4
        ? (t / 4) * 0.25
        : t < 6
          ? 0.3
          : t < 12
            ? 0.55
            : t < 76
              ? 0.42
              : t < 79.3
                ? 0.5
                : 0.62 * Math.max(0, 1 - (t - 81) / 5);
    const cutoff =
      t < 6
        ? 500 + t * 120
        : t < 12
          ? 1600
          : t < 76
            ? 1100 + 500 * Math.sin((t / 16) * Math.PI) ** 2
            : 2200;
    const a = (TAU * cutoff) / SR;
    lp[0][0] += a * (l - lp[0][0]);
    lp[0][1] += a * (lp[0][0] - lp[0][1]);
    lp[1][0] += a * (r - lp[1][0]);
    lp[1][1] += a * (lp[1][0] - lp[1][1]);
    const gg = level * 0.09 * (t >= 12 && t < 76 ? g : 1);
    music[0][i] += lp[0][1] * gg;
    music[1][i] += lp[1][1] * gg;
    send[0][i] += lp[0][1] * gg * 0.4;
    send[1][i] += lp[1][1] * gg * 0.4;
  }
}

// Sub bass: 8th-note pulses on the chord root, sidechained.
for (let e = 0; (e * BEAT) / 2 < TOTAL; e++) {
  const t = (e * BEAT) / 2;
  if (!groove(t)) continue;
  const root = chordAt(t).root;
  const f = mtof(root);
  const s0 = Math.floor(t * SR);
  const acc = e % 2 === 0 ? 1 : 0.7;
  for (let k = 0; k < SR * 0.24; k++) {
    const x = k / SR;
    const env = Math.min(1, x / 0.006) * Math.exp(-x / 0.16);
    const v =
      Math.tanh(
        (Math.sin(TAU * f * x) + 0.3 * Math.sin(TAU * 2 * f * x)) * 1.4,
      ) *
      env *
      0.13 *
      acc *
      duck(t + x);
    add(music, s0 + k, v);
  }
}

// Arpeggio bed on the title and outro.
for (const [a, b, vel] of [
  [6.5, 11.8, 0.22],
  [76.3, 85, 0.2],
]) {
  for (let t = a; t < b; t += BEAT / 4) {
    const i = Math.round((t - a) / (BEAT / 4));
    const ch = chordAt(t).notes;
    const m = ch[[0, 2, 4, 3, 1, 3, 4, 2][i % 8]] + 12;
    pluck(t, m, vel * (i % 4 === 0 ? 1 : 0.6), {
      decay: 0.18,
      index: 1.1,
      pan: i % 2 ? 0.4 : -0.4,
      wet: 0.5,
    });
  }
}

// ---------- cue-driven sound design ----------
for (const c of CUES) {
  const t = c.t;
  switch (c.kind) {
    case "tick":
      click(t, 2600 + 800 * (c.vel ?? 0.4), c.vel ?? 0.4, rand() * 0.6);
      break;
    case "blip":
      click(t, 1400, 0.22, rand() * 0.8);
      break;
    case "whoosh":
      noiseSweep(t - (c.dur ?? 0.5) * 0.5, c.dur ?? 0.5, {
        f0: 300,
        f1: 5000,
        vel: 0.9,
        pan: rand() * 0.5,
      });
      break;
    case "riser":
      noiseSweep(t, c.dur, { f0: 200, f1: 9000, vel: 0.7, shape: "riser" });
      riserTone(t, c.dur, 0.06);
      break;
    case "impact":
      boom(t, c.big ? 1 : 0.7, !!c.big);
      noiseSweep(t, 0.4, { f0: 6000, f1: 800, vel: 0.5 });
      break;
    case "thud":
      boom(t, 0.5);
      break;
    case "shimmer":
      [0, 7, 12, 16, 19, 24].forEach((m, i) =>
        pluck(t + i * 0.045, 74 + m, 0.25, {
          decay: 0.6,
          index: 0.8,
          pan: (i % 2 ? 1 : -1) * 0.5,
          wet: 0.7,
        }),
      );
      break;
    case "pluck":
      pluck(t, 62 + [0, 3, 5, 7, 10, 12, 15, 17, 19, 22][c.note % 10], 0.5, {
        decay: 0.4,
        pan: (c.note % 3) * 0.3 - 0.3,
        wet: 0.5,
      });
      break;
    case "fill": {
      const buy = c.side === "buy";
      const m = priceNote(c.price, buy ? 62 : 50) + (c.price > 115 ? -12 : 0);
      const vel = c.soft ? (c.arp ? 0.3 : 0.32) : c.big ? 0.85 : 0.6;
      pluck(t, m, vel, {
        decay: c.arp ? 0.12 : c.soft ? 0.18 : 0.32,
        index: buy ? 2.2 : 1.2,
        ratio: buy ? 2 : 1.5,
        pan: buy ? -0.3 : 0.3,
      });
      if (!c.soft) click(t, buy ? 4200 : 2200, 0.35, buy ? -0.3 : 0.3);
      if (c.big) {
        boom(t, 0.55);
        [12, 19, 24].forEach((d, i) =>
          pluck(t + 0.03 * (i + 1), m + d, 0.3, { decay: 0.5, wet: 0.7 }),
        );
      }
      break;
    }
    case "scan":
      click(t, 900 + (c.price - 100) * 180, 0.25, 0);
      break;
    case "stamp":
      boom(t, 0.35);
      click(t, 1800, 0.5);
      noiseSweep(t, 0.25, { f0: 3000, f1: 400, vel: 0.35 });
      break;
    case "crack":
      click(t, 700 + (c.price - 96) * 25, c.loud ? 0.7 : 0.28, rand() * 0.6);
      if (c.loud) {
        boom(t, 0.45);
        noiseSweep(t, 0.3, { f0: 5000, f1: 300, vel: 0.6 });
      }
      break;
    case "rumble":
      rumble(t, c.dur);
      glide(t, c.dur, 220, 55, 0.12);
      break;
    case "swell":
      noiseSweep(t, c.dur, { f0: 400, f1: 2400, vel: 0.28 });
      break;
    case "drain":
      glide(t, c.dur + 0.2, 880, 330, 0.12);
      break;
    case "type":
      for (let i = 0; i < 21; i++)
        click(
          t + i * 0.043 + (i % 3) * 0.004,
          2000 + (i % 5) * 300,
          0.3,
          rand() * 0.4,
        );
      break;
    default:
      break;
  }
}

// ---------- reverb (Freeverb-style) ----------
function reverb(inL, inR) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116];
  const aps = [556, 441, 341, 225];
  const out = [new Float32Array(N), new Float32Array(N)];
  [inL, inR].forEach((input, ch) => {
    const spread = ch ? 23 : 0;
    const bufs = combs.map((d) => ({
      b: new Float32Array(Math.round((d + spread) * (SR / 44100))),
      i: 0,
      f: 0,
    }));
    const abufs = aps.map((d) => ({
      b: new Float32Array(Math.round((d + spread) * (SR / 44100))),
      i: 0,
    }));
    const fb = 0.86;
    const damp = 0.3;
    for (let n = 0; n < N; n++) {
      const x = input[n] * 0.015;
      let y = 0;
      for (const c of bufs) {
        const o = c.b[c.i];
        c.f = o * (1 - damp) + c.f * damp;
        c.b[c.i] = x + c.f * fb;
        c.i = (c.i + 1) % c.b.length;
        y += o;
      }
      for (const a of abufs) {
        const o = a.b[a.i];
        a.b[a.i] = y + o * 0.5;
        a.i = (a.i + 1) % a.b.length;
        y = o - y;
      }
      out[ch][n] = y;
    }
  });
  return out;
}
const wet = reverb(send[0], send[1]);

// ---------- master ----------
const L = new Float32Array(N);
const R = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fadeIn = Math.min(1, t / 0.05);
  const fadeOut = Math.min(1, Math.max(0, (TOTAL - t) / 1.4));
  L[i] =
    (music[0][i] + drums[0][i] * 0.9 + sfx[0][i] + wet[0][i] * 1.6) *
    fadeIn *
    fadeOut;
  R[i] =
    (music[1][i] + drums[1][i] * 0.9 + sfx[1][i] + wet[1][i] * 1.6) *
    fadeIn *
    fadeOut;
}
// Gentle bus compression via soft clip, then normalize to -1 dBFS.
let peak = 0;
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh(L[i] * 1.3);
  R[i] = Math.tanh(R[i] * 1.3);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 10 ** (-1 / 20) / peak;

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
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(clamp(L[i] * norm, -1, 1) * 32767), 44 + i * 4);
  data.writeInt16LE(Math.round(clamp(R[i] * norm, -1, 1) * 32767), 46 + i * 4);
}
const out = join(here, "out", "soundtrack.wav");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, data);
console.log(
  `soundtrack → ${out} (${(N / SR).toFixed(1)} s, peak norm ${norm.toFixed(2)})`,
);
