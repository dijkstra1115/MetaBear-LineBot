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
| 掛單熱力圖 | 收集器每 10 秒存一次完整掛單簿（$1 格距，約 2.4 KB），另外每分鐘存一欄 $10 格距的 | 只有收集器啟動後的資料；Bybit 1000 檔只涵蓋現價上下約 0.25%，這是交易所的上限 |
| OI | tickers 串流，在每個 5 分鐘整點記下整點前的最後讀數；缺的用 REST 歷史補 | 時間都是讀取時間（見 `metrics.js`）。2026-10-17 對照驗證：收集器即時讀的 350 筆和 REST 同一時間戳的值完全相同，錯開 5 分鐘則幾乎都不同，所以 REST 的時間戳就是讀取時間，不必像幣安封存檔那樣位移。REST 補的列 USD 金額是用 OI × 前一分鐘收盤價換算的 |
| 多空比 | REST `account-ratio`（全體帳戶） | Bybit 沒有大戶持倉比 |
| 爆倉 | Bybit（完整）、OKX | 網頁另外直連幣安爆倉（每秒最多一筆），但收集器記錄不到幣安 |
| 主動買賣比 | 收集器以自己的成交計算 | 只有收集器的 OI 列才有 |
| 大單（大額成交） | 同一張主動單的所有成交合併成一筆；只存 ≥ 2 BTC | 即時資料用 Bybit 的撮合序號 `seq` 合併，是準確的。封存檔沒有 `seq`，只能把同一毫秒、同一方向的連續成交合併，是估算（30 秒的實測樣本中，314 組裡有 110 組其實混了好幾張單）。所以收集器即時記錄的大單會保留，封存檔只補沒有即時大單的分鐘 |
| 資金費率 | 收集器在每個 OI 讀數記下當時的預估資金費率；歷史用 REST 補已結算的費率（每 8 小時） | 歷史段落是階梯狀 |

保存期限（`KEEP_MS`）：訂單流看的是幾小時到幾天，所以所有資料（足跡、大單、掛單簿、OI、多空比、資金費率、爆倉、通知紀錄）都只保留 30 天，每小時清理一次。最大的是每 10 秒的掛單簿，30 天約 520 MB；全部加起來約 0.7 GB，在 Durable Object 5 GB 的額度內。

## 中斷與補資料

- 物件偶爾會被平台重啟（實測 45 分鐘內一次，約 10～20 秒）。重新連上後，用 REST `recent-trade`（最近 1000 筆，約 1～2 分鐘）補回漏掉的成交；超出範圍的缺口會記在 `/status` 的 `gaps`。
- 每小時用 K 線補最近兩天收集器沒看到的分鐘；隔天收集器會自己匯入封存檔，取得完整的足跡（見下一節）。

## 每日封存檔自動匯入

收集器每天自己下載前一個 UTC 日的 Bybit 成交封存檔（`public.bybit.com/trading/BTCUSDT/BTCUSDT<日期>.csv.gz`），重建足跡和大單，不必再手動執行 `lab:orderflow:bybit`。

- **時間**：封存檔隔天約 01:10 UTC 出現（10/14 的檔案實測如此）。UTC 日結束 1 小時後第一次嘗試；檔案還沒出現（HTTP 404）就每 15 分鐘再試。超過 6 小時還沒有，會在 `/status` 的 `errors` 記一筆。請求要帶 `User-Agent`，否則 Bybit 的 CloudFront 會回 403（Workers 預設不帶）。
- **串流處理**：用 `DecompressionStream` 邊下載邊解壓、逐行解析，不會把整個檔案放進記憶體；解析用 `bybit.js` 的 `ArchiveDay`，和匯入腳本同一份程式，結果逐位元組相同。
- **分段**：每次 alarm 處理 40 萬行，處理中 alarm 改成每秒一次。每分鐘做完就寫入：足跡以 `src='archive'` 取代即時與 K 線的列，大單則把這段時間的整段換成封存檔的版本。
- **中斷續傳**：下載中斷或物件重啟時，記下最後完成的分鐘（meta `archiveCursor`），重試時重新下載並跳過已寫入的分鐘。失敗會記在 `errors`，間隔 5、10、15… 分鐘重試（最多 60 分鐘）。
- **紀錄**：最後匯入的日子存在 meta `archiveDone`，`/status` 的 `archive` 顯示 `last` 和目前狀態（`waiting`、`importing`、`retrying`、`done`）。收集器停擺後，最多往回補 3 天；更早的日子用腳本補。
- **實測**（10/02，190 萬筆成交、72 MB gzip）：Node 22 解析約 1.3 秒、heap 14 MB；在 workerd 裡分 5 段完成，每段約 0.75 秒，遠低於 DO 每次呼叫 30 秒 CPU 與 128 MB 記憶體的上限，所以不需要調高 `limits.cpu_ms`。
- **手動催一次**：`POST /api/orderflow/btcusdt/archive`（同一個權杖）會略過等待，馬上嘗試待匯入的那一天。
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
| 主圖 | 前日高低點與價值區 | 前一個 UTC 日的高、低、POC、VAH、VAL，和警報用同一套算法（`keylevels.js`） |
| 主圖 | 爆倉標記 | 三角形：▼ 多單被強平、▲ 空單被強平，依金額分三種大小 |
| 主圖 | 事件 | 即時模式顯示收集器記下、發生在關鍵位的事件（`/events`），和 LINE 警報是同一份紀錄，每 30 秒更新；回放模式沒有收集器紀錄，仍在網頁上用 `signals.js` 偵測 |
| 主圖 | 爆倉地圖（估算） | 原有功能 |
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

## 網頁通知（所有訪客）

實驗室標題列的「通知」選單（`public/lab/orderflow/notify.js`）讓任何開著網頁的人勾選事件類型，收到 `/events` 裡的新事件，也就是發生在關鍵位、和 LINE 警報同一份紀錄的事件。分頁在背景時跳系統通知，在前景時顯示頁面內提示框；LINE 內建瀏覽器、沒有加入主畫面的 iPhone 和封鎖通知的瀏覽器只有提示框。`notify-sw.js` 是只為 Android Chrome 顯示通知而註冊的 service worker，不處理任何請求。細節見 [ORDERFLOW-ALERT-SUBSCRIPTION.md](ORDERFLOW-ALERT-SUBSCRIPTION.md)。

## 通知（目前只推給管理員）

收集器在 `public/lab/orderflow/watch.js` 監看即時資料，事件經 CRM 後端（`src/orderflow-alert.ts`，透過 service binding `BACKEND`）推到管理員綁定的 LINE。後端沿用既有的管理員頻道與 LINE 權杖，`LINE_DELIVERY_MODE` 不是 `live` 時不會送出。

| 事件 | 規則（預設門檻） |
| --- | --- |
| 🐋 大單 | 同一張主動單合計 ≥ 50 BTC |
| 💥 連環爆倉 | 同一方向 60 秒內爆倉 ≥ $2M（Bybit＋OKX） |
| 📊 OI 急變 | 5 分鐘 OI 變化的 z 分數 ≥ 3（以過去一天為基準），且幅度 ≥ 0.4%；依價格方向判讀成新多、新空、空回補、多平倉 |
| 🧱 掛單牆 | 某個 $10 價位帶掛單 ≥ 60 BTC，且 ≥ 全簿中位數的 4 倍，持續 60 秒；之後消失時，依價格有沒有碰到該價位，回報「被吃掉」或「撤單」 |
| 🎭 疑似誘單（Spoofing） | 某個 $10 價位帶原本掛 ≥ 100 BTC 且 ≥ 全簿中位數的 4 倍、已經掛了至少 10 秒，不是最佳買價或賣價所在的價位帶（那裡的報價本來就會隨價格一直撤掉重掛），在價格距離它不到 0.1% 時，1 秒內少了 ≥ 100 BTC，而且這 1 秒在該價位帶的成交量不到消失量的 2 成。每次掛單簿更新（約每 0.2 秒）都檢查；同一道牆不會再被回報成「撤單」 |
| 🧊 冰山 | 同一價格成交 ≥ 25 BTC，且 ≥ 該價位顯示過的最大量的 3 倍，價位還在（持續補單） |
| 🛡️🪝↔️🧲🚀 K 棒事件 | 每根 5 分 K 收盤後 15 秒，對剛收盤的那根跑 `signals.js` 的吸收、掃蕩收回（掃過關鍵位後收回，關鍵位來自 `LevelBook`，包含 VWAP 與堆疊區）、CVD 背離、不平衡區回測、放量突破；同一種事件、同一方向 30 分鐘內只記一次。收集器重啟後只檢查最新一根 |

- 同一種事件、同一方向或同一價格，10 分鐘內只通知一次。重連後補回的舊成交和爆倉不會觸發通知。
- 每分鐘最多推一則，多個事件合併在一起，最多列 8 行，附上那一分鐘的分享連結。每天（台灣時間）最多 `dailyCap` 則（預設 3；LINE 目前是免費方案，每月 200 則要和其他推播共用），超過就只記錄不推送。
- **關鍵位過濾（影子模式）**：市場事件會標上最近的關鍵位（前一個 UTC 日的高、低、POC、VAH、VAL，當天 VWAP，未回測的堆疊區；`public/lab/orderflow/keylevels.js`）。`levelOn=1`（預設）時，離所有關鍵位超過 `levelTolPct`（0.1%）的事件記成「不在關鍵位」，同一種事件在同一個關鍵位 `levelCooldownMs`（60 分鐘）內重複的記成「同一關鍵位冷卻中」，兩者都不推送。關鍵位以 UTC 日（台灣早上 8 點）換日，和網頁畫的前日關鍵位一致（2026-10-22 起，理由見 [ORDERFLOW-ALERT-SUBSCRIPTION.md](ORDERFLOW-ALERT-SUBSCRIPTION.md)）。每個市場事件都記下價位、方向，以及是否在關鍵位 0.1% 以內（`near`），不受 `levelOn` 影響。細節與回測見 [ORDERFLOW-KEYLEVEL-ALERTS.md](ORDERFLOW-KEYLEVEL-ALERTS.md)。
- 門檻可以不用重新部署就調整：`POST /api/orderflow/btcusdt/alerts`，body 帶 `{ "config": { "printBtc": 80 } }`；帶 `{ "config": null }` 恢復預設，帶 `{ "test": true }` 會送一則測試通知。`GET` 同一路徑可以看目前門檻和最近 50 則事件。這兩個都要帶管理權杖。
- 牆、誘單與冰山只看得到 Bybit 1000 檔的範圍（現價上下約 0.25%）。牆和冰山每 10 秒檢查一次，誘單則是每次掛單簿更新就檢查。
- 誘單只代表「大量掛單在價格接近時被撤掉」，不一定是惡意操縱；做市商調整報價也會出現同樣的樣子。2026-10-17 本機試跑時，用 50 BTC、3 倍、3 秒的門檻大約每分鐘就會標一次，多半是最佳報價第二、三檔被移動，所以預設改得和掛單牆一樣嚴格。

### 開關、健康通知與管理頁

- **開關**：`marketOn`（市場事件）和 `healthOn`（收集器健康）都可以設為 0。關掉時事件照樣記錄，狀態顯示「已關閉」，只是不推送。
- **健康通知**：Bybit 沒有成交超過 2 分鐘、OKX 斷線超過 5 分鐘時通知一次，恢復時再通知一次；某天的封存檔重試 3 次仍失敗，或過了隔天 06:00（UTC）還沒發布，通知一次；10 分鐘內出現 10 個以上錯誤，最多每小時通知一次。每日上限只限制市場通知，不會擋住健康通知。
- **收集器整個沒回應**：收集器自己沒辦法回報，所以由 Worker 每 5 分鐘的 cron 偵測，持續期間每 30 分鐘直接透過後端通知一次。
- **管理頁**：`/lab/orderflow/alerts.html`，輸入管理權杖（`ORDERFLOW_ADMIN_TOKEN`，正式環境的存在本機 `.data/orderflow/admin-token`）後，可以開關兩種通知、調整門檻（時間類以秒顯示）、送測試通知，並查看最近 50 則事件和各自的狀態。

## 網頁效能

新成交只會重算最新的那根 K 棒（約每 0.3 秒一次）；收到更早時段的新資料、開新 K 棒或切換週期時，才完整重算。頁面在背景時不計算，回到前景再一次補上。細熱力圖每一欄的價位合併只做一次。長時間開著時，只保留最近 12 小時的細掛單簿，舊的需要時再載入。

2026-10-17 在 iPhone 尺寸、CPU 降速 4 倍下量測 60 秒，主執行緒忙碌比例：1 分 K 從 31% 降到 15%（JavaScript 23% → 9.7%），15 分 K 從 21% 降到 12.6%；記憶體從 23 MB 降到 18 MB。

## 分享

網頁的「分享」選單會產生目前畫面的連結（`?tf=&mode=&at=&ind=&pm=`），可以複製或分享到 LINE。先點一根 K 棒，對方打開時會直接選在那一根。指標設定只套用在這次瀏覽，不會覆蓋對方自己存的設定。`og.png` 是 LINE 預覽卡用的 1200×630 圖，用正式網站的圖表截圖合成，畫面改版時要重新產生。

## API

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/orderflow/btcusdt/day?d=YYYY-MM-DD` | 一個 UTC 日的 `bars`、`prints`、`heat`、`metrics`、`liquidations`（最近 30 天） |
| GET | `/api/orderflow/btcusdt/recent?since=<整分鐘毫秒>` | 最近兩天內某分鐘之後的全部資料，加上收集器狀態 |
| GET | `/api/orderflow/btcusdt/status` | 連線狀態、最後成交時間、缺口、錯誤、各表筆數、封存檔匯入狀態（`archive`） |
| POST | `/api/orderflow/btcusdt/import` | 封存檔匯入：`{ rows }` 是足跡；`{ prints, from, to }` 會換掉這段時間內的大單。需要 `Authorization: Bearer <ORDERFLOW_ADMIN_TOKEN>` |
| POST | `/api/orderflow/btcusdt/archive` | 馬上嘗試待匯入的每日封存檔（略過重試等待）。權杖同上 |
| GET | `/api/orderflow/btcusdt/book?from=<對齊 30 分鐘的毫秒>` | 30 分鐘的細掛單簿（每 10 秒一欄、$1 格距），網頁在 1、5 分 K 時使用 |
| GET | `/api/orderflow/btcusdt/events?since=<整分鐘毫秒>` | 30 天內某分鐘之後、發生在關鍵位的市場事件（最多最新 2,000 則，舊到新）：`t`、`kind`、`price`、`side`、`level`、`dist`、`repeat`（同一關鍵位冷卻中）、`text`。不含推送狀態，不需要權杖；邊緣快取 10 秒 |
| GET/POST | `/api/orderflow/btcusdt/alerts` | 通知門檻與最近的事件；POST 可調整門檻或送測試通知。權杖同上 |

`metrics` 每一列的欄位：`[讀取時間, OI (BTC), OI (USDT), 大戶持倉比, 大戶帳戶比, 全體多空比, 主動買賣比, 資金費率]`。Bybit 沒有的欄位是 `null`。

網頁每 5 秒讀一次 `recent`，`since` 設為最後一根 K 棒前兩分鐘。所有使用者在同一分鐘會讀到同一個網址，所以邊緣快取可以擋掉重複的請求。

逐筆即時的部分不經過我們：網頁自己直連 Bybit WebSocket（成交、掛單簿、tickers），每筆成交 0.3 秒內重畫。合併規則：

- 網頁開啟後完整收到的分鐘，用網頁自己算的版本；開啟當下那一分鐘只收到一部分，用收集器的版本。
- 連線中斷再重連時，Bybit 不會補發中間的成交。中斷前最後一筆到重連後第一筆之間碰到的分鐘（`bybit.js` 的 `StreamGaps`），足跡和大單都改用收集器的版本，所以不會留下缺口。
- OI、熱力圖歷史、爆倉紀錄等，仍由每 5 秒的 `recent` 更新。

## 本機開發

```sh
npm run orderflow:dev                      # Worker + 收集器，http://127.0.0.1:8792（會真的連 Bybit）
npm run lab:orderflow:bybit -- --days 3    # 補匯入最近 3 天的封存檔（權杖讀 .dev.vars 的 ORDERFLOW_ADMIN_TOKEN）；收集器本身也會自動匯入前一天
npm run preview:academy                    # http://127.0.0.1:8790/lab/orderflow/，/api/orderflow/* 會轉到 8792
```

`?days=N`（1～30，預設 3）可以調整頁面載入幾天的歷史；分享連結會自動載入到那根 K 棒所在的日子。

## 上線步驟

2026-10-15 已執行第 1～4 步：Worker 上線，匯入了 10/01～10/14。正式環境的匯入權杖存在本機不進版控的 `.data/orderflow/admin-token`。

1. 升級 Workers Paid：一個常駐的物件每天約用 10,800 GB-s，免費方案上限是 13,000 GB-s，而且超過就會直接失敗。
2. `npx wrangler secret put ORDERFLOW_ADMIN_TOKEN -c wrangler.orderflow.jsonc`
3. `npm run orderflow:deploy`，再打開 `/api/orderflow/btcusdt/status` 確認 `bybit`、`okx` 都是 `open`。
4. 匯入歷史：`ORDERFLOW_ADMIN_TOKEN=… npm run lab:orderflow:bybit -- --days 14 --api https://metabear.io/api/orderflow/btcusdt`
5. 網頁的修改 push 到 `main`，Pages 會自動發布。
6. 每天的封存檔由收集器自動匯入（見「每日封存檔自動匯入」），部署後隔天確認 `/status` 的 `archive.last` 是前一天、`errors` 沒有 `archive` 開頭的紀錄。收集器停擺超過 3 天、或要重匯更早的日子，再用第 4 步的腳本。

7. 通知：兩個 Worker 都要設定同一個 `ORDERFLOW_ALERT_TOKEN` secret（`npx wrangler secret put ORDERFLOW_ALERT_TOKEN --env production` 給後端，加上 `-c wrangler.orderflow.jsonc` 給訂單流 Worker），後端要部署（`npm run deploy`）才有 `/api/internal/orderflow-alert`。部署後用 `{ "test": true }` 確認 LINE 收得到。

## 下一步

- 依實際通知頻率調整門檻，穩定後再開放會員訂閱（ORDERFLOW-SIGNALS-PLAN 的階段 C、D）。關鍵位過濾與試用名單的計畫見 [ORDERFLOW-KEYLEVEL-ALERTS.md](ORDERFLOW-KEYLEVEL-ALERTS.md)。
- 在圖上標出掛單牆與冰山（`watch.js` 可以直接在網頁重用）。
- 帳號、手機版、警報訂閱（VISION 第 3 階段的其餘部分）。
