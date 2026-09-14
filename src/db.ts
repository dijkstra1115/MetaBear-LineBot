import type { Customer } from "./types";
export const now = () => new Date().toISOString();
export const currentMonth = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
export async function ensureCustomer(db: D1Database, id: string) {
  await db
    .prepare(
      "INSERT INTO customers(line_user_id) VALUES (?) ON CONFLICT DO NOTHING",
    )
    .bind(id)
    .run();
  return (await db
    .prepare("SELECT * FROM customers WHERE line_user_id = ?")
    .bind(id)
    .first<Customer>())!;
}
export async function audit(
  db: D1Database,
  id: string | null,
  action: string,
  detail: unknown,
) {
  await db
    .prepare(
      "INSERT INTO audit_log(line_user_id, action, detail) VALUES (?, ?, ?)",
    )
    .bind(id, action, JSON.stringify(detail))
    .run();
}
export const customerSelect = `SELECT c.*, a.uid, a.referral_status, a.deposit_status,
  COALESCE(am.volume,v.volume_usdt) AS volume_usdt, COALESCE(am.month,v.month) AS volume_month,
  CASE WHEN am.volume IS NOT NULL THEN 'bingx_api' ELSE v.source END AS volume_source,
  s.qualification, s.checked_at AS synced_at,
  (SELECT status FROM vip_deliveries vd WHERE vd.line_user_id=c.line_user_id AND vd.uid=a.uid LIMIT 1) AS vip_status
  FROM customers c LEFT JOIN exchange_accounts a ON a.line_user_id=c.line_user_id AND a.exchange='bingx'
  LEFT JOIN volume_records v ON v.line_user_id=c.line_user_id AND v.exchange='bingx' AND v.month=?
  LEFT JOIN (SELECT dm.uid,substr(dm.day,1,7) AS month,sum(CAST(dm.volume AS REAL)) AS volume FROM daily_metrics dm JOIN metric_coverage mc ON mc.uid=dm.uid AND mc.business_type='all' WHERE dm.business_type='all' AND mc.start_day<=substr(dm.day,1,7)||'-01' AND mc.end_day>=min(date(dm.day,'start of month','+1 month','-1 day'),date('now','+8 hours','-1 day')) GROUP BY dm.uid,substr(dm.day,1,7)) am ON am.uid=a.uid AND am.month=?
  LEFT JOIN exchange_snapshots s ON s.line_user_id=c.line_user_id AND s.uid=a.uid`;
