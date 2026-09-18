ALTER TABLE team_settings ADD COLUMN signals_enabled INTEGER NOT NULL DEFAULT 1 CHECK(signals_enabled IN (0,1));
CREATE UNIQUE INDEX IF NOT EXISTS auth_admin_channels_line ON auth_admin_channels(line_user_id);
CREATE TABLE staff (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'analyst' CHECK(role IN ('analyst')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT NOT NULL
);
CREATE TABLE signal_categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
INSERT INTO signal_categories(id,label,sort_order) VALUES
  ('BTC','BTC',1),
  ('ETH','ETH',2),
  ('GOLD','GOLD',3),
  ('MU','MU',4),
  ('NVDA','NVDA',5);
CREATE TABLE customer_signal_subs (
  line_user_id TEXT NOT NULL REFERENCES customers(line_user_id),
  category_id TEXT NOT NULL REFERENCES signal_categories(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (line_user_id, category_id)
);
CREATE INDEX customer_signal_subs_category ON customer_signal_subs(category_id);
CREATE TABLE signal_images (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE signals (
  id TEXT PRIMARY KEY,
  analyst_email TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES signal_categories(id),
  direction TEXT NOT NULL CHECK(direction IN ('long','short')),
  leverage TEXT NOT NULL,
  entry TEXT NOT NULL,
  take_profit TEXT NOT NULL,
  stop_loss TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  image_id TEXT REFERENCES signal_images(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','completed','halted')),
  result TEXT NOT NULL DEFAULT '' CHECK(result IN ('','tp','sl','expired','closed')),
  result_note TEXT NOT NULL DEFAULT '',
  result_at TEXT,
  audience_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX signals_analyst ON signals(analyst_email, created_at);
CREATE TABLE signal_deliveries (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL REFERENCES signals(id),
  line_user_id TEXT NOT NULL REFERENCES customers(line_user_id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','skipped','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT,
  lease_until TEXT,
  finished_at TEXT,
  detail TEXT,
  UNIQUE(signal_id, line_user_id)
);
CREATE INDEX signal_deliveries_open ON signal_deliveries(status, lease_until);
