# 原始訂單流收集器

獨立於策略服務的 Bybit 公開行情錄製程序，不需要 API key、不會下單。修改或停止 `npm run quant` 不影響另行啟動的收集器。第一階段保存資料與驗證回放，尚未計算牆、吸收、掃單或冰山分數；現有策略／熱圖仍使用原本的資料管線。

## 啟動

需要 Node.js 22 以上（建議與研究室一致使用 22.13+）。先以 `node --version` 確認；Node 20 會明確拒絕啟動。專案依賴已安裝後：

```powershell
npm run quant:collect
```

保持程序運行，Ctrl+C 正常封存。瀏覽器可關閉；電腦關機、休眠、斷網仍會中斷。這個指令沒有安裝 Windows 開機服務或部署雲端主機。同一市場只需一個收集器，避免重複儲存。

有限時間驗證：

```powershell
$env:QUANT_COLLECT_SECONDS = '30'
npm run quant:collect
Remove-Item Env:QUANT_COLLECT_SECONDS
```

`QUANT_RAW_DIR` 可指定資料目錄，預設為專案下 `quant/.data/raw`，已排除 Git。每次啟動使用唯一 session，依 **啟動日 UTC** 分目錄；跨日仍維持同一 session，不覆寫舊資料。

## 收集範圍

| 市場                    | BTCUSDT / ETHUSDT 訂閱 | 用途                                              |
| ----------------------- | ---------------------- | ------------------------------------------------- |
| 永續 linear             | `orderbook.50.*`       | 近端深度，官方推送頻率 20 ms                      |
| 永續 linear             | `orderbook.1000.*`     | 較深價位，官方推送頻率 200 ms                     |
| 永續 linear / 現貨 spot | `publicTrade.*`        | 逐筆成交、主動方、價格、數量、成交 ID、交易所時間 |

兩種深度各自重建，不合併累加。同一價位的 50 檔與 1000 檔不能當成兩份流動性。原始訊息文字完整保存，價格／數量字串不先轉成浮點再存檔；保留 `cts`、`ts`、`u`、`seq`、`T`、`BT`、`RPI` 等來源欄位，以及本機 `receivedAt`、session、connection、連續的本機 ordinal。遲到資料和重複成交也保留，不套用策略五秒遲到丟棄規則。

本階段沒有訂閱全深度 WS 或現貨訂單簿，也沒有錄製 OI、ticker、K 線；舊策略仍自行收集它們。因此 raw replay 是行情重建驗證，不是舊策略完整輸入或績效回測。

## 檔案與可靠性

目錄形式：`quant/.data/raw/YYYY-MM-DD/<session UUID>/`。

- `00000000.json.gz` 等：按接收順序存放事件，約每秒或未壓縮資料達 1 MB 封存一段；單一大訊息可能使段落超過 1 MB。
- 每段包含版本、session、段號、前段 hash、內容 SHA-256；先寫暫存檔並 fsync，再 rename。磁碟寫入失敗立即停止，不會靜默繼續錄製。
- 每 10 秒保存 checkpoint，包含各深度的完整本機訂單簿、版本與成交計數及 hash。所有回放目前從 session 開頭依序進行。
- `status.json` 約每 10 秒更新連線、訂閱確認、最新收訊時間、已重建簿數與成交計數。`lastError` 為最近一次錯誤，恢復後仍保留；判斷現況也要看 channels 與時間是否持續更新。
- 正常結束寫入 `end` checkpoint。程序被強制終止或斷電時，最後尚未封存的緩衝可能遺失，回放會標為未正常結束；不保證零遺失。磁碟／作業系統亦影響持久性。
- 已提交段落不再改寫，可以複製作備份；驗證完整 session 最好在正常停止後進行。沒有自動刪除或備份，磁碟用量持續成長。尚未實測長期容量與峰值負載，不預估每日 GB 數。

連線失敗、逾時、訂閱拒絕與格式異常會留下 gap，清除該市場的本機訂單簿，再退避重連並等待新 snapshot。若異常訊息可讀且未超過大小上限，會先保存原文再記錄 gap。過大／非文字訊息只記錄拒絕原因。

一般 50／1000 檔串流依 `u` 與 `seq` 忽略舊更新，**不把跳號擅自解讀成遺失一包**；官方全深度串流的 `u+1` 同步規則不套用到這裡。這也表示無法保證辨識交易所上游所有缺漏。重連、資料重置後重新建立觀測基準，不補造離線歷史。

## 回放驗證

以啟動時印出的 session 路徑執行：

```powershell
npm run quant:raw:replay -- "quant/.data/raw/YYYY-MM-DD/SESSION_UUID"
# 可選第二個參數，將報告寫入指定檔案
npm run quant:raw:replay -- "quant/.data/raw/YYYY-MM-DD/SESSION_UUID" "quant/.data/raw-report.json"
```

會檢查壓縮段落、hash chain、本機事件順序，重放 snapshot／delta，並比對每份 checkpoint 的深度與統計。`replayVerified: true` 表示儲存事件可重建出錄製時狀態；**不表示行情一定連續，也不表示真的收到市場資料**，需同時看 `books`、`trades`、`gaps`、`invalidMessages`。

`cleanShutdown: true` 表示存在正常結束標記。有中斷紀錄仍可能完整回放，但缺口維持缺口。未正常結束、沒有 checkpoint 或殘留未提交段落時，CLI exit code 為 2；損毀、缺段、checkpoint 不符則報錯。運行中的 session 尚無 end，回放也會回傳 2。成交統計以每個市場／topic 最近 100,000 個成交 ID 去重；更久以前的重送仍可能再計數，原文始終保留供研究者重新處理。

```powershell
npm run quant:check
npm run quant:test
```

## 資料解讀限制

公開深度按價位彙總，沒有個別掛單身分、隱藏量或撤單理由。深度減少不等於成交，補回也不等於同一張冰山單。一般簿不含 RPI 掛單，成交原文中的 RPI／block trade 標誌應在未來吸收分析時另外處理。保存公開推送資料不代表取得交易所內部每筆撮合事件。

官方來源：[Orderbook](https://bybit-exchange.github.io/docs/v5/websocket/public/orderbook)、[Trade](https://bybit-exchange.github.io/docs/v5/websocket/public/trade)、[Full Orderbook](https://bybit-exchange.github.io/docs/v5/websocket/public/full-ob)。
