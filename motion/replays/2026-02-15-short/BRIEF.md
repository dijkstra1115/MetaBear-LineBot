---
workflow: general-video
flow: automation
storyboard: no
message: "一段真實行情裡，策略照規則開的每一筆單"
destination: threads, reels, shorts
aspect: 1080x1920
language: zh-Hant
audience: 刷短影音的台灣幣圈交易者
length: 29s
angle: fast bar-by-bar chart replay, trades pop up with target and stop
voice: none
---

## Intent

短影音版的覆盤（2026-10-21 使用者回饋）：畫面像一般看盤軟體，K 棒一根接一根快速出現（不模擬單根成形），突然跳出開單提示、拉出目標和停損，然後打到目標或停損。文字只有交易標籤和每筆一句極短字幕，沒有旁白，配音樂和音效；角落 logo，結尾引導加入 LINE 官方帳號。

## 選段規則

- `scripts/replay-cases/scan-abc.mjs` 用課程門檻跑策略 A（01 失敗拍賣）、B（02 同一道支撐，守住或翻轉）、C（03 回調縮量），門檻在選段前固定，不為了某一段調整。
- 片中那段行情裡，這三個策略開的**每一筆單都會出現**，沒有藏單；前後一筆都在畫面外。
- 這段剛好 4 筆，1 筆停損；目標一律是 1R（A 用前日 POC）。
- 使用者要求含一筆停損；片中不寫勝率、累計報酬，也不用「自動交易」「機器人」等字。

## 內部統計（不對外，VISION 原則 1）

2025-10-17 至 2026-10-11 的幣安 1 分 K：A 8 筆（1 勝 7 負）、B 455 筆（225 勝 230 負）、C 53 筆（22 勝 31 負），1R 目標、未扣手續費。照目前寫法看不出優勢；這支片呈現的是挑出的一段，不代表策略會賺錢。

## Assets

- `assets/data/replay.json`：`scripts/extract.mjs` 從 `../../../.data/orderflow/btcusdt-oos.json` 切出（2026-02-15 02:20–21:55 台灣時間，前 60 根開場就在畫面上）。
- `assets/audio/song.mp3`：〈Raya (Sped Up)〉，使用者提供、已取得授權（見 `motion/audio-library/README.md`），不進 Git；`scripts/mix.mjs` 讓副歌落在最後一筆停利。
- 音效：`motion/audio-library/sfx/` 的 ui-3-pop（開單）、ui-5-glass（停利）、ui-thud＋sub-drop（停損）、whoosh-deep（結尾卡），不進 Git。
- Logo：`assets/img/badge.png`（正式 Logo，與 academy-film 相同）。

## 重建

```sh
node scripts/extract.mjs      # 需要先跑 scan-abc.mjs
node scripts/build.mjs
FONT_SRC=<NotoSansTC-full.ttf> python scripts/subset-font.py
node scripts/mix.mjs
npm run render
```
