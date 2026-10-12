# Records the whole narration in one Gemini TTS call (voice Algenib, the MetaBear narrator).
# The model rejects system instructions, so the direction uses Gemini's TTS prompt layout
# (profile, scene, director's notes, then "#### TRANSCRIPT"), which it does not read aloud.
# Usage (from this folder): python scripts/voice.py   → assets/audio/vo-raw.wav
# Needs GEMINI_API_KEY in ../../.env (motion/.env).
import base64, json, os, sys, time, urllib.request, urllib.error

def load_key():
    for line in open("../../.env", encoding="utf-8"):
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("GEMINI_API_KEY missing in motion/.env")

DIRECTION = """# AUDIO PROFILE: The Narrator
A premium documentary narrator: very deep, low, resonant bass-baritone male voice, magnetic and velvety, speaking Taiwan Mandarin with natural Taiwanese pronunciation (not mainland broadcast style).

## THE SCENE
A quiet studio, close to the microphone, narrating a short cinematic film about one minute in the Bitcoin market.

### DIRECTOR'S NOTES
Style: cinematic and restrained; quiet tension in the middle, release near the end; never salesy. Low in the chest.
Pace: unhurried. A clear pause of about one second between paragraphs; short pauses at commas and full stops.
Read numbers exactly as written. Speak only the transcript below, exactly as written.

#### TRANSCRIPT
"""

text = open("scripts/vo-script.txt", encoding="utf-8").read().strip()
body = {
    "contents": [{"parts": [{"text": DIRECTION + text}]}],
    "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Algenib"}}}},
}
os.makedirs("assets/audio", exist_ok=True)
key = load_key()
for attempt in range(8):
    try:
        req = urllib.request.Request(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
            data=json.dumps(body).encode(), headers={"x-goog-api-key": key, "Content-Type": "application/json"})
        d = json.load(urllib.request.urlopen(req, timeout=300))
        break
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        if e.code not in (429, 503) or "PerDay" in msg:
            sys.exit(f"{e.code}: {msg[:400]}")
        print("busy, retrying in 40 s", flush=True)
        time.sleep(40)
else:
    sys.exit("gave up")
part = d["candidates"][0]["content"]["parts"][0]["inlineData"]
data = base64.b64decode(part["data"])
out = "assets/audio/vo-raw.wav"
if data[:4] != b"RIFF":
    # Raw 16-bit PCM: wrap it in a WAV header (rate from the mime type, default 24 kHz).
    import wave
    rate = int(part.get("mimeType", "rate=24000").split("rate=")[-1].split(";")[0] or 24000)
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(data)
else:
    open(out, "wb").write(data)
print("wrote", out, len(data), "bytes")
