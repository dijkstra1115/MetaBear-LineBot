"""FLOW ARENA gameplay reel score — 120 BPM, 60s, synthesized to picture.
Run: python audio-src/score.py  -> assets/score.wav
"""
import os, subprocess, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
DUR = 60.0
B = 0.5          # beat (120 BPM)
BAR = 4 * B
N = int(SR * DUR)
HERE = os.path.dirname(os.path.abspath(__file__))
SFX = os.path.expanduser("~/.claude/skills/media-use/audio/assets/sfx")
rng = np.random.default_rng(11)

mus = np.zeros((N, 2)); drm = np.zeros((N, 2)); fx = np.zeros((N, 2)); verb = np.zeros((N, 2))
kicks = []

def idx(t): return int(round(t * SR))
def tt(d): return np.arange(int(d * SR)) / SR

def add(bus, t, sig, gain=1.0, pan=0.0, send=0.0):
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l * 1.414, sig * r * 1.414], 1)
    i = idx(t)
    if i >= N or i + len(sig) <= 0: return
    a = max(0, -i); i = max(0, i)
    j = min(N, i + len(sig) - a)
    bus[i:j] += sig[a:a + j - i] * gain
    if send: verb[i:j] += sig[a:a + j - i] * gain * send

def lp(x, f, o=2): return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x, axis=0)
def hp(x, f, o=2): return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x, axis=0)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], "band", fs=SR, output="sos"), x, axis=0)
def note(n): return 440 * 2 ** ((n - 69) / 12)
def saw(f, t, ph=0.0): return 2 * ((f * t + ph) % 1) - 1

def supersaw(f, d, voices=7, spread=0.012):
    t = tt(d); out = np.zeros((len(t), 2))
    for v in range(voices):
        det = 1 + spread * (v - voices // 2) / (voices // 2)
        s = saw(f * det, t, rng.random()); p = (v / (voices - 1)) * 2 - 1
        out[:, 0] += s * (1 - p) / 2; out[:, 1] += s * (1 + p) / 2
    return out / voices

def load_sfx(name):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", os.path.join(SFX, name), "-f", "f32le",
                          "-ac", "2", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)

def trim(x, d, fade=0.06):
    y = x[: int(d * SR)].copy(); nf = int(fade * SR)
    y[-nf:] *= np.linspace(1, 0, nf)[:, None]
    return y

# ---------- instruments ----------
def kick(big=False):
    d = 0.6 if big else 0.4; t = tt(d)
    f = 44 + 130 * np.exp(-t * 30)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (5.5 if big else 8.5))
    s[:220] += rng.standard_normal(220) * np.linspace(0.5, 0, 220)
    return np.tanh(s * 1.9)

def clap():
    t = tt(0.3); n = rng.standard_normal(len(t)); env = np.zeros(len(t))
    for k, o in enumerate([0, 0.01, 0.021]):
        i = idx(o); env[i:] += np.exp(-(t[: len(t) - i]) * (70 if k < 2 else 14))
    return bp(n * env, 1000, 5000) * 1.4

def hat(open_=False):
    t = tt(0.25 if open_ else 0.05)
    return hp(rng.standard_normal(len(t)), 8000) * np.exp(-t * (12 if open_ else 75))

def tick(f=2600):
    t = tt(0.035); return np.sin(2 * np.pi * f * t) * np.exp(-t * 170)

def sub_hit(f0=70, d=2.2):
    t = tt(d); f = 27 + f0 * np.exp(-t * 3)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.5)

def noise_burst(d=0.8, lo=200, hi=8000, dec=6):
    t = tt(d); return bp(rng.standard_normal(len(t)), lo, hi) * np.exp(-t * dec)

def sweep(d, up=True, lo=300, hi=9300):
    """Noise sweep via crossfaded band bank (continuous filters, no chunk clicks)."""
    t = tt(d); n = rng.standard_normal(len(t))
    centers = np.geomspace(lo, hi, 10)
    prog = (t / d) ** 2 if up else 1 - (t / d) ** 0.7
    pos = prog * (len(centers) - 1); out = np.zeros(len(t))
    for k, c in enumerate(centers):
        w = np.clip(1 - np.abs(pos - k), 0, 1)
        if w.max() > 0: out += bp(n, c * 0.7, min(c * 1.4, 20000)) * w
    f = (200 + 900 * (t / d) ** 2) if up else (900 - 760 * (t / d) ** 0.7)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    env = (t / d) ** 1.6 if up else np.minimum(1, t / 0.05) * (1 - t / d) ** 1.2
    return (out * 0.8 + tone) * env

def pluck(f, d=0.3, bright=5000):
    t = tt(d); s = saw(f, t) * 0.6 + saw(f * 2.003, t) * 0.25
    return lp(s * np.exp(-t * 11), bright)

def bell(f, d=1.2):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 4)) * np.exp(-t * 3)

def bass_note(f, d, cut=900):
    t = tt(d); s = np.sin(2 * np.pi * f * t) + 0.35 * np.tanh(3 * saw(f, t))
    return lp(s * np.minimum(1, t / 0.005) * np.exp(-t * 3.0), cut)

def pad(freqs, d, cutoff=1400):
    t = tt(d); out = np.zeros((len(t), 2))
    for f in freqs: out += supersaw(f, d, 5, 0.008)
    env = np.minimum(1, t / 0.6) * np.clip((d - t) / 0.4, 0, 1)
    return lp(out * env[:, None], cutoff) / len(freqs)

def stab(freqs, d=0.3, cutoff=6000):
    t = tt(d); out = np.zeros((len(t), 2))
    for f in freqs: out += supersaw(f, d, 7, 0.014)
    return lp(out * np.exp(-t * 7)[:, None], cutoff) / len(freqs)

def keypress():  # mechanical key: click + body thump
    t = tt(0.18)
    body = np.sin(2 * np.pi * (120 + 200 * np.exp(-t * 40)) * t) * np.exp(-t * 28)
    return body * 0.8 + np.concatenate([tick(3400), np.zeros(len(t) - len(tick()))]) * 0.7

def pop(f):
    t = tt(0.12); return np.sin(2 * np.pi * (f + 600 * np.exp(-t * 60)) * t) * np.exp(-t * 30)

CH = {"Am": [57, 60, 64], "F": [53, 57, 60], "C": [55, 60, 64], "G": [55, 59, 62], "Dm": [50, 53, 57], "E": [52, 56, 59]}
ROOT = {"Am": 33, "F": 29, "C": 36, "G": 31, "Dm": 38, "E": 28}

def groove(t0, t1, prog=("Am", "F", "C", "G"), stabs=True, arp=False, arp_rise=False, claps=True, bcut=900, mute=()):
    nb = int(round((t1 - t0) / B))
    for k in range(nb):
        t = t0 + k * B
        if any(a <= t < b for a, b in mute): continue
        ch = prog[(k // 4) % len(prog)]
        add(drm, t, kick(), 0.95); kicks.append(t)
        if claps and k % 2 == 1: add(drm, t, clap(), 0.33, 0.05, send=0.15)
        add(drm, t + B / 2, hat(True), 0.09, 0.3)
        for s in (1, 3): add(drm, t + s * B / 4, hat(), 0.065, -0.3)
        for s in (1, 2, 3): add(mus, t + s * B / 4, bass_note(note(ROOT[ch] + 12), B / 4 * 0.95, bcut), 0.36)
        if stabs and k % 4 in (0, 3):
            add(mus, t + (B / 2 if k % 4 == 3 else 0), stab([note(n + 12) for n in CH[ch]]), 0.27, send=0.25)
        if arp:
            notes = CH[ch] + [CH[ch][0] + 12]
            for s in range(4):
                lift = 12 if (arp_rise and k > nb * 0.5) else 0
                add(mus, t + s * B / 4, pluck(note(notes[(k * 4 + s) % 4] + 12 + lift)), 0.12, 0.5 if s % 2 else -0.5, send=0.3)
        if k % 4 == 0:
            add(mus, t, pad([note(n) for n in CH[ch]], BAR + 0.1, 2200), 0.28, send=0.3)

imp1, imp2 = load_sfx("impact-bass-1.mp3"), load_sfx("impact-bass-2.mp3")
wh, wh_s, wh_c = load_sfx("whoosh.mp3"), load_sfx("whoosh-short.mp3"), load_sfx("whoosh-cinematic.mp3")
gl = [trim(load_sfx(f"glitch-{i}.mp3"), 0.28) for i in (1, 2, 3)]
sparkle, click = load_sfx("sparkle.mp3"), load_sfx("click.mp3")

def boom(t, g=1.0):
    add(fx, t, sub_hit(), 0.75 * g); add(fx, t, noise_burst(1.2, 80, 6000), 0.22 * g, send=0.4)
    add(fx, t, imp1, 0.7 * g)

def key(t, g=1.0): add(fx, t, keypress(), 0.55 * g); add(fx, t, click, 0.25 * g)

def card(t):  # MOVE card fly-through at t (card lands at t+0.75)
    add(fx, t - 0.1, wh_c, 0.5); add(fx, t + 0.75, noise_burst(0.4, 2000, 12000, 10), 0.15)

# ---------- 0–8 intro: the map ----------
add(mus, 0, pad([note(45), note(57), note(59), note(64)], 8.2, 800), 0.55, send=0.5)
for k in range(0, 12):
    add(mus, k * B + 0.25, bell(note([81, 76, 79, 84][k % 4]), 1.2), 0.045, 0.6 if k % 2 else -0.6, send=0.8)
for k in range(0, 12, 2):
    add(drm, k * B, kick() * 0.55, 0.6); add(drm, k * B + 0.15, kick() * 0.3, 0.5)
boom(6.0, 0.9); add(fx, 6.0, gl[0], 0.45)
add(mus, 6.0, stab([note(69), note(72), note(76)], 1.0, 4000), 0.3, send=0.5)
add(fx, 6.4, sweep(1.6), 0.5)
for k in range(8): add(drm, 7.0 + k * B / 4, clap(), 0.08 + 0.035 * k)
card(7.25)

# ---------- 8–14 MOVE 01 whale ----------
groove(8.0, 14.0)
key(8.9, 0.7); add(fx, 9.5, tick(1800), 0.25)
key(10.5, 1.2); boom(10.5, 0.8)
for k in range(12): add(fx, 10.55 + k * 0.08, tick(1400 + k * 120), 0.18, (k % 3 - 1) * 0.5)
add(fx, 12.0, imp2, 0.35); add(fx, 12.0, gl[1], 0.25)
card(13.25)

# ---------- 14–24 MOVE 02 fake breakout ----------
groove(14.0, 24.0, prog=("Am", "F", "Dm", "E"), bcut=600, mute=[(18.0, 18.5)])
key(15.0); add(fx, 15.25, imp2, 0.3); add(fx, 15.25, tick(3000), 0.25)
for k in range(14): add(fx, 15.5 + k * 0.14 + (k % 3) * 0.03, pop(500 + (k * 137) % 500), 0.22, (k % 5 - 2) * 0.3)
add(fx, 17.0, tick(2000), 0.2)
key(18.5, 1.1); add(fx, 18.5, wh_s, 0.5)
for k in range(6): add(fx, 18.75 + k * 0.06, gl[k % 3][: int(0.06 * SR)], 0.35)
add(fx, 19.0, sweep(1.5, up=False), 0.45)
boom(20.5, 1.0); add(fx, 20.5, noise_burst(0.6, 1500, 12000), 0.2)
add(fx, 22.0, sparkle, 0.3)
card(23.25)

# ---------- 24–34 MOVE 03 cascade ----------
groove(24.0, 34.0, prog=("Am", "F", "C", "G", "Am"), arp=True, arp_rise=True)
for i, t in enumerate([25.5, 26.75, 27.75, 28.5, 29.0, 29.5]):
    add(fx, t, imp2 if i % 2 else imp1, 0.42 + 0.06 * i)
    add(fx, t, noise_burst(0.5, 1500, 12000), 0.16 + 0.03 * i, send=0.3)
    add(fx, t, sub_hit(60 + 10 * i, 1.0), 0.32)
boom(30.0, 1.2); add(fx, 30.0, gl[1], 0.45)
card(33.25)

# ---------- 34–40 MOVE 04 iceberg probe (half-time) ----------
for k in range(12):
    t = 34.0 + k * B
    if k % 4 == 0: add(drm, t, kick(True), 0.9); kicks.append(t)
    if k % 4 == 2: add(drm, t, clap(), 0.3, send=0.3)
    add(drm, t + B / 2, hat(), 0.05)
for i, ch in enumerate(["Dm", "E", "E"]):
    add(mus, 34.0 + i * BAR, pad([note(n - 12) for n in CH[ch]] + [note(ROOT[ch] + 12)], BAR + 0.1, 900), 0.45, send=0.4)
    add(mus, 34.0 + i * BAR, bass_note(note(ROOT[ch] + 12), BAR * 0.9) * 0.9, 0.33)
add(fx, 34.75, click, 0.3); key(35.25, 0.9)
for k in range(7): add(fx, 35.5 + k * 0.25, tick(1900), 0.22)   # same price, same pitch
add(fx, 36.5, gl[2], 0.35)
add(fx, 37.0, sub_hit(50, 0.9), 0.55); add(fx, 37.0, noise_burst(0.3, 300, 2500), 0.2)
add(fx, 38.0, click, 0.3)
card(39.25)

# ---------- 40–46 MOVE 05 flip & cash out ----------
groove(40.0, 46.0, prog=("Am", "C", "G"), arp=True, mute=[(40.5, 41.0)])
key(41.0); add(fx, 41.0, sparkle, 0.2); key(41.5)
for k in range(8): add(mus, 42.0 + k * 0.25, pluck(note([69, 72, 76, 79, 81, 84, 88, 91][k]), 0.35, 7000), 0.12, 0.4 if k % 2 else -0.4, send=0.4)
key(44.0, 1.1); boom(44.0, 1.0); add(fx, 44.05, sparkle, 0.4)

# ---------- 46–54 results ----------
groove(46.0, 54.0, prog=("F", "C", "G", "Am"))
add(fx, 45.8, wh_c, 0.5); add(fx, 47.8, wh, 0.35)
for t in (48.5, 49.0, 49.5, 50.0): add(fx, t, click, 0.3); add(fx, t, imp2, 0.18)
add(fx, 53.4, sweep(0.6), 0.35)

# ---------- 54–60 end ----------
for k, t in enumerate([54.0, 54.5, 55.0, 55.5, 56.0]):
    add(drm, t, kick(), 1.0); kicks.append(t)
    add(mus, t, stab([note(n + 12) for n in CH[["Am", "F", "C", "G", "E"][k]]], 0.3), 0.36, send=0.3)
    add(fx, t, tick(2200), 0.15)
add(drm, 56.5, kick(True), 1.0); kicks.append(56.5); boom(56.5, 1.2)
add(mus, 56.5, pad([note(45), note(52), note(57), note(60), note(64), note(69)], 3.6, 2600), 0.55, send=0.5)
add(mus, 56.5, stab([note(69), note(72), note(76)], 1.2, 5000), 0.4, send=0.5)
for k in range(6):
    add(mus, 57.3 + k * B / 2, pluck(note([81, 84, 88, 93, 88, 84][k]), 0.5, 7000), 0.08 * (1 - k / 7), 0.6 if k % 2 else -0.6, send=0.6)
add(mus, 57.5, bass_note(note(33), 2.5), 0.4)
add(fx, 57.3, sparkle, 0.3)

# ---------- reverb: decorrelated exponential-noise IR ----------
ir_t = tt(2.2)
ir = np.stack([rng.standard_normal(len(ir_t)), rng.standard_normal(len(ir_t))], 1) * np.exp(-ir_t * 3.2)[:, None]
ir = lp(ir, 6000); ir /= np.sqrt((ir ** 2).sum(0))
wet = np.stack([fftconvolve(verb[:, c], ir[:, c])[:N] for c in (0, 1)], 1)

# ---------- sidechain, mix, master ----------
duck = np.ones(N)
for t in kicks:
    i = idx(t); j = min(N, i + idx(B * 0.9)); x = np.arange(j - i) / SR
    duck[i:j] = np.minimum(duck[i:j], 1 - 0.62 * np.exp(-x * 11))
mus *= duck[:, None]; wet *= (0.5 + 0.5 * duck)[:, None]
mix = mus * 0.9 + drm * 0.85 + fx * 0.9 + wet * 0.35
fade = np.ones(N); fi = idx(58.6); fade[fi:] = np.linspace(1, 0, N - fi) ** 1.5
mix *= fade[:, None]
mix = hp(mix, 25)
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
mix *= 0.93 / np.max(np.abs(mix)) * 0.6

out = os.path.join(HERE, "..", "assets", "score.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype("<i2").tobytes())
print("wrote", out, f"{N / SR:.2f}s")
