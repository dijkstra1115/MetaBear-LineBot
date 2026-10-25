# 訂單流平台：幣安中繼主機（2026-10-25）

[連線實測](ORDERFLOW-CF-PROBE.md)發現 Cloudflare 連不到幣安，當時列的「方案 B：幣安用小型中繼主機」現在要實作。主機已經租好：Vultr 東京 `vc2-1c-1gb`（$5/月，Ubuntu 26.04 LTS），2026-10-25 實測現貨、合約 REST 都回 200（約 50 ms），`fstream.binance.com` 的 WebSocket 握手回 101。

## 原則：中繼只轉送，邏輯留在 Cloudflare

主機上的程式只做兩件事：把幣安的 WebSocket 訊息原封不動轉給收集器，以及替收集器代打幣安 REST。解析、足跡、掛單簿、大單、警報、儲存都沿用現有的收集器 Durable Object（`src/orderflow/collector.ts`）和共用模組，理由是：

- **只有一份邏輯**：足跡、大單合併、熱力圖、關鍵位事件都已經有測試，網頁也直接使用。在主機上用 Node 另寫一份，兩邊一定會慢慢分歧。
- **主機沒有狀態**：主機掛了重開一台、裝好程式就能恢復，不必搬資料，也不需要備份。
- **補資料的路徑不變**：收集器原本就會在重連後用 REST 補成交、每小時用 K 線補缺口，只是幣安的 REST 改由中繼代打。

```
幣安 fstream（aggTrade、depth@100ms、markPrice@1s、forceOrder）    幣安 REST（fapi、futures/data）
        │ WebSocket                                                   ▲ 只允許 GET、白名單路徑
        ▼                                                             │
Vultr 東京：binance-relay（Node 22，systemd）────────────────────────┘
        │ 一條對外 WebSocket，帶 ORDERFLOW_RELAY_TOKEN
        ▼
Worker metabear-orderflow：/api/orderflow/relay ──► 收集器 DO BinanceCollector
        │                                            繼承 Collector，只換資料來源
        ▼
/api/orderflow/btcusdt/*?ex=binance（格式同 Bybit）──► 網頁 /lab/orderflow/
```

## 中繼程式（`relay/binance-relay.mjs`，第 1 階段已完成）

- **無外部套件**：Node 22 內建的 `WebSocket` 和 `fetch` 就夠用。
- **上游**：幣安把串流分成兩個網址，`/market/stream`（`aggTrade`、`markPrice@1s`、`forceOrder`）和 `/public/stream`（`depth@100ms`），所以開兩條連線。幣安每 24 小時會強制斷線；斷線後 1 秒重連，之後逐次加長到最多 30 秒。30 秒沒有訊息也會重連。
- **下游**：連到 `wss://metabear.io/api/orderflow/relay`，權杖用 `Authorization` 標頭，是新的 secret `ORDERFLOW_RELAY_TOKEN`。每則幣安訊息原樣轉送，不重新編碼。
- **不緩衝**：連不到 Cloudflare 時直接丟掉訊息，不需要緩衝。幣安的彙總成交 id（`a`）是連續的，收集器看到 id 跳號，就用 REST `aggTrades?fromId=` 依 id 把缺的補回來，每次最多 30 頁、3 萬筆；掛單簿則重新拿快照。這樣不論是中繼斷線、物件重啟還是部署，補回來的資料都是準確的。
- **REST 代理**：收集器送 `{ id, get: "/fapi/v1/aggTrades?…" }`，中繼回 `{ id, status, body }`。只接受收集器用到的 9 個公開端點（`binance.js` 的 `RELAY_PATHS`：depth、aggTrades、klines、openInterest、fundingRate，以及 4 個 5 分鐘統計），而且只能是 GET，所以就算權杖外洩，也只能拿來查這些公開資料。
- **健康狀態**：每 30 秒送一則 `{ relay: { up, lastBinance, buffered } }`，收集器記在 `/status`。

## 收集器的改動（第 1 階段已完成）

`BinanceCollector`（`src/orderflow/binance-collector.ts`）繼承原本的 `Collector`，只覆寫和交易所有關的部分：連線、補成交、OI、REST 歷史、K 線、封存檔與健康檢查。儲存、查詢、足跡、大單、熱力圖和事件偵測都直接沿用。Bybit 的行為沒有改變，現有測試全部通過。

| 介面 | Bybit（現有） | 幣安（新增） |
| --- | --- | --- |
| 連線 | DO 自己連出 WebSocket | 中繼連進來（`ctx.acceptWebSocket`），DO 不主動連 |
| 成交 | `publicTrade` | `aggTrade`（`m` 為 true 是主動賣） |
| 掛單簿 | `orderbook.1000` 快照 + 增量 | `depth@100ms` 增量，加上 REST `/fapi/v1/depth?limit=1000` 快照，用 `U`／`u`／`pu` 接續，接不上就重新拿快照。幣安的增量也會更新很遠的掛單，例如 $1,000 的 118 BTC 買單，所以給警報和熱力圖看的只有現價 ±0.25%，和 Bybit 1000 檔的範圍相同（`BOOK_WINDOW`），避免遠處的大單被當成掛單牆 |
| OI、資金費率 | `tickers` 串流 | REST `/fapi/v1/openInterest` 每次 alarm（10 秒）讀一次，套用和 Bybit 相同的讀取時間規則；資金費率用 `markPrice@1s`，OI 的 USDT 金額用標記價格換算 |
| 多空比 | `account-ratio` | `globalLongShortAccountRatio` 寫進原本的 `ratios.ratio`；大戶持倉比與大戶帳戶比寫進新增的欄位 `ratios.top_pos`、`top_acc`，對應 `metrics` 的第 3、4 欄（Bybit 仍是 `null`） |
| 爆倉 | `allLiquidation`（完整） | `forceOrder`（每秒最多一筆）；OKX 爆倉只在 Bybit 那個物件收，不重複 |
| 補成交 | `recent-trade` | `/fapi/v1/aggTrades?fromId=` 依 id 往後補，可以補得比 Bybit 更完整 |
| 大單合併 | 用撮合序號 `seq`，是準確的 | 同一張主動單的成交會拆成好幾則 `aggTrade`，時間和方向相同，所以先暫存，等到時間或方向不同的下一筆出現再一起合併；和封存檔一樣是估算 |
| 每日封存檔 | DO 下載 `public.bybit.com` 的 gz | 封存檔是 zip，由**中繼主機**下載 `data.binance.vision` 的 aggTrades，重建後用現有的 `POST /import` 推上來（沿用 `scripts/orderflow-data.mjs` 的解析） |

- **分開兩個物件**：新增 Durable Object 類別 `BinanceCollector`，綁定名稱 `BINANCE`，遷移標籤 `v2`。Bybit 的物件不受影響，兩邊的資料表結構相同。
- **API**：現有路徑多一個 `?ex=binance` 參數，預設維持 Bybit，現有網頁和快取網址都不受影響。
- **警報**：幣安物件的市場事件只記錄（`marketLive = false`，狀態是 `logged`，不轉送給會員），一樣會出現在 `/events?ex=binance`。健康通知照常推給管理員。等兩邊並行一段時間，再決定 LINE 警報看哪一邊。
- **健康通知**：`HEALTH_DOWN_MS` 加上 `Binance: 120_000`，中繼斷線超過 2 分鐘就通知管理員，和現有的 Bybit 健康通知一樣。

## 主機維運

- 主機連線：`ssh metabear-tokyo`（使用者 `metabear`，root 與密碼登入已關閉，防火牆只開 22）。
- 安裝：Node 22（NodeSource apt 套件庫），程式放在 `/opt/metabear-relay`，權杖存在 `/etc/metabear/relay.env`（權限 600）。
- 服務：systemd `metabear-relay.service`，`Restart=always`，log 寫到 journald，用 `journalctl -u metabear-relay` 查看。
- 部署：`npm run relay:deploy`（`scripts/relay-deploy.sh`）把中繼程式和它用到的兩個共用模組打包上傳，安裝 systemd 服務後重新啟動。第一次部署時，會把本機 `.data/orderflow/relay-token`（不進版控）寫進主機的 `/etc/metabear/relay.env`。這是發布步驟，只在明確要上線時執行。
- 服務用 `DynamicUser`、唯讀檔案系統、記憶體上限 300 MB 執行，沒有登入權限。
- 安全更新已開啟 `unattended-upgrades`。需要重開機時 systemd 會自動把服務帶起來，中斷的部分由收集器用 REST 補回。

## 費用

| 項目 | 每月 |
| --- | --- |
| Vultr 東京 | $5（2026-11-23 前用試用額度） |
| 第二個常駐 DO | 每個約 324,000 GB-s。Workers Paid 含 400,000 GB-s，兩個物件超出約 248,000 GB-s，約 $3 |
| 中繼的 WebSocket 訊息 | 實測每秒約 13 則，每月約 170 萬次 DO 請求（WebSocket 訊息以 20:1 計），約 $0.2 |
| 流量 | `depth@100ms` 是主要來源，估計每天數 GB，在 Vultr 每月 1 TB 以上的額度內 |

## 本機測試

```sh
npm run orderflow:dev    # :8792，.dev.vars 要有 ORDERFLOW_RELAY_TOKEN
RELAY_TARGET=ws://127.0.0.1:8792/api/orderflow/relay ORDERFLOW_RELAY_TOKEN=… npm run relay:binance   # 台灣的 IP 連得到幣安
curl 'http://127.0.0.1:8792/api/orderflow/btcusdt/status?ex=binance'
```

2026-10-25 本機實測：連上 40 秒後，掛單簿已同步，OI 已讀到；經由中繼補回 15 天的 OI、多空比、資金費率，以及 2 天的 1 分 K；中繼轉送了 510 則訊息，沒有丟失。

## 上線步驟（還沒執行）

1. 產生權杖，存到 `.data/orderflow/relay-token`，然後執行 `npx wrangler secret put ORDERFLOW_RELAY_TOKEN -c wrangler.orderflow.jsonc`。
2. `npm run orderflow:deploy`，這次部署會套用 `v2` 遷移，建立 `BinanceCollector`。
3. `npm run relay:deploy`。
4. 打開 `/api/orderflow/btcusdt/status?ex=binance`，確認 `binance` 是 `open`、`bookReady` 是 true、`errors` 是空的。

## 階段

1. **中繼與收集器**（程式完成，尚未上線）：`BinanceCollector`、`binance.js`、`/relay` 端點、中繼程式與部署腳本；測試是 `tests/orderflow-binance.test.mjs` 和 `tests/orderflow-relay.test.ts`。
2. **並行觀察 48 小時**：檢查 `/status` 的缺口與錯誤，並和 Bybit 對照同一分鐘的價格與成交量，確認足跡合理。
3. **網頁**：交易所切換（Bybit／幣安），分享連結帶 `ex`。網頁的即時部分原本就能直連幣安（瀏覽器的 IP 不會被擋），合併規則和 Bybit 一樣。
4. **封存檔與警報**：中繼主機每日匯入幣安封存檔；決定 LINE 警報的來源。
5. **之後**：多交易所合併的 CVD 與成交量（「指標」一節列為還沒做），以及 Bybit 沒有的大戶持倉比。

## 待決定

- **幣安的角色**：建議先和 Bybit 並行，網頁預設仍是 Bybit；觀察穩定後，再決定要不要把預設改成幣安（回測與策略案例本來就用幣安的資料）。
- **警報來源**：等第 2 階段的資料出來再決定。
