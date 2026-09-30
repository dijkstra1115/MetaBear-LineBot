# Writes index.html from the scene list (single source of scene timing).
import json,sys
SCENES=[("s1-hook",0,5),("s2-title",5,3),("s9-howto",8,12),("s3-absorb",20,9),("s4-breakout",29,9),("s5-chain",38,11),("s6-pvp",49,7),("s8-result",56,5.5),("s7-cta",61.5,6)]
import os
SCENES=[s for s in SCENES if os.path.exists(f"compositions/{s[0]}.html")]
DUR=max(s[1]+s[2] for s in SCENES)
CUTS=[s[1] for s in SCENES[1:]]
hosts="\n".join(f'''      <div id="{sid}" class="scene" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{st}" data-duration="{du}" data-track-index="1" data-width="1920" data-height="1080"></div>''' for sid,st,du in SCENES)
audio=""
if os.path.exists("assets/audio/soundtrack.wav"):
    audio+=f'''      <audio id="soundtrack" src="assets/audio/soundtrack.wav" data-start="0" data-duration="{DUR}" data-track-index="5" data-volume="1"></audio>
'''
html=f'''<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {{
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }}
      html,
      body {{
        margin: 0;
        width: 1920px;
        height: 1080px;
        overflow: hidden;
        background: #08121b;
      }}
      #root {{
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #08121b;
      }}
      .scene {{
        position: absolute;
        inset: 0;
      }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{DUR}" data-width="1920" data-height="1080">
{hosts}
      <div id="fx-overlay" class="scene" data-composition-id="fx-overlay" data-composition-src="compositions/fx-overlay.html" data-start="0" data-duration="{DUR}" data-track-index="2" data-width="1920" data-height="1080"></div>
{audio}    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
'''
import re
fx=open("compositions/fx-overlay.html",encoding="utf-8").read()
fx=re.sub(r"const DUR = [^;]*; // @build",f"const DUR = {DUR}; // @build",fx)
fx=re.sub(r"const CUTS = [^;]*; // @build",f"const CUTS = {CUTS}; // @build",fx)
open("compositions/fx-overlay.html","w",encoding="utf-8").write(fx)
open("index.html","w",encoding="utf-8").write(html)
print("index:",DUR,"s", [s[0] for s in SCENES])
