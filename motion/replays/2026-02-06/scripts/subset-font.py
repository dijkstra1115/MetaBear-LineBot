# Re-subset Noto Sans TC (variable) to the glyphs the film uses. Run after copy edits and build.mjs.
# The full font lives in the ignored ../../flow-arena/promo/scripts/font-src/ folder.
import subprocess
chars = set()
for f in ["index.html", "scripts/template.html", "scripts/cues.mjs"]:
    chars |= set(open(f, encoding="utf-8").read())
chars |= set("0123456789,.+-−×$%?！？。，、·—–：｜ ")
text = "".join(sorted(c for c in chars if ord(c) >= 32))
open("scripts/.chars.txt", "w", encoding="utf-8").write(text)
subprocess.run(["pyftsubset", "../../flow-arena/promo/scripts/font-src/NotoSansTC-full.ttf", "--text-file=scripts/.chars.txt",
                "--output-file=assets/fonts/NotoSansTC-sub.ttf", "--layout-features=*"], check=True)
print("subset ok", len(text), "chars")
