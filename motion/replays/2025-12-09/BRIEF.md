---
workflow: general-video
flow: automation
storyboard: no
message: "策略 01 的四個步驟，在一筆真實的單裡怎麼一步步成立"
destination: threads
aspect: 1080x1920
language: zh-Hant
audience: 台灣幣圈交易者，想學訂單流策略的人
length: 96s
angle: real-data replay of one strategy-01 trade, following the lesson's strategy rail
voice: gemini-tts-charon
---

## Intent

策略 01「掃過前低，收回才算數」的第一部實戰覆盤。2025-12-09 下午比特幣跌破前一天低點後被收回，照課程的地點、事件、確認、執行四步，用真實資料呈現每一項指標怎麼變化、為什麼進場，最後打到兩個目標。分鏡已確認：[docs/REPLAY-2025-12-09-STORYBOARD.md](../../../docs/REPLAY-2025-12-09-STORYBOARD.md)。

## Assets

- `../../../.data/orderflow/btcusdt-oos.json` — 幣安 BTCUSDT 永續封存檔，`scripts/extract.mjs` 切出 `assets/data/replay.json`。
- `assets/img/badge.png` — MetaBear 正式 Logo（同 academy-film、highlights-live）。

## Customizations

- 視覺沿用策略 01 課程（`public/orderflow/motion/lessons/failed-auction.js`）的策略軌、勾選槽與證據卡。
- 不加顆粒、掃描線、倒帶等雜訊特效；電影感靠運鏡、推近、慢動作。
- 音效與配樂全部程式合成（`scripts/mix.mjs`）。
- 旁白：2026-10-13 使用者選定 Gemini TTS **Charon**（男聲，自然中音），導演指示用 `scripts/voice-samples.py` 第二輪的「沉穩解說」版本，**不做降音與胸腔共鳴處理**；Algenib 太低沉、Puck／Fenrir／Zephyr 太高亢。旁白分段生成，避免模型在開頭即興亂編。

## Notes

- 不講口號、不提回測、不談勝率與報酬金額；結尾只導向學院策略實戰 01 與 metabear.io（不加 LINE）。
- 第 9 段只呈現「一口氣衝上去」，不推測急漲原因。
- 片中所有數字都要能在分鏡文件的核對表找到出處。
- 依記憶：使用者曾表示 Gemini TTS 只用於非商業用途；公開發布前需再確認。

## 接續工作（2026-10-13 更新）

目前狀態：旁白三段都已用 Charon 錄好（第 2 段已換成確認一的新說法），`scripts/cues.mjs` 的時間與字幕已依 Whisper 逐字時間更新（`scripts/.vo-words.json`），片長 95.8 秒；第三版草稿預覽在 `../../out/drafts/replay-2025-12-09-preview-v3.mp4`。

下一步：使用者看過 v3 後，`npx --yes hyperframes@0.8.149 render` 出高畫質，再做 16:9。

改稿流程：改 `scripts/vo-script.txt` → `python scripts/voice.py <段>`（Gemini 免費配額一天約 5 次）→ 用 `whisper.load_model("small").transcribe(..., language="zh", word_timestamps=True)` 取逐字時間，更新 `cues.mjs` 的 `CHUNKS`、`RAW`、`CAPTIONS` → `node scripts/mix.mjs`、`node scripts/build.mjs`、`python scripts/subset-font.py` → `check` → `render`。

素材說明：`assets/audio/vo/1.wav`、`2.wav`、`3.wav` 進 Git（配額有限，避免重錄）；`soundtrack.wav` 與試聽樣本不進 Git，可重建。
