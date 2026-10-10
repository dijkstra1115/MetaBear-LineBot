# Re-records only the opening sentence (same voice and direction as the full take) so it can be spliced into
# vo-raw.wav without regenerating the rest. Writes assets/audio/takes/line1-<n>.wav for n takes.
# Usage: python scripts/voice-line.py [takes]   (needs GEMINI_API_KEY from ../../.env)
import base64, json, os, sys, time, urllib.request, urllib.error

LINE = "Reading the market was never meant to feel... fragmented."
DIRECTION = """# AUDIO PROFILE: The Narrator
A premium documentary narrator: very deep, low, resonant bass-baritone male voice, magnetic and velvety.

## THE SCENE
A quiet studio, close to the microphone, narrating a calm, high-end product film about a trading academy.

### DIRECTOR'S NOTES
Style: relaxed, intimate and assured, like a high-end product film; quiet confidence, never salesy. Low in the chest.
Pace: slow and unhurried, then a short, deliberate pause before the last word, "fragmented", which lands softly.
Speak only the transcript below, exactly as written.

#### TRANSCRIPT
"""
key = os.environ["GEMINI_API_KEY"]
os.makedirs("assets/audio/takes", exist_ok=True)
n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
body = {
    "contents": [{"parts": [{"text": DIRECTION + LINE}]}],
    "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Algenib"}}}},
}
for k in range(1, n + 1):
    d = None
    for attempt in range(12):
        try:
            req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
                                         data=json.dumps(body).encode(), headers={"x-goog-api-key": key, "Content-Type": "application/json"})
            d = json.load(urllib.request.urlopen(req, timeout=180))
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode()
            if e.code not in (429, 503) or "PerDay" in msg:
                sys.exit(f"{e.code}: {msg[:300]}")
            print("busy, retrying in 40 s", flush=True)
            time.sleep(40)
    if not d:
        continue
    open(f"assets/audio/takes/line1-{k}.wav", "wb").write(base64.b64decode(d["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]))
    print("take", k, flush=True)
