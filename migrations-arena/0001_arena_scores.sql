-- FLOW ARENA ranked leaderboard. Scores are stored with their seed and action log so they can be
-- replayed and marked verified later.
CREATE TABLE arena_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pnl REAL NOT NULL,
  seed INTEGER NOT NULL,
  turns INTEGER NOT NULL,
  version INTEGER NOT NULL,
  stats TEXT NOT NULL,
  actions TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX arena_scores_pnl ON arena_scores (pnl DESC);
CREATE INDEX arena_scores_client ON arena_scores (ip_hash, created_at);
