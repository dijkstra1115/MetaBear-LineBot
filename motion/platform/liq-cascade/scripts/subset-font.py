# Subsets Noto Sans TC to the film's glyphs: python scripts/subset-font.py (needs fonttools).
# FONT_SRC defaults to the variable font kept in the repo's ignored .cache/fonts/
# (github.com/google/fonts ofl/notosanstc, OFL).
import glob, os, subprocess, sys
src = os.environ.get("FONT_SRC", "../../../.cache/fonts/NotoSansTC-VF.ttf")
chars = set()
for f in glob.glob("scripts/*.html") + glob.glob("scripts/*.mjs") + glob.glob("scripts/*.json"):
    chars |= set(open(f, encoding="utf-8").read())
chars |= set("0123456789,.+-−×$%?！？。，、·・—–：｜→◀ ")
text = "".join(sorted(c for c in chars if ord(c) >= 32))
open("scripts/.chars.txt", "w", encoding="utf-8").write(text)
subprocess.run([sys.executable, "-m", "fontTools.subset", src, "--text-file=scripts/.chars.txt", "--output-file=assets/fonts/NotoSansTC-sub.ttf", "--layout-features=*"], check=True)
print("subset ok", len(text), "chars")
