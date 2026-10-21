# Re-subset Noto Sans TC (variable) to the glyphs the film uses. Run after copy edits and build.mjs.
# The full font lives in the ignored motion/flow-arena/promo/scripts/font-src/ folder of the main
# checkout; set FONT_SRC when running elsewhere.
import os, subprocess
src = os.environ.get("FONT_SRC", "../../flow-arena/promo/scripts/font-src/NotoSansTC-full.ttf")
chars = set()
for f in ["index.html", "scripts/template.html", "scripts/cues.mjs"]:
    chars |= set(open(f, encoding="utf-8").read())
chars |= set("0123456789,.+-−×$%?！？。，、·—–：｜→ ")
text = "".join(sorted(c for c in chars if ord(c) >= 32))
open("scripts/.chars.txt", "w", encoding="utf-8").write(text)
subprocess.run(["pyftsubset", src, "--text-file=scripts/.chars.txt", "--output-file=assets/fonts/NotoSansTC-sub.ttf", "--layout-features=*"], check=True)
print("subset ok", len(text), "chars")
