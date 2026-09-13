CREATE TABLE teaching_context (
  line_user_id TEXT PRIMARY KEY REFERENCES customers(line_user_id),
  topic TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('text','image')),
  updated_at TEXT NOT NULL
);
