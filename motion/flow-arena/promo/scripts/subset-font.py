# Re-subset Noto Sans TC (variable) to the glyphs the compositions use. Run after copy edits.
import glob, subprocess
chars = set()
for f in glob.glob("compositions/*.html"):
    chars |= set(open(f, encoding="utf-8").read())
chars |= set("0123456789,.+-−×$%?！？。，、·—–▲▼⚡👥⚔▶💥 ")
open("scripts/.chars.txt", "w", encoding="utf-8").write("".join(sorted(c for c in chars if ord(c) >= 32)))
subprocess.run(["pyftsubset", "scripts/font-src/NotoSansTC-full.ttf", "--text-file=scripts/.chars.txt",
                "--output-file=assets/fonts/NotoSansTC-sub.ttf", "--layout-features=*"], check=True)
print("subset ok")
