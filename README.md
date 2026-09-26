# MetaBear 網站 + LINE AI + CRM

用戶直接在 LINE 問「我該如何註冊？」，OpenAI 判斷教學主題，Bot 在同一個對話回覆文字與原始教學圖片。使用 **Cloudflare Workers + Queues + D1 + Static Assets**，並提供 CRM 管理。

已確認邀請碼 **ZD0CQ0**。入群要求邀請歸屬、KYC 與已入金；不設最低金額，允許內部轉帳，不要求 LINE 帳號持有證明。新版包含 BingX 自動同步、資格審核與 VIP 邀請發送；啟用方式見 [自動化上線](docs/AUTOMATION.md)。

## 已完成

- LINE 一對一註冊、邀請碼、KYC、入金與 UID 教學；各題可獨立點選，入金每次一張圖配一段說明，卡片保留前後步驟與選單按鈕。
- webhook 驗證簽章後先存入佇列並立即回應；AI 與 LINE 回覆由背景消費者處理，可獨立重試。
- 明確指令、知識庫詞彙與高信心規則先處理，必要時才由 OpenAI Responses API 從前五個候選主題判斷自然提問與上下文。
- 3D K 線首頁、合約損益互動、完整教學中心與 LINE 導流。
- 使用 Notion 原始註冊、KYC、BitoPro 與 BingX 信用卡圖片；LINE 與網站共用入金逐張教材；LINE 可逐步點選，網站可放大翻頁。
- 後台使用 MetaBear 獨立 LINE OTP 登入；管理員進入 `/admin`，也可進 `/desk` 發送報單。其他分析師進入 `/desk` 且看不到客戶名單。設定見 [獨立登入](docs/LOGIN.md)。
- UID 登記、推薦關係與入金分別核實；防止同一 UID 重複綁定。
- CRM 客戶名單、可通知／認領／暫停 Bot 的人工協助案件、客服備註、交易偏好、月交易量、路由品質指標及操作紀錄。
- 客戶對話紀錄（90 天）、可編輯發布的常見問題知識庫，以及追問上下文；範圍與維護方式見 [對話與知識庫](docs/CONVERSATIONS-KNOWLEDGE.md)。
- 用戶自願訂閱／退訂行銷通知；分析師報單另由用戶在 LINE 自選品項，送出後立刻一對一推播，管理員可急停。
- 開倉欄位、槓桿、逐倉／全倉、市價／限價、停損／強平、資金費率與既有五種指標說明。
- 開發環境提供對話模擬器與示範資料，方便走完整流程。

**Cloudflare 測試環境已部署，LINE webhook 已接上並通過官方驗證。** 已修正等待 AI 時 HTTP 連線被取消、無法回覆的問題，測試與維護方式見 [測試環境](docs/STAGING.md)。

## 開始使用

### 隨機 maker／taker 流動性實驗

執行 `npm run preview:academy`，開啟[流動性實驗室](http://127.0.0.1:8790/orderflow/liquidity-lab.html)。四個市場重播同一串隨機 taker 訂單，只改 maker 限價單的到達率；並排比較 K 線、價差、成交率與空簿時間，另附 40 組種子的平均結果。方法與解讀界線見[實驗說明](docs/LIQUIDITY-LAB.md)。

另可開啟[隨機限價委託的連續市場](http://127.0.0.1:8790/orderflow/taker-only.html)：每筆固定 1 BEAR，在最新成交價 ±1% 內隨機出價，能撮合就成交，剩餘量留在簿上。成交 K 線背後疊加歷史掛單熱圖；可暫停、改速度、換種子，並即時調整掛單保留時間與觀察到期撤單量。模擬沒有固定結束時間。

也可開啟[報價方向對照](http://127.0.0.1:8790/orderflow/taker-compare.html)：同種子並排比較「買賣方向獨立隨機」與「抽到現價下方就賣、上方就買」兩種限價委託模式。只有目標價碰到可成交對手價才撮合，否則掛單。兩張 K 線共用價格座標，並列顯示成交率、當下簿上量與到期撤單。

舊版交易學院集中保存在 `public/orderflow/legacy/`，總覽入口 `/orderflow/legacy/`；版本與相容連結見 [舊版教學整理](docs/ACADEMY-LEGACY.md)。

互動學院本地預覽：執行 `npm run build:site`；確認 8790 尚未運作時才執行 `npm run preview:academy`，開啟 [課程地圖](http://127.0.0.1:8790/orderflow/courses.html)。18 堂課皆可觀看，可搜尋並篩選「可觀看／本次更新／完整規劃」，三條建議路線不限制自由選看。沿用統一側欄、前置概念連結、連續播放、固定短字幕與整課正反回拖。

市場故事以多根K線開場，再放大同場回看。吸收、突破、撤單已合併為48秒的「突破誘多，高位吸收，反轉出貨」；足跡、熱圖、量柱、CVD沿同一份帳本演出。另保留上影線約144秒、回踩吸收版放量突破40秒、訂單塊40秒。兩個合併前網址會自動進入新課。詳見 [學院交接](docs/ACADEMY-HANDOFF.md)。正式入口為 [互動學院](https://metabear.io/orderflow/)，手機支援直式閱讀、課程抽屜、橫向劇院與細節放大。

依本地審核移除「橫盤換手，籌碼到了誰手上？」；[訂單塊到底長怎樣？](http://127.0.0.1:8790/orderflow/order-block.html) 重製為 40 秒，從宏觀 K 線走進大買家分批承接與主動完成剩餘買量的過程，再回到同一全景。定義、BIS／CME 機制來源、原始 ICT 定義差異與分鏡見 [訂單塊課程文件](docs/ORDER-BLOCK-LESSON-PLAN.md)。既有課程保留；本輪依使用者授權補齊手機版並部署，詳見 [手機與發佈](docs/ACADEMY-MOBILE-RELEASE.md)。詳見 [課程架構](docs/ACADEMY-CURRICULUM.md) 與 [設計語言](docs/ACADEMY-DESIGN-LANGUAGE.md)。

新 session 接續審核或修改，請先閱讀 [互動學院交接指南](docs/ACADEMY-HANDOFF.md)，內含最新完成度、已確認的美感與鏡頭標準、數字設定及驗收流程。

### 訂單流量化研究室（獨立服務）

原始行情收集：`npm run quant:collect`，獨立保存 BTC／ETH 永續 50／1000 檔訂單簿更新與現貨／永續逐筆成交，含斷線紀錄及回放驗證。詳見 [原始訂單流收集器](docs/QUANT-RECORDER.md)。

執行 `npm run quant`，開啟 <http://127.0.0.1:8788/lab/jev>。使用 Bybit 公開 BTC／ETH 行情、自建模擬帳本、訂單流規則策略與可視化；不需交易所 key，不連接真實下單。Jev 尚未接入。此服務需要 Node 22.13+，不隨 CRM Worker 部署；啟動、算法、回放與限制見 [量化研究室](docs/QUANT-LAB.md)。

### LINE CRM

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

網站側欄將支撐與壓力、OI、Volume、CVD、Order Book Depth、RSI 分到「盤面教學」，與合約操作分開。LINE 同樣提供這些主題的圖文翻頁，並標示示意／歷史截圖、非即時行情。互動 K 線仍在網站。

OI、CVD、Volume 現改用 Velo BTC futures 頁面的真實圖表快照，另有同期間價格圖供對照；來源與擷取日期見 `public/guides/velo/SOURCES.md`。原中文 OI/CVD 示意圖與 TradingView 圖保留於素材目錄，但目前不在這三個主題使用。更新圖片時也須檢查對應文字中的日期、交易所、單位與走勢描述。

盤面教學另外加入 Velo「資金費率判讀、清算量、期貨基差」三篇，每篇兩題；以 `marketQuestions` 自動補入網站課程，不更改 LINE 回覆。「資金費率」原合約操作頁保留，新的「資金費率判讀」負責市場圖表解讀。基差排在最後，標示為進一步了解。

### 詳細教學說明

`public/lesson-notes.js` 補充全部 16 個盤面與合約主題，每篇有三個小節，包含概念、假設算例與常見誤判。圖片旁保留短說明，完整內容直接顯示在下方「把觀念看完整」，不需展開。切換回註冊／入金頁時會清空並隱藏；此內容僅供網站使用，不更改 LINE 回覆。數字算例已與真實圖表資料區分。
