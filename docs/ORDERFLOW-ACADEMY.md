# Orderflow Academy · 訂單流沉浸式教學

## 教學入口

`/orderflow/` 從 Maker、Taker 與第一根 K 線開始。全部 15 課共用深色介面、單一操作主線、共享 SVG 場景、課程路徑、理解題及完成紀錄。`?lesson=<id>` 可直接進入指定課程；無效課程回到第一課。

課程設計遵循「先看見現象 → 親手操作 → 觀察結果 → 替概念命名」。完整逐課規劃見 [ORDERFLOW-IMMERSIVE-PLAN.md](ORDERFLOW-IMMERSIVE-PLAN.md)。

| 階段           | 依序學習                                                                 |
| -------------- | ------------------------------------------------------------------------ |
| 訂單如何成交   | Maker、Taker 與 K 線 → 掛單與撤單 → 深度與滑價 → 掛單牆                  |
| 成交留下什麼   | Delta / CVD → Footprint 與失衡 → Volume Profile / POC → VWAP             |
| 流動性如何改變 | 冰山單 → 買單被吸收 → 流動性熱圖                                         |
| 合約與判讀     | 未平倉量 OI → 資金費率與價差 → 強制平倉與連鎖反應 → 用下一筆成交驗證判讀 |

平時只呈現目前課程。右上「課程路徑」開啟可自由跳課的地圖；最後一幕明確標示「演示完成」，按「進入理解題」才展開並移至題目；不再為同一畫面額外增加一張回顧。回答後可前往下一課或重播本課。完成記錄沿用 `metabear-orderflow-progress` 本機儲存，已完成標記可在地圖取消，留待複習。儲存不可用時，教學仍能操作。

## 共享場景

第一課保留已驗收的流程：100 的淡水平 K 線 → 掛 101 賣單 → 買 1 到 101 → 再買 1 跳到 110 → 拉遠觀察 → 賣 1 到 99 → 回顧長上影線。掛單、成交旅程和 K 線共用價格軸與鏡頭；掛撤單和鏡頭移動不產生額外成交。

後續價格課程也把 K 線留在同一畫布。逐價成交動畫依真實模擬撮合結果移動，每檔抵達後才更新價格及剩餘掛量。逐步揭露成交統計、Footprint、Profile、加權均價、保留量與深度快照。OI 及資金費用課切換成同一畫布裡的多空關係示意，區分合約存量、付款與真正成交。

價格場景切換時，K 線旁的價格刻度與最新成交虛線持續保留。掛單與結論圖層以約 1.1 秒交疊淡出入；Footprint／Profile 則以約 1.45 秒連續調整價格比例，K 線、刻度與逐價紀錄同步移動。轉場只改變觀察方式，不新增成交，並支援暫停、取消及減少動態偏好。

使用 MetaBear 主站色票：深藍黑 `#080e18`、青綠 `#78e1d5`、金色 `#e8bd7d`、次要文字 `#94a8b9`。桌面為敘事與場景並排，手機改成單欄。保留動畫暫停、上一步、重設、系統減少動態偏好；預留暫停控制空間與穩定捲軸寬度，避免動畫期間版面跳動。重設及回退會取消未完成動畫，防止晚到的成交污染場景。

第 15 課以具體實驗練習判讀：先看到 CVD +5、價格 101 與剩餘賣量 1，選擇暫時判讀後才買入 2，逐檔看到 101 耗盡並成交到 102。回顧保留事前選擇，重點是用新證據修正假設；選擇只留在當次頁面，不傳送伺服器。

## 數值與範圍

- 所有價格課均透過原有 `Market` 引擎撮合，OHLC 來自實際模擬成交。
- 起始 100 的 1 單位成交作為 K 線起點，操作統計預設排除；VWAP 課明確包含。
- 掛／撤單只影響報價和深度。成交價、成交量、CVD 不因此新增紀錄。
- CVD 為主動買量減主動賣量；每筆成交都有雙方，不解讀為資金淨流入。
- Footprint 採 1 的價格間距。對角比較買量與下一低價賣量，分母為 0 不算無限失衡。
- Profile / POC / VWAP 僅限已揭露操作；價格與成交量權重由模型計算。
- 冰山單保留量只在教學揭露後顯示，真實深度不宣稱能確認隱藏總量或身分。
- 第 10 課聚焦吸收：三批各買 3，CVD 由 0 至 +9、101 賣量由 12 至 3，第一批以後價格一直維持 101。同一畫布持續顯示掛單、K 線與 CVD 軌跡，逐筆同步更新。
- 熱圖每欄是一個掛單快照，撤單留下歷史亮帶，但不產生成交量。
- OI 採單邊計數：一對多空算 1。雙開增加、雙平減少、一開一平不變。
- 資金費示例為名義部位 10,000 USDT × ±0.01%，只示範單次付款。永續價格溢價與費率分開。
- 第 14 課先教保證金不足與強制平倉，再顯示 A／B 多單（門檻 99／97）：標記價觸發 A、A 賣出消耗 99／98／97、另一步假設標記價下移到 97 觸發 B、B 再賣到 96。觸發本身不新增成交，已平倉部位不可重複執行；未指定對手開平意圖，示例 OI 不變。

## 情境實戰與即時市場

課程地圖提供 `?workspace=practice` 與 `?workspace=live` 工具入口。工作台的課程名稱、排序及完成記錄與新教材一致；返回教學會進入對應沉浸課程。

保留原有固定情境、紙上帳本、三層視圖、Bybit BTCUSDT / ETHUSDT 公開行情、主動錄製及 JSON 取樣回放。即時行情需要學員按下連線才啟動。新手入口不預先展開完整工具。

帳本與未匯出錄製在重整後不保留。最多錄製 300 張取樣快照，並非完整逐筆 L2 歷史。行情過期或斷線時停用紙上成交。沒有接入真實交易權限，也沒有模擬真實保證金、槓桿或交易所成交順位。

## 模組與驗證

- `entry.js`：教學／工具入口路由。
- `curriculum.js`：15 課順序、敘事、操作、視圖與理解題。
- `lesson-shell.js`：共用介面、路徑、進度及課程銜接。
- `foundation.js` / `foundation.css`：場景控制、第一課共用價格鏡頭、動畫與版面。
- `foundation-model.js`：第一課及 OHLC；`guided-model.js`：其餘課程的可重放模型。
- `guided-charts.js`：逐步揭露的 SVG 圖表與多空關係動畫。
- `engine.js` / `feed.js` / `app.js`：原有撮合、紙上帳本、行情及實戰工具。

本機預覽：`node scripts/orderflow-preview.mjs`，開啟 `http://127.0.0.1:8790/orderflow/`。只監聽本機，不依賴 CRM 或資料庫，不需額外安裝套件。

驗證命令：

```sh
node --test tests/orderflow.test.mjs tests/orderflow-foundation.test.mjs tests/orderflow-guided.test.mjs
npx tsx --test tests/orderflow-routing.test.ts
npm run check
```

33 個模型／行情測試與 3 個路由測試通過；型別檢查通過。瀏覽器另外逐課驗證操作、理解題、回退、重設、課程地圖、銜接與行動版排版。

## 官方參考

- [Coinbase：訂單類型](https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/order-types)
- [CME：Open Interest](https://www.cmegroup.com/education/lessons/open-interest)
- [Sierra Chart：Numbers Bars 與對角比較](https://www.sierrachart.com/index.php?l=doc%2FNumbersBars.php)
- [Bybit：Funding Fee](https://www.bybit.com/en/learn/bybit-guide/what-is-the-funding-fee)
- [Bybit：訂單執行與清算](https://www.bybit.com/en/help-center/article/FAQ-Order-Execution-and-Liquidation)
