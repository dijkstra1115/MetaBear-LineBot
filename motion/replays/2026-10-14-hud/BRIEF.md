---
workflow: hyperframes
flow: automation
storyboard: yes
message: "到關鍵價位、出現堆疊才開單，停損也照放"
destination: threads、reels、shorts
aspect: 1080x1920
language: zh-Hant
audience: 刷短影音的台灣幣圈交易者
length: 約 55–58s
angle: 戰術鎖定 HUD；一日作戰紀錄，一鏡到底
voice: none
music: Raya (Sped Up)，使用者提供、已授權，不進 Git
---

## Intent

2026-11-04 使用者要一段十月的連續交易，約 10 筆、至少 7 勝，策略可以混用，做成「很熱血、很燃」的動畫，每一筆都要交代開單邏輯；背景音樂用 Raya，不要沿用現有寫實覆盤片的風格。選定 2026-10-14（台北）一整天：關鍵價位三個家族（[REPLAY-CASES-2026-10-MERGED.md](../../../docs/REPLAY-CASES-2026-10-MERGED.md)）一次一張單開了 11 筆，7 止盈 4 停損，整天每一筆都在片裡，不是挑邊界。

視覺方向（使用者選）：戰術鎖定 HUD；故事線（使用者選）：A「一日作戰紀錄」，見 [STORYLINES.md](STORYLINES.md)；規格見 [SPEC.md](SPEC.md)，分鏡見 [STORYBOARD.md](STORYBOARD.md) 與 `boards/storyboard.html`。

依 [VISION.md](../../../docs/VISION.md)：真實數據、每筆都畫停損、片尾「非投資建議」、不寫勝率與總 R；停損和止盈同樣節奏與大小。

## 重建

需要 Node 22（HyperFrames）、python（fonttools）。先在 repo 根目錄跑 `scripts/strategy-research/export.mjs` 與 `october-list.mjs --merged`。

```sh
node scripts/extract.mjs          # → assets/data/day.json
node scripts/build.mjs            # → index.html（由 scripts/template.html 產生，不要直接改 index.html）
python scripts/subset-font.py     # 改過文字後
cp ../../audio-library/music/raya-sped-up.mp3 assets/audio/raya.mp3
npx --yes hyperframes@0.9.11 render -q delivery -o ../../out/replay-2026-10-14-hud.mp4
```
