# Re-subsets Noto Sans TC to the film's glyphs. Run after copy edits: python scripts/subset-font.py
# (needs fonttools). FONT_SRC defaults to the Windows install of the variable font.
import glob, os, subprocess, sys
src = os.environ.get("FONT_SRC", "C:/Windows/Fonts/NotoSansTC-VF.ttf")
chars = set()
for f in glob.glob("scripts/*.html") + glob.glob("scripts/*.js") + glob.glob("scripts/*.mjs"):
    chars |= set(open(f, encoding="utf-8").read())
chars |= set("0123456789,.+-−×$%?！？。，、·—–：｜→ ")
text = "".join(sorted(c for c in chars if ord(c) >= 32))
open("scripts/.chars.txt", "w", encoding="utf-8").write(text)
subprocess.run([sys.executable, "-m", "fontTools.subset", src, "--text-file=scripts/.chars.txt", "--output-file=assets/fonts/NotoSansTC-sub.ttf", "--layout-features=*"], check=True)
print("subset ok", len(text), "chars")
