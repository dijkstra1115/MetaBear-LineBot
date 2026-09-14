# MetaBear 網站 + LINE AI + CRM

用戶直接在 LINE 問「我該如何註冊？」，OpenAI 判斷教學主題，Bot 在同一個對話回覆文字與原始教學圖片。使用 **Cloudflare Workers + Queues + D1 + Static Assets**，並提供 CRM 管理。

已確認邀請碼 **ZD0CQ0**。入群要求邀請歸屬、KYC 與已入金；不設最低金額，允許內部轉帳，不要求 LINE 帳號持有證明。新版包含 BingX 自動同步、資格審核與 VIP 邀請發送；啟用方式見 [自動化上線](docs/AUTOMATION.md)。

## 已完成

- LINE 一對一註冊、邀請碼、KYC、入金與 UID 教學；各題可獨立點選，有圖片自動附上，沒有圖片則回文字。
- webhook 驗證簽章後先存入佇列並立即回應；AI 與 LINE 回覆由背景消費者處理，可獨立重試。
- OpenAI Responses API 理解自然提問與上下文；可直接點選問題或自然提問，相關問題按鈕直接顯示問題本身。
- 3D K 線首頁、合約損益互動、完整教學中心與 LINE 導流。
- 使用 Notion 原始註冊、KYC、BitoPro 與 BingX 信用卡圖片；LINE 可分組傳圖，網站可放大翻頁。
- 後台使用 MetaBear 獨立 LINE OTP 登入，僅允許已綁定的指定管理員，不再跳轉 ID3A；設定與復原方式見 [獨立登入](docs/LOGIN.md)。
- UID 登記、推薦關係與入金分別核實；防止同一 UID 重複綁定。
- CRM 客戶名單、人工協助、客服備註、交易偏好、月交易量及操作紀錄。
- 客戶對話紀錄（90 天）、可編輯發布的常見問題知識庫，以及追問上下文；範圍與維護方式見 [對話與知識庫](docs/CONVERSATIONS-KNOWLEDGE.md)。
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

後台「自動審核與同步」設定每個團隊的邀請碼、VIP 連結及自動化開關。UID 提交後可自動查詢 BingX；通過後使用持久發送紀錄傳送邀請，並保留人工客服與已入群確認。交易量同時支援 API 同步與原有人工紀錄，行銷推播仍需訂閱及管理員確認。

### 網站品牌與行情

- `Logo.png` 是原始品牌檔；網站使用 `public/logo.webp`，頁首以 CSS 顯示圓形徽章，頁尾保留完整 Logo。
- 首頁使用固定美元行情快照，資料集中於 `web/market-data.js`，包含報價、日期、每日開高低收數列與來源。更新時一併查證並替換資料，執行 `npm run build:site`。
- BTC／ETH 報價來源為 CoinGecko，K 線來源為 CoinLore，美股為 QQQ（Nasdaq-100 ETF），來源為 Stock Analysis。價格為查詢時快照，走勢為有日期的日 K 線（綠漲紅跌），兩者分別標示日期。
- 不載入外部行情圖表，不自動更新；頁面標示「固定快照 · 非即時行情」。


### 支撐與壓力教學

入口 `/learn?lesson=支撐與壓力`，互動內容位於 `public/lesson-support.js`，網站端註冊於 `public/guide.js`。五個獨立問題共用前半段 K 線，比較反彈、跌破及回測情境；以模擬 OHLC 示意，不代表實際行情。概念參考 Fidelity 支撐與壓力教學，頁內提供來源連結。

### 盤面教學圖文

網站側欄將支撐與壓力、OI、Volume、CVD、Order Book Depth、RSI 分到「盤面教學」，與合約操作分開。`public/lesson-market.js` 維護五個指標主題的問題、短說明與來源；支撐壓力沿用互動圖例。官方圖片來源見 `public/guides/market/SOURCES.md`，中文概念圖可用 `node scripts/create-market-diagrams.mjs` 重建。所有示例均非即時行情；圖片視窗支援細節放大與捲動。這些分類及圖文僅用於網站，不更改 LINE 的課程回覆。

OI、CVD、Volume 現改用 Velo BTC futures 頁面的真實圖表快照，另有同期間價格圖供對照；來源與擷取日期見 `public/guides/velo/SOURCES.md`。原中文 OI/CVD 示意圖與 TradingView 圖保留於素材目錄，但目前不在這三個主題使用。更新圖片時也須檢查對應文字中的日期、交易所、單位與走勢描述。

盤面教學另外加入 Velo「資金費率判讀、清算量、期貨基差」三篇，每篇兩題；以 `marketQuestions` 自動補入網站課程，不更改 LINE 回覆。「資金費率」原合約操作頁保留，新的「資金費率判讀」負責市場圖表解讀。基差排在最後，標示為進一步了解。

### 詳細教學說明

`public/lesson-notes.js` 補充全部 16 個盤面與合約主題，每篇有三個小節，包含概念、假設算例與常見誤判。圖片旁保留短說明，完整內容直接顯示在下方「把觀念看完整」，不需展開。切換回註冊／入金頁時會清空並隱藏；此內容僅供網站使用，不更改 LINE 回覆。數字算例已與真實圖表資料區分。
