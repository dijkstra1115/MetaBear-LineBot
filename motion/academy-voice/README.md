# 互動學院 · 旁白版（HyperFrames）

約 43.5 秒、16:9。沒有配樂：Gemini 3.8 Flash TTS 的低沉男聲旁白（Algenib）＋程式合成的音效；所有動畫對齊旁白字詞時間。意圖見 [BRIEF.md](BRIEF.md)。

## 流程（在這個資料夾內）

1. `python scripts/voice.py`：依 `scripts/vo-script.txt` 生成旁白 `assets/audio/vo-raw.wav`（需要 `../.env` 的 `GEMINI_API_KEY`）。這個模型沒有 system instruction；語氣指示用「導演筆記」格式放在稿子前面，否則會被念出來。
2. `python scripts/align.py`：本機 whisper 取字詞時間 → `assets/audio/words.json`；重生旁白後要更新 `scripts/cues.mjs`。
3. `node scripts/capture.mjs all`、`node scripts/stills.mjs`：錄課程片段與每堂課截圖（需 repo 根目錄 `npm run preview:academy`）。open／main 兩段沿用 `../academy-drop/assets/video/`。
4. `node scripts/build.mjs` → `index.html` 與 `assets/audio/sfx.json`；`node scripts/mix.mjs` → `assets/audio/soundtrack.wav`。
5. `python scripts/subset-font.py`（改字後），`npm run check`，`npm run render`。

## 不進 Git

錄影 mp4、混音 `soundtrack.wav`，以及 renders/、snapshots/ 等輸出（見 `.gitignore`）。旁白 `vo-raw.wav` 進 Git：重新生成每次都不一樣，時間點會跑掉。
