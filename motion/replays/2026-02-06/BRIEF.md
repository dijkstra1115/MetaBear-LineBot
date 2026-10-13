---
workflow: general-video
flow: automation
storyboard: no
message: "看懂盤面，比猜方向重要——六萬元那一分鐘的真實訂單流"
destination: threads
aspect: 1080x1920
language: zh-Hant
audience: 台灣幣圈交易者，看過或聽過訂單流但沒有系統學過的人
length: 64s
angle: real-data cinematic replay of one market event, narrated
voice: gemini-tts-algenib
---

## Intent

MetaBear 覆盤短片系列第一集，也是 [VISION.md](../../../docs/VISION.md) 路線圖第 1 階段的旗艦作品。用 2026-02-06 08:19（台灣時間）比特幣在 6 萬元掃到 59,800、隨即 V 型反彈的真實資料，拍成有質感、沉浸式、像電影的覆盤。結尾誠實交代回測結果：這些型態單獨使用沒有可交易優勢，所以我們分析、不喊單。

分鏡已由使用者確認：[docs/REPLAY-2026-02-06-STORYBOARD.md](../../../docs/REPLAY-2026-02-06-STORYBOARD.md)（第 4 段「六萬元的牆」是高潮；第 7 段保留回測結論）。

## Assets

- `../../../.data/orderflow/btcusdt-oos.json` — 幣安 BTCUSDT 永續封存檔（2025-10-17 至 2026-07-13），由 `scripts/extract.mjs` 切出 `assets/data/replay.json`。
- `../../audio-library/sfx/downloads/` — sub-drop、whoosh-deep、whoosh-bass-drop、ui-thud（複製進 `assets/audio/sfx/`，不進 Git）。

## Customizations

- 旁白：Gemini TTS（Algenib）繁中低沉男聲；導演指示用 Gemini TTS 的提示格式寫在朗讀稿前（模型不接受 system instruction），不會被唸出來；播放時加速 1.1 倍。
- 先出 9:16 低畫質預覽；確認後再出高畫質與 16:9 版本。

## Notes

- 2026-10-12 預覽回饋（暫不修改，之後的覆盤片都適用）：
  - 結尾不要講「所以我們分析，不喊單」這類口號，我們自己知道就好。
  - 不要提回測（見 [VISION.md](../../../docs/VISION.md) 原則 1）。
  - Logo 要用 MetaBear 正式 Logo，與過去的宣傳片一致（academy-film、highlights-live 用的 `assets/img/badge.png`），不要用手繪 SVG。
  - 方向調整：之後的覆盤片要以「策略」為主，挑該策略條件符合、照策略開單會獲利的真實案例，具體呈現該策略所用指標與資料的變化和判斷邏輯。這部片是原型，不再修改。

- 片中所有數字必須能在分鏡文件的「已核對的數字」表找到出處。當日沒有爆倉資料，不提爆倉金額。
- 視覺沿用學院語言：深墨底、薄荷綠＝買方、琥珀＝賣方、暖金＝重點；Barlow Condensed 數字、JetBrains Mono 標籤、Noto Sans TC 中文。
- 依記憶：使用者曾表示 Gemini TTS 只用於非商業用途；本片作為行銷內容發布前需再確認。
