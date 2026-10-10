# 互動學院 · 對拍宣傳片（HyperFrames）

31 秒、16:9、60 fps。配樂是使用者提供的「MONTAGEM PEGADORA (Slowed)」，剪接、字與轉場全部對在 100.06 BPM 的拍點上，主 drop 落在全曲最重的 808。意圖與分鏡見 [BRIEF.md](BRIEF.md)、[STORYBOARD.md](STORYBOARD.md)。

## 流程（在這個資料夾內）

1. `node scripts/capture.mjs [all|open,end,map,m-…]`：用虛擬時鐘逐格錄真實課程頁（需 repo 根目錄 `npm run preview:academy`）。課程錄影時保持靜音，否則播放器改用音訊時鐘、會以實際時間快轉。
2. FLOW ARENA 實機段落沿用 `../../flow-arena/surge/assets/video/` 的 main／reveal／ranked（mp4 與 json 一起複製到 `assets/video/`）。
3. `node scripts/build.mjs`：依剪輯表產生 `index.html` 與 `assets/audio/cues.json`。
4. `node scripts/music.mjs`：歌曲整體降 20 dB、剪接歌曲（第 0–1 小節接第 5 小節，再接 6–15 小節）、壓低 drop 前一拍、混入點擊與漸強，輸出 `assets/audio/soundtrack.wav`。
5. `python scripts/subset-font.py`：改字後重新裁切 Noto Sans TC（完整字型在 `../../flow-arena/promo/scripts/font-src/`）。
6. `npm run check`，`npm run render`。

拍點常數都在 `scripts/grid.mjs`；改節奏從那裡改。

## 不進 Git

歌曲 `assets/audio/song.mp3`、含歌曲的 `soundtrack.wav`、所有錄影 mp4，以及 renders/、snapshots/ 等輸出（見 `.gitignore`）。
