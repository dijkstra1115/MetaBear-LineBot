# 宣傳片

本資料夾放兩類宣傳影片：根目錄的學院宣傳片（共用學院 Canvas 引擎），以及 flow-arena-*/ 三個 HyperFrames 專案。

## FLOW ARENA 宣傳片（HyperFrames）

三支 FLOW ARENA 宣傳影片的 HyperFrames 原始專案。每個資料夾都能獨立預覽與渲染；需要 Node.js 22+。

| 專案 | 內容 | 規格 |
| --- | --- | --- |
| flow-arena-launch/ | 第一版上市 sizzle：爆倉熱圖、推價、連環強平（英文） | 16:9，約 45 秒 |
| flow-arena-gameplay/ | 第二版玩法 reel：下大單、假突破、連環爆倉、冰山試探、反手，含 3D 翻轉與實機結算（英文） | 16:9，60 秒 |
| flow-arena-promo/ | 第三版繁中宣傳片：限價吸收、薄簿突破、連環爆倉、好友對戰，加實機玩法錄影與結算 | 16:9，67.5 秒 |

各專案的意圖與分鏡在自己的 BRIEF.md、STORYBOARD.md。renders/ 另有一支 46 秒 9:16 版（promo-tall-hq.mp4，來自 claude/kind-wozniak-8m71aw 分支）。

### 常用指令（在專案資料夾內）

```powershell
npm run dev      # Studio 預覽
npm run check    # lint + 版面 + 對比
npm run render   # 輸出到 renders/
```

flow-arena-promo 另有：

- `node scripts/audio.mjs`：依各場景的 cue 重新合成配樂與音效（assets/audio/soundtrack.wav）。
- `python scripts/build-index.py`：依場景清單重寫 index.html 時間軸。
- `python scripts/subset-font.py`：改文字後重新裁切 Noto Sans TC（完整字型放在被忽略的 scripts/font-src/）。
- `node scripts/capture-gameplay.mjs <dir>`：重錄實機玩法影片與結算畫面（需 `npm run preview:academy`）。

### 不進 Git

renders/、snapshots/、.thumbnails/、.hyperframes/ 等渲染輸出與快取只存在本機（見 .gitignore）。重新渲染即可取得。

## MetaBear 互動學院宣傳片（Promo）

46 秒課程廣告，一條時間軸輸出兩種比例：**16:9（1920×1080）** 給 YouTube／網站，**9:16（1080×1920）** 給 Reels／Shorts／限時動態。畫面裡的課程片段不是錄影，而是即時呼叫各課 `lesson.draw(ctx, t)` 繪製，所以和學院裡的課一模一樣，也能任意逐格重算。120 BPM，每個剪接與重擊都落在節拍上。

### 分鏡

| 時間    | 段落     | 畫面                                                                                              |
| ------- | -------- | ------------------------------------------------------------------------------------------------- |
| 0–5 s   | 冷開場   | 一筆筆買賣從兩側飛入，堆出一根 K 線：「每一根 K 線，背後都是一筆筆成交。」3.5 秒 K 線炸成成交光束 |
| 5–11 s  | 三個問題 | 衝上去的價格為什麼又回來？一道賣牆 38 分鐘不破？放量突破真的站穩了嗎？——各配真實課程片段          |
| 11–15 s | 答案     | 「答案，都在成交裡。」→ MetaBear 標誌描線、互動學院、「看見過程，才讀得懂市場。」                 |
| 15–21 s | 課程牆   | 19 堂課同時播放的影片牆，鏡頭拉遠、計數 19，再俯衝進 BTC 賣牆                                     |
| 21–23 s | 真實盤面 | 滿版：約 2,100 BTC 擊穿 60,800 賣牆（與課程第 19.45 秒同步）                                      |
| 23–35 s | 三個賣點 | 一堂約 30 秒（×7 快轉＋章節進度）／暫停回拖跳章（播放頭真的倒轉）／真實盤面拆解                   |
| 35–40 s | 數字     | 19 堂 · 14 名詞圖解 · 5 市場故事 · 0 元免登入，逐拍重擊                                           |
| 40–46 s | 結尾     | 讀懂市場，再進場。metabear.io/orderflow 與風險提示                                                |

### 使用

需要 Node 22、Playwright 的 Chromium、含 libx264 的 ffmpeg（`PATH` 或 `FFMPEG=`）。

```sh
node motion/audio.mjs promo              # 配樂 → motion/promo/out/promo.wav
node motion/render.mjs promo             # 16:9 → motion/out/promo.mp4
node motion/render.mjs promo-tall        # 9:16 → motion/out/promo-tall.mp4
node motion/render.mjs promo --still 3.5,21.3   # 指定秒數 PNG
npm run motion:serve                     # 開 /motion/promo/index.html?preview&fmt=wide|tall 即時預覽
```

### 結構

| 檔案         | 用途                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ |
| `promo.js`   | 時間軸、配樂提示（`cues`／`music`）、閃光，以及依畫面比例排版的七個段落                    |
| `compose.js` | 任意比例的合成：底色、Bloom、閃光、暗角、顆粒、淡入淡出                                    |
| `harness.js` | 載入 19 堂課、預載字形，提供 `renderFrame` 給 `motion/render.mjs`；`?preview` 可播放與拖曳 |

課程片段用學院共用的 `compositor.js` 畫進離屏 canvas，再以帶框、光暈、斜切與錯位的「螢幕」合成進片中。
