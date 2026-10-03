CREATE INDEX crm_completed_full_check
  ON crm_jobs(line_user_id,uid,finished_at DESC) WHERE kind='full' AND status='done';

ALTER TABLE support_cases ADD COLUMN notification_lease_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE support_cases ADD COLUMN notification_lease_token TEXT NOT NULL DEFAULT '';
