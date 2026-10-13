# Cuts the recorded chunks (scripts/voice.py) back into one file per scene, with a start/end time for
# every character of the scene's `say` text (scripts/.align/<id>.json), which scripts/cues.mjs reads.
# Times come from Whisper word timestamps, aligned to the script by edit distance after spelling
# Whisper's digits out the way the script reads them.
# Usage (from this folder): python scripts/split-vo.py
import array, json, re, subprocess, sys, warnings, wave
import whisper

warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")
script = json.loads(subprocess.check_output(["node", "-e", "import('./scripts/script.mjs').then(m=>process.stdout.write(JSON.stringify(m)))"]).decode("utf-8"))
say = {s["id"]: s["say"] for s in script["SCENES"]}
DIG = "零一二三四五六七八九"


def cn(n):
    """Chinese reading of 0 ≤ n < 100000 (一千零四十, 九萬零三百四十五, 十七)."""
    if n < 10:
        return DIG[n]
    if n < 20:
        return "十" + (DIG[n % 10] if n % 10 else "")
    out, zero = "", False
    for unit, name in ((10000, "萬"), (1000, "千"), (100, "百"), (10, "十"), (1, "")):
        d = n // unit % 10
        if d:
            if zero and out:
                out += "零"
            out += DIG[d] + name
            zero = False
        elif out:
            zero = True
    return out


def spell(s):
    s = re.sub(r"(?<=\d),(?=\d{3})", "", s)
    s = re.sub(r"(\d+)[:.](\d+)", lambda m: cn(int(m[1])) + "點" + cn(int(m[2])) + "分", s)
    return re.sub(r"\d+", lambda m: cn(int(m[0])), s)


keep = lambda c: c.isalnum()


def align(text, words):
    """Per-character [start, end] for `text`, from Whisper `words`."""
    heard = []
    for w in words:
        chars = [c.lower() for c in spell(w["word"]) if keep(c)]
        for i, c in enumerate(chars):
            a = w["start"] + (w["end"] - w["start"]) * i / len(chars)
            b = w["start"] + (w["end"] - w["start"]) * (i + 1) / len(chars)
            heard.append((c, a, b))
    idx = [i for i, c in enumerate(text) if keep(c)]
    A = [text[i].lower() for i in idx]
    B = [h[0] for h in heard]
    n, m = len(A), len(B)
    D = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        D[i][0] = i
    for j in range(m + 1):
        D[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            D[i][j] = min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (A[i - 1] != B[j - 1]))
    times = [None] * n
    i, j = n, m
    while i > 0 and j > 0:
        if D[i][j] == D[i - 1][j - 1] + (A[i - 1] != B[j - 1]):
            times[i - 1] = heard[j - 1][1:]
            i, j = i - 1, j - 1
        elif D[i][j] == D[i - 1][j] + 1:
            i -= 1
        else:
            j -= 1
    # Unmatched characters: interpolate between matched neighbours.
    known = [k for k, v in enumerate(times) if v]
    for k in range(n):
        if times[k]:
            continue
        lo = max((x for x in known if x < k), default=None)
        hi = min((x for x in known if x > k), default=None)
        if lo is None:
            times[k] = (times[hi][0], times[hi][0])
        elif hi is None:
            times[k] = (times[lo][1], times[lo][1])
        else:
            f = (k - lo) / (hi - lo)
            t = times[lo][1] + (times[hi][0] - times[lo][1]) * f
            times[k] = (t, t)
    full = [None] * len(text)
    for k, i in enumerate(idx):
        full[i] = times[k]
    last = (0.0, 0.0)
    for i in range(len(text)):  # punctuation and spaces take the previous character's end
        if full[i] is None:
            full[i] = (last[1], last[1])
        last = full[i]
    return full


pauses = {s["id"]: s.get("pauses", []) for s in script["SCENES"]}


def add_pauses(path, text, beats, start, end):
    """Insert silence before each beat's substring (at the quietest sample near the gap before it),
    shifting the timings of everything after it. Returns the seconds added."""
    w = wave.open(path)
    rate, width, ch = w.getframerate(), w.getsampwidth(), w.getnchannels()
    pcm = array.array("h", w.readframes(w.getnframes()))
    w.close()
    added = 0.0
    for sub, sec in sorted(beats, key=lambda b: -text.index(b[0])):  # last first, so earlier indices hold
        i = text.index(sub)
        gap_mid = (end[i - 1] + start[i]) / 2 if i else start[i]
        # The quietest 10 ms window within ±60 ms of the gap.
        best, best_e = None, None
        for off in range(-60, 61, 5):
            c = int((gap_mid + off / 1000) * rate) * ch
            seg = pcm[max(0, c - rate // 200 * ch) : c + rate // 200 * ch]
            e = sum(abs(x) for x in seg) / max(1, len(seg))
            if best_e is None or e < best_e:
                best, best_e = c, e
        at = best - best % ch
        pcm = pcm[:at] + array.array("h", [0] * int(sec * rate) * ch) + pcm[at:]
        cut_t = at / ch / rate
        # Everything from the beat's first character on moves by the pause; that character cannot
        # start before the silence ends (Whisper sometimes puts it inside the old gap).
        for j in range(i, len(text)):
            start[j] += sec
            end[j] += sec
        start[i] = max(start[i], cut_t + sec)
        end[i] = max(end[i], start[i])
        added += sec
    out = wave.open(path, "wb")
    out.setnchannels(ch)
    out.setsampwidth(width)
    out.setframerate(rate)
    out.writeframes(pcm.tobytes())
    out.close()
    return added


model = whisper.load_model("medium")
for n, ids in enumerate(script["CHUNKS"], 1):
    path = f"assets/audio/vo/chunk-{n}.wav"
    r = model.transcribe(path, language="zh", word_timestamps=True, initial_prompt="以下是繁體中文旁白。")
    words = [w for s in r["segments"] for w in s["words"]]
    text = "".join(say[i] for i in ids)
    t = align(text, words)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))
    # Scene boundaries: halfway through the pause between one scene's last word and the next's first.
    spans, pos = [], 0
    for i in ids:
        a, b = pos, pos + len(say[i])
        first = next(k for k in range(a, b) if keep(text[k]))
        last = max(k for k in range(a, b) if keep(text[k]))
        spans.append((i, a, b, t[first][0], t[last][1]))
        pos = b
    # Snap each boundary to the real pause nearest Whisper's estimate, and take the real voice onset
    # and offset from the pauses around each scene (Whisper's word times drift by up to ~0.3 s).
    det = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "silencedetect=n=-38dB:d=0.25", "-f", "null", "-"], capture_output=True, text=True).stderr
    sil = list(zip([float(x) for x in re.findall(r"silence_start: ([\d.]+)", det)], [float(x) for x in re.findall(r"silence_end: ([\d.]+)", det)]))
    gap = lambda e, iv: 0 if iv[0] <= e <= iv[1] else min(abs(e - iv[0]), abs(e - iv[1]))
    cuts, on, off = [0.0], [next((b for a, b in sil if a <= 0.01), spans[0][3])], []
    for k in range(len(spans) - 1):
        e = (spans[k][4] + spans[k + 1][3]) / 2
        iv = min(sil, key=lambda iv: gap(e, iv))
        cuts.append((iv[0] + iv[1]) / 2)
        off.append(iv[0])
        on.append(iv[1])
    cuts.append(dur)
    off.append(next((a for a, b in sil if b >= dur - 0.01), spans[-1][4]))
    for k, (i, a, b, s0, s1) in enumerate(spans):
        c0, c1 = cuts[k], cuts[k + 1]
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ss", f"{c0:.3f}", "-to", f"{c1:.3f}", "-c:a", "pcm_s16le", f"assets/audio/vo/{i}.wav"], check=True)
        remap = lambda x: on[k] + (x - s0) * (off[k] - on[k]) / max(1e-6, s1 - s0)
        sub = t[a:b]
        start = [remap(x[0]) - c0 for x in sub]
        end = [remap(x[1]) - c0 for x in sub]
        added = add_pauses(f"assets/audio/vo/{i}.wav", say[i], pauses[i], start, end)
        json.dump({"text": say[i], "start": [round(x, 3) for x in start], "end": [round(x, 3) for x in end]},
                  open(f"scripts/.align/{i}.json", "w", encoding="utf-8"), ensure_ascii=False)
        s0, s1 = on[k], off[k]
        print(f"{i:8s} {c0:6.2f}–{c1:6.2f}s  speech {s0 - c0:5.2f}–{s1 - c0:5.2f}  +{added:.2f}s pauses")

# Scenes taken from an earlier take instead (same voice and direction): the third take said MetaBear
# as 梅塔貝爾; the second said it the English way. [scene, file, start (s, inside the pause before it)]
OVERRIDES = [("close", "assets/audio/vo-take2/chunk-2.wav", 27.97)]
for i, path, c0 in OVERRIDES:
    out = f"assets/audio/vo/{i}.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ss", f"{c0:.3f}", "-c:a", "pcm_s16le", out], check=True)
    r = model.transcribe(out, language="zh", word_timestamps=True, initial_prompt="以下是繁體中文旁白。")
    t = align(say[i], [w for s in r["segments"] for w in s["words"]])
    det = subprocess.run(["ffmpeg", "-hide_banner", "-i", out, "-af", "silencedetect=n=-38dB:d=0.25", "-f", "null", "-"], capture_output=True, text=True).stderr
    sil = list(zip([float(x) for x in re.findall(r"silence_start: ([\d.]+)", det)], [float(x) for x in re.findall(r"silence_end: ([\d.]+)", det)]))
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]))
    first = next(k for k, c in enumerate(say[i]) if keep(c))
    last = max(k for k, c in enumerate(say[i]) if keep(c))
    s0, s1 = t[first][0], t[last][1]
    on = next((b for a, b in sil if a <= 0.01), s0)
    off = next((a for a, b in sil if b >= dur - 0.01), s1)
    remap = lambda x: on + (x - s0) * (off - on) / max(1e-6, s1 - s0)
    json.dump({"text": say[i], "start": [round(remap(x[0]), 3) for x in t], "end": [round(remap(x[1]), 3) for x in t]},
              open(f"scripts/.align/{i}.json", "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{i:8s} from {path} @ {c0:.2f}s  speech {on:5.2f}–{off:5.2f}")
