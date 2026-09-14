CREATE TABLE route_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL CHECK(method IN ('direct','knowledge','rule','model','context','clarify')),
  topic TEXT NOT NULL,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL,
  queue_delay_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX route_events_created ON route_events(created_at);
CREATE INDEX route_events_method ON route_events(method,created_at);

CREATE TABLE support_cases (
  id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL REFERENCES customers(line_user_id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','resolved')),
  owner_name TEXT NOT NULL DEFAULT '',
  request_event_id TEXT NOT NULL,
  notification_key TEXT NOT NULL UNIQUE,
  notification_status TEXT NOT NULL DEFAULT 'pending' CHECK(notification_status IN ('pending','processing','sent','failed')),
  requested_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  claimed_at INTEGER,
  resolved_at INTEGER,
  bot_paused INTEGER NOT NULL DEFAULT 0 CHECK(bot_paused IN (0,1))
);
CREATE UNIQUE INDEX support_cases_active_customer
  ON support_cases(line_user_id) WHERE status IN ('pending','claimed');
CREATE INDEX support_cases_notification
  ON support_cases(notification_status,requested_at);

CREATE TABLE knowledge_aliases (
  article_id TEXT NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  normalized TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 10 CHECK(weight BETWEEN 1 AND 100),
  PRIMARY KEY(article_id,normalized)
);
CREATE INDEX knowledge_alias_lookup ON knowledge_aliases(normalized);

CREATE TABLE knowledge_versions (
  article_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  keywords TEXT NOT NULL,
  answer TEXT NOT NULL,
  requires_support INTEGER NOT NULL,
  status TEXT NOT NULL,
  source_note TEXT NOT NULL,
  actor TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(article_id,revision)
);

INSERT INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor)
SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'migration' FROM knowledge_articles;
