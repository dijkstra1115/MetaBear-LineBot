# Word times of every narration take (assets/audio/vo/chunk-<id>.wav → assets/audio/vo/words.json),
# so a cut or a lab step can land on a spoken word ("hits", "Four", "Short").
# Usage (from this folder): python scripts/words.py
import json, os, sys
import whisper

HERE = os.path.dirname(os.path.abspath(__file__))
VO = os.path.join(os.path.dirname(HERE), "assets", "audio", "vo")
script = json.load(open(os.path.join(HERE, "script.json"), encoding="utf-8"))
model = whisper.load_model("small")
out = {}
for chunk in script["chunks"]:
    r = model.transcribe(os.path.join(VO, f"chunk-{chunk['id']}.wav"), language="en", word_timestamps=True)
    out[chunk["id"]] = [[w["word"].strip(), round(w["start"], 2), round(w["end"], 2)] for s in r["segments"] for w in s["words"]]
json.dump(out, open(os.path.join(VO, "words.json"), "w", encoding="utf-8"), indent=0)
sys.stdout.reconfigure(encoding="utf-8")
for k, v in out.items():
    print(k, " ".join(f"{w}@{a}" for w, a, _ in v))
