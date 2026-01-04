# 投資概念問答 LINE Bot

一個專注於「概念解釋」的投資教育聊天機器人，使用 Python FastAPI + LINE Bot SDK + LLM 實作。

## 🎯 產品定位

- **只解釋概念**：OI、Volume、CVD、Order Book Depth、RSI 等指標的概念說明
- **不提供交易建議**：嚴格禁止任何買賣方向、進出場、停損停利等建議
- **教育導向**：強調風險、限制與常見誤解

## 🚀 功能特色

### 1. Quick Reply 題庫系統
- 五大主題：OI、Volume、CVD、Order Book Depth、RSI
- 每個主題 3 個精選問題
- 使用者輸入「menu」或「選單」觸發

### 2. LLM 智能回答
- 使用 OpenRouter API（DeepSeek R1 免費模型）
- 支援對話歷史（最近 2 輪，共 4 則訊息）
- 雙層 Guardrails 防護機制

### 3. LLM 模式開關
- 可透過 Rich Menu 或 Postback 開啟/關閉
- 關閉時不呼叫 LLM，節省成本

### 4. 雙層 Guardrails
- **Layer 1（軟限制）**：System Prompt 定義行為邊界
- **Layer 2（硬限制）**：Output Checker 用 regex 檢查輸出，發現禁止內容時返回 fallback

## 📁 專案結構

```
LineBot/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI 主程式
│   ├── config.py               # 配置管理
│   ├── db/
│   │   ├── __init__.py
│   │   ├── session.py          # 資料庫連線
│   │   ├── models.py           # SQLAlchemy Models
│   │   └── crud.py             # CRUD 操作
│   ├── line/
│   │   ├── __init__.py
│   │   ├── client.py           # LINE Bot API 客戶端
│   │   ├── handlers.py         # Webhook 事件處理
│   │   └── schemas.py          # Pydantic schemas
│   ├── llm/
│   │   ├── __init__.py
│   │   ├── client.py           # LLM API 客戶端
│   │   ├── prompts.py          # System Prompt
│   │   └── output_checker.py  # 輸出安全檢查
│   └── content/
│       ├── __init__.py
│       └── questions.yaml      # 題庫檔案
├── alembic/
│   ├── env.py
│   ├── versions/
│   │   └── 001_initial_migration.py
│   └── script.py.mako
├── alembic.ini
├── requirements.txt
├── .gitignore
└── README.md
```

## 🛠️ 安裝與設定

### 1. 安裝相依套件

```bash
pip install -r requirements.txt
```

### 2. 設定環境變數

複製 `.env.example` 為 `.env`，並填入實際值：

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/linebot

# LINE Bot
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token_here
LINE_CHANNEL_SECRET=your_channel_secret_here

# LLM - OpenRouter
LLM_API_KEY=your_openrouter_api_key_here
LLM_API_BASE=https://openrouter.ai/api/v1
LLM_MODEL=deepseek/deepseek-r1-0528:free
LLM_HTTP_REFERER=https://your-website.com  # 可選
LLM_X_TITLE=投資概念問答 Bot  # 可選

# Server
HOST=0.0.0.0
PORT=8000
```

### 3. 設定資料庫

如果你使用 Zeabur PostgreSQL（雲端資料庫），連線字串已經在 `.env` 中設定好了。

如果你使用本地 PostgreSQL，需要先建立資料庫：

```bash
# 建立資料庫
createdb -U postgres linebot

# 執行 migrations
alembic upgrade head
```

**使用 Zeabur PostgreSQL**：
```bash
# 直接執行 migrations（資料庫已存在）
alembic upgrade head
```

### 4. 啟動 FastAPI

```bash
# 開發模式（會自動重載）
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 或直接執行
python app/main.py
```

伺服器會在 `http://localhost:8000` 啟動。

## 🌐 設定 LINE Webhook

### 使用 ngrok（開發環境）

1. 安裝並啟動 ngrok：

```bash
ngrok http 8000
```

2. 複製 ngrok 提供的 HTTPS URL（例如：`https://abc123.ngrok.io`）

3. 前往 [LINE Developers Console](https://developers.line.biz/console/)
   - 選擇你的 Channel
   - 前往「Messaging API」頁籤
   - 設定 Webhook URL：`https://abc123.ngrok.io/webhook/line`
   - 開啟「Use webhook」
   - 點擊「Verify」測試連線

### 使用實體伺服器（正式環境）

1. 部署 FastAPI 到伺服器（例如：AWS EC2、GCP、Heroku）
2. 設定 HTTPS（建議使用 Nginx + Let's Encrypt）
3. 在 LINE Developers Console 設定 Webhook URL

## 🧪 測試功能

### 1. 測試選單功能

在 LINE Bot 中輸入：
- `menu` 或 `選單`

應該會看到五個主題的 Quick Reply 按鈕。

### 2. 測試問題回答

點選主題後，會顯示該主題的 3 個問題，點選任一問題，機器人會用 LLM 解釋該概念。

### 3. 測試 LLM 模式切換

使用 Rich Menu 或發送 Postback：
```
action_type=TOGGLE_LLM&enabled=false  # 關閉 LLM
action_type=TOGGLE_LLM&enabled=true   # 開啟 LLM
```

### 4. 測試 Guardrails

嘗試問以下問題（應該會被攔截）：
- 「現在可以做多嗎？」
- 「該不該進場？」
- 「停損要設在哪？」

機器人應該回覆 fallback 訊息，拒絕提供交易建議。

## 📊 資料庫 Schema

### users
| 欄位 | 類型 | 說明 |
|------|------|------|
| line_user_id | VARCHAR(100) | PRIMARY KEY |
| created_at | TIMESTAMP | 建立時間 |

### user_settings
| 欄位 | 類型 | 說明 |
|------|------|------|
| line_user_id | VARCHAR(100) | PRIMARY KEY, FK |
| llm_enabled | BOOLEAN | LLM 啟用狀態（預設 true） |
| created_at | TIMESTAMP | 建立時間 |
| updated_at | TIMESTAMP | 更新時間 |

### chat_history
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | INTEGER | PRIMARY KEY |
| line_user_id | VARCHAR(100) | FK |
| role | VARCHAR(20) | 'user' or 'assistant' |
| text | TEXT | 訊息內容 |
| created_at | TIMESTAMP | 建立時間 |

## 🔒 安全機制

### Layer 1: System Prompt（軟限制）
- 在 `app/llm/prompts.py` 中定義
- 明確告知 LLM 不能提供交易建議
- 只能解釋概念、強調風險

### Layer 2: Output Checker（硬限制）
- 在 `app/llm/output_checker.py` 中實作
- 使用 regex 檢查 LLM 輸出
- 偵測到禁止關鍵詞時返回 fallback 回覆

### 禁止關鍵詞包含：
- 交易動作：做多、做空、買入、賣出、進場、出場
- 風險管理：停損、停利、槓桿、倉位
- 承諾預測：保證獲利、必漲、必跌、高勝率

## 📝 Rich Menu 設定範例

在 LINE Developers Console 設定 Rich Menu，可加入以下 Postback 動作：

```json
{
  "type": "postback",
  "label": "開啟 LLM",
  "data": "action_type=TOGGLE_LLM&enabled=true"
}
```

```json
{
  "type": "postback",
  "label": "關閉 LLM",
  "data": "action_type=TOGGLE_LLM&enabled=false"
}
```

```json
{
  "type": "message",
  "label": "選單",
  "text": "menu"
}
```

## 🐛 除錯

### 查看 Logs

FastAPI 會輸出詳細的 logs，包括：
- Webhook 接收的事件
- LLM API 呼叫
- 安全檢查結果

### 常見問題

**Q: Webhook 驗證失敗？**
- 檢查 `LINE_CHANNEL_SECRET` 是否正確
- 確認 ngrok URL 是否正確設定

**Q: LLM 沒有回應？**
- 檢查 `LLM_API_KEY` 是否正確
- 確認 API 額度是否足夠
- 查看 logs 確認錯誤訊息

**Q: 資料庫連線失敗？**
- 檢查 PostgreSQL 是否執行
- 確認 `DATABASE_URL` 格式正確

## 📦 部署建議

### 環境變數管理

正式環境請使用：
- AWS Secrets Manager
- Google Secret Manager
- HashiCorp Vault

不要將 `.env` 檔案提交到版本控制。

## 📄 授權

MIT License

## 🤝 貢獻

歡迎提交 Issue 或 Pull Request！

---

**重要提醒**：此機器人僅供教育用途，不構成任何投資建議。投資有風險，請謹慎評估。

