PRAGMA foreign_keys = ON;
CREATE TABLE customers (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  line_handle TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','registering','kyc','deposit','review','joined')),
  guide_step TEXT NOT NULL DEFAULT 'register',
  preference TEXT NOT NULL DEFAULT 'unknown' CHECK(preference IN ('unknown','spot','futures','both','learning')),
  notes TEXT NOT NULL DEFAULT '',
  support_requested INTEGER NOT NULL DEFAULT 0 CHECK(support_requested IN (0,1)),
  marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK(marketing_consent IN (0,1)),
  consent_at TEXT,
  blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)),
  last_event_at INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE exchange_accounts (
  line_user_id TEXT NOT NULL REFERENCES customers(line_user_id),
  exchange TEXT NOT NULL CHECK(exchange = 'bingx'),
  uid TEXT NOT NULL,
  referral_status TEXT NOT NULL DEFAULT 'pending' CHECK(referral_status IN ('pending','verified','rejected')),
  verified_at TEXT,
  verification_note TEXT NOT NULL DEFAULT '',
  deposit_status TEXT NOT NULL DEFAULT 'pending' CHECK(deposit_status IN ('pending','verified','rejected')),
  deposit_note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(line_user_id, exchange),
  UNIQUE(exchange, uid)
);
CREATE TABLE volume_records (
  id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL REFERENCES customers(line_user_id),
  exchange TEXT NOT NULL CHECK(exchange = 'bingx'),
  month TEXT NOT NULL,
  volume_usdt REAL NOT NULL CHECK(volume_usdt >= 0),
  source TEXT NOT NULL CHECK(source IN ('manual','affiliate_report')),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(line_user_id, exchange, month)
);
CREATE TABLE webhook_events (
  event_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('processing','ready','done')),
  lease_until INTEGER NOT NULL,
  messages_json TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE campaign_drafts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  audience_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX customers_stage ON customers(stage);
CREATE INDEX volume_month ON volume_records(month, volume_usdt);
CREATE INDEX audit_customer ON audit_log(line_user_id, created_at);
CREATE TABLE customer_leases (
  line_user_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  lease_until INTEGER NOT NULL
);
