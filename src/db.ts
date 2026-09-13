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
  v.volume_usdt, v.month AS volume_month, v.source AS volume_source
  FROM customers c LEFT JOIN exchange_accounts a ON a.line_user_id=c.line_user_id AND a.exchange='bingx'
  LEFT JOIN volume_records v ON v.line_user_id=c.line_user_id AND v.exchange='bingx' AND v.month=?`;
