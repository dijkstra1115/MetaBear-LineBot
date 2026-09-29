# 封存區

這裡保留 2026-09-29 決定停止日常開發的程式，不會部署到網站。不是刪除歷史，也不是可直接合併回正式站的現役版本。

## 目錄與完整性

- 2026-09-29/main/：保留原相對目錄，包含 Python、量化研究、舊學院、測試與歷史文件。
- 2026-09-29/flow-arena/：從 5b968b6 擷取的現貨沙盒、說明與測試。
- 2026-09-29/manifest.json：原路徑、封存路徑、分類、來源提交與 SHA-256。
- 部分仍在使用的目錄檔與 HTML 額外保留原版本快照，供舊測試解讀；它們不是第二份要同步維護的程式。

## 復原完整原環境

需要復原時，以 manifest 指定的提交建立獨立 checkout，再執行該版本的安裝／啟動流程。main 基準為 a894a3c5ff56c47360ee7feee7b602675e50bf78，現貨沙盒來源為 5b968b6。不要把 archive 直接複製進 public，也不要在原位執行舊部署設定。

可用 git archive <完整提交> --output=<指定備份檔.tar> 匯出完整已追蹤內容，在另外的資料夾解開。它不含憑證、本機資料庫、錄製行情或影片輸出；這些須另行提供。現貨 IndexedDB／瀏覽器 localStorage 仍由原瀏覽器保存，封存程式不會清除它們。

只檢查已封存的純計算程式（從專案根目錄執行，不啟動服務）：

```powershell
node --test archive/2026-09-29/main/tests/*.test.mjs
npx --no-install tsx --test archive/2026-09-29/main/quant/*.test.ts
node --test archive/2026-09-29/flow-arena/tests/exchange.test.mjs
```

主專案的 npm run test:academy 同時驗證 manifest 的檔案雜湊，防止整理時遺失或修改封存原碼。

## 私有資料與敏感設定

原本的 quant/.data/ 留在原位且被 Git 忽略；包含 SQLite 及 WAL／SHM 時，不應在服務運行中任意拆開搬走。本輪不啟動收集器、不停止既有程序、不連接交易所。Python 的本機環境與資料也不會因封存原碼而自動移動。不要把 .dev.vars、.env 或資料庫加到此目錄。

歷史文件保留原始敘述與相對引用，部分跨到當年完整 repo 的連結只有在復原完整 checkout 後才有效。現在的維護範圍請看 [專案地圖](../docs/PROJECT-MAP.md)。
