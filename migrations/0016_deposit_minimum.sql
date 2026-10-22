-- 2026-10-22: VIP entry and LINE order-flow alerts share one rule: referral and KYC as before, and
-- 200 USDT deposited within 60 days, internal transfers excluded
-- (docs/ORDERFLOW-ALERT-SUBSCRIPTION.md, docs/BINGX-INTEGRATION.md). 0 keeps the old rule (any deposit).
ALTER TABLE team_settings ADD COLUMN deposit_min_usdt INTEGER NOT NULL DEFAULT 200 CHECK(deposit_min_usdt BETWEEN 0 AND 1000000);

-- A rule change: the new revision makes earlier qualifications stale until each account is checked again.
UPDATE team_settings SET allow_internal_transfer=0, revision=revision+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1;

-- FAQ answers that still state the old rule. Administrator rewrites that dropped it are kept.
UPDATE knowledge_articles SET answer='入金是其中一個條件，還需要確認邀請歸屬與 KYC。請點「我的進度」查看目前核實結果；已完成條件但尚未更新時，可以點「重新查詢」。

本團隊的入金條件是 60 日內累計入金 200 USDT（不含內部轉帳），以 BingX API 可確認的充值紀錄為準。系統不會因你口頭回報已入金就直接通過；通過後會安排發送 VIP 邀請。',
  source_note='MetaBear 現行審核規則（2026-10-22）：邀請歸屬、KYC、60 日內累計入金 200 USDT，不含內部轉帳。',
  revision=revision+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id='deposit-review' AND answer LIKE '%不設最低入金金額%';

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor)
  SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'deposit-rule-2026-10-22' FROM knowledge_articles
  WHERE id='deposit-review' AND answer LIKE '%60 日內累計入金 200 USDT%';

UPDATE knowledge_articles SET answer='BingX 每個幣種／網路的最低充值數量，與 MetaBear 社群的入群門檻是兩件事。

請在 BingX 充值頁核對最低數量，並計入轉出端扣除的費用。MetaBear 的入群條件是 60 日內累計入金 200 USDT（不含內部轉帳）；低於交易所最低數量的小額轉帳可能不會入帳。已低於最低數量時，先向官方確認處理方式。',
  revision=revision+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id='bingx-deposit-minimum' AND answer LIKE '%不設最低入金金額%';

INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor)
  SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'deposit-rule-2026-10-22' FROM knowledge_articles
  WHERE id='bingx-deposit-minimum' AND answer LIKE '%60 日內累計入金 200 USDT%';
