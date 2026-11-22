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
// The BingX API volume of a.uid for the month bound as ?1, or NULL unless the synced coverage spans
// that month (up to yesterday, Taipei). Correlated on a.uid, it reads one account's month through
// the primary key; the grouped join it replaces aggregated all of daily_metrics on every query.
export const apiMonthVolume = `(SELECT sum(CAST(dm.volume AS REAL)) FROM daily_metrics dm
  JOIN metric_coverage mc ON mc.uid=dm.uid AND mc.business_type='all'
  WHERE dm.uid=a.uid AND dm.business_type='all' AND dm.day BETWEEN ?1||'-01' AND ?1||'-31'
  AND mc.start_day<=?1||'-01' AND mc.end_day>=min(date(?1||'-01','+1 month','-1 day'),date('now','+8 hours','-1 day')))`;
// Bind the month first: it is ?1 throughout, so anonymous ? parameters appended after it number from 2.
export const customerSelect = `SELECT c.*, a.uid, a.referral_status, a.deposit_status,
  COALESCE(${apiMonthVolume},v.volume_usdt) AS volume_usdt,
  CASE WHEN ${apiMonthVolume} IS NOT NULL THEN ?1 ELSE v.month END AS volume_month,
  CASE WHEN ${apiMonthVolume} IS NOT NULL THEN 'bingx_api' ELSE v.source END AS volume_source,
  (SELECT dm.day FROM daily_metrics dm WHERE dm.uid=a.uid AND dm.business_type='all' AND CAST(dm.volume AS REAL)>0 ORDER BY dm.day DESC LIMIT 1) AS last_trade_day,
  s.qualification, s.checked_at AS synced_at,
  (SELECT status FROM support_cases sc WHERE sc.line_user_id=c.line_user_id AND sc.status IN ('pending','claimed') ORDER BY requested_at DESC LIMIT 1) AS support_status,
  (SELECT owner_name FROM support_cases sc WHERE sc.line_user_id=c.line_user_id AND sc.status IN ('pending','claimed') ORDER BY requested_at DESC LIMIT 1) AS support_owner,
  (SELECT status FROM vip_deliveries vd WHERE vd.line_user_id=c.line_user_id AND vd.uid=a.uid LIMIT 1) AS vip_status
  FROM customers c LEFT JOIN exchange_accounts a ON a.line_user_id=c.line_user_id AND a.exchange='bingx'
  LEFT JOIN volume_records v ON v.line_user_id=c.line_user_id AND v.exchange='bingx' AND v.month=?1
  LEFT JOIN exchange_snapshots s ON s.line_user_id=c.line_user_id AND s.uid=a.uid`;
