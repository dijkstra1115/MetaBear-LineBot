# Synthesizes the film's sound effects into assets/audio/sfx/synth/*.wav (48 kHz, 16-bit stereo).
# One family of clean sines and a little filtered noise, all in A major, so the set sounds like a
# trading tool's interface rather than a game. Deterministic (fixed noise seed).
# Run from this folder: python scripts/sfx.py   (needs numpy and scipy)
import os
import wave

import numpy as np
from scipy.signal import butter, sosfilt

SR = 48_000
OUT = "assets/audio/sfx/synth"
rng = np.random.default_rng(7)


def t_axis(seconds):
    return np.arange(int(seconds * SR)) / SR


def env(t, attack, decay):
    """Short linear attack, then exponential decay with time constant `decay`."""
    a = np.clip(t / attack, 0, 1) if attack > 0 else np.ones_like(t)
    return a * np.exp(-t / decay)


def tone(freq, seconds, attack=0.003, decay=0.08, partials=((1, 1.0),)):
    t = t_axis(seconds)
    s = sum(g * np.sin(2 * np.pi * freq * k * t) for k, g in partials) * env(t, attack, decay)
    # Fade the last 30 % so a note never stops while still ringing (an audible click).
    tail = int(len(s) * 0.3)
    s[-tail:] *= np.cos(np.linspace(0, np.pi / 2, tail)) ** 2
    return s


def place(buf, sig, at):
    i = int(at * SR)
    buf[i : i + len(sig)] += sig[: len(buf) - i]
    return buf


def band(sig, lo, hi):
    return sosfilt(butter(2, [lo, hi], btype="band", fs=SR, output="sos"), sig)


def save(name, sig, peak_db=-3.0):
    sig = sig / (np.max(np.abs(sig)) or 1) * 10 ** (peak_db / 20)
    # 2 ms fades so no file starts or ends on a click.
    f = int(0.002 * SR)
    sig[:f] *= np.linspace(0, 1, f)
    sig[-f:] *= np.linspace(1, 0, f)
    pcm = (np.clip(sig, -1, 1) * 32767).astype("<i2")
    with wave.open(os.path.join(OUT, f"{name}.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(np.repeat(pcm, 2).tobytes())


A5, CS6, E6, A6 = 880.0, 1108.73, 1318.51, 1760.0
E5, A4 = 659.26, 440.0
BELL = ((1, 1.0), (2, 0.12), (2.76, 0.18))  # a sine with a faint inharmonic partial: glassy, not shrill

os.makedirs(OUT, exist_ok=True)

# Bar tick: a dry 3 kHz click with a breath of high noise, under 15 ms.
t = t_axis(0.015)
save("tick", np.sin(2 * np.pi * 3200 * t) * env(t, 0.0005, 0.0025) + 0.3 * band(rng.standard_normal(len(t)), 4000, 9000) * env(t, 0, 0.0015))

# Alert: a soft two-note notification, A5 then E6.
s = np.zeros(int(0.32 * SR))
place(s, tone(A5, 0.12, 0.004, 0.05, BELL), 0)
place(s, tone(E6, 0.25, 0.004, 0.09, BELL), 0.07)
save("alert", s)

# Entry: the order goes in. A tight click, an upward blip (660 → 990 Hz) and a small low thump.
t = t_axis(0.18)
glide = 660 * (1.5 ** np.clip(t / 0.04, 0, 1))
blip = np.sin(2 * np.pi * np.cumsum(glide) / SR) * env(t, 0.002, 0.045)
click = band(rng.standard_normal(len(t)), 2000, 6000) * env(t, 0, 0.002)
thump = np.sin(2 * np.pi * 110 * t) * env(t, 0.002, 0.03)
save("entry", blip + 0.35 * click + 0.6 * thump)

# Target: a quick rising A-major arpeggio with a bell tail.
s = np.zeros(int(0.9 * SR))
for k, (f, g) in enumerate(((A5, 0.8), (CS6, 0.85), (E6, 0.9), (A6, 0.7))):
    place(s, g * tone(f, 0.8, 0.003, 0.22, BELL), k * 0.05)
save("target", s)

# Stop: muted, not dramatic. Two falling soft tones (E5 → A4) through a low-pass, and a low pulse.
s = np.zeros(int(0.6 * SR))
place(s, tone(E5, 0.3, 0.004, 0.08, ((1, 1.0), (3, 0.1))), 0)
place(s, tone(A4, 0.5, 0.004, 0.16, ((1, 1.0), (3, 0.1))), 0.09)
s = sosfilt(butter(2, 1800, btype="low", fs=SR, output="sos"), s)
place(s, 0.7 * tone(82, 0.3, 0.004, 0.07), 0.09)
save("stop", s, -4.0)

# End card: an airy swell, noise through a band that opens from 300 Hz to 3 kHz, then settles.
n = int(0.9 * SR)
noise = rng.standard_normal(n)
out = np.zeros(n)
block = 480
for i in range(0, n, block):
    x = i / n
    centre = 300 * (10 ** (min(x / 0.7, 1)))  # 300 Hz → 3 kHz over the first 0.63 s
    out[i : i + block] = band(noise[max(0, i - 4 * block) : i + block], centre * 0.7, min(centre * 1.4, 20_000))[-min(block, n - i) :]
t = t_axis(0.9)
swell = np.sin(np.pi * np.clip(t / 0.9, 0, 1)) ** 1.5
save("swell", out * swell, -6.0)

print("sfx:", ", ".join(sorted(f[:-4] for f in os.listdir(OUT))))
