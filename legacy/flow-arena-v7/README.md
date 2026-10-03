# FLOW ARENA V7：舊版快照

2026-10-03 保存，來源為 `flow-arena` 的 `5b968b6278d3e71d2a675b708f0c71354bf92228`。

`snapshot/` 保存 31 個原始檔案：120 秒獵場、電腦策略、圖表、四人好友房、撮合依賴、測試、平衡實驗、文件及當時的部署設定。檔案直接取自 Git blob，SHA-256 與大小記錄於 `manifest.json`。此目錄只是相關程式的快照，不包含舊專案的所有網站與 CRM 依賴。

完整 repository 與提交歷史由固定標籤 `legacy/flow-arena-v7-2026-10-03` 保留；整合提交亦保留舊分支作為父提交。若需查看完整舊版本，從 repository 根目錄建立獨立工作目錄：

```powershell
git worktree add --detach ../MetaBear-flow-arena-v7 legacy/flow-arena-v7-2026-10-03
```

不要從這份快照執行部署。現役實作位於根目錄的 `public/arena/`、`src/arena-scores.ts` 與 `migrations-arena/`；PvP 將以新引擎另外開發。

## Cloudflare 資源

2026-10-03 透過 Cloudflare 外掛確認：

- `metabear-site-preview` 已使用新版沙盤，只有 ASSETS、ARENA_DB 與環境設定，沒有 ARENA_ROOM 綁定。
- Worker migration 已到 `v2`，帳號的 Durable Object namespace 清單為空。舊 `ArenaRoom` 和房間資料在先前部署時已刪除。
- 沒有舊 ARENA 專用 Worker 或 D1 可再清理；`metabear-arena` 是新版排行榜資料庫，繼續使用。
- 預覽設定保留 `v1`／`v2` migration 歷史，避免後續部署再次建立舊房間。

這次整合未修改 Cloudflare 資源，也未發布正式網站或後端。正式站由 Pages 從 main 的網站變更自動建置；Worker 後端與預覽仍需另外部署。
