# Re-subset Noto Sans TC (variable) to the glyphs the films use: every stretch's copy plus the
# template. Run after copy edits: python scripts/subset-font.py   (needs fonttools)
# FONT_SRC defaults to the Windows install of the variable font.
import glob, os, subprocess
src = os.environ.get("FONT_SRC", "C:/Windows/Fonts/NotoSansTC-VF.ttf")
chars = set()
for f in ["scripts/template.html", "scripts/segments.mjs", "scripts/extract.mjs"] + glob.glob("assets/data/*.json"):
    chars |= set(open(f, encoding="utf-8").read())
chars |= set("0123456789,.+-−×$%?！？。，、·—–：｜→ ")
text = "".join(sorted(c for c in chars if ord(c) >= 32))
open("scripts/.chars.txt", "w", encoding="utf-8").write(text)
subprocess.run(["pyftsubset", src, "--text-file=scripts/.chars.txt", "--output-file=assets/fonts/NotoSansTC-sub.ttf", "--layout-features=*"], check=True)
print("subset ok", len(text), "chars")
