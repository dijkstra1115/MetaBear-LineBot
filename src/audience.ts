import { choice, HttpError } from "./http";
import { customerSelect, currentMonth } from "./db";
const stages = [
  "new",
  "registering",
  "kyc",
  "deposit",
  "review",
  "joined",
] as const;
const preferences = ["unknown", "spot", "futures", "both", "learning"] as const;
const statuses = ["pending", "verified", "rejected"] as const;
export function validMonth(month: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
    throw new HttpError(400, "月份格式需要 YYYY-MM");
  return month;
}

export function audienceQuery(params: URLSearchParams, campaigns = false) {
  const month = validMonth(params.get("month") || currentMonth());
  const values: (string | number)[] = [month,month];
  const clauses: string[] = [];
  if (campaigns) clauses.push("c.marketing_consent=1", "c.blocked=0");
  const q = params.get("q")?.trim();
  if (q) {
    clauses.push(
      "(c.display_name LIKE ? OR c.line_handle LIKE ? OR c.line_user_id LIKE ? OR a.uid LIKE ?)",
    );
    const search = `%${q.slice(0, 100)}%`;
    values.push(search, search, search, search);
  }
  if (params.get("stage")) {
    clauses.push("c.stage=?");
    values.push(choice(params.get("stage"), stages));
  }
  if (params.get("preference")) {
    clauses.push("c.preference=?");
    values.push(choice(params.get("preference"), preferences));
  }
  if (params.get("referral")) {
    clauses.push("a.referral_status=?");
    values.push(choice(params.get("referral"), statuses));
  }
  if (params.get("support") === "1") clauses.push("c.support_requested=1");
  if (params.get('qualification')) {
    clauses.push('s.qualification=?');
    values.push(choice(params.get('qualification'),['eligible','needs_action','pending']));
  }
  if (params.get('owner')) { clauses.push('c.owner_name LIKE ?'); values.push('%'+params.get('owner')!.slice(0,80)+'%'); }
  if (params.get('tag')) { clauses.push('c.tags LIKE ?'); values.push('%'+params.get('tag')!.slice(0,80)+'%'); }
  if (params.get('inactive')) {
    const days=Number(params.get('inactive'));
    if (![7,14,30].includes(days)) throw new HttpError(400,'未交易天數不正確');
    clauses.push("EXISTS (SELECT 1 FROM metric_coverage mc WHERE mc.uid=a.uid AND mc.business_type='all' AND mc.start_day<=date('now','+8 hours',?) AND mc.end_day>=date('now','+8 hours','-1 day') AND julianday(mc.synced_at)>julianday('now','-2 days'))");
    values.push(`-${days} days`);
    clauses.push("EXISTS (SELECT 1 FROM daily_metrics dm WHERE dm.uid=a.uid AND dm.business_type='all' AND CAST(dm.volume AS REAL)>0) AND NOT EXISTS (SELECT 1 FROM daily_metrics dm WHERE dm.uid=a.uid AND dm.business_type='all' AND dm.day>=date('now','+8 hours',?) AND CAST(dm.volume AS REAL)>0)");
    values.push(`-${days} days`);
  }
  const min = params.get("min");
  const max = params.get("max");
  for (const [key, value] of [
    ["min", min],
    ["max", max],
  ])
    if (value !== null && value !== "") {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1e12)
        throw new HttpError(400, "交易量範圍不正確");
      clauses.push(`COALESCE(am.volume,v.volume_usdt) ${key === "min" ? ">=" : "<="} ?`);
      values.push(amount);
    }
  if (min && max && Number(min) > Number(max))
    throw new HttpError(400, "最低交易量不能高於最高交易量");
  return {
    sql: `${customerSelect}${clauses.length ? " WHERE " + clauses.join(" AND ") : ""}`,
    values,
    month,
  };
}
