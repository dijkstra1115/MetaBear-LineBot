# Writes assets/audio/soundtrack.wav: an original score and sound design, every sample synthesized
# here (no samples, nothing to license). 120 BPM, D minor, so one bar is exactly 2 s and the film's
# cuts sit on a grid. The film's own hits come from assets/audio/cues.json (scripts/build.mjs).
# Run from this folder: python scripts/score.py   (numpy, scipy)
import json, os, sys
import numpy as np
import scipy.signal as sg
from scipy.io import wavfile

SR = 48000
BEAT = 0.5
BAR = 2.0
S16 = BEAT / 4
CUES = json.load(open("assets/audio/cues.json", encoding="utf-8")) if os.path.exists("assets/audio/cues.json") else {"end": 88, "hits": []}
DUR = CUES["end"]
N = int(DUR * SR)
rng = np.random.default_rng(20261030)

# The arrangement, in seconds, from scripts/cues.mjs.
QUIET, FULL, BREATH, TP, RAIL, BTN, FEAT, BLACK, BREATH2, RING, IMPLODE, LOGO = (CUES["S"][k] for k in ("quiet", "full", "breath", "tp", "rail", "replayBtn", "feat", "black", "breath2", "ring", "implode", "logo"))
TAKE = CUES["take"]


def stem():
    return np.zeros((N, 2))


def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, dtype=float) - 69) / 12)


def tvec(dur):
    return np.arange(int(dur * SR)) / SR


def add(buf, sig, at, gain=1.0, pan=0.0):
    i = int(round(at * SR))
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    sig = sig[: N - i]
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        buf[i : i + len(sig), 0] += sig * np.cos(a) * gain
        buf[i : i + len(sig), 1] += sig * np.sin(a) * gain
    else:
        buf[i : i + len(sig)] += sig * gain


def saw(f, dur, harm=40):
    t = tvec(dur)
    out = np.zeros_like(t)
    top = min(harm, int(SR / 2 / max(f, 1)))
    for k in range(1, top + 1):
        out += np.sin(2 * np.pi * f * k * t + k * 0.7) / k
    return out * 0.55


def supersaw(f, dur, voices=7, detune=0.012, harm=24):
    # Stereo: each voice detuned and panned.
    n = int(dur * SR)
    out = np.zeros((n, 2))
    for v in range(voices):
        d = (v - (voices - 1) / 2) / ((voices - 1) / 2 or 1)
        s = saw(f * (1 + d * detune), dur, harm)
        a = (d * 0.8 + 1) * np.pi / 4
        out[:, 0] += s * np.cos(a)
        out[:, 1] += s * np.sin(a)
    return out / np.sqrt(voices)


def env_ad(n, a, d, curve=4.0):
    a_n = max(1, int(a * SR))
    out = np.exp(-np.arange(n) / max(1, d * SR) * curve)
    out[: min(a_n, n)] *= np.linspace(0, 1, a_n)[: min(a_n, n)]
    return out


def lp(x, fc, order=2):
    sos = sg.butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos")
    return sg.sosfilt(sos, x, axis=0)


def hp(x, fc, order=2):
    sos = sg.butter(order, fc, "high", fs=SR, output="sos")
    return sg.sosfilt(sos, x, axis=0)


def bp(x, f0, f1, order=2):
    sos = sg.butter(order, [f0, min(f1, SR * 0.45)], "band", fs=SR, output="sos")
    return sg.sosfilt(sos, x, axis=0)


def sweep_lp(x, curve, block=256):
    # A low-pass whose cutoff follows `curve` (Hz, one value per sample), filtered in short blocks.
    out = np.zeros_like(x)
    zi = None
    stereo = x.ndim == 2
    for i in range(0, len(x), block):
        fc = float(np.clip(curve[min(i, len(curve) - 1)], 30, SR * 0.45))
        b, a = sg.butter(2, fc, "low", fs=SR)
        if zi is None:
            zi = np.zeros((2, 2)) if stereo else np.zeros(2)
        out[i : i + block], zi = sg.lfilter(b, a, x[i : i + block], axis=0, zi=zi)
    return out


def curve(points):
    # points: [(seconds, value), ...]; linear in log so sweeps feel even.
    xs = np.array([p[0] for p in points]) * SR
    ys = np.log(np.array([max(p[1], 1e-3) for p in points]))
    return np.exp(np.interp(np.arange(N), xs, ys))


def reverb(x, seconds=2.4, damp=5000, wet=1.0):
    n = int(seconds * SR)
    ir = np.zeros((n, 2))
    for c in range(2):
        noise = rng.standard_normal(n)
        ir[:, c] = lp(noise, damp) * np.exp(-np.arange(n) / (seconds * SR / 6.5))
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    ir /= np.sqrt((ir**2).sum(axis=0))
    return sg.fftconvolve(x, ir, axes=0)[: len(x)] * wet


def pingpong(x, time, feedback=0.45, repeats=6):
    out = np.zeros_like(x)
    d = int(time * SR)
    for k in range(1, repeats + 1):
        g = feedback**k
        c = (k + 1) % 2
        out[d * k :, c] += x[: -d * k, c] * g + x[: -d * k, 1 - c] * g * 0.5
    return out


# ------------------------------------------------------------------ voices

def kick(gain=1.0, punch=1.0):
    t = tvec(0.55)
    f = 46 + 170 * np.exp(-t * 34) + 70 * np.exp(-t * 300)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 6.2)
    click = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 420) * 0.35 * punch
    return np.tanh((body + click) * 1.6) * gain


def clap():
    t = tvec(0.42)
    n = rng.standard_normal(len(t))
    e = np.exp(-t * 22)
    for off in (0.0, 0.011, 0.023):
        e += (t > off) * np.exp(-(t - off).clip(0) * 150) * 0.8
    return bp(n, 900, 5200) * e * 0.5 + np.sin(2 * np.pi * 196 * t) * np.exp(-t * 28) * 0.25


def hat(open_=False):
    d = 0.34 if open_ else 0.05
    t = tvec(d)
    n = hp(rng.standard_normal(len(t)), 8500)
    return n * np.exp(-t * (9 if open_ else 85)) * (0.4 if open_ else 0.5)


def pluck(m, dur=0.22, bright=1.0):
    f = float(mtof(m))
    n = int(dur * SR)
    s = saw(f, dur, 26)
    t = tvec(dur)
    fc = 500 + 5200 * bright * np.exp(-t * 16)
    s = sweep_lp(s, fc, 96)
    return s * env_ad(n, 0.002, dur, 3.5)


def bell(m, dur=2.6):
    f = float(mtof(m))
    t = tvec(dur)
    mod = np.sin(2 * np.pi * f * 3.51 * t) * 2.2 * np.exp(-t * 3.4)
    car = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 2.1)
    car += np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 4.5) * 0.25
    return car * env_ad(len(t), 0.002, 99, 0.01)


def impact(size=1.0):
    d = 3.2
    t = tvec(d)
    f = 34 + 150 * np.exp(-t * 15)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.55)
    crack = hp(rng.standard_normal(len(t)), 1200) * np.exp(-t * 26) * 0.45
    air = bp(rng.standard_normal(len(t)), 300, 6000) * np.exp(-t * 3.2) * 0.26
    return np.tanh((boom * 1.3 + crack + air) * size)


def riser(dur, top=9000, gain=1.0):
    # Filtered noise and a climbing tone that stop dead at the end.
    t = tvec(dur)
    u = t / dur
    n = rng.standard_normal((len(t), 2))
    fc = 200 * (top / 200) ** (u**1.5)
    s = sweep_lp(n, fc, 128) * (u**2.4)[:, None] * 0.55
    f = 110 * 2 ** (u * 3.2)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (u**3) * 0.16
    s += np.stack([tone, tone], 1)
    return s * gain


def reverse_swell(dur=0.9):
    t = tvec(dur)
    n = hp(rng.standard_normal((len(t), 2)), 3000)
    return n * (np.exp(-(dur - t) * 7))[:, None] * 0.4


def whoosh(dur=0.6, up=True):
    t = tvec(dur)
    u = t / dur
    fc = (300 + 7000 * (u**2 if up else (1 - u) ** 2))
    n = sweep_lp(rng.standard_normal((len(t), 2)), fc, 96)
    e = np.sin(np.pi * u) ** 1.3
    return n * e[:, None] * 0.5


def tick(f=2100, dur=0.03):
    t = tvec(dur)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 170)


def stop_hit():
    # A stopped trade: a muted fall, unmistakably different from a target.
    t = tvec(0.75)
    f = 180 * np.exp(-t * 3.4) + 42
    s = np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * 2.2) * np.exp(-t * 4.6)
    n = lp(rng.standard_normal(len(t)), 900) * np.exp(-t * 16) * 0.5
    return s * 0.85 + n


def target_hit(root=74):
    out = np.zeros(int(1.8 * SR))
    for k, m in enumerate((root, root + 7, root + 12)):
        b = bell(m, 1.8)
        i = int(k * 0.055 * SR)
        out[i:] += b[: len(out) - i] * (0.55 - k * 0.1)
    return out


# ------------------------------------------------------------------ arrangement

kicks, subs, drums, hats, arp, pad, stab, fx, sfx = (stem() for _ in range(9))
kick_times = []
CHORDS = [(38, (0, 3, 7)), (34, (0, 4, 7)), (31, (0, 3, 7)), (33, (0, 4, 7))]  # Dm Bb Gm A


def chord_at(t):
    return CHORDS[int(t // (BAR * 2)) % 4]


def grid(a, b, step):
    return np.arange(a, b - 1e-6, step)


def lay_kick(a, b, gain=1.0):
    for t in grid(a, b, BEAT):
        add(kicks, kick(gain), t)
        kick_times.append(t)


def lay_groove(a, b, full=True, bass_gain=1.0):
    # Four on the floor, clap on 2 and 4, a syncopated bass that follows the chords.
    lay_kick(a, b)
    for t in grid(a, b, BEAT):
        beat = int(round(t / BEAT))
        if full and beat % 2 == 1:
            add(drums, clap(), t, 0.62)
        add(hats, hat(True), t + BEAT / 2, 0.3, 0.2)
    for t in grid(a, b, S16):
        s = int(round(t / S16))
        vel = 0.55 + 0.45 * (s % 2 == 0) + 0.12 * np.sin(s * 1.7)
        add(hats, hat(), t, 0.36 * vel, -0.25 + 0.5 * (s % 4 == 2))
    pattern = [0, 0.75, 1.5, 2.5, 3.25, 3.75]
    for t in grid(a, b, BAR):
        for p in pattern:
            at = t + p * BEAT
            if at >= b:
                continue
            root, _ = chord_at(at)
            d = 0.34
            f = float(mtof(root))
            tt = tvec(d)
            body = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt)
            add(subs, np.tanh(body * 1.5) * env_ad(len(tt), 0.004, d, 2.4), at, 0.62 * bass_gain)
            growl = lp(saw(f * 2, d, 18), 1100) * env_ad(len(tt), 0.003, d, 4.5)
            add(subs, np.tanh(growl * 2.4), at, 0.2 * bass_gain)


def lay_arp(a, b, gain=1.0, octave=0, bright=1.0):
    order = [0, 1, 2, 3, 2, 1, 3, 4]
    for t in grid(a, b, S16):
        s = int(round((t - a) / S16))
        root, tones = chord_at(t)
        ladder = [root + 24 + x for x in tones] + [root + 36, root + 36 + tones[1]]
        add(arp, pluck(ladder[order[s % 8]] + 12 * octave, 0.2, bright), t, gain * (0.5 + 0.5 * (s % 4 == 0)), 0.35 * np.sin(s * 0.9))


def lay_pad(a, b, gain=1.0, harm=14):
    for t in grid(a - a % (BAR * 2), b, BAR * 2):
        root, tones = chord_at(t)
        start, end = max(t, a), min(t + BAR * 2, b)
        d = end - start + 0.5
        n = int(d * SR)
        env = np.minimum(np.arange(n) / (0.35 * SR), 1) * np.minimum((n - np.arange(n)) / (0.5 * SR), 1)
        for x in tones:
            add(pad, supersaw(float(mtof(root + 24 + x)), d, 5, 0.01, harm) * env[:, None], start, gain * 0.3)


def lay_stabs(a, b, gain=1.0, pattern=(0, 0.75, 1.5, 3.0, 3.5)):
    for t in grid(a, b, BAR):
        for p in pattern:
            at = t + p * BEAT
            if at >= b:
                continue
            root, tones = chord_at(at)
            d = 0.3
            for x in tones:
                s = supersaw(float(mtof(root + 36 + x)), d, 5, 0.014, 20)
                s = sweep_lp(s, 900 + 6500 * np.exp(-tvec(d) * 12), 96)
                add(stab, s * env_ad(int(d * SR), 0.002, d, 3)[:, None], at, gain * 0.34)


tense, heart = stem(), stem()


def beat_heart(t, g=1.0):
    # Lub-dub, felt more than heard. Close together it reads as a pulse.
    add(heart, lp(kick(1.0, 0.0), 340), t, g)
    add(heart, lp(kick(1.0, 0.0), 260), t + 0.17, g * 0.55)


def lay_lead(a, b, gain=1.0):
    # A line that climbs through whichever chord is under it, doubled an octave down.
    steps = [(0, 2), (0.75, 3), (1.5, 4), (2.0, 3), (2.75, 2), (3.5, 1)]
    for t in grid(a, b, BAR):
        for p, k in steps:
            at = t + p * BEAT
            if at >= b:
                continue
            root, tones = chord_at(at)
            ladder = [root + 36 + x for x in tones] + [root + 48, root + 48 + tones[1]]
            add(stab, pluck(ladder[k] + 12, 0.42, 1.3), at, gain * 0.6, 0.15)
            add(stab, pluck(ladder[k], 0.42, 1.0), at, gain * 0.4, -0.15)


# --- I. The wall builds: arp opening, kick arriving, hats tightening, a riser with nowhere to go.
lay_arp(0, QUIET, 0.42, 0, 0.9)
lay_pad(0, QUIET, 0.72, 16)
for t in grid(1.0, QUIET, BEAT):
    add(kicks, kick(0.86), t)
    kick_times.append(t)
for t in grid(2.0, QUIET, BEAT):
    add(drums, clap(), t, 0.3 + 0.2 * (t - 2.0))
for t in grid(1.5, QUIET, S16):
    add(hats, hat(), t, 0.14 + 0.2 * (t - 1.5), -0.2 + 0.4 * (int(t / S16) % 2))
add(fx, riser(QUIET, 9000, 0.75), 0)

# --- II. Dead stop. Only the room left: a low drone, a heart, a thin dissonant whine creeping up.
# The stop itself is the music being cut; only reverb from the send keeps ringing.
span = BREATH - QUIET
n = int(span * SR)
tt = np.arange(n) / SR
drone = supersaw(float(mtof(26)), span, 5, 0.004, 8)
drone = lp(drone, 240)
whine = np.sin(2 * np.pi * float(mtof(81)) * tt) + np.sin(2 * np.pi * float(mtof(82)) * tt)
whine = whine * (0.6 + 0.4 * np.sin(2 * np.pi * 5.3 * tt))
whine = np.stack([whine, whine * 0.8], 1)
# How much of it there is: rising, knocked back by the stop, rising harder after the re-entry.
level = np.interp(tt + QUIET, [QUIET, QUIET + 0.5, TAKE["stop"], TAKE["stop"] + 0.02, TAKE["entry"], BREATH], [0, 0.26, 0.62, 0.2, 0.55, 1.15])
add(tense, drone * level[:, None], QUIET, 0.3)
add(tense, whine * (level**2)[:, None], QUIET, 0.012)
HEARTS = [3.75, 4.65, 5.45, 6.15, 6.75, 7.2, TAKE["stop"] + 0.42, TAKE["stop"] + 0.95, TAKE["entry"] - 0.05]
for t in HEARTS:
    beat_heart(t, 0.32)
for k, t in enumerate(np.cumsum([0.42, 0.36, 0.3, 0.25, 0.2, 0.16, 0.13]) + TAKE["entry"]):
    if t < BREATH:
        add(heart, lp(kick(1.0, 0.1), 340), t, 0.3 + k * 0.06)
# After the re-entry: a roll that keeps doubling, and a riser, both stopped dead by the breath.
t = TAKE["entry"] + 0.5
gap = 0.25
while t < BREATH - 0.01:
    add(drums, clap(), t, 0.1 + 0.34 * ((t - TAKE["entry"]) / (BREATH - TAKE["entry"])) ** 2)
    t += gap
    gap = max(0.0625, gap * 0.86)
add(fx, riser(BREATH - TAKE["entry"], 11000, 1.0), TAKE["entry"])

# --- III. The target. Everything, at once.
add(fx, impact(1.35), TP, 1.15)
add(sfx, bell(74, 3), TP, 0.42)
add(sfx, bell(81, 3), TP, 0.22)
lay_groove(TP, RAIL)
lay_stabs(TP, RAIL, 1.0, (0, 0.75, 1.5))
lay_pad(TP, RAIL, 0.9, 18)
lay_arp(TP, RAIL, 0.36, 1, 1.0)

# --- IV. 盤面旁白: no claps, so the eye can read; the kick keeps walking.
lay_groove(RAIL, FEAT, full=False, bass_gain=0.8)
lay_pad(RAIL, FEAT, 0.62, 12)
lay_arp(RAIL, FEAT, 0.26, 0, 0.6)

# --- V. The views: the full band, the stabs back, climbing toward another wall.
lay_groove(FEAT, BLACK)
lay_pad(FEAT, BLACK, 0.8, 18)
lay_arp(FEAT, BLACK, 0.34, 1, 1.0)
lay_stabs(FEAT, BLACK, 0.7, (0, 0.75, 1.5, 2.25, 3.0, 3.5))
add(fx, riser(BLACK - 19.0, 11000, 0.8), 19.0)
t = 20.0
gap = 0.25
while t < BLACK - 0.01:
    add(drums, clap(), t, 0.3 + 0.3 * (t - 20.0))
    t += gap
    gap = max(0.0625, gap * 0.8)

# --- VI. Second silence: a heart, a pedal, the ring winding up in the dark.
span2 = BREATH2 - BLACK
tt2 = np.arange(int(span2 * SR)) / SR
pedal = lp(supersaw(float(mtof(33)), span2, 5, 0.005, 8), 320)
add(tense, pedal * (tt2 / span2)[:, None] ** 2.2, BLACK, 0.5)
for t in (BLACK + 0.45, BLACK + 1.25):
    beat_heart(t, 0.34)
add(fx, riser(BREATH2 - (BLACK + 0.8), 12000, 1.0), BLACK + 0.8)

# --- VII. The biggest moment in the film.
add(fx, impact(1.5), RING, 1.25)
add(sfx, bell(74, 3), RING, 0.42)
add(sfx, bell(81, 3), RING, 0.26)
add(sfx, bell(86, 3), RING, 0.14)
lay_groove(RING, IMPLODE + 0.3)
lay_stabs(RING, IMPLODE + 0.3, 0.9, (0, 0.75, 1.5, 2.25, 3.0, 3.5))
lay_pad(RING, IMPLODE + 0.3, 0.95, 18)
lay_arp(RING, IMPLODE + 0.3, 0.36, 1, 1.0)
lay_lead(RING, IMPLODE + 0.3, 1.0)

# --- The end card: the last chord resolves, the three-note motif rings out.
end_chord = DUR - LOGO + 0.5
for m in (26, 38, 45, 50, 57, 62):
    s_ = supersaw(float(mtof(m)), end_chord, 7, 0.009, 16)
    env = np.minimum(np.arange(len(s_)) / (0.02 * SR), 1) * np.exp(-np.arange(len(s_)) / (end_chord * SR / 2.4))
    add(pad, s_ * env[:, None], LOGO, 0.34)
add(fx, impact(1.25), LOGO, 1.0)
for i, m in enumerate((69, 74, 77)):
    add(sfx, bell(m, 1.9), LOGO + 0.08 + i * BEAT / 2, 0.5 - i * 0.06, -0.2 + i * 0.2)

# --- The film's own hits, placed by scripts/build.mjs.
for h in CUES["hits"]:
    t, kind = h["t"], h["k"]
    g = h.get("g", 1.0)
    pan = h.get("pan", 0.0)
    if kind == "tick":
        add(sfx, tick(h.get("f", 2100)), t, 0.32 * g, pan)
    elif kind == "print":
        add(sfx, tick(h.get("f", 1500), 0.05), t, 0.42 * g, pan)
        add(sfx, np.sin(2 * np.pi * h.get("f", 1500) / 8 * tvec(0.09)) * np.exp(-tvec(0.09) * 42), t, 0.3 * g, pan)
    elif kind == "ping":
        add(sfx, bell(86, 0.9), t, 0.2 * g, pan)
        add(sfx, bell(93, 0.9), t + 0.06, 0.14 * g, pan)
    elif kind == "entry":
        t2 = tvec(0.16)
        add(sfx, np.sin(2 * np.pi * (500 + 700 * t2 / 0.16) * t2) * np.exp(-t2 * 16), t, 0.5 * g, pan)
    elif kind == "tp":
        add(sfx, target_hit(h.get("root", 74)), t, 0.62 * g, pan)
    elif kind == "stop":
        add(sfx, stop_hit(), t, 0.95 * g, pan)
    elif kind == "whoosh":
        add(fx, whoosh(h.get("d", 0.6)), t, 0.6 * g, pan)
    elif kind == "thud":
        add(sfx, kick(0.8, 0.5), t, 0.8 * g, pan)
    elif kind == "flip":
        add(sfx, tick(900 + 500 * h.get("i", 0), 0.07), t, 0.5 * g, pan)
        add(fx, whoosh(0.16), t, 0.28 * g, pan)
    elif kind == "stamp":
        add(sfx, kick(0.5, 1.2), t, 0.7 * g, pan)
        add(sfx, bp(rng.standard_normal(int(0.2 * SR)), 500, 3000) * np.exp(-tvec(0.2) * 26), t, 0.34 * g, pan)
    elif kind == "suck":
        # The whole mix inhaled toward the logo.
        d = h["d"]
        rev = bp(rng.standard_normal((int(d * SR), 2)), 200, 9000) * (np.exp(-(d - tvec(d)) * 6))[:, None] * 0.9
        add(fx, rev, t, g)
    else:
        raise SystemExit(f"unknown cue {kind}")

# ------------------------------------------------------------------ mix

# Duck the sustained parts off the kick so the low end stays clean.
duck = np.ones(N)
for t in kick_times:
    i = int(t * SR)
    d = int(0.32 * SR)
    if i >= N:
        continue
    shape = 1 - 0.72 * np.exp(-np.arange(d) / (0.09 * SR))
    end = min(N, i + d)
    duck[i:end] = np.minimum(duck[i:end], shape[: end - i])
duck = duck[:, None]

# The opening drone opens slowly; the arp's brightness follows the song's energy.
arp_curve = curve([(0, 450), (QUIET, 8000), (TP, 8000), (RAIL, 8000), (RAIL + 0.3, 2400), (FEAT, 3000), (FEAT + 0.1, 7000), (BLACK, 10000), (RING, 10000), (DUR, 10000)])
pad_curve = curve([(0, 320), (QUIET, 3200), (TP, 4200), (RAIL, 3600), (RAIL + 0.3, 1000), (FEAT, 1200), (FEAT + 0.1, 3000), (BLACK, 4200), (RING, 5000), (LOGO, 5000), (DUR, 2000)])
arp = sweep_lp(arp, arp_curve)
pad = sweep_lp(pad, pad_curve)

# The band stops dead at each silence and stays out; reverb from the send keeps ringing a moment.
band = np.ones(N)
for a_, b_ in ((QUIET, TP), (BLACK, RING), (LOGO - 0.2, LOGO)):
    i_, j_ = int(a_ * SR), int(b_ * SR)
    band[i_:j_] = 0.0
    band[i_ - 96 : i_] = np.linspace(1, 0, 96)
band = band[:, None]
# Total silence, nothing at all, in the breath before a drop.
gate = np.ones(N)
for a_, b_ in ((BREATH, TP), (BREATH2, RING)):
    i_, j_ = int(a_ * SR), int(b_ * SR)
    gate[i_:j_] = 0.0
    gate[i_ - 96 : i_] = np.linspace(1, 0, 96)
gate = gate[:, None]

arp_wet = pingpong(arp, S16 * 3, 0.42, 5)
send = (arp * 0.12 + arp_wet * 0.4 + stab * 0.3 + drums * 0.2 + pad * 0.14) * band + sfx * 0.28 + fx * 0.14
wet = reverb(send, 3.0, 5200)

dry = kicks * 0.95 + subs * duck * 0.82 + hats * 1.05 + (arp + arp_wet) * duck * 1.15 + pad * duck * 0.86 + stab * duck * 0.8
mix = (dry * band + drums * 0.95 + wet * 0.5 + tense + heart * 0.9 + fx + sfx * 1.15) * gate

# A little air on top, mono low end, gentle glue, a true-peak ceiling.
mix = mix + hp(mix, 5500) * 0.45
low = lp(mix, 140, 4)
mid = low.mean(axis=1, keepdims=True)
mix = mix - low + mid

loud = np.sqrt(sg.fftconvolve((mix**2).mean(axis=1), np.ones(int(0.05 * SR)) / int(0.05 * SR), mode="same").clip(1e-9))
comp = np.minimum(1, (0.26 / loud) ** 0.32)
mix = mix * comp[:, None]
mix = np.tanh(mix * 1.25) / np.tanh(1.25)
tail = np.minimum((N - np.arange(N)) / (0.5 * SR), 1)[:, None]
mix = mix * tail
mix = mix / np.abs(mix).max() * 0.57  # about -14 LUFS, true peak below -3 dB

os.makedirs("assets/audio", exist_ok=True)
wavfile.write("assets/audio/soundtrack.wav", SR, (mix * 32767).astype(np.int16))
rms = lambda a, b: 20 * np.log10(np.sqrt((mix[int(a * SR) : int(b * SR)] ** 2).mean()) + 1e-9)
print("rms dB by section:", {k: round(rms(*v), 1) for k, v in {"wall": (0, 3), "tail": (3, 3.6), "quiet": (3.6, 5), "open": (5, 7.5), "stopped": (7.6, 9), "again": (9, 10), "peak": (10, 10.75), "tp": (11, 11.8), "rail": (11.8, 15.5), "feat": (15.5, 21), "black": (21.2, 22), "climb": (22, 22.75), "ring": (23, 27.4), "logo": (28, 30)}.items()})
print("wrote", N / SR, "s")
