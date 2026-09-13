CREATE TABLE campaign_runs (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES campaign_drafts(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  audience_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','queued','completed')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT
);
CREATE TABLE campaign_deliveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES campaign_runs(id),
  line_user_id TEXT NOT NULL REFERENCES customers(line_user_id),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','skipped','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT,
  lease_until TEXT,
  finished_at TEXT,
  detail TEXT,
  UNIQUE(run_id,line_user_id)
);
CREATE INDEX campaign_pending ON campaign_deliveries(status,run_id);
CREATE INDEX campaign_recent ON campaign_runs(created_at);
