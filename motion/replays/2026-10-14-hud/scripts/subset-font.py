# Subset Noto Sans TC (variable) to the glyphs in index.html. Run after build.mjs: python scripts/subset-font.py
import os, subprocess
src = os.environ.get("FONT_SRC", "C:/Windows/Fonts/NotoSansTC-VF.ttf")
chars = set(open("index.html", encoding="utf-8").read()) | set("0123456789,.+-−×$%?！？。，、·—–：｜→ ")
text = "".join(sorted(c for c in chars if ord(c) >= 32))
open("scripts/.chars.txt", "w", encoding="utf-8").write(text)
subprocess.run(["pyftsubset", src, "--text-file=scripts/.chars.txt", "--output-file=assets/fonts/NotoSansTC-sub.ttf", "--layout-features=*"], check=True)
print("subset ok", len(text), "chars")
