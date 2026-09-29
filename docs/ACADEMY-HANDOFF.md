# 現役學院接續指南

2026-09-29：現役為 19 堂 Canvas 動態課程。上一代交接紀錄已保存於 [原始交接](../archive/2026-09-29/main/docs/ACADEMY-HANDOFF.md)，其旧任務與授權不再作為新工作指令。

先看 [專案地圖](PROJECT-MAP.md)、[課程清單](ACADEMY-CURRICULUM.md)、[影片架構](ACADEMY-MOTION.md) 與 [網站設計](SITE-DESIGN.md)。課名、前置概念與時長的唯一資料來源為 public/orderflow/academy-catalog.js。

## 修改位置

- 動画：public/orderflow/motion/lessons/<id>.js。
- 共用繪圖／合成／播放器：motion/core.js、kit.js、compositor.js、player.js（均在 public/orderflow/ 下）。
- 頁面模板：scripts/build-motion-pages.mjs；地圖／導覽建置：scripts/build-academy.mjs。
- 保留 academy-mobile.css 的現役版型；舊 academy-mobile.js 的 SVG 控制器已封存，不再注入。
- Showreel 共用新版繪圖核心；不要刪除 motion/ 或共用字型／音訊。

## 品質要求

每課一個問題，短字幕；成交與掛單數量口徑一致。任意時間點都能重建畫面，回拖不累加副作用。保留減少動態偏好、桌面與手機閱讀、播放／暫停／跳章／回拖。原始課程研究卡仍保留作數字與來源依據，舊 SVG 時長不代表現行影片時長。

執行 npm run build:site、npm run test:academy 與 npm run check；涉及後端再跑 npm test。發布前以 npm run build:production 做 dry-run，另行檢查瀏覽器畫面。只有明確的發布任務才執行 deploy，不按歷史交接記錄自動部署。

舊版全部封存；舊頁只提供轉址。不要恢復舊 15 課、六段旅程、長篇 SVG、實戰或即時工作台。FLOW ARENA 是獨立持續開發方向，見專案地圖中的分支說明。
