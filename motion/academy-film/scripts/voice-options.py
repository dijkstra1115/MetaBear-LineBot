# Generates alternative narration takes (no pitch shifting) for the user to choose from.
# Retries on 503/429 with a pause. Writes ../out/voice-samples/v2/<take>.wav and .mp3.
# Usage: python scripts/voice-options.py   (needs GEMINI_API_KEY from ../.env)
import base64, json, os, subprocess, sys, time, urllib.request, urllib.error

key = os.environ["GEMINI_API_KEY"]
script = open("scripts/vo-script.txt", encoding="utf-8").read().strip()
D = """# AUDIO PROFILE: The Narrator
{profile}

## THE SCENE
A quiet, treated studio. The narrator is very close to the microphone, speaking softly for a premium brand film about a trading academy.

### DIRECTOR'S NOTES
Style: {style}
Pace: slow and unhurried, with a short pause between sentences, a longer pause between paragraphs, and a held pause after "So we built...".
Speak only the transcript below, exactly as written.

#### TRANSCRIPT
"""
TAKES = {
    "A-algenib-deeper": ("Algenib", "A naturally deep, low-pitched bass-baritone man in his late forties. Warm chest resonance, velvety and slightly gravelly.",
                         "speak from the chest at the bottom of your natural range; intimate, magnetic, calm and assured, never salesy, never breathy."),
    "C-gacrux": ("Gacrux", "A mature, deep-voiced man in his fifties with a rich, resonant low register.",
                 "intimate, magnetic and calm; quiet authority, never salesy; low and warm."),
}
out = "../out/voice-samples/v2"
os.makedirs(out, exist_ok=True)
for name in sys.argv[1:] or TAKES:
    if os.path.exists(f"{out}/{name}.wav"):
        continue
    voice, prof, style = TAKES[name]
    body = {"contents": [{"parts": [{"text": D.format(profile=prof, style=style) + script}]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
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
                print(name, e.code, msg[:200])
                break
            print(name, e.code, "retrying in 60 s", flush=True)
            time.sleep(60)
    if not d:
        continue
    open(f"{out}/{name}.wav", "wb").write(base64.b64decode(d["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{out}/{name}.wav", "-b:a", "192k", f"{out}/{name}.mp3"], check=True)
    print(name, "ok", flush=True)
