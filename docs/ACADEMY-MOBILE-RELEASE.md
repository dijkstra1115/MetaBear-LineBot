# 學院手機版與正式發佈

2026-09-24，使用者明確要求目前課程告一段落，補齊手機版後 commit，再用 Cloudflare 部署替換舊學院。

## 範圍

- 18課：14堂名詞圖解、4堂市場故事。內容、前置概念與網址由 academy-catalog.js 管理。
- 手機地圖採單欄，搜尋16px、篩選44px、長前置課名折行。
- 手機課程採直式標題／圖表／短字幕／進度／控制；課程與章節收進可關閉抽屜。按鈕至少44px。
- 「放大觀看」打開橫向劇院；直式螢幕以CSS旋轉播放器，橫放裝置則直接填滿可用區域，不依賴裝置鎖定方向或Fullscreen API。
- 「圖表細節」暫停並放大原SVG，可左右上下滑動；「完整圖表」恢復全景。不複製帳本、不重新播放、不生成第二套數值。
- 18課在所有尺寸共用桌面版本的鏡頭、字幕與持續播放時間軸。既有 continuousDesktop 選項保留名稱以相容舊課，現在對手機同樣生效；舊逐幕課仍維持原有行為。
- 切換螢幕方向／劇院、正反回拖、跳幕、重播均保持數據與事件一致。導覽開啟時暫停，抽屜與劇院隔離背景焦點並支援Escape。

## 實作

`academy-mobile.css/js` 負責版型及劇院，`academy-navigation.css/js` 負責共用側欄抽屜；`build-academy.mjs` 將樣式與模組一致注入所有可觀看課程。

直式預覽呈現完整構圖；要逐格讀足跡或掛單數字可展開劇院或放大細節。手機不裁掉原本的圖表歷史，也不另寫簡化市場劇本。

## 驗證與上架

- 以360、390、430px直式及844×390橫式驗收；檢查18課載入、整課回拖、字幕、按鈕尺寸、水平溢出，以及抽屜／劇院的焦點與關閉行為。
- 255項學院模型／視圖／目錄／播放器測試、94項網站測試、TypeScript、build:site 與 Wrangler production dry-run 通過。
- 正式入口：`https://metabear.io/orderflow/`；主站首頁與舊課網址一併驗證。
- 使用既有 `wrangler.jsonc` 的 `production`；實際Worker歷史名稱為 `metabear-line-crm-staging`，網域為 `metabear.io`／`www.metabear.io`。保留原有D1、Queues、Cron、驗證與secret設定，不做資料庫遷移。
- 發佈順序：建置／驗收 → commit → `wrangler deploy --env production` → 正式HTTP與瀏覽器驗收。未要求git push。
- 發佈前正式版本為 `0b5f5663-9160-4551-8821-7d66460b0571`；如需回復，可使用Cloudflare版本回復機制，毋須改資料庫。
