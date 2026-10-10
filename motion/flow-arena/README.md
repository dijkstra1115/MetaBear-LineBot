# FLOW ARENA 宣傳片（HyperFrames）

FLOW ARENA 宣傳影片的原始專案。launch／gameplay／promo／trailer／surge／surge-916 是 HyperFrames 專案；flagship 是自己的程式化管線（Canvas 2D + CPU 後製 + 合成配樂）。每個資料夾都能獨立預覽與渲染；需要 Node.js 22+。

| 專案 | 內容 | 規格 |
| --- | --- | --- |
| launch/ | 第一版上市 sizzle：爆倉熱圖、推價、連環強平（英文） | 16:9，約 45 秒 |
| gameplay/ | 第二版玩法 reel：下大單、假突破、連環爆倉、冰山試探、反手，含 3D 翻轉與實機結算（英文） | 16:9，60 秒 |
| promo/ | 第三版繁中宣傳片：限價吸收、薄簿突破、連環爆倉、好友對戰，加實機玩法錄影與結算 | 16:9，67.5 秒 |
| trailer/ | 第四版高能預告：現役沙盤（/arena/）逐格實機錄影為主，5,000 BTC 推價引爆 MEGA CASCADE、變速、三分割、動態字與 UI 標註（繁中＋英文） | 16:9，45 秒，60fps |
| surge/ | 第五版音樂剪輯片：授權歌曲「Raya (Sped Up)」，米白紙張編輯風格＋浮空 3D 螢幕；安靜段（25–33 秒）去飽和、低通下沉、3·2·1，剪進全曲最重一拍引爆空單 LIQUIDATION STORM | 16:9，53.5 秒，60 fps |
| surge-916/ | surge 的 9:16 直式版：同一段歌曲剪法與鏡頭，版面重排成直式卡片、上下分割與三條橫帶，文字留在 Shorts／Reels 安全區內 | 9:16，53.5 秒，60 fps |
| highlights/ | 排行榜前三名精彩重播：從 D1 抓種子與操作紀錄，用 `public/arena/engine` 逐秒重播三局再畫成影片（運動轉播即時重播包裝），配使用者提供的歌曲；主軸是「帳面不是錢，平倉才是」 | 16:9，78 秒 |
| highlights-live/ | highlights 的真實畫面版：在真實的 /arena/ 頁面照排行榜紀錄逐秒重播三局並錄影，事件剪在拍點上，節奏更緊湊 | 16:9，48.3 秒，60 fps |
| highlights-raya/ | highlights-live 的 Raya 版：同一批真實對局錄影與字卡，改用「Raya (Sped Up)」重新對拍（原曲第 0–11 小節 → 第 15 小節 → 第 20 小節之後） | 16:9，47.9 秒，60 fps |
| [flagship/](flagship/README.md) | 正式上線旗艦廣告（現行沙盤）：人群與燃料、推價與冰山、計畫／揭曉／執行、五級連環強平、帳本守恆、排名賽（英文主標、繁中副標） | 16:9，60 秒，60 fps |

各專案的意圖與分鏡在自己的 BRIEF.md、STORYBOARD.md。專案內的 `id`／`name`（meta.json、package.json）仍是原本的 `flow-arena-launch` 等。

## 常用指令（launch／gameplay／promo／trailer／surge／surge-916，在專案資料夾內；flagship 見它的 README）

```powershell
npm run dev      # Studio 預覽
npm run check    # lint + 版面 + 對比
npm run render   # 輸出到 renders/
```

promo 另有：

- `node scripts/audio.mjs`：依各場景的 cue 重新合成配樂與音效（assets/audio/soundtrack.wav）。
- `python scripts/build-index.py`：依場景清單重寫 index.html 時間軸。
- `python scripts/subset-font.py`：改文字後重新裁切 Noto Sans TC（完整字型放在被忽略的 scripts/font-src/）。
- `node scripts/capture-gameplay.mjs <dir>`：重錄實機玩法影片與結算畫面（需 `npm run preview:academy`）。錄的是舊版 120 秒獵場（origin/flow-arena 的 challenge.html）；新的沙盤在 /arena/，畫面與玩法不同。

trailer 的流程（在 trailer/ 內，需 `npm run preview:academy`）：

1. `node scripts/capture.mjs main|reveal|ranked`：用虛擬時鐘逐格錄現役沙盤（2880×1620、60fps），同時寫下游標與遊戲數值紀錄（assets/video/*.json）。種子 30 的結果是決定性的，重錄得到同一段行情。
2. `node scripts/build.mjs`：依剪輯表產生 index.html（鏡頭、推近、變速、游標）、把共用 kit 與遊戲數值注入 compositions/ov-*.html，並寫出音效 cue（assets/audio/cues.json）。
3. `node scripts/audio.mjs`：依 cue 合成配樂與音效（預設低沉渾厚版；加 `--bright` 重建第一版明亮混音）；`python scripts/subset-font.py`：改字後重新裁切中文字型。

surge 的流程（在 surge/ 內）：歌曲檔 `assets/audio/raya.mp3` 由使用者提供（已取得授權，不進 Git）。`node scripts/capture.mjs short|wall` 錄新的實機段落；`node scripts/build.mjs` 依剪輯表產生 index.html 與 cue；`node scripts/music.mjs` 剪接歌曲（第 0–15 小節接第 20 小節）、做安靜段的低通與屏息，再混入少量低沉音效。

highlights 的流程（在 highlights/ 內）：

1. `assets/data/games.json` 是排行榜前三名的種子與操作紀錄（metabear-arena-production D1 的 arena_scores）。`node scripts/export.mjs` 逐秒重播三局寫出 `assets/data/replay.json`，並確認重播損益與紀錄完全一致，不一致就中止。
2. `node scripts/build.mjs`：把共用 kit（scripts/kit.css、kit.js）與各場景數據注入 compositions/*.html，依 116 BPM 小節網格寫出 index.html 與音效 cue。
3. `node scripts/music.mjs`：剪接歌曲（原曲 0–50.506 秒接 81.541 秒）、混入少量低沉音效、片尾淡出。歌曲 `assets/audio/song.mp3` 由使用者提供，不進 Git。
4. `python scripts/subset-font.py`：改字後重新裁切中文字型。

highlights-live 的流程（在 highlights-live/ 內）：

1. `node scripts/capture.mjs deyo|easy|liu`：自帶靜態伺服器提供 public/，在真實 /arena/ 頁面用紀錄的種子開排名賽，於每個動作紀錄的 tick 套用同樣的操作，以虛擬時鐘逐格錄影（assets/video/*.mp4 與逐格數值 *.json）。錄完比對頁面算出的最終損益與紀錄，不一致就失敗。會封鎖所有非本機請求。
2. `node scripts/build.mjs`：依剪輯表（事件對到拍點的時間扭曲剪接與虛擬推鏡）寫出 index.html，並注入 kit 與字卡數據。
3. `node scripts/music.mjs`：剪接歌曲（原曲第 4–15 小節接第 39 小節之後）與片尾淡出。

## 不進 Git

renders/、snapshots/、.thumbnails/、.hyperframes/ 等渲染輸出與快取只存在本機（見 .gitignore）。重新渲染即可取得；已完成的成品集中放在 `motion/out/flow-arena-*.mp4`（定稿後從 renders/ 複製過去並改成這個檔名，見 [../README.md](../README.md)）。各專案用的歌曲（Raya、ENSEÑA A AMAR）的母帶與清單在 [../audio-library/](../audio-library/README.md)；專案內的 `assets/audio/` 複本仍是渲染時實際讀取的檔案。
