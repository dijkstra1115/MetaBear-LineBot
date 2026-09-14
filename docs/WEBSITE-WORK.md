# MetaBear 網站擴充驗收

使用者要求：補 BitoPro／BingX 信用卡入金原圖；參考 id3a 曾宇廷個人頁的 CSS 3D 捲動體驗，改為交易與 K 線主題。使用者指定不使用 frontend-design 技能，由 Codex 自行設計。

- [x] 匯入並逐張核對 19 張入金原圖，公開其中 15 張；LINE 支援方法選擇、圖片分頁與文字切換。
- [x] 3D 首頁與教學中心，含 BTC／ETH／NASDAQ 示意切換、合約損益互動、LINE 導流。
- [x] 根目錄為公開首頁；/admin 與 /api/* 由 Access 保護，Worker 驗證 JWT、email、CSRF。
- [x] CRM 支援交易量、偏好、受眾預覽、推播確認、背景送出與狀態紀錄。
- [x] 22 項整合測試、桌機／手機、圖片放大翻頁與動態暫停檢查。
- [x] 部署既有 staging Worker，保留 webhook 與客戶資料；官方 LINE 圖文／webhook、雲端 AI 入金分頁及使用者實際 OTP 登入均已驗證。

最新入群規則為已入金即可，允許內部轉帳，舊圖 100 USDT 宣傳不沿用。不使用範例帳號或地址代替用戶自己的帳戶。

Cloudflare 組織與 OTP provider 沿用既有設定，MetaBear 建立獨立 Access application，不更動 ID3A 政策。雲端只允許 style78432@gmail.com。開發測試未發送真實推播。

部署入口與維護命令見 [STAGING.md](STAGING.md)；推播確認、額度與重試邊界見 [CLOUDFLARE.md](CLOUDFLARE.md)。
