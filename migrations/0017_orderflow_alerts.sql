-- LINE order-flow alerts for members (docs/ORDERFLOW-ALERT-SUBSCRIPTION.md). A member subscribes by
-- sending the keyword built on /alerts/, the collector forwards each key-level event, and the
-- backend queues one delivery per subscriber who chose that type, within their daily count and
-- outside their quiet hours. orderflow_alerts_enabled is the emergency stop.
ALTER TABLE team_settings ADD COLUMN orderflow_alerts_enabled INTEGER NOT NULL DEFAULT 1 CHECK(orderflow_alerts_enabled IN (0,1));

CREATE TABLE orderflow_alert_subs (
  line_user_id TEXT PRIMARY KEY REFERENCES customers(line_user_id),
  kinds TEXT NOT NULL,
  daily INTEGER NOT NULL CHECK(daily BETWEEN 1 AND 3),
  quiet TEXT NOT NULL DEFAULT '' CHECK(quiet IN ('','00-08','23-08','22-09')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE orderflow_alert_deliveries (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  line_user_id TEXT NOT NULL REFERENCES customers(line_user_id),
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  day TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','skipped','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  lease_until TEXT,
  finished_at TEXT,
  detail TEXT NOT NULL DEFAULT '',
  UNIQUE(event_key, line_user_id)
);
CREATE INDEX orderflow_alert_deliveries_open ON orderflow_alert_deliveries(status, lease_until);
CREATE INDEX orderflow_alert_deliveries_day ON orderflow_alert_deliveries(line_user_id, day);
