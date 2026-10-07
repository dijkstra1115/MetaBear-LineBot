// Mixes the soundtrack: the narration (warmed, compressed, optionally pitched) over a low drone bed and a handful of
// synthesized hits. No music. Reads assets/audio/vo-raw.wav and assets/audio/sfx.json (from scripts/build.mjs); writes soundtrack.wav.
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
let seed = 20261007;
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
// user-supplied clips (assets/audio/sfx/*.mp3), decoded once and placed like any other sound
const clipCache = {};
// tempo < 1 stretches a clip (pitch kept) so it lasts longer
const clip = (name, tempo = 1) => {
  const key = name + "@" + tempo;
  if (!clipCache[key]) {
    const af = tempo !== 1 ? ["-af", `rubberband=tempo=${tempo}:pitchq=quality`] : [];
    const raw = execFileSync(FFMPEG, ["-v", "error", "-i", `assets/audio/sfx/${name}.mp3`, ...af, "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], { maxBuffer: 1 << 28 });
    clipCache[key] = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  }
  return clipCache[key];
};
const SYN = {
  // { file, t, gain, from }: plays a clip starting at t (from = seconds skipped into the clip)
  // drive > 0 saturates the clip so a sub-bass sound grows audible harmonics on small speakers
  sample: ({ file, t, gain = 1, from = 0, fadeOut = 0, tempo = 1, drive = 0, fadeIn = 0 }) => {
    const d = clip(file, tempo);
    const sat = (v) => (drive ? 0.5 * v + 0.5 * (Math.tanh(v * drive) / Math.tanh(drive)) : v);
    const fi = Math.round(fadeIn * SR);
    const n0 = at(t), skip = Math.round(from * SR), len = d.length / 2 - skip, fo = Math.round(fadeOut * SR);
    for (let i = 0; i < len; i++) {
      const g = (fo && i > len - fo ? (len - i) / fo : 1) * (fi && i < fi ? i / fi : 1);
      const n = n0 + i;
      if (n < 0 || n >= N) continue;
      L[n] += sat(d[(skip + i) * 2]) * gain * g;
      R[n] += sat(d[(skip + i) * 2 + 1]) * gain * g;
    }
  },
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
  // the bed: a low F2 with its fifth and octave, slowly breathing through a low-pass
  drone: ({ t, dur = 20, gain = 0.1 }) => {
    const n0 = at(t), len = at(dur);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < len; i++) {
      const x = i / SR;
      const env = Math.min(1, x / 1.5) * Math.min(1, (dur - x) / 1.2);
      const fc = 260 + 140 * Math.sin(x * 0.45) ** 2;
      const k = 1 - Math.exp((-2 * Math.PI * fc) / SR);
      const v = sine(87.31, i) + sine(130.81, i) * 0.45 + sine(174.61, i) * 0.35 * (1 + 0.3 * Math.sin(x * 0.7)) + sine(87.6, i) * 0.4;
      s1 += k * (v - s1);
      s2 += k * (s1 - s2);
      put(n0 + i, s2 * env * gain, Math.sin(x * 0.3) * 0.25);
    }
  },
  air: ({ t, gain = 0.06 }) => {
    const n0 = at(t), len = at(1.8), hp = biquad("hp", 5000, 0.7);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      put(n0 + i, hp(rnd()) * Math.min(1, x * 12) * (1 - x) ** 2 * gain * 3, Math.sin(i / 5000) * 0.6);
    }
  },
  riser: ({ t, dur = 1.5, gain = 0.1 }) => {
    const n0 = at(t), len = at(dur);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const fc = 200 * Math.pow(40, x);
      const k = 1 - Math.exp((-2 * Math.PI * fc) / SR);
      s1 += k * (rnd() - s1);
      s2 += k * (s1 - s2);
      put(n0 + i, ((s1 - s2) * 2 + sine(87.31 * (1 + x), i) * 0.15) * Math.pow(x, 2.4) * gain * 2);
    }
  },
  boom: ({ t, gain = 0.5 }) => {
    const n0 = at(t), len = at(2.6), lp = biquad("lp", 180, 0.8);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const f = 34 + 46 * Math.exp(-i / (0.07 * SR));
      ph += (2 * Math.PI * f) / SR;
      const body = Math.sin(ph) * Math.exp(-i / (0.9 * SR));
      const tail = lp(rnd()) * 3 * Math.exp(-i / (0.5 * SR));
      put(n0 + i, (body + tail) * Math.min(1, i / 120) * gain);
    }
    SYN.air({ t, gain: gain * 0.12 });
  },
  // a laptop key: press transient, a short body, then a softer release click
  key: ({ t, gain = 0.12, pitch = 1900 }) => {
    const press = biquad("bp", pitch, 1.8), rel = biquad("bp", pitch * 1.3, 2.2), body = biquad("lp", 900, 0.9);
    const n0 = at(t), n1 = at(t + 0.055);
    for (let i = 0; i < at(0.03); i++) {
      const e = Math.exp(-i / (0.0035 * SR));
      put(n0 + i, (press(rnd()) * 2.4 + body(rnd()) * 1.6 + sine(190, i) * 0.35 * Math.exp(-i / 500)) * e * gain, 0.12);
    }
    for (let i = 0; i < at(0.02); i++) put(n1 + i, rel(rnd()) * 1.4 * Math.exp(-i / (0.0025 * SR)) * gain * 0.5, 0.12);
  },
  // a low, soft slide: band-passed noise breathing up and back down in the low mids, slightly widened
  lowslide: ({ t, dur = 1.5, gain = 0.15 }) => {
    // state-variable band-pass so the centre can glide without resetting the filter
    const n0 = at(t), len = at(dur), q = 0.9;
    let l1 = 0, b1 = 0, l2 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const fc = 150 + 330 * Math.sin(Math.PI * x);
      const f1 = 2 * Math.sin((Math.PI * fc) / SR), f2 = 2 * Math.sin((Math.PI * fc * 1.04) / SR);
      const a = rnd(), b = rnd();
      l1 += f1 * b1; const h1 = a * 0.7 + b * 0.3 - l1 - q * b1; b1 += f1 * h1;
      l2 += f2 * b2; const h2 = b * 0.7 + a * 0.3 - l2 - q * b2; b2 += f2 * h2;
      const e = Math.sin(Math.PI * Math.pow(x, 0.8)) ** 2 * gain * 2.5;
      put(n0 + i, b1 * e, -0.35);
      put(n0 + i, b2 * e, 0.35);
    }
  },
  pop: ({ t, gain = 0.15 }) => {
    SYN.thock({ t, gain });
    SYN.blip({ t: t + 0.01, pitch: 880, gain: gain * 0.3 });
  },
};
for (const c of CUES.sfx) {
  if (!SYN[c.type]) throw Error("unknown sound " + c.type);
  SYN[c.type](c);
}

// ---------- the narration ----------
// the splice from cues.mjs: the re-recorded opening sentence, then the original take from SPLICE.from on
const SP = CUES.splice;
// the voice chain (ffmpeg filters) runs after the splice; scripts/voice-lab.mjs renders alternatives
const FX = process.env.VOICE_FX ?? CUES.voiceFx ?? "";
const takePart = (a, b) => `atrim=${a}:${b},asetpts=PTS-STARTPTS,volume=${SP.takeGainDb}dB,aresample=${SR},aformat=channel_layouts=mono`;
const voGraph = SP
  ? `[1:a]asplit=2[t0][t1];[t0]${takePart(0, SP.cut[0])}[s0];[t1]${takePart(SP.cut[1], SP.takeEnd)}[s1];` +
    `[0:a]atrim=${SP.from},asetpts=PTS-STARTPTS,aresample=${SR},aformat=channel_layouts=mono[s2];[s0][s1][s2]concat=n=3:v=0:a=1${FX ? "," + FX : ""}[out]`
  : null;
const raw = execFileSync(FFMPEG, ["-v", "error", "-i", "assets/audio/vo-raw.wav", ...(SP ? ["-i", `assets/audio/${SP.take}`] : []), "-filter_complex", voGraph, "-map", "[out]", "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"], { maxBuffer: 1 << 30 });
if (process.env.VO_ONLY) {
  // voice-lab: write just the processed narration and stop
  fs.writeFileSync(process.env.VO_ONLY, raw);
  process.exit(0);
}
const vo = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const warm = biquad("lowshelf", 140, 0.7, 2.5);
const deMud = biquad("peak", 320, 1.1, -1.5);
const hp = biquad("hp", 50, 0.7);
let env = 0;
const off = at(CUES.off);
for (let i = 0; i < vo.length; i++) {
  // with a voice chain the EQ already happened in ffmpeg; without one, a light default warmth
  let v = FX ? hp(vo[i]) : hp(deMud(warm(vo[i])));
  env = Math.max(Math.abs(v), env * 0.9995);
  const over = Math.max(0, env - 0.25);
  const g = 1 / (1 + over * 2.2);
  put(off + i, v * g * 1.15);
}

// ---------- master gain toward -14 LUFS, then a soft knee for the peaks ----------
const MASTER = 3.1;
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
