# 實盤交易紀錄整理

2026-11-25 整理。資料在 [trades.json](trades.json)，每筆有：開單訊息與後續指示（點位群原文）、開單邏輯與復盤（分析群原文，標明 direct／likely／plan）、CSV 原列、交易所 K 線檢查、對不上的地方（`issues`）。

## 數量

| 範圍 | 筆數 | 說明 |
| --- | --- | --- |
| 自己的單 | 88 | 含 15 筆撤單、沒成交 |
| 2025-11-02 起已結算 | 61 | 58 筆在 CSV＋3 筆 CSV 漏記 |
| 2025-09～10 | 14 | CSV 沒有；多數群組沒結算，結果由 K 線推定 |
| MetaDog 的單 | 5 | `kind: metadog` |
| 合作社群報單 | 6 | `kind: partner`，不算自己的戰績 |

有分析群邏輯的：約 40 筆。沒有文字邏輯的多是 2026-01 之後的黃金單和 BTC 空單。

## 發布前要你決定的

1. **CSV 漏記 3 筆**：2025-11-03 ETH 多（K 線止損）、2025-11-22 22:23 ETH 空（已套保，推定保本）、2026-03-04 黃金市價多（「天崩」，止損約 -0.17%）。
2. **CSV 記錯**：
   - 2025-12-07 ETH 空：CSV 記獲利 +122.95%，群組兩次寫「差 0.7 沒止盈、撞套保」。資料裡改為保本。
   - 2025-12-15 黃金多：TP 與 SL 欄位填反，RR 0.40 應為 2.5。
   - 2025-12-17 ETH 空：一半在 2890 先平，CSV 整筆以 2820 計。
   - 2025-11-28 黃金空、12-01 ETH 空、12-24 ETH 空：CSV 的出場價和群組喊的不同。
3. **進場價以誰為準**：群組報的價和 CSV（你自己的成交價）有 8 筆不同（例如 12-16 黃金 4291／4288、12-18 黃金 4338／4333）。建議公開時用群組報的價，因為那是成員看到的。
4. **9～10 月要不要放**：推定 3 勝 7 敗，主要是 BTC 多單止損。只放 11 月以後看起來會像挑過的紀錄。
5. **開單後放寬止損**：2025-11-22（2758→2762）、2025-12-08（3062→3082）。公開時兩個 SL 都要標。
6. **10-24 BTC＋ETH 長單**沒有進場價和止損，不符合「每筆都要畫停損」，建議不放或註明。

## 和 VISION 原則的衝突

[VISION.md](../../docs/VISION.md) 原則 3「不宣稱勝率或報酬」，定位是「分析，不喊單」。「實盤戰績」頁如果用勝率和槓桿後的報酬當標題（CSV 的 Final_PnL 是 300 倍槓桿的保證金報酬），會和原則衝突，也容易讓人照著開高槓桿。比較安全的呈現方式：

- 做成**交易日誌**：每一筆（含虧損、保本、撤單）都列出，附開單邏輯與停損位置。
- 損益用 **R 倍數**或現貨漲跌 %，不用槓桿後的 %。
- 不放總勝率的大標題；要放的話放全部筆數，不只放 11 月以後。
- 每頁附「非投資建議」。

最後怎麼呈現由你決定。

## 圖片：用真實數據重畫

原圖與 BingX 交易紀錄都找不到了（2026-11-25 確認），所以每筆改用 lab 回放模式重畫：當時的真實 K 線、進場、停損、止盈，加上分析群的開單邏輯當字幕。

| 幣種 | 資料 | 說明 |
| --- | --- | --- |
| BTC、ETH、SOL | Binance 永續逐筆成交 | 有足跡、CVD、大單。和 BingX 只差幾毛到 1 美元 |
| 黃金 | BingX 實際下單合約（NCCOGOLD2USD-USDT）的 1 分鐘 K 線 | 價格和成交價一致；沒有逐筆成交，只有 K 線。Binance XAUUSDT 和 BingX 差 −8～+15 美元，2025-12 時幾乎沒有成交量，不用 |

BingX 只提供大約一年的 1 分鐘 K 線，2025-11-20 以前已經拿不到。[bingx-1m/](bingx-1m/) 是 2026-11-25 存下來的每筆交易時段（`node scripts/track-record/fetch-bingx.mjs`），之後也拿不到，要保留。2025-11-13 的黃金單因此沒有可用的 1 分鐘資料。

做法（一筆）：

1. 下載資料：ETH `node scripts/orderflow-data.mjs --symbol ETHUSDT --tick 0.5 --from <UTC 日> --to <UTC 日> --out .data/orderflow/case-ETHUSDT-<UTC 日>.json`（BTC 不加 symbol／tick）。
2. 建案例資料：`node scripts/replay-cases/build-case.mjs --id t-<日期>-eth --symbol ETHUSDT --tick 0.5 --print 150 --history … --start … --end …`；黃金用 `node scripts/track-record/build-bingx-case.mjs --id t-<日期>-gold --symbol NCCOGOLD2USD-USDT …`。
3. 寫腳本 `public/lab/orderflow/cases/<id>.json`：`position` 開倉，`adjust` 改停損／目標（套保就是 stop 改成進場價），`close` 手動平倉（`size` 0.5 是平一半）。
4. 觀看：`/lab/orderflow/?case=<id>&m=eth`（黃金 `m=xau`、SOL `m=sol`）。

全部重畫（2026-11-25）：

- 每筆怎麼重畫寫在 [replays.json](replays.json)（成交方式、實際出場用的目標、套保與手動平倉的時間）。`node scripts/track-record/build-all.mjs [id…]` 建出案例並把重播結果和紀錄比對；65 筆全部一致。
- 四筆有手寫旁白的案例（11/24 ETH、12/17 ETH、12/30 黃金、03/04 黃金）不在 replays.json，直接改 `public/lab/orderflow/cases/` 裡的腳本。
- 沒有重畫的 3 筆列在 replays.json 的 `skipped`，頁面上仍會列出群組原文。09/29 ETH 計畫委託沒觸發，改記為沒成交。
- `node scripts/track-record/build-cards.mjs` 產生 `public/track-record/cards.json`，頁面 `/track-record/` 讀它；`node scripts/track-record/render-list.mjs` 重新產生 [TRADES.md](TRADES.md)。
- 案例資料共約 20 MB（`public/lab/orderflow/cases/t-*.data.json`），commit 前要決定放 repo 還是 R2。

## K 線檢查

`klineCheck` 只比較 TP1 和開單時的 SL 誰先被碰到（72 小時內），不模擬套保、提前出場或改單。用途是找出紀錄和行情明顯矛盾的地方，不是結算。

## 事後分析 (trades with no logic on record)

Cards without an opening logic get an 事後分析: which LuxAlgo Smart Money Concepts order blocks
and FVGs (default inputs, re-implemented in `scripts/track-record/smc.mjs`) the entry price sat
in on 1m, 5m, 15m and 1h. It is a chart check after the fact, never the reason for the trade.

```sh
node scripts/track-record/build-cards.mjs        # cards.json (entries, open times)
node scripts/track-record/validate-setups.mjs    # → setup-validation.json
node scripts/track-record/analyze-setups.mjs     # → setup-analysis.json
node scripts/track-record/build-cards.mjs        # again, to put the analysis on the cards
```

- `setup-labels.json` tags what each recorded logic says. `validate-setups.mjs` checks every tag
  at the real entries and at 40 random minutes per trade; only checks that fire clearly more often
  at the entries are used on cards (order blocks, order blocks on two or more timeframes, FVGs).
  Sweeps and EQH/EQL fired about as often at random minutes, so they are not shown.
- The page quotes the validation numbers, including the base rate, so a match is not read as proof.
- History: 12 days of 1m bars before each entry (ATR(200) and the 50-bar swing structure on 1h).
  Binance klines are fetched and cached in `.cache/orderflow/`; BingX gold and ETH days were
  saved with `fetch-bingx.mjs --before 288 --only GOLD|ETH` and cannot be fetched again once
  BingX drops them. A card notes when fewer than 5 days were available.
- The LuxAlgo indicator is CC BY-NC-SA 4.0; `smc.mjs` credits it.
