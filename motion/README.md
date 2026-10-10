# motion/ — 動態影片

學院課程本身在 `public/orderflow/motion/`（網站上即時播放）；這個資料夾放影片製作工具與宣傳片原始專案，依宣傳的產品分成 `academy/`（訂單流學院）與 `flow-arena/`（FLOW ARENA 遊戲）。專案的 `id`／`name`（meta.json、package.json）沿用原本的 `academy-drop` 等。

| 資料夾 | 內容 | 引擎 |
| --- | --- | --- |
| [tools/](tools/) | 輸出與配樂工具：`render.mjs`（逐格截圖 → ffmpeg MP4）、`audio.mjs` + `synth.mjs`（依 cues 合成配樂）、`export.*`（單課輸出頁） | Playwright + ffmpeg |
| [academy/showreel/](academy/showreel/README.md) | 86 秒學院 Showreel | 學院 Canvas 引擎 |
| [academy/promo/](academy/promo/README.md) | 46 秒學院宣傳片，16:9／9:16 | 學院 Canvas 引擎 |
| [academy/drop/](academy/drop/README.md) | 31 秒學院對拍宣傳片（使用者提供的歌曲），真實課程頁與沙盤錄影，16:9 | HyperFrames |
| [academy/voice/](academy/voice/README.md) | 43 秒學院旁白版：AI 低沉男聲（Gemini TTS）＋合成音效，無配樂，16:9 | HyperFrames |
| [academy/film/](academy/film/README.md) | 27 秒學院品牌旁白片（定稿）：連續 3D 攝影機、重繪且會動的產品介面、低音音效，16:9 60 fps | HyperFrames |
| [flow-arena/](flow-arena/README.md) | FLOW ARENA 宣傳片：launch、gameplay、promo、trailer、surge、flagship 旗艦廣告，與排行榜精彩重播 highlights 系列 | HyperFrames；flagship 用自己的 Canvas + CPU 後製管線 |
| out/ | **所有完成的影片**，以及截圖、參考片與暫存（不進 Git）；見下方「成品在哪裡」 | — |
| [audio-library/](audio-library/README.md) | **音樂、音效、人聲素材庫**：歌曲、下載音效、合成音效試做、旁白聲線試聽（只有 README 進 Git） | — |

## 成品在哪裡：`motion/out/`

所有完成的影片都集中在 `motion/out/`，檔名是 `<系列>-<專案>[-版本].mp4`：

| 檔案 | 內容 |
| --- | --- |
| `academy-drop.mp4` | 學院對拍宣傳片，31 秒 1080p60 |
| `academy-film.mp4` | 學院品牌旁白片（定稿），27 秒 1080p60 |
| `academy-voice-preview.mp4` | 學院旁白版，43.5 秒 1080p30（這個專案只渲染過預覽版） |
| `academy-promo-tall-hq.mp4` | 學院宣傳片 9:16 高畫質版，46 秒 |
| `academy-lesson-failed-auction.mp4` | 單課輸出：「掃過前低，收回才算數」（failed-auction），77 秒 1080p60 |
| `flow-arena-launch.mp4`、`-gameplay`、`-promo`、`-trailer`、`-trailer-deep`、`-surge`、`-surge-916`、`-flagship-share`、`-highlights`、`-highlights-live` | FLOW ARENA 各版宣傳片（見 [flow-arena/README.md](flow-arena/README.md)） |
| `drafts/` | 低畫質預覽與試渲染：`academy-drop-preview`、`academy-film-preview`、`academy-film-sample` |
| `ref/` | 參考素材：`aether.mp4`（academy-film 參考的外部品牌片）、`flagship-28-36.jpg` |
| `stills/`、`surge-work/` | 指定秒數截圖、surge 製作過程截圖與錄影紀錄 |
| `audio/` | `tools/audio.mjs` 的暫存 wav |

規則：

- 工具會直接寫進 `motion/out/`（`tools/render.mjs` → `<id>.mp4`、flagship → `flow-arena-flagship.mp4`）；HyperFrames 專案的 `npm run render` 則寫到專案自己的 `renders/`。定稿後把成品**複製**到 `motion/out/`，依上面的規則命名（例如 `failed-auction.mp4` → `academy-lesson-failed-auction.mp4`）。
- `renders/` 裡和 `motion/out/` 完全相同（大小與雜湊一致）的副本可以刪掉，重新渲染即可再得到；不同的版本先搬進 `out/` 或 `out/drafts/` 再刪。
- 各專案的 `renders/`、`assets/video/` 錄影與 `assets/audio/` 混音只是製作中的檔案，不是成品。

## 聲音素材：`motion/audio-library/`

歌曲、音效與人聲的總目錄與母帶，清單、來源、用在哪些專案與授權見 [audio-library/README.md](audio-library/README.md)。HyperFrames 專案只能讀自己資料夾內的檔案，所以專案用到的聲音仍放在專案的 `assets/audio/`；新專案從素材庫**複製**過去，不要讓專案直接指向素材庫。歌曲與下載音效不進 Git。

## 常用指令（在 repo 根目錄）

```sh
npm run motion:audio -- <lesson-id>     # 課程配樂 → public/orderflow/motion/audio/<id>.m4a
npm run motion:render -- <lesson-id>    # 課程 MP4 → motion/out/<id>.mp4
npm run motion:render -- showreel       # 或 promo、promo-tall
node motion/tools/render.mjs <id> --still 12,20.5   # 指定秒數 PNG → motion/out/stills/
npm run motion:serve                    # 本機輸出頁，可逐格檢查
```

FLOW ARENA 各專案在自己的資料夾內用 `npm run dev`／`check`／`render`（見 [flow-arena/README.md](flow-arena/README.md)）。
