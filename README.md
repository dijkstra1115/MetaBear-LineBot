# MetaBear 網站 + LINE AI + CRM

用戶直接在 LINE 問「我該如何註冊？」，OpenAI 判斷教學主題，Bot 在同一個對話回覆文字與原始教學圖片。使用 **Cloudflare Workers + Queues + D1 + Static Assets**，並提供 CRM 管理。

已確認邀請碼 **ZD0CQ0**、入群門檻 **200 USDT**；交易量先按月手動紀錄。

## 已完成

- LINE 一對一註冊、邀請碼、KYC、入金與 UID 教學；可選文字／圖片。
- webhook 驗證簽章後先存入佇列並立即回應；AI 與 LINE 回覆由背景消費者處理，可獨立重試。
- OpenAI Responses API 理解自然提問與上下文；「看圖」「文字就好」「註冊完成了，接下來呢」能接續目前教學。
- 3D K 線首頁、合約損益互動、完整教學中心與 LINE 導流。
- 使用 Notion 原始註冊、KYC、BitoPro 與 BingX 信用卡圖片；LINE 可分組傳圖，網站可放大翻頁。
- 後台使用 Cloudflare Email OTP，只允許管理員 email；Worker 驗證 JWT 與操作來源。
- UID 登記、推薦關係與入金分別核實；防止同一 UID 重複綁定。
- CRM 客戶名單、人工協助、客服備註、交易偏好、月交易量及操作紀錄。
- 用戶自願訂閱／退訂；依偏好與月交易量分群，草稿 → 預覽 → 確認推播 → 逐人背景送出與狀態紀錄。
- 開倉欄位、槓桿、逐倉／全倉、市價／限價、停損／強平、資金費率與既有五種指標說明。
- 開發環境提供對話模擬器與示範資料，方便走完整流程。

**Cloudflare 測試環境已部署，LINE webhook 已接上並通過官方驗證。** 已修正等待 AI 時 HTTP 連線被取消、無法回覆的問題，測試與維護方式見 [測試環境](docs/STAGING.md)。

## 開始使用

需要 Node.js 22+。首次設定：

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
# 編輯 .dev.vars，設定隨機且至少 32 字元的 ADMIN_TOKEN。
npm run types
npm run db:migrate
npm run dev
```

開啟 [本機後台](http://localhost:8787/admin)，輸入 `.dev.vars` 中的管理金鑰。
公開教學頁：[BingX 新手教學](http://localhost:8787/learn)。

本次已建立本機 `.dev.vars`、資料庫及示範名單，不必再次複製設定檔。

## 檢查

```powershell
npm run check
npm test
npm run build
```

`build` 只執行部署 dry run。`deploy` 才會發布至 Cloudflare。

## 結構

| 路徑             | 用途                                        |
| ---------------- | ------------------------------------------- |
| src/content.ts   | 邀請資訊、教學、固定概念題庫                |
| src/assistant.ts | OpenAI 判斷教學主題／格式、例外備援         |
| src/bot.ts       | LINE 對話流程與每位用戶的教學上下文         |
| src/webhook.ts   | 驗證簽章、事件去重、回覆與重試              |
| src/admin.ts     | CRM、交易量、受眾與草稿 API                 |
| public/          | 後台、用戶教學頁與原始圖片                  |
| migrations/      | D1 資料表                                   |
| tests/           | 本機 Workers / D1 整合測試                  |
| app/、alembic/   | 保留的 Python / Zeabur 舊版，非新版部署入口 |

[LINE AI 接線與驗收](docs/LINE-AI.md) · [產品與流程說明](docs/PRODUCT.md) · [Cloudflare 部署步驟](docs/CLOUDFLARE.md) · [舊版 README](docs/LEGACY_README.md)

第一版人工核實與客服回覆在 LINE 官方帳號進行；不會自動確認推薦歸屬、轉移 KYC 或發送入群邀請。推播已可在後台預覽並確認送出；交易量先手動紀錄，代理報表自動匯入尚未串接。

