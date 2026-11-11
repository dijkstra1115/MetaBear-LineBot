# Records the English narration with ElevenLabs Brian (eleven_v3), the voice the user picked for the
# English replay trial (motion/platform/live-trade-01/scripts/voice.py). One take per chunk of
# scripts/script.json so each paragraph keeps its own intonation. The with-timestamps endpoint gives
# every character's time, so each spoken word gets an exact cue; whisper re-hears the take to catch
# a misread.
# Usage (from the project folder): python scripts/voice.py [chunk ids...]   (default: every chunk)
# Writes assets/audio/vo/chunk-<id>.wav and assets/audio/vo/chunk-<id>.align.json.
import base64, json, os, re, subprocess, sys, urllib.error, urllib.request

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


def spoken(en):
    s = re.sub(r"\{([^|}]*)\|([^}]*)\}", r"\2", en)
    return s.replace("*", "").replace("“", '"').replace("”", '"')


def record(text):
    body = {"text": text, "model_id": voice["model"], "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice['id']}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps(body).encode(), headers={"xi-api-key": key(), "Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=300))
    except urllib.error.HTTPError as e:
        sys.exit(f"{e.code}: {e.read().decode()[:400]}")


wanted = [int(a) for a in sys.argv[1:]] or [c["id"] for c in script["chunks"]]
import whisper

model = whisper.load_model("small.en")
sys.stdout.reconfigure(encoding="utf-8")
for chunk in script["chunks"]:
    if chunk["id"] not in wanted:
        continue
    text = " ".join(spoken(l["en"]) for l in chunk["lines"])
    d = record(text)
    mp3 = os.path.join(OUT, f"chunk-{chunk['id']}.mp3")
    wav = mp3[:-4] + ".wav"
    open(mp3, "wb").write(base64.b64decode(d["audio_base64"]))
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", mp3, "-ar", "48000", "-ac", "1", wav], check=True)
    al = d.get("alignment") or {}
    json.dump({"text": text, "alignment": al}, open(mp3[:-4] + ".align.json", "w", encoding="utf-8"))
    heard = model.transcribe(wav, language="en")["text"].strip()
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).decode())
    print(f"chunk {chunk['id']} ({dur:.1f}s, {len(al.get('characters', []))} aligned chars)\n  sent:  {text}\n  heard: {heard}")
