# MetaBear 獨立管理員登入

登入頁使用既有 `workers.dev` 網址，不需要購買網域。使用者選擇由 MetaBear LINE 官方帳號接收驗證碼；Email 僅用來辨識管理員，無須寄信網域。

## 目前上線狀態

2026-09-14 管理員已完成 LINE 綁定與實際驗證碼登入，正式切換為 `AUTH_MODE=native`、`AUTH_CHANNEL=line`，使用 migration `0006_native_auth.sql`。已移除 MetaBear 原 Access app，ID3A 的 Access app 和組織設定不變。切換後確認匿名 `/admin`、`/admin/`、`/admin.html` 都跳至 `/login`，`/api/config` 回傳 401，`/health` 正常。

- `/admin/login-setup`：由目前的管理員登入保護，產生一次性 LINE 綁定指令。
- `/login`：MetaBear 登入頁。
- `/auth/request`、`/auth/verify`：索取及驗證登入碼。
- `/auth/session`：確認 MetaBear 登入工作階段。
- `/auth/logout`：撤銷當前工作階段並清除 Cookie。

## 初次綁定與切換

1. 管理員以既有 Access 登入 `/admin/login-setup`，取得綁定指令。
2. 本人把整段指令傳到 MetaBear 官方帳號的一對一對話。LINE 簽章驗證後，由固定程式處理綁定，不交給 AI，也不以 BingX UID 判定管理員。
3. 回到綁定頁確認成功，開啟 `/login`，輸入管理員 Email，收到 LINE 驗證碼後在原瀏覽器輸入。
4. 驗證成功建立獨立 Cookie；preview 顯示成功但不取代 Access。
5. 維護者核對成功的綁定與 session，備份原 MetaBear Access app 設定，將 Worker `AUTH_MODE` 改成 `native`。確認 Worker 本身保護所有後台頁和 API，才移除 MetaBear 舊 Access 入口的攔截。不要修改 ID3A app。
6. 從無登入狀態驗證 `/admin` 跳到 `/login`、`/api/config` 回傳 401；從已登入瀏覽器確認工作台正常，登出後再次回傳 401。

## 驗證規則

- 管理員仍只有 `ADMIN_EMAIL` 指定的帳號，沒有公開註冊、依 UID 升級權限或 AI 授權。
- 綁定碼是 192-bit 隨機值，有效 10 分鐘；資料庫只存 hash，原文只回給登入的管理員。一次消耗，LINE 重送相同事件不會改綁別人。
- LINE 驗證碼為 6 位數、有效 10 分鐘，每次最多 5 次驗證。必須使用索取驗證碼時的瀏覽器隨機 challenge Cookie。
- 60 秒索取間隔，每個管理員每小時最多 5 次，每個 IP 每小時最多 20 次索取。原子 SQL 防止同時請求突破限制。
- OTP hash 包含未儲存在資料庫的 256-bit 瀏覽器 challenge；資料庫洩漏不能直接窮舉 6 位數 OTP。驗證與消耗在同一個 D1 transaction 執行，不能重複換取 session。
- Session 是 256-bit 隨機值，資料庫只存 hash，有效 8 小時。Cookie 使用 `__Host-` 前綴、`Secure`、`HttpOnly`、`SameSite=Strict`，沒有跨網域 Cookie。
- POST 操作驗證 HTTPS、同來源 Origin、JSON 與自訂標頭。Native 模式不接受 Cloudflare JWT 或管理 token 作為登入替代。
- 改綁 LINE 會撤銷既有 session 和待驗證 challenge；索取途中改綁也不能在舊 LINE 建立有效 challenge。
- LINE 推送失敗不會產生可用驗證码，也不轉用其他收件人。LINE 接受推送與用戶實際收到不同，正式切換前必須由管理員完成一次登入。
- 綁定指令不進 AI；OTP 不寫入應用日誌、CRM 客戶資料或前端儲存空間。LINE 推送會使用官方帳號的訊息額度。
- Cron 清除過期 challenge、session、限流記錄和綁定碼。

## 復原

若管理員無法使用已綁定 LINE，由 Cloudflare 帳號維護者依備份重新建立 MetaBear Access app 的目的路徑及原本 email policy（備份位於本機 `test-output/metabear-access-before-native.json`）。新 app 會有新的 AUD，須同步更新 `ACCESS_AUD`，然後把 `AUTH_MODE` 改回 `native-preview`。先驗證舊版登入可用，再重新綁定。不要新增公開重設端點或直接以 UID 重設管理員。

後續銷售给其他團隊時，為每個部署分別配置管理員、LINE channel、D1 和 Cookie 網址。目前這個部署只有一個管理員，沒有完成多租戶帳號與權限管理。

## 驗證

`npm test`：50 項通過。新增 `tests/native-auth.test.ts` 覆蓋 Cookie 工作階段、JWT 隔離、OTP 重用／過期／限流／並行驗證、傳送失敗、CSRF、管理員綁定和撤銷。後續修正綁定競態後，7 項登入測試再次通過；TypeScript 與 staging dry run 通過。
