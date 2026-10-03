#!/usr/bin/env node
// FLOW ARENA flagship score: 60 s, 128 BPM, F minor. Music and sound design are scheduled from
// the same cue sheet the picture uses (src/cues.js), so every hit lands on its frame.
//   node motion/flow-arena/flagship/audio/score.mjs → motion/out/flow-arena-flagship.wav (48 kHz / 24-bit)
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { BEAT, TOTAL, bar, soundCues, WAVES } from "../src/cues.js";
import {
  SR, Bus, osc, noise, shape, expDecay, add, sat, svf, freeverb, pingpong, varispeed, stutter, compress, limit, highpassBus, midi, rng, wav, clamp,
} from "./dsp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../../out/flow-arena-flagship.wav");
const LEN = TOTAL;
const B = bar;
const S16 = BEAT / 4;

const drums = new Bus(LEN);
const bass = new Bus(LEN);
const music = new Bus(LEN);
const sfx = new Bus(LEN);
const amb = new Bus(LEN);
const verb = new Bus(LEN);
const echo = new Bus(LEN);

function put(bus, at, x, { gain = 1, pan = 0, rv = 0, dl = 0 } = {}) {
  if (Array.isArray(x)) {
    bus.stereo(at, x[0], x[1], gain);
    if (rv) verb.stereo(at, x[0], x[1], gain * rv);
    if (dl) echo.stereo(at, x[0], x[1], gain * dl);
    return;
  }
  bus.mono(at, x, gain, pan);
  if (rv) verb.mono(at, x, gain * rv, pan);
  if (dl) echo.mono(at, x, gain * dl, pan);
}
const ease3 = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const lerp = (a, b, k) => a + (b - a) * k;
const inv = (a, b, v) => clamp((v - a) / (b - a), 0, 1);

// ---------- Harmony ----------

const CH = {
  Fm: { notes: [53, 56, 60, 65], root: 41 },
  Db: { notes: [49, 53, 56, 61], root: 37 },
  Ab: { notes: [51, 56, 60, 63], root: 44 },
  Eb: { notes: [51, 55, 58, 63], root: 39 },
  Fm9: { notes: [53, 56, 60, 67], root: 41 },
  Db9: { notes: [49, 53, 56, 60, 63, 68], root: 37 },
};
const CYCLE = ["Fm", "Db", "Ab", "Eb"];
function chordAt(b) {
  if (b >= 16 && b < 18) return CH.Fm9;
  if (b >= 22 && b < 23) return CH.Db;
  if (b >= 23 && b < 24) return CH.Eb;
  if (b >= 30) return CH.Db9;
  const base = b >= 28 ? 28 : b >= 24 ? 24 : b >= 18 ? 18 : b >= 8 ? 8 : 0;
  return CH[CYCLE[Math.floor(b - base) % 4]];
}
const PENTA = [0, 3, 5, 7, 10]; // F minor pentatonic degrees from F

// ---------- Instruments ----------

const KICK = (() => {
  const x = osc("sine", 0.55, (t) => 43 + 160 * Math.exp(-t * 34) + 46 * Math.exp(-t * 7));
  shape(x, (t) => Math.exp(-t * 5.2) * Math.min(1, t * 3000));
  const c = svf(noise(0.01, 7), "hp", 2500);
  shape(c, (t) => Math.exp(-t * 500));
  add(x, c, 0.45);
  return sat(x, 1.9);
})();
const KICK_SOFT = svf(KICK, "lp", 260);

function clap(seed) {
  const n = noise(0.4, seed);
  shape(n, (t) => {
    let e = 0;
    for (const o of [0, 0.009, 0.019]) if (t >= o) e = Math.max(e, Math.exp(-(t - o) * 190));
    return Math.max(e, t >= 0.026 ? 0.55 * Math.exp(-(t - 0.026) * 14) : 0);
  });
  const b = svf(n, "bp", 1500, 0.8);
  add(b, svf(n, "hp", 5000), 0.25);
  add(b, shape(osc("sine", 0.12, 196), expDecay(32)), 0.35);
  return b;
}
const CLAPS = [1, 2, 3, 4].map((s) => clap(100 + s));

function hat(open, seed) {
  const dur = open ? 0.42 : 0.07;
  const metal = new Float32Array(Math.round(dur * SR));
  for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) add(metal, osc("square", dur, f * 2.07, { phase: f % 1 }), 0.14);
  const n = noise(dur, seed);
  add(n, metal, 0.7);
  const h = svf(n, "hp", open ? 7000 : 8500, 0.9);
  return shape(h, expDecay(open ? 8 : 75));
}
const HATS = [0, 1, 2, 3].map((s) => hat(false, 200 + s));
const OHAT = hat(true, 230);

function crash(dur = 2.4, seed = 300) {
  const n = noise(dur, seed);
  const metal = new Float32Array(n.length);
  for (const f of [340, 512, 763, 1131, 1547, 2210]) add(metal, osc("square", dur, f, { phase: (f * 0.37) % 1 }), 0.07);
  add(n, metal, 0.8);
  const h = svf(n, "hp", 3200, 0.7);
  return shape(h, (t) => Math.exp(-t * 1.7) * Math.min(1, t * 400));
}
const CRASH = crash();
const REV_CRASH = (dur) => {
  const c = crash(dur, 301);
  const r = new Float32Array(c.length);
  for (let i = 0; i < c.length; i++) r[i] = c[c.length - 1 - i];
  return shape(r, (t) => (t / dur) ** 1.5);
};

/** Supersaw chord → [L, R]. */
function supersaw(notes, dur, { cutoff = 3000, q = 0.8, voices = 7, detune = 0.16, env = () => 1, seed = 1, oct = 0 } = {}) {
  const n = Math.round(dur * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const r = rng(seed);
  for (const note of notes) {
    for (let v = 0; v < voices; v++) {
      const d = ((v - (voices - 1) / 2) / ((voices - 1) / 2)) * detune;
      const x = osc("saw", dur, midi(note + oct + d), { phase: r() });
      const pan = ((v % 2 ? 1 : -1) * (0.3 + 0.7 * Math.abs(d / detune))) * 0.9;
      const gl = Math.cos(((pan + 1) * Math.PI) / 4);
      const gr = Math.sin(((pan + 1) * Math.PI) / 4);
      for (let i = 0; i < n; i++) {
        L[i] += x[i] * gl;
        R[i] += x[i] * gr;
      }
    }
  }
  const norm = 1 / Math.sqrt(notes.length * voices);
  const fl = svf(L, "lp", cutoff, q);
  const fr = svf(R, "lp", cutoff, q);
  for (let i = 0; i < n; i++) {
    const e = env(i / SR) * norm;
    fl[i] *= e;
    fr[i] *= e;
  }
  return [fl, fr];
}

function reese(note, dur, { cutoff = () => 900, drive = 1.6, gate = dur } = {}) {
  const a = osc("saw", dur, midi(note - 0.12));
  const b = osc("saw", dur, midi(note + 0.12), { phase: 0.37 });
  add(a, b, 1);
  const f = svf(a, "lp", cutoff, 1.1);
  const sub = osc("sine", dur, midi(note - 12));
  add(f, sub, 0.9);
  shape(f, (t) => Math.min(1, t * 400) * (t < gate ? 1 : Math.max(0, 1 - (t - gate) * 60)));
  return sat(f, drive);
}

function pluck(note, { dur = 0.32, bright = 1 } = {}) {
  const x = osc("saw", dur, midi(note));
  add(x, osc("square", dur, midi(note + 12), { pw: 0.3 }), 0.25);
  const f = svf(x, "lp", (t) => 300 + 5200 * bright * Math.exp(-t * 16), 1.2);
  return shape(f, (t) => Math.exp(-t * 9) * Math.min(1, t * 2000));
}

function bell(note, { dur = 1.6, index = 2.6 } = {}) {
  const f = midi(note);
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  let pc = 0;
  let pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const mod = Math.sin(pm) * index * Math.exp(-t * 5);
    out[i] = (Math.sin(pc + mod) * 0.8 + Math.sin(pc * 2.001) * 0.18 * Math.exp(-t * 3)) * Math.exp(-t * 2.6) * Math.min(1, t * 3000);
    pc += (2 * Math.PI * f) / SR;
    pm += (2 * Math.PI * f * 3.5) / SR;
  }
  return out;
}

function braam(notes, dur = 2.4, drive = 3) {
  const n = Math.round(dur * SR);
  const x = new Float32Array(n);
  notes.forEach((nn, i) => {
    add(x, osc("saw", dur, midi(nn - 0.08)), 0.5);
    add(x, osc("saw", dur, midi(nn + 0.08), { phase: 0.5 }), 0.5);
    if (i === 0) add(x, osc("square", dur, midi(nn + 12)), 0.3);
  });
  const f = svf(x, "lp", (t) => 160 + 2400 * Math.exp(-t * 2.2) * Math.min(1, t * 30), 1.4);
  sat(f, drive);
  return shape(f, (t) => Math.min(1, t * 60) * Math.exp(-t * 1.1));
}

function boom(big = true, seed = 400) {
  const dur = big ? 3.4 : 2.2;
  const x = osc("sine", dur, (t) => 27 + 62 * Math.exp(-t * 3.2));
  shape(x, (t) => Math.exp(-t * (big ? 1.25 : 2.1)) * Math.min(1, t * 1500));
  sat(x, 2.4);
  const n = svf(noise(dur, seed), "lp", (t) => 150 + 7000 * Math.exp(-t * 6), 0.7);
  shape(n, (t) => Math.exp(-t * (big ? 2 : 3)));
  add(x, n, 0.55);
  return x;
}

function whoosh(dur, { f0 = 300, f1 = 6000, seed = 500, q = 1.6, peak = 0.7 } = {}) {
  const n = noise(dur, seed);
  const bp = svf(n, "bp", (t) => f0 * (f1 / f0) ** ease3(t / dur), q);
  const env = (t) => {
    const k = t / dur;
    return k < peak ? (k / peak) ** 2 : Math.max(0, 1 - (k - peak) / (1 - peak)) ** 1.5;
  };
  shape(bp, env);
  const L = new Float32Array(bp.length);
  const R = new Float32Array(bp.length);
  for (let i = 0; i < bp.length; i++) {
    const p = i / bp.length;
    L[i] = bp[i] * Math.cos((p * Math.PI) / 2);
    R[i] = bp[i] * Math.sin((p * Math.PI) / 2);
  }
  return [L, R];
}

function riser(dur, { note = 53, seed = 600, semis = 24 } = {}) {
  const n = svf(noise(dur, seed), "hp", (t) => 300 * (9000 / 300) ** (t / dur), 1.2);
  const s = osc("saw", dur, (t) => midi(note + semis * (t / dur) ** 1.6));
  add(s, osc("saw", dur, (t) => midi(note + 7 + semis * (t / dur) ** 1.6), { phase: 0.3 }), 0.6);
  const sl = svf(s, "lp", (t) => 400 + 6000 * (t / dur) ** 2, 1.5);
  add(n, sl, 0.35);
  return shape(n, (t) => (t / dur) ** 2.2 * (0.75 + 0.25 * Math.sin(2 * Math.PI * (4 + 26 * (t / dur) ** 2) * t)));
}

function blip(note, { dur = 0.07, type = "sine", decay = 60 } = {}) {
  const x = osc(type, dur, midi(note));
  return shape(type === "sine" ? x : svf(x, "lp", 4000), (t) => Math.exp(-t * decay) * Math.min(1, t * 4000));
}

function tick(seed = 700) {
  const c = svf(noise(0.03, seed), "hp", 2500, 1.2);
  shape(c, expDecay(260));
  add(c, shape(osc("sine", 0.03, 3200), expDecay(220)), 0.4);
  return c;
}

function shatter(seed = 800) {
  const dur = 1.4;
  const r = rng(seed);
  const n = Math.round(dur * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let k = 0; k < 90; k++) {
    const on = r() ** 2 * 0.5;
    const f = 1800 + r() * 7500;
    const d = 0.02 + r() * 0.16;
    const ping = shape(osc("sine", d * 4, f), (t) => Math.exp(-t / d) * Math.min(1, t * 8000));
    add(ping, shape(osc("sine", d * 4, f * 2.76), (t) => Math.exp(-t / (d * 0.6))), 0.4);
    const pan = r() * 2 - 1;
    add(L, ping, 0.09 * (1 - pan * 0.6) * (1 - on), Math.round(on * SR));
    add(R, ping, 0.09 * (1 + pan * 0.6) * (1 - on), Math.round(on * SR));
  }
  const nb = shape(svf(noise(dur, seed + 1), "hp", 2600), (t) => Math.exp(-t * 9));
  add(L, nb, 0.5);
  add(R, nb, 0.5);
  return [L, R];
}

function coins(seed = 900) {
  const dur = 2.6;
  const r = rng(seed);
  const n = Math.round(dur * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  // "Ka-ching" head, then a shower of small metallic pings thinning out.
  for (const [f, o] of [[2637, 0], [3951, 0.07]]) {
    const b = shape(osc("sine", 0.9, f), (t) => Math.exp(-t * 5));
    add(b, shape(osc("sine", 0.9, f * 2.4), (t) => Math.exp(-t * 9)), 0.3);
    add(L, b, 0.22, Math.round(o * SR));
    add(R, b, 0.22, Math.round(o * SR));
  }
  for (let k = 0; k < 70; k++) {
    const on = 0.1 + r() ** 1.6 * 2.1;
    const f = 3000 + r() * 5000;
    const d = 0.03 + r() * 0.08;
    const ping = shape(osc("sine", d * 5, f), (t) => Math.exp(-t / d));
    add(ping, shape(osc("sine", d * 5, f * 1.51), (t) => Math.exp(-t / d)), 0.6);
    const pan = r() * 2 - 1;
    const g = 0.07 * (1 - on / 2.6);
    add(L, ping, g * (1 - pan * 0.7), Math.round(on * SR));
    add(R, ping, g * (1 + pan * 0.7), Math.round(on * SR));
  }
  return [L, R];
}

function heartbeat() {
  const x = new Float32Array(Math.round(0.6 * SR));
  for (const [o, g] of [[0, 1], [0.16, 0.7]]) {
    const b = shape(osc("sine", 0.3, (t) => 48 + 30 * Math.exp(-t * 20)), (t) => Math.exp(-t * 14) * Math.min(1, t * 600));
    add(x, b, g, Math.round(o * SR));
  }
  return sat(x, 1.6);
}

function glitch(seed = 1000, dur = 0.45) {
  const r = rng(seed);
  const n = Math.round(dur * SR);
  const x = new Float32Array(n);
  let i = 0;
  while (i < n) {
    const len = Math.round((0.01 + r() * 0.04) * SR);
    const f = 200 + r() * 3000;
    const seg = osc(r() < 0.5 ? "square" : "saw", len / SR, f);
    // Bit-crush: hold samples.
    const hold = 1 + Math.floor(r() * 12);
    for (let k = 0; k < seg.length; k++) seg[k] = seg[k - (k % hold)];
    add(x, seg, 0.35 * (r() < 0.2 ? 0 : 1), i);
    i += len;
  }
  return x;
}

// ---------- Arrangement ----------

const kicks = [];
const kick = (at, soft = false, gain = 0.95) => {
  put(drums, at, soft ? KICK_SOFT : KICK, { gain });
  kicks.push(at);
};

// Intro pad: F minor, slow swell, low-passed and opening; drifts to Db for the second statement.
{
  const env = (len) => (t) => Math.min(1, t / 2.2) * (t > len - 0.6 ? Math.max(0, (len - t) / 0.6) : 1);
  put(music, 0, supersaw(CH.Fm.notes, B(2) + 0.6, { cutoff: (t) => 380 + 900 * (t / B(2)), env: env(B(2) + 0.6), seed: 11 }), { gain: 0.2, rv: 0.6 });
  put(music, B(2), supersaw(CH.Db.notes, B(2) + 0.6, { cutoff: (t) => 700 + 1300 * (t / B(2)), env: env(B(2) + 0.6), seed: 12 }), { gain: 0.22, rv: 0.6 });
  // Sub drone and beat pulse under the open.
  const drone = shape(osc("sine", B(4), midi(29)), (t) => Math.min(1, t / 3) * (0.5 + 0.5 * inv(0, B(4), t)) * 0.5);
  put(bass, 0, drone, { gain: 0.18 });
  for (let b = 0.25; b < 4; b += 0.5) put(drums, B(b), shape(osc("sine", 0.5, (t) => 38 + 40 * Math.exp(-t * 18)), (t) => Math.exp(-t * 7)), { gain: 0.16 + 0.14 * inv(0, 4, b) });
  put(sfx, B(2), riser(B(2), { note: 41, seed: 601 }), { gain: 0.12, rv: 0.3 });
}

// Build (bars 4–8): filtered kick, offbeat bass, arp, hats, claps, roll and the one-beat gap.
for (let b = 4; b < 7.75; b += 0.25) kick(B(b), b < 6, b < 6 ? 0.8 : 0.9);
for (let b = 5; b < 7.75; b += 0.25) {
  const ch = chordAt(b);
  const at = B(b) + BEAT / 2;
  const open = inv(B(5), B(7.75), at);
  put(bass, at, reese(ch.root, BEAT / 2, { cutoff: (t) => 200 + 1300 * open * Math.exp(-t * 8), gate: BEAT * 0.42 }), { gain: 0.42 });
}
function arp(fromBar, toBar, gain, bright = () => 1) {
  for (let s = 0; fromBar + s / 16 < toBar; s++) {
    const b = fromBar + s / 16;
    const ch = chordAt(b);
    const order = [0, 1, 2, 3, 2, 1, 3, 2];
    const note = ch.notes[order[s % 8] % ch.notes.length] + 12 + (s % 16 >= 8 ? 12 : 0);
    put(music, B(b), pluck(note, { bright: bright(b) }), { gain: gain * (s % 4 === 0 ? 1 : 0.7), pan: s % 2 ? 0.35 : -0.35, dl: 0.35, rv: 0.15 });
  }
}
arp(4, 7.75, 0.16, (b) => 0.25 + 0.75 * inv(4, 7.75, b));
for (let b = 5; b < 7.75; b += 0.125) put(drums, B(b), HATS[Math.round(b * 8) % 4], { gain: b % 0.25 ? 0.14 : 0.2, pan: 0.2 });
for (let b = 6; b < 7.5; b += 0.5) put(drums, B(b + 0.25), CLAPS[Math.round(b * 2) % 4], { gain: 0.42, rv: 0.2 });
// Snare roll 8ths → 16ths → 32nds, rising.
{
  let b = 7;
  while (b < 7.75) {
    const step = b < 7.25 ? 0.125 : b < 7.5 ? 0.0625 : 0.03125;
    const k = inv(7, 7.75, b);
    const c = svf(CLAPS[0], "hp", 400 + 2600 * k);
    put(drums, B(b), c, { gain: 0.18 + 0.4 * k, rv: 0.2 });
    b += step;
  }
}

// Main grooves.
function groove(from, to, { stabs = false, bassSteps = [2, 3, 6, 7, 10, 11, 14, 15], hats16 = true, ride = false, intensity = 1 } = {}) {
  for (let b = from; b < to - 1e-9; b += 0.25) kick(B(b));
  for (let b = from; b < to - 1e-9; b += 0.5) put(drums, B(b + 0.25), CLAPS[Math.round(b * 2) % 4], { gain: 0.62, rv: 0.2 });
  for (let b = from; b < to - 1e-9; b += 0.0625) {
    const s = Math.round((b - Math.floor(b)) * 16);
    if (!hats16 && s % 2) continue;
    put(drums, B(b), HATS[s % 4], { gain: s % 4 === 2 ? 0.34 : s % 2 ? 0.16 : 0.22, pan: s % 2 ? 0.25 : -0.1 });
    if (s % 4 === 2) put(drums, B(b), OHAT, { gain: 0.16 * intensity, pan: -0.2 });
  }
  for (let bb = Math.floor(from); bb < to; bb++) {
    for (const s of bassSteps) {
      const b = bb + s / 16;
      if (b < from || b >= to) continue;
      const ch = chordAt(b);
      const acc = s % 4 === 2 ? 1 : 0.8;
      put(bass, B(b), reese(ch.root + (s === 15 && bb % 2 ? 12 : 0), S16, { cutoff: (t) => 260 + 2000 * intensity * acc * Math.exp(-t * 14), gate: S16 * 0.85, drive: 1.8 }), { gain: 0.46 * acc });
    }
    if (stabs) {
      const ch = chordAt(bb);
      for (const s of [0, 3, 6, 10]) {
        const b = bb + s / 16;
        if (b < from || b >= to) continue;
        put(music, B(b), supersaw(ch.notes.map((n) => n + 12), 0.42, { cutoff: (t) => 900 + 6000 * Math.exp(-t * 9), env: (t) => Math.exp(-t * 7) * Math.min(1, t * 900), seed: 40 + s }), { gain: 0.44, rv: 0.25, dl: 0.12 });
      }
    }
    if (ride) for (let s = 0; s < 16; s += 2) put(drums, B(bb + s / 16), hat(true, 260 + s), { gain: 0.045, pan: 0.4 });
  }
}

// Drop + title, read, battle (bars 8–16).
groove(8, 16, { stabs: true });
arp(10, 16, 0.12);
put(music, B(8), supersaw(CH.Fm.notes, B(2), { cutoff: (t) => 1200 + 2000 * Math.exp(-t * 0.8), env: (t) => Math.min(1, t * 20) * Math.exp(-t * 0.5), seed: 21 }), { gain: 0.26, rv: 0.4 });
put(music, B(12), supersaw(CH.Fm.notes.map((n) => n - 12), B(4) - 0.1, { cutoff: (t) => 500 + 300 * Math.sin(t * 0.8), env: (t) => Math.min(1, t * 2) * (t < B(4) - 0.5 ? 1 : Math.max(0, (B(4) - 0.1 - t) / 0.4)), seed: 22 }), { gain: 0.18, rv: 0.3 });

// PLAN (bars 16–18): frozen pad, clock, heartbeat; riser into EXECUTE.
{
  const pad = supersaw(CH.Fm9.notes.map((n) => n + 12), B(2) + 0.4, { cutoff: (t) => 900 + 1500 * inv(0, B(2), t), env: (t) => Math.min(1, t / 0.5) * (t < B(2) ? 1 : Math.max(0, 1 - (t - B(2)) / 0.4)), seed: 31, detune: 0.08 });
  put(amb, B(16) + 0.05, pad, { gain: 0.22, rv: 0.9 });
  for (let b = 16; b < 18; b += 0.25) put(amb, B(b), tick(710 + Math.round(b * 4)), { gain: b % 0.5 ? 0.16 : 0.24, pan: b % 0.5 ? 0.4 : -0.4, rv: 0.2 });
  for (let b = 16.25; b < 17.9; b += 0.5) put(amb, B(b), heartbeat(), { gain: 0.5 });
  put(amb, B(17.5), riser(B(0.5), { note: 53, seed: 602, semis: 19 }), { gain: 0.32, rv: 0.25 });
  for (let b = 17.5; b < 18; b += b < 17.75 ? 0.0625 : 0.03125) put(amb, B(b), svf(CLAPS[1], "hp", 600 + 4000 * inv(17.5, 18, b)), { gain: 0.15 + 0.35 * inv(17.5, 18, b), rv: 0.15 });
}

// Climax (bars 18–22).
groove(18, 22, { stabs: true, bassSteps: [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15], ride: true, intensity: 1.2 });
arp(18, 22, 0.13, () => 1.2);
put(music, B(18), supersaw(CH.Fm.notes.map((n) => n + 12), B(4), { cutoff: (t) => 1500 + 3000 * inv(0, B(4), t), env: (t) => Math.min(1, t * 8) * 0.8, seed: 51 }), { gain: 0.16, rv: 0.4 });

// Slow-motion source (bar 22) and the ledger / ranked groove (bars 24–27.75).
groove(22, 23, { stabs: true });
groove(24, 27.75, { stabs: false, bassSteps: [2, 6, 10, 14, 15], hats16: false, intensity: 0.8 });
arp(24, 27.75, 0.12, () => 0.8);
put(music, B(22) + 0.1, supersaw([49, 53, 56, 60, 65].map((n) => n + 12), B(2), { cutoff: 2600, env: (t) => Math.min(1, t / 0.3) * Math.exp(-t * 0.3), seed: 61, detune: 0.1 }), { gain: 0.0001 });
// Roll into the final drop.
for (let b = 27; b < 27.75; b += b < 27.5 ? 0.0625 : 0.03125) put(drums, B(b), svf(CLAPS[2], "hp", 500 + 3000 * inv(27, 27.75, b)), { gain: 0.15 + 0.4 * inv(27, 27.75, b), rv: 0.18 });

// Finale (bars 28–32).
groove(28, 30, { stabs: true, intensity: 1.1 });
arp(28, 30, 0.13);
{
  const len = B(2) + 2.5;
  const lush = supersaw(CH.Db9.notes.map((n) => n + 12), len, { cutoff: (t) => 1800 + 2500 * Math.exp(-t * 0.6), env: (t) => Math.min(1, t * 30) * Math.exp(-t * 0.42), seed: 71, detune: 0.14 });
  put(music, B(30), lush, { gain: 0.42, rv: 0.7 });
  put(bass, B(30), shape(osc("sine", len, midi(25)), (t) => Math.min(1, t * 200) * Math.exp(-t * 0.5)), { gain: 0.5 });
  put(bass, B(30), reese(37, 1.2, { cutoff: (t) => 300 + 1200 * Math.exp(-t * 3), gate: 1 }), { gain: 0.35 });
  kick(B(30));
  put(drums, B(30), CRASH, { gain: 0.35, rv: 0.4 });
  // A last bell motif over the tail: F – Ab – C – Eb.
  [77, 80, 84, 87].forEach((n, i) => put(music, B(30.5) + i * BEAT, bell(n, { dur: 2.4, index: 1.6 }), { gain: 0.12, pan: (i - 1.5) * 0.3, rv: 0.6, dl: 0.25 }));
}

// ---------- Sound design from the cue sheet ----------

for (const c of soundCues()) {
  const t = c.t;
  switch (c.kind) {
    case "ignite":
      put(sfx, t, shape(osc("sine", 2.2, 2093), (x) => Math.exp(-x * 2.2) * Math.min(1, x * 3000)), { gain: 0.16, rv: 0.6 });
      put(sfx, t, shape(osc("sine", 2.2, 3136), (x) => Math.exp(-x * 3)), { gain: 0.08, rv: 0.6, pan: 0.2 });
      put(sfx, t, boom(false, 401), { gain: 0.5 });
      put(sfx, t - 0.6, REV_CRASH(0.6), { gain: 0.18, rv: 0.3 });
      break;
    case "tick":
      put(sfx, t, blip(89 + PENTA[c.i % 5] + (c.i % 10 >= 5 ? 0 : -12), { dur: 0.05, decay: 90 }), { gain: 0.05, pan: c.i % 2 ? 0.5 : -0.5, dl: 0.4 });
      break;
    case "tag":
      put(sfx, t, blip(77 + PENTA[c.i % 5] + (c.i >= 5 ? 12 : 0), { dur: 0.09, type: "square", decay: 45 }), { gain: 0.05, pan: (c.i - 3.5) / 4, dl: 0.3, rv: 0.2 });
      break;
    case "textIn":
      put(sfx, t - 0.15, whoosh(0.7, { f0: 800, f1: 5000, seed: 510 + Math.round(t) }), { gain: 0.08, rv: 0.3 });
      break;
    case "swell":
      put(sfx, t - 1.2, REV_CRASH(1.2), { gain: 0.14, rv: 0.4 });
      break;
    case "slam": {
      put(sfx, t, boom(c.big, 410 + c.n), { gain: c.big ? 0.75 : 0.5 });
      put(sfx, t - 0.25, whoosh(0.3, { f0: 2000, f1: 300, seed: 520 + c.n, peak: 0.9 }), { gain: 0.15 });
      if (c.big) put(music, t, braam([29, 41, 48], 2.6, 3.2), { gain: 0.32, rv: 0.4 });
      else put(sfx, t, svf(CRASH, "lp", 6000), { gain: 0.14, rv: 0.3 });
      break;
    }
    case "whooshLong":
      put(sfx, t, whoosh(2.4, { f0: 200, f1: 3500, seed: 530, q: 1.2, peak: 0.6 }), { gain: 0.16, rv: 0.4 });
      break;
    case "riser":
      put(sfx, t, riser(B(c.to) - t, { note: 41, seed: 603 }), { gain: 0.22, rv: 0.3 });
      break;
    case "reverse":
      put(sfx, B(c.to) - (B(c.to) - t) * 1.6, REV_CRASH((B(c.to) - t) * 1.6), { gain: 0.42, rv: 0.2 });
      put(sfx, t, whoosh(B(c.to) - t, { f0: 300, f1: 9000, seed: 540, peak: 0.98 }), { gain: 0.2 });
      break;
    case "impact": {
      put(sfx, t, boom(true, 420 + Math.round(t)), { gain: c.big ? 0.75 : 0.6 });
      put(drums, t, CRASH, { gain: c.big ? 0.5 : 0.4, rv: 0.5 });
      if (c.big) put(music, t, braam(c.final ? [29, 41, 48, 53] : [29, 41, 48], 3, 3), { gain: 0.34, rv: 0.5 });
      break;
    }
    case "gleam":
      put(sfx, t, whoosh(0.8, { f0: 3000, f1: 12000, seed: 550, q: 3 }), { gain: 0.08, rv: 0.4 });
      put(sfx, t + 0.1, bell(96, { dur: 1.2, index: 1 }), { gain: 0.05, rv: 0.6, pan: 0.4 });
      break;
    case "whooshIn":
      put(sfx, B(c.to) - 0.9, whoosh(0.95, { f0: 250, f1: 7000, seed: 560 + Math.round(t), peak: 0.92 }), { gain: 0.24, rv: 0.2 });
      break;
    case "panel":
      put(sfx, t, blip(84 + [0, 3, 7, 10][c.i], { dur: 0.12, type: "square", decay: 30 }), { gain: 0.06, pan: -0.6 + c.i * 0.4, dl: 0.3 });
      put(sfx, t, tick(720 + c.i), { gain: 0.18, pan: -0.6 + c.i * 0.4 });
      break;
    case "glitch":
      put(sfx, t, glitch(1001), { gain: 0.12, pan: 0.2 });
      break;
    case "chip":
      put(sfx, t, blip(91, { dur: 0.05, type: "square", decay: 80 }), { gain: 0.07 });
      put(sfx, t + 0.04, blip(96, { dur: 0.06, decay: 70 }), { gain: 0.05 });
      break;
    case "push": {
      put(sfx, t, boom(false, 430 + Math.round(t)), { gain: 0.6 });
      const up = shape(osc("sine", 0.35, (x) => 180 * 2 ** (x * 9)), (x) => Math.min(1, x * 200) * (1 - x / 0.35));
      put(sfx, t, sat(up, 1.5), { gain: 0.12, rv: 0.2 });
      put(sfx, t - 0.05, whoosh(0.4, { f0: 400, f1: 6000, seed: 570, peak: 0.4 }), { gain: 0.16 });
      break;
    }
    case "eat":
      put(sfx, t, blip(84 + c.i * 0.9, { dur: 0.03, type: "square", decay: 140 }), { gain: 0.05, pan: 0.5 });
      break;
    case "wall": {
      const thud = osc("sine", 1.2, (x) => 34 + 50 * Math.exp(-x * 10));
      shape(thud, (x) => Math.exp(-x * 4) * Math.min(1, x * 2000));
      put(sfx, t, sat(thud, 3), { gain: 0.8 });
      put(sfx, t, shatter(801), { gain: 0.9, rv: 0.35 });
      put(sfx, t, svf(noise(0.4, 802), "lp", 900), { gain: 0.3 });
      break;
    }
    case "freeze":
      put(sfx, t, shape(osc("sine", 1.4, (x) => 1200 * 2 ** (-x * 3)), (x) => Math.exp(-x * 3)), { gain: 0.05, rv: 0.6 });
      put(sfx, t, whoosh(0.5, { f0: 6000, f1: 200, seed: 580, peak: 0.1 }), { gain: 0.14, rv: 0.4 });
      break;
    case "ui":
      put(sfx, t, blip(88, { dur: 0.08, type: "square", decay: 50 }), { gain: 0.05 });
      put(sfx, t + 0.09, blip(81, { dur: 0.1, type: "square", decay: 40 }), { gain: 0.05 });
      break;
    case "scan": {
      put(sfx, t, whoosh(0.9, { f0: 9000, f1: 400, seed: 590, q: 2.5, peak: 0.15 }), { gain: 0.16, rv: 0.5 });
      [84, 88, 91, 95].forEach((n, i) => put(sfx, t + i * 0.06, bell(n, { dur: 1.6, index: 1.2 }), { gain: 0.045, pan: (i - 1.5) * 0.4, rv: 0.7 }));
      put(sfx, t, boom(false, 440), { gain: 0.3 });
      break;
    }
    case "execute":
      put(sfx, t, blip(79, { dur: 0.08, type: "square", decay: 40 }), { gain: 0.1 });
      put(sfx, t, tick(730), { gain: 0.3 });
      break;
    case "wave": {
      const k = c.i / (WAVES.length - 1);
      const note = 65 + PENTA[c.i % 5] + 12 * Math.floor(c.i / 5);
      put(sfx, t, bell(note, { dur: 1.4, index: 2.2 }), { gain: 0.1 + k * 0.05, pan: (c.i % 2 ? 0.3 : -0.3), rv: 0.35, dl: 0.2 });
      put(sfx, t, boom(false, 450 + c.i), { gain: 0.18 + k * 0.22 });
      put(sfx, t, shape(svf(noise(0.25, 460 + c.i), "bp", 1800 + k * 3000, 1.2), expDecay(16)), { gain: 0.12, pan: c.i % 2 ? -0.4 : 0.4 });
      break;
    }
    case "levelUp":
      put(sfx, t - BEAT, riser(BEAT, { note: 53 + c.level * 2, seed: 610 + c.level, semis: 12 }), { gain: 0.16 });
      if (c.level >= 4) put(sfx, t, bell(89, { dur: 2, index: 3 }), { gain: 0.12, rv: 0.6 });
      if (c.level >= 4) put(drums, t, CRASH, { gain: 0.3, rv: 0.4 });
      break;
    case "storm":
      put(music, t, braam([29, 36, 41, 48], 2.2, 4), { gain: 0.3, rv: 0.3 });
      put(sfx, t, glitch(1002, 0.9), { gain: 0.14 });
      break;
    case "slowmo":
      put(sfx, t, boom(true, 470), { gain: 0.55 });
      put(sfx, t, shape(osc("sine", 3.6, 5400), (x) => Math.min(1, x * 4) * Math.exp(-x * 0.9)), { gain: 0.012 });
      for (let k = 0; k < 4; k++) put(sfx, t + 0.15 + k * BEAT * 2, heartbeat(), { gain: 0.6 });
      break;
    case "cash":
      put(sfx, t, coins(901), { gain: 1.0, rv: 0.3 });
      put(music, t, supersaw([49, 53, 56, 60, 65].map((n) => n + 12), B(1.25), { cutoff: (x) => 1200 + 2600 * Math.min(1, x * 2), env: (x) => Math.min(1, x / 0.08) * Math.exp(-x * 0.7), seed: 62 }), { gain: 0.3, rv: 0.6 });
      break;
    case "whooshDown":
      put(sfx, t, whoosh(B(c.to) - t, { f0: 5000, f1: 150, seed: 595, peak: 0.6 }), { gain: 0.22, rv: 0.3 });
      break;
    case "row":
      put(sfx, t, blip(72 + PENTA[c.i % 5] + (c.i >= 5 ? 12 : 0), { dur: 0.06, type: "square", decay: 70 }), { gain: 0.04, pan: 0.3 });
      put(sfx, t, tick(740 + c.i), { gain: 0.1 });
      break;
    case "zero":
      put(sfx, t, bell(89, { dur: 2.4, index: 1.4 }), { gain: 0.12, rv: 0.6 });
      put(sfx, t, bell(84, { dur: 2.4, index: 1.4 }), { gain: 0.08, rv: 0.6 });
      put(sfx, t, boom(false, 480), { gain: 0.3 });
      break;
    case "draw":
      put(sfx, t, whoosh(1.0, { f0: 600, f1: 9000, seed: 597, q: 2, peak: 0.5 }), { gain: 0.1, rv: 0.5 });
      break;
    case "sting":
      put(sfx, t, boom(true, 490), { gain: 0.6 });
      put(sfx, t, bell(96, { dur: 3, index: 1.2 }), { gain: 0.08, rv: 0.7 });
      break;
    default:
      break;
  }
}

// ---------- Time effects on the music ----------

const groupBuses = [drums, bass, music];
// One beat of silence before the title drop and before the final drop.
const gap = (a, b) => (t) => (t < a - 0.01 || t >= b ? 1 : t < a ? (a - t) / 0.01 : 0);
for (const bus of groupBuses) bus.apply((t) => gap(B(7.75), B(8))(t) * gap(B(27.75), B(28))(t));
// PLAN: tape-stop the whole groove, then silence until EXECUTE.
for (const bus of groupBuses) {
  varispeed(bus, B(16), B(16) + 0.55, (t) => Math.max(0, 1 - t / 0.55) ** 1.6);
  bus.apply((t) => (t >= B(16) + 0.55 && t < B(18) ? 0 : 1));
}
// Storm: beat-repeat the drums into the slow-motion.
stutter(drums, B(21.5), B(21.75), S16);
stutter(drums, B(21.75), B(21.875), S16 / 2);
stutter(drums, B(21.875), B(22), S16 / 4);
// Slow motion: the groove drops to half speed (an octave down) and darkens.
for (const bus of groupBuses) {
  varispeed(bus, B(22), B(24), (t) => lerp(1, 0.5, ease3(Math.min(1, t / 0.35))));
  const i0 = Math.round(B(22) * SR);
  const i1 = Math.round(B(24) * SR);
  for (const ch of [bus.L, bus.R]) {
    const seg = svf(ch.slice(i0, i1), "lp", (t) => 4000 * Math.exp(-t * 2) + 350, 0.9);
    for (let i = i0; i < i1; i++) ch[i] = seg[i - i0] * (1 - inv(B(23.5), B(24), i / SR) * 0.7);
  }
}
// Outro: the groove ends on the sting; everything fades with the picture.
for (const bus of [drums, bass, music, sfx, amb]) bus.apply((t) => 1 - ease3(inv(B(31.2), TOTAL, t)));

// Macro dynamics: the build climbs into the drop, the slow-motion hangs, the ledger breathes.
const SECTION = [[0, 1], [4, 0.42], [7.74, 0.72], [7.76, 1], [21.99, 1], [22.01, 0.55], [23.99, 0.55], [24.01, 0.62], [27.74, 0.78], [27.76, 1], [32, 1]];
const sectionGain = (t) => {
  const b = t / bar(1);
  for (let i = 1; i < SECTION.length; i++) {
    if (b <= SECTION[i][0]) return lerp(SECTION[i - 1][1], SECTION[i][1], inv(SECTION[i - 1][0], SECTION[i][0], b));
  }
  return 1;
};
for (const bus of groupBuses) bus.apply(sectionGain);

// Sidechain from every kick.
const duck = new Float32Array(bass.n).fill(1);
for (const k of kicks) {
  const i0 = Math.round(k * SR);
  for (let i = 0; i < 0.28 * SR; i++) {
    const t = i / SR;
    const g = 1 - 0.7 * (t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / 0.085));
    if (i0 + i < duck.length) duck[i0 + i] = Math.min(duck[i0 + i], g);
  }
}
bass.apply(duck);
music.apply((t) => 0.35 + 0.65 * duck[Math.min(duck.length - 1, Math.round(t * SR))]);

// ---------- Mix ----------

const master = new Bus(LEN);
drums.mixInto(master, 0.9);
bass.mixInto(master, 0.85);
music.mixInto(master, 0.8);
sfx.mixInto(master, 0.85);
amb.mixInto(master, 0.85);
const room = freeverb(verb, { room: 0.88, damp: 0.35, width: 1 });
room.mixInto(master, 0.55);
const dly = pingpong(echo, BEAT * 0.75, 0.38, 0.4);
dly.mixInto(master, 0.35);
highpassBus(master, 22);
// Air: a little of the top end added back above ~5 kHz.
for (const ch of [master.L, master.R]) {
  const air = svf(ch, "hp", 5200, 0.6);
  for (let i = 0; i < ch.length; i++) ch[i] += air[i] * 0.3;
}
compress(master, { threshold: -16, ratio: 2.2, attack: 0.012, release: 0.16, makeup: 4 });
const gr = limit(master, { ceiling: -1, release: 0.06 });

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, wav(master));
console.log(`${OUT}  (limiter peak reduction ${gr.toFixed(1)} dB)`);
// Loudness report when ffmpeg is available.
const ff = process.env.FFMPEG || "ffmpeg";
const r = spawnSync(ff, ["-hide_banner", "-nostats", "-i", OUT, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
const m = /Summary:[\s\S]*?I:\s+(-?[\d.]+) LUFS[\s\S]*?Peak:\s+(-?[\d.]+) dBFS/.exec(r.stderr ?? "");
if (m) console.log(`integrated ${m[1]} LUFS, true peak ${m[2]} dBFS`);
