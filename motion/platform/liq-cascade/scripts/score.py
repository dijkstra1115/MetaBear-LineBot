# Writes assets/audio/soundtrack.wav: the 10/30 盤面解剖's score and sound design, every sample
# synthesized here (no samples, nothing to license), on the same engine as the platform showreel.
# One song at 120 BPM in D minor, so a bar is exactly 2 s: the film's cuts and its four hits (the
# low, the question, the first wave running over the big buy, the second wave) sit on bar lines in
# scripts/cues.json.
# python scripts/score.py   (numpy, scipy)
import json, os
import numpy as np
import scipy.signal as sg
from scipy.io import wavfile

SR = 48000
BEAT = 0.5
BAR = 2.0
S16 = BEAT / 4
C = json.load(open("scripts/cues.json", encoding="utf-8"))
DUR = float(C["duration"])
N = int(DUR * SR)
rng = np.random.default_rng(20261030)


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
    return sg.sosfilt(sg.butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos"), x, axis=0)


def hp(x, fc, order=2):
    return sg.sosfilt(sg.butter(order, fc, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, f0, f1, order=2):
    return sg.sosfilt(sg.butter(order, [f0, min(f1, SR * 0.45)], "band", fs=SR, output="sos"), x, axis=0)


def sweep_lp(x, curve, block=256):
    # A low-pass whose cutoff follows `curve` (Hz per sample), its state carried across blocks.
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
    xs = np.array([p[0] for p in points]) * SR
    ys = np.log(np.array([max(p[1], 1e-3) for p in points]))
    return np.exp(np.interp(np.arange(N), xs, ys))


def level(points):
    xs, ys = zip(*points)
    return np.interp(np.arange(N) / SR, xs, ys)


def reverb(x, seconds=2.6, damp=5000):
    n = int(seconds * SR)
    ir = np.zeros((n, 2))
    for c in range(2):
        ir[:, c] = lp(rng.standard_normal(n), damp) * np.exp(-np.arange(n) / (seconds * SR / 6.5))
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    ir /= np.sqrt((ir**2).sum(axis=0))
    return sg.fftconvolve(x, ir, axes=0)[: len(x)]


def pingpong(x, time, feedback=0.42, repeats=5):
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
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.2)
    click = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 420) * 0.35 * punch
    return np.tanh((body + click) * 1.6) * gain


def clap():
    t = tvec(0.42)
    e = np.exp(-t * 22)
    for off in (0.0, 0.011, 0.023):
        e += (t > off) * np.exp(-(t - off).clip(0) * 150) * 0.8
    return bp(rng.standard_normal(len(t)), 900, 5200) * e * 0.5 + np.sin(2 * np.pi * 196 * t) * np.exp(-t * 28) * 0.25


def hat(open_=False):
    d = 0.34 if open_ else 0.05
    t = tvec(d)
    return hp(rng.standard_normal(len(t)), 8500) * np.exp(-t * (9 if open_ else 85)) * (0.4 if open_ else 0.5)


def pluck(m, dur=0.22, bright=1.0):
    f = float(mtof(m))
    s = saw(f, dur, 26)
    t = tvec(dur)
    s = sweep_lp(s, 500 + 5200 * bright * np.exp(-t * 16), 96)
    return s * env_ad(len(t), 0.002, dur, 3.5)


def bell(m, dur=2.6):
    f = float(mtof(m))
    t = tvec(dur)
    mod = np.sin(2 * np.pi * f * 3.51 * t) * 2.2 * np.exp(-t * 3.4)
    car = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 2.1)
    car += np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 4.5) * 0.25
    return car * env_ad(len(t), 0.002, 99, 0.01)


def impact(size=1.0):
    t = tvec(3.2)
    f = 34 + 150 * np.exp(-t * 15)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.55)
    crack = hp(rng.standard_normal(len(t)), 1200) * np.exp(-t * 26) * 0.45
    air = bp(rng.standard_normal(len(t)), 300, 6000) * np.exp(-t * 3.2) * 0.26
    return np.tanh((boom * 1.3 + crack + air) * size)


def riser(dur, top=9000):
    t = tvec(dur)
    u = t / dur
    s = sweep_lp(rng.standard_normal((len(t), 2)), 200 * (top / 200) ** (u**1.5), 128) * (u**2.4)[:, None] * 0.55
    tone = np.sin(2 * np.pi * np.cumsum(110 * 2 ** (u * 3.2)) / SR) * (u**3) * 0.16
    return s + np.stack([tone, tone], 1)


def downlifter(dur):
    # The price falling: noise closing from bright to dark and a tone sliding down two octaves.
    t = tvec(dur)
    u = t / dur
    s = sweep_lp(rng.standard_normal((len(t), 2)), 9000 * (300 / 9000) ** (u**0.8), 128) * (0.25 + 0.75 * u)[:, None] * 0.4
    tone = np.sin(2 * np.pi * np.cumsum(880 * 2 ** (-2.2 * u)) / SR) * (0.3 + 0.7 * u) * 0.12
    return s + np.stack([tone, tone], 1)


def rewind(dur):
    # A tape spun backwards: a warbling chirp that climbs and a band of hiss that sweeps with it.
    t = tvec(dur)
    u = t / dur
    f = 140 * 2 ** (u * 4.5) * (1 + 0.08 * np.sin(2 * np.pi * 34 * t))
    chirp = np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * 2.5) * 0.25
    hiss = sweep_lp(rng.standard_normal((len(t), 2)), 500 + 9000 * u**1.5, 96) * 0.4
    e = np.sin(np.pi * u) ** 0.7
    return (hiss + np.stack([chirp, chirp], 1)) * e[:, None]


def reverse_swell(dur=0.9):
    t = tvec(dur)
    return hp(rng.standard_normal((len(t), 2)), 3000) * (np.exp(-(dur - t) * 7))[:, None] * 0.4


def tick(f=2100, dur=0.03):
    t = tvec(dur)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 170)


def print_hit(f=1500):
    # A big print going through: a bright tick over a short low knock.
    return np.concatenate([tick(f, 0.05), np.zeros(int(0.04 * SR))])[: int(0.09 * SR)] * 0.42 + np.sin(2 * np.pi * f / 8 * tvec(0.09)) * np.exp(-tvec(0.09) * 42) * 0.3


# ------------------------------------------------------------------ the song

kicks, subs, drums, hats, arp, pad, stab, fx, sfx, heart, outro = (stem() for _ in range(11))
kick_times = []
Dm, Bb, Gm, A, F, Cmaj = (38, (0, 3, 7)), (34, (0, 4, 7)), (31, (0, 3, 7)), (33, (0, 4, 7)), (41, (0, 4, 7)), (36, (0, 4, 7))
# The chords move on bar lines; the cascade falls Dm → Bb, the question hangs on A, both waves land on
# Dm, the bounce lifts to F, and the chain walks Bb → A home to Dm under the logo.
SONG = [(0, Dm), (1, Bb), (2, Gm), (3, A), (6, Dm), (8, Bb), (9, A), (10, Dm), (12, Bb), (14, Gm), (16, Dm), (18, Bb), (19, A),
        (22, Dm), (24, F), (25, Cmaj), (26, Bb), (27, A), (28, Dm)]


def chord_at(t):
    now = SONG[0][1]
    for at, ch in SONG:
        if at <= t + 1e-9:
            now = ch
    return now


def grid(a, b, step):
    # Every pattern counts from 0 s, wherever a section starts, so the beat never shifts.
    return np.arange(np.ceil(a / step - 1e-9) * step, b - 1e-6, step)


def lay_groove(a, b, claps=1.0, hats_=1.0, bass=1.0, kick_=1.0):
    for t in grid(a, b, BEAT):
        if kick_:
            add(kicks, kick(kick_), t)
            kick_times.append(t)
        if int(round(t / BEAT)) % 2 == 1 and claps:
            add(drums, clap(), t, 0.62 * claps)
        if hats_:
            add(hats, hat(True), t + BEAT / 2, 0.3 * hats_, 0.2)
    if hats_:
        for t in grid(a, b, S16):
            s = int(round(t / S16))
            vel = 0.55 + 0.45 * (s % 2 == 0) + 0.12 * np.sin(s * 1.7)
            add(hats, hat(), t, 0.36 * vel * hats_, -0.25 + 0.5 * (s % 4 == 2))
    if bass:
        for t in grid(a, b, BAR):
            for p in (0, 0.75, 1.5, 2.5, 3.25, 3.75):
                at = t + p * BEAT
                if at < a or at >= b:
                    continue
                root, _ = chord_at(at)
                d = 0.34
                f = float(mtof(root))
                tt = tvec(d)
                body = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt)
                add(subs, np.tanh(body * 1.5) * env_ad(len(tt), 0.004, d, 2.4), at, 0.62 * bass)
                add(subs, np.tanh(lp(saw(f * 2, d, 18), 1100) * env_ad(len(tt), 0.003, d, 4.5) * 2.4), at, 0.2 * bass)


def lay_arp(a, b, gain=1.0, octave=0, bright=1.0):
    order = [0, 1, 2, 3, 2, 1, 3, 4]
    for t in grid(a, b, S16):
        s = int(round(t / S16))
        root, tones = chord_at(t)
        ladder = [root + 24 + x for x in tones] + [root + 36, root + 36 + tones[1]]
        add(arp, pluck(ladder[order[s % 8]] + 12 * octave, 0.2, bright), t, gain * (0.5 + 0.5 * (s % 4 == 0)), 0.35 * np.sin(s * 0.9))


def lay_pad(a, b, gain=1.0, buf=None, harm=14):
    buf = pad if buf is None else buf
    edges = [at for at, _ in SONG] + [DUR]
    for at, nxt in zip(edges, edges[1:]):
        start, end = max(at, a), min(nxt, b)
        if start >= end:
            continue
        root, tones = chord_at(start)
        d = end - start + 0.5
        n = int(d * SR)
        e = np.minimum(np.arange(n) / (0.2 * SR), 1) * np.minimum((n - np.arange(n)) / (0.5 * SR), 1)
        for x in tones:
            add(buf, supersaw(float(mtof(root + 24 + x)), d, 5, 0.01, harm) * e[:, None], start, gain * 0.3)


def lay_stabs(a, b, gain=1.0):
    for t in grid(a, b, BAR):
        for p in (0, 0.75, 1.5, 2.0, 3.0, 3.5):
            at = t + p * BEAT
            if at < a or at >= b:
                continue
            root, tones = chord_at(at)
            d = 0.3
            for x in tones:
                s = sweep_lp(supersaw(float(mtof(root + 36 + x)), d, 5, 0.014, 20), 900 + 6500 * np.exp(-tvec(d) * 12), 96)
                add(stab, s * env_ad(int(d * SR), 0.002, d, 3)[:, None], at, gain * 0.34)


def lay_lead(a, b, gain=1.0):
    steps = [(0, 2), (0.75, 3), (1.5, 4), (2.0, 3), (2.75, 2), (3.5, 1)]
    for t in grid(a, b, BAR):
        for p, k in steps:
            at = t + p * BEAT
            if at < a or at >= b:
                continue
            root, tones = chord_at(at)
            ladder = [root + 36 + x for x in tones] + [root + 48, root + 48 + tones[1]]
            add(stab, pluck(ladder[k] + 12, 0.42, 1.3), at, gain * 0.6, 0.15)
            add(stab, pluck(ladder[k], 0.42, 1.0), at, gain * 0.4, -0.15)


def roll(a, b, g0=0.1, g1=0.45, tighten=0.84):
    t, gap = a, 0.25
    while t < b - 0.01:
        u = (t - a) / (b - a)
        add(drums, clap(), t, g0 + (g1 - g0) * u**2)
        t += gap
        gap = max(0.0625, gap * tighten)


def beat_heart(t, g=1.0):
    add(heart, lp(kick(1.0, 0.0), 340), t, g)
    add(heart, lp(kick(1.0, 0.0), 260), t + 0.17, g * 0.55)


def climb(t, n, root=62, step=S16 / 2, g=0.6, pan=0.0):
    # A run of plucks up the chord under it, ending on a ringing bell.
    r, tones = chord_at(t)
    ladder = [r + 36 + x for x in tones] + [r + 48 + x for x in tones]
    for k in range(n):
        add(sfx, pluck(ladder[k % len(ladder)], 0.16, 1.4), t + k * step, g, pan)
    add(sfx, bell(ladder[(n - 1) % len(ladder)] + 12, 0.9), t + (n - 1) * step, 0.22, pan)


HOOK_LOW, ASK, REW, BUILD, OI_TOP, FP, BUY, THROUGH, WAVE1 = (C[k] for k in ("hookLow", "ask", "rewind", "build", "build440", "fp", "buy252", "through", "wave1"))
PANES, AFTER, OI_DROP, WAVE2, BOUNCE, CHAIN, END = (C[k] for k in ("panes", "after", "oiDrop", "wave2", "bounce", "chain", "end"))

# --- Hook: the first frame is already falling and the band is already playing, the whole mix
# sliding down with the price into the low, on the downbeat of bar 2. The band rides the next bar
# under the cascade's total, then stops dead on 「發生什麼事？」.
add(fx, impact(0.9), 0, 0.45)
lay_groove(0, ASK, claps=0.8)
lay_arp(0, HOOK_LOW, 0.32, 1, 1.0)
lay_arp(HOOK_LOW, ASK, 0.24, 0, 0.8)
lay_stabs(0, HOOK_LOW, 0.7)
lay_pad(0, ASK, 0.8)
add(fx, downlifter(HOOK_LOW - 0.1), 0.1, 0.9)
add(fx, impact(1.4), HOOK_LOW, 1.2)
add(sfx, bell(62, 3), HOOK_LOW, 0.34)
add(sfx, bell(69, 3), HOOK_LOW, 0.2)
add(fx, reverse_swell(0.6), ASK - 0.6, 0.5)
add(fx, impact(0.8), ASK, 0.6)

# --- The question: the band is out; a pedal on A and a heart under 「發生什麼事？」, then the tape spins
# back into the build.
span = BUILD - ASK
tt = tvec(span)
add(heart, lp(supersaw(float(mtof(33)), span, 5, 0.005, 8), 320) * (0.4 + 0.6 * (tt / span))[:, None], ASK, 0.45)
for t in (ASK + 0.5, ASK + 1.0):
    beat_heart(t, 0.42)
add(fx, rewind(BUILD - REW), REW, 0.75)
add(fx, reverse_swell(0.5), BUILD - 0.5, 0.6)

# --- Build: four on the floor and the bass, the hats coming in, OI climbing to its top on bar 3's
# third beat, a riser and a roll into the first wave.
lay_groove(BUILD, FP, claps=0.0, hats_=0.55, bass=0.9)
lay_arp(BUILD, FP, 0.22, 0, 0.7)
lay_pad(BUILD, FP, 0.65)
add(sfx, bell(81, 1.6), OI_TOP, 0.22)
add(sfx, bell(86, 1.2), OI_TOP + 0.06, 0.12)
add(fx, riser(FP - BUILD - 1.0, 10000), BUILD + 1.0, 0.85)
roll(FP - 1.0, FP)

# --- First wave: the full band. The 252 BTC buy prints, and on bar 5's downbeat the wave runs it over.
add(fx, impact(1.1), FP, 0.9)
lay_groove(FP, PANES)
lay_arp(FP, PANES, 0.34, 1, 1.0)
lay_stabs(FP, PANES, 0.9)
lay_pad(FP, PANES, 0.9)
add(sfx, print_hit(1500), BUY, 1.0, 0.2)
add(sfx, bell(86, 0.9), BUY, 0.16, 0.2)
add(fx, impact(1.3), THROUGH, 1.05)
add(sfx, bell(62, 2.4), THROUGH, 0.3)
add(sfx, bell(74, 2.4), THROUGH, 0.18)
add(drums, clap(), WAVE1, 0.5)

# --- Perps against spot: the band leans back for reading; every pane that switches on climbs the
# chord it lands on.
lay_groove(PANES, AFTER, claps=0.55, hats_=0.8, bass=0.85)
lay_arp(PANES, AFTER, 0.28, 1, 0.8)
lay_pad(PANES, AFTER, 0.85)
for i, t in enumerate((C["paneCvd"], C["paneSpot"], C["panePrem"])):
    climb(t, 3 + i, g=0.55, pan=-0.2 + 0.2 * i)
    add(fx, reverse_swell(0.35), t - 0.35, 0.35)

# --- Second wave: down to kick and bass with OI dropping, a riser and a roll, and the biggest hit on
# bar 10's downbeat. The bounce lifts the song to F.
lay_groove(AFTER, WAVE2, claps=0.0, hats_=0.5, bass=1.0)
lay_pad(AFTER, WAVE2, 0.7)
add(sfx, bell(81, 1.2), OI_DROP, 0.2)
add(sfx, bell(76, 1.2), OI_DROP + 0.125, 0.14)
add(fx, riser(WAVE2 - AFTER, 12000), AFTER, 0.95)
roll(WAVE2 - 1.0, WAVE2, 0.12, 0.5, 0.82)
add(fx, impact(1.5), WAVE2, 1.25)
for m, g in ((62, 0.4), (69, 0.24), (74, 0.14)):
    add(sfx, bell(m, 3), WAVE2, g)
lay_groove(WAVE2, CHAIN)
lay_stabs(WAVE2, CHAIN, 0.9)
lay_pad(WAVE2, CHAIN, 0.95, harm=18)
lay_arp(WAVE2, CHAIN, 0.34, 1, 1.0)
lay_lead(BOUNCE - 0.75, CHAIN, 0.9)
climb(BOUNCE, 6, g=0.5)
add(fx, riser(1.0, 8000), CHAIN - 1.0, 0.5)

# --- The chain: the band stops on bar 12; a soft pulse keeps time while each link lands on an eighth,
# then the song comes home to Dm under the logo.
add(fx, impact(0.9), CHAIN, 0.7)
lay_pad(CHAIN, END, 0.8, outro, 16)
for t in grid(CHAIN, END, BEAT):
    add(heart, lp(kick(1.0, 0.0), 300), t, 0.3)
for k, m in enumerate((74, 77, 81, 86)):
    add(sfx, bell(m, 1.4), CHAIN + 0.25 + k * 0.5, 0.3, -0.3 + 0.2 * k)
    add(sfx, tick(2100 + 300 * k), CHAIN + 0.25 + k * 0.5, 0.2, -0.3 + 0.2 * k)
end_len = DUR - END + 0.2
for m in (26, 38, 45, 50, 57, 62):
    s_ = supersaw(float(mtof(m)), end_len, 7, 0.009, 16)
    e = np.minimum(np.arange(len(s_)) / (0.02 * SR), 1) * np.exp(-np.arange(len(s_)) / (end_len * SR / 2.4))
    add(outro, s_ * e[:, None], END, 0.34)
add(fx, impact(1.15), END, 0.85)
for i, m in enumerate((69, 74, 77)):
    add(sfx, bell(m, 1.9), END + 0.08 + i * BEAT / 2, 0.48 - i * 0.06, -0.2 + i * 0.2)

# ------------------------------------------------------------------ mix

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

arp = sweep_lp(arp, curve([(0, 7000), (HOOK_LOW, 3000), (BUILD, 1200), (FP - 0.5, 4500), (FP, 8000), (PANES, 4500), (AFTER, 4500), (WAVE2, 9000), (DUR, 9000)]))
pad = sweep_lp(pad, curve([(0, 3500), (HOOK_LOW, 2000), (BUILD, 700), (FP, 4000), (PANES, 3000), (AFTER, 1500), (WAVE2 - 0.1, 3500), (WAVE2, 5000), (DUR, 5000)]))
hats = hats * level([(0, 1), (BUILD, 0.6), (FP - 0.01, 0.9), (FP, 1), (DUR, 1)])[:, None]

# The band stops dead under the question and at the chain; the reverb send keeps ringing a moment.
band = np.ones(N)
for a, b in ((ASK, BUILD), (CHAIN, DUR)):
    i_, j_ = int(a * SR), int(b * SR)
    band[i_:j_] = 0.0
    band[max(0, i_ - 96) : i_] = np.linspace(1, 0, min(96, i_))
band = band[:, None]
arp_wet = pingpong(arp, S16 * 3)
send = (arp * 0.12 + arp_wet * 0.4 + stab * 0.3 + drums * 0.2 + pad * 0.14) * band + sfx * 0.3 + fx * 0.14 + outro * 0.2
wet = reverb(send, 3.0, 5200)

dry = kicks * 0.95 + subs * duck * 0.82 + hats * 1.05 + (arp + arp_wet) * duck * 1.15 + pad * duck * 0.86 + stab * duck * 0.8 + drums * 0.95
mix = dry * band + wet * 0.5 + heart * 0.9 + outro * 0.9 + fx + sfx * 1.15

mix = mix + hp(mix, 5500) * 0.4
low = lp(mix, 140, 4)
mix = mix - low + low.mean(axis=1, keepdims=True)
loud = np.sqrt(sg.fftconvolve((mix**2).mean(axis=1), np.ones(int(0.05 * SR)) / int(0.05 * SR), mode="same").clip(1e-9))
mix = mix * np.minimum(1, (0.26 / loud) ** 0.32)[:, None]
mix = np.tanh(mix * 1.25) / np.tanh(1.25)
mix = mix * np.minimum((N - np.arange(N)) / (0.8 * SR), 1)[:, None]
mix = mix / np.abs(mix).max() * 0.57

os.makedirs("assets/audio", exist_ok=True)
wavfile.write("assets/audio/soundtrack.wav", SR, (mix * 32767).astype(np.int16))
rms = lambda a, b: round(float(20 * np.log10(np.sqrt((mix[int(a * SR) : int(b * SR)] ** 2).mean()) + 1e-9)), 1)
print("rms dB:", {k: rms(*v) for k, v in {"hook": (0, 2), "total": (2, 4), "ask": (4, 6), "build": (6, 10), "wave1": (10, 14), "panes": (14, 20), "pre": (20, 22), "wave2": (22, 26), "chain": (26, 28), "end": (28, 31)}.items()})
print("soundtrack ok", DUR, "s")
