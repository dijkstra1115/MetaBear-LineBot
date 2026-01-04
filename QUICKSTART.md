# 快速設定指南

## 📋 前置需求

- Python 3.10+
- PostgreSQL 12+
- LINE Developers 帳號
- OpenRouter API 金鑰

## 🚀 5 分鐘快速啟動

### 1️⃣ 安裝相依套件

```bash
pip install -r requirements.txt
```

### 2️⃣ 設定環境變數

建立 `.env` 檔案（可複製 `env.template`）：

```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/linebot
LINE_CHANNEL_ACCESS_TOKEN=你的_LINE_ACCESS_TOKEN
LINE_CHANNEL_SECRET=你的_LINE_SECRET

# OpenRouter
LLM_API_KEY=你的_OPENROUTER_API_KEY
LLM_API_BASE=https://openrouter.ai/api/v1
LLM_MODEL=deepseek/deepseek-r1-0528:free
LLM_HTTP_REFERER=https://your-website.com  # 可選
LLM_X_TITLE=投資概念問答 Bot  # 可選
```

### 3️⃣ 執行資料庫 Migration

```bash
# 執行 migrations 建立資料表
alembic upgrade head
```

> 💡 **使用 Zeabur PostgreSQL**：
> - 連線字串已在 `.env` 中設定
> - 直接執行 `alembic upgrade head` 即可
> - 資料庫會自動建立必要的資料表

### 4️⃣ 啟動伺服器

```bash
# 方式 1：使用啟動腳本
python app/main.py

# 方式 2：使用 uvicorn
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 方式 3：使用 uvicorn 命令
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5️⃣ 設定 LINE Webhook

#### 使用 ngrok（開發環境）

```bash
# 安裝 ngrok
# 下載：https://ngrok.com/download

# 啟動 ngrok
ngrok http 8000
```

複製 ngrok 的 HTTPS URL（例如：`https://abc123.ngrok.io`）

前往 [LINE Developers Console](https://developers.line.biz/console/)：
1. 選擇你的 Channel
2. 前往「Messaging API」頁籤
3. 設定 Webhook URL：`https://abc123.ngrok.io/webhook/line`
4. 開啟「Use webhook」
5. 點擊「Verify」測試連線

## 📍 取得 LINE Bot 設定

### LINE Channel Access Token 與 Secret

1. 前往 [LINE Developers Console](https://developers.line.biz/console/)
2. 建立或選擇 Provider
3. 建立 Messaging API Channel
4. 在「Basic settings」取得 **Channel Secret**
5. 在「Messaging API」取得 **Channel Access Token**
   - 如果沒有，點擊「Issue」生成新的 Token

## 🔑 取得 OpenRouter API Key

1. 前往 [OpenRouter](https://openrouter.ai/)
2. 註冊或登入帳號
3. 前往「Keys」頁面（https://openrouter.ai/keys）
4. 點擊「Create Key」
5. 複製 API Key
6. 在 `.env` 中設定：
   ```
   LLM_API_KEY=你的_OPENROUTER_API_KEY
   LLM_API_BASE=https://openrouter.ai/api/v1
   LLM_MODEL=deepseek/deepseek-r1-0528:free
   ```

> 💡 **為什麼使用 OpenRouter？**
> - 支援多種模型（包括免費的 DeepSeek R1）
> - 使用簡單，設定方便
> - 有免費額度可用

## ✅ 驗證設定

啟動伺服器後，檢查 logs 確認：

```
INFO - 啟動 LINE Bot...
INFO - Rich Menu 上傳成功！（如果已設定連結和圖片）
INFO - 應用程式已啟動
```

如果 Rich Menu 連結未設定，會看到：
```
WARNING - 檢測到預設連結，Rich Menu 上傳已跳過
```

## 🧪 測試 LINE Bot 功能

### 測試 1：選單功能
在 LINE Bot 中輸入：`menu` 或 `選單`

應該會看到 5 個主題按鈕。

### 測試 2：概念問答
點選主題後，選擇任一問題，Bot 會用 LLM 解釋該概念。

### 測試 3：自由提問
直接輸入問題，例如：
- 「什麼是 OI？」
- 「CVD 和成交量有什麼不同？」

### 測試 4：Guardrails（應該被攔截）
嘗試問交易建議：
- 「現在可以做多嗎？」
- 「停損要設在哪？」

Bot 應該回覆拒絕訊息，不提供交易建議。

## 🔧 常見問題

### Q1: 找不到 `alembic` 指令
```bash
# 安裝 alembic
pip install alembic

# 或直接讓 FastAPI 建立資料表（不使用 migrations）
# 啟動時會自動執行 init_db()
```

### Q2: PostgreSQL 連線失敗

**使用 Zeabur PostgreSQL**：
```bash
# 測試連線
psql "postgresql://root:h1P49skICzdYvESZJ6cXmi253b8lT70u@cgk1.clusters.zeabur.com:23034/metabear"

# 確認 .env 中的 DATABASE_URL 設定正確
```

**使用本地 PostgreSQL**：
```bash
# 確認 PostgreSQL 是否執行
psql -U postgres

# 建立資料庫
createdb -U postgres linebot

# 確認 DATABASE_URL 格式正確
# DATABASE_URL=postgresql://postgres:password@localhost:5432/linebot
```

### Q3: LINE Webhook 驗證失敗
- 檢查 `LINE_CHANNEL_SECRET` 是否正確
- 確認 ngrok URL 沒有過期
- 確認 FastAPI 正在執行

### Q4: LLM 沒有回應
- 檢查 `LLM_API_KEY` 是否正確
- 確認 API 額度是否足夠
- 查看 logs：終端機輸出

### Q5: 模組匯入錯誤
```bash
# 確認所有套件已安裝
pip install -r requirements.txt

# 確認 Python 版本
python --version  # 應為 3.10+
```

## 📚 下一步

- [README.md](README.md)：完整專案說明
- [app/llm/prompts.py](app/llm/prompts.py)：修改 System Prompt
- [app/content/questions.yaml](app/content/questions.yaml)：修改題庫
- [app/llm/output_checker.py](app/llm/output_checker.py)：調整 Guardrails 規則

## 💬 需要協助？

查看專案的 logs 可以幫助你除錯：

```bash
# 查看 logs
# 終端機會顯示即時 logs

# 如果直接執行
# 終端機會顯示即時 logs
```

祝你使用愉快！🎉

