# MetaBear 網站與學院設計系統

2026-09-28 全站改版：首頁、`/learn`、學院課程地圖與每堂動態課程頁，統一沿用動態課程影片的視覺語言（深墨底、薄荷綠、暖金、琥珀、Barlow Condensed 數字、JetBrains Mono 標籤、光暈與顆粒）。內部工具頁（`/admin`、`/desk`、`/login`、`/quant`）不在此次範圍。

## 檔案

| 檔案                                            | 用途                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `public/mb.css`                                 | 設計 token、字級、按鈕、chip、面板、游標光暈卡、header／行動選單、footer、reveal、toast     |
| `public/mb.js`                                  | header（捲動變實心、下捲隱藏）、行動選單、`[data-reveal]` 進場、`.mb-spot` 光暈、複製邀請碼 |
| `public/mb-boot.js`                             | `<head>` 內同步執行：加上 `.js`、讀取「暫停動態」偏好（避免閃爍）                           |
| `public/mb-init.js`                             | 沒有自己 bundle 的頁面（`/learn`）用來初始化 `mb.js`                                        |
| `public/home.css`、`web/site.js`                | 首頁樣式與互動（GSAP ScrollTrigger）                                                        |
| `web/hero-field.js`                             | 首頁 Three.js 場景：訂單簿流動性地形                                                        |
| `public/learn.css`                              | `/learn` 內容版面，改用 `mb.css` token                                                      |
| `public/orderflow/academy-map.css`              | 課程地圖                                                                                    |
| `public/orderflow/academy-posters.js`           | 地圖的首屏影片輪播、課程卡海報、滑鼠懸停預覽                                                |
| `public/orderflow/motion/preview.js`            | 共用：把動態課程的 `draw(ctx, t)` 畫進任意 canvas（無聲、無控制列）                         |
| `public/orderflow/lesson.css`、`lesson-page.js` | 動態課程頁外框（麵包屑、側欄、標題、上一課／下一課）                                        |

`npm run build:site` 以 esbuild 產生 `public/js/`（ES modules、code splitting）：`site.js` 約 130 KB（含 GSAP），Three.js 另成約 545 KB 的 chunk，只在首頁 WebGL 可用時載入。`/orderflow/*` 標為 external，執行時才 import 學院模組。

## 首頁

1. **Hero**：Three.js 流動性地形。欄是價位、列是時間（最前排是「現在」，歷史退入霧中）；買方掛單薄荷綠、賣方琥珀、掛單牆偏金；價格光帶穿過價差並噴出成交粒子。全部是時間的純函式；滑鼠微調鏡頭，向下捲動鏡頭升起。無 WebGL、省流量或減少動態時退回 CSS 背景／靜止畫面。標題逐字進場（GSAP）。
2. **Ticker**：行情快照（`web/market-data.js`）與重點資訊無縫輪播。
3. **學院展示**：同一套動態課程引擎即時播放精選課程片段，右側清單滑過即切換；統計數字進場計數。
4. **三步開始**：桌面寬度 ≥1100px 時釘住並橫向捲動三張卡（開戶／入金／LINE 核實），進度條同步。
5. **市場快照**、**合約實驗室**（保留原 ID 與計算，新增保證金／名義倉位比例條）、**LINE 對話示意**（對話逐句出現）、結尾 CTA、footer。

所有連結、邀請碼、揭露文字、金管會文號、`/learn?step=…` 目標沿用改版前。

## 學院

- **課程地圖**：首屏影片輪播（依序播放 7 堂課的關鍵片段）、建議路線卡列出路線中的課、sticky 篩選列、每張課程卡在進入視窗時由 `stampPoster` 畫出海報，滑鼠停留則循環播放該課片段。海報時間點在 `preview.js` 的 `POSTER_T`。
- **課程頁**：`scripts/build-motion-pages.mjs` 產生；固定 header（含麵包屑）、左側課程目錄與章節（手機為抽屜，沿用 `academy-navigation.js`）、上一課／下一課卡。平板寬度時目錄移到影片下方。

## 原則

- CSP 為 `script-src 'self'; style-src 'self'`：不寫 inline `<style>`／`style=""`；動態值用 `el.style.setProperty`。
- `prefers-reduced-motion` 或頁尾「暫停動態」：停止 WebGL、輪播與釘住捲動，內容一律可見；偏好存在 `localStorage("metabear-motion")`。
- 所有 reveal 只在 `.js` 存在時隱藏，無 JS 也能完整閱讀。
