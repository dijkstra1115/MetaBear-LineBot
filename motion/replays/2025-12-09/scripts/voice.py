# Records the narration with Gemini TTS (voice Charon, the calm analyst direction the user chose)
# in short chunks: a long script once made the model improvise a minute of its own first.
# Each chunk is transcribed with Whisper and rejected if it does not start with its own text.
# Usage (from this folder): python scripts/voice.py [chunk numbers…]   → assets/audio/vo/<n>.wav
import base64, json, sys, time, urllib.request, urllib.error

VOICE = "Charon"
DIRECTION = """# AUDIO PROFILE: The Analyst
A natural, mid-range adult male voice, speaking Taiwan Mandarin with natural Taiwanese pronunciation: calm, clear and confident, like an experienced trader explaining a chart to a friend. Neither deep and dramatic nor high and excited.

## THE SCENE
A short vertical video about one real Bitcoin trade, watched on a phone.

### DIRECTOR'S NOTES
Style: relaxed and conversational, quietly sure of himself; a light lift on questions, then steady and precise on the numbers.
Pace: natural speaking pace, short pauses at punctuation, about one second between paragraphs.
Start directly with the first word of the transcript. Speak only the transcript below, exactly as written, nothing before or after it.

#### TRANSCRIPT
"""

def key():
    for line in open("../../.env", encoding="utf-8"):
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()

paras = [p.strip() for p in open("scripts/vo-script.txt", encoding="utf-8").read().split("\n\n") if p.strip()]
# Three chunks: hook + location + event; the four confirmations; execution, wait and close.
CHUNKS = [paras[0:3], paras[3:7], paras[7:10]]
wanted = [int(a) for a in sys.argv[1:]] or [1, 2, 3]
import whisper
model = whisper.load_model("small")
for n in wanted:
    text = "\n\n".join(CHUNKS[n - 1])
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
    out = f"assets/audio/vo/{n}.wav"
    open(out, "wb").write(base64.b64decode(d["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]))
    heard = model.transcribe(out, language="zh", initial_prompt="以下是繁體中文旁白。")["text"]
    print(f"chunk {n}: {heard[:40]}…")
