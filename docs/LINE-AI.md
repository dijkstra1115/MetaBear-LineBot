# LINE AI 對話接線與驗收

用戶的操作都在 LINE：自然提問 → OpenAI 判斷主題與格式 → 回覆已確認的文字或教學圖片。後台網站供管理員管理客戶與測試對話。

## 對話範例

| 用戶說                       | 回覆行為                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| 我該如何註冊？               | BingX 註冊文字、邀請連結、邀請碼 ZD0CQ0，以及「看圖片」按鈕 |
| 這個地方要寫誰介紹的？       | 理解上一題的註冊上下文，回覆邀請碼欄位教學                  |
| 可以給我看圖嗎？             | 直接傳送原始註冊截圖與說明，可在 LINE 點開圖片              |
| 不用圖片，文字就好           | 切回文字，記住格式偏好                                      |
| 我已經註冊好了，接下來呢？   | 接續 KYC 教學，不標記已核實、不誤轉客服                     |
| 我的身分驗證通過了，然後呢？ | 接續入金教學，入群門檻使用 200 USDT                         |
| UID 要在哪裡找？             | 說明 UID 位置，不當成 UID 登記命令                          |
| 逐倉和全倉差在哪？           | 回覆對應的合約入門教材                                      |

目前有註冊／邀請碼、KYC、BitoPro 入金（7 張）及 BingX 信用卡（8 張）原始圖片。先選入金方法，再說「看圖」，每組最多 3 張；按「看下一組圖」或說「下一組圖」繼續。UID 和合約概念提供文字。用戶主動上傳的截圖仍交由人工查看，尚未接入視覺辨識。

## 本機測試

`.dev.vars` 保存本機測試金鑰，已被 Git 忽略。`OPENAI_API_KEY` 是新版本的 OpenAI 金鑰欄位；`OPENAI_MODEL` 在 `wrangler.jsonc`，目前為 `gpt-4.1-mini`。

1. `npm run db:migrate` 套用所有遷移，包括 `0002_teaching_context.sql`。
2. `npm run dev` 啟動本機服務。
3. 後台「對話測試」輸入上述自然句子，核對文字、圖片與接續步驟。development + LINE_DELIVERY_MODE=disabled 才開放此功能；不發送 LINE 訊息。
4. `npm test` 使用外部 API 替身，驗證 webhook、D1、原生圖片、用戶間上下文隔離與模型失敗備援，不消耗 OpenAI 額度。

手動執行真實 OpenAI 測試會消耗少量 API 額度：

```powershell
npx tsx scripts/test-openai.ts
```

腳本使用 `.dev.vars` 的金鑰，以連續 8 則測試問題驗證真實模型輸出。API 失敗後的備援結果不能通過此測試；只輸出測試問題、教材 ID、格式、延遲與 token 用量，不輸出金鑰、不發 LINE 訊息。

## 接上 LINE

需要同一個 LINE Messaging API Channel 的兩個值：

- Channel Secret：驗證 webhook 簽章。
- Channel Access Token：呼叫 LINE 回覆 API。

本機可填在 `.dev.vars` 的 `LINE_CHANNEL_SECRET` 與 `LINE_CHANNEL_ACCESS_TOKEN`；Cloudflare 正式服務使用 Workers Secrets。部署步驟見 [Cloudflare 部署](CLOUDFLARE.md)。

目前測試環境已啟用並通過 LINE 官方 webhook 驗證，詳情見 [測試環境](STAGING.md)：

```text
https://metabear-line-crm-staging.style78432.workers.dev/webhook/line
```

在 LINE Developers → Messaging API → Webhook settings 填入網址、執行 Verify、開啟 Use webhook 與 Webhook redelivery。Worker 的 `PUBLIC_BASE_URL` 設為相同公開網域；確認 `/guides/register.jpg` 可公開取得後，設 `LINE_DELIVERY_MODE=live`。localhost 不能填到 LINE；本機模擬器的 HTTP 圖片例外也不會用於 live 回覆。

## 實測紀錄

2026-09-14：OpenAI `gpt-4.1-mini` 連續 8 則對話全部通過，包含圖片與文字切換、註冊完成後續流程、合約概念。該次共 18,723 input tokens、93 output tokens，每則約 0.9–2.7 秒。另有一則初始連線測試通過。此為初期本機 API 驗證紀錄；目前雲端部署、LINE 收訊與後台 OTP 已驗證，詳見 STAGING.md。

本機 Worker 對話模擬器另走過註冊 → 追問推薦碼欄位並看圖 → 完成註冊改回文字的流程，確認原圖可載入、KYC 教學接續正確。15 項整合測試、TypeScript 檢查與 Cloudflare 部署 dry run 通過。

參考：[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)、[GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[LINE Messaging API](https://developers.line.biz/en/reference/messaging-api/)。
