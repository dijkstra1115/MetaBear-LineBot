# 互動學院 · 品牌旁白片（HyperFrames）

約 27 秒、16:9、60 fps。參考 `../aether.mp4` 的品牌片做法：同一個 3D 空間裡一台連續移動的攝影機（不用景深與動態模糊，遠近靠大小與明暗；飛行時輕微滾轉，結尾繞著課程牆環繞）、WebGL 流動光帶（會回應重擊）、重新繪製且會動的產品介面（玻璃反光、自動完成、課程進度列依真實章節播放）；沒有配樂，只有旁白、低頻音墊與少數低音音效。成品在 `../out/academy-film.mp4`（不進 Git）。

語言規則：旁白與跟著旁白的大字用英文；學院介面用中文；開場的指標與喊單卡片維持英文（外面的雜訊）。

## 流程（在這個資料夾內）

1. 旁白：`scripts/vo-script.txt`。整條是 Gemini 3.8 Flash TTS（Algenib）的 `assets/audio/vo-raw.wav`；第一句另外用 `python scripts/voice-line.py` 重錄（`assets/audio/takes/`），在混音時接到原本那條 4.12 秒之後，並剪短「fragmented」前的停頓（`scripts/cues.mjs` 的 `SPLICE`）。人聲處理鏈在 `VOICE_FX`（降半個半音、胸腔共鳴 EQ、壓縮），`bash scripts/voice-lab.sh` 可試聽其他處理。需要 `../.env` 的 `GEMINI_API_KEY`。
2. 字詞時間在 `scripts/cues.mjs`（whisper 與靜音偵測），改旁白後要更新。
3. `node scripts/build.mjs`：由 `scripts/template.html`、`scripts/timeline.js` 產生 `index.html` 與 `assets/audio/sfx.json`。
4. `node scripts/mix.mjs`：旁白（溫暖化、壓縮）＋音墊＋音效 → `assets/audio/soundtrack.wav`，約 -16 LUFS。
5. `python scripts/subset-font.py`（改字後），`npm run check`，`npm run render -- -q delivery -f 60`。

音效：`assets/audio/sfx/` 是使用者提供的下載音效（sub-drop、whoosh-deep、whoosh-bass-drop、ui-thud、ui-connection），只放本機、不進 Git；`scripts/sfx-lab.mjs` 是試做音效的實驗台。課程截圖 `assets/img/lessons/` 來自 `../academy-voice/scripts/stills.mjs`。
