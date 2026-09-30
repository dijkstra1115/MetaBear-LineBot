# motion/ — 動態影片

學院課程本身在 `public/orderflow/motion/`（網站上即時播放）；這個資料夾放影片製作工具與宣傳片原始專案。

| 資料夾 | 內容 | 引擎 |
| --- | --- | --- |
| [tools/](tools/) | 輸出與配樂工具：`render.mjs`（逐格截圖 → ffmpeg MP4）、`audio.mjs` + `synth.mjs`（依 cues 合成配樂）、`export.*`（單課輸出頁） | Playwright + ffmpeg |
| [showreel/](showreel/README.md) | 86 秒學院 Showreel | 學院 Canvas 引擎 |
| [academy-promo/](academy-promo/README.md) | 46 秒學院宣傳片，16:9／9:16 | 學院 Canvas 引擎 |
| [flow-arena/](flow-arena/README.md) | 三支 FLOW ARENA 宣傳片：launch、gameplay、promo | HyperFrames |
| out/ | 所有輸出的 MP4、PNG 與暫存（不進 Git） | — |

## 常用指令（在 repo 根目錄）

```sh
npm run motion:audio -- <lesson-id>     # 課程配樂 → public/orderflow/motion/audio/<id>.m4a
npm run motion:render -- <lesson-id>    # 課程 MP4 → motion/out/<id>.mp4
npm run motion:render -- showreel       # 或 promo、promo-tall
node motion/tools/render.mjs <id> --still 12,20.5   # 指定秒數 PNG → motion/out/stills/
npm run motion:serve                    # 本機輸出頁，可逐格檢查
```

FLOW ARENA 各專案在自己的資料夾內用 `npm run dev`／`check`／`render`（見 [flow-arena/README.md](flow-arena/README.md)）。
