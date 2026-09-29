# 專案整理驗收

日期：2026-09-29。工作分支：codex/project-organization；來源 main a894a3c。

## 結果

| 檢查 | 結果 |
| --- | --- |
| npm run check | 通過 TypeScript 檢查 |
| npm run build:production | 通過；公開資產由 444 減至 305 |
| npm run test:all | 94 個後端測試、14 個現役學院／封存測試通過 |
| 封存 SVG 學院測試 | 260 個通過 |
| 沙盒與暫停實驗測試 | 43 個通過 |
| 封存 quant 測試 | 27 個通過 |
| git diff --check | 通過 |
| 封存完整性 | manifest 中原始檔案與分支快照的 SHA-256 全部吻合 |
| 靜態引用 | public 下 HTML／JS／CSS 沒有缺失的靜態本機檔案引用 |
| 瀏覽器抽查 | 足跡圖播放、切換章節與 Canvas 畫面正常；legacy/classic.html 導向 courses.html，顯示 19 堂課 |

共 438 個測試通過。封存測試的執行方式見 archive/README.md 與 experiments/liquidity/README.md。

## 範圍與限制

- 整理與驗證已完成，使用者已要求 commit 並推送整理分支；尚未部署，線上公開入口會在部署後才改變。提交與推送狀態以 Git 紀錄為準。
- 未更動正式 Worker 的後端原始碼、資料庫或 bindings。
- 未重新驗收 FLOW ARENA 的線上好友對戰，也未合併其分支或 promo 分支。
- 未驗證歷史 Python 服務能否在現行外部環境重新上線；原始碼與設定均可復原。
- quant/.data/ 的本機資料與既有背景程序保留原狀，不隨 Git 保存。
- 瀏覽器驗收為代表性頁面抽查，不代表所有裝置與每堂課均已逐一人工驗收。
