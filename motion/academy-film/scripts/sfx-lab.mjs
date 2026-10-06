// Sound lab: renders candidate effects as separate WAV files for listening, before one goes into the mix.
//  - bubbles-1..5: the "everything squeezes together" move, heard by the user in aether.mp4 (~8.1–9.3 s) as a
//    run of muffled bubbles; each candidate builds for 2 s and lands on a soft hit.
//  - ui-1..5: app / web interface sounds for the plan rows (four in a row, same spacing as in the film).
// Writes ../out/sfx-lab/*.wav. Usage: node scripts/sfx-lab.mjs
import fs from "node:fs";

const SR = 48000;
const OUT = "../out/sfx-lab";
fs.mkdirSync(OUT, { recursive: true });

let seed = 777;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
};
const biquad = (type, f, q) => {
  let b0, b1, b2, a0, a1, a2;
  const set = (f2, q2 = q) => {
    const w = (2 * Math.PI * Math.min(f2, SR * 0.45)) / SR;
    const cs = Math.cos(w), al = Math.sin(w) / (2 * q2);
    if (type === "lp") [b0, b1, b2, a0, a1, a2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + al, -2 * cs, 1 - al];
    else if (type === "hp") [b0, b1, b2, a0, a1, a2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al];
    else [b0, b1, b2, a0, a1, a2] = [al, 0, -al, 1 + al, -2 * cs, 1 - al];
  };
  set(f);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const run = (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
  run.set = set;
  return run;
};
const sine = (f, i) => Math.sin((2 * Math.PI * f * i) / SR);

function write(name, L, R) {
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0 ? 0.89 / peak : 1;
  const N = L.length;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(`${OUT}/${name}.wav`, buf);
  console.log(name);
}

// a short impact shared by the squeeze candidates
function impact(L, R, at, gain = 1, tone = 46) {
  const n0 = Math.round(at * SR), len = Math.round(1.6 * SR), lp = biquad("lp", 900, 0.7);
  let ph = 0;
  for (let i = 0; i < len && n0 + i < L.length; i++) {
    const f = tone + 70 * Math.exp(-i / (0.03 * SR));
    ph += (2 * Math.PI * f) / SR;
    const v = (Math.sin(ph) * Math.exp(-i / (0.55 * SR)) + lp(rnd()) * 1.2 * Math.exp(-i / (0.06 * SR))) * Math.min(1, i / 60) * gain;
    L[n0 + i] += v;
    R[n0 + i] += v;
  }
}

// ---------- muffled bubbles: the "squeeze" as a run of underwater bloops ----------
// One bubble: a sine whose pitch glides (bubbles rise in pitch as they shrink), a fast rounded attack, then a
// resonant low-pass so it sounds heard through water or a closed mouth.
function bubble(L, R, at, { f0 = 260, f1 = 420, len = 0.09, gain = 0.5, pan = 0, cutoff = 900 } = {}) {
  const n0 = Math.round(at * SR), n = Math.round(len * SR);
  const lp = biquad("lp", cutoff, 2.2), lp2 = biquad("lp", cutoff * 1.4, 0.8);
  let ph = 0;
  for (let i = 0; i < n + 0.05 * SR && n0 + i < L.length; i++) {
    const x = Math.min(1, i / n);
    const f = f0 * Math.pow(f1 / f0, Math.pow(x, 0.6));
    ph += (2 * Math.PI * f) / SR;
    const env = Math.sin(Math.min(1, i / (0.008 * SR)) * Math.PI / 2) * Math.exp(-i / (len * 0.45 * SR));
    const v = lp2(lp(Math.sin(ph) * env)) * gain;
    L[n0 + i] += v * (1 - pan) * 0.7;
    R[n0 + i] += v * (1 + pan) * 0.7;
  }
}
const softHit = (L, R, at, gain = 0.6) => {
  bubble(L, R, at, { f0: 140, f1: 70, len: 0.35, gain: gain * 1.6, cutoff: 500 });
  impact(L, R, at, gain * 0.5, 40);
};
const DUR = 3.2, HIT = 2.0;
const N = Math.round(DUR * SR);
const H = (k) => (Math.sin(k * 91.7 + 13.1) * 43758.5) % 1;
const h01 = (k) => Math.abs(H(k));

// 1 · accelerating: bloops speed up and climb, like air being squeezed out, then one soft thud
{
  const L = new Float32Array(N), R = new Float32Array(N);
  let t = 0.05, k = 0;
  while (t < HIT - 0.03) {
    const x = t / HIT;
    bubble(L, R, t, { f0: 180 + 220 * x + h01(k) * 60, f1: 320 + 380 * x + h01(k + 3) * 80, len: 0.11 - 0.05 * x, gain: 0.25 + 0.5 * x, pan: (h01(k + 7) - 0.5) * (1 - x) * 1.4 });
    t += 0.2 * Math.pow(1 - x, 1.5) + 0.035;
    k++;
  }
  softHit(L, R, HIT);
  write("bubbles-1-accelerate", L, R);
}
// 2 · popping cluster: bubbles with falling pitch, denser and denser, spread closing to the centre
{
  const L = new Float32Array(N), R = new Float32Array(N);
  for (let k = 0; k < 46; k++) {
    const x = Math.pow(k / 46, 0.62);
    const t = 0.05 + x * (HIT - 0.12);
    const f = 260 + h01(k) * 320;
    bubble(L, R, t, { f0: f * 1.5, f1: f * 0.7, len: 0.07 + h01(k + 2) * 0.05, gain: 0.25 + 0.45 * x, pan: (h01(k + 9) - 0.5) * 1.6 * (1 - x), cutoff: 1100 });
  }
  softHit(L, R, HIT);
  write("bubbles-2-popping", L, R);
}
// 3 · underwater: slower, deeper bloops over a low watery rumble, pulled in at the end
{
  const L = new Float32Array(N), R = new Float32Array(N);
  const lp = biquad("lp", 220, 1.2);
  for (let i = 0; i < HIT * SR; i++) {
    const x = i / (HIT * SR);
    const v = lp(rnd()) * 3 * Math.pow(x, 1.8);
    L[i] += v; R[i] += v;
  }
  let t = 0.1, k = 0;
  while (t < HIT - 0.05) {
    const x = t / HIT;
    bubble(L, R, t, { f0: 120 + h01(k) * 90, f1: 220 + h01(k + 5) * 160, len: 0.16, gain: 0.35 + 0.4 * x, pan: (h01(k + 4) - 0.5) * (1 - x), cutoff: 650 });
    t += 0.26 * Math.pow(1 - x, 1.2) + 0.06;
    k++;
  }
  softHit(L, R, HIT, 0.7);
  write("bubbles-3-underwater", L, R);
}
// 4 · squish: a crowd of bubbles all at once, swelling, then everything collapses into one big bloop
{
  const L = new Float32Array(N), R = new Float32Array(N);
  for (let k = 0; k < 70; k++) {
    const t = 0.3 + h01(k) * (HIT - 0.45);
    const x = (t - 0.3) / (HIT - 0.3);
    const f = 200 + h01(k + 11) * 450;
    bubble(L, R, t, { f0: f, f1: f * (1.3 + h01(k + 2) * 0.6), len: 0.06 + h01(k + 6) * 0.06, gain: 0.12 + 0.35 * x * x, pan: (h01(k + 1) - 0.5) * 1.8 * (1 - x), cutoff: 1000 });
  }
  bubble(L, R, HIT - 0.02, { f0: 320, f1: 110, len: 0.4, gain: 1.4, cutoff: 700 });
  impact(L, R, HIT, 0.35, 42);
  write("bubbles-4-squish", L, R);
}
// 5 · rubber: bubbles that bend up then down ("blorp"), steady rhythm tightening into the hit
{
  const L = new Float32Array(N), R = new Float32Array(N);
  let t = 0.08, k = 0;
  while (t < HIT - 0.04) {
    const x = t / HIT, f = 210 + h01(k) * 140 + 120 * x;
    bubble(L, R, t, { f0: f, f1: f * 1.6, len: 0.05, gain: 0.3 + 0.4 * x, pan: (k % 2 ? 0.5 : -0.5) * (1 - x), cutoff: 950 });
    bubble(L, R, t + 0.045, { f0: f * 1.6, f1: f * 0.8, len: 0.07, gain: 0.25 + 0.35 * x, pan: (k % 2 ? 0.5 : -0.5) * (1 - x), cutoff: 950 });
    t += 0.16 * Math.pow(1 - x, 1.3) + 0.05;
    k++;
  }
  softHit(L, R, HIT);
  write("bubbles-5-rubber", L, R);
}

// ---------- app / web interface sounds for the plan rows: four in a row, as in the film ----------
const TICKS = [0.3, 0.66, 0.91, 1.14];
const uiFile = (name, voice) => {
  const n = Math.round(2.4 * SR), L = new Float32Array(n), R = new Float32Array(n);
  TICKS.forEach((t, k) => voice(L, R, Math.round(t * SR), k));
  write(name, L, R);
};
const env = (i, a, d) => Math.min(1, i / (a * SR)) * Math.exp(-i / (d * SR));
// 1 · tap: the soft keyboard/tap click of a phone UI
uiFile("ui-1-tap", (L, R, n0) => {
  const bp = biquad("bp", 3200, 1.6), lp = biquad("lp", 6000, 0.7);
  for (let i = 0; i < 0.05 * SR; i++) {
    const v = (lp(bp(rnd())) * 3 + sine(1400, i) * 0.15) * env(i, 0.0005, 0.006) * 0.8;
    L[n0 + i] += v; R[n0 + i] += v;
  }
});
// 2 · toggle: two tiny clicks a few ms apart, high then low, like a switch flipping
uiFile("ui-2-toggle", (L, R, n0) => {
  [[0, 2600, 0.7], [0.022, 1500, 0.55]].forEach(([dt, f, g]) => {
    const m = n0 + Math.round(dt * SR), bp = biquad("bp", f, 2.5);
    for (let i = 0; i < 0.04 * SR; i++) {
      const v = (bp(rnd()) * 3 + sine(f * 0.5, i) * 0.2) * env(i, 0.0004, 0.005) * g;
      L[m + i] += v; R[m + i] += v;
    }
  });
});
// 3 · pop: a soft mouth-pop, like a sent message or a sticker
uiFile("ui-3-pop", (L, R, n0, k) => {
  let ph = 0;
  for (let i = 0; i < 0.09 * SR; i++) {
    const f = (700 + k * 40) * Math.pow(0.45, Math.min(1, i / (0.03 * SR)));
    ph += (2 * Math.PI * f) / SR;
    const v = Math.sin(ph) * env(i, 0.002, 0.022) * 0.7;
    L[n0 + i] += v; R[n0 + i] += v;
  }
});
// 4 · select: a muted two-note blip rising a fourth, rounded, very short — "item selected"
uiFile("ui-4-select", (L, R, n0, k) => {
  const lp = biquad("lp", 2200, 0.7);
  [[0, 523], [0.05, 698]].forEach(([dt, f]) => {
    const m = n0 + Math.round(dt * SR);
    for (let i = 0; i < 0.12 * SR; i++) {
      const v = lp((sine(f, i) + 0.25 * sine(f * 2, i)) * env(i, 0.003, 0.03)) * 0.4;
      L[m + i] += v; R[m + i] += v;
    }
  });
});
// 5 · glass tap: a tiny tonal tick, damped quickly — like tapping a frosted button
uiFile("ui-5-glass", (L, R, n0, k) => {
  const f = 1250 + k * 60, bp = biquad("bp", 5000, 1.5);
  for (let i = 0; i < 0.08 * SR; i++) {
    const v = (sine(f, i) * 0.6 + sine(f * 2.76, i) * 0.15 + bp(rnd()) * 0.5 * Math.exp(-i / (0.002 * SR))) * env(i, 0.0008, 0.018) * 0.55;
    L[n0 + i] += v; R[n0 + i] += v;
  }
});
