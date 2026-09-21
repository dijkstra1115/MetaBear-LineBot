# MetaBear LINE Bot 快速啟動（Cloudflare Workers 版本）

> 這份文件是 `metabear-line-crm` 的正式部署路徑。若你要回頭看舊版 Python/Zeabur 部署，請改看 `docs/LEGACY_README.md`。

## 前置需求

- Node.js 22+

## 1) 安裝

```powershell
npm ci
```

## 2) 複製並填入本機環境變數

```powershell
Copy-Item .dev.vars.example .dev.vars
```

`\.dev.vars` 主要欄位：

- `ADMIN_TOKEN`：至少 32 字元，用於本機後台存取。
- `LINE_CHANNEL_SECRET`：LINE Messaging API 的 channel secret。
- `LINE_CHANNEL_ACCESS_TOKEN`：LINE reply token。
- `OPENAI_API_KEY`：OpenAI API 金鑰。
- `OPENAI_MODEL`：可選，預設用 `gpt-5.6-luna`。若需更省成本，可改為你目前在 OpenAI 帳戶可用的其他模型字串。
- `BINGX_API_KEY`、`BINGX_SECRET_KEY`：自動化核驗用（如未啟用可先保留空白）。

## 3) 建立本機資料

```powershell
npm run db:migrate
```

## 4) 啟動 Worker 開發伺服器

```powershell
npm run dev
```

成功後可開啟：

- 前台（教學）: `http://localhost:8787/learn`
- 後台: `http://localhost:8787/admin`

## 5) 驗證 LINE 流程

1. 將 webhook 設為 `https://your-ngrok-domain/webhook/line`（本機需透過 tunnel）
2. 啟用 Messaging API 的 webhook。
3. 傳送以下訊息：
   - `menu`
   - `我該如何註冊？`
   - `下一步呢`

`development + LINE_DELIVERY_MODE=disabled` 時，可用後台模擬 API 測試而不真的推到 LINE：

```powershell
curl -X POST http://localhost:8787/api/simulate -H "Content-Type: application/json" -d '{"userId":"U000000000000000000000000000000001","text":"我該如何註冊？"}'
```

## 6) 驗收與正式部署

網站與課程先發布到獨立驗收站 `https://preview.metabear.io`：

```powershell
npm run build:staging
npm run deploy:staging
```

驗收後發布正式站 `https://metabear.io`：

```powershell
npm run build:production
npm run deploy
```

只有新增資料庫遷移時才執行 `npm run db:migrate:production`。驗收站沒有正式資料庫、LINE 憑證或訊息佇列；目前 LINE webhook 為 `https://metabear.io/webhook/line`。完整設定見 `docs/DOMAIN-DEPLOYMENT.md`。

## 環境建議

- 目前預設先跑 `gpt-5.6-luna`；若需調整，先看成本與延遲後再改為其他備援模型。
- 生產環境模型建議直接讀 `wrangler.jsonc` 的 `OPENAI_MODEL`。

## 文件對照

- LINE AI 接線與測試：`docs/LINE-AI.md`
- Cloudflare 部署步驟：`docs/CLOUDFLARE.md`
- 舊版部署流程（已棄用）：`docs/LEGACY_README.md`
