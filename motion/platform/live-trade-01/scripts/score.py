# Soundtrack of 實盤教學 01: a calm synthesized bed under the narration (no samples, nothing to
# license), with a sound on each thing the chart does, and the narration takes placed on the film's
# clock and mixed over it with the bed ducked: assets/audio/soundtrack.wav, 48 kHz stereo.
# Times come from assets/audio/vo/timeline.json (scripts/timeline.mjs). Adapted from
# motion/platform/spot-divergence/scripts/score.py.
# python scripts/score.py   (needs numpy, scipy, ffmpeg)
import json, os, subprocess
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 48000
T = json.load(open("assets/audio/vo/timeline.json", encoding="utf-8"))
DUR = T["duration"]
N = int(SR * DUR)
BPM = 90
BEAT = 60 / BPM
rng = np.random.default_rng(1105)
L = np.zeros(N)
R = np.zeros(N)
FF = os.environ.get("FFMPEG", "ffmpeg")


def t_of(n):
    return np.arange(n) / SR


def put(sig, at, gain=1.0, pan=0.0, ch=None):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    (ch or (L, R))[0][i : i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    (ch or (L, R))[1][i : i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


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
    f = 44 + 90 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.18) * g


def hat(g=0.12):
    n = int(0.05 * SR)
    return hp(rng.standard_normal(n), 8000) * env(n, 0.0005, 0.015) * g


def note(f, dur, g=0.2, wave="saw", cut=1800, a=0.01, d=None):
    n = int(dur * SR)
    t = t_of(n)
    x = 2 * ((t * f) % 1) - 1 if wave == "saw" else np.sin(2 * np.pi * f * t)
    e = np.minimum(1, t / a) * np.minimum(1, np.maximum(0, dur - t) / 0.3)
    if d:
        e = e * np.exp(-t / d)
    return lp(x * e, cut) * g


def chord(freqs, dur, g=0.05, cut=1100):
    out = np.zeros(int(dur * SR))
    for f in freqs:
        for det in (-0.004, 0.004):
            out += note(f * (1 + det), dur, g, "saw", cut, a=0.6)
    return out


def riser(dur, g=0.2, f0=300, f1=5000):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    seg = 1024
    for k in range(0, n, seg):
        f = f0 * (f1 / f0) ** (k / n)
        out[k : k + seg] = sosfilt(butter(2, [max(40, f * 0.6), min(20000, f * 1.4)], "band", fs=SR, output="sos"), x[k : k + seg])
    return out * np.linspace(0, 1, n) ** 2 * g


def impact(g=1.0):
    n = int(2.0 * SR)
    t = t_of(n)
    boom = np.sin(2 * np.pi * np.cumsum(36 + 64 * np.exp(-t / 0.09)) / SR) * np.exp(-t / 0.7)
    crash = hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.45) * 0.25
    return (boom + crash) * g


def tick(f=1760, g=0.2):
    n = int(0.12 * SR)
    return np.sin(2 * np.pi * f * t_of(n)) * env(n, 0.001, 0.03) * g


def clock(g=0.12):
    # A dry wooden tick for the waiting.
    n = int(0.04 * SR)
    return hp(rng.standard_normal(n), 2500) * env(n, 0.0005, 0.006) * g


# D minor, slow: i – VI – III – VII.
PROG = [(73.42, [293.66, 349.23, 440.0]), (58.27, [233.08, 293.66, 349.23]), (87.31, [349.23, 440.0, 523.25]), (65.41, [261.63, 329.63, 392.0])]


def bed(t0, t1, pulse=True, hats=False, gain=1.0):
    t = t0
    k = 0
    while t < t1 - 1e-6:
        bar = int((t - t0) / (4 * BEAT)) % 4
        root, triad = PROG[bar]
        if k % 4 == 0:
            put(chord(triad, min(4 * BEAT, t1 - t) + 0.3, 0.045 * gain), t)
            put(note(root, min(4 * BEAT, t1 - t), 0.22 * gain, "sine", 300, a=0.08), t)
        if pulse and k % 2 == 0:
            put(kick(0.45 * gain), t)
        if hats:
            put(hat(0.1 * gain), t + BEAT / 2, pan=0.3)
        t += BEAT
        k += 1


t = T
def whoosh(dur, g=0.5):
    # A tape rewind: noise swept down fast, with a falling tone.
    n = int(dur * SR)
    tt = t_of(n)
    tone = np.sin(2 * np.pi * np.cumsum(1800 * (1 - tt / dur) ** 2 + 120) / SR) * 0.25
    return (lp(rng.standard_normal(n), 2500) * 0.6 + tone) * np.sin(np.pi * tt / dur) * g


# The hook: the result lands with a hit and the resolved chord, then the tape rewinds.
put(impact(0.9), 0.25)
put(chord([293.66, 369.99, 440.0, 587.33], t["rewind"], 0.05, 1600), 0.25)
put(whoosh(t["context"] - t["rewind"] + 0.2, 0.5), t["rewind"])
# Context: the bed with a slow pulse; a tick on each marked high and each pane.
bed(t["context"], t["warning"], pulse=True, gain=0.9)
l4 = next(x["at"] for x in t["lines"] if x["n"] == 4)
for k in range(3):
    put(tick(1320 * 2 ** (k / 12 * -2), 0.16), l4 + 0.35 + k * 0.45)
put(tick(1568, 0.22), t["panesCvd"])
put(tick(1760, 0.22), t["panesSpot"])
# "That's a warning": the pulse stops, only the chord holds.
bed(t["warning"], t["brk"], pulse=False, gain=0.8)
# The break: a riser into the sell, the impact on "hits".
put(riser(t["hits"] - t["brk"], 0.18, 200, 3000), t["brk"])
put(impact(1.0), t["hits"])
bed(t["hits"] + 0.6, t["plan"], pulse=True, hats=True, gain=0.85)
# The plan: calm, a soft tick as each level goes on the chart.
bed(t["plan"], t["wait"], pulse=False, gain=0.75)
for key, f in (("val", 1175), ("stop", 988), ("target", 1319)):
    put(tick(f, 0.2), t[key])
# The wait: a clock, and a higher tick for each bar that closes without coming back.
k = t["wait"]
while k < t["entry"]:
    put(clock(0.1), k)
    k += 0.5
for i, c in enumerate(t["candles"]):
    put(tick(880 * 2 ** (i * 2 / 12), 0.22), c)
put(tick(660, 0.2), t["cvdLow"])
bed(t["wait"], t["entry"], pulse=False, gain=0.6)
# The entry: the touch, then a short hit on "Short."
put(tick(1760, 0.25), t["touch"])
bed(t["entry"], t["short"], pulse=False, gain=0.7)
put(impact(0.55), t["short"])
# The result: the pulse and hats back, rising to the target.
bed(t["short"] + 0.4, t["claim"], pulse=True, hats=True, gain=0.95)
put(riser(t["reaches"] - t["short"] - 0.4, 0.2), t["short"] + 0.4)
put(impact(1.0), t["reaches"])
# The claim and the end card: the chord resolves to D major and rings out.
put(chord([293.66, 369.99, 440.0, 587.33], DUR - t["claim"], 0.06, 1800), t["claim"])
put(note(73.42, DUR - t["claim"], 0.22, "sine", 300, a=0.05, d=3.0), t["claim"])
for c in t["claims"]:
    put(tick(1175, 0.16), c)

music = np.stack([L, R], axis=1)
music /= max(1e-9, np.abs(music).max()) / 0.8

# Narration: each take where the timeline puts it; take 9 is cut before "Short." and moved 0.3 s on (SHORT_PAUSE in timeline.mjs).
vo = np.zeros(N)
for cid, take in t["takes"].items():
    raw = subprocess.check_output([FF, "-v", "error", "-i", take["file"], "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"])
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    parts = [(take["at"], x)]
    if take.get("split") is not None:
        s = int(take["split"] * SR)
        parts = [(take["at"], x[:s]), (take["at"] + take["split"] + 0.3, x[s:])]
    for at, seg in parts:
        i = int(at * SR)
        seg = seg[: N - i]
        vo[i : i + len(seg)] += seg
vo /= max(1e-9, np.abs(vo).max()) / 0.92

# Duck the music under the voice: its level follows the voice's envelope, smoothed both ways.
level = np.sqrt(np.maximum(0, lp(vo**2, 8)))
duck = np.clip(level / 0.04, 0, 1)
duck = lp(lp(duck, 3), 3)
gain = 0.55 - 0.38 * np.clip(duck, 0, 1)
mix = music * gain[:, None] + vo[:, None] * 0.95
fade = int(1.2 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix /= max(1e-9, np.abs(mix).max()) / 0.95
os.makedirs("assets/audio", exist_ok=True)
wavfile.write("assets/audio/soundtrack.wav", SR, (mix * 32767).astype(np.int16))
print(f"soundtrack ok {DUR} s")
