# 遍歷性悖論與凱利公式（科普短片，9:16）

約 111 秒的直式科普片：一枚每把平均 +5% 的硬幣，為什麼全押會讓你幾乎一定歸零；集合平均與時間平均的差別；凱利公式（押 25%）怎麼把衰退變成成長。英文旁白（ElevenLabs Brian，eleven_v3，1.1 倍速），中英雙語字幕。

畫面是一個連續的 3D 世界：檯燈下的賭桌絨布、黃銅硬幣、陶土籌碼（一疊代表一個玩家）、印在絨布上的圖表。設計規格見 [SPEC.md](SPEC.md)，最後一輪檢查見 [REVIEW.md](REVIEW.md)。

## 數字從哪裡來

每個數字都出自 `assets/js/model.js`：1,000 名玩家、各丟 100 次，正反面用 Python `random.Random(0)` 產生（`scripts/sim.py` → `assets/data/sim.js`）。全押和押 25% 用的是同一組正反面。

| 數字 | 值 |
| --- | --- |
| 全押 100 次：全體平均／中位數 | $10,257／$0.52（870 人虧錢） |
| 最有錢的玩家 | $7,499,730，占全部財富 73.1% |
| 押 25%：全體平均／中位數 | $364／$186（702 人賺錢） |
| 典型（中位數）成長率 | 全押每把 −5.1%，押 50% 為 0%，押 25% 為 +0.62% |

## 製作流程（在本資料夾執行）

需要 Node.js 22+、Python（numpy、scipy、openai-whisper）、ffmpeg、`pyftsubset`，以及 `motion/.env` 的 `ELEVENLABS_API_KEY`。

```sh
python scripts/voice.py          # 錄旁白（花 ElevenLabs 額度；已錄好的 MP3 在 assets/audio/vo/）
python -I scripts/timeline.py    # 旁白排上時間軸 → assets/audio/vo.wav、assets/data/timeline.js
python -I scripts/sim.py         # 擲硬幣資料 → assets/data/sim.js
node scripts/build.mjs           # 打包 3D 世界、產生字幕、切中文字型
python -I scripts/score.py       # 配樂＋音效＋旁白混音 → assets/audio/soundtrack.wav（-14 LUFS）
npm run check
npm run render
```

`scripts/build.mjs` 也會匯出 `assets/data/beats.json`（旁白關鍵字時間），`scripts/score.py` 依它放音效，所以改了旁白要先 build 再混音。

## 檔案

| 位置 | 內容 |
| --- | --- |
| `src/world-src.js` | 3D 世界與畫面上的標籤（`scripts/build.mjs` 打包成 `assets/js/world.js`） |
| `assets/js/beats.js` | 旁白關鍵字的時間點，畫面與音效都依它對齊 |
| `compositions/world.html` | 3D 畫布與標籤的樣式 |
| `compositions/captions.html` | 由 build 產生的字幕，不要手改；樣式在 `scripts/captions.template.html` |
| `compositions/share.html` | 結尾分享卡 |
| `assets/audio/sfx/` | 從 `motion/audio-library/sfx/downloads/` 複製的下載音效，不進 Git |

ElevenLabs 免費方案只能非商業使用並需標示來源；正式發布前請確認授權。
