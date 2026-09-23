# 交易學院手機版上架 · 2026-09-23

正式入口：https://metabear.io/orderflow/

四段故事依序為：

1. `/orderflow/`、`matching.html`：買賣配對與 K 線形成，共 8 幕。
2. `wick.html`：上衝與大量主動賣出的對比，共 12 幕。
3. `revisit.html`：成交足跡、成交量分布與掛單熱力圖，共 9 幕。
4. `delta.html`：主動成交差額與 CVD，共 8 幕。

## 手機呈現

- 650px 以下使用獨立直式 SVG 排版；桌機維持原有鏡頭與構圖。
- 撮合動畫與 K 線使用同一份行情，九個成交單位分為兩列。
- 掛單熱力色帶與成交價共用價格軸；CVD 與成交價共用時間軸。
- 下方固定上一幕、暫停／繼續、下一幕。控制按鈕高 46px，進度條觸控區高 44px。
- 可拖曳回看；切換手機／桌機尺寸保留當前幕、行情時間及暫停狀態。
- 首頁與教學中心改為四段故事入口。新入口直接播放基礎故事；舊 `lesson`、`classic`、`workspace` 連結保留相容處理。
- `scripts/build-site.mjs` 從 `matching.html` 產生學院首頁，避免第一課兩份頁面不同步。

## 驗證

- 61 項故事與手機渲染測試通過：
  `node --test tests/orderflow-primer.test.mjs tests/orderflow-wick.test.mjs tests/orderflow-revisit.test.mjs tests/orderflow-delta.test.mjs tests/orderflow-bear.test.mjs tests/orderflow-mobile.test.mjs`
- 既有 TypeScript 回歸測試、`npm run check`、`npm run build:site` 與正式環境 Wrangler dry-run 通過。
- 瀏覽器以 320、390、430px 手機寬度與 1280px 桌機寬度檢查；沒有水平溢出，切換尺寸不重置播放。
- 已檢查手機撮合、九單位成交、掛單熱力圖、CVD 與正式站跨故事導航；未發現瀏覽器錯誤。
- 預覽站與正式站各驗證 58 個入口／學院程式和樣式檔；程式與樣式內容與本機 manifest 一致，health 回應 200。
- 上述手機檢查為瀏覽器尺寸模擬，尚未使用實體 iOS／Android 裝置測試。

## 發布紀錄

- 預覽：https://preview.metabear.io/orderflow/
- 正式 Worker：`metabear-line-crm-staging`（歷史名稱，對應 `metabear.io`）。
- 正式版本：`0b5f5663-9160-4551-8821-7d66460b0571`。
- 正式 deployment：`ead43db6-0904-4cf1-8b35-8ffc695b6af1`，100%。
- 前一個正式版本：`6e5844a5-cf87-43ee-94e4-6f93f2d37d76`。
- Wrangler OAuth 過期，使用既有 Cloudflare connector 與官方 Static Assets direct-upload 流程發布。
- 此次只替換網站資產；正式 Worker 程式以發布前版本原文保留。發布後比對程式相同、19 個 binding 全數相同，無資料庫 migration。
- 下次發布優先使用正常 `npm run deploy`；發布前先執行 `npm run build:site` 與以上測試。
