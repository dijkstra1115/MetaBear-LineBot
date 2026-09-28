// Procedural score + sound design shared by the motion lessons and the
// showreel. A score is rendered from (duration, cue sheet, music settings):
// the same cues the visuals use, so every hit lands on its frame. Fills are
// pitched by trade price — higher price, higher note.
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const SR = 48000;
const TAU = Math.PI * 2;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Chord palettes as MIDI notes around D; `key` transposes them. */
export const PALETTES = {
  deep: [
    { root: 38, notes: [50, 53, 57, 60, 64] }, // Dm9
    { root: 34, notes: [50, 53, 57, 58, 62] }, // Bbmaj7(9)
    { root: 41, notes: [53, 57, 60, 64, 65] }, // Fmaj7
    { root: 36, notes: [48, 52, 55, 57, 62] }, // C6/9
  ],
  lift: [
    { root: 41, notes: [53, 57, 60, 64, 67] }, // Fmaj9
    { root: 45, notes: [52, 55, 57, 60, 64] }, // Am7
    { root: 38, notes: [50, 53, 57, 60, 64] }, // Dm9
    { root: 34, notes: [50, 53, 55, 58, 62] }, // Bb6/9
  ],
  tense: [
    { root: 36, notes: [48, 51, 55, 58, 62] }, // Cm9
    { root: 32, notes: [48, 51, 55, 56, 60] }, // Abmaj7
    { root: 39, notes: [51, 55, 58, 62, 63] }, // Ebmaj7
    { root: 34, notes: [50, 53, 58, 60, 65] }, // Bbsus
  ],
  glass: [
    { root: 40, notes: [52, 55, 59, 62, 66] }, // Em9
    { root: 36, notes: [52, 55, 59, 60, 64] }, // Cmaj7
    { root: 43, notes: [55, 59, 62, 66, 69] }, // Gmaj7
    { root: 38, notes: [50, 54, 57, 61, 64] }, // D6/9
  ],
};

/**
 * Render a stereo score.
 * music: { bpm, palette, key (semitones), sections: [{t, level}],
 *          arps: [[a, b, vel]], padLevel }
 * level 0 pads only · 1 light groove · 2 full · 3 full with 16th hats.
 */
export function renderScore({ duration, cues, music = {} }) {
  const N = Math.ceil((duration + 0.8) * SR);
  const BEAT = 60 / (music.bpm ?? 120);
  const BAR = BEAT * 4;
  const key = music.key ?? 0;
  const PROG = (PALETTES[music.palette ?? "deep"] ?? PALETTES.deep).map((c) => ({
    root: c.root + key,
    notes: c.notes.map((n) => n + key),
  }));
  const sections = music.sections ?? [
    { t: 0, level: 0 },
    { t: 2.4, level: 2 },
    { t: Math.max(3, duration - 3.5), level: 0 },
  ];
  const levelAt = (t) => {
    let l = 0;
    for (const s of sections) if (t >= s.t - 1e-6) l = s.level;
    return l;
  };

  const bus = () => [new Float32Array(N), new Float32Array(N)];
  const music_ = bus();
  const drums = bus();
  const sfx = bus();
  const send = bus();
  let seed = 1;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  function add(b, i, l, r = l) {
    if (i < 0 || i >= N) return;
    b[0][i] += l;
    b[1][i] += r;
  }
  const panLR = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

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
      add(drums, s0 + k, (Math.tanh(Math.sin(ph) * 1.6) * env + click) * 0.5 * vel);
    }
  }
  function clap(t, vel = 1) {
    const s0 = Math.floor(t * SR);
    let lp = 0;
    let bp = 0;
    for (let k = 0; k < SR * 0.35; k++) {
      const x = k / SR;
      const bursts = [0, 0.011, 0.022].reduce(
        (a, o) => a + (x >= o ? Math.exp(-(x - o) / (o === 0.022 ? 0.12 : 0.008)) : 0),
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
      const n = rand();
      lp += 0.6 * (n - lp);
      const v = (n - lp) * Math.exp(-k / SR / dur) * 0.26 * vel;
      add(drums, s0 + k, v * gl, v * gr);
    }
  }
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
      const mod = Math.sin(TAU * f * (o.ratio ?? 2) * x) * idx * Math.exp(-x / (dec * 0.4));
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
      const v = (Math.tanh(Math.sin(ph) * 2) * env * 0.9 + lp * Math.exp(-x / 0.25) * 1.4) * vel * 0.5;
      add(sfx, s0 + k, v);
      add(send, s0 + k, v * 0.5);
    }
  }
  function noiseSweep(t, dur, o = {}) {
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
      ph += (TAU * 110 * 2 ** (u * 3)) / SR;
      const v = (((ph / TAU) % 1) * 2 - 1) * u ** 3 * vel;
      add(sfx, s0 + k, v * 0.8, v);
      add(send, s0 + k, v * 0.5);
    }
  }
  function click(t, freq = 3200, vel = 0.3, pan = 0) {
    const s0 = Math.floor(t * SR);
    const [gl, gr] = panLR(pan);
    for (let k = 0; k < SR * 0.05; k++) {
      const x = k / SR;
      const v = (Math.sin(TAU * freq * x) * Math.exp(-x / 0.008) + rand() * Math.exp(-x / 0.0015) * 0.5) * vel * 0.4;
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
      add(sfx, s0 + k, (lp * 5 + Math.sin(ph) * 0.35) * env * (0.8 + 0.2 * Math.sin(x * 60)) * 0.35);
    }
  }
  function coin(t, vel = 0.4, pan = 0) {
    [88, 95].forEach((m, i) => pluck(t + i * 0.06, m, vel, { decay: 0.25, index: 0.6, ratio: 3.01, pan, wet: 0.5 }));
  }

  // ---------- score ----------
  const chordAt = (t) => PROG[Math.floor(t / (BAR * 2)) % PROG.length];
  const SCALE = [0, 3, 5, 7, 10];
  const priceNote = (price, base) => {
    const d = Math.round(price) - 96;
    const oct = Math.floor(d / 5);
    const deg = ((d % 5) + 5) % 5;
    return base + key + oct * 12 + SCALE[deg];
  };

  const kicks = [];
  for (let b = 0; b * BEAT < duration; b++) {
    const t = b * BEAT;
    const lvl = levelAt(t);
    if (lvl === 0) continue;
    const inBar = b % 4;
    if (inBar === 0 || (inBar === 2 && lvl >= 2)) {
      kick(t, inBar === 0 ? 1 : 0.8);
      kicks.push(t);
    }
    if (lvl >= 2 && inBar === 3 && b % 8 === 7 && levelAt(t + BEAT * 0.5) >= 2) {
      kick(t + BEAT * 0.5, 0.6);
      kicks.push(t + BEAT * 0.5);
    }
    if (lvl >= 2 && (inBar === 1 || inBar === 3)) clap(t, 0.8);
    const sub = lvl >= 3 ? 4 : 2;
    for (let s = 0; s < sub; s++) {
      const ht = t + (s * BEAT) / sub;
      hat(ht, (s % 2 ? 0.9 : 0.5) * (lvl === 1 ? 0.7 : 1), lvl === 2 && s === 1 && inBar === 3, s % 2 ? 0.35 : -0.2);
    }
  }
  kicks.sort((a, b) => a - b);
  const duck = (t) => {
    let g = 1;
    for (const k of kicks) {
      if (k > t) break;
      const x = t - k;
      if (x < 0.4) g = Math.min(g, 1 - 0.6 * Math.exp(-x / 0.11));
    }
    return g;
  };

  // Pads.
  {
    const lp = [
      [0, 0],
      [0, 0],
    ];
    const phases = new Float64Array(PROG.length * 5 * 3);
    const det = [-0.09, 0, 0.1];
    let ki = 0;
    const padLevel = music.padLevel ?? 0.45;
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      while (ki < kicks.length && kicks[ki] < t - 0.4) ki++;
      let g = 1;
      for (let j = ki; j < kicks.length && kicks[j] <= t; j++)
        g = Math.min(g, 1 - 0.55 * Math.exp(-(t - kicks[j]) / 0.12));
      const seg = Math.floor(t / (BAR * 2));
      const u = (t % (BAR * 2)) / (BAR * 2);
      let l = 0;
      let r = 0;
      for (const [si, w] of [
        [seg, Math.min(1, u * 6)],
        [seg - 1, Math.max(0, 1 - u * 6)],
      ]) {
        if (si < 0 || w <= 0) continue;
        const ch = PROG[si % PROG.length];
        ch.notes.forEach((m, n) => {
          for (let d = 0; d < 3; d++) {
            const idx = ((si % PROG.length) * 5 + n) * 3 + d;
            phases[idx] = (phases[idx] + mtof(m + det[d] * (1 + n * 0.1)) / SR) % 1;
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
      const lvl = levelAt(t);
      const fadeIn = Math.min(1, t / 1.5);
      const tail = Math.max(0, Math.min(1, (duration + 0.6 - t) / 1.2));
      const level = padLevel * (lvl === 0 ? 1.15 : 1) * fadeIn * tail;
      const cutoff = lvl === 0 ? 900 : 1100 + 500 * Math.sin((t / 16) * Math.PI) ** 2;
      const a = (TAU * cutoff) / SR;
      lp[0][0] += a * (l - lp[0][0]);
      lp[0][1] += a * (lp[0][0] - lp[0][1]);
      lp[1][0] += a * (r - lp[1][0]);
      lp[1][1] += a * (lp[1][0] - lp[1][1]);
      const gg = level * 0.09 * (lvl > 0 ? g : 1);
      music_[0][i] += lp[0][1] * gg;
      music_[1][i] += lp[1][1] * gg;
      send[0][i] += lp[0][1] * gg * 0.4;
      send[1][i] += lp[1][1] * gg * 0.4;
    }
  }

  // Sub bass.
  for (let e = 0; (e * BEAT) / 2 < duration; e++) {
    const t = (e * BEAT) / 2;
    if (levelAt(t) === 0) continue;
    const f = mtof(chordAt(t).root);
    const s0 = Math.floor(t * SR);
    const acc = e % 2 === 0 ? 1 : 0.7;
    for (let k = 0; k < SR * 0.24; k++) {
      const x = k / SR;
      const env = Math.min(1, x / 0.006) * Math.exp(-x / 0.16);
      add(
        music_,
        s0 + k,
        Math.tanh((Math.sin(TAU * f * x) + 0.3 * Math.sin(TAU * 2 * f * x)) * 1.4) * env * 0.13 * acc * duck(t + x),
      );
    }
  }

  // Arpeggios.
  for (const [a, b, vel] of music.arps ?? []) {
    for (let t = a; t < b; t += BEAT / 4) {
      const i = Math.round((t - a) / (BEAT / 4));
      const ch = chordAt(t).notes;
      const m = ch[[0, 2, 4, 3, 1, 3, 4, 2][i % 8]] + 12;
      pluck(t, m, vel * (i % 4 === 0 ? 1 : 0.6), { decay: 0.18, index: 1.1, pan: i % 2 ? 0.4 : -0.4, wet: 0.5 });
    }
  }

  // ---------- cue-driven sound design ----------
  for (const c of cues) {
    const t = c.t;
    if (t < 0 || t > duration + 0.5) continue;
    switch (c.kind) {
      case "tick":
        click(t, 2600 + 800 * (c.vel ?? 0.4), c.vel ?? 0.4, rand() * 0.6);
        break;
      case "blip":
        click(t, c.freq ?? 1400, c.vel ?? 0.22, rand() * 0.8);
        break;
      case "whoosh":
        noiseSweep(t - (c.dur ?? 0.5) * 0.5, c.dur ?? 0.5, {
          f0: 300,
          f1: 5000,
          vel: 0.9 * (c.vel ?? 1),
          pan: rand() * 0.5,
        });
        break;
      case "riser":
        noiseSweep(t, c.dur, { f0: 200, f1: 9000, vel: 0.7 * (c.vel ?? 1), shape: "riser" });
        riserTone(t, c.dur, 0.06 * (c.vel ?? 1));
        break;
      case "impact":
        boom(t, (c.big ? 1 : 0.7) * (c.vel ?? 1), !!c.big);
        noiseSweep(t, 0.4, { f0: 6000, f1: 800, vel: 0.5 * (c.vel ?? 1) });
        break;
      case "thud":
        boom(t, 0.5 * (c.vel ?? 1));
        break;
      case "shimmer":
        [0, 7, 12, 16, 19, 24].forEach((m, i) =>
          pluck(t + i * 0.045, 74 + key + m, 0.25, { decay: 0.6, index: 0.8, pan: (i % 2 ? 1 : -1) * 0.5, wet: 0.7 }),
        );
        break;
      case "pluck":
        pluck(t, 62 + key + [0, 3, 5, 7, 10, 12, 15, 17, 19, 22][((c.note % 10) + 10) % 10], 0.5 * (c.vel ?? 1), {
          decay: 0.4,
          pan: (c.note % 3) * 0.3 - 0.3,
          wet: 0.5,
        });
        break;
      case "fill": {
        const buy = c.side === "buy";
        const m = priceNote(c.price, buy ? 62 : 50) + (c.price > 115 ? -12 : 0);
        const vel = (c.soft ? 0.32 : c.big ? 0.85 : 0.6) * (c.vel ?? 1);
        pluck(t, m, vel, {
          decay: c.arp ? 0.12 : c.soft ? 0.18 : 0.32,
          index: buy ? 2.2 : 1.2,
          ratio: buy ? 2 : 1.5,
          pan: buy ? -0.3 : 0.3,
        });
        if (!c.soft) click(t, buy ? 4200 : 2200, 0.35, buy ? -0.3 : 0.3);
        if (c.big) {
          boom(t, 0.55);
          [12, 19, 24].forEach((d, i) => pluck(t + 0.03 * (i + 1), m + d, 0.3, { decay: 0.5, wet: 0.7 }));
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
      case "rise":
        glide(t, c.dur ?? 0.4, 330, 990, 0.1);
        break;
      case "coin":
        coin(t, c.vel ?? 0.4, c.pan ?? 0);
        break;
      case "alarm":
        [0, 0.16].forEach((o) => pluck(t + o, 81 + key, 0.45, { decay: 0.12, index: 3, ratio: 1.41 }));
        break;
      case "type":
        for (let i = 0; i < (c.n ?? 21); i++)
          click(t + i * 0.043 + (i % 3) * 0.004, 2000 + (i % 5) * 300, 0.3, rand() * 0.4);
        break;
      default:
        break;
    }
  }

  // ---------- reverb ----------
  const wet = [new Float32Array(N), new Float32Array(N)];
  [send[0], send[1]].forEach((input, ch) => {
    const spread = ch ? 23 : 0;
    const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => ({
      b: new Float32Array(Math.round((d + spread) * (SR / 44100))),
      i: 0,
      f: 0,
    }));
    const aps = [556, 441, 341, 225].map((d) => ({
      b: new Float32Array(Math.round((d + spread) * (SR / 44100))),
      i: 0,
    }));
    for (let n = 0; n < N; n++) {
      const x = input[n] * 0.015;
      let y = 0;
      for (const c of combs) {
        const o = c.b[c.i];
        c.f = o * 0.7 + c.f * 0.3;
        c.b[c.i] = x + c.f * 0.86;
        c.i = (c.i + 1) % c.b.length;
        y += o;
      }
      for (const a of aps) {
        const o = a.b[a.i];
        a.b[a.i] = y + o * 0.5;
        a.i = (a.i + 1) % a.b.length;
        y = o - y;
      }
      wet[ch][n] = y;
    }
  });

  // ---------- master ----------
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  let peak = 0;
  const fadeOutAt = music.fadeOut ?? duration + 0.8;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const g = Math.min(1, t / 0.05) * Math.min(1, Math.max(0, (fadeOutAt - t) / 1.2));
    L[i] = Math.tanh((music_[0][i] + drums[0][i] * 0.9 + sfx[0][i] + wet[0][i] * 1.6) * g * 1.3);
    R[i] = Math.tanh((music_[1][i] + drums[1][i] * 0.9 + sfx[1][i] + wet[1][i] * 1.6) * g * 1.3);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const norm = 10 ** (-1 / 20) / (peak || 1);
  for (let i = 0; i < N; i++) {
    L[i] *= norm;
    R[i] *= norm;
  }
  return { L, R, SR };
}

export async function writeWav(path, { L, R, SR: rate }) {
  const n = L.length;
  const data = Buffer.alloc(44 + n * 4);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + n * 4, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(clamp(L[i], -1, 1) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(clamp(R[i], -1, 1) * 32767), 46 + i * 4);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}
