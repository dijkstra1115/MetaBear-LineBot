CREATE TABLE team_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  name TEXT NOT NULL DEFAULT 'MetaBear',
  referral_code TEXT NOT NULL DEFAULT 'ZD0CQ0',
  inviter_uid TEXT NOT NULL DEFAULT '',
  allow_indirect INTEGER NOT NULL DEFAULT 0 CHECK(allow_indirect IN (0,1)),
  allow_internal_transfer INTEGER NOT NULL DEFAULT 1 CHECK(allow_internal_transfer IN (0,1)),
  automation_enabled INTEGER NOT NULL DEFAULT 0 CHECK(automation_enabled IN (0,1)),
  vip_url TEXT NOT NULL DEFAULT '',
  support_url TEXT NOT NULL DEFAULT 'https://lin.ee/cbyuRJv',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT ''
);
INSERT INTO team_settings(id) VALUES (1);
ALTER TABLE customers ADD COLUMN owner_name TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN tags TEXT NOT NULL DEFAULT '';
CREATE TABLE exchange_snapshots (
  line_user_id TEXT PRIMARY KEY REFERENCES customers(line_user_id),
  uid TEXT NOT NULL,
  data_json TEXT NOT NULL,
  qualification TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  settings_revision INTEGER NOT NULL,
  checked_at TEXT NOT NULL
);
CREATE TABLE daily_metrics (
  uid TEXT NOT NULL,
  day TEXT NOT NULL,
  business_type TEXT NOT NULL,
  volume TEXT NOT NULL,
  commission TEXT NOT NULL,
  expected_fees TEXT NOT NULL,
  fee_offsets TEXT NOT NULL,
  collected_fees TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY(uid,day,business_type)
);
CREATE TABLE deposit_records (
  fingerprint TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  type_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount TEXT NOT NULL,
  synced_at TEXT NOT NULL
);
CREATE INDEX deposits_uid ON deposit_records(uid,occurred_at);
CREATE TABLE metric_coverage (
  uid TEXT NOT NULL,
  business_type TEXT NOT NULL,
  start_day TEXT NOT NULL,
  end_day TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY(uid,business_type)
);
CREATE TABLE crm_jobs (
  id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL REFERENCES customers(line_user_id),
  uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('qualification','full')),
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX crm_active_job ON crm_jobs(line_user_id) WHERE status IN ('pending','running');
CREATE TABLE vip_deliveries (
  id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL REFERENCES customers(line_user_id),
  uid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  body TEXT NOT NULL,
  settings_revision INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  joined_at TEXT,
  UNIQUE(line_user_id,uid)
);
CREATE TABLE crm_locks (id TEXT PRIMARY KEY, owner TEXT NOT NULL, lease_until INTEGER NOT NULL);
