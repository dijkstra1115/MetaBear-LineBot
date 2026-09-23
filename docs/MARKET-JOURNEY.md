# 一筆成交之後：六段市場旅程

入口：`/orderflow/`，獨立入口：`/orderflow/journey.html`。

學員只需要下一幕、上一幕與暫停。沒有選擇題、分支、留言、完成打卡或另一組情境模擬。頁面不保存個人資料。故事由事件帶出問題，概念在觀察之後才命名。

## 六段編排

| 段落                            | 推進故事的問題                           | 原有內容                       |
| ------------------------------- | ---------------------------------------- | ------------------------------ |
| 01 價格，是怎麼走出來的？       | 等待中的單，怎麼變成 K 線？              | matching                       |
| 02 買了很多，價格為什麼不動？   | 同價補量停止後，買單去哪裡？             | cvd、iceberg、absorption       |
| 03 那面牆，怎麼突然不見了？     | 沒有對應成交，掛單怎麼消失？             | limit、wall、slippage、heatmap |
| 04 一根 K 線，藏了哪些經過？    | 同一批成交，還能看見什麼？               | footprint、profile、vwap       |
| 05 成交之後，還有什麼留在市場？ | 成交量、未平倉量與持有成本為何不同？     | oi、funding                    |
| 06 急跌時，誰還能繼續等待？     | 風險事件如何變成成交，又在哪裡遇到承接？ | liquidation、confluence        |

01 直接使用原有 `FoundationLesson`、Zoom in/out、撮合路徑及 K 線呈現，只替換旅程操作並移除理解題入口。它仍是原本 100–110 的小市場；02 清楚轉入 BTC 合成行情，不把兩者冒充成同一個商品。

02–06 共用一條 80 秒市場時間軸，依序為 0–18、18–32、32–46、46–62、62–80 秒。每段四幕，每次前進均有新的市場事件。下一段從上一段的盤面繼續，不清空成交、K 線、CVD 或累計統計。02 前 18 秒沿用已獲學員認可的補量故事。

03 出現賣牆並留下熱圖亮帶，撤量本身不改變最新成交，後續買單逐檔成交。04 在行情繼續時依序展開逐價成交、斜向失衡、成交量分布及 VWAP。05 加入公開 OI 和費率更新，再呈現一次資金費用結算。06 區分標記價、成交與強平回報，最後讓新賣出被下方補量暫時承接，呼應 02。

## 公開資訊與數據口徑

- 這是依撮合規則編排的合成行情，明確標示非即時資料。掛單、買賣成交交錯發生；沒有隱藏庫存、委託者身分或教學後台。
- K 線、影線、成交量、CVD、逐價成交、POC 與 VWAP 都取自相同成交紀錄。K 線為 3 秒分桶，其餘成交統計從 BTC 行情起點累計；圖表文字標示此範圍。
- 熱圖每欄代表一個掛單更新快照，亮度尺度固定。撤量敘事只針對這段完整、無遺漏的合成資料，不把一般公開深度減少一概當作撤單。
- OI 以合約單邊口徑計量。模型編排開倉、轉手與平倉以產生公開 OI 更新；畫面不顯示個別交易者的開平意圖。
- 資金費用只示範一次結算：名義部位 10,000 USDT × 0.01% = 1 USDT。結算本身不產生成交量；後續市場買賣繼續進行。永續相對指數的價格溢價不等同到期合約基差。
- 標記價獨立於最新成交更新。強平在模型中簡化為主動成交，公開回報在相應成交後到達，不再重複增加成交量。畫面不推測個別帳戶的強平門檻。

語意參考：[CME Open Interest](https://www.cmegroup.com/education/courses/introduction-to-futures/open-interest)、[Bybit 資金費用](https://www.bybit.com/en/help-center/article/Funding-fee-calculation)、[Bybit 訂單執行與清算](https://www.bybit.com/en/help-center/article/FAQ-Order-Execution-and-Liquidation)、[公開委託簿](https://bybit-exchange.github.io/docs/v5/websocket/public/orderbook)、[公開成交](https://bybit-exchange.github.io/docs/v5/websocket/public/trade)。

## 操作與路由

`journey-curriculum.js` 存放敘事及原課程對應；`journey-model.js` 編排持續行情；`journey-charts.js` 從快照產生圖表；`journey.js` 控制播放、段落銜接及回看。

- 每幕播放完成立即顯示下一步；第四幕完成當下顯示收尾，不增加只有文字的第五幕。
- 上一幕取消當前動畫，同時還原 K 線、掛單、成交、OI 與結算／強平資訊，不提前顯示未來事件。
- 暫停使所有行情、圖表轉場與計時停止；隱藏分頁自動暫停。離頁清除動畫，瀏覽器返回可恢復操作。
- `?chapter=traces&scene=2` 等連結可恢復已完成的幕。原有 `?lesson=...` 對應至包含該概念的旅程段落。
- `?classic=1&lesson=...` 保留舊版檢視；`?workspace=practice` 與 `?workspace=live` 繼續使用原有工具。
- `/orderflow/absorption.html` 保留原獨立補量故事，收尾可接到第三段。

## 驗證

```powershell
node --test tests/orderflow-journey.test.mjs tests/orderflow-absorption.test.mjs tests/orderflow-foundation.test.mjs tests/orderflow-guided.test.mjs tests/orderflow.test.mjs
npx tsx --test tests/orderflow-routing.test.ts tests/site-environments.test.ts tests/site-routing.test.ts
npm run check
```

模型測試涵蓋每個事件的數量守恆、前 18 秒相容性、撤量與成交分離、逐根 OHLCV、VWAP 與 POC 的共同來源、OI 與資金費用口徑、強平不重複計量、回看隔離未來資料，以及所有桌面／手機圖表模式的有限座標。

發布目標為既有 `metabear-site-preview`／`preview.metabear.io`，僅保留既有預覽環境綁定。正式站與 LINE Worker 不屬於此次發布。

2026-09-22 已發布至 [完整市場旅程](https://preview.metabear.io/orderflow/)，部署 ID：`09d4f07be9a0498a9863ed040abf8ce5`。

48 個市場／模型測試、11 個路由／環境測試、TypeScript 檢查及預覽 Worker dry-run 通過。17 個線上入口、程式、樣式及模型資源均為 HTTP 200，SHA-256 與本機逐檔一致，環境標頭皆為 preview。

瀏覽器已逐幕操作第 01 課原有鏡頭與後續段落銜接，確認暫停保持時鐘不動、跨段上一幕還原相同成交狀態、重新整理恢復完成邊界。桌面、390px 及 320px 手機尺寸均檢查，手機未出現橫向溢出。

最後一段在 80 秒立即顯示「旅程完成」與收尾，保留同一條行情；最終成交 68,421.0、累計成交量 45.70 BTC、CVD +26.40 BTC。線上確認原 `?lesson=funding` 連結導向第五段、瀏覽器上一頁恢復對應段落，以及預設入口載入原第 01 課；未出現瀏覽器錯誤或 CSP 警告。
