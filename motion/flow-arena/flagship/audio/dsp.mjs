// Small offline DSP kit for the score: band-limited oscillators, a TPT state-variable filter,
// Freeverb, ping-pong delay, varispeed, a glue compressor and a lookahead limiter.
// Deterministic: every random source is a seeded xorshift.

export const SR = 48000;

export const midi = (n) => 440 * 2 ** ((n - 69) / 12);
export const dbToGain = (db) => 10 ** (db / 20);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export class Bus {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
  }
  /** Mixes a mono signal at time `at` with equal-power pan (-1..1). */
  mono(at, x, gain = 1, pan = 0) {
    const i0 = Math.round(at * SR);
    const a = ((pan + 1) * Math.PI) / 4;
    const gl = Math.cos(a) * gain * Math.SQRT2;
    const gr = Math.sin(a) * gain * Math.SQRT2;
    for (let i = 0; i < x.length; i++) {
      const j = i0 + i;
      if (j < 0) continue;
      if (j >= this.n) break;
      this.L[j] += x[i] * gl;
      this.R[j] += x[i] * gr;
    }
  }
  stereo(at, L, R, gain = 1) {
    const i0 = Math.round(at * SR);
    for (let i = 0; i < L.length; i++) {
      const j = i0 + i;
      if (j < 0) continue;
      if (j >= this.n) break;
      this.L[j] += L[i] * gain;
      this.R[j] += R[i] * gain;
    }
  }
  mixInto(dst, gain = 1) {
    for (let i = 0; i < this.n; i++) {
      dst.L[i] += this.L[i] * gain;
      dst.R[i] += this.R[i] * gain;
    }
  }
  /** Multiplies by a gain curve sampled per sample: fn(t) or a Float32Array. */
  apply(curve) {
    if (typeof curve === "function") {
      for (let i = 0; i < this.n; i++) {
        const g = curve(i / SR);
        this.L[i] *= g;
        this.R[i] *= g;
      }
    } else {
      for (let i = 0; i < this.n; i++) {
        this.L[i] *= curve[i];
        this.R[i] *= curve[i];
      }
    }
  }
}

// ---------- Oscillators ----------

function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/**
 * Oscillator into a new buffer. `freq` is a number or fn(t) in Hz.
 * type: sine | saw | square | tri
 */
export function osc(type, dur, freq, { phase = 0, pw = 0.5 } = {}) {
  const n = Math.max(1, Math.round(dur * SR));
  const out = new Float32Array(n);
  let ph = phase % 1;
  const f = typeof freq === "function" ? freq : () => freq;
  let tri = 0;
  for (let i = 0; i < n; i++) {
    const hz = f(i / SR);
    const dt = Math.min(0.49, Math.abs(hz) / SR);
    let v;
    if (type === "sine") v = Math.sin(ph * 2 * Math.PI);
    else if (type === "saw") v = 2 * ph - 1 - blep(ph, dt);
    else {
      v = ph < pw ? 1 : -1;
      v += blep(ph, dt);
      v -= blep((ph + 1 - pw) % 1, dt);
      if (type === "tri") {
        tri = tri + dt * 4 * v;
        tri *= 0.999;
        v = tri;
      }
    }
    out[i] = v;
    ph += dt;
    if (ph >= 1) ph -= 1;
  }
  return out;
}

export function noise(dur, seed = 1) {
  const r = rng(seed);
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

// ---------- Envelopes ----------

/** Shapes a buffer in place by fn(t). */
export function shape(x, fn) {
  for (let i = 0; i < x.length; i++) x[i] *= fn(i / SR);
  return x;
}
export const expDecay = (rate) => (t) => Math.exp(-t * rate);
export function adsr(a, d, s, r, len) {
  return (t) => {
    if (t < a) return t / a;
    if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
    if (t < len) return s;
    return Math.max(0, s * (1 - (t - len) / r));
  };
}

export function add(dst, src, gain = 1, offset = 0) {
  for (let i = 0; i < src.length; i++) {
    const j = i + offset;
    if (j >= dst.length) break;
    dst[j] += src[i] * gain;
  }
  return dst;
}
export function sat(x, drive = 1.5) {
  const k = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k;
  return x;
}

// ---------- Filters ----------

/** TPT state-variable filter; mode lp | hp | bp. cutoff number or fn(t), q number. */
export function svf(x, mode, cutoff, q = 0.707) {
  const out = new Float32Array(x.length);
  let ic1 = 0;
  let ic2 = 0;
  const fn = typeof cutoff === "function" ? cutoff : null;
  let g = Math.tan((Math.PI * Math.min(cutoff, SR * 0.45)) / SR);
  const k = 1 / q;
  for (let i = 0; i < x.length; i++) {
    if (fn && (i & 15) === 0) g = Math.tan((Math.PI * clamp(fn(i / SR), 10, SR * 0.45)) / SR);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    out[i] = mode === "lp" ? v2 : mode === "bp" ? v1 : x[i] - k * v1 - v2;
  }
  return out;
}

/** One-pole high-pass on a whole bus (DC and rumble cleanup). */
export function highpassBus(bus, hz) {
  const a = Math.exp((-2 * Math.PI * hz) / SR);
  for (const ch of [bus.L, bus.R]) {
    let y = 0;
    let xp = 0;
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i];
      y = a * (y + x - xp);
      xp = x;
      ch[i] = y;
    }
  }
}

// ---------- Effects ----------

/** Freeverb (Jezar), stereo, from a stereo send bus into a new bus (wet only). */
export function freeverb(send, { room = 0.86, damp = 0.32, width = 1, pre = 0.02 } = {}) {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round(d * scale));
  const alls = [556, 441, 341, 225].map((d) => Math.round(d * scale));
  const spread = Math.round(23 * scale);
  const out = new Bus(send.n / SR);
  const preN = Math.round(pre * SR);
  const fb = room * 0.28 + 0.7;
  const run = (input, output, off) => {
    const cb = combs.map((d) => ({ buf: new Float32Array(d + off), i: 0, store: 0 }));
    const ab = alls.map((d) => ({ buf: new Float32Array(d + off), i: 0 }));
    for (let n = 0; n < input.length; n++) {
      const x = (n >= preN ? input[n - preN] : 0) * 0.015;
      let acc = 0;
      for (const c of cb) {
        const y = c.buf[c.i];
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * fb;
        if (++c.i >= c.buf.length) c.i = 0;
        acc += y;
      }
      for (const a of ab) {
        const b = a.buf[a.i];
        a.buf[a.i] = acc + b * 0.5;
        acc = b - acc;
        if (++a.i >= a.buf.length) a.i = 0;
      }
      output[n] = acc;
    }
  };
  const mono = new Float32Array(send.n);
  for (let i = 0; i < send.n; i++) mono[i] = (send.L[i] + send.R[i]) * 0.5;
  run(mono, out.L, 0);
  run(mono, out.R, spread);
  // Width: blend toward mid.
  for (let i = 0; i < out.n; i++) {
    const m = (out.L[i] + out.R[i]) * 0.5;
    out.L[i] = m + (out.L[i] - m) * width;
    out.R[i] = m + (out.R[i] - m) * width;
  }
  return out;
}

/** Ping-pong delay (wet only) with a damped feedback path. */
export function pingpong(send, time, feedback = 0.4, damp = 0.35) {
  const out = new Bus(send.n / SR);
  const d = Math.round(time * SR);
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  let i = 0;
  let lpL = 0;
  let lpR = 0;
  for (let n = 0; n < send.n; n++) {
    const yl = bl[i];
    const yr = br[i];
    lpL = yl * (1 - damp) + lpL * damp;
    lpR = yr * (1 - damp) + lpR * damp;
    bl[i] = (send.L[n] + send.R[n]) * 0.5 + lpR * feedback;
    br[i] = lpL * feedback;
    out.L[n] = yl;
    out.R[n] = yr;
    if (++i >= d) i = 0;
  }
  return out;
}

/**
 * Varispeed over [t0, t1): output reads the source at a position advancing by rate(t) per second
 * (1 = normal, 0 = stopped). Cubic interpolation. Used for tape stops and slow motion.
 */
export function varispeed(bus, t0, t1, rate, { after = "keep" } = {}) {
  const i0 = Math.round(t0 * SR);
  const i1 = Math.min(bus.n, Math.round(t1 * SR));
  const srcL = bus.L.slice();
  const srcR = bus.R.slice();
  let pos = i0;
  const read = (src, p) => {
    const i = Math.floor(p);
    const f = p - i;
    const a = src[i - 1] ?? 0;
    const b = src[i] ?? 0;
    const c = src[i + 1] ?? 0;
    const d = src[i + 2] ?? 0;
    return b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
  };
  for (let n = i0; n < i1; n++) {
    bus.L[n] = read(srcL, pos);
    bus.R[n] = read(srcR, pos);
    pos += rate((n - i0) / SR);
  }
  if (after === "silence") {
    for (let n = i1; n < bus.n; n++) {
      bus.L[n] = 0;
      bus.R[n] = 0;
    }
  }
}

/** Repeats a slice of the bus over [t0, t1): a stutter / beat-repeat. */
export function stutter(bus, t0, t1, slice) {
  const i0 = Math.round(t0 * SR);
  const i1 = Math.min(bus.n, Math.round(t1 * SR));
  const s = Math.round(slice * SR);
  const L = bus.L.slice(i0, i0 + s);
  const R = bus.R.slice(i0, i0 + s);
  const fade = Math.min(64, s >> 2);
  for (let n = i0; n < i1; n++) {
    const k = (n - i0) % s;
    const w = k < fade ? k / fade : k > s - fade ? (s - k) / fade : 1;
    bus.L[n] = L[k] * w;
    bus.R[n] = R[k] * w;
  }
}

/** Feed-forward compressor on a bus (stereo-linked), in place. */
export function compress(bus, { threshold = -14, ratio = 2.5, attack = 0.01, release = 0.12, makeup = 0, knee = 6 } = {}) {
  const ca = Math.exp(-1 / (attack * SR));
  const cr = Math.exp(-1 / (release * SR));
  let env = 0;
  const mk = dbToGain(makeup);
  for (let i = 0; i < bus.n; i++) {
    const x = Math.max(Math.abs(bus.L[i]), Math.abs(bus.R[i]));
    env = x > env ? ca * env + (1 - ca) * x : cr * env + (1 - cr) * x;
    const db = 20 * Math.log10(env + 1e-9);
    const over = db - threshold;
    let gr = 0;
    if (over > knee / 2) gr = over * (1 - 1 / ratio);
    else if (over > -knee / 2) gr = ((over + knee / 2) ** 2 / (2 * knee)) * (1 - 1 / ratio);
    const g = dbToGain(-gr) * mk;
    bus.L[i] *= g;
    bus.R[i] *= g;
  }
}

/** Lookahead brickwall limiter, in place. Returns the peak gain reduction in dB. */
export function limit(bus, { ceiling = -1, lookahead = 0.003, release = 0.08 } = {}) {
  const c = dbToGain(ceiling);
  const la = Math.round(lookahead * SR);
  const n = bus.n;
  // Required gain per sample, then a running minimum over the lookahead window, then smoothing.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(bus.L[i]), Math.abs(bus.R[i]));
    need[i] = p > c ? c / p : 1;
  }
  const g = new Float32Array(n);
  const cr = Math.exp(-1 / (release * SR));
  let cur = 1;
  let worst = 1;
  for (let i = 0; i < n; i++) {
    let m = 1;
    for (let j = i; j < Math.min(n, i + la); j++) if (need[j] < m) m = need[j];
    cur = m < cur ? m : cr * cur + (1 - cr) * m;
    if (cur > m) cur = m;
    g[i] = cur;
    if (cur < worst) worst = cur;
  }
  for (let i = 0; i < n; i++) {
    bus.L[i] = clamp(bus.L[i] * g[i], -c, c);
    bus.R[i] = clamp(bus.R[i] * g[i], -c, c);
  }
  return 20 * Math.log10(worst);
}

/** 24-bit PCM WAV. */
export function wav(bus) {
  const n = bus.n;
  const buf = Buffer.alloc(44 + n * 6);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 6, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 6, 28);
  buf.writeUInt16LE(6, 32);
  buf.writeUInt16LE(24, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 6, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (const v of [bus.L[i], bus.R[i]]) {
      const s = Math.round(clamp(v, -1, 1) * 8388607);
      buf.writeIntLE(s, o, 3);
      o += 3;
    }
  }
  return buf;
}
