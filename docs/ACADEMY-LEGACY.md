# 舊版交易學院

舊版教學集中保存在 `public/orderflow/legacy/`，總覽入口為 `/orderflow/legacy/`。
正式四段故事仍使用 `/orderflow/`、`matching.html`、`wick.html`、`revisit.html`、`delta.html`。

| 內容               | 舊版目錄內入口                    |
| ------------------ | --------------------------------- |
| 15 課互動教學      | `classic.html?classic=1`          |
| 六段市場旅程       | `journey.html`                    |
| 獨立補量／吸收故事 | `absorption.html`                 |
| 情境實戰工作台     | `classic.html?workspace=practice` |
| 即時行情工作台     | `classic.html?workspace=live`     |

舊版專用 HTML、JavaScript 與 CSS 一起搬入此目錄。正式版與舊版共同使用的撮合模型 `public/orderflow/engine.js` 保持共用，避免複製後分歧。

## 舊連結相容

- 原 `classic.html`、`journey.html`、`absorption.html` 保留輕量轉址頁，轉入 `legacy/` 並保留查詢參數與章節錨點。`classic.html` 沒有參數時仍開啟六段旅程，維持原本行為。
- `/orderflow/?classic=1`、`?workspace=practice`、`?workspace=live` 轉到舊版工作台頁；其他原本進入 15 課的 lesson 連結也轉入此頁。
- 正式首頁已對應四段故事的 lesson 連結仍維持原本對應。舊版課程內的上一課、下一課及課程地圖使用 `classic.html?classic=1&lesson=...`，全程留在舊版。
- `candles.html` 是既有的相容轉址，仍導向正式版 `matching.html`；目前 Git 版本中沒有可搬移的獨立舊 K 線教材，不另造一份。
- 舊版總覽與教材標示 `noindex`。即時行情的 Bybit WebSocket 權限限定在原學院入口與新的 `legacy/classic.html`。

## 本機檢查

執行 `node scripts/orderflow-preview.mjs`，開啟 `http://127.0.0.1:8790/orderflow/legacy/`。
正式及預覽 Worker 皆支援 `/orderflow/legacy` 轉到 `/orderflow/legacy/`，並提供該目錄的總覽頁。

提交程式不等於發布 Cloudflare；新網址需在網站下次部署後才會出現在正式站。
