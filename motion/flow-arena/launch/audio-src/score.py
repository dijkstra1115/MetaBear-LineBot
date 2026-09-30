"""FLOW ARENA launch score — synthesized to picture at 128 BPM, 45s.
Run: python audio-src/score.py  -> assets/score.wav
"""
import os, subprocess, numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
DUR = 45.0
B = 60 / 128  # beat
N = int(SR * DUR)
HERE = os.path.dirname(os.path.abspath(__file__))
SFX = os.path.expanduser("~/.claude/skills/media-use/audio/assets/sfx")
rng = np.random.default_rng(7)

mus = np.zeros((N, 2))   # music bus (ducked by kick)
drm = np.zeros((N, 2))   # drums bus
fx = np.zeros((N, 2))    # fx bus

def idx(t): return int(round(t * SR))

def add(bus, t, sig, gain=1.0, pan=0.0):
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l * 1.414, sig * r * 1.414], 1)
    i = idx(t)
    if i >= N: return
    j = min(N, i + len(sig))
    bus[i:j] += sig[: j - i] * gain

def tt(d): return np.arange(int(d * SR)) / SR

def lp(x, f, o=2): return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x, axis=0)
def hp(x, f, o=2): return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x, axis=0)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], "band", fs=SR, output="sos"), x, axis=0)

def note(n):  # midi -> hz
    return 440 * 2 ** ((n - 69) / 12)

def saw(f, t, ph=0.0): return 2 * ((f * t + ph) % 1) - 1

def supersaw(f, d, voices=7, spread=0.012):
    t = tt(d)
    out = np.zeros((len(t), 2))
    for v in range(voices):
        det = 1 + spread * (v - voices // 2) / (voices // 2)
        s = saw(f * det, t, rng.random())
        p = (v / (voices - 1)) * 2 - 1
        out[:, 0] += s * (1 - p) / 2
        out[:, 1] += s * (1 + p) / 2
    return out / voices

def load_sfx(name):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", os.path.join(SFX, name), "-f", "f32le",
                          "-ac", "2", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)

# ---------- instruments ----------
def kick(big=False):
    d = 0.55 if big else 0.38
    t = tt(d)
    f = 45 + 120 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * (6 if big else 9))
    s[:200] += rng.standard_normal(200) * np.linspace(0.6, 0, 200)
    return np.tanh(s * 1.8)

def clap():
    t = tt(0.25)
    n = rng.standard_normal(len(t))
    env = np.zeros(len(t))
    for k, o in enumerate([0, 0.011, 0.022]):
        i = idx(o); env[i:] += np.exp(-(t[: len(t) - i]) * (60 if k < 2 else 16))
    return bp(n * env, 900, 4000) * 1.4

def hat(open_=False):
    t = tt(0.22 if open_ else 0.05)
    return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t * (14 if open_ else 70))

def tick():
    t = tt(0.03)
    return np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 180)

def sub_hit(f0=70, d=2.2):
    t = tt(d)
    f = 28 + f0 * np.exp(-t * 3)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)

def noise_burst(d=0.8, lo=200, hi=8000):
    t = tt(d)
    return bp(rng.standard_normal(len(t)), lo, hi) * np.exp(-t * 6)

def riser(d):
    # Noise swept upward by crossfading a bank of bands, each filtered over the whole
    # signal in one pass (continuous filter state, so no chunk-boundary clicks).
    t = tt(d)
    n = rng.standard_normal(len(t))
    centers = np.geomspace(300, 9300, 10)
    pos = (t / d) ** 2 * (len(centers) - 1)  # fractional band index over time
    out = np.zeros(len(t))
    for k, c in enumerate(centers):
        w = np.clip(1 - np.abs(pos - k), 0, 1)
        if w.max() > 0:
            out += bp(n, c * 0.7, min(c * 1.4, 20000)) * w
    f = 200 + 900 * (t / d) ** 2
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return (out * 0.8 + tone) * (t / d) ** 1.6

def pluck(f, d=0.22, bright=5000):
    t = tt(d)
    s = saw(f, t) * 0.6 + saw(f * 2.003, t) * 0.25
    return lp(s * np.exp(-t * 14), bright)

def bass_note(f, d):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.tanh(3 * saw(f, t))
    env = np.minimum(1, t / 0.005) * np.exp(-t * 3.0)
    return lp(s * env, 900)

def pad(freqs, d, cutoff=1400):
    t = tt(d)
    out = np.zeros((len(t), 2))
    for f in freqs:
        out += supersaw(f, d, 5, 0.008)
    env = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.4).clip(0, 1)
    return lp(out * env[:, None], cutoff) / len(freqs)

def stab(freqs, d=0.3, cutoff=6000):
    t = tt(d)
    out = np.zeros((len(t), 2))
    for f in freqs:
        out += supersaw(f, d, 7, 0.014)
    env = np.exp(-t * 7)
    return lp(out * env[:, None], cutoff) / len(freqs)

# chords (A minor): Am F C G  as midi triads (octave 4) + roots
CH = {"Am": [57, 60, 64], "F": [53, 57, 60], "C": [55, 60, 64], "G": [55, 59, 62], "Dm": [50, 53, 57], "E": [52, 56, 59]}
ROOT = {"Am": 33, "F": 29, "C": 36, "G": 31, "Dm": 38, "E": 28}
PROG = ["Am", "F", "C", "G"]
BAR = 4 * B

def groove(t0, t1, prog=PROG, bass=True, claps=True, hats=True, stabs=False, arp=False, arp_rise=False):
    nb = int(round((t1 - t0) / B))
    for k in range(nb):
        t = t0 + k * B
        ch = prog[(k // 4) % len(prog)]
        add(drm, t, kick(), 0.95)
        kicks.append(t)
        if claps and k % 2 == 1: add(drm, t, clap(), 0.35, 0.05)
        if hats:
            add(drm, t + B / 2, hat(True), 0.10, 0.3)
            for s in (1, 3): add(drm, t + s * B / 4, hat(), 0.07, -0.3)
        if bass:
            for s in (1, 2, 3):
                add(mus, t + s * B / 4, bass_note(note(ROOT[ch] + 12), B / 4 * 0.95), 0.36)
        if stabs and k % 4 in (0, 3):
            add(mus, t + (B / 2 if k % 4 == 3 else 0), stab([note(n + 12) for n in CH[ch]]), 0.30)
        if arp:
            notes = CH[ch] + [CH[ch][0] + 12]
            for s in range(4):
                lift = 12 if (arp_rise and k > nb * 0.5) else 0
                add(mus, t + s * B / 4, pluck(note(notes[(k * 4 + s) % 4] + 12 + lift)), 0.13, 0.5 if s % 2 else -0.5)
        if k % 4 == 0:
            add(mus, t, pad([note(n) for n in CH[ch]], BAR + 0.1, 2200), 0.30)

kicks = []

# ---------- SECTION 1: cold open 0 - 5.625 ----------
add(mus, 0, pad([note(45), note(57), note(60), note(64)], 5.9, 700), 0.55)
for k in range(24):  # ticking 8ths
    add(fx, k * B / 2, tick(), 0.10 if k % 2 else 0.16, 0.4 if k % 2 else -0.4)
for k in (0, 2, 4, 6, 8, 10):  # heartbeat thumps
    add(drm, k * B, kick() * 0.6, 0.6); add(drm, k * B + 0.16, kick() * 0.35, 0.5)
add(fx, 5.625 - 2 * BAR / 2 - 0.1, riser(BAR + 0.1), 0.55)
for k in range(8):  # snare roll build in last 2 beats
    add(drm, 5.625 - 2 * B + k * B / 4, clap(), 0.10 + 0.04 * k)

# ---------- SECTION 2+3: drop 5.625 - 13.125 ----------
groove(5.625, 13.125, stabs=True)
# ---------- SECTION 4: cascade 13.125 - 22.5 ----------
groove(13.125, 22.5, prog=["Am", "F", "C", "G", "Am"], stabs=True, arp=True, arp_rise=True)
add(fx, 22.5 - 1.9, riser(1.9), 0.4)

# ---------- SECTION 5: threats 22.5 - 30 (half-time tension) ----------
for k in range(16):
    t = 22.5 + k * B
    if k % 4 == 0: add(drm, t, kick(True), 0.9); kicks.append(t)
    if k % 4 == 2: add(drm, t, clap(), 0.35)
    add(drm, t + B / 2, hat(), 0.05)
for i, ch in enumerate(["Dm", "Am", "E", "E"]):
    add(mus, 22.5 + i * BAR, pad([note(n - 12) for n in CH[ch]] + [note(ROOT[ch] + 12)], BAR + 0.1, 900), 0.45)
    add(mus, 22.5 + i * BAR, bass_note(note(ROOT[ch] + 12), BAR * 0.9) * 0.9, 0.35)
add(fx, 30.0 - 1.4, riser(1.4), 0.45)

# ---------- SECTION 6: staccato stats 30 - 33.75 ----------
for k in range(8):
    t = 30.0 + k * B
    add(drm, t, kick(), 1.0); kicks.append(t)
    ch = ["Am", "Am", "F", "F", "C", "C", "G", "E"][k]
    add(mus, t, stab([note(n + 12) for n in CH[ch]], 0.35), 0.38)
    add(mus, t, bass_note(note(ROOT[ch] + 12), B * 0.8), 0.4)
    add(drm, t + B / 2, hat(True), 0.08)

# ---------- SECTION 7: product 33.75 - 39.375 ----------
groove(33.75, 39.375, prog=["Am", "F", "C"], stabs=True, arp=True)
add(fx, 39.375 - 1.4, riser(1.4), 0.4)

# ---------- SECTION 8: end 39.375 - 45 ----------
add(drm, 39.375, kick(True), 1.0); kicks.append(39.375)
add(mus, 39.375, pad([note(45), note(52), note(57), note(60), note(64), note(69)], 5.6, 2600), 0.55)
add(mus, 39.375, stab([note(69), note(72), note(76)], 1.2, 5000), 0.4)
for k in range(6):  # shimmer arpeggio fading
    add(mus, 40.3 + k * B / 2, pluck(note([81, 84, 88, 93, 88, 84][k]), 0.5, 7000), 0.08 * (1 - k / 7), 0.6 if k % 2 else -0.6)
add(mus, 41.25, bass_note(note(33), 3.5), 0.4)

# ---------- impacts & sfx (picture sync) ----------
imp1, imp2 = load_sfx("impact-bass-1.mp3"), load_sfx("impact-bass-2.mp3")
whoosh, whoosh_s, whoosh_c = load_sfx("whoosh.mp3"), load_sfx("whoosh-short.mp3"), load_sfx("whoosh-cinematic.mp3")
def stinger(x, d=0.3, fade=0.08):
    # the bundled glitch files run ~3s; keep only the opening hit, then fade out
    y = x[: int(d * SR)].copy()
    nf = int(fade * SR)
    y[-nf:] *= np.linspace(1, 0, nf)[:, None]
    return y

gl = [stinger(load_sfx(f"glitch-{i}.mp3")) for i in (1, 2, 3)]
sparkle, click = load_sfx("sparkle.mp3"), load_sfx("click.mp3")

def boom(t, g=1.0):
    add(fx, t, sub_hit(), 0.75 * g)
    add(fx, t, noise_burst(1.2, 80, 6000), 0.25 * g)
    add(fx, t, imp1, 0.7 * g)

boom(5.625, 1.1)                       # title drop
add(fx, 5.625, gl[0], 0.5)
add(fx, 9.375 - 0.25, whoosh_s, 0.6)   # into whale
add(fx, 13.125 - 0.35, whoosh_c, 0.55) # into cascade
# cascade detonations (global)
for i, t in enumerate([15.0, 16.40625, 17.8125, 18.75, 19.6875]):
    add(fx, t, imp2 if i % 2 else imp1, 0.45 + 0.08 * i)
    add(fx, t, noise_burst(0.5, 1500, 12000), 0.18 + 0.03 * i)
    add(fx, t, sub_hit(60 + 10 * i, 1.0), 0.35)
boom(20.625, 0.9)                      # CHAIN REACTION
add(fx, 20.625, gl[1], 0.45)
# threats stingers
for t, g in [(22.5, gl[2]), (24.375, gl[0]), (26.25, gl[1]), (28.125, gl[2])]:
    add(fx, t, g, 0.45)
add(fx, 23.4375, sub_hit(50, 0.9), 0.5)  # iceberg thud
add(fx, 23.4375, noise_burst(0.3, 300, 2500), 0.2)
for k in range(3): add(fx, 24.9 + k * 0.23, click, 0.35)   # hunter lock clicks
add(fx, 26.9, whoosh, 0.35)            # pullback
# stats cuts
for k in range(8): add(fx, 30.0 + k * B, click, 0.25)
add(fx, 33.75 - 0.3, whoosh_c, 0.5)    # product
for t in (35.625, 36.5625, 37.5): add(fx, t, click, 0.3); add(fx, t, sparkle, 0.12)
boom(39.375, 1.2)                      # end
add(fx, 40.3, sparkle, 0.35)

# ---------- sidechain duck ----------
duck = np.ones(N)
for t in kicks:
    i = idx(t); L = idx(B * 0.9)
    j = min(N, i + L)
    x = np.arange(j - i) / SR
    duck[i:j] = np.minimum(duck[i:j], 1 - 0.65 * np.exp(-x * 11))
mus *= duck[:, None]

mix = mus * 0.9 + drm * 0.85 + fx * 0.9
# final: fade tail, glue, limit
fade = np.ones(N); fi = idx(43.2); fade[fi:] = np.linspace(1, 0, N - fi) ** 1.5
mix *= fade[:, None]
mix = hp(mix, 25)
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
mix *= 0.93 / np.max(np.abs(mix)) * 0.6

out = os.path.join(HERE, "..", "assets", "score.wav")
pcm = (mix * 32767).astype("<i2")
import wave
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("wrote", out, f"{N/SR:.2f}s peak", np.max(np.abs(mix)))
