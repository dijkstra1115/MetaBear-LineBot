# 互動學院：動態影片課程（Motion）

2026-09-30：現役 20 課均為 `format: "motion"` 的 Canvas 動態影片課，包含第 19 課 `btc-wall`（市場故事 S05）與第一堂策略實戰 `failed-auction`（T01）。舊 SVG／`mountStory` 課程原碼與測試已移到 `archive/2026-09-29/main/`，不再發布到網站。維護範圍見 [專案地圖](PROJECT-MAP.md)。

## 課程一覽

課名、前置概念與路線仍以 `public/orderflow/academy-catalog.js` 為準；時長與章節來自各課的 `motion/lessons/<id>.js`。

| ID                 | 課名                         | 秒  | 章節                                                                                                  |
| ------------------ | ---------------------------- | --- | ----------------------------------------------------------------------------------------------------- |
| `matching`         | K 線                         | 28  | 買賣雙方掛價 → 一張買單吃三檔 → 賣出留下上影線 → 收盤讀開高低收 → 下一根 K                            |
| `footprint`        | 足跡圖                       | 30  | 整段足跡 → 成交留下數字 → 同價位兩邊成交 → 讀懂一格、回全景                                           |
| `heatmap`          | 熱力圖                       | 30  | 掛單留下時間軌跡 → 越多越亮 → 成交與撤單的差別 → 回完整熱力圖                                         |
| `order-types`      | 市價單與限價單               | 30  | 同樣買 30 隻 → 市價往上吃（均價 101.67）→ 限價 101 → 並排結果                                         |
| `slippage`         | 滑價                         | 30  | 同樣買 30 隻 → 深委託簿 → 淺委託簿（均價 102.50、+1.50）→ 價差即滑價                                  |
| `leverage`         | 合約槓桿                     | 30  | 保證金與部位 → 損益跟著部位 → 換一組設定 → 同損益、不同報酬率                                         |
| `liquidation`      | 合約強平                     | 32  | 100 撐起 500 → 跌 5%／10% → 逼近維持保證金（強平 80.402）→ 強平與理論歸零點                           |
| `volume`           | 成交量                       | 30  | 價格與量 → 成交落進量柱 → 掛單不是成交量 → 同時間比較（均量 30、2×、0.5×）                            |
| `delta-concept`    | Delta 與 CVD                 | 30  | 三分鐘足跡 → 一分鐘 Delta → 每段都算 → CVD 從起點累加                                                 |
| `stop-orders`      | 停損單                       | 32  | 99 觸發 → 市價逐價成交（均價 97.50）→ 回到起點改限價（98 成交 10、剩 10）→ 兩結果                     |
| `open-interest`    | 未平倉量（OI）               | 36  | K 線與 OI 全景 → 開開 +1 → 平平 −1 → 一開一平不變 → 回同段行情                                        |
| `funding`          | 資金費率                     | 32  | 多空各持 10,000 → 正費率多付空 → 負費率空付多 → 兩次結算紀錄                                          |
| `volume-profile`   | 成交量分布圖                 | 30  | 三分鐘量 → 搬到價格 → 同價累加 → POC 101（60／140）                                                   |
| `imbalance`        | 足跡不平衡                   | 30  | 三根足跡 → 斜比 30÷10 → 4 倍與 1.5 倍 → 零分母不計、回全景                                            |
| `wick`             | 衝上去，怎麼又回來？         | 36  | 九根 K 的上影線 → 1,106 隻只推 2 元 → 119 隻衝上 136 → 4,980 隻逐檔回落 → 兩件事                      |
| `absorption-story` | 突破誘多，高位吸收，反轉出貨 | 44  | 三次測壓 104 → 賣單被吃又被撤 → 突破 106 → 高位吸收 → 賣方接手 → 回九根全景                           |
| `breakout-volume`  | 放量突破，怎樣才算站穩？     | 38  | 十根完整行情 → 放量突破 → 回踩 104 → 掛買接住 240 隻 → 再推到 109                                     |
| `order-block`      | 訂單塊到底長怎樣？           | 38  | 十一根完整行情 → A 先掛買承接 50 → 收跌還差 30 → 改主動買入 → 畫出 101–104 訂單塊                     |
| `btc-wall`         | 一道賣牆，最後倒給了誰？     | 54  | 38 根同高 K → 賣牆吸收約 4,500 BTC → 擊穿、止損連鎖到 61,322 → 頂後 20 秒淨賣 → 賣在牆上方 → 回到牆下 |
| `failed-auction`   | 掃過前低，收回才算數         | 77  | 全景 → 地點：停損在哪裡 → 事件：掃蕩 → 確認：誰贏了 → 執行：等回測 → 另一個結局 → 兩種結局          |

策略實戰（`kind: "strategy"`）在故事課的鏡頭語言上多一條常駐「策略軌」（地點｜事件｜確認｜執行＋確認槽），證據卡從圖上飛向鏡頭再落進槽位；分類的標籤、代碼與說明集中在 `academy-catalog.js` 的 `kinds`。見 [失敗拍賣課程卡](FAILED-AUCTION-LESSON-PLAN.md)。

`btc-wall` 是學院第一堂真實行情復盤（2026-07-02 BTC），單位用 BTC／U，畫面右上標示「REAL MARKET」（lesson 的 `dataLabel`）；其餘課程維持熊、元、隻的合成教材。見 [BTC 賣牆課程卡](BTC-WALL-LESSON-PLAN.md)。

數字沿用各課 `docs/*-LESSON-PLAN.md` 的帳本與口徑；影片壓縮了節奏，但不改寫成交數量。故事課的開場只顯示「已完成」的 K，重演前不洩漏尚未發生的成交（例如合併故事在回看前只畫 0–5 號 K、CVD 280）。

## 架構

```
public/orderflow/motion/
  core.js         緩動、彈簧、確定性亂數、光暈、文字、熊與 K 線圖形
  kit.js          標題卡、價格格線、面板、計數、鏡頭（camera／camPath）、標籤、箭頭等共用元件
  compositor.js   1920×1080 繪製後縮放到實際解析度；Bloom、顆粒、暗角、閃光、自動降畫質
  player.js       影片式播放器：章節分段進度條、字幕、聲音、全螢幕／劇院、鍵盤、結束卡
  boot.js         依 .motion-player[data-lesson] 動態載入 lessons/<id>.js
  motion.css      播放器樣式（CSP 安全：無 inline style）
  fonts/          自架 Noto Sans TC、Barlow Condensed、JetBrains Mono 子集與授權
  audio/<id>.m4a  各課合成配樂（AAC 112k）
  lessons/<id>.js 每課一檔
```

每課匯出：

```js
export const lesson = {
  id, title, duration, description, note, footer,
  audio: "./motion/audio/<id>.m4a",
  music: { palette, key, sections },   // 配樂色調與段落強度，供合成器使用
  chapters: [{ t, label }],            // 側欄 data-story-scene 與進度條分段
  captions: [{ a, b, text }],          // 下方 DOM 字幕（aria-live），不燒進畫面
  flashes, cues,                       // 閃光與音效提示（成交音高隨價格）
  draw(ctx, t),                        // 純函式：畫面只取決於 t
};
```

- **確定性**：`draw` 不保留前一格狀態，因此可任意回拖、跳章、平行輸出，聲畫永遠對齊。`tests/orderflow-motion.test.mjs` 每 0.1 秒在一般與減少動態模式下檢查有限幾何，並驗證回拖後同一時間畫出同一格。
- **頁面**：`scripts/build-motion-pages.mjs` 依 catalog 中 `format: "motion"` 的課生成 `public/orderflow/<id>.html`（側欄章節、標題、播放器、註腳），再由 `buildAcademy` 注入課程導覽。不要手改生成的課程頁。
- **播放器**：預設靜音自動播放；點大播放鍵或「開啟聲音」後有聲，選擇記住於 `localStorage`（`metabear-motion-sound`）；聲音鍵旁的音量滑桿記住於 `metabear-motion-volume`，拉到 0 等同靜音（iOS 無法由網頁調整元素音量，會隱藏滑桿）。空白鍵／K 播放暫停、←→ 3 秒、PageUp／PageDown 換章、M 聲音、F 全螢幕、Esc 離開劇院。桌面使用元素全螢幕；觸控裝置改用文件全螢幕加 CSS 劇院，直式時整個播放器旋轉成橫向，iPhone 則只有劇院。播完顯示結束卡，連到 catalog 中的下一課並記錄完成。
- **配樂音色**：`motion/synth.mjs` 為反覆觀看調暗高頻——點擊音壓在 2 kHz 內、旋律音超過 D6 自動降八度、hi-hat 與噪音掃頻收低，母帶再做 3.2 kHz −4 dB、5 kHz 高架 −5 dB、11 kHz 低通。改動合成器後需 `npm run motion:audio` 重產音檔，並調高 `player.js` 的 `audio_v` 讓瀏覽器換掉快取。
- **手機**：直式頁面保留 16:9 影片與下方字幕；細字建議橫向或全螢幕觀看。
- **減少動態**：`prefers-reduced-motion` 時關閉鏡頭晃動與全畫面閃光，時間軸與數字不變。

## 製作工具

需要 Node 22、Playwright 的 Chromium，以及含 libx264 的 ffmpeg（`PATH` 上的 `ffmpeg`，或以 `FFMPEG=/path/to/ffmpeg` 指定）。

```sh
npm run motion:audio -- wick           # 依 cues／music 合成配樂 → public/orderflow/motion/audio/wick.m4a（不帶 ID 則全部）
npm run motion:render -- wick          # 輸出含字幕的 1080p MP4 → motion/out/wick.mp4
node motion/render.mjs wick --still 12,20.5   # 指定秒數的 PNG → motion/out/stills/
node motion/render.mjs wick --fps 30 --crf 22 # 較快、較小的預覽檔
npm run motion:serve                   # 本機輸出頁，可逐格檢查
npm run build:site                     # 重新生成課程頁與地圖
```

`motion/synth.mjs` 是共用合成器（撥弦成交音、鼓組、貝斯、襯底與側鏈、殘響），`motion/audio.mjs` 也能產生 showreel 的配樂（`node motion/audio.mjs showreel`）。

## 新增或修改一課

1. 在 `motion/lessons/<id>.js` 實作 `lesson`，時間與數字依課程卡；每個節拍只強調一件事，沿用全景 → 放大 → 事件 → 回全景的鏡頭語言。
2. catalog 設 `format: "motion"`、`duration` 與 lesson 相同。
3. `npm run motion:audio -- <id>`、`npm run build:site`，再跑學院測試。
4. 用 `--still` 輸出關鍵秒數或在瀏覽器實際播放，檢查文字碰撞、裁切與鏡頭邊界；不要只相信測試通過。
