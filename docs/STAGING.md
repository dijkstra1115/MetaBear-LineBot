# Cloudflare 舊環境部署紀錄

> 2026-09-21 更新：本文下方保留舊環境紀錄。正式服務現使用 `env.production` 與 `https://metabear.io`；`env.staging` 已改為 `https://preview.metabear.io` 的獨立網站／課程驗收站，不含 CRM／LINE 資源。請使用 [目前部署說明](DOMAIN-DEPLOYMENT.md) 的命令，勿把本文舊的 staging 資料庫命令用於新驗收站。

2026-09-14 已部署 MetaBear 網站、LINE AI 圖文客服及 CRM。

- 首頁：<https://metabear-line-crm-staging.style78432.workers.dev/>
- 教學中心：<https://metabear-line-crm-staging.style78432.workers.dev/learn>
- 後台：<https://metabear-line-crm-staging.style78432.workers.dev/admin>
- LINE webhook：<https://metabear-line-crm-staging.style78432.workers.dev/webhook/line>（網址不變）
- Worker：`metabear-line-crm-staging`，帳戶 `d175606a5a8c985f6cfd4c0c9768e6bc`。
- D1：`metabear-crm-staging` / `60f13265-4f4d-4086-9851-ed027c968ee6`，已套用 0001 至 0004；保留既有客戶。
- LINE 佇列：`metabear-line-events-staging`、`metabear-line-events-dead-staging`。
- 推播佇列：`metabear-campaigns-staging`、`metabear-campaigns-dead-staging`。
- 每 5 分鐘排程恢復已確認但尚未完成提交／處理的推播。未確認的預覽不會發送。

## 管理員登入

Cloudflare Access 組織：`id3a.cloudflareaccess.com`。MetaBear 的獨立 application ID：`64a2b21e-6d7a-4c53-9bec-707ddbbc53f1`。

只允許 `style78432@gmail.com`；驗證方式為既有 One-time PIN，登入有效 8 小時。保護 `/admin`、`/admin/*`、`/admin.html`、`/api`、`/api/*`。未修改 ID3A 網站既有政策。

Worker 再次驗證 RS256 JWT、issuer、audience、到期時間與 email；寫入操作還驗證 Origin 與自訂請求 header。**正式／staging 不接受舊 ADMIN_TOKEN 登入**；該金鑰僅適用本機 development + LINE_DELIVERY_MODE=disabled。

使用者已實際輸入 OTP 登入；瀏覽器確認顯示正確管理員 email、既有客戶名單及推播頁。登出從後台按鈕進入 Cloudflare logout。

## 驗證結果

- 22 項本機 workerd/D1/Queues 整合測試全過：JWT 偽造／其他帳戶／到期／跨站操作拒絕；LINE 教學、图片分頁與去重；推播必須確認、額度不足與過期拒絕、退訂／封鎖／分群變更排除、固定 retry key、持久排程恢復。
- 公開首頁、教學、JS 與 17 張 JPEG 可讀取；後台與 API 未登入會轉到 Access，即使帶舊 Bearer 金鑰也一樣。
- LINE 官方 webhook test：`success: true`、`statusCode: 200`。欢迎、註冊、KYC 與兩套入金各三組圖文均通過 LINE 格式驗證。
- 雲端合成客戶測試：自然詢問 BitoPro 入金 → 看圖 → 下一組圖，主題及圖片頁數正確，三個事件皆 done；HTTP acknowledgement 分別 1439／915／928 ms。
- 合成測試不帶 replyToken，未發送 LINE 聊天或行銷訊息；本次合成客戶與事件已清除。
- 已操作桌機／390 px 手機首頁、捲動場景、圖庫放大翻頁、CRM 草稿預覽，以及合約損益方向／保證金控制。

## 維護

```powershell
npm run check
npm test
npm run build:staging
npm run db:migrate:staging
npm run deploy
npx tsx scripts/check-staging.ts
npx tsx scripts/check-queue-staging.ts
```

`deploy` 先編譯前端，再發布 staging。`check-staging` 是公開資源、Access、簽章及 LINE 格式檢查，不發送聊天。`check-queue-staging` 會建立隨機合成客戶，走真實 OpenAI、Queue 與 D1，成功後清除自己的測試資料；中斷時保留供診斷。

測試憑證由使用者授權存入 Workers Secrets；本機副本在 Git 忽略的 `.dev.vars.staging`，不位於 public。換正式金鑰時更新 `OPENAI_API_KEY`、`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`；LINE Secret 與 Token 必須屬於相同 channel。原 webhook 不需因網站更新而變更。

先前無回覆的原因：HTTP webhook 在等待 AI 時遭 LINE 取消。現行架構先持久入隊、回應 HTTP 200，再由 Queue 執行 AI 與 LINE 回覆。Verify 的空事件通過與實際對話回覆是不同檢查；使用者已回報新版對話正常。

網站最終部署版本：b8378454-5e79-4e82-80c7-33f76d5b1955。
