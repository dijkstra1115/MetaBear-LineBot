# 訂單流平台：Cloudflare 連線實測（第 0 步）

一次性的探測 Worker（`metabear-orderflow-probe`），用來確認收集器能不能放在 Cloudflare Durable Object 上。和正式的 Worker、CRM 資料庫完全分開。2026-10-16 已用 `npx wrangler delete` 從 Cloudflare 刪除，這裡的程式只留作紀錄；要重測的話，重新部署並設定 `PROBE_KEY` secret 即可。

## 路由

所有路由都要帶 `?key=<PROBE_KEY>`（Worker secret）。

| 路由 | 用途 |
| --- | --- |
| `/edge?secs=10` | 由 Worker 本身探測（離呼叫者最近的機房） |
| `/probe?hint=apac-se&secs=10&run=1` | 由指定位置的 DO 探測 REST 與 WebSocket |
| `/soak/start?hint=apac-se&minutes=45&keepalive=0` | DO 只靠開著的 WebSocket 撐住 |
| `/soak/start?...&every=30` | 每 30 秒用 alarm 喚醒一次 |
| `/soak/start?...&hold=14` | 一次 alarm 執行最多 14 分鐘，再交棒給下一次 |
| `/soak/status?...`（參數同上） | 啟動紀錄、每個來源的覆蓋率、缺口、事件 |

位置提示只在物件第一次建立時有效，換 `run=` 就會建立新的物件。

## 結果（2026-10-15）

見 [docs/ORDERFLOW-CF-PROBE.md](../../docs/ORDERFLOW-CF-PROBE.md)。
