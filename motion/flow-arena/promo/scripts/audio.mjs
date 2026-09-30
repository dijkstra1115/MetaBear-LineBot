// Deterministic synth for the FLOW ARENA promo.
// Reads every scene's cue sheet (data-cues on #<id>-cues) plus scene starts from index.html,
// then writes assets/audio/music.wav and assets/audio/sfx.wav (48 kHz stereo, 16-bit).
import fs from "node:fs";

const SR = 48000;
const index = fs.readFileSync("index.html", "utf8");
const DUR = Number(/data-composition-id="main"[^>]*data-duration="([\d.]+)"/.exec(index)[1]);
const N = Math.ceil(DUR * SR);
const scenes = [...index.matchAll(/data-composition-id="(s\d-[\w-]+)" data-composition-src="([^"]+)" data-start="([\d.]+)"/g)].map((m) => ({
  id: m[1],
  src: m[2],
  start: Number(m[3]),
}));
const cues = [];
for (const s of scenes) {
  const html = fs.readFileSync(s.src, "utf8");
  const m = /data-cues='([^']+)'/.exec(html);
  if (!m) continue;
  const c = JSON.parse(m[1]);
  for (const [type, list] of Object.entries(c)) {
    if (type === "absorbSizes") continue;
    for (const v of list) {
      const [t, p] = Array.isArray(v) ? v : [v, undefined];
      cues.push({ scene: s.id, type, t: s.start + t, p });
    }
  }
}
cues.sort((a, b) => a.t - b.t);

// ---------- primitives ----------
let seed = 1234567;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noiseBuf = new Float32Array(SR * 4).map(() => rnd() * 2 - 1);
const noise = (i) => noiseBuf[i % noiseBuf.length];
const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Bus {
  constructor() {
    this.L = new Float32Array(N);
    this.R = new Float32Array(N);
  }
  add(i, l, r = l) {
    if (i >= 0 && i < N) {
      this.L[i] += l;
      this.R[i] += r;
    }
  }
}
// one-pole low/high pass helpers (stateful per voice)
const lp1 = () => {
  let y = 0;
  return (x, fc) => {
    const a = 1 - Math.exp((-TAU * fc) / SR);
    y += a * (x - y);
    return y;
  };
};
const hp1 = () => {
  const l = lp1();
  return (x, fc) => x - l(x, fc);
};
// state-variable bandpass
const svf = () => {
  let low = 0, band = 0;
  return (x, fc, q = 0.7) => {
    const f = 2 * Math.sin((Math.PI * Math.min(fc, SR / 6)) / SR);
    const high = x - low - q * band;
    band += f * high;
    low += f * band;
    return { low, band, high };
  };
};

// ---------- instruments ----------
function kick(bus, t0, amp = 1, len = 0.45) {
  const s0 = Math.round(t0 * SR);
  let ph = 0;
  for (let k = 0; k < len * SR; k++) {
    const t = k / SR;
    const f = 45 + 110 * Math.exp(-t / 0.035);
    ph += (TAU * f) / SR;
    const env = Math.exp(-t / (len * 0.42));
    const click = k < 240 ? noise(k + s0) * (1 - k / 240) * 0.35 : 0;
    const v = (Math.tanh(Math.sin(ph) * 2.2) * env + click) * amp;
    bus.add(s0 + k, v, v);
  }
}
function clap(bus, t0, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const bp = svf();
  for (let k = 0; k < 0.35 * SR; k++) {
    const t = k / SR;
    const bursts = [0, 0.011, 0.022, 0.034].reduce((a, o) => a + (t >= o ? Math.exp(-(t - o) / (o === 0.034 ? 0.09 : 0.008)) : 0), 0);
    const x = bp(noise(k * 3 + s0), 1500, 0.9).band * bursts;
    const tone = Math.sin(TAU * 185 * t) * Math.exp(-t / 0.04) * 0.4;
    const v = (x * 1.6 + tone) * amp;
    bus.add(s0 + k, v * 0.95, v);
    if (rev) rev.add(s0 + k, v * 0.35);
  }
}
function hat(bus, t0, amp = 1, open = false) {
  const s0 = Math.round(t0 * SR);
  const hp = hp1(), hp2 = hp1();
  const len = open ? 0.25 : 0.05;
  for (let k = 0; k < len * SR; k++) {
    const t = k / SR;
    const x = hp2(hp(noise(k * 7 + s0 * 3), 7000), 7000);
    const v = x * Math.exp(-t / (open ? 0.08 : 0.018)) * amp;
    bus.add(s0 + k, v * 0.8, v);
  }
}
function crash(bus, t0, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const hp = hp1();
  for (let k = 0; k < 2.2 * SR; k++) {
    const t = k / SR;
    const x = hp(noise(k * 5 + 99), 4200);
    const v = x * Math.exp(-t / 0.7) * amp;
    bus.add(s0 + k, v, v * 0.9);
    if (rev) rev.add(s0 + k, v * 0.3);
  }
}
function saw(ph) {
  return 2 * (ph - Math.floor(ph + 0.5));
}
function bassNote(bus, t0, dur, midi, amp = 1, cutoff = 700) {
  const s0 = Math.round(t0 * SR);
  const f = mtof(midi);
  const l1 = lp1(), l2 = lp1();
  let ph = 0, ph2 = 0;
  for (let k = 0; k < (dur + 0.05) * SR; k++) {
    const t = k / SR;
    ph += f / SR;
    ph2 += (f * 0.5) / SR;
    const env = Math.min(1, t / 0.004) * (t < dur ? Math.exp(-t / (dur * 1.4)) : Math.exp(-(t - dur) / 0.01) * Math.exp(-dur / (dur * 1.4)));
    const fc = cutoff * (0.5 + 1.2 * Math.exp(-t / 0.06));
    const x = l2(l1(saw(ph) * 0.7 + Math.sin(TAU * ph2) * 0.8, fc), fc);
    const v = Math.tanh(x * 2) * env * amp;
    bus.add(s0 + k, v, v);
  }
}
function padChord(bus, t0, dur, notes, amp = 1, cutoff = 1400, rev) {
  const s0 = Math.round(t0 * SR);
  const voices = [];
  notes.forEach((m) => [-0.12, 0, 0.11].forEach((d) => voices.push({ f: mtof(m + d), ph: rnd() })));
  const l1 = lp1(), l2 = lp1(), r1 = lp1(), r2 = lp1();
  for (let k = 0; k < (dur + 0.6) * SR; k++) {
    const t = k / SR;
    let sl = 0, sr = 0;
    voices.forEach((v, i) => {
      v.ph += v.f / SR;
      const s = saw(v.ph);
      if (i % 2) sl += s;
      else sr += s;
    });
    const env = Math.min(1, t / 0.35) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.2));
    const fc = cutoff * (0.8 + 0.2 * Math.sin(TAU * 0.25 * (t0 + t)));
    const a = (amp * env) / voices.length;
    const L = l2(l1(sl, fc), fc) * a * 2.2, R = r2(r1(sr, fc), fc) * a * 2.2;
    bus.add(s0 + k, L, R);
    if (rev) rev.add(s0 + k, (L + R) * 0.3);
  }
}
function pluck(bus, t0, midi, amp = 1, rev, pan = 0) {
  const s0 = Math.round(t0 * SR);
  const f = mtof(midi);
  const l = lp1();
  let ph = 0;
  for (let k = 0; k < 0.28 * SR; k++) {
    const t = k / SR;
    ph += f / SR;
    const sq = ph - Math.floor(ph) < 0.5 ? 1 : -1;
    const x = l(sq, 800 + 5000 * Math.exp(-t / 0.03));
    const v = x * Math.exp(-t / 0.07) * amp;
    bus.add(s0 + k, v * (1 - pan), v * (1 + pan));
    if (rev) rev.add(s0 + k, v * 0.25);
  }
}

// ---------- SFX ----------
// The hero sound: a bright, quick FM "deng" for hovering UI. Pitch climbs per step.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
function deng(bus, t0, step, amp = 1, base = 69, rev) {
  const s0 = Math.round(t0 * SR);
  const f = mtof(base + PENTA[Math.min(step, PENTA.length - 1)]);
  const lp = lp1(), lp2 = lp1();
  let pc = 0, pm = 0;
  for (let k = 0; k < 0.22 * SR; k++) {
    const t = k / SR;
    pm += f / SR;
    const idx = 0.9 * Math.exp(-t / 0.012);
    pc += (f + f * idx * Math.sin(TAU * pm)) / SR;
    // mallet-like body: fundamental + soft octave, rounded attack
    const body = Math.sin(TAU * pc) * Math.exp(-t / 0.075) + Math.sin(TAU * 2 * pc) * 0.18 * Math.exp(-t / 0.03);
    const sub = Math.sin(TAU * f * 0.5 * t) * Math.exp(-t / 0.05) * 0.4;
    const x = lp2(lp(body + sub, 2600), 2600);
    const v = x * amp * Math.min(1, k / 90);
    const pan = ((step % 5) - 2) * 0.1;
    bus.add(s0 + k, v * (1 - pan), v * (1 + pan));
    if (rev) rev.add(s0 + k, v * 0.22);
  }
}
function mclick(bus, t0, amp = 1) {
  const s0 = Math.round(t0 * SR);
  const hp = hp1();
  for (let k = 0; k < 0.08 * SR; k++) {
    const t = k / SR;
    const tick = hp(noise(k * 11 + s0), 2500) * Math.exp(-t / 0.004);
    const thump = Math.sin(TAU * (160 - 600 * t) * t) * Math.exp(-t / 0.02) * 0.8;
    const v = (tick * 1.4 + thump) * amp;
    bus.add(s0 + k, v, v);
  }
}
function whoosh(bus, t0, dur = 0.4, amp = 1, up = false, rev) {
  const s0 = Math.round((t0 - dur * 0.7) * SR);
  const bp = svf();
  for (let k = 0; k < dur * SR; k++) {
    const x = k / (dur * SR);
    const fc = up ? 300 + 5000 * x * x : 5000 - 4600 * x;
    const env = Math.sin(Math.PI * Math.pow(x, 0.8)) ** 2;
    const v = bp(noise(k * 2 + s0), fc, 0.5).band * env * amp * 1.5;
    const pan = (x - 0.5) * 1.2;
    bus.add(s0 + k, v * (1 - pan), v * (1 + pan));
    if (rev) rev.add(s0 + k, v * 0.3);
  }
}
function boom(bus, t0, amp = 1, size = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const len = 0.9 + size * 0.6;
  const l = lp1(), l2 = lp1();
  let ph = 0;
  for (let k = 0; k < len * SR; k++) {
    const t = k / SR;
    const f = 28 + 90 * Math.exp(-t / (0.08 + size * 0.02));
    ph += (TAU * f) / SR;
    const sub = Math.tanh(Math.sin(ph) * 3) * Math.exp(-t / (0.35 + size * 0.15));
    const nz = l2(l(noise(k * 3 + s0), 2400 * Math.exp(-t / 0.12) + 200), 3000) * Math.exp(-t / (0.2 + size * 0.1)) * 2.2;
    const crackle = rnd() < 0.004 * size * Math.exp(-t / 0.5) ? (rnd() * 2 - 1) * 0.8 : 0;
    const v = (sub * 1.1 + nz + crackle) * amp;
    bus.add(s0 + k, v, v);
    if (rev) rev.add(s0 + k, (nz + crackle) * amp * 0.5);
  }
}
function riser(bus, t0, dur, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const bp = svf();
  let ph = 0;
  for (let k = 0; k < dur * SR; k++) {
    const x = k / (dur * SR);
    const fc = 400 + 7000 * x * x;
    ph += (200 + 1800 * x * x) / SR;
    const env = Math.pow(x, 1.6);
    const v = (bp(noise(k + s0), fc, 0.4).band * 1.3 + Math.sin(TAU * ph) * 0.25 + saw(ph * 1.01) * 0.12) * env * amp;
    bus.add(s0 + k, v, v);
    if (rev) rev.add(s0 + k, v * 0.3);
  }
}
function sweep(bus, t0, dur, f0, f1, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  let ph = 0;
  for (let k = 0; k < dur * SR; k++) {
    const x = k / (dur * SR);
    const f = f0 * Math.pow(f1 / f0, x);
    ph += f / SR;
    const v = (Math.sin(TAU * ph) * 0.6 + saw(ph) * 0.25) * Math.sin(Math.PI * x) * amp;
    bus.add(s0 + k, v, v);
    if (rev) rev.add(s0 + k, v * 0.3);
  }
}
function bell(bus, t0, freqs, amp = 1, decay = 0.6, rev) {
  const s0 = Math.round(t0 * SR);
  for (let k = 0; k < decay * 3 * SR; k++) {
    const t = k / SR;
    let v = 0;
    freqs.forEach((f, i) => (v += Math.sin(TAU * f * t) * Math.exp(-t / (decay / (1 + i * 0.6))) / (1 + i * 0.5)));
    v *= amp * Math.min(1, k / 30);
    bus.add(s0 + k, v, v);
    if (rev) rev.add(s0 + k, v * 0.35);
  }
}
function glitch(bus, t0, dur = 0.25, amp = 1) {
  const s0 = Math.round(t0 * SR);
  let hold = 0, val = 0;
  for (let k = 0; k < dur * SR; k++) {
    if (k % 480 === 0) val = rnd() < 0.5 ? 0 : 1;
    if (k % (40 + (Math.floor(k / 480) % 5) * 30) === 0) hold = (rnd() * 2 - 1) * val;
    const v = Math.round(hold * 6) / 6 * amp * (1 - k / (dur * SR));
    bus.add(s0 + k, v * 0.9, -v * 0.9 * 0.7 + v * 0.3);
  }
}
function thud(bus, t0, amp = 1, f = 90) {
  const s0 = Math.round(t0 * SR);
  const l = lp1();
  for (let k = 0; k < 0.3 * SR; k++) {
    const t = k / SR;
    const v = (Math.sin(TAU * f * t * (1 + Math.exp(-t / 0.02))) * Math.exp(-t / 0.08) + l(noise(k + s0), 900) * Math.exp(-t / 0.03) * 2) * amp;
    bus.add(s0 + k, v, v);
  }
}
function alarm(bus, t0, amp = 1) {
  [0, 0.13, 0.26, 0.39].forEach((o, i) => {
    const s0 = Math.round((t0 + o) * SR);
    const f = i % 2 ? 740 : 988;
    for (let k = 0; k < 0.11 * SR; k++) {
      const t = k / SR;
      const sq = Math.sin(TAU * f * t) > 0 ? 1 : -1;
      const v = (sq * 0.35 + Math.sin(TAU * f * t) * 0.4) * Math.min(1, t / 0.005) * Math.exp(-t / 0.09) * amp;
      bus.add(s0 + k, v, v);
    }
  });
}
function vacuum(bus, t0, dur, amp = 1) {
  const s0 = Math.round(t0 * SR);
  const bp = svf();
  let ph = 0;
  for (let k = 0; k < dur * SR; k++) {
    const x = k / (dur * SR);
    ph += (900 * Math.pow(0.15, x)) / SR;
    const v = (bp(noise(k + s0), 3000 * Math.pow(0.1, x) + 150, 0.6).band + Math.sin(TAU * ph) * 0.3) * Math.sin(Math.PI * x) * amp;
    bus.add(s0 + k, v, v);
  }
}

// ---------- reverb (Schroeder) ----------
function reverb(inBus, outBus, wet = 0.5) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ d, buf: new Float32Array(d), i: 0, fb: 0.8, lp: 0 }));
  const aps = [225, 556, 441].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    const x = (inBus.L[n] + inBus.R[n]) * 0.5;
    let y = 0;
    combs.forEach((c) => {
      const o = c.buf[c.i];
      c.lp = o * 0.7 + c.lp * 0.3;
      c.buf[c.i] = x + c.lp * c.fb;
      c.i = (c.i + 1) % c.d;
      y += o;
    });
    y /= combs.length;
    aps.forEach((a) => {
      const o = a.buf[a.i];
      const v = -y * 0.5 + o;
      a.buf[a.i] = y + o * 0.5;
      a.i = (a.i + 1) % a.d;
      y = v;
    });
    outBus.L[n] += y * wet;
    outBus.R[n] += (n > 700 ? y : 0) * wet * 0.96;
  }
}

// ---------- MUSIC ----------
const music = new Bus();
const mrev = new Bus();
const drums = new Bus();
const BEAT = 0.5;
const CH = [
  { root: 45, notes: [57, 60, 64] }, // Am
  { root: 41, notes: [53, 57, 60] }, // F
  { root: 43, notes: [55, 59, 62] }, // G
  { root: 40, notes: [52, 55, 59] }, // Em
];
const chordAt = (t) => CH[Math.floor(t / 2) % 4];
const S0 = Object.fromEntries(scenes.map((s) => [s.id, s.start]));
const CTA = S0["s7-cta"], CHAIN = S0["s5-chain"];
const sect = (t) => {
  if (t >= DUR - 2) return "tail";
  if (t >= CTA) return "final";
  if (t >= S0["s8-result"]) return "b";
  if (t >= S0["s6-pvp"]) return "half";
  if (t >= CHAIN + 6) return "full";
  if (t >= CHAIN + 3) return "chain";
  if (t >= CHAIN) return "build";
  if (t >= S0["s4-breakout"]) return "b";
  if (t >= S0["s9-howto"]) return "a";
  if (t >= S0["s2-title"]) return "drop";
  return "intro";
};

for (let b = 0; b * BEAT < DUR; b++) {
  const t = b * BEAT;
  const s = sect(t);
  const inBar = b % 4;
  const ch = chordAt(t);
  // kick
  if (s === "intro") {
    if (inBar === 0 || inBar === 2) kick(drums, t, 0.55 + t * 0.06, 0.35);
  } else if (s === "half") {
    if (inBar === 0) kick(drums, t, 1.0, 0.7);
    if (inBar === 2) clap(drums, t, 0.9, mrev);
    if (inBar === 3 && Math.floor(b / 4) % 2) kick(drums, t + 0.25, 0.6, 0.3);
  } else if (s !== "tail") {
    kick(drums, t, s === "a" ? 0.8 : 0.95);
    if (inBar === 1 || inBar === 3) clap(drums, t, s === "a" ? 0.55 : 0.75, mrev);
  }
  // hats
  if (s !== "tail" && s !== "half") {
    for (let q = 0; q < 4; q++) {
      const tt = t + q * 0.125;
      const acc = q === 2 ? 1 : 0.45;
      const lvl = s === "intro" ? 0.12 + t * 0.03 : s === "a" ? 0.28 : 0.38;
      if (s === "intro" && q % 2) continue;
      hat(drums, tt, lvl * acc, q === 2 && (s === "full" || s === "final"));
    }
  } else if (s === "half") {
    for (let q = 0; q < 2; q++) hat(drums, t + q * 0.25, q ? 0.12 : 0.22);
  }
  // bass (8ths), ducked by kick
  if (s !== "intro" && s !== "tail") {
    for (let q = 0; q < 2; q++) {
      const tt = t + q * 0.25;
      const oct = s === "half" ? -12 : q ? 12 : 0;
      if (s === "half" && q) continue;
      bassNote(music, tt, s === "half" ? 0.45 : 0.2, ch.root + oct, s === "half" ? 0.55 : 0.42, s === "full" || s === "chain" ? 1100 : 700);
    }
  } else if (s === "intro" && t >= 2) {
    bassNote(music, t, 0.4, ch.root - 12, 0.35, 350);
  }
  // arps
  if (s === "b" || s === "build" || s === "chain" || s === "full" || s === "final") {
    const arp = [...ch.notes, ch.notes[0] + 12];
    for (let q = 0; q < 4; q++) pluck(music, t + q * 0.125, arp[(b * 4 + q) % 4] + 12, s === "b" ? 0.1 : 0.14, mrev, q % 2 ? 0.4 : -0.4);
  }
}
// pads per bar
for (let bar = 0; bar * 2 < DUR; bar++) {
  const t = bar * 2;
  const s = sect(t);
  if (s === "tail") continue;
  const ch = chordAt(t);
  const notes = s === "half" ? [ch.notes[0] - 12, ch.notes[0] - 11, ch.notes[1]] : ch.notes;
  const amp = s === "intro" ? 0.12 + t * 0.03 : s === "a" ? 0.14 : s === "half" ? 0.22 : 0.2;
  padChord(music, t, 2, notes, amp, s === "intro" ? 600 + t * 180 : s === "half" ? 700 : 1600, mrev);
}
// tail chord
padChord(music, DUR - 2, 1.6, [45, 52, 57, 60, 64], 0.3, 1200, mrev);
bell(music, DUR - 2, [440, 880 * 1.5, 1320 * 1.2], 0.12, 1.2, mrev);
// build snare roll into the first boom, then crash hits
for (let t = CHAIN + 0.5; t < CHAIN + 3; ) {
  const x = (t - CHAIN - 0.5) / 2.5;
  clap(drums, t, 0.25 + 0.5 * x, mrev);
  t += 0.25 - 0.17 * x;
}
[S0["s2-title"], CHAIN + 6, CTA].forEach((t) => crash(music, t, 0.4, mrev));
// sidechain duck of music bus from kicks
{
  const env = new Float32Array(N);
  for (let b = 0; b * BEAT < DUR; b++) {
    const t = b * BEAT;
    const s = sect(t);
    if (s === "intro" || s === "tail") continue;
    if (s === "half" && b % 4) continue;
    const s0 = Math.round(t * SR);
    for (let k = 0; k < 0.3 * SR; k++) if (s0 + k < N) env[s0 + k] = Math.max(env[s0 + k], Math.exp(-k / SR / 0.09));
  }
  for (let n = 0; n < N; n++) {
    const g = 1 - 0.65 * env[n];
    music.L[n] *= g;
    music.R[n] *= g;
  }
}
reverb(mrev, music, 0.5);
for (let n = 0; n < N; n++) {
  music.L[n] += drums.L[n];
  music.R[n] += drums.R[n];
}
// silence gaps under the big hits so they land: brief dips before 5.0 and 44.0
[S0["s2-title"], CTA].forEach((t) => {
  const a = Math.round((t - 0.25) * SR), b = Math.round(t * SR);
  for (let n = a; n < b; n++) {
    const g = 0.15 + 0.85 * Math.pow(1 - (n - a) / (b - a), 2);
    music.L[n] *= g;
    music.R[n] *= g;
  }
});
// fade out the end
for (let n = Math.round((DUR - 1.2) * SR); n < N; n++) {
  const g = Math.max(0, (N - n) / (1.2 * SR));
  music.L[n] *= g;
  music.R[n] *= g;
}

// ---------- SFX ----------
const sfx = new Bus();
const srev = new Bus();
// hover pitch climbs within a burst; a gap > 0.45s restarts the run
let lastHover = -9, step = 0;
const baseFor = (scene) => ({ "s1-hook": 67, "s9-howto": 67, "s3-absorb": 67, "s4-breakout": 69, "s5-chain": 69, "s6-pvp": 64, "s7-cta": 71 })[scene] ?? 67;
for (const c of cues) {
  const t = c.t;
  switch (c.type) {
    case "hover":
      step = t - lastHover > 0.45 ? 0 : step + 1;
      lastHover = t;
      deng(sfx, t, step, 0.5, baseFor(c.scene), srev);
      break;
    case "hoverBtn":
      deng(sfx, t, 5, 0.45, 64, srev);
      break;
    case "lock":
      deng(sfx, t, 7, 0.5, 67, srev);
      bell(sfx, t, [880, 1320], 0.08, 0.25, srev);
      break;
    case "click":
      mclick(sfx, t, 0.9);
      break;
    case "slam":
      thud(sfx, t, 0.9, 70);
      whoosh(sfx, t, 0.3, 0.5, true);
      break;
    case "riser":
      riser(sfx, t, c.p, 0.55, srev);
      break;
    case "boom":
      boom(sfx, t, 0.75 + 0.1 * (c.p ?? 1), c.p ?? 1, srev);
      break;
    case "mega":
      boom(sfx, t, 1.1, 5, srev);
      crash(sfx, t, 0.5, srev);
      glitch(sfx, t + 0.05, 0.3, 0.25);
      break;
    case "glitch":
      glitch(sfx, t, 0.22, 0.3);
      break;
    case "whoosh":
      whoosh(sfx, t, 0.45, 0.7, false, srev);
      break;
    case "place":
      thud(sfx, t, 1.1, 60);
      bell(sfx, t, [523, 784, 1046], 0.18, 0.5, srev);
      break;
    case "eat":
      thud(sfx, t, 0.35, 150);
      deng(sfx, t, 2, 0.14, 57);
      break;
    case "absorb":
      thud(sfx, t, 0.75, 85);
      bell(sfx, t, [1318, 1975], 0.07, 0.12);
      break;
    case "rise":
      sweep(sfx, t, 0.9, 220, 1320, 0.35, srev);
      break;
    case "cash":
      bell(sfx, t, [2637, 3951], 0.3, 0.15, srev);
      bell(sfx, t + 0.08, [3136, 4699], 0.28, 0.35, srev);
      break;
    case "alarm":
      alarm(sfx, t, 0.45);
      break;
    case "shrink":
      vacuum(sfx, t, 0.9, 0.5);
      break;
    case "bar":
      sweep(sfx, t, 0.5, 400, 900, 0.22);
      break;
    case "stamp":
    case "badge":
      thud(sfx, t, 1.0, 65);
      bell(sfx, t, [880, 1320], 0.15, 0.3, srev);
      break;
    case "band":
      sweep(sfx, t, 1.4, 110, 165, 0.25, srev);
      break;
    case "hit":
      boom(sfx, t, 0.8, 1.5, srev);
      break;
    case "grade":
      bell(sfx, t, [1568, 2349, 3136], 0.3, 0.6, srev);
      break;
    case "dive":
      sweep(sfx, t, c.p, 1400, 180, 0.35, srev);
      break;
    case "boomV":
      boom(sfx, t, 1.0, 3, srev);
      bell(sfx, t, [659, 988, 1318], 0.14, 0.8, srev);
      break;
    case "tick":
      deng(sfx, t, 3, 0.22, 72);
      break;
    case "pop":
      deng(sfx, t, 0, 0.35, 60, srev);
      deng(sfx, t + 0.12, 4, 0.35, 60, srev);
      break;
    case "final":
      boom(sfx, t, 1.0, 4, srev);
      bell(sfx, t, [440, 660, 880, 1320], 0.25, 1.2, srev);
      break;
    case "flip":
      whoosh(sfx, t + 0.25, 0.5, 0.6, true, srev);
      thud(sfx, t + 0.45, 0.6, 70);
      break;
    case "key":
      thud(sfx, t, 0.9, 75);
      whoosh(sfx, t + 0.55, 0.5, 0.55, true, srev);
      break;
    case "pop":
      whoosh(sfx, t + 0.15, 0.25, 0.45, true);
      thud(sfx, t + 0.2, 0.55, 110);
      break;
  }
}
// scene-cut whooshes and hits
scenes.slice(1).forEach((s) => {
  whoosh(sfx, s.start, 0.35, 0.45, true, srev);
});
reverb(srev, sfx, 0.55);

// ---------- write ----------
function peak(bus) {
  let p = 0;
  for (let n = 0; n < N; n++) p = Math.max(p, Math.abs(bus.L[n]), Math.abs(bus.R[n]));
  return p;
}
// music normalised to a bed level; SFX keep their designed levels. A master limiter
// on the summed mix tames the booms and lifts overall loudness.
const mp = peak(music);
const MG = 0.5 / mp, SG = 0.85;
const master = new Bus();
for (let n = 0; n < N; n++) {
  master.L[n] = music.L[n] * MG + sfx.L[n] * SG;
  master.R[n] = music.R[n] * MG + sfx.R[n] * SG;
}
{
  const PRE = 1.05, CEIL = 0.9, LA = Math.round(0.003 * SR);
  const rel = Math.exp(-1 / (0.09 * SR));
  let g = 1;
  const need = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const pk = Math.max(Math.abs(master.L[n]), Math.abs(master.R[n])) * PRE;
    need[n] = pk > CEIL ? CEIL / pk : 1;
  }
  // look-ahead minimum so gain is already down when the transient arrives
  const want = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    let m = 1;
    for (let k = 0; k < LA && n + k < N; k += 8) m = Math.min(m, need[n + k]);
    want[n] = m;
  }
  for (let n = 0; n < N; n++) {
    g = want[n] < g ? want[n] : want[n] + (g - want[n]) * rel;
    master.L[n] *= PRE * g;
    master.R[n] *= PRE * g;
  }
}
const K = 1;
function writeWav(path, bus, gain) {
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
  for (let n = 0; n < N; n++) {
    const l = Math.max(-1, Math.min(1, Math.tanh(bus.L[n] * gain * 1.05) / 1.05));
    const r = Math.max(-1, Math.min(1, Math.tanh(bus.R[n] * gain * 1.05) / 1.05));
    data.writeInt16LE(Math.round(l * 32767), 44 + n * 4);
    data.writeInt16LE(Math.round(r * 32767), 46 + n * 4);
  }
  fs.writeFileSync(path, data);
}
writeWav("assets/audio/soundtrack.wav", master, 1);
if (process.argv.includes("--stems")) {
  writeWav("assets/audio/music-stem.wav", music, MG);
  writeWav("assets/audio/sfx-stem.wav", sfx, SG);
}
const counts = cues.reduce((m, c) => ((m[c.type] = (m[c.type] || 0) + 1), m), {});
console.log(`wrote ${DUR}s soundtrack · ${cues.length} cues`, counts);
