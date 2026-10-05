# Word-level timestamps for the narration (the pitch shift keeps timing, so align the raw take) with openai-whisper (local, CPU). Writes assets/audio/words.json.
# Usage: python scripts/align.py
import json, whisper
model = whisper.load_model("small.en")
r = model.transcribe("assets/audio/vo-raw.wav", language="en", word_timestamps=True, fp16=False,
                     initial_prompt=open("scripts/vo-script.txt", encoding="utf-8").read())
words = [{"w": w["word"].strip(), "s": round(w["start"], 3), "e": round(w["end"], 3)} for seg in r["segments"] for w in seg["words"]]
json.dump(words, open("assets/audio/words.json", "w"), indent=0)
print(" ".join(f"{w['w']}@{w['s']}" for w in words))
