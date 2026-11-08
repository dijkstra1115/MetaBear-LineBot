# Records the English narration with ElevenLabs Brian (eleven_v3), the voice the user picked for the
# English trial of the 2025-12-09 logic replay. One take per chunk of scripts/script.json, so each
# paragraph keeps its own intonation; every take is transcribed with word times, which become the
# cue of each line (assets/audio/vo/cues.json) and catch a misread.
# Usage (from this folder): python scripts/voice.py [chunk ids...]   (default: every chunk)
# Needs motion/.env with ELEVENLABS_API_KEY, ffmpeg and openai-whisper.
import json, os, re, subprocess, sys, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
OUT = os.path.join(PROJECT, "assets", "audio", "vo")
FF = os.environ.get("FFMPEG", "ffmpeg")
os.makedirs(OUT, exist_ok=True)
script = json.load(open(os.path.join(HERE, "script.json"), encoding="utf-8"))
voice = script["voice"]


def key():
    for line in open(os.path.join(PROJECT, "..", "..", ".env"), encoding="utf-8"):
        if line.startswith("ELEVENLABS_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("ELEVENLABS_API_KEY missing in motion/.env")


def record(text, mp3):
    body = {"text": text, "model_id": voice["model"], "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice['id']}?output_format=mp3_44100_128",
        data=json.dumps(body).encode(), headers={"xi-api-key": key(), "Content-Type": "application/json", "Accept": "audio/mpeg"})
    try:
        open(mp3, "wb").write(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        sys.exit(f"{e.code}: {e.read().decode()[:300]}")


norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
wanted = [int(a) for a in sys.argv[1:]] or [c["id"] for c in script["chunks"]]
import whisper

model = whisper.load_model("small")
cues_file = os.path.join(OUT, "cues.json")
cues = json.load(open(cues_file, encoding="utf-8")) if os.path.exists(cues_file) else {}
for chunk in script["chunks"]:
    if chunk["id"] not in wanted:
        continue
    text = " ".join(l["en"] for l in chunk["lines"])
    mp3 = os.path.join(OUT, f"chunk-{chunk['id']}.mp3")
    wav = mp3[:-4] + ".wav"
    record(text, mp3)
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", mp3, "-ar", "48000", "-ac", "1", wav], check=True)
    heard = model.transcribe(wav, language="en", word_timestamps=True, initial_prompt="Bitcoin order flow: CVD, value area, point of control.")
    words = [w for s in heard["segments"] for w in s["words"]]
    # Each line starts at the first word whose running text reaches the line's start; numbers may be
    # heard as words, so lines are matched by word count in proportion, not by spelling.
    total = sum(len(l["en"].split()) for l in chunk["lines"])
    starts, k = [], 0
    for l in chunk["lines"]:
        i = min(len(words) - 1, round(k / total * len(words)))
        starts.append(words[i]["start"] if words else 0)
        k += len(l["en"].split())
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).decode().strip())
    cues[str(chunk["id"])] = {"file": f"assets/audio/vo/chunk-{chunk['id']}.wav", "duration": dur, "speech_end": words[-1]["end"] if words else dur,
                              "lines": [{"n": l["n"], "at": round(s, 2)} for l, s in zip(chunk["lines"], starts)]}
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"chunk {chunk['id']} ({dur:.1f}s): {heard['text'].strip()}")
json.dump(cues, open(cues_file, "w", encoding="utf-8"), indent=1)
