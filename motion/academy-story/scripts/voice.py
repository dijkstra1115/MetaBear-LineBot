# Generates the narration with Gemini 3.8 Flash TTS (voice Algenib). The model has no system instruction, so the
# direction uses the director's-notes prompt layout with the script under a TRANSCRIPT heading; plain
# "Read this as…:" prefixes get read aloud. Writes assets/audio/vo-raw.wav.
# Usage: python scripts/voice.py   (needs GEMINI_API_KEY, e.g. from ../.env)
import base64, json, os, re, subprocess, sys, time, urllib.request, urllib.error

MODEL = "gemini-3.8-flash-tts"
VOICE = "Algenib"
DIRECTION = """# AUDIO PROFILE: The Narrator
A premium documentary narrator: very deep, low, resonant bass-baritone male voice, magnetic and velvety.

## THE SCENE
A quiet studio, close to the microphone, narrating a calm, high-end product film about a trading academy.

### DIRECTOR'S NOTES
Style: relaxed, intimate and assured, like a high-end product film; quiet confidence, never salesy. Low in the chest.
Pace: slow and unhurried. Short pause between sentences, a longer pause between paragraphs, and a held pause on "So we built..." before the name.
Speak only the transcript below, exactly as written.

#### TRANSCRIPT
"""
SCRIPT = open("scripts/vo-script.txt", encoding="utf-8").read().strip()

key = os.environ["GEMINI_API_KEY"]
body = {
    "contents": [{"parts": [{"text": DIRECTION + SCRIPT}]}],
    "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}}},
}
for attempt in range(6):
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                                 data=json.dumps(body).encode(), headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        d = json.load(urllib.request.urlopen(req, timeout=180))
        break
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        if e.code != 429 or "PerDay" in msg:
            sys.exit(f"{e.code}: {msg[:600]}")
        m = re.search(r'retryDelay": "(\d+)', msg)
        time.sleep(int(m.group(1)) + 2 if m else 30)
part = d["candidates"][0]["content"]["parts"][0]["inlineData"]
data = base64.b64decode(part["data"])
src = "assets/audio/vo-raw.bin"
open(src, "wb").write(data)
args = ["-i", src] if data[:4] == b"RIFF" else ["-f", "s16le", "-ar", "24000", "-ac", "1", "-i", src]
subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-ar", "48000", "assets/audio/vo-raw.wav"], check=True)
os.remove(src)
print("vo-raw.wav", subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "assets/audio/vo-raw.wav"], capture_output=True, text=True).stdout.strip(), "s")
