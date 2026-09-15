# LINE Bot 體驗優化 Spec

適用範圍：現行 TypeScript Worker（`src/`）。回覆仍使用固定教材與已發布知識庫原文；模型只負責選教材 ID，不撰寫答案、不改邀請碼、不核實資格。

上線方式：`npm run deploy` 發佈 staging。`git push` 不會讓 LINE 生效。圖文選單（rich menu）變更後，須再觸發安裝（後台 `POST /api/line/rich-menu` 或 Queue `line-menu-install`）。

---

## 非目標

- 不改成自由生成聊天助手。
- 不把知識庫改成「整句錨定才回答」。標題／關鍵片語的包含匹配維持現狀；後台關鍵詞應寫完整問法，避免單字（例如「入金」「KYC」）。
- 不實作用戶截圖的視覺辨識。
- 不為每個同義說法新增正規式。
- 不變更 `workers.dev` 子網域、不綁定自訂網域。

---

## 現況約束（實作時必須遵守）

- 短指令與按鈕標題精確匹配必須保留：選單、下一張／上一張、UID 登記、人工協助、`directRoute` 的教學命令等。
- 長句未命中短指令時：知識庫定篇 →（可選）整句短規則 → OpenAI 選課 → 上下文備援／clarify／人工。
- LINE webhook 必須快速回 HTTP 200。可能呼叫模型的事件仍應進 Cloudflare Queue，以保留重試。
- `fallbackRoute` 在模型失敗後，不得再以「句子包含某關鍵字」搶答。

---

## 波次 1：延遲與誤判

目標：點選明確按鈕幾乎不必等佇列；長句不被單一字詞帶到錯誤教材。

### 1.1 短指令快速通道

**問題：** `src/webhook.ts` 將所有已接受事件 `sendBatch` 進 `LINE_EVENTS`。選單與教學按鈕與自然問句同一條佇列，體感延遲常達數秒。這與規則數量無關；`AbortSignal.timeout(8000)` 只是模型呼叫上限。

**實作：**

1. 在 `src/webhook.ts` 於驗簽、過濾一對一事件之後，依訊息文字或 postback 的 `text`／`question_text`／`topic` 判斷是否為「可立即回覆」的短指令。
2. 短指令清單至少包含：`選單`／`menu`／`開始`、`更多教學`、`開始註冊`、各 `STEPS` 標題、`提交 UID`、`我的進度`、`人工協助`、`圖片教學 <step> [頁碼]`、整句 `下一張`／`上一張`／`上一步`／`繼續看圖`（以及入金流程中整句 `下一步`）。與 `src/bot.ts`、`src/assistant.ts` 的 `directRoute` 保持一致。
3. 短指令：回 HTTP 200 後以 `ctx.waitUntil(processLineEvent)` 處理，不進入 Queue。仍使用現有 `webhook_events`／`customer_leases` 去重與租約。處理失敗時再入隊，避免回覆遺失。
4. 其餘事件（自然語句、可能需要模型）：維持 `LINE_EVENTS.sendBatch`。
5. `src/bot.ts`：選單、訂閱、UID、人工協助等既有提前 return 維持在 `knowledgeCandidates` 之前。進入 `routeQuestion` 前，若已能判定為 `directRoute`，不要先掃描最多 500 篇知識庫。

**測試：** `tests/crm.test.ts`、`tests/line-services.test.ts`。確認 webhook 仍不阻塞等待模型；短指令路徑不依賴 Queue 才產生回覆。

### 1.2 移除子字串搶答

**問題：** `src/assistant.ts` 的 `keywordRoute` 以「句子中出現入金／KYC／合約等」即選定教材。複合長句會被帶錯課。`fallbackRoute` 開頭會再呼叫一次 `keywordRoute`，模型失敗時同樣會搶答。

**實作：**

1. 將 `keywordRoute` 改為整句短指令：使用 `^`／`$` 錨定，或「移除關鍵片語後只剩允許的陪襯字」（請、如何、怎麼做、教學、嗎、呢、標點）。長句必須回傳 `undefined`。
2. 從 `fallbackRoute` 移除對 `keywordRoute` 的呼叫。保留：
   - 整句「好了／完成了／然後呢／接下來呢」依 `teaching_context` 推進課表；
   - 「在哪／找不到／看不懂／這個欄位」延續當前主題；註冊上下文且提到「欄位」時改走邀請碼（`code`）。
3. `routeQuestion` 順序：`directRoute` → `matchKnowledge` → 收斂後的短句規則 → `modelRoute` → `fallbackRoute`。

**測試調整：**

- 現有「KYC 怎麼做」等短句可仍為 `rule` 或 `knowledge`。
- 「Hi，KYC 怎麼做？」不應只因包含「KYC」而進 KYC 教學。
- 新增：`信用卡入金一直沒到帳，要找客服嗎` 不得路由到 `deposit` 教學。

---

## 波次 2：圖文選單留在對話

**問題：** `src/line-rich-menu.ts` 的 `richMenuDefinition` 中，新手教學、入金教學、合約學習使用 `uri` 開啟網站 `/learn?...`，用戶離開 LINE 對話。UID 格傳送自然問句「如何查找及提交 UID？」，可能進入知識庫或模型，而不是短指令。

**實作：**

1. 將三格網站連結改為 postback，`data` 使用與 `directRoute` 相同的指令字，例如 `開始註冊`、`入金教學`、`合約基礎`。
2. UID 格改為傳送短指令 `提交 UID`（若改走知識庫，則使用已發布文章標題「找不到 UID」，二者擇一，不要使用長問句）。
3. 進度、人工協助維持 postback 短指令。
4. 更新 `menuName`（目前為 `MetaBear service menu 2026-09-14-v1`）。名稱不變時，安裝程序可能略過更新。
5. 網站教學改由對話內卡片的選用連結提供，不作為圖文選單主動作。
6. 部署 Worker 後執行 rich menu 安裝；未重裝則客戶端仍為舊按鈕。

**測試：** 選單定義單元／整合測試；實機確認六格皆在 LINE 內回覆。

---

## 波次 3：無法分類與非文字訊息

### 3.1 Clarify

**位置：** `src/bot.ts` 中 `route.topic === "clarify"`。

- 存在 `teaching_context`：回覆應點出目前主題與（若適用）頁碼，提供「再看一次」「下一張」「人工協助」「選單」，不要一次列出全部教學主題。
- 無上下文：僅提供註冊、入金、我的進度、常見問題、人工協助。
- 同一用戶連續兩次 clarify：主動詢問是否轉人工。計次可寫入 `teaching_context` 或查 `route_events`。

### 3.2 貼圖、語音、位置、檔案

**位置：** `src/webhook.ts` 的 `processLineEvent`。

目前非 `text` 且非 `image`／`video` 時不產生回覆。改為固定短文加選單，說明請用文字或按鈕描述卡住的步驟。

### 3.3 圖片／影片（可與 3.2 同批）

目前一律 `requestSupport`。改為：若正在 KYC／入金教學，先提供「再看此步」或「轉人工」，不要預設已有客服在處理。無教學上下文時再建立人工協助案件。

---

## 波次 4：邊界誤判

| 項目 | 位置 | 行為 |
|------|------|------|
| 純數字被當成 UID | `src/bot.ts` 中 `^\d{4,30}$` | 先確認「是否登記此 BingX UID」。訊息為 `UID 123456789` 這類帶前綴者可維持直接登記。 |
| 入金多頁中途說「好了／然後呢」 | `fallbackRoute` 的 `next` 對照 | `deposit_bitopro`、`deposit_card` 不得直接跳到 `uid`。改為翻下一張，或詢問「繼續看圖／提交 UID」。`bot.ts` 將入金中的整句「下一步」視為翻頁，該邏輯保持。 |
| 教學上下文過期 | `teaching_context.updated_at` 與 `src/bot.ts` | 超過約定時長（建議 6–12 小時）視為無上下文。可選：回覆時標明「接續目前的〈主題〉第 N 步」，並提供「不是這題」。 |
| 整句僅「客服／人工／真人」 | `src/bot.ts` 人工協助正規式 | 可加確認按鈕。優先級低於本波次其他項。 |
| 連發訊息 | `customer_leases` | 同一用戶同時僅處理一則，後續事件 503 後重試。可選：避免用戶以為沒回覆。非本 spec 第一優先。 |

---

## 主要檔案

| 檔案 | 職責 |
|------|------|
| `src/webhook.ts` | 短指令走 `waitUntil`；其餘入隊；非文字回覆 |
| `src/bot.ts` | 短指令提前結束、clarify、UID 確認、知識庫掃描時機、上下文過期 |
| `src/assistant.ts` | `directRoute`、`keywordRoute`、`fallbackRoute`、`routeQuestion` |
| `src/knowledge.ts` | 原則不改匹配模型 |
| `src/line-rich-menu.ts` | 圖文選單動作與 `menuName` |
| `src/line-loading.ts` | 可選：快速通道縮短 loading |
| `tests/crm.test.ts` | 路由、教材、知識庫、webhook |
| `tests/line-services.test.ts` | loading、webhook 入隊時機 |

---

## 驗收

每波次：`npm test`，本機 `npm run dev` 使用後台對話模擬器。要對真實 LINE 生效再 `npm run deploy`。波次 2 另須重裝 rich menu。

後台 `/api/stats`（近 7 天 `route_events`）：

- 短指令的 `queue_delay_ms` 應下降（快速通道不再排隊）。
- 長句不應大量標為 `method=rule`。
- `topic=clarify` 比例可作為聽不懂頻率的參考。

建議實作順序：波次 1 → 2 → 3 → 4。
