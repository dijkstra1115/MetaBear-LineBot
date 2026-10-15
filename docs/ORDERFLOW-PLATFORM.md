# 訂單流平台：資料架構

2026-10-15 起，網站上的訂單流軟體（目前在 `/lab/orderflow/`）不再依賴本機收集器，資料全部放在 Cloudflare 上。因為幣安擋 Cloudflare（[連線實測](ORDERFLOW-CF-PROBE.md)），平台改用 **Bybit BTCUSDT 永續合約**。內部回測與策略案例仍用幣安封存檔（`npm run lab:orderflow`），兩者是不同的市場，數字不能直接對照。

## 組成

```
Bybit WebSocket（成交、1000 檔掛單簿、tickers、爆倉）＋ OKX 爆倉
        │
        ▼
收集器 Durable Object（src/orderflow/collector.ts，亞太，每 10 秒 alarm）
  SQLite：1 分鐘足跡、大單、每分鐘熱力圖欄、5 分鐘 OI 與資金費率、多空比、爆倉
        │
        ▼
Worker metabear-orderflow（src/orderflow/index.ts）── metabear.io/api/orderflow/*
        │  邊緣快取：過去的日子 10 分鐘、即時 3 秒
        ▼
網頁 /lab/orderflow/：歷史向 API 讀；最新幾分鐘直連 Bybit
```

- **共用模組**：`public/lab/orderflow/bybit.js` 解析 Bybit 訊息、建立足跡與掛單簿，網頁、收集器和封存檔匯入共用同一份程式。
- **獨立部署**：Worker 設定在 `wrangler.orderflow.jsonc`，和 CRM 後端（`wrangler.jsonc`）分開。路由 `metabear.io/api/orderflow/*` 比後端的 `metabear.io/api/*` 更具體，會優先比對到這個 Worker。

## 資料來源與限制

| 資料 | 來源 | 說明 |
| --- | --- | --- |
| 足跡（價位 × 主動買賣量） | 收集器即時記錄；過去的日子以 Bybit 每日成交封存檔重建 | 封存檔隔天才出，匯入後會取代收集器同一分鐘的資料 |
| 收集器沒看到的分鐘 | Bybit 1 分鐘 K 線 | 只有價格，沒有足跡與買賣分量；頁面標示「部分分鐘無足跡」，CVD 在這段是平的 |
| 掛單熱力圖 | 收集器每 10 秒讀一次掛單簿，每分鐘存最後一筆 | 只有收集器啟動後的資料；Bybit 1000 檔只涵蓋現價上下約 0.25% |
| OI | tickers 串流，在每個 5 分鐘整點記下整點前的最後讀數；缺的用 REST 歷史補 | 時間都是讀取時間（見 `metrics.js`）。REST 的時間戳語意尚未對照驗證 |
| 多空比 | REST `account-ratio`（全體帳戶） | Bybit 沒有大戶持倉比 |
| 爆倉 | Bybit（完整）、OKX | 網頁另外直連幣安爆倉（每秒最多一筆），但收集器記錄不到幣安 |
| 主動買賣比 | 收集器以自己的成交計算 | 只有收集器的 OI 列才有 |
| 大單（大額成交） | 同一毫秒、同一方向的連續成交合併成一筆（同一張主動單吃多個價位）；只存 ≥ 2 BTC | 收集器即時記錄；封存檔匯入時，會把那一天的大單整天換成封存檔的版本 |
| 資金費率 | 收集器在每個 OI 讀數記下當時的預估資金費率；歷史用 REST 補已結算的費率（每 8 小時） | 歷史段落是階梯狀 |

保存期限（`KEEP_MS`）：訂單流看的是幾小時到幾天，所以只保留足跡、大單、OI、多空比、資金費率和爆倉 30 天；熱力圖每分鐘約 3 KB，是最大的資料，只留 7 天。每小時清理一次。一個月的資料總量大約只有 100～200 MB，遠低於 Durable Object 5 GB 的額度。

## 中斷與補資料

- 物件偶爾會被平台重啟（實測 45 分鐘內一次，約 10～20 秒）。重新連上後，用 REST `recent-trade`（最近 1000 筆，約 1～2 分鐘）補回漏掉的成交；超出範圍的缺口會記在 `/status` 的 `gaps`。
- 每小時用 K 線補最近兩天收集器沒看到的分鐘；隔天再用封存檔匯入，取得完整的足跡。
- 每 5 分鐘的 cron 呼叫 `/wake`，萬一 alarm 鏈中斷也能重新啟動。

## 指標

網頁的「指標」選單可以個別開關每個指標，設定記在瀏覽器的 localStorage。

| 位置 | 指標 | 說明 |
| --- | --- | --- |
| 主圖 | 足跡、斜向不平衡、POC | 「圖表」選單切換成足跡，放大後才會顯示 |
| 主圖 | 成交量分布（POC、VAH、VAL） | 可見範圍內的成交量分布 |
| 主圖 | 掛單熱力圖 | Bybit 1000 檔，現價上下約 0.25% |
| 主圖 | 大單泡泡 | 圓形，面積代表數量，綠色主動買、橘色主動賣；門檻可選 2／5／10／25／50 BTC |
| 主圖 | VWAP ±1σ、±2σ | 每個 UTC 日重新計算，用足跡的價位中點加權 |
| 主圖 | 前日高低點與價值區 | 前一個 UTC 日的高、低、POC、VAH、VAL |
| 主圖 | 爆倉標記 | 三角形：▼ 多單被強平、▲ 空單被強平，依金額分三種大小 |
| 主圖 | 事件、爆倉地圖（估算） | 原有功能 |
| 副圖 | 成交量 | 依主動買賣方向分色堆疊 |
| 副圖 | Delta、CVD | 每根 K 棒的主動買減賣，以及累積值 |
| 副圖 | 爆倉 | 上方空單、下方多單 |
| 副圖 | OI、OI 變化 | OI 變化是每根 K 棒收盤 OI 和前一根的差 |
| 副圖 | 資金費率 | 0 軸以上代表多方付費 |
| 副圖 | 多空比 | Bybit 全體帳戶多空比 |
| 副圖 | 掛單簿失衡 | (買單 − 賣單) ÷ 總掛單，取每根 K 棒最後一個熱力圖欄，只代表現價附近 |

常見但這次沒有做的指標：

- **TPO／市場輪廓**：需要另一種圖表型態。
- **現貨與合約價差（Coinbase 溢價、基差）**：需要現貨資料。
- **多交易所合併的 CVD 與成交量**：目前只有 Bybit。
- **成交筆數與成交速度**：足跡資料沒有存成交筆數。
- **大戶持倉比**：Bybit 不提供。

## API

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/orderflow/btcusdt/day?d=YYYY-MM-DD` | 一個 UTC 日的 `bars`、`prints`、`heat`、`metrics`、`liquidations`（最近 30 天） |
| GET | `/api/orderflow/btcusdt/recent?since=<整分鐘毫秒>` | 最近兩天內某分鐘之後的全部資料，加上收集器狀態 |
| GET | `/api/orderflow/btcusdt/status` | 連線狀態、最後成交時間、缺口、錯誤、各表筆數 |
| POST | `/api/orderflow/btcusdt/import` | 封存檔匯入：`{ rows }` 是足跡；`{ prints, from, to }` 會換掉這段時間內的大單。需要 `Authorization: Bearer <ORDERFLOW_ADMIN_TOKEN>` |

`metrics` 每一列的欄位：`[讀取時間, OI (BTC), OI (USDT), 大戶持倉比, 大戶帳戶比, 全體多空比, 主動買賣比, 資金費率]`。Bybit 沒有的欄位是 `null`。

網頁每 5 秒讀一次 `recent`，`since` 設為最後一根 K 棒前兩分鐘。所有使用者在同一分鐘會讀到同一個網址，所以邊緣快取可以擋掉重複的請求。

## 本機開發

```sh
npm run orderflow:dev                      # Worker + 收集器，http://127.0.0.1:8792（會真的連 Bybit）
npm run lab:orderflow:bybit -- --days 3    # 匯入最近 3 天的封存檔（權杖讀 .dev.vars 的 ORDERFLOW_ADMIN_TOKEN）
npm run preview:academy                    # http://127.0.0.1:8790/lab/orderflow/，/api/orderflow/* 會轉到 8792
```

`?days=N`（1～14，預設 3）可以調整頁面載入幾天的歷史。

## 上線步驟

2026-10-15 已執行第 1～4 步：Worker 上線，匯入了 10/01～10/14。正式環境的匯入權杖存在本機不進版控的 `.data/orderflow/admin-token`。

1. 升級 Workers Paid：一個常駐的物件每天約用 10,800 GB-s，免費方案上限是 13,000 GB-s，而且超過就會直接失敗。
2. `npx wrangler secret put ORDERFLOW_ADMIN_TOKEN -c wrangler.orderflow.jsonc`
3. `npm run orderflow:deploy`，再打開 `/api/orderflow/btcusdt/status` 確認 `bybit`、`okx` 都是 `open`。
4. 匯入歷史：`ORDERFLOW_ADMIN_TOKEN=… npm run lab:orderflow:bybit -- --days 14 --api https://metabear.io/api/orderflow/btcusdt`
5. 網頁的修改 push 到 `main`，Pages 會自動發布。
6. 之後每天匯入前一天的封存檔（目前手動執行，之後可以讓收集器自己做）。

## 下一步

- 收集器每天自動匯入前一天的封存檔（一天約 50 MB gzip，要先實測 DO 的 CPU 與記憶體）。
- 對照驗證 REST OI 的時間戳和串流讀數。
- 帳號、手機版、警報訂閱（VISION 第 3 階段的其餘部分）。
