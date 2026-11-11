# Soundtrack: a synthesized bed (A minor while the game ruins you, the relative major from the Kelly
# fix on), a sound on each thing the table does (coin flicks and landings, chip clacks, slides,
# riffles of a thousand stacks), the downloaded whooshes on the big camera moves, and the narration
# on top with the bed ducked under it. Event times mirror src/world-src.js and come from the
# narration's word times (assets/data/beats.json, written by scripts/build.mjs's cue module).
# Usage (from the project folder): python -I scripts/score.py  → assets/audio/soundtrack.wav
import json, os, subprocess
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, resample_poly

SR = 48000
FF = os.environ.get("FFMPEG", "ffmpeg")
B = json.load(open("assets/data/beats.json", encoding="utf-8"))
DUR = B["duration"]
N = int(SR * DUR)
BPM = 92
BEAT = 60 / BPM
rng = np.random.default_rng(1109)
L = np.zeros(N)
R = np.zeros(N)
FX_L = np.zeros(N)
FX_R = np.zeros(N)


def t_of(n):
    return np.arange(n) / SR


def put(sig, at, gain=1.0, pan=0.0, fx=False):
    i = int(round(at * SR))
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[: N - i] * gain
    l, r = (FX_L, FX_R) if fx else (L, R)
    l[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    r[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def env(n, a=0.005, d=0.2):
    t = t_of(n)
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR / 2 - 100)], "band", fs=SR, output="sos"), x)


def lp(x, f):
    return sosfilt(butter(2, f, "low", fs=SR, output="sos"), x)


def hp(x, f):
    return sosfilt(butter(2, f, "high", fs=SR, output="sos"), x)


def load(name, semis=0.0):
    raw = subprocess.check_output([FF, "-v", "error", "-i", f"assets/audio/sfx/{name}", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"])
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    if semis:
        up = int(round(1000 * 2 ** (semis / 12)))
        x = resample_poly(x, 1000, up)
    return x / max(1e-9, np.abs(x).max())


def peak_at(x):
    e = lp(np.abs(x), 30)
    return int(np.argmax(e))


def put_peak(x, at, gain=1.0, pan=0.0):
    # Land the clip's loudest point one frame after the picture.
    put(x, at + 1 / 30 - peak_at(x) / SR, gain, pan, fx=True)


# ---------------------------------------------------------------- table sounds
def clack(g=1.0, bright=1.0):
    # Clay chip on chip: a short bright click and a little body.
    n = int(0.09 * SR)
    f1 = 2600 + rng.uniform(-300, 500)
    click = bp(rng.standard_normal(n), f1, f1 * 1.9) * env(n, 0.0004, 0.012 * bright)
    body = np.sin(2 * np.pi * rng.uniform(780, 980) * t_of(n)) * env(n, 0.0008, 0.022)
    return (click * 0.9 + body * 0.35) * g


def felt_thump(g=1.0):
    n = int(0.16 * SR)
    return lp(rng.standard_normal(n), 420) * env(n, 0.002, 0.035) * 2.2 * g


def coin_ring(g=1.0, damp=1.0):
    # Brass coin: inharmonic partials; on felt (damp < 1) they die fast.
    n = int(1.2 * SR)
    t = t_of(n)
    f0 = rng.uniform(2050, 2250)
    x = np.zeros(n)
    for ratio, amp, dec in ((1, 1, 0.5), (2.76, 0.6, 0.28), (5.4, 0.35, 0.16), (8.93, 0.2, 0.09)):
        x += amp * np.sin(2 * np.pi * f0 * ratio * t + rng.uniform(0, 6)) * np.exp(-t / (dec * damp))
    hit = hp(rng.standard_normal(n), 3000) * env(n, 0.0003, 0.004)
    return (x * 0.22 + hit * 0.4) * g


def coin_land(g=1.0):
    return coin_ring(0.7 * g, damp=0.22) + np.pad(felt_thump(0.8 * g), (0, int(1.2 * SR) - int(0.16 * SR)))


def flick(g=1.0):
    return coin_ring(0.45 * g, damp=0.7)


def slide(dur, g=1.0):
    n = int(dur * SR)
    t = t_of(n)
    x = lp(np.cumsum(rng.standard_normal(n)) * 0.02, 900)
    x = hp(x, 120)
    return x / max(1e-9, np.abs(x).max()) * np.sin(np.pi * t / dur) ** 0.8 * 0.35 * g


def riffle(t0, t1, count, g=0.5, shape=None, pan=0.0):
    # Many chips at once: clacks scattered over [t0, t1] following shape(k) density.
    for j in range(count):
        k = (j + rng.uniform(0, 1)) / count
        at = t0 + (shape(k) if shape else k) * (t1 - t0)
        put(clack(g * rng.uniform(0.4, 1.0), rng.uniform(0.7, 1.3)), at, pan=pan + rng.uniform(-0.5, 0.5), fx=True)


def ease_inout(k):
    return 2 * k * k if k < 0.5 else 1 - (-2 * k + 2) ** 2 / 2


def inv_inout(y):
    # Time fraction at which an ease-in-out progress reaches y.
    lo, hi = 0.0, 1.0
    for _ in range(40):
        m = (lo + hi) / 2
        lo, hi = (m, hi) if ease_inout(m) < y else (lo, m)
    return (lo + hi) / 2


def flips(t0, t1, eased, g=0.35):
    # One soft clack-pair per flip of the crowd: 100 flips between t0 and t1.
    for r in range(1, 101):
        k = inv_inout(r / 100) if eased else r / 100
        at = t0 + k * (t1 - t0)
        put(clack(g * rng.uniform(0.6, 1.0)), at, pan=rng.uniform(-0.6, 0.6), fx=True)
        put(clack(g * 0.5 * rng.uniform(0.5, 1.0)), at + 0.012, pan=rng.uniform(-0.6, 0.6), fx=True)


def scratch(dur, g=1.0):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    step = 512
    for k in range(0, n, step):
        f = 1800 + 2600 * k / n
        out[k : k + step] = bp(x[k : k + step], f * 0.7, f * 1.3)
    return out * np.sin(np.pi * t_of(n) / dur) * 0.8 * g


def whoosh(dur, g=0.5):
    n = int(dur * SR)
    tt = t_of(n)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    step = 512
    for k in range(0, n, step):
        f = 300 + 2400 * np.sin(np.pi * k / n) ** 2
        out[k : k + step] = bp(x[k : k + step], f * 0.5, f * 1.6)
    return out * np.sin(np.pi * tt / dur) ** 1.5 * g


def riser(dur, g=0.2, f0=200, f1=4500):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    step = 1024
    for k in range(0, n, step):
        f = f0 * (f1 / f0) ** (k / n)
        out[k : k + step] = bp(x[k : k + step], max(40, f * 0.6), f * 1.4)
    tone = np.sin(2 * np.pi * np.cumsum(110 * (4 ** (t_of(n) / (n / SR)))) / SR) * 0.3
    return (out + tone) * np.linspace(0, 1, n) ** 2.2 * g


def impact(g=1.0):
    n = int(2.4 * SR)
    t = t_of(n)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.8)
    crack = hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.3) * 0.2
    return (boom + crack) * g


# ---------------------------------------------------------------- music
def note(f, dur, g=0.2, wave="saw", cut=1800, a=0.01, rel=0.4):
    n = int(dur * SR)
    t = t_of(n)
    x = 2 * ((t * f) % 1) - 1 if wave == "saw" else np.sin(2 * np.pi * f * t)
    e = np.minimum(1, t / a) * np.minimum(1, np.maximum(0, dur - t) / rel)
    return lp(x * e, cut) * g


def chord(freqs, dur, g=0.05, cut=1200, a=0.6):
    out = np.zeros(int(dur * SR))
    for f in freqs:
        for det in (-0.005, 0.0, 0.005):
            out += note(f * (1 + det), dur, g, "saw", cut, a=a)
    return out


def kick(g=1.0):
    n = int(0.42 * SR)
    t = t_of(n)
    f = 46 + 95 * np.exp(-t / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.16) * g


def hat(g=0.1):
    n = int(0.05 * SR)
    return hp(rng.standard_normal(n), 7500) * env(n, 0.0005, 0.014) * g


def pluck(f, g=0.1):
    n = int(0.6 * SR)
    return note(f, 0.6, g, "saw", 2600, a=0.003, rel=0.5) * np.exp(-t_of(n) / 0.18)


MINOR = [(55.0, [220.0, 261.63, 329.63]), (43.65, [174.61, 220.0, 261.63]), (65.41, [196.0, 261.63, 329.63]), (49.0, [196.0, 246.94, 293.66])]  # Am F C G
MAJOR = [(65.41, [261.63, 329.63, 392.0]), (49.0, [246.94, 293.66, 392.0]), (55.0, [220.0, 261.63, 329.63]), (43.65, [220.0, 261.63, 349.23])]  # C G Am F
ARP = {0: [440.0, 523.25, 659.25], 1: [349.23, 440.0, 523.25]}


def bed(t0, t1, prog, pulse=0, hats=False, gain=1.0, arp=False):
    # pulse: 0 none, 1 half notes, 2 quarters. Bars line up to the film's beat grid from 0 s.
    b = int(np.ceil(t0 / BEAT - 1e-6))
    while b * BEAT < t1 - 1e-6:
        t = b * BEAT
        bar = (b // 4) % 4
        root, triad = prog[bar]
        if b % 4 == 0 or t - t0 < BEAT - 1e-6:
            d = min(4 * BEAT, t1 - t) + 0.35
            put(chord(triad, d, 0.04 * gain), t, pan=-0.1)
            put(note(root, d, 0.2 * gain, "sine", 260, a=0.06), t)
        if pulse == 2 or (pulse == 1 and b % 2 == 0):
            put(kick(0.42 * gain), t)
        if hats:
            put(hat(0.09 * gain), t + BEAT / 2, pan=0.35)
            if b % 2:
                put(hat(0.05 * gain), t + BEAT * 0.75, pan=-0.3)
        if arp:
            f = triad[b % 3] * 2
            put(pluck(f, 0.05 * gain), t + BEAT / 2, pan=0.25 * (1 if b % 2 else -1))
        b += 1


CLIMB0 = B["thisOne"] + 0.35
CLIMB1 = B["million"] + 0.45

bed(0.0, B["bet"], MINOR, pulse=0, gain=0.6)
bed(B["bet"], B["lapse"], MINOR, pulse=1, gain=0.7)
bed(B["lapse"], B["out"] + 0.1, MINOR, pulse=2, gain=0.75)
put(riser(B["out"] - B["lapse"], 0.16), B["lapse"])
bed(B["split"], B["pair"], MINOR, pulse=1, gain=0.7)
bed(B["pair"], B["win"], MINOR, pulse=1, gain=0.75)
bed(B["win"], B["crowd"], MINOR, pulse=1, hats=True, gain=0.8)
bed(B["crowd"], B["c52"], MINOR, pulse=2, hats=True, gain=0.95)
bed(B["c52"], CLIMB0, MINOR, pulse=0, gain=0.7)
put(riser(CLIMB1 - CLIMB0 + 0.1, 0.3, 150, 6000), CLIMB0 - 0.1)
bed(CLIMB1 + 1.2, B["kelly"] - 0.3, MINOR, pulse=0, gain=0.55)
bed(B["kelly"], B["peaks"], MAJOR, pulse=1, gain=0.75)
bed(B["peaks"], B["rerun"], MAJOR, pulse=1, gain=0.85, arp=True)
bed(B["rerun"], B["coda"], MAJOR, pulse=2, hats=True, gain=0.9, arp=True)
bed(B["coda"], B["share"], MINOR, pulse=0, gain=0.55)
bed(B["share"], B["allIn"], MAJOR, pulse=1, hats=True, gain=0.7)
put(chord([261.63, 329.63, 392.0, 523.25], DUR - B["allIn"], 0.05, 1500), B["allIn"])
put(note(65.41, DUR - B["allIn"], 0.2, "sine", 260, a=0.05), B["allIn"])

# ---------------------------------------------------------------- effects on the picture
# Coin: landings, flicks, the spin on its edge and the fall.
put(coin_land(0.9), 3.25, fx=True)
put(flick(0.7), 5.7, fx=True)
spin_t = 5.95
while spin_t < B["out"] + 0.05:
    k = (spin_t - 5.95) / (B["out"] + 0.05 - 5.95)
    put(coin_ring(0.08 + 0.12 * k, damp=0.05), spin_t, pan=0.2 * np.sin(spin_t * 30), fx=True)
    spin_t += 0.05 - 0.04 * k
put(coin_land(1.1), B["out"] + 0.27, fx=True)
TOSSES = [
    (None, B["heads"] + 0.35),
    (B["tails"] - 0.55, B["tails"] + 0.25),
    (B["win"] - 0.05, B["c150"] - 0.32),
    (B["lose"] - 0.05, B["c90"] - 0.6),
    (B["gap"] - 0.15, B["drop40"] - 0.05),
    (B["gives"] - 0.9, B["gives"] - 0.1),
]
for t0, t1 in TOSSES:
    if t0 is not None:
        put(flick(0.6), t0, fx=True)
    put(coin_land(0.9), t1, fx=True)
put(flick(0.7), B["crowd"] + 0.1, fx=True)
put(coin_land(1.0), B["yourself"] - 0.55, fx=True)

# Chips: drops land 0.24 s after they start, flights scatter, slides swish across the felt.
for k in range(10):
    put(clack(0.8), B["split"] + 0.2 + k * 0.06 + 0.24, fx=True)
for j in range(5):
    put(clack(0.9), B["c150"] - 0.3 + j * 0.07 + 0.24, fx=True)
for j in range(6):
    put(clack(0.6), B["c90"] - 0.5 + j * 0.05, pan=0.5 * (1 if j % 2 else -1), fx=True)
    put(clack(0.35), B["c90"] - 0.5 + j * 0.05 + 0.5 + rng.uniform(0, 0.2), pan=0.7 * (1 if j % 2 else -1), fx=True)
put(clack(0.8), B["gap"] - 0.1 + 0.24, fx=True)
for j in range(4):
    put(clack(0.6), B["drop40"] + j * 0.05, pan=0.5 * (1 if j % 2 else -1), fx=True)
for j in range(3):
    put(clack(0.9), B["gives"] - 0.05 + j * 0.07 + 0.24, fx=True)
put(slide(0.9, 0.8), B["bet"] + 0.15, fx=True)
for k in range(10):
    put(clack(0.35), B["bet"] + 0.85 + k * 0.025, fx=True)
put(slide(1.0, 0.8), B["betLess"], fx=True)
for k in range(9):
    put(clack(0.3), B["betLess"] + 0.6 + k * 0.045, fx=True)
put(clack(0.9), B["betAll"] + 0.9 + 0.24, fx=True)
put(slide(0.8, 0.7), B["yourself"], fx=True)
for k in range(3):
    put(clack(0.35), B["yourself"] + 0.6 + k * 0.06, fx=True)
# The hook's hundred flips, the crowds spreading out and folding back, and their hundred flips.
riffle(B["lapse"] + 0.05, B["out"], 70, 0.3)
for t0 in (B["thousand"], B["crowd"] + 0.25, B["rerun"] + 0.1):
    riffle(t0, t0 + 1.6, 120, 0.22, shape=lambda k: k ** 0.6)
for t0 in (B["pair"] - 0.05, B["paths"] + 0.35, B["coda"] - 0.95):
    riffle(t0, t0 + 0.8, 80, 0.2)
flips(B["flip100"] - 0.1, B["past10k"] - 0.05, True, 0.22)
flips(B["sameFlips"] - 0.2, B["c186"] - 0.6, True, 0.2)

# Camera moves: two takes of the downloaded whoosh plus a synthesized one, rotated.
W1 = load("whoosh-deep.mp3")
W2 = load("whoosh-deep.mp3", semis=3)
SUB = load("sub-drop.mp3")
THUD = load("ui-thud.mp3")
THUD2 = load("ui-thud.mp3", semis=-3)
CONNECT = load("ui-connection.mp3")
moves = [
    (B["thousand"] + 0.6, 0.35),
    (B["pair"] + 0.4, 0.25),
    (B["crowd"] + 0.5, 0.4),
    (B["thisOne"] + 0.1, 0.55),
    (B["paths"] + 0.3, 0.4),
    (B["oneUniverse"] + 0.4, 0.5),
    (B["betAll"] + 0.5, 0.35),
    (B["rerun"] + 0.9, 0.35),
    (B["coda"] + 0.3, 0.3),
]
for i, (at, g) in enumerate(moves):
    if i % 3 == 2:
        put(whoosh(1.1, g * 0.8), at - 0.55, fx=True)
    else:
        put_peak(W1 if i % 3 == 0 else W2, at, g)
# The payoff, once: the climb ends on the top of the tower.
put(impact(0.8), CLIMB1, fx=True)
put_peak(SUB, CLIMB1, 0.6)
# Numbers landing.
for i, at in enumerate([B["out"], B["c150"], B["c90"], B["down"], B["need67"], B["avg5"], B["you5"], B["past10k"], B["c52"], B["p73"], B["peaks"], B["kellyName"], B["c186"], B["c364"]]):
    put_peak(THUD if i % 2 == 0 else THUD2, at, 0.45)
# The printed charts: a felt thump when each prints, the ink scratch through ERGODIC.
put(felt_thump(0.9), B["paths"] + 0.2, fx=True)
put(felt_thump(0.9), B["betAll"] - 0.3, fx=True)
put(felt_thump(0.6), B["ergodic"] - 0.05, fx=True)
put(scratch(0.32, 0.5), B["isnt"] - 0.05, fx=True)
# The share sheet.
put(whoosh(0.7, 0.25), B["share"] - 0.25, fx=True)
for at in (B["share"] + 0.3, B["friend"], B["allIn"] - 0.05):
    put(clack(0.25, 0.6), at, fx=True)
put_peak(CONNECT, B["allIn"] + 0.08, 0.5)

# ---------------------------------------------------------------- mix
music = np.stack([L, R], axis=1)
music /= max(1e-9, np.abs(music).max()) / 0.8
fx = np.stack([FX_L, FX_R], axis=1)
fx /= max(1e-9, np.abs(fx).max()) / 0.9
sr, vo = wavfile.read("assets/audio/vo.wav")
vo = vo.astype(np.float64) / 32768.0
vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]
vo /= max(1e-9, np.abs(vo).max()) / 0.9
# Duck the bed under the voice (the effects duck less: they are the picture's own sound).
level = np.sqrt(np.maximum(0, lp(vo**2, 8)))
duck = np.clip(level / 0.035, 0, 1)
duck = lp(lp(duck, 3), 3)
mg = 0.5 - 0.36 * np.clip(duck, 0, 1)
fg = 0.6 - 0.2 * np.clip(duck, 0, 1)
mix = music * mg[:, None] + fx * fg[:, None] + vo[:, None] * 0.92
fade = int(1.6 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))[:, None]
mix /= max(1e-9, np.abs(mix).max()) / 0.95
raw = "assets/audio/.soundtrack-raw.wav"
wavfile.write(raw, SR, (mix * 32767).astype(np.int16))
# Loudness for social: two-pass loudnorm to −14 LUFS, true peak −1.5 dBTP.
probe = subprocess.run([FF, "-hide_banner", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
m = json.loads(probe[probe.rindex("{") : probe.rindex("}") + 1])
af = f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
subprocess.run([FF, "-y", "-loglevel", "error", "-i", raw, "-af", af, "-ar", str(SR), "assets/audio/soundtrack.wav"], check=True)
os.remove(raw)
print(f"soundtrack ok {DUR:.2f} s, measured {m['input_i']} LUFS before normalizing")
