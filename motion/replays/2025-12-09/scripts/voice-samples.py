# Short samples of candidate voices for the narration (the deep Algenib narrator did not fit).
# Usage: python scripts/voice-samples.py Puck Fenrir Zephyr   → assets/audio/voices/<name>.wav
import base64, json, sys, time, urllib.request, urllib.error

def key():
    for line in open("../../.env", encoding="utf-8"):
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()

# Round 1 (Puck, Fenrir, Zephyr) asked for an energetic young host and came out too high.
# Round 2 asks for a calm, natural mid-range male voice.
DIRECTION = """# AUDIO PROFILE: The Analyst
A natural, mid-range adult male voice, speaking Taiwan Mandarin with natural Taiwanese pronunciation: calm, clear and confident, like an experienced trader explaining a chart to a friend. Neither deep and dramatic nor high and excited.

## THE SCENE
A short vertical video about one real Bitcoin trade, watched on a phone.

### DIRECTOR'S NOTES
Style: relaxed and conversational, quietly sure of himself; a light lift on the opening question, then steady and precise on the numbers.
Pace: natural speaking pace, short pauses at punctuation.
Start directly with the first word of the transcript. Speak only the transcript below, exactly as written, nothing before or after it.

#### TRANSCRIPT
"""
TEXT = "跌破前低，反而是做多的訊號？確認一：十五分鐘內，未平倉量少了一千零七十一顆。"
for name in sys.argv[1:]:
    body = {"contents": [{"parts": [{"text": DIRECTION + TEXT}]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": name}}}}}
    for attempt in range(6):
        try:
            req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent",
                                         data=json.dumps(body).encode(), headers={"x-goog-api-key": key(), "Content-Type": "application/json"})
            d = json.load(urllib.request.urlopen(req, timeout=180))
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode()
            if e.code not in (429, 503) or "PerDay" in msg:
                sys.exit(f"{name}: {e.code}: {msg[:300]}")
            time.sleep(40)
    data = base64.b64decode(d["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
    open(f"assets/audio/voices/{name}.wav", "wb").write(data)
    print("wrote", name, len(data))
