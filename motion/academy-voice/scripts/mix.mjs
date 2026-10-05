// Mixes the soundtrack: the narration (warmed, gently compressed) over synthesized sound design. No music.
// Reads assets/audio/vo-raw.wav and assets/audio/sfx.json (from scripts/build.mjs); writes soundtrack.wav.
// Usage: node scripts/mix.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const SR = 48000;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const CUES = JSON.parse(fs.readFileSync("assets/audio/sfx.json", "utf8"));
const N = Math.ceil(CUES.end * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);

// deterministic noise
let seed = 20261006;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
};
// RBJ biquad
const biquad = (type, f, q, gainDb = 0) => {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * f) / SR;
  const cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lp") [b0, b1, b2, a0, a1, a2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + al, -2 * cs, 1 - al];
  else if (type === "hp") [b0, b1, b2, a0, a1, a2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al];
  else if (type === "bp") [b0, b1, b2, a0, a1, a2] = [al, 0, -al, 1 + al, -2 * cs, 1 - al];
  else if (type === "lowshelf") {
    const s2 = 2 * Math.sqrt(A) * al;
    [b0, b1, b2, a0, a1, a2] = [A * (A + 1 - (A - 1) * cs + s2), 2 * A * (A - 1 - (A + 1) * cs), A * (A + 1 - (A - 1) * cs - s2), A + 1 + (A - 1) * cs + s2, -2 * (A - 1 + (A + 1) * cs), A + 1 + (A - 1) * cs - s2];
  } else if (type === "peak") [b0, b1, b2, a0, a1, a2] = [1 + al * A, -2 * cs, 1 - al * A, 1 + al / A, -2 * cs, 1 - al / A];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
};
const put = (n, v, pan = 0) => {
  if (n < 0 || n >= N) return;
  L[n] += v * Math.cos(((pan + 1) * Math.PI) / 4);
  R[n] += v * Math.sin(((pan + 1) * Math.PI) / 4);
};
const at = (t) => Math.round(t * SR);
const sine = (f, i) => Math.sin((2 * Math.PI * f * i) / SR);

// ---------- the sound vocabulary ----------
const SYN = {
  tick: ({ t, pitch = 2400, gain = 0.05 }) => {
    const n0 = at(t), len = at(0.03), bp = biquad("bp", pitch, 6);
    for (let i = 0; i < len; i++) put(n0 + i, (bp(rnd()) * 3 + sine(pitch, i) * 0.4) * Math.exp(-i / (0.004 * SR)) * gain, (pitch % 7) / 10 - 0.3);
  },
  blip: ({ t, pitch = 500, gain = 0.06 }) => {
    const n0 = at(t), len = at(0.12);
    for (let i = 0; i < len; i++) put(n0 + i, sine(pitch, i) * Math.exp(-i / (0.03 * SR)) * Math.min(1, i / 60) * gain);
  },
  click: ({ t, gain = 0.2 }) => {
    const n0 = at(t), len = at(0.05), hp = biquad("hp", 1200, 0.7);
    for (let i = 0; i < len; i++) put(n0 + i, (hp(rnd()) * 0.9 + sine(2800, i) * 0.35 + sine(180, i) * 0.6 * Math.exp(-i / 300)) * Math.exp(-i / (0.006 * SR)) * gain);
  },
  thock: ({ t, gain = 0.25 }) => {
    const n0 = at(t), len = at(0.35), lp = biquad("lp", 900, 0.8);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const f = 70 + 120 * Math.exp(-i / (0.02 * SR));
      ph += (2 * Math.PI * f) / SR;
      put(n0 + i, (Math.sin(ph) * 0.9 + lp(rnd()) * 0.5 * Math.exp(-i / 400)) * Math.exp(-i / (0.09 * SR)) * gain);
    }
  },
  sub: ({ t, gain = 0.25 }) => {
    const n0 = at(t), len = at(1.4);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const f = 38 + 30 * Math.exp(-i / (0.08 * SR));
      ph += (2 * Math.PI * f) / SR;
      put(n0 + i, Math.sin(ph) * Math.exp(-i / (0.45 * SR)) * Math.min(1, i / 200) * gain);
    }
  },
  impact: ({ t, gain = 0.4 }) => {
    SYN.sub({ t, gain: gain * 0.9 });
    const n0 = at(t), len = at(0.9), lp = biquad("lp", 2400, 0.7), lp2 = biquad("lp", 400, 0.7);
    for (let i = 0; i < len; i++) {
      const w = rnd();
      put(n0 + i, (lp(w) * 0.7 * Math.exp(-i / (0.05 * SR)) + lp2(w) * 1.6 * Math.exp(-i / (0.25 * SR))) * gain, 0);
    }
  },
  whoosh: ({ t, dur = 0.6, up = true, gain = 0.12 }) => {
    const n0 = at(t), len = at(dur);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const fc = up ? 300 * Math.pow(25, x) : 7000 * Math.pow(1 / 25, x);
      const k = 1 - Math.exp((-2 * Math.PI * fc) / SR);
      s1 += k * (rnd() - s1);
      s2 += k * (s1 - s2);
      const env = up ? Math.pow(x, 1.6) * (1 - Math.pow(x, 12)) : Math.pow(1 - x, 1.8) * Math.min(1, x * 20);
      put(n0 + i, (s1 - s2 * 0.6) * env * gain * 2.4, (x - 0.5) * (up ? 0.8 : -0.8));
    }
  },
  swell: ({ t, dur = 1, gain = 0.06 }) => {
    const n0 = at(t), len = at(dur);
    for (let i = 0; i < len; i++) {
      const x = i / len, env = Math.sin(Math.PI * x) ** 2;
      put(n0 + i, (sine(220, i) + sine(330.5, i) * 0.6 + sine(440.7, i) * 0.3) * env * gain);
    }
  },
  shimmer: ({ t, gain = 0.05 }) => {
    const n0 = at(t), len = at(1.6);
    const fs_ = [1568, 2093, 2637, 3136];
    for (let i = 0; i < len; i++) {
      let v = 0;
      fs_.forEach((f, j) => (v += sine(f, i) * Math.exp(-i / ((0.25 + j * 0.15) * SR)) * (j % 2 ? 0.6 : 1)));
      put(n0 + i, v * gain * Math.min(1, i / 400), Math.sin(i / 9000) * 0.5);
    }
  },
  slide: ({ t, gain = 0.06 }) => {
    const n0 = at(t), len = at(0.5), bp = biquad("bp", 2200, 1.2);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      put(n0 + i, bp(rnd()) * Math.sin(Math.PI * x) * gain * 3, x - 0.5);
    }
  },
  lock: ({ t, gain = 0.14 }) => {
    SYN.click({ t, gain: gain * 0.8 });
    SYN.blip({ t: t + 0.04, pitch: 1320, gain: gain * 0.35 });
  },
  clock: ({ t, gain = 0.06 }) => {
    SYN.tick({ t, pitch: 3200, gain: gain * 1.5 });
    SYN.blip({ t, pitch: 880, gain: gain * 0.4 });
  },
  tapestop: ({ t, gain = 0.1 }) => {
    const n0 = at(t), len = at(0.5);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len, f = 260 * (1 - x) ** 2 + 20;
      ph += (2 * Math.PI * f) / SR;
      put(n0 + i, (Math.sin(ph) + Math.sin(ph * 2.01) * 0.4) * (1 - x) * gain);
    }
  },
  rewind: ({ t, dur = 0.9, gain = 0.1 }) => {
    const n0 = at(t), len = at(dur);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len, f = 900 + 1400 * Math.sin(x * Math.PI * 7) ** 2;
      ph += (2 * Math.PI * f) / SR;
      const g = (rnd() * 0.5 + Math.sin(ph) * 0.4) * Math.sin(Math.PI * x) * gain;
      put(n0 + i, g, -0.4);
    }
  },
  rumble: ({ t, dur = 2, gain = 0.1 }) => {
    const n0 = at(t), len = at(dur), lp = biquad("lp", 140, 0.9);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      put(n0 + i, (lp(rnd()) * 6 + sine(46, i) * 0.4) * Math.pow(x, 1.4) * gain);
    }
  },
  card: ({ t, gain = 0.1, pitch = 600 }) => {
    SYN.whoosh({ t: t - 0.12, dur: 0.22, up: true, gain: gain * 0.6 });
    SYN.thock({ t, gain: gain * 0.7 });
    SYN.blip({ t, pitch, gain: gain * 0.4 });
  },
  ping: ({ t, pitch = 988, gain = 0.08 }) => {
    const n0 = at(t), len = at(1.2);
    for (let i = 0; i < len; i++) put(n0 + i, (sine(pitch, i) + sine(pitch * 2.0, i) * 0.25 + sine(pitch * 3.01, i) * 0.08) * Math.exp(-i / (0.32 * SR)) * Math.min(1, i / 120) * gain, (pitch - 1100) / 1200);
  },
  drone: ({ t, dur = 3, gain = 0.1 }) => {
    const n0 = at(t), len = at(dur), lp = biquad("lp", 600, 0.7);
    for (let i = 0; i < len; i++) {
      const x = i / len, env = Math.min(1, x * 3) * (x > 0.9 ? (1 - x) * 10 : 1);
      const v = sine(55, i) + sine(82.6, i) * 0.6 + sine(110.3, i) * 0.35 * (1 + Math.sin(i / 7000));
      put(n0 + i, lp(v) * env * Math.pow(x, 0.7) * gain);
    }
  },
};
for (const c of CUES.sfx) {
  if (!SYN[c.type]) throw Error("unknown sound " + c.type);
  SYN[c.type](c);
}

// ---------- the narration ----------
const raw = execFileSync(FFMPEG, ["-v", "error", "-i", "assets/audio/vo-raw.wav", "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"], { maxBuffer: 1 << 30 });
const vo = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const warm = biquad("lowshelf", 140, 0.7, 2.5);
const deMud = biquad("peak", 320, 1.1, -1.5);
const hp = biquad("hp", 50, 0.7);
let env = 0;
const off = at(CUES.off);
for (let i = 0; i < vo.length; i++) {
  let v = hp(deMud(warm(vo[i])));
  env = Math.max(Math.abs(v), env * 0.9995);
  const over = Math.max(0, env - 0.25);
  const g = 1 / (1 + over * 2.2);
  put(off + i, v * g * 1.15);
}

// ---------- master: +4.5 dB to about -16 LUFS, then a soft knee for the peaks ----------
const MASTER = 1.68;
let peak = 0;
const knee = (x) => {
  const a = Math.abs(x);
  return a < 0.9 ? x : Math.sign(x) * (0.9 + 0.09 * Math.tanh((a - 0.9) / 0.09));
};
for (let n = 0; n < N; n++) {
  L[n] *= MASTER;
  R[n] *= MASTER;
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  L[n] = knee(L[n]);
  R[n] = knee(R[n]);
}
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
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[n])) * 32767), 44 + n * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[n])) * 32767), 46 + n * 4);
}
fs.writeFileSync("assets/audio/soundtrack.wav", buf);
console.log(`soundtrack.wav ${CUES.end}s, ${CUES.sfx.length} sounds, peak ${peak.toFixed(3)}`);
