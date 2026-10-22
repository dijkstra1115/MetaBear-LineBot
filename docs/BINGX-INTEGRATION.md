# BingX 代理 API 串接決策

確認日期：2026-09-14（台北）。

## 2026-10-22 規則變更（已實作，migration 0016）

使用者確認：「VIP 也改成要入 200u，內部轉帳不算」。VIP 入群和 LINE 訂單流警報通知用同一套資格：團隊推薦歸屬與 KYC 核實，**並且入金 200 USDT，內部轉帳不算**。計算方式是核實當下往回 60 日內累計入金達 200 USDT；達標後記錄下來，不因明細超過 60 日而失去資格。已經入群的 VIP 不必補足，直接保留資格並可開通 LINE 通知。符合資格的人同時取得 VIP 群與 LINE 訂單流通知兩項權益。BingX 的 deposit=true 不分內部轉帳，所以金額要改從入金明細（排除內部轉帳）加總。細節見 [ORDERFLOW-ALERT-SUBSCRIPTION.md](ORDERFLOW-ALERT-SUBSCRIPTION.md)「LINE 通知的資格」一節。已實作：`evaluateRelation()` 要求近 60 日一般充值（不含內部轉帳）的 USDT、USDC 合計達到 `team_settings.deposit_min_usdt`（預設 200）；其他幣種不自動計入，請人工核對。migration 0016 同時把 `allow_internal_transfer` 改成 0 並遞增 `revision`，所以既有的資格快照要重新查詢後才會再發 VIP 邀請；已標記入群的會員不受影響。網站、LINE 文案與兩則 FAQ（`deposit-review`、`bingx-deposit-minimum`，管理員改寫過、已不提舊規則的不覆蓋）一併更新。部署後端並執行 migration 才會生效；下面的 2026-09-14 規則是之前的紀錄。

## 2026-09-14 審核規則

使用者本次確認：「已入金先算，允許內部轉帳」。

- 預定自動審核的入金條件改為已完成入金，不設定 200 USDT 最低金額。
- 接受已完成的內部轉帳轉入。
- 仍需核實團隊推薦歸屬及 KYC；不能由用戶口述或瀏覽教學推定通過。
- 範本已確認 deposit=true，且入金明細 API 可查到內部轉帳轉入。此帳號也有歷史首充，不能只靠這個樣本推定所有「僅內部轉帳」帳號都會得到 deposit=true；仍需額外驗證。
- 查詢失敗、狀態不明或資料延遲維持待確認。

此規則已實作於程式、網站與 LINE 文案，取代先前的 200 USDT 規劃。部署、啟用及操作方式見 [自動化操作文件](AUTOMATION.md)。資格由 UID 的交易所資料決定，不要求 LINE 使用者證明持有該帳號。

## API Key 與 Secret

官方文件提供的入口為 BingX 使用者中心 → API 管理。建立後取得 API Key 與 Secret Key，新建 Key 預設為唯讀。

應使用持有代理關係的帳號建立串接憑證，先測試讀取代理資料的權限；無權限時向 BingX 合夥人窗口確認帳號/API 權限，不自行增加交易或提領權限。

系統從 Worker secrets 讀取憑證，不放入前端或版本庫。使用者明確同意永久保存及啟用後，BINGX_API_KEY 與 BINGX_SECRET_KEY 已透過 Cloudflare MCP 寫入 staging，並已啟用自動化。日後輪替只需更新這兩個 secrets。

## 2026-09-14 唯讀實測

以下是實際回應契約，不代表所有頁面欄位或代理權限都已驗證；未保存憑證或其他用戶的資料。

| 接口 | 實測成功取得的資料 |
| --- | --- |
| inviteRelationCheck | 邀請歸屬、直接邀請、inviterSid、inviteCode、KYC、deposit、trade、註冊時間、balanceVolume、等級、返傭比例及福利資訊 |
| agent/v2/reward/commissionDataList | 每日 tradingVolume、commission、expectedTradingFees、offsetTradingFees、collectedTradingFees、rebateRatio、tradingRebate |
| agent/v1/asset/depositDetailList | 入金 UID、時間、bizType、assetType、assetTypeName、currencyName、currencyAmountVolume；範本包含 Internal Transfer-transfer in |

### 文件與實際接口的差異

- 上述每日佣金與入金明細接口，startTime/endTime 實測需要 Unix 毫秒時間戳。按官方參考的 YYYYMMDD 傳送時得到 100400 / beginTime-over-366；改成 UTC+8 邊界換算的毫秒後成功。後續以實測契約為準。
- depositDetailList 的 uid 實測應填被查詢用戶的 UID。依文件填邀請人 UID 時被拒絕為非受邀用戶；改為範本 UID 成功。
- 每日佣金回應使用 commission，沒有參考文件所列 commissionVolume，也沒有同一列的 spotTradingVolume/swapTradingVolume。businessType=perpetualFutures 已取得範本合約數據；businessType=spot 返回成功但無資料。不得把缺少欄位或空資料自行補為已確認的零。
- 全類型彙總與 businessType 分類資料應分開保存，不能相加，否則重複計量。
- API 交易量字串精度在本次樣本為兩位小數，後台近 30 天交易量保留更多小數；保存原始十進位字串、期間、時區及來源，不以 API 顯示精度重建逐筆交易。
- 入金明細回應未含明確完成狀態欄位；範本的「已完成」來自後台交叉核對，不能在資料模型中假造 API status。
- 本次交易量查詢期間為 2026-08-15 至 2026-09-13（UTC+8），入金查詢為 2026-09-01 至執行當下。成功回應的 total 與已取回筆數一致。

## 待驗證

- 以僅有內部轉帳的新範本確認 deposit 狀態語意與更新延遲。
- 更多月份、現貨有交易的範本、標準合約與其他業務類型，以及大量資料分頁。
- 實際逐筆订单、交易對、槓桿、盈虧與出金 API 能力尚未確認。
- 已實作資格、邀請接受與實際入群分離紀錄，以及重複 UID / 邀請抑制；依使用者決策，不做 UID 持有證明。

## 官方來源

- [API Key 建立與驗證](https://github.com/BingX-API/api-ai-skills/blob/main/skills/references/authentication.md)
- [代理 API 參考](https://github.com/BingX-API/api-ai-skills/blob/main/skills/agent/api-reference.md)
