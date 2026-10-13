# Records the narration with Gemini TTS, voice Charon, with the calm-analyst direction the user chose
# for the course film (motion/replays/2025-12-09/scripts/voice.py, used in its preview v2), plus notes
# for more feeling and natural beats before each conclusion (2026-10-13: the first take ran flat and fast).
# Scenes are recorded in the chunks of scripts/script.mjs (a long script once made the model improvise
# a minute of its own first); each take is transcribed so an improvised opening is caught.
# Usage (from this folder): python scripts/voice.py [chunk numbers…]  → assets/audio/vo/chunk-<n>.wav
# Then: python scripts/split-vo.py  (per-scene files and character timings for scripts/cues.mjs)
import base64, json, subprocess, sys, time, urllib.error, urllib.request

VOICE = "Charon"
DIRECTION = """# AUDIO PROFILE: The Analyst
A natural, mid-range adult male voice, speaking Taiwan Mandarin with natural Taiwanese pronunciation: calm, clear and confident, like an experienced trader explaining a chart to a friend. Neither deep and dramatic nor high and excited.

## THE SCENE
A short vertical video about one real Bitcoin trade, watched on a phone.

### DIRECTOR'S NOTES
Style: relaxed and conversational, quietly sure of himself, and genuinely engaged, like telling a friend about a trade that surprised him. Open with a curious, slightly incredulous question. Let each conclusion land: after a colon, take a short breath, then reveal it with quiet conviction.
Pace: unhurried; say the numbers clearly and a touch slower; natural pauses at every comma and full stop, about one second between paragraphs.
Start directly with the first word of the transcript. Speak only the transcript below, exactly as written, nothing before or after it.

#### TRANSCRIPT
"""


def key():
    for line in open("../../.env", encoding="utf-8"):
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()


script = json.loads(subprocess.check_output(["node", "-e", "import('./scripts/script.mjs').then(m=>process.stdout.write(JSON.stringify(m)))"]).decode("utf-8"))
say = {s["id"]: s["say"] for s in script["SCENES"]}
wanted = [int(a) for a in sys.argv[1:]] or list(range(1, len(script["CHUNKS"]) + 1))
import whisper

model = whisper.load_model("small")
for n in wanted:
    text = "\n\n".join(say[i] for i in script["CHUNKS"][n - 1])
    body = {"contents": [{"parts": [{"text": DIRECTION + text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}}}}
    for attempt in range(6):
        try:
            req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
                                         data=json.dumps(body).encode(), headers={"x-goog-api-key": key(), "Content-Type": "application/json"})
            d = json.load(urllib.request.urlopen(req, timeout=300))
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode()
            if e.code not in (429, 503) or "PerDay" in msg:
                sys.exit(f"chunk {n}: {e.code}: {msg[:300]}")
            time.sleep(40)
    out = f"assets/audio/vo/chunk-{n}.wav"
    open(out, "wb").write(base64.b64decode(d["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]))
    heard = model.transcribe(out, language="zh", initial_prompt="以下是繁體中文旁白。")["text"]
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"chunk {n}: {heard}")
