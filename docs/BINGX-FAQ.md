# BingX 官方常見問題知識庫

查核日期：2026-09-14。13 則新問答，另補充 3 則既有推薦碼問題的官方依據。內容為重新整理的繁體中文短答，不是逐字搬運官方文章。

## 使用方式

LINE 回覆「常見問題」，或由「更多教學 → 常見問題」進入分類；也可直接用自然語言提問。每題保留官方來源按鈕與固定導覽。收不到驗證碼但沒說明方式時，先讓用戶選 Email／簡訊／Google 驗證碼。

## 來源與維護

- `data/bingx-faq.json` 保存本次查核內容、來源 URL、官方頁更新時間、查核日期與分類。
- `migrations/0011_bingx_faq.sql` 將內容寫入既有知識庫及版本歷史。先套用 migration，再部署 Worker；本機測試不代表已更新線上資料。
- 新條目使用 INSERT OR IGNORE；既有推薦碼條目僅在 revision=1、仍為 published 且來源未改動時更新，不覆蓋管理員編輯或退回草稿的內容。已有人工修改的推薦碼問題，應由管理員對照以下來源更新。
- 執行 `node scripts/build-bingx-faq.mjs --check` 核對種子與 migration 一致；0011 部署後不改寫，後续修正走後台或新 migration。
- 後台仍可編輯、發布與退回草稿。LINE 分類選單只讀取已發布的資料庫條目，退回草稿後不再列出或作為候選解法。
- BingX 官方規則與 MetaBear 審核條件分開陳述。BitoPro 的銀行操作不由 BingX FAQ 佐證，沿用先前獨立教材。
- 未納入固定手續費、保證到帳／找回期限、限額數字、活動贈金與地區清單；這些必須依使用者當前帳戶或最新官方公告查核。
- 部分登入與推薦碼來源仍標示 2024 年更新。充值找回文章的搜尋索引顯示 2026-04-07，實際開啟快取頁標示 2025-09-02；本次只採兩者一致的查詢入口與核實流程，不承諾找回費用或時程。
- 建議團隊每月與平台變更公告出現時重新查核；本次未建立自動監控。發現失效內容先退回草稿，核對後再發布並更新來源與查核日期。

## 問答清單

### 登入與驗證碼

**收不到驗證碼怎麼辦？** (`bingx-code-channel`)

你是收不到 Email、手機簡訊，還是 Google Authenticator 的驗證碼無法使用？

先選下方對應問題，我會給你該方式的排查步驟。這裡處理的是 BingX 帳戶驗證；不要把驗證碼貼到 LINE。

[官方來源](https://bingxservice.zendesk.com/hc/en-001/articles/11257235797391-Unable-to-Receive-BingX-Email-Verification-Code-Here-s-What-to-Do) · 官方頁更新：2024-12-25 · 先提供自助解法，使用者可主動選擇人工協助。

**收不到 Email 驗證碼** (`bingx-email-code`)

先查看垃圾郵件匣，再確認信箱是否已滿，以及是否攔截 BingX 郵件。

仍收不到時，請從 BingX App 聯絡官方線上客服，確認寄送狀況。若原信箱已無法使用，依官方驗證頁的「驗證項不可用？」申請處理；資料只交到官方頁面。

[官方來源](https://bingxservice.zendesk.com/hc/en-001/articles/11257235797391-Unable-to-Receive-BingX-Email-Verification-Code-Here-s-What-to-Do) · 官方頁更新：2024-12-25 · 先提供自助解法，使用者可主動選擇人工協助。

**收不到手機簡訊驗證碼** (`bingx-sms-code`)

先重啟手機，確認簡訊收件空間可用；雙 SIM 卡手機也可檢查使用的 SIM 卡。

仍收不到時，請聯絡 BingX 官方線上客服確認簡訊寄送。若綁定門號已停用，從官方驗證頁的「驗證項不可用？」處理。變更安全設定可能影響提幣，依帳戶提示確認。

[官方來源](https://bingxservice.zendesk.com/hc/en-001/articles/11257245487887-Unable-to-Receive-BingX-SMS-Verification-Code-Here-s-What-to-Do) · 官方頁更新：2024-12-25 · 先提供自助解法，使用者可主動選擇人工協助。

**Google 驗證碼一直錯誤** (`bingx-authenticator`)

確認輸入的是 BingX 對應帳戶目前顯示的動態驗證碼，並將手機日期與時間設為自動同步，再重新開啟 BingX 嘗試。

仍無法登入，或已遺失驗證器時，請聯絡 BingX 官方客服辦理帳戶驗證。不要傳送動態碼或驗證器備份金鑰給 LINE。

[官方來源](https://bingxservice.zendesk.com/hc/en-001/articles/11257212430095-What-to-Do-if-the-Google-Authenticator-Code-Is-Incorrect) · 官方頁更新：2024-12-25 · 先提供自助解法，使用者可主動選擇人工協助。

### 身分認證

**KYC 被退件怎麼辦？** (`bingx-kyc-failed`)

先到 BingX「訊息中心」查看退件原因。核對填寫資料、證件有效期，以及照片是否清晰完整，再依官方認證頁補件。

若顯示證件已在其他帳戶使用，請由官方客服協助確認，不要反覆建立新帳戶。證件與自拍只上傳 BingX 官方認證頁。

[官方來源](https://bingxservice.zendesk.com/hc/zh-tw/articles/11257119198607-%E5%80%8B%E4%BA%BA%E8%BA%AB%E4%BB%BD%E8%AA%8D%E8%AD%89-KYC-%E5%A4%B1%E6%95%97%E5%B8%B8%E8%A6%8B%E5%8E%9F%E5%9B%A0%E5%8F%8A%E8%A7%A3%E6%B1%BA%E6%96%B9%E6%A1%88) · 官方頁更新：2026-04-16 · 先提供自助解法，使用者可主動選擇人工協助。

**KYC 一直審核中** (`bingx-kyc-pending`)

先確認目前是「審核中」還是「認證失敗」：失敗需要依退件原因補件；審核中則查看帳戶通知。

若持續停留在認證中，請聯絡 BingX 官方線上客服查詢。實際審核進度由交易所確認，MetaBear 無法代為通過。

[官方來源](https://bingxservice.zendesk.com/hc/zh-tw/articles/11257118976143-%E5%80%8B%E4%BA%BA%E8%BA%AB%E4%BB%BD%E8%AA%8D%E8%AD%89-KYC-%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C) · 官方頁更新：2026-02-03 · 先提供自助解法，使用者可主動選擇人工協助。

### 充值與提幣

**充值轉出卻還沒到帳** (`bingx-deposit-pending`)

先看轉出平台是否已完成轉出，取得 TxID 查詢鏈上進度，再對照 BingX 的充值紀錄與到帳帳戶。

若仍未入帳，從 BingX 充值紀錄的「充值未到賬」提交查詢；準備幣種、網路、數量與 TxID，由官方核實。轉出成功不等於已入帳。

[官方來源](https://bingxservice.zendesk.com/hc/zh-tw/articles/11258095266447-%E5%A6%82%E4%BD%95%E6%89%BE%E5%9B%9E%E5%85%85%E5%80%BC%2F%E6%8F%90%E5%B9%A3%2F%E8%BD%89%E8%B3%AC%E5%A4%B1%E6%95%97%E7%9A%84%E8%B3%87%E7%94%A2) · 官方頁更新：2025-09-02（開啟頁面）；搜尋索引另顯示 2026-04-07，僅採一致內容 · 先提供自助解法，使用者可主動選擇人工協助。

**充值網路怎麼選？** (`bingx-deposit-network`)

先確認轉出平台與 BingX 都支援並開放同一幣種、同一網路，再複製自己帳戶的充值地址。

不要只看地址相似就判斷網路相同，也不要照抄教學圖的地址。若兩邊找不到一致選項，先停止轉帳並向平台確認。

[官方來源](https://bingxservice.zendesk.com/hc/zh-tw/articles/11257098058639-BingX-%E6%95%99%E5%AD%B8-%E5%A6%82%E4%BD%95%E5%85%85%E5%80%BC%E5%8A%A0%E5%AF%86%E8%B2%A8%E5%B9%A3) · 官方頁更新：2026-03-08 · 先提供自助解法，使用者可主動選擇人工協助。

**最低充值額與入群門檻** (`bingx-deposit-minimum`)

BingX 每個幣種／網路的最低充值數量，與 MetaBear 社群的入群門檻是兩件事。

請在 BingX 充值頁核對最低數量，並計入轉出端扣除的費用。MetaBear 不設最低入金金額、允許內部轉帳，不代表交易所任何小額轉帳都會入帳。已低於最低數量時，先向官方確認處理方式。

[官方來源](https://bingxservice.zendesk.com/hc/zh-tw/articles/11257098058639-BingX-%E6%95%99%E5%AD%B8-%E5%A6%82%E4%BD%95%E5%85%85%E5%80%BC%E5%8A%A0%E5%AF%86%E8%B2%A8%E5%B9%A3) · 官方頁更新：2026-03-08 · 先提供自助解法，使用者可主動選擇人工協助。

**漏填 Memo／Tag 怎麼辦？** (`bingx-deposit-memo`)

若 BingX 充值頁要求 Memo／Tag，轉出時也需填寫。已漏填或填錯，請從 BingX 充值紀錄的「充值未到賬」提交交易資料。

是否能找回、如何處理及費用，須由官方核實；MetaBear 不能替交易所退回資產。

[官方來源](https://bingxservice.zendesk.com/hc/zh-tw/articles/11258095266447-%E5%A6%82%E4%BD%95%E6%89%BE%E5%9B%9E%E5%85%85%E5%80%BC%2F%E6%8F%90%E5%B9%A3%2F%E8%BD%89%E8%B3%AC%E5%A4%B1%E6%95%97%E7%9A%84%E8%B3%87%E7%94%A2) · 官方頁更新：2025-09-02（開啟頁面）；搜尋索引另顯示 2026-04-07，僅採一致內容 · 先提供自助解法，使用者可主動選擇人工協助。

**提幣被退回怎麼辦？** (`bingx-withdraw-returned`)

向接收平台取得退回的 TxID 與退回紀錄，再交給 BingX 官方客服查詢。退回交易與原始提幣可能有不同 TxID。

請保留幣種、數量、時間與兩邊紀錄；實際入帳與處理結果由平台確認。

[官方來源](https://bingxservice.zendesk.com/hc/zh-tw/articles/11258095266447-%E5%A6%82%E4%BD%95%E6%89%BE%E5%9B%9E%E5%85%85%E5%80%BC%2F%E6%8F%90%E5%B9%A3%2F%E8%BD%89%E8%B3%AC%E5%A4%B1%E6%95%97%E7%9A%84%E8%B3%87%E7%94%A2) · 官方頁更新：2025-09-02（開啟頁面）；搜尋索引另顯示 2026-04-07，僅採一致內容 · 先提供自助解法，使用者可主動選擇人工協助。

**資金帳戶如何轉到合約帳戶？** (`bingx-account-transfer`)

先看資金目前在哪個 BingX 帳戶。需要在自己帳號內移動時，到「資產 → 劃轉」，核對轉出／轉入帳戶、幣種與數量再確認。

這是同一帳號內的資金移動，與轉到另一位用戶、或鏈上提幣不同；不會因此自動通過 MetaBear 入群審核。

[官方來源](https://bingxservice.zendesk.com/hc/zh-tw/articles/11257143424783-BingX-%E6%95%99%E5%AD%B8%E4%B8%A8%E5%A6%82%E4%BD%95%E5%9C%A8%E8%B3%AC%E6%88%B6%E5%85%A7%E5%8A%83%E8%BD%89%E8%B3%87%E9%87%91) · 官方頁更新：2024-12-25 · 先提供自助解法，使用者可主動選擇人工協助。

### 推薦碼與社群

**找不到 BingX UID** (`bingx-uid-location`)

BingX App：登入後點左上角個人頭像，在頭像旁找到 UID 並複製。網頁版：登入後開啟右上角個人選單查看 UID。

要提交 MetaBear 查詢資格，回覆「UID 你的數字」。提交 UID 不代表邀請關係、KYC 或入金已通過。

[官方來源](https://bingxservice.zendesk.com/hc/en-001/articles/11257209092367-BingX-Tutorial-How-to-Find-My-UID) · 官方頁更新：2025-07-25 · 先提供自助解法，使用者可主動選擇人工協助。

**已綁定別人的邀請碼** (`referral-other`)

這屬於推薦歸屬問題。BingX 官方 FAQ 說明，帳戶綁定推薦碼後不能更改或移除；不要直接再填本團隊的碼，或重新入金嘗試改綁。

MetaBear 可協助核對 UID 與入群資格，但不能代替交易所變更推薦關係。

[官方來源](https://bingxservice.zendesk.com/hc/en-001/articles/11257245410191-BingX-Account-Signup-FAQs) · 官方頁更新：2024-12-25 · 涉及推薦歸屬，建立團隊核實案件。

**可以更改推薦碼嗎？** (`referral-change`)

不能直接承諾能改綁。BingX 官方 FAQ 說明，已綁定的推薦碼不能更改或移除。

若帳戶顯示有疑義，請由官方客服核實。MetaBear 的協助是查詢推薦歸屬與社群資格，不會直接替你更改帳戶。

[官方來源](https://bingxservice.zendesk.com/hc/en-001/articles/11257245410191-BingX-Account-Signup-FAQs) · 官方頁更新：2024-12-25 · 涉及推薦歸屬，建立團隊核實案件。

**漏填或填錯邀請碼怎麼辦？** (`referral-missing`)

你是「沒有填」還是「已填成別人的碼」？

官方 FAQ 說明：尚未充值、買幣或邀請好友，且未綁推薦碼時，可查看「我的推薦人」是否可補填；已有綁定則不能直接更改。

找不到入口或不確定歸屬時，由客服核實。補填與 MetaBear 資格審核是不同步驟。

[官方來源](https://bingxservice.zendesk.com/hc/en-001/articles/11257245410191-BingX-Account-Signup-FAQs) · 官方頁更新：2024-12-25 · 涉及推薦歸屬，建立團隊核實案件。
