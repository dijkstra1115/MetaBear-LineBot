# Lays the narration takes on the film's clock and writes the cue data every scene reads.
# Each take is trimmed to its speech (first to last aligned character, plus a breath), the takes are
# placed one after another with the gap in GAPS before each, and every caption token gets the time of
# the spoken words it stands for. Outputs:
#   assets/audio/vo.wav        the narration track, 48 kHz mono
#   assets/data/timeline.js    window.TL = {duration, chunks:[{id, scene, start, end, lines:[{start, end, zh, tokens}]}]}
# Usage (from the project folder): python scripts/timeline.py
import json, os, re, subprocess
import numpy as np
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
VO = os.path.join(PROJECT, "assets", "audio", "vo")
SR = 48000
LEAD = 0.35  # silence before the first word
TAIL = 2.6  # hold after the last word
TEMPO = 1.1  # the takes run about 2.5 words/s; the reference film runs near 2.8
# Gap (s) before each chunk: short where the thought runs on, longer before a turn in the story.
GAPS = {2: 0.45, 3: 0.55, 4: 0.35, 5: 0.7, 6: 0.55, 7: 0.75, 8: 0.85, 9: 0.75, 10: 0.9, 11: 0.6}
# Extra pause (s) inserted inside a take, before the line with this (chunk, line index).
INNER = {(6, 1): 0.25, (9, 1): 0.15, (9, 4): 0.2}

script = json.load(open(os.path.join(HERE, "script.json"), encoding="utf-8"))


def tokens_of(en):
    """Caption tokens: display text, keyword flag, and how many spoken words each stands for."""
    protected = re.sub(r"\{[^}]*\}", lambda m: m.group(0).replace(" ", "\x00"), en)
    out = []
    for raw in protected.split():
        raw = raw.replace("\x00", " ")
        key = "*" in raw
        raw = raw.replace("*", "")
        shown = re.sub(r"\{([^|}]*)\|([^}]*)\}", r"\1", raw)
        said = re.sub(r"\{([^|}]*)\|([^}]*)\}", r"\2", raw)
        out.append({"text": shown, "key": key, "n": len(said.split())})
    return out


def spoken(en):
    return re.sub(r"\{([^|}]*)\|([^}]*)\}", r"\2", en).replace("*", "").replace("“", '"').replace("”", '"')


def word_times(align, text):
    chars, st, en = align["characters"], align["character_start_times_seconds"], align["character_end_times_seconds"]
    assert "".join(chars) == text, "alignment text differs from the sent text"
    words, cur = [], None
    for c, s, e in zip(chars, st, en):
        if c.isspace():
            cur = None
            continue
        if cur is None:
            cur = [s, e]
            words.append(cur)
        else:
            cur[1] = e
    return words


track = [np.zeros(int(LEAD * SR))]
clock = LEAD
chunks_out = []
for chunk in script["chunks"]:
    cid = chunk["id"]
    if cid in GAPS:
        track.append(np.zeros(int(GAPS[cid] * SR)))
        clock += GAPS[cid]
    fast = os.path.join(VO, f"chunk-{cid}.fast.wav")
    # The MP3 is the kept take (the WAV is only voice.py's decode of it).
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(VO, f"chunk-{cid}.mp3"), "-af", f"atempo={TEMPO}", "-ar", str(SR), "-ac", "1", fast], check=True)
    sr, audio = wavfile.read(fast)
    assert sr == SR
    audio = audio.astype(np.float64) / 32768.0
    al = json.load(open(os.path.join(VO, f"chunk-{cid}.align.json"), encoding="utf-8"))
    words = [[a / TEMPO, b / TEMPO] for a, b in word_times(al["alignment"], al["text"])]
    t0 = max(0.0, words[0][0] - 0.06)  # keep the onset
    t1 = min(len(audio) / SR, words[-1][1] + 0.18)  # keep the release
    # Split the take at the inner pauses so a beat can breathe without re-recording.
    cuts = []  # (time in take, extra seconds)
    wi = 0
    line_first_word = []
    for li, line in enumerate(chunk["lines"]):
        line_first_word.append(wi)
        wi += sum(t["n"] for t in tokens_of(line["en"]))
    assert wi == len(words), f"chunk {cid}: {wi} caption words vs {len(words)} spoken"
    for li in range(len(chunk["lines"])):
        if (cid, li) in INNER:
            w = line_first_word[li]
            cuts.append(((words[w - 1][1] + words[w][0]) / 2, INNER[(cid, li)]))

    def shift(t):
        return clock + (t - t0) + sum(x for at, x in cuts if t >= at)

    seg_edges = [t0] + [at for at, _ in cuts] + [t1]
    for k in range(len(seg_edges) - 1):
        track.append(audio[int(seg_edges[k] * SR): int(seg_edges[k + 1] * SR)])
        if k < len(cuts):
            track.append(np.zeros(int(cuts[k][1] * SR)))
    lines_out, wi = [], 0
    for li, line in enumerate(chunk["lines"]):
        toks = []
        for tk in tokens_of(line["en"]):
            ws = words[wi: wi + tk["n"]]
            wi += tk["n"]
            toks.append({"text": tk["text"], "key": tk["key"], "start": round(shift(ws[0][0]), 3), "end": round(shift(ws[-1][1]), 3)})
        lines_out.append({"start": toks[0]["start"], "end": toks[-1]["end"], "zh": line["zh"], "tokens": toks})
    start = clock
    clock = shift(t1)
    chunks_out.append({"id": cid, "scene": chunk["scene"], "start": round(start, 3), "end": round(clock, 3), "lines": lines_out})

track.append(np.zeros(int(TAIL * SR)))
vo = np.concatenate(track)
duration = round(len(vo) / SR, 3)
os.makedirs(os.path.join(PROJECT, "assets", "data"), exist_ok=True)
wavfile.write(os.path.join(PROJECT, "assets", "audio", "vo.wav"), SR, (np.clip(vo, -1, 1) * 32767).astype(np.int16))
tl = {"duration": duration, "chunks": chunks_out}
open(os.path.join(PROJECT, "assets", "data", "timeline.js"), "w", encoding="utf-8").write(
    "// Generated by scripts/timeline.py from the narration takes; do not edit.\nwindow.TL = " + json.dumps(tl, ensure_ascii=False) + ";\n")
json.dump(tl, open(os.path.join(PROJECT, "assets", "data", "timeline.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for c in chunks_out:
    print(f"{c['id']:>2} {c['scene']:<6} {c['start']:6.2f} – {c['end']:6.2f}")
print("duration", duration)
