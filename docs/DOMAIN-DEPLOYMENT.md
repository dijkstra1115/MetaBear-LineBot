# MetaBear 正式網域與教學整合

部署日期：2026-09-21。

- 主站：https://metabear.io/
- 圖文教學：https://metabear.io/learn
- 15 堂沉浸式課程：https://metabear.io/orderflow/
- `www.metabear.io` 以 HTTP 308 導向 HTTPS 主網域，保留路徑與 query。

## Cloudflare

沿用 `metabear-line-crm-staging` Worker，沒有重建 D1 或佇列。名稱中的 staging 為既有資源名稱，目前同時服務正式網域與原 workers.dev 網址。

兩個 Custom Domain 由 Cloudflare MCP 建立，DNS 與 TLS 由 Cloudflare 管理；部署亦透過 MCP 的 Workers API 完成。靜態資源使用 manifest 與一次性、僅限上傳的短期 JWT 上傳至同一帳號，未使用長期 API token。既有 secrets 透過 `keep_bindings: ["secret_text"]` 保留。

`wrangler.jsonc` 已記錄兩個 custom-domain routes，`PUBLIC_BASE_URL` 更新為 `https://metabear.io`；往後執行既有部署命令會保留新網域設定。

最終版本：`acbce691-104e-4d3d-b043-f5d460e9ff1d`（100%）。
切換前版本：`d6c1fc66-d965-4d40-832c-44e6e8393c1b`，保留供必要時回復。

## 相容性

原 `metabear-line-crm-staging.style78432.workers.dev` 的公開首頁、圖文教學與課程入口會導向新網域，課程 query 保留。原 LINE webhook、API、媒體、登入與後台路徑維持原本行為，LINE Developers 的 webhook URL 不需要變更。

新網域的後台仍需登入；舊網域的登入 cookie 不會跨網域共用。課程進度保存在各網域的瀏覽器 localStorage，localhost 或舊網域的進度不會自動搬到新網域。

## 整合入口

首頁主導覽、首屏連結、獨立學院區塊與頁尾皆可進入互動教學；圖文教學中心也有學院入口。互動課程的 MetaBear 品牌連結可返回主站。

## 驗證

- TypeScript 檢查、Wrangler staging dry-run、diff whitespace 檢查通過。
- 既有 85 個 TypeScript 測試通過；新增 4 個網域測試在補齊測試環境管理員 email 後全部通過。
- 19 個 Maker/Taker 與引導課程模型測試通過。
- 正式 HTTPS 首頁、圖文教學、互動課程、health、content.json、robots 與 sitemap 均正常。
- www 與舊公開網址轉址正確；未登入後台導向 login，API 拒絕未授權請求；舊 webhook 保留 POST-only 行為。
- 99 個公開檔案逐一比對 SHA-256，與本機部署內容一致；受保護的頁面以登入保護驗證替代公開內容比對。
- 瀏覽器實測由首頁進入第一課，Maker 掛單動畫完成後進入 Taker 步驟，無 console error。手機版入口與 Logo 已檢查。

本次未發送 LINE 訊息，也未觸發登入 OTP；驗證範圍為路由、保護機制、資源完整性與公開教學流程。

## 2026-09-21：安全、分析、信箱與驗收環境

使用者已在 LINE 後台將 webhook 更新到 `https://metabear.io/webhook/line`。

### 網域設定

- 自動續費：依使用者要求維持關閉；到期日 2027-09-21。
- Always Use HTTPS：開啟；HTTP 實測回傳 301。
- 最低 TLS：1.2；實測 TLS 1.1 被拒絕、1.2 與 1.3 可連線。
- DNSSEC：已要求啟用，目前 Cloudflare 回報 `pending`，等待 Registrar 發布 DS 記錄。尚不能記為完全生效。
- Bot Fight Mode：維持關閉，避免干擾 LINE webhook。
- 原正式服務的 workers.dev 維持啟用，保留歷史教學與圖片連結。

### 品牌信箱

`contact@metabear.io` → `style78432@gmail.com`。

收件地址已驗證；轉寄規則已啟用；Email Routing 回報 `ready`，MX／SPF／DKIM 已設定。規則 ID：`44d1275cd9b84f61bfc7fe4340a62aaf`。未發送測試郵件，尚未驗證實際 Gmail 收信；本設定提供收件轉寄，不是完整的寄件信箱。

### Web Analytics

- 站點：`metabear.io`；Site ID：`3a0ec1a4f41a49f69ef04c99609fbb99`。
- 採公開頁面手動載入，`auto_install=false`。
- `public/analytics.js` 只在 `https://metabear.io` 載入該站的分析腳本；首頁、圖文教學與互動學院包含 loader。
- CSP 只在正式站的三個公開 HTML 文件允許分析腳本與收集端點；登入／後台維持原本限制。
- 預覽與 localhost 不載入本站的分析 token，避免測試流量混入正式 Web Analytics。
- 可從 Cloudflare → Analytics & Logs → Web Analytics → metabear.io 查看；資料需要實際訪客並等待處理。尚未實作每堂課完成率的事件紀錄。

### 正式／驗收部署

| 用途 | 網址 | Worker | 本機設定 |
|---|---|---|---|
| 正式網站與 LINE | `https://metabear.io` | `metabear-line-crm-staging`（保留既有資源名稱） | `env.production` |
| 網站／課程驗收 | `https://preview.metabear.io` | `metabear-site-preview` | `env.staging` |

驗收 Worker 使用獨立入口 `src/preview.ts`，僅綁定 ASSETS 與環境標記，沒有 D1、Queues、排程或任何 secrets。圖文教學使用程式內的公開內容；後台、登入、API、webhook、訊號媒體與非讀取請求不可用。所有回應帶 `X-Robots-Tag: noindex, nofollow, noarchive`，robots.txt 禁止索引。這是公開網站與課程的驗收站，不是 CRM／LINE 端對端沙盒。

```powershell
npm run types             # 產生正式後端型別，避免混入僅含 ASSETS 的驗收環境
npm run check
npm run build:staging     # 驗收站 dry-run
npm run deploy:staging    # 發布到 preview.metabear.io
npm run build:production  # 正式站 dry-run
npm run deploy            # 驗收後發布到 metabear.io
```

資料庫遷移命令改為 `npm run db:migrate:production`；實際 D1 仍為既有 `metabear-crm-staging`。Wrangler 對驗收環境未繼承 DB／CRM vars 的警告是刻意隔離，不能為了消除警告把正式資源綁進去。

本次正式版本：`fbb34a78-a5ce-4cb9-b975-fd1c2b0e0034`。
本次驗收版本：`1829983a-2eed-4946-a6c8-f41b63d5a18e`。

### 學院品牌更新

依使用者授權直接更新正式站，學院頁首使用主站 MetaBear 熊頭 Logo，favicon 改為 `/favicon-v2.png`。正式版本：`6e5844a5-cf87-43ee-94e4-6f93f2d37d76`；已以瀏覽器確認 Logo 載入與 favicon 引用。此品牌更新尚未同步到驗收站。

TypeScript、兩環境 dry-run、11 個路由／隔離／分析測試已通過；線上亦驗證了公開頁面、後台登入保護、正式 webhook 拒絕無效簽章、驗收站拒絕 LINE 操作、TLS 版本與公開 MX 記錄。瀏覽器確認正式分析 loader 已載入，驗收課程可正常顯示。
