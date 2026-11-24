"""Measure a reference video so it can be compared with the playbook numbers.

Usage (from motion/):
    py -I explainers/playbook/scripts/analyze.py out/ref/viral/viral3.mp4

Writes next to the video, in a folder named after it (out/ref/viral/viral3/):
    audio16k.wav, transcript.json   word timings (HyperFrames + Parakeet)
    hook_01.jpg                     first 8 s at 3 fps, timestamped
    sheet_NN.jpg                    whole video at 1 fps, 16 frames a sheet
    report.txt                      everything printed below

Needs ffmpeg, numpy and `npx hyperframes models install parakeet` once.
Only the numbers are measured; nobody listens to the audio here.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

HF = "hyperframes@0.8.152"
FONT = "/Windows/Fonts/arial.ttf"


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, check=False, **kw)


def probe(video):
    out = run(["ffprobe", "-v", "error", "-show_entries",
               "format=duration:stream=codec_type,width,height,r_frame_rate",
               "-of", "json", str(video)]).stdout
    d = json.loads(out)
    v = next(s for s in d["streams"] if s["codec_type"] == "video")
    return float(d["format"]["duration"]), v["width"], v["height"], v["r_frame_rate"]


def sheets(video, out):
    draw = f"drawtext=text='%{{eif\\:t\\:d}}s':x=6:y=6:fontsize=28:fontcolor=yellow:box=1:boxcolor=black@0.6:fontfile={FONT}"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-vf",
         f"fps=1,scale=240:-1,{draw},tile=8x2", str(out / "sheet_%02d.jpg")])
    draw = f"drawtext=text='%{{pts\\:hms}}':x=6:y=6:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6:fontfile={FONT}"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-t", "8", "-vf",
         f"fps=3,scale=240:-1,{draw},tile=8x3", str(out / "hook_%02d.jpg")])


def transcribe(video, out):
    wav = out / "audio16k.wav"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000", str(wav)])
    if not (out / "transcript.json").exists():
        run(f"npx --yes {HF} transcribe audio16k.wav --engine parakeet --json -d .",
            cwd=out, shell=True)
    path = out / "transcript.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def sentences(words):
    out, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[.?!]$", w["text"].strip()):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def cuts(video):
    err = run(["ffmpeg", "-hide_banner", "-i", str(video), "-vf",
               "scdet=threshold=8:sc_pass=1,metadata=print", "-an", "-f", "null", "-"]).stderr.decode()
    return [float(t) for t in re.findall(r"lavfi\.scd\.time=([0-9.]+)", err)]


def loudness(video):
    err = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-af",
               "ebur128=framelog=quiet", "-f", "null", "-"]).stderr.decode()
    i = re.search(r"I:\s+(-?[0-9.]+) LUFS", err)
    lra = re.search(r"LRA:\s+([0-9.]+) LU", err)
    err = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-af",
               "silencedetect=n=-35dB:d=0.25", "-f", "null", "-"]).stderr.decode()
    sil = re.findall(r"silence_start: ([0-9.]+)", err)
    return (float(i.group(1)) if i else None, float(lra.group(1)) if lra else None, len(sil))


def activity(video, fps=10, w=90, h=160):
    raw = run(["ffmpeg", "-v", "error", "-i", str(video), "-vf",
               f"fps={fps},scale={w}:{h},format=gray", "-f", "rawvideo", "-"]).stdout
    f = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)
    body = f[:, int(h * 0.25):, :]  # skip the caption band at the top
    d = np.abs(np.diff(body, axis=0)).mean(axis=(1, 2))
    still = d < 0.4
    best = cur = 0
    for s in still:
        cur = cur + 1 if s else 0
        best = max(best, cur)
    return f.mean(), d, best / fps, fps


def main(video):
    video = Path(video)
    out = video.with_suffix("")
    out.mkdir(parents=True, exist_ok=True)
    lines = []
    say = lambda s="": (print(s), lines.append(s))

    dur, w, h, rate = probe(video)
    say(f"# {video.name}: {dur:.2f} s, {w}x{h}, {rate} fps")
    sheets(video, out)

    words = transcribe(video, out)
    if words:
        span = words[-1]["end"] - words[0]["start"]
        say(f"words {len(words)}, speech {words[0]['start']:.2f}-{words[-1]['end']:.2f} s, "
            f"{len(words) / span:.2f} words/s")
        for s in sentences(words):
            a, b = s[0]["start"], s[-1]["end"]
            say(f"  {a:6.2f}-{b:6.2f} ({b - a:4.1f}s {len(s):2d}w) " + " ".join(x["text"] for x in s))
    else:
        say("no transcript (run `npx hyperframes models install parakeet`)")

    c = cuts(video)
    say(f"hard cuts {len(c)}: " + " ".join(f"{t:.1f}" for t in c))
    i, lra, sil = loudness(video)
    say(f"loudness {i} LUFS, LRA {lra} LU, gaps below -35 dB: {sil}")
    luma, d, still, fps = activity(video)
    say(f"mean luma {luma:.1f}/255, longest still stretch {still:.1f} s")
    for k in range(0, len(d), fps * 5):
        win = d[k:k + fps * 5]
        say(f"  {k / fps:5.1f}s motion {win.mean():5.2f}  still {(win < 0.4).mean() * 100:3.0f}%")

    (out / "report.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    for v in sys.argv[1:]:
        main(v)
