# 訂單流平台：收集器搬到東京中繼、讓 Durable Object 只為工作時間付費（2026-10-28 規劃）

目標：每月 Cloudflare 費用從約 $40 降到 $5（只剩 Workers 方案月費），在 Vultr 試用額度到期（約 2026-11-23）前完成。主機本身之後每月 $5（必要時升級到 $10）。

## 量到的數字（2026-10-27，一整天）

Cloudflare GraphQL `durableObjectsPeriodicGroups`，每個類別各有 BTC、ETH 兩個物件：

| 類別 | 連線方式 | 活躍時間 | GB-s／天 |
| --- | --- | --- | --- |
| `Collector`（Bybit） | DO 自己連出 WebSocket | 100% | 22,134 |
| `BinanceCollector` | 中繼連進來，訊息原樣轉送 | 100% | 22,131 |
| `OkxCollector` | DO 自己連出 | 100% | 22,136 |
| `BingxCollector` | DO 自己連出 | 100% | 22,166 |
| `MarketCollector`（全市場） | 只有 alarm，定時讀其他四個 | 1.9% | 417 |

合計約 8.9 萬 GB-s／天，一個月 267 萬，扣掉含的 40 萬約 $28；WebSocket 訊息每天約 1,250 萬則，以 20:1 計約 $3；再加 $5 月費。帳單上 10/26 起的跳升也對得上。

## 為什麼幣安「中繼連進來」也全天計費

Cloudflare 的規則（[Durable Object Lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)、[Pricing FAQ](https://developers.cloudflare.com/durable-objects/platform/pricing/)）：物件**執行中**、或**閒置但不符合休眠條件**時計費；**閒置且符合休眠條件**時不計費，即使還沒真的休眠、記憶體裡的狀態都還在。休眠條件是：沒有 `setTimeout`／`setInterval`、沒有未完成的 I/O、沒有對外連線，而且不用標準 WebSocket API（`ws.accept()`），要用休眠版的 `ctx.acceptWebSocket()`。

`BinanceCollector` 四條都不符合：用 `server.accept()` 收中繼連線、REST 等待有 `setTimeout` 逾時、掛單簿同步用 `setTimeout` 重試，所以兩次訊息之間的空檔也全部計費。另外三家自己連交易所（對外 WebSocket），本來就不可能符合。

## 做法：中繼照樣只轉送，但每秒打包一次；DO 改成符合休眠條件

```
交易所（Bybit、幣安、OKX、BingX × BTC、ETH 的 WebSocket 與 REST）
        │
Vultr 東京：relay（Node 22，systemd）
  · 照舊原樣轉送，不解析、不計算
  · 改成每秒把這一秒收到的訊息包成一個 frame 送出（REST 回覆、心跳照舊馬上送）
        │ 每個市場、每家交易所一條 WebSocket（Bearer ORDERFLOW_RELAY_TOKEN）
        ▼
收集器 DO：ctx.acceptWebSocket（休眠版）
  · 收到 frame 就照順序逐則處理，和現在完全同一套程式
  · 不留任何計時器：REST 逾時、掛單簿重試改由下一個 frame 或 alarm 檢查
```

- **邏輯完全不動**：足跡、掛單簿、大單、偵測器、警報都還在 DO 裡，原則「中繼只轉送，邏輯留在 Cloudflare」不變，也不用搬程式到主機。
- **費用**：DO 只在處理 frame 時計費。每秒一個 frame、每次處理約幾十則訊息，估計佔 1～3% 的時間，每個物件每天幾百 GB-s，8 個物件一個月約 5～10 萬 GB-s，在 40 萬的免費額度內。WebSocket 訊息從每天約 1,250 萬則降到約 70 萬則（每秒 1 個 frame × 8 條），請求費也在免費額度內。
- **延遲**：事件最多晚 1 秒，警報照舊每分鐘合併送 LINE，使用者感覺不到。
- **記憶體狀態**：frame 每秒都來，物件閒置不到 10 秒就會再被叫醒，實際上不會被移出記憶體，掛單簿一直都在。真的被移出（重新部署、主機搬遷、中繼斷線超過 10 秒）時，建構子從 `ctx.getWebSockets()` 拿回中繼連線，掛單簿重新拿快照，和現在物件重啟的處理相同。

### 第一版想法（已放棄）：中繼整理好、每分鐘送一批

原本規劃把掛單簿、足跡、偵測器搬到中繼上跑，DO 每分鐘只收一批結果。讀了程式和 Cloudflare 的計費規則後放棄：只要 DO 符合休眠條件，閒置時間本來就不計費，不需要拉長間隔，也就不必把邏輯搬到主機、承擔兩邊版本要對上和主機變成有狀態的風險。

## 預估費用

| 項目 | 現在／月 | 之後／月 |
| --- | --- | --- |
| DO 執行時間 | 約 $28 | 免費額度內（待第 1 階段實測） |
| DO 請求 | 約 $3 | 免費額度內 |
| Workers 方案 | $5 | $5 |
| Vultr | 試用額度 | $5（1 GB）；記憶體實測不夠再升 2 GB $10 |
| **合計** | **約 $36～45** | **約 $10～15** |

## 取捨與風險

- **中繼成為四家交易所的唯一入口**：主機斷線期間，成交、K 線、OI 事後能用 REST 或每日封存檔補，掛單簿與熱力圖會缺一段。現在幣安已經是這樣。systemd 自動重啟、健康通知（`HEALTH_DOWN_MS`）照舊。
- **不保留直連備援**：先觀察一個月主機穩定度再決定。
- **一個 frame 的處理時間**：DO 單一事件的 CPU 上限遠高於一秒份的訊息量（目前每秒幾十則），但要在第 1 階段量 CPU 時間確認。
- **計費實測**：Cloudflare 的文件寫明符合休眠條件的閒置不計費，第 1 階段用 GraphQL 量 `BinanceCollector` 的 GB-s 確認，數字不如預期就回頭檢討。

## 決定（2026-10-28 使用者確認）

- 先不做直連備援，觀察一個月主機穩定度再決定。
- 事件不能變慢：每秒一個 frame，事件最多晚 1 秒。
- 先用一台 1 GB 主機，記憶體實測不夠再升 2 GB。
- ETH 照常收集，不為了本期帳單暫停（本期約 $6.5，下一期才變貴）。

## 分階段

1. **幣安先行**（數天）：中繼改成每秒一個 frame；`BinanceCollector` 改用 `ctx.acceptWebSocket`、拿掉所有計時器。部署後用 GraphQL 量 `BinanceCollector` 的 GB-s，確認從每天約 2.2 萬（兩個物件）降到幾百。
2. **其他三家搬到中繼**（約 1～2 週）：Bybit、OKX、BingX 的 WebSocket 和 REST 改由中繼負責（Bybit、OKX 的 REST 有拒絕 Cloudflare IP 的問題，搬到東京也一併解決），收集器改成和幣安一樣收 frame。
3. **收尾**（約 3 天）：刪掉沒用到的直連程式、更新 [ORDERFLOW-BINANCE-RELAY.md](ORDERFLOW-BINANCE-RELAY.md) 與 [ORDERFLOW-PLATFORM.md](ORDERFLOW-PLATFORM.md)、確認下一期帳單。

每一階段都是一次發布（`npm run orderflow:deploy`、`npm run relay:deploy`），要使用者確認後才上線。
