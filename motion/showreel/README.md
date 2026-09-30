# 交易學院動態影片（Showreel）

以動態設計重新詮釋交易學院四個故事，約 86 秒、1920×1080、60fps，附程式合成配樂。畫面與聲音都從同一份時間表產生，逐格可重現。

## 分段

| 時間    | 段落                | 重點畫面                                                                |
| ------- | ------------------- | ----------------------------------------------------------------------- |
| 0–6 s   | 開場                | 一分鐘成交軌跡收攏成一根 K 線                                           |
| 6–12 s  | 片頭                | MetaBear 標誌描線、「讀懂市場，再進場。」、四個章節                     |
| 12–30 s | 01 撮合與 K 線      | 熊＝委託單位；買賣掛單與 K 線共用價格軸，104–109 無成交直接跳到 110     |
| 30–48 s | 02 影線             | 1,106 隻只推 2 元；119 隻穿過薄賣單衝上 136；4,980 隻主動賣出吃掉厚買單 |
| 48–62 s | 03 足跡・分布・熱圖 | 足跡收攏成成交量分布；101 熱圖由 130 退到 12 隻，60 隻賣出穿越          |
| 62–76 s | 04 CVD              | 自 14:33:30 累計：+404 時價格卡在 101；跌到 97 時 CVD 仍為 +230         |
| 76–86 s | 結尾                | 四章收攏成標誌、metabear.io/orderflow、合成行情免責說明                 |

數字沿用 [早期故事文件](../../archive/2026-09-29/main/docs/BEGINNER-PROLOGUE.md) 及同目錄的 WICK-PROLOGUE、REVISIT-STORY、DELTA-STORY。舊 bear-market.js 已封存；Showreel 的場景自帶對應時間軸與數字，執行時使用現役 motion/core.js，不匯入舊 SVG 模型。影片為動態設計詮釋，節奏經過壓縮，不取代可回拖的互動課程。

## 使用

需要 Node 22、Playwright 的 Chromium，以及含 libx264 的 ffmpeg（`PATH` 上的 `ffmpeg`，或以 `FFMPEG=/path/to/ffmpeg` 指定）。字型與學院課程共用 `public/orderflow/motion/fonts/`。

```sh
npm ci
node motion/tools/audio.mjs showreel          # 合成配樂 → motion/showreel/out/soundtrack.wav
node motion/tools/render.mjs showreel         # 渲染並混音 → motion/out/showreel.mp4
npm run motion:serve                    # http://127.0.0.1:8791/motion/showreel/index.html?preview ，空白鍵播放、可拖曳
```

其他選項（與學院課程共用 `motion/tools/render.mjs`）：

```sh
node motion/tools/render.mjs showreel --still 20.3,41.5   # 輸出指定秒數的 PNG
node motion/tools/render.mjs showreel --from 30 --to 48   # 只渲染一段
node motion/tools/render.mjs showreel --fps 30 --crf 20   # 較快、較小的預覽檔
```

學院現有 19 課使用同一套動態設計語言，見 [動態影片課程](../../docs/ACADEMY-MOTION.md)。

## 結構

配樂由共用的 `motion/tools/synth.mjs` 合成（D 小調、成交音高隨成交價變化），`motion/tools/render.mjs` 以多個無頭 Chromium 平行逐格渲染後由 ffmpeg 編碼並混音。

| 檔案              | 用途                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------- |
| `src/core.js`     | 轉匯出學院共用的 `public/orderflow/motion/core.js`（緩動、光暈、文字、熊與 K 線圖形） |
| `src/common.js`   | 章節卡、字幕、計數卡、BPM                                                             |
| `src/timeline.js` | 各場景起訖（120 BPM，每次切換落在小節線）、閃光與音效提示表                           |
| `src/scenes/*.js` | 七個場景，每個都是 `draw(ctx, t)` 的純函式，並匯出自己的音效提示                      |
| `src/main.js`     | 合成：背景、Bloom、顆粒、暗角、HUD，以及預覽播放器                                    |

每一格只取決於時間 `t`，因此可以任意跳格、平行渲染，聲畫永遠對齊。修改畫面時，保持場景函式不依賴前一格狀態。
