# MetaBear

品牌網站、LINE 客服與 CRM、交易學院，以及持續開發中的 FLOW ARENA 與影片製作。

先閱讀 [專案地圖與維護決策](docs/PROJECT-MAP.md)。它是目前範圍的依據；歷史文件與舊分支 README 不代表新的開發授權。

## 維護中的系統

| 系統 | 入口／程式 |
| --- | --- |
| 品牌網站與圖文教學 | /、/learn；public/、web/ |
| 19 堂動態課程 | /orderflow/；public/orderflow/motion/ |
| LINE Bot、CRM、BingX 核實 | src/、migrations/；/admin |
| 分析師報單與登入 | /desk、/login；src/signals.ts、src/native-auth.ts |
| 單課影片與 86 秒 Showreel | motion/；[製作說明](docs/ACADEMY-MOTION.md) |
| FLOW ARENA 宣傳片（HyperFrames） | motion/flow-arena/；[說明](motion/flow-arena/README.md) |

FLOW ARENA 已整合至 main，保留 sandbox 的單人沙盤、半回合制引擎與排行榜（public/arena/，[說明](docs/FLOW-ARENA.md)）。舊版 120 秒獵場、電腦對手與好友房保存在 [Legacy](legacy/flow-arena-v7/README.md)。

## 本機開發

需要 Node.js 22+。

```powershell
npm ci
# 僅在尚未建立 .dev.vars 時，從 .dev.vars.example 複製並自行設定。
npm run types
npm run db:migrate
npm run dev
```

預览網站與課程而不啟動後端：先執行 npm run build:site，再執行 npm run preview:academy（若 8790 尚未被使用）。首頁為 http://127.0.0.1:8790/index.html，課程地圖為 http://127.0.0.1:8790/orderflow/courses.html。

## 驗證與部署

```powershell
npm run check
npm run test:all
npm run build:production
```

test:all 包含後端整合與現役課程、轉址、封存完整性檢查。封存測試不再混入日常套件，復原與驗證方式見 [封存說明](archive/README.md)。build:production 只做 dry-run，npm run deploy 才發布正式站。

正式站 metabear.io 的公開網站使用 Pages `metabear-site`，後端使用 env.production 的 Worker `metabear-backend`。預覽站 preview.metabear.io 使用新版 FLOW ARENA 與獨立的 D1 排行榜；main 的 staging 設定已與新版對齊，舊好友房已退役。見 [沙盤說明](docs/FLOW-ARENA.md) 與 [部署文件](docs/PAGES-WORKER-SPLIT.md)。

Pages／Worker 拆分已於 2026-09-30 正式上線，GitHub main 的網站修改 push 後自動建置與發布，已實測成功。網站建置使用 `npm run build:pages`；`npm run deploy` 僅更新後端與後台資產。完整設定見 [Pages／Worker 部署](docs/PAGES-WORKER-SPLIT.md)。

## 暫停與封存

- [流動性實驗](experiments/liquidity/README.md)：暫停；FLOW ARENA 沙盤已改用自己的撮合核心。
- [封存區](archive/README.md)：Python Bot、量化研究／錄製／Jev、現貨沙盒、舊版學院及被替換素材。全部位於 public/ 之外。
- [Legacy](legacy/README.md)：FLOW ARENA V7 原始檔案、測試與部署設定；完整歷史由固定 Git 標籤保存。
- 舊課程網址轉到現行學院；已合併的突破／撤單網址仍指向現行合併課。
- quant/.data/ 僅保留原機器的私有資料，不納入 Git、不自動搬移；資料夾存在不表示服務仍在維護。

## 品牌與內容

- metabear-logo-white-bg-original.png：白底原稿。
- public/metabear-logo-white-bg.webp：白底社群分享圖，不能用於深色頁面的 Logo。
- public/metabear-logo-transparent-64.png：去背小圖示，供 favicon、頁首／頁尾使用。
- public/favicon.ico：相同去背圖示的瀏覽器標準相容入口。
- 首頁行情為 web/market-data.js 的固定快照；不是即時行情。
- 圖文教學與 LINE 共用內容主要在 src/content.ts；新版課程清單與時長以 academy-catalog.js 為準。

[學院接續指南](docs/ACADEMY-HANDOFF.md) · [LINE AI](docs/LINE-AI.md) · [對話與知識庫](docs/CONVERSATIONS-KNOWLEDGE.md) · [登入](docs/LOGIN.md)
