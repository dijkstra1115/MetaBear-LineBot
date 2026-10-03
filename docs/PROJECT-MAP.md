# 專案地圖與維護決策

2026-09-29，依使用者逐項確認。整理基準：main a894a3c5ff56c47360ee7feee7b602675e50bf78。

2026-10-03：將 flow-arena 與 flow-arena-sandbox 整合回 main，以 sandbox 的 `b332ff5` 為現役實作；舊版 `5b968b6` 保存至 legacy 與固定 Git 標籤。

## 決策

| 狀態 | 範圍 | 程式位置 |
| --- | --- | --- |
| 持續維護 | 網站、圖文教學、19 堂動態課程 | public/、web/ |
| 持續維護 | LINE Bot、CRM、自動核實、VIP 邀請、行銷與分析師報單 | src/、migrations/ |
| 繼續開發，同等優先 | FLOW ARENA 單人沙盤（半回合制、策略族群 NPC）；2–3 人 PvP 等沙盤穩定後再開發 | main 的 public/arena/；[說明](FLOW-ARENA.md) |
| 繼續開發，同等優先 | Showreel、單課輸出、橫／直式宣傳片 | motion/；FLOW ARENA 宣傳片在 motion/flow-arena/，學院 46 秒宣傳片在 motion/academy-promo/（見 [motion/README.md](../motion/README.md)） |
| 暫停 | 流動性、隨機掛單與方向對照實驗 | experiments/liquidity/ |
| 封存 | 現貨交易沙盒 | archive/2026-09-29/flow-arena/ |
| 封存 | FLOW ARENA V7、電腦對手與四人好友房 | [legacy/flow-arena-v7/](../legacy/flow-arena-v7/README.md) |
| 封存 | Bybit 規則模擬交易、原始錄製／回放、Jev 輸入草稿 | archive/2026-09-29/main/quant/ |
| 封存 | Python/FastAPI/Zeabur LINE Bot | archive/2026-09-29/main/app/、alembic/ |
| 封存、退出公開網站 | 全部舊版學院、SVG 課程及被移除的故事 | archive/2026-09-29/main/public/orderflow/ |

使用者沒有選擇保留任何舊版公開體驗。現行 19 課維持，不復活舊版長篇、重返價位、舊 CVD、標記價格、六段旅程及舊實戰／即時工作台。

## 分支與尚未合併成果

| 分支 | 固定來源提交 | 內容與接續原則 |
| --- | --- | --- |
| legacy/flow-arena-v7-2026-10-03（固定標籤） | 5b968b6 | 舊版完整歷史；31 個相關檔案另存 legacy，SHA-256 可驗證。PvP 重做時可參考 lockstep 架構，勿重新部署舊設定。 |
| flow-arena-sandbox（已整合） | b332ff5 | 新版沙盤、頁面、教學、排行榜、測試與平衡實驗已合併至 main。 |
| origin/claude/kind-wozniak-8m71aw | 8ad5e19 | 46 秒 promo，16:9／9:16；以此提交接續，避免覆蓋新版 Logo 與封存決策。 |

整合提交保留 main、flow-arena 與 flow-arena-sandbox 的完整父提交歷史。工作檔案採用新版 main 與 sandbox 的實作，舊對戰、現貨沙盒與暫停實驗不回到公開網站。既有 archive 快照保持原樣。

FLOW ARENA 沙盤使用自己的撮合核心（public/arena/engine/book.js），不再依賴 taker-only-engine.js；experiments/liquidity/ 的快照維持暫停。現役 Canvas 課程與 Showreel 使用 motion/core.js、kit.js 等共用工具；舊 SVG 的 engine.js 並非它們的執行依賴。

## 執行與資料邊界

- 正式網站、LINE 與 CRM：Cloudflare Workers、D1、Queues；此整理不做資料庫 migration。
- ARENA：正式站 metabear.io/arena/ 由 Pages 提供，排行榜 API 走後端 Worker 與獨立 D1 metabear-arena-production（2026-10-03 新增）。preview.metabear.io 使用新版沙盤與獨立 D1 metabear-arena；舊 ArenaRoom 已經由 v2 migration 刪除，Cloudflare 無剩餘 Durable Object namespace。本次只核對資源，未部署或刪除新版資料。
- 影片：本機渲染工具；輸出不隨 Git 保存。
- 已封存量化服務：不再出現在根目錄 npm 指令；原本機 quant/.data/ 保留，未停止任何既有背景程序，也未搬移 SQLite/WAL 檔。
- 暫停與封存快照均在 public/ 之外，不會被現有 Static Assets 建置發布。

## 維護入口

現役說明：README、ACADEMY-HANDOFF、ACADEMY-CURRICULUM、ACADEMY-MOTION。舊部署日誌、分鏡與原始設定保存在封存區，僅供追溯；其中「下一步」「授權」「已完成」是歷史紀錄，不是本輪命令。

可復原清單、SHA-256 與原提交在 [封存說明](../archive/README.md) 及 manifest.json。驗證結果見 [整理驗收](ORGANIZATION-VALIDATION.md)。
