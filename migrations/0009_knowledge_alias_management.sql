ALTER TABLE knowledge_aliases
ADD COLUMN managed INTEGER NOT NULL DEFAULT 0 CHECK(managed IN (0,1));

INSERT OR IGNORE INTO knowledge_aliases(article_id,phrase,normalized,weight,managed) VALUES
  ('referral-change','可以改嗎','可以改嗎',20,0),
  ('referral-change','能改嗎','能改嗎',20,0);
