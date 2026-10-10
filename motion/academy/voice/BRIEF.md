---
workflow: general-video
flow: automation
storyboard: no
message: "MetaBear Academy takes the market apart: short lessons you can pause, rewind and check against real events — then test in FLOW ARENA."
destination: youtube / 網站
aspect: 1920x1080
language: en (narration), zh-Hant UI labels
audience: 對加密合約、訂單流有興趣的交易學習者
length: ~43s (driven by the narration)
angle: calm, premium voiceover explainer; no music
---

## Intent

使用者：另一種風格的影片，沒有背景音樂，低沉磁性的男聲旁白，搭配程式合成的特效聲，專業沉穩。可以有 motion graphic。
盡量聚焦在學院，FLOW ARENA 在最後出現。不要字幕。

## Assets

- 旁白：Gemini 3.8 Flash TTS，聲音 Algenib（使用者在試聽後選定），`scripts/voice.py` 生成 `assets/audio/vo-raw.wav`；
  `scripts/align.py` 用本機 whisper 取字詞時間戳。旁白稿 `scripts/vo-script.txt`。
- 課程畫面：`scripts/capture.mjs` 錄真實課程（足跡圖、真實盤面上的訂單塊、回調縮量的四張證據卡）；`scripts/stills.mjs` 每堂課一張截圖。
- 沿用 `../drop/assets/video/` 的 open（播放器回拖）與 main（FLOW ARENA 沙盤）。

## Customizations

- 所有動畫對齊旁白字詞時間（不是音樂拍點）；旁白在影片 0.6 秒開始。
- 音效全部程式合成（`scripts/mix.mjs`）：細碎資料聲、點擊、低頻 hit、whoosh、確認音；旁白輕微壓縮與低頻溫暖。
- 視覺沿用學院深色介面＋薄荷綠，動作放慢、留白多；UI 標註用等寬字。

## Notes

- 不出現字幕；收尾的「看見過程，才讀得懂市場。」是學院本來的標語，當作品牌字卡。
- 只講學院真的有的內容：23 堂、每堂約 30 秒、暫停回拖、真實 BTC 事件復盤（2026.07.02 60,800 賣牆）、四個證據的確認卡。
- 非商用（使用者說明）；Gemini 免費層。
