# Pages 網站與 Worker 後端

2026-09-30：拆分、正式 DNS 切換與後端精簡版本發布全部完成。`metabear.io` 的 Pages 網域與 TLS 狀態均為 active。GitHub App 已獲准存取 `dijkstra1115/MetaBear-LineBot`，Pages 專案 `metabear-site` 從 main 自動建置。原 Worker 已直接改名為 `metabear-backend`，保留相同 Worker identity、6 個 secrets、D1、Queues 與排程。

Pages 網址：https://metabear-site.pages.dev 。第二次 push（commit `9324687`）自動產生成功的 deployment `2126da8b-6047-4010-a58a-e150113a7592`，並確認當時 Worker 版本未變。正式後端版本：`8081331e-69fe-41dc-b34c-027c3fdc48b8`；切換前版本：`206a81c2-d154-4aa0-8852-99e670ca56f3`。正式 HTTPS 已驗證公開頁面、/learn query、課程 clean URL、靜態資產、旁白 206（32 bytes）、後台登入轉址、未授權 API 拒絕與 Webhook 簽章限制。本機 103 個後端測試、19 個網站／課程測試及新增 Pages narration adapter 測試通過，TypeScript 與 Worker dry-run、Pages Function compile 通過。

## 分工

| 流量 | 部署位置 |
| --- | --- |
| 首頁、/learn、/orderflow/、JS、CSS、圖片 | Pages `metabear-site`，`pages/dist/` |
| 課程旁白的 Range／seek | Pages Function，只涵蓋 `/orderflow/motion/audio/*`，僅使用 ASSETS |
| LINE、CRM、登入、分析師報單、/content.json、匯率、/health | Worker `metabear-backend`，`src/backend.ts` |
| 後台／登入文件及其 JS | Worker 的 `dist/backend/`，不放進 Pages |
| D1、Queues、排程、秘密金鑰 | 原 Worker，沿用既有資源 |
| www.metabear.io | 保留 Worker Custom Domain，308 導向主站 |

`metabear.io` 改由 Pages 提供 origin。Worker 的 zone routes 攔截指定後端路徑，所以原本的同源 Cookie、CSRF、LINE Webhook URL 與登入回呼網址維持可用，不需要開放 CORS。每條 exact-file route 都加上尾端 `*`，避免帶 query 的資源繞過 Worker。公開內容頁面的分析 CSP 與學院 WebSocket 權限由 Pages `_headers` 提供。

Worker 改名後的網址為 `https://metabear-backend.style78432.workers.dev`，其公開圖片／課程請求轉往主站；原 staging 的 workers.dev 網址不再使用。正式 `metabear.io` 上的 API、登入與 LINE Webhook URL 維持不變。D1 與 Queue 的歷史 staging 名稱保留，不重建或搬移資料。預覽 Pages 沒有正式網域的 Worker routes，後台與 API 回傳 404；/learn 的個人化內容與匯率 API 也不能在 pages.dev 上使用。公開課程可獨立驗收，Pages 預覽設定禁止索引。既有 `preview.metabear.io` 未更動，避免覆蓋 FLOW ARENA 分支的對戰服務。

## Git 連接設定

必須從 Pages 的 **Import an existing Git repository** 建立專案。不要先建立 Direct Upload 專案再期待直接轉成 Git integration。

| 欄位 | 值 |
| --- | --- |
| GitHub repository | `dijkstra1115/MetaBear-LineBot` |
| Project name | `metabear-site` |
| Production branch | `main` |
| Root directory | `pages` |
| Framework preset | None |
| Build command | `npm --prefix .. ci && npm --prefix .. run build:pages` |
| Build output directory | `dist`（相對於 pages） |
| Environment variable | `NODE_VERSION=22` |
| Secrets／資料庫／Queues | 不綁定 |

獨立 `pages/wrangler.jsonc` 避免 Pages 誤讀根目錄的後端設定。Pages 的新部署會自動編譯 `pages/functions/`；`_routes.json` 只讓旁白路徑呼叫 Function，其他網站資源不執行後端。旁白沿用現有受限緩衝的 Range handler，保留語音拖曳播放。

build watch paths 的 Include 已設為 `pages/*`、`public/*`、`web/*`、`scripts/build-site.mjs`、`scripts/build-pages.mjs`、`scripts/build-academy.mjs`、`scripts/build-motion-pages.mjs`、`scripts/deployment-layout.mjs`、`src/lesson-audio.ts`、`package.json`、`package-lock.json`。Cloudflare 的 `*` 在這裡包含子資料夾。`src/` 的一般業務後端修改不需重建網站；網站內容修改 push 到 main 後會自動建置與發布。若新增建置依賴，要同步調整 watch paths。後端仍獨立部署，不自動觸發資料庫 migration。

## 本機驗證

需要 Node.js 22+；本機 PATH 目前是 Node 20，請使用 Node 22+ 或 Codex 提供的 bundled runtime。

```powershell
npm run build:pages
npm run build:backend-assets
npm run check
npm run test:all
npm run check:pages
npm run build:production
```

`check:pages` 使用 Wrangler 的實際 Pages assets handler，驗證 /learn、公開課程、production/preview CSP、缺少頁面的 404、後台資產隔離及標頭規則限制。旁白 Function 的 206 和位元組內容由 `tests/pages-audio.test.ts` 與既有 audio tests 驗證。

## 初次切換順序（已完成，供回復與重建參考）

**不要在 Pages 首次 Git 部署成功前執行新的 `npm run deploy`。** 新設定只含後端資產，過早發布會讓目前仍指向 Worker 的網站失去公開檔案。

1. GitHub App 的 repository access 新增此儲存庫；只需此 repo，不選 All repositories。
2. 提交並 push 此拆分程式到 main，建立上表的 Pages Git 專案，等待建置完成。既有未提交的網站修改由使用者决定是否一起提交，不混入授權操作。
3. 先驗收 pages.dev 的首頁、/learn 文件、課程、JS、圖片、旁白 Range 與缺少頁面的 404。pages.dev 不綁正式後端。
4. 記錄當下 Worker 版本、Custom Domain 與 DNS 設定。先建立上表的後端 path routes，仍使用當下的完整 Worker 版本，確保 API 和 LINE 不會在網站切換時掉線。
5. 解除原 Worker 的 `metabear.io` Custom Domain，把 apex 加入 Pages 的 Custom domains 並透過 Pages 流程建立 DNS；等待 TLS 與網域 active。保留 `www.metabear.io` 的 Worker Custom Domain。
6. 先確認網站由 Pages 提供、/health 與 /webhook/line 仍由原 Worker 接收，再執行 `npm run deploy` 發布只有後端資產的 Worker。保留既有 secrets、D1 和 Queues，不做 migration。
7. 驗收 /admin、/desk 的未登入轉址、/login 與其 JS、同源登入 API 的保護、/content.json、匯率、Webhook 的 POST／簽章限制、新 workers.dev 公開資產轉址、www canonical 與旁白 Range。不要為路由驗證發送實際 LINE 訊息。
8. push 一次可逆的網站內容更新，確認 Pages 的 Git deployment 自動產生且 Worker 版本未改變，再記錄正式完成。

若切換失敗，先恢复記錄的 Worker 版本和 `metabear.io` Worker Custom Domain／DNS origin；停用新增的 Pages apex domain 後恢復。資料庫與佇列未更換，不需要資料回復。不能只回滾 Worker JavaScript，就假設 DNS 或 domain ownership 已一起回復。

## 參考

- [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [Pages redirects](https://developers.cloudflare.com/pages/configuration/redirects/)
