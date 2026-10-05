# 互動學院 · 極簡旁白版（HyperFrames）

26.8 秒、16:9。參考 `../aether.mp4` 的做法：「問題 → 解法 → 示範 → 收尾」、黑底單一薄荷光暈、小而細的字只打旁白關鍵詞、重新繪製的乾淨 UI、全程溶接不硬切；聲音是低沉旁白＋持續低頻音墊＋少數重擊，沒有配樂。

## 流程（在這個資料夾內）

1. `python scripts/voice.py`：Gemini 3.8 Flash TTS（Algenib）依 `scripts/vo-script.txt` 生成 `assets/audio/vo-raw.wav`（需要 `../.env` 的 `GEMINI_API_KEY`）。
2. `python scripts/align.py` → `assets/audio/words.json`；重生旁白後要更新 `scripts/cues.mjs`。
3. `node scripts/build.mjs` → `index.html`、`assets/audio/sfx.json`。
4. `node scripts/mix.mjs` → `assets/audio/soundtrack.wav`：旁白在混音時降 0.85 倍音高（約 −2.8 半音，保留共振峰）、加溫暖度與壓縮，疊上 F2 音墊與合成音效，整體約 -16 LUFS。
5. `python scripts/subset-font.py`（改字後），`npm run check`，`npm run render`。

畫面全部是 HTML／SVG 繪製，沒有錄影素材。
