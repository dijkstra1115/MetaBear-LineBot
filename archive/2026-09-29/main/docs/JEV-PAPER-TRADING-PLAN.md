# Jev 訂單流模擬交易研究與實作規劃

研究日期：2026-09-19。本文保留最初的 Velo 研究方案；後續實作已改為 Bybit 公開 API、自建模擬帳本與規則 baseline，見 [目前可執行的量化研究室](QUANT-LAB.md)。未呼叫付費模型 API，也沒有真實下單。

初版依需求評估 Velo；使用者之後同意研究替代資料來源。現在採 Bybit 公開資料，不接入 BingX 行情、模擬倉或真實交易。

## 1. 結論與適用範圍

建議建立「Velo 行情 → 訂單流特徵 → Jev 決策 → 程式風控 → 自建模擬成交 → 公開紀錄」實驗。

Jev 是否能增加交易績效仍待驗證。官方介紹是通用決策模型，不能把型別正確、低延遲或模型信心當作交易優勢的證據。

第一版提案：BTC-USDT、ETH-USDT 永續合約；每分鐘檢查新資料；以 5 分鐘為主要決策週期，1 分鐘與 15 分鐘作上下文；先測 15–60 分鐘持倉。這些是實驗設定，並非已驗證的最佳參數。預設不加倉、不攤平、不反手於同一決策事件。

## 2. Jev 如何接入

官方介面：`POST https://api.typesafe.ai/v1/systemone`，使用 Bearer API key，body 為 `model`、`state`、`questions`。可從 TypeSafe console 取得帳戶與金鑰；實際存取權須以帳戶確認。正式實驗固定模型版本，避免 latest 更新導致實驗中途改變。

官方目前列出的版本為 `jev-1.13.0`；輸入 US$0.042／百萬 tokens、輸出免費。來源：[API](https://docs.typesafe.ai/api)、[模型與價格](https://docs.typesafe.ai/models)、[取得金鑰](https://docs.typesafe.ai/introduction/quickstart)。

可使用的輸出：

| 類型 | 本專案用途 |
| --- | --- |
| Choice | 選擇行情型態或候選交易計畫，包含觀望 |
| Score | 依明確文字分級評估訊號一致程度；不拿來產生精確價格 |
| Noul | 評估「目前證據是否支持某個定義明確的形態」 |

同一次呼叫中的問題各自獨立，不能讓問題 B 假設自己知道問題 A 的答案。若採兩階段決策，必須先保存第一階段，再將其輸出明確傳入第二次呼叫。第一版先用同一 state 的原子判斷與候選計畫選擇，交由程式處理衝突。來源：[模型概念](https://docs.typesafe.ai/introduction)。

官方明列數學、精確數字與時間比較是弱項，因此 CVD、OI 變化、距離、倉位、費用和損益都由程式計算。輸入同時附上數值、單位和可追溯的描述，例如「現貨主動買量位於過去 24 小時第 92 百分位」。這種描述不得預先寫成「應買入」。來源：[已知限制](https://docs.typesafe.ai/model-jaggedness/jev-1.13)。

Jev 接受文字／JSON，不接受圖表圖片。建議使用英文欄位和問題，網站再以固定詞彙轉成繁體中文。來源：[State](https://docs.typesafe.ai/concepts/state)。

`confidence` 是由選項分布計算出的確定程度；`probabilities` 是對指定問題的選項分布。兩者都不能直接標成「這筆交易獲利機率」。若要展示勝率，需要用獨立樣本的實際交易結果校準。來源：[Confidence](https://docs.typesafe.ai/confidence)。

## 3. Velo 的可用性與限制

官方 API base 為 `https://api.velo.xyz`，HTTP Basic auth 的 username 是 `api`，password 是 API key；另提供 `velo-sdk` TypeScript SDK。訂閱目前標示 US$199／月；月繳提供 3 個月歷史，年繳提供完整歷史，仍須逐品種確認可用起點。可向官方申請試用。來源：[API 與價格](https://docs.velo.xyz/api)。

官方文件已提供分鐘行情與歷史訂單簿 API。Rows 使用 `/api/v1/rows`；orderbook 使用 `/api/v1/heatmap`，最小快照間隔為 1 分鐘，僅部分 futures products 支援。不能由此假設有逐筆委託、逐次撤單或完整撮合佇列。來源：[資料端點](https://docs.velo.xyz/api/data)。

TypeScript 訂單簿指南要求從 catalog 篩選 `depth: true` 的產品；orderbook 的歷史起點可能與 K 線不同。應以交易所別快照計算局部深度，跨所彙總僅作市場背景。來源：[訂單簿指南](https://docs.velo.xyz/sdks/typescript/guides/fetch-orderbook-data)。

資料包含 OHLCV、成交相關欄位、OI、資金費率、清算與基差，Velo 也提供唯讀 MCP。生產資料管線優先使用固定 HTTP／SDK 查詢；MCP 可留作開發研究。來源：[Velo MCP 資料目錄](https://docs.velo.xyz/ai/mcp)。

**公開展示的授權須先確認。** Velo 條款明列 API key、原始資料、衍生資料及新聞限自身使用；外部用途需聯絡官方。不能假設「只展示 AI 判斷／衍生指標」就自動豁免。需確認：第三方模型處理、保存快照、公開指標、決策、績效、延遲展示與下載各自是否允許。尚未聯絡廠商。可先完成內部研究與使用示範資料的網頁，Velo 衍生內容對外發布則待用途授權明確後進行。來源：[Velo 條款](https://docs.velo.xyz/terms-of-service)。

## 4. 資料與特徵設計

所有欄位先做來源能力檢查；尚未取得實際 API 樣本，以下為內部 schema 設計，不宣稱是 Velo 原生欄位名稱。

| 特徵群 | 送入 Jev 的內容 | 注意事項 |
| --- | --- | --- |
| 主動成交 | buy/sell notional、delta、CVD 窗口變化、delta/volume | 須確認買賣方定義；若 API 僅有總量，不能反推買賣差 |
| 價格反應 | 1m/5m/15m 報酬、波動、相對 VWAP 距離、區間突破 | 以已完成時間窗計算 |
| 持倉 | OI 變化率、價格與 OI 的聯合狀態 | OI 上升不等於「都是多單」 |
| 現貨／永續 | 兩者 CVD 方向、幅度、跨交易所一致性 | 保留各交易所明細與有效涵蓋率 |
| 訂單簿 | 分別計算距 mid 10/25/50 bps 的 bid/ask notional、失衡與掛單集中區 | 若價格網格太粗，窄區間標記 unavailable；不得補零 |
| 清算／費率 | long/short liquidations、異常百分位、費率及結算週期 | 核對清算方向定義；不要重複累加費率 |
| 品質 | 資料年齡、缺值、來源數、窗口完成狀態、來源時間差 | 缺失與中性訊號分開表示 |

建議的程式計算定義：

- `delta = taker_buy_notional - taker_sell_notional`。
- `cvd_change(window) = sum(delta within window)`；CVD 要保存起算點／重置規則，不能跨不同基準比較絕對值。
- `depth_imbalance = (bid_notional - ask_notional) / (bid_notional + ask_notional)`；空分母或深度不足回傳缺值。
- 保留 OI 原始合約／幣數與正規化方式；USD OI 會同時受價格影響，不能把它的全部增幅當新增部位。
- 所有分位數、z-score、VWAP、ATR 都只用當下已知資料；閾值與特徵程式有版本。

分鐘級資料可測「主動買賣力道、背離、疑似吸收、清算後反應」。無逐筆成交／增量 L2 時，不宣稱能識別真實撤單意圖、spoofing、iceberg 或完整 footprint；「吸收」僅是待檢驗的模式推測。

### 時序與收集

1. 每分鐘抓取最近一小段窗口，去重並確認新 bar 完成；先測 Velo 實際發布延遲，不預設整分即有資料。
2. 保存 `event_time`、`window_end`、`received_at`、`available_at`、交易所、合約、單位及原始回應。
3. 對齊後產生 snapshot；只納入決策開始前已收到的資料。晚到或修訂資料新增版本，不改寫原決策輸入。
4. 產生最近數根 1m/5m/15m 特徵與短文字摘要，預算先抓每幣每次 2k–5k tokens，實測後調整。
5. 每 5 分鐘主要評估一次；異常事件是否加評估先另立實驗，避免在同一績效曲線中悄悄改頻率。
6. 延遲、缺欄、來源差異超過事先設定門檻時不開新倉，保存失敗事件。既有停損與持倉管理獨立於模型持續處理。

不需要先 fine-tune Jev。先透過 state、定義、例子及 criteria 設定工作，固定資料與問題版本再比較成果。

## 5. 策略與模型責任

第一個候選策略是「訂單流確認的突破／延續」：價格突破已定義區間，觀察現貨與永續主動量是否配合、OI 是否支持新增參與、流動性是否足夠，並保留觀望。

第二個獨立策略是「疑似吸收／背離反轉」：大幅主動賣出但價格不再下跌、價格收回事先定義區間，觀察其他來源是否支持。這些只是研究假說，不能單憑 CVD 背離就認定反轉。兩種策略先各自記帳，避免混在一起後無法歸因。

程式產生有限候選計畫，每個計畫都附確切 entry rule、stop、take profit、expiry、最大持有時間及估計成本；數值由同一固定規則計算。Jev 選 `long_plan`、`short_plan` 或 `wait`，評估訊號一致性。倉位存在時，改為 `hold`、`close`、`reduce` 的合法候選，不提供會意外重複開倉的選項。

開倉信心門檻從時間切分的驗證集選擇；不可直接把 0.8 當成普遍有效值。模型判斷與原子訊號互相矛盾時，記錄並觀望，不用事後文字把矛盾合理化。

API body 示意（**合成特徵，非行情、非已執行呼叫**）：

```json
{
  "model": "jev-1.13.0",
  "state": {
    "mode": "paper",
    "symbol": "BTC-USDT",
    "feature_version": "of-v1",
    "quality": { "complete": true, "age_seconds": 12 },
    "facts": {
      "spot_flow_5m": "strong net aggressive buying",
      "perp_flow_5m": "weak net aggressive buying",
      "price_response_5m": "price remains inside the prior range",
      "oi_5m": "rising",
      "depth_status": "unavailable"
    }
  },
  "questions": {
    "flow_alignment": {
      "type": "choice",
      "instructions": "Classify agreement between spot and perpetual aggressive flow. Treat unavailable data as missing, not neutral.",
      "criteria": {
        "aligned_buying": "Both show clear buying pressure.",
        "aligned_selling": "Both show clear selling pressure.",
        "mixed": "Direction or strength is materially inconsistent.",
        "insufficient": "Required observations are unavailable."
      }
    }
  }
}
```

此範例只說明合法呼叫形式。真正 action 問題需先附上實際候選計畫及完整 criteria，不能用以上四個描述直接下結論。

## 6. 自建模擬帳本與成交

第一版只實作 `PaperBroker`，研究 worker 只使用 Velo 與 Jev 金鑰，不持有任何交易所金鑰、不引入交易所行情或下單 adapter。既有 `src/bingx.ts` 服務 CRM，與本實驗沒有資料或執行依賴。

模擬計價以 Velo 提供的單一交易所、單一合約為準。第一版提案使用 Velo 的 Binance USDT 永續 BTCUSDT／ETHUSDT 資料；需先用 catalog 與實際樣本確認欄位和歷史覆蓋。跨所彙總訊號只用於判斷背景，不混入單一合約的成交、估值或 funding。頁面明示「Velo 資料驅動的自建模擬」，不代表該交易所的實際成交。來源缺失時停止新倉，不自動改接交易所 API。

成交規則：

- 模型結果先落盤，之後等待 Velo 下一個時間在決策之後、且已收到的價格／訂單簿快照再模擬成交；不使用輸入窗口的收盤價立即成交。若只有 OHLC，使用決策之後開始的完整時間窗，並等待該窗口資料實際取得，不能回填成決策當下成交。
- 有可用訂單簿時，以 ask 側買入、bid 側賣出，再加入固定可重現的延遲／滑價假設；深度不足時部分成交或拒絕。Velo 的價格網格與分鐘快照不是逐筆可執行報價，不宣稱重現精確 BBO、排隊或市場衝擊。
- 只有 K 線的期間採獨立標記的 OHLC 成交模式，使用固定價差／滑價假設；先對不同成本情境做敏感度分析。不可無聲切換模式或把假設價差標成實測價差。
- 第一版先用市價單。限價單後續再做，單純觸價不代表排隊成交。
- 交易手續費為版本化假設設定，不讀取任何交易所帳戶。Funding 僅用 Velo 同一合約資料；先確認其正規化費率能否還原結算週期與事件，若不足則明示為估計 funding，不能假裝是實際帳單。不能把每分鐘提供的 8 小時標準化費率逐筆全額累加。
- 停損遇跳價使用下一個符合模擬規則的 Velo 價格；不保證成交於 stop 價。只有 OHLC 的回放若同根觸及停損與停利，使用事先約定的保守順序並標示限制。
- 停損處理與模型呼叫分開，每取得新 Velo 資料都檢查既有倉位；明示分鐘級成交模型。若 Velo 沒有更高頻資料，就保留此精確度限制，不另接 BingX 或其他交易所行情。
- 資料斷線時禁止新倉，既有倉位標示估值過期，不虛構成交。恢復後按下一可用價處理，保留停機期間與滑價。

初始實驗參數提案：10,000 USDT 虛擬本金、每筆停損風險預算 0.25%、總名目曝險不超過淨值 1 倍、同幣單一部位、單日虧損 2% 停止新倉。不是獲利保證或實盤建議；遇跳價實際虧損可超過預算。倉位計算使用停損距離並預留費用，不能由模型任意給槓桿。

所有委託以 decision_id 做冪等控制；重試不得重複建倉。委託、成交、現金流、持倉使用原子更新，定期核對帳本不變量。

## 7. 網頁如何呈現真正決策

建議新增 `/lab/jev`。所有使用者觀看同一個共享實驗帳本，避免每個訪客重複呼叫模型。明示「真實行情／模擬成交」，顯示來源更新時間與延遲。

頁面可包含：

1. 決策時間軸：做多、做空、觀望、持有、減倉、平倉，以及失敗／資料不足事件。
2. 當時快照：價格、CVD、OI、深度、資料品質，依取得的展示授權範圍提供。
3. 模型輸出：完整 choice/probabilities/confidence，固定模型版本與問題版本。
4. 執行結果：模型建議、風控允許／拒絕、模擬成交分欄，避免把風控決定說成模型決定。
5. 帳戶與績效：淨值、已實現／未實現損益、手續費、funding、最大回撤、交易數、基準策略。
6. 展開詳情：snapshot ID、輸入／輸出雜湊、決策／委託／成交時間，及授權允許的原始資料。

Jev 沒有可展示的長篇推理輸出。使用模板把實際分類轉成文字，如「模型判斷現貨與永續買盤不一致，選擇觀望」。若另外請語言模型寫說明，必須標示「依紀錄生成的解說」，不能冒充 Jev 的內部思考或證明其因果理由。

日誌只追加，修正另立事件。含失敗與觀望的全部決策先保存再公開；不能刪除虧損、回填進場時間或只挑成功案例。雜湊協助偵測修改，但若要求對外可驗證，應定時發布帶時間戳的日誌摘要；自行存一個 hash 不等於不可篡改證明。

## 8. 如何知道 Jev 有沒有增加價值

用相同特徵、相同成交、相同費用、相同風控比較：

- 不交易／持有現金。
- 簡單買入持有，作市場曝險參考。
- 固定訂單流規則。
- 同一候選策略加 Jev 選擇／過濾。

先以歷史資料做按時間排序的開發／驗證／測試，持有期重疊的邊界加 purge/embargo；封存測試集，不用其結果反覆挑 prompt。特徵正規化也不得偷看未來。模型訓練資料與截止日期若不明，歷史回測只能作初篩，需以開始記錄後的前向模擬為主。

測試至少包含訊號一致、來源衝突、深度缺失、行情過期、模型超時、重複事件及劇烈跳價。前向試跑先規劃 2–4 週，以交易數和行情多樣性決定是否需要延長；時間到了不代表足夠證明優勢。

報告成本後淨報酬、最大回撤、每筆期望值、profit factor、週轉率、曝險時間、樣本數、等待比例及停機時間；勝率單獨沒有意義。信心校準須先定義可驗證事件與預測期限，再看 reliability/Brier 等指標，不能把「選了 long」當成獲利事件機率。

## 9. 接入現有 MetaBear

沿用網站與 TypeScript，研究服務建議獨立 Worker／資料庫及 secrets，避免和 LINE／CRM 工作混在一起。

```text
Velo（跨所分析資料 + 固定合約模擬計價資料）
  → 來源驗證、快照保存
  → 特徵引擎與候選計畫
  → Jev 評估
  → 原始決策日誌
  → 固定風控
  → PaperBroker → 委託／成交／損益帳本
  → 唯讀公開 API → /lab/jev
```

建議模組：`market-data`、`features`、`jev`、`risk`、`paper-broker`、`ledger`、`research-api`。可使用 Cron 觸發分鐘級資料任務，Queue 處理背景工作；任務都需去重，帳本更新使用可序列化的交易處理。決策／交易摘要存關聯資料庫；大量原始快照考慮物件儲存；網頁先定時輪詢。不把每分鐘排程當作精準逐筆撮合計時器。來源：[Cloudflare Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)。

開發順序與驗收：

1. **可用性驗證**：取得 Jev／Velo 存取權；確認 Velo 目標品種、欄位、單位、歷史起點、資料延遲及授權。保存實際 API sample，再定 schema；不建立交易所 API 依賴。
2. **自建模擬核心**：行情快照、規則基準、PaperBroker、帳本及故障處理；以固定事件序列驗證損益、成本和冪等。
3. **Jev 對照實驗**：固定版本的 state/questions、完整日誌、離線回放、前向模擬。
4. **展示頁**：先內部驗收，獲得所需展示權利後發布完整的決策時間軸與績效。

估算模型成本：假設 BTC／ETH 各每分鐘一次、每次總輸入 3,000 tokens、30 天，為 259.2M tokens × US$0.042/M ≈ **US$10.89／月**；每 5 分鐘一次約 US$2.18。這是算式估算，實際以 API usage 計，額外階段、重試與事件觸發另算。資料訂閱、外部展示授權、行情收集及主機儲存另計，不能把 US$199 當公開網站完整授權報價。

本次只新增研究文件，未修改網站或交易程式，未新增排程，未部署，未建立 API 金鑰或使用任何帳戶資產。
