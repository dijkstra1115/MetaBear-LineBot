# FLOW ARENA 旗艦廣告（flagship）

FLOW ARENA 正式上線用的 60 秒旗艦廣告，1920×1080、60 fps，英文主標加繁中副標。分鏡見 [STORYBOARD.md](STORYBOARD.md)。

和同層的 launch／gameplay／promo（HyperFrames）不同，這支用自己的程式化管線：

- **畫面**：`src/` 是純函數動畫：每一格只由時間決定（Canvas 2D 繪圖），沒有 `Math.random()` 或 `Date.now()`。`src/post.js` 再在 CPU 上做後製：五層泛光金字塔、徑向變焦模糊、鏡頭色差、切片故障、閃光、膠片肩部、調色、暗角與底片顆粒。後製不經過 GPU，所以每個渲染 worker 能平行跑滿 CPU，任何機器上輸出的畫格都一樣。
- **聲音**：`audio/score.mjs` 用 `audio/dsp.mjs`（帶限振盪器、TPT 狀態變數濾波器、Freeverb、乒乓延遲、變速、壓縮與前瞻限幅）合成整支配樂與音效，48 kHz／24-bit。
- **同步**：`src/cues.js` 是畫面與聲音共用的時鐘與事件表，所以每一個衝擊、轉場與強平波都在同一格、同一個取樣點上。
- **實機畫面**：`assets/cockpit.jpg` 是 `capture.mjs` 從本機 `/arena/`（種子 4821）錄下的駕駛艙截圖。

## 指令（在 repo 根目錄）

```sh
node motion/flow-arena/flagship/render.mjs                  # 配樂 + 影片 → motion/out/flow-arena-flagship.mp4
node motion/flow-arena/flagship/audio/score.mjs             # 只重做配樂 → motion/out/flow-arena-flagship.wav
node motion/flow-arena/flagship/render.mjs --still 15,33.8  # 指定秒數 PNG → motion/out/stills/
node motion/flow-arena/flagship/render.mjs --sheet 0:60:2   # 接觸印樣，快速檢查整支
node motion/flow-arena/flagship/render.mjs --serve          # 預覽頁：拖曳時間軸或配樂播放
node motion/flow-arena/flagship/capture.mjs                 # 重錄 assets/cockpit.jpg（需先 npm run preview:academy）
```

選項：`--fps 60 --workers 4 --from 0 --to 60 --crf 18 --no-audio`。Playwright 內建的瀏覽器不存在時，用 `CHROMIUM_PATH=/path/to/chrome` 指定；`FFMPEG=` 指定 ffmpeg（需 libx264）。4 核心機器上整支 1080p60 約 15 分鐘；工作以 1 秒為單位分給各 worker，各自編成片段後無損接合。

輸出都在 `motion/out/`，不進 Git。
