# BingX 自動審核與 CRM

## 本次部署狀態（2026-09-14）

Staging Worker 已透過 Cloudflare MCP 部署，版本 `27b99257f85c4060835e82da8b5770b7`；遠端 migrations 已套用至 0005，原有 Queue、Cron、LINE secrets 與 Access 保留。私人 VIP 連結與邀請人 UID 已設定。40 項測試通過，TypeScript 與 staging dry run 通過；本機後台介面已驗收，雲端公開健康檢查正常，管理 API 轉向 Access 登入。

**已啟用並完成真實 UID 審核與 LINE 接受發送驗證。** 使用者明確同意後，BINGX_API_KEY 與 BINGX_SECRET_KEY 已保存為 staging Worker secrets，團隊 revision 3 已開啟自動化。UID 33289218 起初因 workerd 不支援 `redirect: error` 而失敗；改成 `manual` 並拒絕非成功回應後，同一個工作已完成，資格 eligible。LINE 於 2026-09-14 15:36:57（台北）接受 VIP 訊息，實際已讀／入群仍分開確認。新增 workerd 整合測試防止此相容性問題重現，總計 43 項測試通過。

## LINE 選單與網站入口

本次修正與網站更新部署版本：`1cac5aaba45f4068b37b4e12e40b4480`。首頁桌面與 390 × 844 手機版已檢查，網站引流連結已確認對應 `@804bmpkh`。

2026-09-14 已設置六格新版選單：登記 UID、審核進度、新手教學、入金教學、交易學習、人工協助。圖片為 `public/line-rich-menu.png`（2500 × 1686，約 139 KB），可編輯來源由 `scripts/create-rich-menu.mjs` 產生 SVG 再輸出 PNG。樣式沿用網站深藍、薄荷綠、金色；沒有 AI 開關或直接公開 VIP 邀請。

新版 ID：`richmenu-054f3dc4424f06d4f03700563a6fcb93`。舊版 `richmenu-36d9d4965d1118b5ec04f33001918f43` 保留，可用 LINE default rich menu API 切回。對應官方帳號 basic ID 為 `@804bmpkh`（MetaBear 小幫手）。安裝操作透過可信 Queue 的 `line-menu-install` 執行，或由 Access 管理員 POST `/api/line/rich-menu` 排程；稽核紀錄保存新舊 ID 及結果。最多處理 100 個已知客戶的個別選單覆蓋，較大團隊需另行分批處理。

用戶訊息與 postback 在處理回覆前呼叫 LINE 官方 loading/start，最長 60 秒，新訊息送达後自動消失。LINE 僅在用戶開著一對一對話時顯示，不會為動畫另發通知。動畫失敗不阻止正常回覆。網站首頁主按鈕及浮動入口引導至 LINE，提供 UID 登記說明。

## 業務流程

用戶在 LINE 登記 UID → 工作佇列查詢 BingX → 核對團隊邀請碼、邀請關係、KYC 與已入金狀態 → 通過後透過 LINE 傳送私人 VIP 連結。無最低入金金額，預設允許內部轉帳。不要求用戶提供帳號持有證明；同一團隊仍限制重複 UID 登記。

AI 負責理解問題與教學，資格由明確 API 規則判定，不由模型猜測。BingX 的 deposit=true 為目前已入金依據；明細保存內部轉帳類型，但不假造不存在的「已完成」欄位。僅內部轉帳帳號的 deposit 語意仍需以更多樣本驗證。

資格未知、API 異常、分頁不完整、UID 不符、設定變更或超過一小時的結果均不發送邀請。用戶可回覆「進度」或「重新查詢」重新排程。

## 後台操作

- 「自動化」設定團隊名称、邀請碼、選用上級 UID、允許間接邀請與內部轉帳、客服及 VIP 連結，查看整合狀態與最近工作。
- 客戶明細可查看 KYC、邀請歸屬、入金、註冊日期、餘額、等級、返傭及福利資訊，立即同步，設定負責人與標籤。
- 每日交易量、佣金、應收手續費、抵扣與實收手續費按 all / perpetualFutures / spot 分開保存。all 已包含分類，不得再次相加。
- 近 7 / 30 日交易量、活躍日數、最後觀察交易日、月份彙總与資料涵蓋期間可用於追蹤。列表月份彙總只有涵蓋整月（當月截至昨日）的 API 資料才取代手動資料；詳細頁月份數值是已觀察區間合計。
- 分眾支援交易量、7 / 14 / 30 日未交易、負責人、標籤與資格。未交易分眾要求完整且近期的查詢覆蓋；未知資料不冒充零。推播仍走既有預覽、確認及訂閱過濾流程。
- LINE 接受訊息不等於已讀或已入群。「已入群」由客服填写核對依據確認，留存稽核紀錄。

## 資料與更新

`exchange_snapshots` 保存最新資格、規則版本與查詢時間；`daily_metrics` 保存十進位字串；`metric_coverage` 保存查詢範圍；`deposit_records` 保存近 60 日查得的入金明細；`crm_jobs`、`vip_deliveries` 與 `audit_log` 保存工作與發送狀態。

首次與完整同步抓取近 60 個完整日，台北時區，依 30 日分段查詢。之後每日重新抓取近期區間並覆寫修訂值，舊日資料持續保留。尚未涵蓋的歷史不是完整生命週期總額。API 未提供唯一入金流水號時，以 UID、時間、類型、幣別與金額去重，極少數完全相同明細可能合併，因此明細不作資金對帳帳本。交易量清單篩選使用 SQLite 數值；精確金額加總在明細使用十進位運算。

每 5 分鐘的 Cron 排程處理待查資格與每日同步，單次最多新增 20 個完整同步、20 個資格同步。BingX 全域鎖限制串行查詢並節流；資料較多時會逐批完成，不保證所有客戶同時更新。工作最多重試 8 次，永久失敗冷卻一天後再排程，管理員可立即要求同步。

VIP 發送有持久化 outbox，LINE 重試沿用相同 UUID 與訊息內容；最長 23 小時、最多 8 次。失敗或期限超過需客服核對 LINE 紀錄，避免盲目重送。過期或設定變更取消的已嘗試訊息不自動建立新邀請。停用自動化停止新的同步與發送；既有已被 LINE 接受的訊息不能撤回。

## 部署與驗收

1. 安裝依賴，執行 `npm run check`、`npm test`、`npm run build:staging`。
2. 套用 `0005_bingx_automation.sql`，保留 0001–0004 與既有資料。CLI 可執行 `npm run db:migrate:staging`；也可透過已授權的 Cloudflare MCP D1 query 執行並登記 d1_migrations。
3. Worker secrets 設定 `BINGX_API_KEY`、`BINGX_SECRET_KEY`，另須原有 LINE channel secret/access token。不要放在公開 vars、前端、Git 或稽核日誌。
4. 部署 Worker 與 public 靜態資產，保留 D1、兩組 Queue、Access、Cron 與原有 secrets。CLI 使用 `npm run deploy`，MCP 使用 Workers upload API 與 static assets direct upload。
5. Cloudflare Access 限制 `/admin`、`/admin.html` 及 `/api/*`，Worker 自身也驗證 Access JWT、指定管理員及修改來源。設定私人 VIP 連結並啟用自動化。
6. 用已授權的測試 UID 經 LINE 登記，確認資格、數據、VIP 送達與重送抑制；實際入群另行確認。測試程序以 mock LINE，不會向客戶發訊息。

## 提供其他團隊使用

目前採「每團隊獨立部署」：每隊獨立 Worker、D1、Queue、LINE Channel、BingX 憑證與 Access 設定，避免跨團隊讀寫。使用 `node scripts/create-team-config.mjs <slug> <D1 UUID> <管理員 email> <Access team domain> <Access AUD>` 產生獨立設定範本，再建立對應資源、套用 migrations、設定 secrets 與後台團隊資料。

這是可運作的獨立團隊版本；集中租戶開通、自助購買、帳單與多角色權限不包含在目前版本。

## 官方參考

- [BingX 代理 API](https://github.com/BingX-API/api-ai-skills/blob/main/skills/agent/api-reference.md)
- [Cloudflare 靜態資產直接上傳](https://developers.cloudflare.com/workers/static-assets/direct-upload/)
- [LINE 重試失敗 API 呼叫](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
