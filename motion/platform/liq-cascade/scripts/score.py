# Soundtrack for the 10/30 盤面解剖, synthesized here (no samples, nothing to license):
# assets/audio/soundtrack.wav, 30 s, 48 kHz stereo. Cue times are the film's (scripts/cues.json).
# python scripts/score.py   (needs numpy, scipy)
import json, os
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 48000
DUR = 30.0
N = int(SR * DUR)
CUES = json.load(open("scripts/cues.json", encoding="utf-8"))
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(822)
L = np.zeros(N)
R = np.zeros(N)

def t_of(n):
    return np.arange(n) / SR

def put(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))

def env(n, a=0.005, d=0.2):
    t = t_of(n)
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)

def lp(x, f):
    return sosfilt(butter(2, f, "low", fs=SR, output="sos"), x)

def hp(x, f):
    return sosfilt(butter(2, f, "high", fs=SR, output="sos"), x)

def kick(g=1.0):
    n = int(0.45 * SR)
    t = t_of(n)
    f = 46 + 110 * np.exp(-t / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.16) * g

def hat(g=0.18):
    n = int(0.06 * SR)
    return hp(rng.standard_normal(n), 7000) * env(n, 0.0005, 0.018) * g

def snare(g=0.5):
    n = int(0.25 * SR)
    t = t_of(n)
    return (hp(rng.standard_normal(n), 1800) * 0.7 + np.sin(2 * np.pi * 190 * t) * 0.5) * env(n, 0.001, 0.07) * g

def note(f, dur, g=0.2, wave="saw", cut=1800, a=0.01, d=None):
    n = int(dur * SR)
    t = t_of(n)
    if wave == "saw":
        x = 2 * ((t * f) % 1) - 1
    else:
        x = np.sin(2 * np.pi * f * t)
    e = np.minimum(1, t / a) * np.minimum(1, (dur - t) / 0.05)
    if d:
        e = e * np.exp(-t / d)
    return lp(x * e, cut) * g

def chord(freqs, dur, g=0.06, cut=1400):
    out = np.zeros(int(dur * SR))
    for f in freqs:
        for det in (-0.004, 0.004):
            out += note(f * (1 + det), dur, g, "saw", cut, a=0.25)
    return out

def riser(dur, g=0.25, f0=300, f1=6000):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    seg = 1024
    for k in range(0, n, seg):
        u = k / n
        f = f0 * (f1 / f0) ** u
        out[k : k + seg] = sosfilt(butter(2, [max(40, f * 0.6), min(20000, f * 1.4)], "band", fs=SR, output="sos"), x[k : k + seg])
    return out * np.linspace(0, 1, n) ** 2 * g

def impact(g=1.0):
    n = int(1.8 * SR)
    t = t_of(n)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.6)
    crash = hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.5) * 0.35
    return (boom + crash) * g

def tick(f=1760, g=0.22):
    n = int(0.12 * SR)
    return np.sin(2 * np.pi * f * t_of(n)) * env(n, 0.001, 0.03) * g

def whoosh(dur, g=0.5):
    # A tape rewind: noise swept down fast, with a falling tone.
    n = int(dur * SR)
    t = t_of(n)
    tone = np.sin(2 * np.pi * np.cumsum(1800 * (1 - t / dur) ** 2 + 120) / SR) * 0.25
    return (lp(rng.standard_normal(n), 2500) * 0.6 + tone) * np.sin(np.pi * t / dur) * g

def heart(g=0.9):
    n = int(0.5 * SR)
    t = t_of(n)
    b = lambda d: np.sin(2 * np.pi * 52 * (t - d)) * np.exp(-np.maximum(0, t - d) / 0.07) * (t >= d)
    return (b(0) + 0.7 * b(0.16)) * g

D, Bb, F, C, A = 146.83, 116.54, 174.61, 130.81, 110.0
PROG = [(D, [293.66, 349.23, 440.0]), (Bb, [233.08, 293.66, 349.23]), (F, [349.23, 440.0, 523.25]), (A, [277.18, 329.63, 440.0])]

def groove(t0, t1, kicks=True, hats=True, bass=True, pad=True, snares=True, gain=1.0):
    t = t0
    k = 0
    while t < t1 - 1e-6:
        bar = int((t - t0) / (4 * BEAT)) % 4
        root, triad = PROG[bar]
        if kicks:
            put(kick(0.9 * gain), t)
        if snares and k % 2 == 1:
            put(snare(0.42 * gain), t)
        if hats:
            put(hat(0.16 * gain), t + BEAT / 2, pan=0.3)
        if bass:
            put(note(root / 2, BEAT * 0.9, 0.28 * gain, "saw", 420, a=0.004, d=0.25), t)
        if pad and k % 4 == 0:
            put(chord(triad, min(4 * BEAT, t1 - t), 0.05 * gain), t)
        t += BEAT
        k += 1

c = CUES
# 0 – hook: straight in, falling with the price into the low's hit.
groove(0.0, c["ask"], gain=0.95)
put(riser(c["hookLow"] - 0.2, 0.22, 4000, 300), 0.2)
put(impact(1.0), c["hookLow"])
# The question: silence but a heartbeat. Then the rewind.
for k in range(2):
    put(heart(0.8), c["ask"] + 0.1 + k * 0.4)
put(whoosh(c["build"] - c["rewind"], 0.55), c["rewind"])
# Build-up: bass and kicks under a slow riser, OI climbing.
groove(c["build"], c["fp"], hats=False, pad=False, snares=False, gain=0.85)
put(riser(c["fp"] - c["build"], 0.18, 200, 3000), c["build"])
# First wave: the full band, a hit where the big buy is run over and at the wave's total.
groove(c["fp"], c["panes"], gain=1.0)
put(tick(1760, 0.32), c["buy252"])
put(impact(0.8), c["through"])
put(snare(0.4), c["wave1"])
# Perps against spot: a tick for every pane that switches on.
groove(c["panes"], c["after"], gain=0.8)
for i, at in enumerate([c["paneCvd"], c["paneSpot"], c["panePrem"]]):
    put(tick(1320 * 2 ** (i / 12 * 3), 0.3), at)
    put(snare(0.25), at)
# Second wave and the bounce, the biggest hit on the wave.
groove(c["after"], c["chain"], gain=1.0)
put(tick(880, 0.32), c["oiDrop"])
put(impact(1.15), c["wave2"])
put(riser(c["chain"] - c["bounce"], 0.16), c["bounce"])
# The chain: a tick per link, then the chord rings out over the end card.
for k in range(4):
    put(tick(1047 * 2 ** (k * 2 / 12), 0.3), c["chain"] + 0.2 + k * 0.44)
put(chord([293.66, 349.23, 440.0, 587.33], DUR - c["chain"], 0.07, 2200), c["chain"])
put(note(D / 2, DUR - c["chain"], 0.25, "sine", 400, a=0.01, d=2.0), c["chain"])

mix = np.stack([L, R], axis=1)
fade = int(0.8 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix /= max(1e-9, np.abs(mix).max()) / 0.89
os.makedirs("assets/audio", exist_ok=True)
wavfile.write("assets/audio/soundtrack.wav", SR, (mix * 32767).astype(np.int16))
print("soundtrack ok", DUR, "s")
