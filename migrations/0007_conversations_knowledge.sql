CREATE TABLE conversation_unsends (
  line_user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  PRIMARY KEY(line_user_id,message_id)
);
CREATE TABLE conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_key TEXT NOT NULL UNIQUE,
  line_user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('user','bot')),
  message_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  delivery_status TEXT NOT NULL,
  occurred_at INTEGER NOT NULL
);
CREATE INDEX conversation_customer ON conversation_messages(line_user_id,id DESC);
CREATE INDEX conversation_expiry ON conversation_messages(occurred_at);
CREATE TABLE knowledge_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  keywords TEXT NOT NULL,
  answer TEXT NOT NULL,
  requires_support INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  source_note TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES
('referral-other','已綁定其他人的邀請碼，該怎麼辦？','其他人的邀請碼\n別人的邀請碼\n綁定其他人\n綁定別人\n其他團隊\n別人推薦','如果 BingX 帳號已綁定其他人的邀請碼，這屬於推薦歸屬問題，不能只靠重新填寫本團隊邀請碼就視為符合資格。\n\n你可以在這裡提供 UID，讓我們核對目前可查到的推薦關係。若 API 無法查到，也不代表帳號不存在。是否能調整推薦歸屬，需由客服依 BingX 當前規則確認；我們不會直接更改，也不會先承諾可以轉移或通過。\n\n如果你已提交 UID，不必再重複提交；請補充是「已綁其他人」或「不確定綁誰」，方便客服接續處理。',1,'published','MetaBear 團隊處理流程；推薦歸屬變更須由交易所核實，未承諾可變更。'),
('referral-change','可以更改或轉移推薦歸屬嗎？','更改邀請碼\n修改邀請碼\n更換邀請碼\n轉移推薦\n改綁推薦\n更改推薦碼','目前不能直接承諾可以更改或轉移推薦歸屬。請保留現有帳號，由客服依你的 UID 與 BingX 當前規則核實。\n\n不要為了嘗試改碼而先重複註冊、重新入金或提交其他人的身分資料；這些操作不能保證解決推薦歸屬。你可以繼續使用教學，但 VIP 資格仍需符合本團隊的邀請歸屬、KYC 與入金條件。',1,'published','MetaBear 團隊處理流程；未驗證任何帳號可轉移的承諾。'),
('referral-missing','註冊時漏填或填錯邀請碼','漏填\n填錯邀請碼\n忘記填邀請碼\n沒填邀請碼\n未填推薦碼','先提供你的 BingX UID，讓我們確認目前可查到的推薦關係。已經提交過 UID 的話，不必重複提交。\n\n請補充是「漏填」還是「填錯」，不需要提供密碼、驗證碼或 API Secret。能否補填或調整，需由客服依交易所規則核實；重新貼一次邀請碼不會自動改變既有帳號歸屬。',1,'published','MetaBear 團隊處理流程；補填規則需向交易所確認。'),
('deposit-review','已入金，為什麼還沒有收到邀請？','入金還沒通過\n入金沒有通過\n入金沒收到\n入金後沒收到\n入金了為什麼','入金是其中一個條件，還需要確認邀請歸屬與 KYC。請點「我的進度」查看目前核實結果；已完成條件但尚未更新時，可以點「重新查詢」。\n\n本團隊不設最低入金金額，允許內部轉帳，但仍以 BingX API 可確認的入金紀錄為準。系統不會因你口頭回報已入金就直接通過；通過後會安排發送 VIP 邀請。',0,'published','MetaBear 現行審核規則：邀請歸屬、KYC、已入金；允許內部轉帳。'),
('support-process','已找人工協助，還能繼續提問嗎？','人工後還能問\n客服會在哪回\n客服在哪裡回\n怎麼聯絡客服\n人工協助後','可以繼續在這個 LINE 對話描述問題，也能繼續詢問教學。客服需要到 LINE 官方帳號對話查看並回覆；「需協助」標記不代表客服已讀、已接手或立即在線。\n\n目前 AI 不會因標記人工協助而自動停止回覆，也沒有即時通知客服的功能。請不要在對話提供密碼、登入驗證碼、私鑰或 API Secret。',0,'published','MetaBear 目前客服流程；尚未提供人工接手暫停 AI 或客服即時通知。');
UPDATE knowledge_articles SET keywords=replace(keywords,char(92)||'n',char(10)),answer=replace(answer,char(92)||'n',char(10));
