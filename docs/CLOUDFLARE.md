# Cloudflare 架構與維護

目前部署與登入資訊見 [STAGING.md](STAGING.md)。新版部署入口是 TypeScript Worker；Python／Zeabur 舊碼保留作參考。

## 架構

- Workers Static Assets：CSS 3D / GSAP 首頁、圖文教學與 CRM。
- Worker：LINE webhook、OpenAI 教學選擇、CRM API、Access JWT 驗證與推播。
- D1：客戶／UID／月交易量／訂閱／操作紀錄／教學上下文／去重／草稿／推播與逐人結果。
- LINE Queue：簽章驗證後持久入隊，HTTP 200 先回覆，消費者完成 AI 與原生圖文回覆。
- Campaign Queue：獨立消費者，避免推播排隊影響 LINE 問答。
- Cron 每 5 分鐘：恢復已確認推播中尚未排入佇列或處理鎖逾時的項目。
- Access：僅指定 email OTP；Worker 再驗證 JWT 與跨站防護。

Node.js 22+。版本由 package-lock.json 固定。compatibility_date `2026-09-11` 與目前 workerd 一致。

## 本機

```powershell
npm ci
# 首次才複製；不要覆寫既有憑證。
Copy-Item .dev.vars.example .dev.vars
npm run types
npm run db:migrate
npm run dev
```

首頁 `http://localhost:8787/`；後台 `/admin` 使用 `.dev.vars` 的本機 ADMIN_TOKEN。development + LINE_DELIVERY_MODE=disabled 才提供示範資料及對話模擬器，並禁止推播。前端來源在 `web/site.js`，`npm run build:site` 產生 public/site.js；dev/build/deploy 都先執行此編譯。

## 推播

1. 客戶名單選月份、進度、交易偏好、交易量上下限及搜尋條件。
2. 「受眾與推播」只包含明確訂閱且未封鎖者。未知交易量不等於零。
3. 草稿儲存條件與內容，不發送。新草稿補上退訂提示。
4. 預覽重新計算受眾，固定月份、訊息內容和逐人名單；最多 500 位，有效 10 分鐘。
5. 按確認才將 run 原子更新為 queued；重按同一次確認不建立新推播。
6. 發送前核對 LINE 額度，逐人再確認訂閱、封鎖與原始篩選條件，不增補預覽以外的用戶。
7. 使用逐人固定 UUID 作為 X-Line-Retry-Key；內容與對象在重試時不變。HTTP 200 或帶 accepted request ID 的 409 記為 LINE 已接受；不代表送達／已讀。
8. 暫時故障採退避與背景恢復，最多 8 次嘗試且限制在 23 小時內；永久錯誤記為 failed，避免無期限重送。狀態保留在 campaign_deliveries，後台顯示彙總。

排程只處理先前按下確認的推播，不自行建立行銷內容或受眾。開發／部署檢查未對真實用戶發送推廣。

## 正式環境遷移

先建立獨立 production Worker、D1 與兩組 Queue／dead-letter Queue，完整配置 env.production。設定 PUBLIC_BASE_URL、ACCESS_TEAM_DOMAIN、ACCESS_AUD、ADMIN_EMAIL，並建立對應路徑的 Access application（保留 webhook 公開）。僅寫入新的 OpenAI／LINE secrets；ADMIN_TOKEN 不能作雲端登入。

先完成 types、check、tests、前端編譯及 dry run，再套用 migration 與部署。若換網域，更新 LINE webhook、圖片 base URL 與 Access destinations；不要只改其中一處。若保留網址，網站更新不需改 LINE 設定。`npm run deploy` 目前固定 staging。

R2、交易所代理 API、自動交易量匯入未啟用；CRM 先手動維護。LINE 圖片證明仍在官方帳號對話查看，不複製到公開素材目錄。

參考：[Workers 最佳實務](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)、[Access JWT 驗證](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[LINE 重試規則](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)。
