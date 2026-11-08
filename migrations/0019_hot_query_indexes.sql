-- Indexes for queries that run on every reply or every 5-minute cron and were scanning whole
-- tables that only grow (D1 bills each row read). The queries stay as they are, only their plans change.
-- setOutgoingStatus(): every reply, push, campaign, signal and alert updates its messages by event.
CREATE INDEX conversation_event ON conversation_messages(event_id);
-- dispatchCrm(): for each exchange account, whether it has a pending, running or recently failed job,
-- and which jobs are due.
CREATE INDEX crm_jobs_customer ON crm_jobs(line_user_id, status, created_at);
CREATE INDEX crm_jobs_due ON crm_jobs(status, next_at);
-- ensureRichMenu() every 5 minutes, and the menu install: the line.menu.* entries.
CREATE INDEX audit_action ON audit_log(action, created_at);
-- enqueueOrderflowEvents(): what each subscriber already has for one Taiwan day.
CREATE INDEX orderflow_alert_deliveries_by_day ON orderflow_alert_deliveries(day, status, line_user_id);
