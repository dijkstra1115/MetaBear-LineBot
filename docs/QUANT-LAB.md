# MetaBear 訂單流研究室

已實作的本機研究系統：Bybit 公開行情 → 特徵 → 固定規則 → 風控 → 本站模擬成交 → SQLite 紀錄 → 網頁。BTCUSDT、ETHUSDT 共用一個 10,000 USDT 帳戶。沒有交易所下單功能，不使用 BingX，也不需要 Velo 或交易所 API key。Jev 尚未接入。

## 啟動

需要 Node.js **22.13 以上**（本次用 22.17.1 驗證；使用原生 `WebSocket` 與 `node:sqlite`）。

```powershell
npm ci
npm run quant
```

開啟 <http://127.0.0.1:8788/lab/jev>。服務持續收集行情、執行策略，與瀏覽器是否開啟無關；關閉 Node 程序或電腦休眠會中斷。預設只監聽本機。重啟保留帳戶與歷史，重新收集完整五分鐘成交窗口；通常須 5–6 分鐘暖機，進場判斷等下一個五分鐘決策時段。

這是獨立 Node 服務。現有 `npm run dev` / `npm run deploy` 是 LINE CRM 的 Cloudflare Worker，**不會啟動或部署量化服務**。對外上線需要持續運行 Node 的主機、持久磁碟及 HTTPS 反向代理，將整個研究服務掛到獨立子網域最簡單。此版本尚未對外部署；沒有修改現有 CRM 路由。

可選環境變數（無需金鑰）：

| 變數         | 預設                      | 用途                         |
| ------------ | ------------------------- | ---------------------------- |
| `QUANT_PORT` | `8788`                    | HTTP 埠                      |
| `QUANT_HOST` | `127.0.0.1`               | 監聽位址                     |
| `QUANT_DB`   | `quant/.data/live.sqlite` | 相對專案根目錄或絕對帳本路徑 |

每個帳本只啟動一個收集程序。`quant/.data/` 已排除於 Git。要開始另一個實驗，停止服務後指定新的 `QUANT_DB`，保留舊帳本；不要覆蓋既有研究結果。

### 換一台電腦繼續開發

安裝 Node.js 22.13+，clone 本專案（已有 checkout 則先 `git pull --ff-only`），在專案根目錄執行：

```powershell
npm ci
npm run quant:check
npm run quant:test
npm run quant
```

開啟該電腦的 <http://127.0.0.1:8788/lab/jev>。Git 只同步程式與文件，不包含本機行情、模擬帳戶與熱圖歷史；新電腦預設建立新帳本並重新收集行情。若要延續原帳本，須另行使用一致性備份移轉（見下方備份說明）。目前不需要任何 API key；Jev 尚未接入。推送 Git 並不會讓這個獨立 Node 服務自動在 Cloudflare 運行。

## 實際資料管線

另有獨立的 [原始訂單流收集器](QUANT-RECORDER.md)：`npm run quant:collect` 保存永續 50／1000 檔原始更新與現貨／永續逐筆成交，並提供 `quant:raw:replay` 驗證。它不依賴本研究室服務，不會改變下述策略輸入或模擬帳戶。

| 來源                                     | 收到的欄位／格式                                                                     | 處理                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Linear WS `orderbook.1000.BTCUSDT` / ETH | `type`, `ts`, `data.u`, `b: [[price, size]]`, `a: [[price, size]]`，價格與數量為字串 | 先 snapshot，再套 delta 的絕對數量；0 刪檔；忽略舊 update ID；斷線重建；最多保存雙邊各 1,000 檔 |
| Linear / spot WS `publicTrade.*`         | `T` 時間、`i` 成交 ID、`S` 主動方、`p` 價格、`v` 幣數量                              | 按成交 ID 去重，以 `p × v` 算 USDT 主動買／賣金額，依事件時間切 1 分鐘                          |
| Linear WS `tickers.*`                    | `markPrice`, `openInterest`, `fundingRate`, `nextFundingTime`                        | 合併增量欄位；累積本機 OI 歷史；缺漏保留 unknown                                                |
| REST `/v5/market/kline`                  | `result.list: [[startTime, open, high, low, close, volume, turnover]]`               | interval=1、limit=240；轉成升冪時間序列，剔除未收盤棒；本系統 candle.volume 為 quote turnover   |

WS：`wss://stream.bybit.com/v5/public/linear` 與 `/spot`。REST：`https://api.bybit.com`。資料訂閱不需認證；若服務所在區域不能使用公開端點，面板顯示資料不可用，沒有繞過限制或偷偷換成合成行情。

每約 10 秒更新 K 線、取樣訂單簿與指標、執行風控並寫入 SQLite。REST 請求逾時或回應異常時不開新倉。WS 有心跳、重連退避與資料過期檢查。每個完整成交分鐘保留 5 秒遲到容忍；太晚的資料不改寫已封存窗口，並重新暖機。斷線期間不以 K 線成交量猜造買賣差。

官方規格：[連線](https://bybit-exchange.github.io/docs/v5/ws/connect)、[訂單簿](https://bybit-exchange.github.io/docs/v5/websocket/public/orderbook)、[逐筆成交](https://bybit-exchange.github.io/docs/v5/websocket/public/trade)、[Ticker](https://bybit-exchange.github.io/docs/v5/websocket/public/ticker)、[K 線](https://bybit-exchange.github.io/docs/v5/market/kline)。

## 訂單簿流動性熱力圖

網頁「流動性熱圖」以時間為橫軸、價格為縱軸，呈現各價位的可見掛單名目額（USDT）。紫色至黃色代表金額由小到大，白線為該快照的 bid/ask 中間價；桌面右側另顯示最新掛單分布。可選 15 分鐘／1 小時／4 小時、最新中間價上下 0.5%／1%／2%／5%、買盤／賣盤，以及最低掛單金額濾除門檻。滑鼠、觸控或圖表上的 Enter／方向鍵可查值。

深度來源是 [Bybit Full Orderbook REST](https://bybit-exchange.github.io/docs/v5/market/full-ob)，`GET /v5/market/full_orderbook?category=linear&symbol=BTCUSDT`（ETH 同樣使用）。不需 key；每輪完成後約 10 秒再次讀取，雙邊各保留最多 10,000 檔。這條視覺化資料管線獨立於策略使用的 WS 1,000 檔，不改變原策略訊號或模擬成交。視覺呈現參考 [CoinGlass 流動性熱圖](https://www.coinglass.com/learn/liquidity-heatmap-en) 的時間／價格／掛單強度概念；目前是 Bybit 單一交易所的實際可見掛單，並非 CoinGlass 聚合資料，也不是推估槓桿部位的清算熱圖。

處理與限制：

- 每筆掛單以 `price × quantity` 算 USDT；原始快照投影為 BTC 每 5 USDT、ETH 每 0.2 USDT 的固定絕對價位格，保存當時中間價上下最多 5% 的區域。實際第 10,000 檔可能涵蓋不到選定範圍，畫面會顯示各欄實際邊界。
- 查詢最多 360 個時間欄，每欄使用最後一份已保存快照，不跨時間累加掛單。價格格依畫面範圍合併到約 180 列。即時 15m／1H 為 10 秒一欄，4H 為 40 秒一欄；示例每分鐘一欄。
- 顏色上限採當次視圖買賣總額的第 99 百分位（P99），高於上限同為最亮色。門檻滑桿是此上限的百分比，旁邊顯示實際 USDT；跨視圖色彩需搭配金額比較，不能只比較亮度。
- 深度 REST 快照距 frame 超過 15 秒時，改用仍有效的已保存 WS 深度（不超過 5 秒）。沒有有效資料、停止收集及超出已觀測價格邊界均以斜線標示；缺漏不當成零掛單，也不沿用舊數值填滿時間缺口。
- 升級前已有的 1,000 檔歷史可繪圖，但無法補造過去的 10,000 檔。快照只能顯示觀測時的掛單，不能辨別兩次取樣間究竟因成交還是撤單而消失，也不包含隱藏流動性。
- 深度投影與 frame 一同壓縮保存；HTTP 熱圖查詢有時間取樣、結果快取與 gzip。示例的 2,000 檔色帶為合成資料，與真實帳本分開。

## 訊號與交易規則

策略版本：`orderflow-breakout-v1`。每個交易對每五分鐘最多一筆判斷；起始會先留下暖機觀望紀錄。只評估在該時刻已知的資料，不會追補離線期間的決策。

所有多方條件須同時通過；空方方向相反，OI 與價差條件相同：

1. 最後一根已封存的 1 分鐘收盤，突破其前 15 根 K 線最高價再加 1 bps；做空為跌破最低價再減 1 bps。
2. 永續最近五個完整分鐘 `(主動買 USDT − 主動賣 USDT) / (主動買 USDT + 主動賣 USDT) ≥ 10%`；做空 ≤ −10%。
3. 現貨相同算法 ≥ 3%；做空 ≤ −3%。
4. 當前前 50 檔買賣盤 USDT 名目額 `(bid − ask)/(bid + ask) ≥ 15%`；做空 ≤ −15%。
5. OI 相對五分鐘前觀測值的變化非負；這只是輔助條件，不把 OI 增長直接等同新增多單。
6. 當前 spread / mid × 10,000 ≤ 3 bps。

另計算 10 / 25 / 50 bps 範圍的深度。若第 1,000 檔沒有涵蓋整個範圍，`covered=false`，不可把範圍內加總當成完整深度。訂單簿不含隱藏 RPI 流動性；失衡不是掛單一定成交的證明。

圖表的 CVD 是該可用窗口起點歸零後，逐分鐘累積主動買金額減主動賣金額；不是全市場 CVD，也不是跨重啟延續的指標。

## 模擬成交與風控

| 項目         | 設定                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| 初始資金     | 10,000 USDT，兩交易對共用                                                     |
| 每筆目標風險 | 當前權益 0.25%，估算停損距離與雙邊費用／滑價後決定數量                        |
| 最大總曝險   | 1 × 權益，新倉成交後再次檢查費用與標價造成的權益變化                          |
| 停損距離     | max(14 根已收盤 K 線的平均真實波幅 × 1.5, 價格 × 20 bps)                      |
| 停利距離     | 停損距離 × 2；是毛價格距離比，不是扣成本後報酬比                              |
| 持倉期限     | 60 分鐘；同一交易對最多一倉、不加倉                                           |
| 單日熔斷     | 權益低於 UTC 日初權益 2%，停止當日新倉，既有倉位仍依規則管理                  |
| 冷卻         | 平倉後 5 分鐘                                                                 |
| 手續費       | 單邊 5.5 bps，研究假設，不讀取個別帳戶 VIP 費率                               |
| 額外滑價     | 逐檔 VWAP 後再加 1 bps 不利滑價                                               |
| 數量粒度     | BTC 0.001、ETH 0.01，名目額至少 5 USDT；固定研究假設，非即時 instruments 規格 |

訊號先產生 pending 計畫。成交必須使用決策之後的新深度，且至少延遲 500 ms；實際通常等下個 10 秒觀測點。pending 超過 20 秒取消，價差變寬、價格偏移超過 0.3%、深度不足或曝險不足則拒絕。

做多吃 asks、平多吃 bids；做空相反。數量必須由可見深度完整覆蓋，不假裝部分不足仍全部成交。遇到停損跳價，以當時可取得的 VWAP 出場，不保證停損價。出場深度不足會保留持倉並記錄事件。現貨 feed 中斷時禁止新倉，但只要永續深度有效，既有倉位仍能停損。

Funding 依前次觀測的費率與結算時標記價格估算；正費率多方付、空方收。只在結算時套用一次，不把公布中的預估費率當官方事後結算值。跨結算斷線或欠缺欄位，標記 `fundingUncertain`。最大風險／單日虧損是控管門檻，價格跳空與資料中斷仍可能造成超額損失。

權益 = cash + 未實現損益。開倉扣手續費；平倉加 gross PnL 並扣出場費；資金費獨立進 cash。平倉淨損益含雙邊費用與該筆 funding。未實現損益以多倉 best bid、空倉 best ask 標價，尚未預扣平倉成本。沒有未來 K 線 high/low 事後觸價，也沒有撮合排隊、逐 tick 停損或網路延遲精確重建；這是約 10 秒取樣的 paper forward test。

## 可追溯紀錄與回放

SQLite WAL 的單筆交易同時保存完整 frame、策略判斷、成交、風控事件、權益取樣與帳戶狀態。frame 用 gzip 儲存，包含全部已觀測訂單簿與當時 K 線／訂單流。重複或倒退的同交易對 frame 不會再次成交。

```powershell
npm run quant:check
npm run quant:test
npm run quant:replay -- quant/.data/live.sqlite quant/.data/replay-report.json
```

Replay 按 `(time, symbol)` 從初始狀態重放保存的 frame，應輸出 `exactStateMatch: true`。它使用同一 WAL 讀取快照，可在服務運行時驗證；它不補造啟動前或離線期間的歷史訂單流。修改策略計算或參數時，應提高版本並使用新帳本；設定不一致的帳本會拒絕開啟。

完整 frame 預設持續保存，沒有自動刪除，因此磁碟用量會持續成長。長期收集前需安排磁碟容量與帳本輪替。備份應停止服務再複製，或使用 SQLite 的一致性備份；不要只複製運行中 `.sqlite` 而遺漏 WAL。這一版本沒有雲端備份、集群容錯或無限期保留服務。

唯讀 HTTP API：

| GET 路徑                                               | 結果                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `/health`                                              | 程序時間、最新處理時間、feed 狀態／錯誤                               |
| `/api/quant/summary?symbol=BTCUSDT`                    | 帳戶、最近決策／成交、圖表資料、公開前 1,000 檔                       |
| `/api/quant/heatmap?symbol=BTCUSDT&minutes=60&range=1` | 時間／價格掛單矩陣、觀測範圍、來源與 P99 色階上限；range 單位為百分比 |
| `/api/quant/decision?id=...`                           | 該決策與保存的完整原始 frame                                          |
| `/api/quant/export?kind=decisions`                     | 全部兩交易對決策 JSONL                                                |
| `/api/quant/export?kind=fills`                         | 全部兩交易對成交 JSONL                                                |
| `/api/quant/export?kind=events`                        | 全部兩交易對風控與資金費事件 JSONL                                    |
| `/api/quant/jev-input?symbol=BTCUSDT`                  | 尚未送出的 Jev request 草案                                           |

上述研究 API 可加 `mode=demo` 讀取獨立記憶體合成示例。示例包含獲利與虧損，使用同一策略／成交引擎，完全不寫入真實行情帳本。所有非 GET / HEAD 請求回傳 405，沒有真實或模擬的手動下單端點。

## Jev 接線準備

`quant/model-input.ts` 已按 [Jev 官方 API](https://docs.typesafe.ai/api) 建立 `POST /v1/systemone` 的 `model + state + questions` payload。固定模型 `jev-1.13.0`（實驗接線時仍須確認帳戶存取權）；沒有執行付費請求，也沒有讓金鑰進前端。

`state` 包含：as-of 時間、來源與單位、資料完整性、30 根已封存 K 線、5 個分鐘的現貨／永續流、前 20 檔深度、已計算的特徵與英文方向標籤、模擬部位、固定風控。`questions` 使用英文 instructions 與 criteria：

- `proposed_action`（Choice）：long / short / wait / hold。
- `evidence_alignment`（Score）：資料缺失／衝突、混合、一致三檔。
- `dominant_observation`（Choice）：資料不足、訊號衝突、多方一致、空方一致、未突破。

問題各自獨立，不依賴同一次呼叫的其他答案。模型回傳選項、分布與信心；網站日後展示原始答案與可核對的觀測欄位，不宣稱可看到模型內部思考，也不把信心當成獲利機率。

取得 key 後的下一步：增加伺服器端 Jev client、回應格式驗證、timeout / rate-limit / stale-response 處理，以及獨立於規則 baseline 的 Jev 帳本；在模型回應真正返回之後，才允許將計畫交給下一份深度。這些尚未啟用，現在的交易全部來自規則策略。

## 實驗有效性

這套規則是可運行的 baseline，尚無盈利證據。真實 forward test 從收集服務啟動時開始，示例回放不計入評估。至少以獨立期間比較交易數、扣成本期望值、最大回撤、勝率、盈虧比與資料缺漏比例；不要在同一批資料反覆調參後，把結果稱為樣本外驗證。

檔案：`market.ts` 收集、`liquidity.ts` 深度投影與熱圖聚合、`engine.ts` 純計算、`store.ts` 帳本、`server.ts` API、`replay.ts` 回放、`demo.ts` 合成示例、`model-input.ts` Jev payload；網頁位於 `public/quant.html`、`quant.css`、`quant.js`、`quant-heatmap.js`。
