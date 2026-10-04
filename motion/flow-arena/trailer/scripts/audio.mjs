// Deterministic synth for the FLOW ARENA trailer: music and SFX in one pass.
// Reads assets/audio/cues.json (written by scripts/build.mjs from the edit list and the capture logs)
// and writes assets/audio/soundtrack.wav (48 kHz stereo, 16-bit). Usage: node scripts/audio.mjs [--bright] [--stems]
// The default tone is deep and warm; --bright rebuilds the first, brighter mix.
import fs from "node:fs";

const SR = 48000;
const CUES = JSON.parse(fs.readFileSync("assets/audio/cues.json", "utf8"));
const DUR = CUES.duration;
const N = Math.ceil(DUR * SR);
const cues = CUES.cues;
const hashN = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ---------- primitives ----------
let seed = 1234567;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noiseBuf = new Float32Array(SR * 4).map(() => rnd() * 2 - 1);
const noise = (i) => noiseBuf[((i % noiseBuf.length) + noiseBuf.length) % noiseBuf.length];
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


// ---------- trailer instruments ----------
// Reese: two detuned saws through a moving low-pass, saturated. The trailer's growl.
function reese(bus, t0, dur, midi, amp = 1, cutoff = 900, wobble = 0) {
  const s0 = Math.round(t0 * SR);
  const f = mtof(midi);
  const l1 = lp1(), l2 = lp1(), r1 = lp1(), r2 = lp1();
  let a = 0, b = 0.37, c = 0;
  for (let k = 0; k < (dur + 0.03) * SR; k++) {
    const t = k / SR;
    a += (f * 1.006) / SR;
    b += (f * 0.994) / SR;
    c += (f * 0.5) / SR;
    const env = Math.min(1, t / 0.006) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.012));
    const fc = cutoff * (1 + wobble * 0.8 * Math.sin(TAU * (t0 + t) * (BPM / 60) * 2)) * (0.7 + 0.5 * Math.exp(-t / 0.08));
    const sub = Math.sin(TAU * c) * 0.9;
    const L = l2(l1(saw(a) + saw(b) * 0.6, fc), fc);
    const R = r2(r1(saw(b) + saw(a) * 0.6, fc), fc);
    const vl = Math.tanh((L * 1.6 + sub) * 1.8) * env * amp;
    const vr = Math.tanh((R * 1.6 + sub) * 1.8) * env * amp;
    bus.add(s0 + k, vl, vr);
  }
}
// Braam: a stack of low saws whose filter blooms open, the trailer horn.
function braam(bus, t0, dur, notes, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const vs = [];
  notes.forEach((m) => [-0.08, 0, 0.09].forEach((d) => vs.push({ f: mtof(m + d), ph: rnd() })));
  const l1 = lp1(), l2 = lp1();
  for (let k = 0; k < (dur + 0.8) * SR; k++) {
    const t = k / SR;
    let s = 0;
    for (const v of vs) {
      v.ph += v.f / SR;
      s += saw(v.ph);
    }
    s /= vs.length;
    const fc = 180 + 2600 * Math.min(1, t / 0.18) * Math.exp(-t / 1.2);
    const env = Math.min(1, t / 0.02) * (t < dur ? Math.exp(-t / (dur * 2.5)) : Math.exp(-(t - dur) / 0.3) * Math.exp(-1 / 2.5));
    const v = Math.tanh(l2(l1(s, fc), fc) * 5) * env * amp;
    bus.add(s0 + k, v, v * 0.97);
    if (rev) rev.add(s0 + k, v * 0.4);
  }
}
function stab(bus, t0, notes, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const vs = notes.flatMap((m) => [mtof(m) * 0.997, mtof(m) * 1.003]);
  const l = lp1();
  const ph = vs.map(() => 0);
  for (let k = 0; k < 0.22 * SR; k++) {
    const t = k / SR;
    let s = 0;
    vs.forEach((f, i) => {
      ph[i] += f / SR;
      s += saw(ph[i]);
    });
    const v = l(s / vs.length, 600 + 6000 * Math.exp(-t / 0.05)) * Math.exp(-t / 0.08) * amp * 1.6;
    bus.add(s0 + k, v, v);
    if (rev) rev.add(s0 + k, v * 0.35);
  }
}
function revCrash(bus, t1, dur = 1.2, amp = 1) {
  const s1 = Math.round(t1 * SR);
  const hp = hp1();
  for (let k = Math.round(dur * SR); k > 0; k--) {
    const t = k / SR;
    const v = hp(noise(k * 5 + 7), 3500) * Math.exp(-t / 0.45) * amp;
    bus.add(s1 - k, v, v * 0.9);
  }
}
function heart(bus, t0, amp = 1) {
  kick(bus, t0, amp * 0.9, 0.3);
  kick(bus, t0 + 0.16, amp * 0.55, 0.25);
}
function coin(bus, t0, amp = 1, rev) {
  bell(bus, t0, [2637, 3951], 0.22 * amp, 0.12, rev);
  bell(bus, t0 + 0.06, [3136, 4699], 0.2 * amp, 0.25, rev);
}
function zap(bus, t0, n, amp = 1, rev) {
  // one cascade wave: a short laser blip whose pitch climbs with the chain count
  const s0 = Math.round(t0 * SR);
  const f0 = mtof(76 + PENTA[Math.min(n, PENTA.length - 1)] * 0.5);
  let ph = 0;
  for (let k = 0; k < 0.1 * SR; k++) {
    const t = k / SR;
    ph += (f0 * (1.6 - 0.6 * Math.min(1, t / 0.05))) / SR;
    const v = (Math.sin(TAU * ph) * 0.7 + saw(ph) * 0.2) * Math.exp(-t / 0.03) * amp;
    bus.add(s0 + k, v * 0.9, v);
    if (rev) rev.add(s0 + k, v * 0.25);
  }
}

// ---------- deep tone (default; --bright restores the first mix) ----------
// Same arrangement and cue timing, re-voiced low and warm: an octave or two down, filters closed,
// sub-weighted drums, no bitcrush, no metallic bells or laser blips, and a darker master.
const DEEP = !process.argv.includes("--bright");
const lowShelf = () => {
  const l = lp1();
  return (x, fc, gain) => x + l(x, fc) * gain;
};
function kickDeep(bus, t0, amp = 1, len = 0.45) {
  const s0 = Math.round(t0 * SR);
  const L = len * 1.35;
  let ph = 0;
  const lp = lp1();
  for (let k = 0; k < L * SR; k++) {
    const t = k / SR;
    const f = 38 + 72 * Math.exp(-t / 0.045);
    ph += (TAU * f) / SR;
    const env = Math.exp(-t / (L * 0.45));
    const click = k < 400 ? lp(noise(k + s0), 900) * (1 - k / 400) * 0.5 : 0;
    const v = (Math.tanh(Math.sin(ph) * 1.6) * env + click) * amp * 1.1;
    bus.add(s0 + k, v, v);
  }
}
// a deep snare / drum: low body with a little dark noise, instead of a bright clap
function clapDeep(bus, t0, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const lp = lp1(), lp2 = lp1();
  let ph = 0;
  for (let k = 0; k < 0.42 * SR; k++) {
    const t = k / SR;
    ph += (TAU * (150 + 70 * Math.exp(-t / 0.03))) / SR;
    const body = Math.sin(ph) * Math.exp(-t / 0.09);
    const nz = lp2(lp(noise(k * 3 + s0), 1500), 1500) * Math.exp(-t / 0.07) * 1.6;
    const v = (body * 0.9 + nz) * amp * 0.85;
    bus.add(s0 + k, v * 0.97, v);
    if (rev) rev.add(s0 + k, v * 0.45);
  }
}
// soft shaker in place of hi-hats: band-limited and quiet
function hatDeep(bus, t0, amp = 1, open = false) {
  const s0 = Math.round(t0 * SR);
  const hp = hp1(), lp = lp1();
  const len = open ? 0.16 : 0.05;
  for (let k = 0; k < len * SR; k++) {
    const t = k / SR;
    const x = lp(hp(noise(k * 7 + s0 * 3), 2500), 7000);
    const v = x * Math.min(1, t / 0.004) * Math.exp(-t / (open ? 0.05 : 0.016)) * amp * 0.75;
    bus.add(s0 + k, v * 0.85, v);
  }
}
// a low swell in place of a cymbal crash
function crashDeep(bus, t0, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const lp = lp1(), lp2 = lp1();
  for (let k = 0; k < 2.4 * SR; k++) {
    const t = k / SR;
    const x = lp2(lp(noise(k * 5 + 99), 1400), 1400);
    const sub = Math.sin(TAU * 41 * t) * Math.exp(-t / 0.9) * 0.4;
    const v = (x * 1.4 + sub) * Math.min(1, t / 0.02) * Math.exp(-t / 0.8) * amp * 0.8;
    bus.add(s0 + k, v, v * 0.95);
    if (rev) rev.add(s0 + k, v * 0.4);
  }
}
const _pad = padChord;
function padDeep(bus, t0, dur, notes, amp = 1, cutoff = 1400, rev) {
  _pad(bus, t0, dur, [notes[0] - 12, ...notes.map((m) => m - 12)], amp * 1.15, Math.min(cutoff, 1400) * 0.5, rev);
}
// warm felt pluck, two octaves under the original arp
function pluckDeep(bus, t0, midi, amp = 1, rev, pan = 0) {
  const s0 = Math.round(t0 * SR);
  const f = mtof(midi - 24);
  const l = lp1();
  let ph = 0;
  for (let k = 0; k < 0.34 * SR; k++) {
    const t = k / SR;
    ph += f / SR;
    const tri = 1 - 4 * Math.abs(ph - Math.floor(ph + 0.5));
    const x = l(tri + Math.sin(TAU * ph * 2) * 0.15, 500 + 1200 * Math.exp(-t / 0.04));
    const v = x * Math.min(1, k / 60) * Math.exp(-t / 0.12) * amp * 1.5;
    bus.add(s0 + k, v * (1 - pan * 0.6), v * (1 + pan * 0.6));
    if (rev) rev.add(s0 + k, v * 0.3);
  }
}
const _reese = reese;
function reeseDeep(bus, t0, dur, midi, amp = 1, cutoff = 900, wobble = 0) {
  _reese(bus, t0, dur, midi, amp * 1.05, cutoff * 0.5, wobble * 0.5);
}
const _stab = stab;
function stabDeep(bus, t0, notes, amp = 1, rev) {
  // low brass hit: the chord an octave under, through a closed filter
  const s0 = Math.round(t0 * SR);
  const vs = notes.flatMap((m) => [mtof(m - 24) * 0.996, mtof(m - 24) * 1.004, mtof(m - 12)]);
  const l = lp1(), l2 = lp1();
  const ph = vs.map(() => 0);
  for (let k = 0; k < 0.36 * SR; k++) {
    const t = k / SR;
    let s = 0;
    vs.forEach((f, i) => {
      ph[i] += f / SR;
      s += saw(ph[i]);
    });
    const fc = 300 + 1300 * Math.exp(-t / 0.06);
    const v = Math.tanh(l2(l(s / vs.length, fc), fc) * 3) * Math.min(1, t / 0.006) * Math.exp(-t / 0.14) * amp * 1.4;
    bus.add(s0 + k, v, v);
    if (rev) rev.add(s0 + k, v * 0.4);
  }
}
const _braam = braam;
function braamDeep(bus, t0, dur, notes, amp = 1, rev) {
  _braam(bus, t0, dur, notes.map((m) => (m > 48 ? m - 12 : m)), amp * 1.1, rev);
}
function revCrashDeep(bus, t1, dur = 1.2, amp = 1) {
  const s1 = Math.round(t1 * SR);
  const lp = lp1();
  let ph = 0;
  for (let k = Math.round(dur * SR); k > 0; k--) {
    const t = k / SR;
    const x = (dur - t) / dur;
    ph += (35 + 60 * x * x) / SR;
    const v = (lp(noise(k * 5 + 7), 300 + 1500 * x * x) * 1.4 + Math.sin(TAU * ph) * 0.6) * Math.pow(x, 2) * amp;
    bus.add(s1 - k, v, v * 0.95);
  }
}
function riserDeep(bus, t0, dur, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const lp = lp1(), lp2 = lp1();
  let ph = 0, ph2 = 0;
  for (let k = 0; k < dur * SR; k++) {
    const x = k / (dur * SR);
    ph += (40 + 80 * x * x) / SR;
    ph2 += (80 + 160 * x * x) / SR;
    const fc = 200 + 1600 * x * x;
    const env = Math.pow(x, 1.5);
    const v = (lp2(lp(noise(k + s0), fc), fc) * 1.5 + Math.sin(TAU * ph) * 0.5 + saw(ph2) * 0.08) * env * amp;
    bus.add(s0 + k, v, v);
    if (rev) rev.add(s0 + k, v * 0.3);
  }
}
// hover: a low wooden mallet, "dom dom dom", still climbing per step but an octave and a half down
function dengDeep(bus, t0, step, amp = 1, base = 69, rev) {
  const s0 = Math.round(t0 * SR);
  const f = mtof(base - 19 + PENTA[Math.min(step, PENTA.length - 1)]);
  const lp = lp1();
  for (let k = 0; k < 0.3 * SR; k++) {
    const t = k / SR;
    const body = Math.sin(TAU * f * t) * Math.exp(-t / 0.11) + Math.sin(TAU * f * 2.01 * t) * 0.12 * Math.exp(-t / 0.03);
    const thump = Math.sin(TAU * f * 0.5 * t) * Math.exp(-t / 0.06) * 0.5;
    const v = lp(body + thump, 1400) * Math.min(1, k / 120) * amp * 1.2;
    const pan = ((step % 5) - 2) * 0.08;
    bus.add(s0 + k, v * (1 - pan), v * (1 + pan));
    if (rev) rev.add(s0 + k, v * 0.25);
  }
}
function mclickDeep(bus, t0, amp = 1) {
  const s0 = Math.round(t0 * SR);
  const lp = lp1();
  for (let k = 0; k < 0.1 * SR; k++) {
    const t = k / SR;
    const tick = lp(noise(k * 11 + s0), 3200) * Math.exp(-t / 0.006);
    const thump = Math.sin(TAU * (120 - 300 * t) * t) * Math.exp(-t / 0.03);
    const v = (tick * 0.9 + thump) * amp;
    bus.add(s0 + k, v, v);
  }
}
function whooshDeep(bus, t0, dur = 0.4, amp = 1, up = false, rev) {
  const s0 = Math.round((t0 - dur * 0.7) * SR);
  const bp = svf();
  for (let k = 0; k < dur * SR; k++) {
    const x = k / (dur * SR);
    const fc = up ? 150 + 1300 * x * x : 1400 - 1250 * x;
    const env = Math.sin(Math.PI * Math.pow(x, 0.8)) ** 2;
    const v = bp(noise(k * 2 + s0), fc, 0.6).band * env * amp * 1.8;
    const pan = (x - 0.5) * 0.9;
    bus.add(s0 + k, v * (1 - pan), v * (1 + pan));
    if (rev) rev.add(s0 + k, v * 0.3);
  }
}
const _boom = boom;
function boomDeep(bus, t0, amp = 1, size = 1, rev) {
  _boom(bus, t0, amp, size, null);
  // extra sub tail; the reverb send stays dark
  const s0 = Math.round(t0 * SR);
  let ph = 0;
  for (let k = 0; k < (1.2 + size * 0.3) * SR; k++) {
    const t = k / SR;
    ph += (TAU * (32 + 20 * Math.exp(-t / 0.2))) / SR;
    const v = Math.sin(ph) * Math.exp(-t / (0.45 + size * 0.1)) * amp * 0.6;
    bus.add(s0 + k, v, v);
    if (rev) rev.add(s0 + k, v * 0.2);
  }
}
const _sweep = sweep;
function sweepDeep(bus, t0, dur, f0, f1, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const a = Math.min(f0, 400) / (f0 > 400 ? 3 : 1), b = Math.min(f1, 400) / (f1 > 400 ? 3 : 1);
  let ph = 0;
  for (let k = 0; k < dur * SR; k++) {
    const x = k / (dur * SR);
    ph += (a * Math.pow(b / a, x)) / SR;
    const v = Math.sin(TAU * ph) * Math.sin(Math.PI * x) * amp * 0.9;
    bus.add(s0 + k, v, v);
    if (rev) rev.add(s0 + k, v * 0.3);
  }
}
const _bell = bell;
function bellDeep(bus, t0, freqs, amp = 1, decay = 0.6, rev) {
  // bells become a low gong: every partial folded under 700 Hz, softer and longer
  const low = freqs.map((f) => {
    let g = f;
    while (g > 700) g /= 2;
    return g;
  });
  _bell(bus, t0, low, amp * 0.8, decay * 1.6, rev);
}
// tape wobble instead of digital glitch
function glitchDeep(bus, t0, dur = 0.25, amp = 1) {
  const s0 = Math.round(t0 * SR);
  const lp = lp1();
  let ph = 0;
  for (let k = 0; k < dur * SR; k++) {
    const x = k / (dur * SR);
    ph += (90 * (1 - 0.6 * x) * (1 + 0.15 * Math.sin(TAU * 18 * x))) / SR;
    const v = (Math.sin(TAU * ph) * 0.8 + lp(noise(k + s0), 600) * 0.8) * Math.sin(Math.PI * x) * amp;
    bus.add(s0 + k, v, v);
  }
}
// cascade waves: low pulses whose pitch climbs with the chain, felt more than heard
function zapDeep(bus, t0, n, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const f = mtof(36 + PENTA[Math.min(n, PENTA.length - 1)] * 0.5);
  let ph = 0;
  const lp = lp1();
  for (let k = 0; k < 0.16 * SR; k++) {
    const t = k / SR;
    ph += (f * (1.3 - 0.3 * Math.min(1, t / 0.04))) / SR;
    const v = (Math.sin(TAU * ph) + lp(noise(k + s0), 500) * 0.4) * Math.min(1, k / 50) * Math.exp(-t / 0.05) * amp * 1.8;
    bus.add(s0 + k, v, v);
    if (rev) rev.add(s0 + k, v * 0.15);
  }
}
function taiko(bus, t0, amp = 1, rev) {
  const s0 = Math.round(t0 * SR);
  const lp = lp1();
  let ph = 0;
  for (let k = 0; k < 0.7 * SR; k++) {
    const t = k / SR;
    ph += (TAU * (62 + 40 * Math.exp(-t / 0.025))) / SR;
    const v = (Math.sin(ph) * Math.exp(-t / 0.22) + lp(noise(k * 3 + s0), 700) * Math.exp(-t / 0.05) * 1.2) * amp;
    bus.add(s0 + k, v, v);
    if (rev) rev.add(s0 + k, v * 0.35);
  }
}
if (DEEP) {
  kick = kickDeep;
  clap = clapDeep;
  hat = hatDeep;
  crash = crashDeep;
  padChord = padDeep;
  pluck = pluckDeep;
  reese = reeseDeep;
  stab = stabDeep;
  braam = braamDeep;
  revCrash = revCrashDeep;
  riser = riserDeep;
  deng = dengDeep;
  mclick = mclickDeep;
  whoosh = whooshDeep;
  boom = boomDeep;
  sweep = sweepDeep;
  bell = bellDeep;
  glitch = glitchDeep;
  zap = zapDeep;
}

// ---------- arrangement ----------
const BPM = CUES.bpm;
const BEAT = 60 / BPM;
const BARL = 4 * BEAT;
const T = (bar, beat = 0) => bar * BARL + beat * BEAT;
// F minor: i – VI – III – VII
const CH = [
  { root: 41, notes: [53, 56, 60] },
  { root: 37, notes: [49, 53, 56] },
  { root: 44, notes: [56, 60, 63] },
  { root: 39, notes: [51, 55, 58] },
];
const chordAt = (t) => CH[Math.floor(t / BARL + 1e-6) % 4];
const sect = (t) => {
  if (t < T(2)) return "open";
  if (t < T(2, 2)) return "rewind";
  if (t < T(4)) return "title";
  if (t < T(7)) return "read";
  if (t < T(9, 3)) return "load";
  if (t < T(10)) return "freeze";
  if (t < T(13, 2)) return "drop";
  if (t < T(14, 2)) return "slow";
  if (t < T(16)) return "tension";
  if (t < T(19)) return "cash";
  if (t < T(21)) return "half";
  if (t < T(23)) return "final";
  return "tail";
};
const music = new Bus();
const mrev = new Bus();
const drums = new Bus();
const FULL = new Set(["open", "drop", "cash", "final"]);

for (let b = 0; b * BEAT < DUR - 1e-6; b++) {
  const t = b * BEAT;
  const s = sect(t);
  const inBar = b % 4;
  const ch = chordAt(t);
  const bar = Math.floor(b / 4);
  if (FULL.has(s)) {
    kick(drums, t, 1.0, 0.42);
    if (inBar === 1 || inBar === 3) clap(drums, t, 0.85, mrev);
    for (let q = 0; q < 4; q++) hat(drums, t + q * (BEAT / 4), q === 2 ? 0.42 : 0.2, q === 2);
    for (let q = 0; q < 2; q++) reese(music, t + q * (BEAT / 2), BEAT / 2 - 0.02, ch.root + (q ? 12 : 0) - 12, 0.5, s === "drop" ? 1300 : 1000, s === "drop" ? 1 : 0.4);
    if (inBar === 0 || (inBar === 2 && bar % 2)) stab(music, t, ch.notes.map((m) => m + 12), 0.32, mrev);
    const arp = [...ch.notes, ch.notes[0] + 12];
    for (let q = 0; q < 4; q++) pluck(music, t + q * (BEAT / 4), arp[(b * 4 + q) % 4] + 12, 0.11, mrev, q % 2 ? 0.45 : -0.45);
  } else if (s === "read" || s === "half") {
    if (inBar === 0) kick(drums, t, 0.95, 0.6);
    if (inBar === 2) clap(drums, t, 0.8, mrev);
    if (inBar === 3) kick(drums, t + BEAT / 2, 0.5, 0.3);
    for (let q = 0; q < 2; q++) hat(drums, t + q * (BEAT / 2), q ? 0.12 : 0.2);
    reese(music, t, BEAT - 0.03, ch.root - 12, 0.38, 520, 0);
    if (s === "half") {
      const arp = [...ch.notes, ch.notes[0] + 12];
      for (let q = 0; q < 2; q++) pluck(music, t + q * (BEAT / 2), arp[(b * 2 + q) % 4] + 12, 0.1, mrev, q % 2 ? 0.4 : -0.4);
    }
  } else if (s === "load") {
    const x = (t - T(7)) / (T(9, 3) - T(7));
    kick(drums, t, 0.7 + 0.3 * x, 0.38);
    for (let q = 0; q < 4; q++) if (x > 0.3 || q % 2 === 0) hat(drums, t + q * (BEAT / 4), (0.12 + 0.25 * x) * (q === 2 ? 1 : 0.5));
    for (let q = 0; q < 2; q++) reese(music, t + q * (BEAT / 2), BEAT / 2 - 0.02, ch.root - 12 + (q ? 12 : 0), 0.4, 500 + 1200 * x, x);
    const arp = [...ch.notes, ch.notes[0] + 12];
    for (let q = 0; q < 4; q++) pluck(music, t + q * (BEAT / 4), arp[(b * 4 + q) % 4] + 12 + (x > 0.66 ? 12 : 0), 0.06 + 0.08 * x, mrev, q % 2 ? 0.45 : -0.45);
  } else if (s === "slow") {
    // slow motion: the groove drops to half time and sinks under a low-pass (applied below)
    if (inBar === 0) kick(drums, t, 1.0, 0.8);
    if (inBar === 2) clap(drums, t, 0.6, mrev);
    reese(music, t, BEAT - 0.03, ch.root - 12, 0.5, 700, 0.3);
  } else if (s === "tension") {
    heart(drums, t, 0.9);
    reese(music, t, BEAT - 0.05, 41 - 12, 0.32, 380, 0);
    hat(drums, t + BEAT / 2, 0.14);
  } else if (s === "title") {
    if (inBar === 0 && t > T(3)) kick(drums, t, 0.6, 0.6);
    hat(drums, t + BEAT / 2, 0.1);
  }
}
// pads under the quieter sections, one per bar
for (let bar = 0; bar * BARL < DUR; bar++) {
  const t = bar * BARL;
  const s = sect(t + 0.01);
  if (s === "rewind" || s === "freeze" || s === "tail") continue;
  const ch = chordAt(t);
  const amp = FULL.has(s) ? 0.16 : s === "tension" ? 0.22 : 0.2;
  padChord(music, t, BARL, s === "tension" ? [53, 56, 61] : ch.notes, amp, FULL.has(s) ? 1800 : 900, mrev);
}
// deep tone: taiko on the downbeats of the loud sections and a low drone under the quiet ones
if (DEEP) {
  for (let b = 0; b * BEAT < DUR - 1e-6; b++) {
    const t = b * BEAT;
    const s = sect(t);
    if (FULL.has(s) && b % 2 === 0) taiko(drums, t, b % 4 === 0 ? 0.75 : 0.45, mrev);
    if (s === "load" && b % 4 === 0) taiko(drums, t, 0.55, mrev);
  }
  for (let bar = 0; bar * BARL < DUR; bar++) {
    const s = sect(bar * BARL + 0.01);
    if (s === "title" || s === "read" || s === "tension") bassNote(music, bar * BARL, BARL - 0.05, 29, 0.32, 160);
  }
}
// title: braam + a second hit
braam(music, T(2, 2), 1.6, [29, 41, 48, 53], 0.9, mrev);
braam(music, T(3, 2), 1.1, [32, 44, 51], 0.6, mrev);
// snare roll into the freeze
for (let t = T(9); t < T(9, 3); ) {
  const x = (t - T(9)) / (3 * BEAT);
  clap(drums, t, 0.25 + 0.6 * x, mrev);
  t += BEAT / 2 - (BEAT / 2 - BEAT / 8) * x;
}
riser(music, T(8), T(9, 3) - T(8), 0.5, mrev);
revCrash(music, T(10), 1.0, 0.7);
riser(music, T(14, 2), T(16) - T(14, 2), 0.45, mrev);
riser(music, T(1), T(2) - T(1), 0.3, mrev);
[T(0), T(10), T(16), T(21), T(23)].forEach((t) => crash(music, t, 0.5, mrev));
// final hit and tail
braam(music, T(23), 1.6, [29, 41, 48, 53, 60], 0.85, mrev);
padChord(music, T(23), 1.6, [41, 48, 53, 56, 60], 0.32, 1300, mrev);
bell(music, T(23), [698, 1046, 1396], 0.12, 1.4, mrev);

// sidechain pump from the kicks in the busy sections
{
  const env = new Float32Array(N);
  for (let b = 0; b * BEAT < DUR; b++) {
    const t = b * BEAT;
    if (!FULL.has(sect(t)) && sect(t) !== "load") continue;
    const s0 = Math.round(t * SR);
    for (let k = 0; k < 0.3 * SR; k++) if (s0 + k < N) env[s0 + k] = Math.max(env[s0 + k], Math.exp(-k / SR / 0.09));
  }
  for (let n = 0; n < N; n++) {
    const g = 1 - 0.6 * env[n];
    music.L[n] *= g;
    music.R[n] *= g;
  }
}
reverb(mrev, music, 0.45);
for (let n = 0; n < N; n++) {
  music.L[n] += drums.L[n];
  music.R[n] += drums.R[n];
}
// slow-motion low-pass over bar 13.5–14.5
{
  const a = Math.round(T(13, 2) * SR), b = Math.round(T(14, 2) * SR);
  let yl = 0, yr = 0;
  for (let n = a; n < b + SR * 0.1 && n < N; n++) {
    const x = Math.min(1, (n - a) / (0.12 * SR)) * (n > b ? Math.max(0, 1 - (n - b) / (0.1 * SR)) : 1);
    const fc = 20000 * Math.pow(400 / 20000, x);
    const k = 1 - Math.exp((-TAU * fc) / SR);
    yl += k * (music.L[n] - yl);
    yr += k * (music.R[n] - yr);
    music.L[n] = yl * 1.15;
    music.R[n] = yr * 1.15;
  }
}
// tape stop into the rewind: the open's last beat slows to a halt, then silence until the title
{
  const a = Math.round(T(2) * SR), len = Math.round(0.42 * SR), end = Math.round(T(2, 2) * SR);
  const L = music.L.slice(a, a + len * 2), R = music.R.slice(a, a + len * 2);
  let pos = 0;
  for (let k = 0; k < end - a; k++) {
    const x = k / len;
    const rate = x < 1 ? 1 - x : 0;
    pos += rate;
    const i = Math.floor(pos);
    const g = x < 1 ? 1 - x * 0.4 : 0;
    music.L[a + k] = (L[i] ?? 0) * g;
    music.R[a + k] = (R[i] ?? 0) * g;
  }
}
// duck before the big landings so they hit from silence
[T(2, 2), T(10), T(16), T(23)].forEach((t) => {
  const a = Math.round((t - 0.18) * SR), b = Math.round(t * SR);
  for (let n = a; n < b; n++) {
    const g = 0.1 + 0.9 * Math.pow(1 - (n - a) / (b - a), 2);
    music.L[n] *= g;
    music.R[n] *= g;
  }
});
// freeze: everything but the sub swell drops out
{
  const a = Math.round(T(9, 3) * SR), b = Math.round(T(10) * SR);
  for (let n = a; n < b; n++) {
    const g = 0.18 * (1 - (n - a) / (b - a));
    music.L[n] *= g;
    music.R[n] *= g;
  }
  sweep(music, T(9, 3), BEAT, 40, 90, 0.5);
}
for (let n = Math.round((DUR - 1.4) * SR); n < N; n++) {
  const g = Math.max(0, (N - n) / (1.4 * SR));
  music.L[n] *= g;
  music.R[n] *= g;
}

// ---------- SFX ----------
const sfx = new Bus();
const srev = new Bus();
let lastHover = -9, step = 0, lastZap = -9;
for (const c of cues) {
  const t = c.t;
  switch (c.type) {
    case "hover":
      step = t - lastHover > 0.45 ? 0 : step + 1;
      lastHover = t;
      deng(sfx, t, step + (c.tag?.startsWith("hover-size") ? 2 : 0), 0.55, 69, srev);
      break;
    case "click":
      mclick(sfx, t, 1.0);
      if (c.tag === "size-5000") {
        thud(sfx, t, 0.9, 70);
        bell(sfx, t, [880, 1320, 1760], 0.16, 0.35, srev);
      } else if (c.tag === "lev-5" || c.tag === "buy") {
        thud(sfx, t, 1.0, 64);
        bell(sfx, t, [659, 988], 0.12, 0.3, srev);
      } else if (c.tag === "run") {
        thud(sfx, t, 1.2, 55);
        glitch(sfx, t + 0.02, 0.18, 0.25);
      } else if (c.tag === "close") {
        thud(sfx, t, 1.1, 60);
      }
      break;
    case "wave":
      if (t - lastZap < (DEEP ? 0.09 : 0.045)) break;
      lastZap = t;
      zap(sfx, t, c.n, 0.22, srev);
      thud(sfx, t, 0.25, 120);
      break;
    case "hit":
      if (c.k >= 0.9) boom(sfx, t, 0.9, 2.5, srev);
      else thud(sfx, t, 0.5 + 0.5 * c.k, 70);
      whoosh(sfx, t, 0.22, 0.25 * c.k, true);
      break;
    case "whip":
      whoosh(sfx, t + 0.04, 0.28, 0.65, false, srev);
      break;
  }
}
// rewind: reversed whooshes and tape chatter
whoosh(sfx, T(2) + 0.3, 0.4, 0.8, false, srev);
whoosh(sfx, T(2) + 0.75, 0.45, 0.8, true, srev);
glitch(sfx, T(2) + 0.05, 0.25, 0.3);
glitch(sfx, T(2, 2), 0.22, 0.35);
// title: impact
boom(sfx, T(2, 2), 1.0, 4, srev);
// cash out: coins pour, register rings as the total counts
boom(sfx, T(16), 0.9, 3, srev);
for (let i = 0; i < 9; i++) coin(sfx, T(16) + 0.05 + i * 0.07 + hashN(i) * 0.03, 0.9 - i * 0.06, srev);
bell(sfx, T(16, 2) + 1.0, [1568, 2349, 3136], 0.3, 0.6, srev);
sweep(sfx, T(17), 1.6, 900, 120, 0.3, srev);
// report and CTA
bell(sfx, T(18), [1046, 1568, 2093], 0.2, 0.6, srev);
coin(sfx, T(21) + 0.05, 0.8, srev);
boom(sfx, T(23), 1.0, 4, srev);
reverb(srev, sfx, 0.5);

// ---------- write ----------
function peak(bus) {
  let p = 0;
  for (let n = 0; n < N; n++) p = Math.max(p, Math.abs(bus.L[n]), Math.abs(bus.R[n]));
  return p;
}
// music normalised to a bed level; SFX keep their designed levels. A master limiter
// on the summed mix tames the booms and lifts overall loudness.
const mp = peak(music);
// music level is set by the loudness of the drop, not by its loudest peak; the limiter handles peaks
let ms = 0;
for (let n = Math.round(T(10) * SR); n < Math.round(T(13) * SR); n++) ms += music.L[n] ** 2 + music.R[n] ** 2;
const rms = Math.sqrt(ms / (2 * (Math.round(T(13) * SR) - Math.round(T(10) * SR))));
const MG = Math.min((DEEP ? 0.21 : 0.24) / rms, 0.95 / mp), SG = 0.8;
const master = new Bus();
for (let n = 0; n < N; n++) {
  master.L[n] = music.L[n] * MG + sfx.L[n] * SG;
  master.R[n] = music.R[n] * MG + sfx.R[n] * SG;
}
if (DEEP) {
  // high shelf down about 4.5 dB above ~3 kHz, low shelf up about 3 dB under ~110 Hz, gentle top roll-off
  const sh = [lp1(), lp1()], lo = [lp1(), lp1()], top = [lp1(), lp1()];
  for (let n = 0; n < N; n++) {
    for (const [i, ch] of [[0, master.L], [1, master.R]]) {
      const x = ch[n];
      const low = sh[i](x, 3000);
      let y = low + (x - low) * 0.6;
      y += lo[i](y, 110) * 0.4;
      ch[n] = top[i](y, 12000);
    }
  }
}
{
  const PRE = 1.05, CEIL = DEEP ? 0.84 : 0.9, LA = Math.round(0.003 * SR);
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
    const l = Math.max(-1, Math.min(1, DEEP ? bus.L[n] * gain : Math.tanh(bus.L[n] * gain * 1.05) / 1.05));
    const r = Math.max(-1, Math.min(1, DEEP ? bus.R[n] * gain : Math.tanh(bus.R[n] * gain * 1.05) / 1.05));
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
