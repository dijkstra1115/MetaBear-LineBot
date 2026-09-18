import { validMonth } from "./audience";

export async function volumeMonthReport(db: D1Database, month: string) {
  const start = validMonth(month) + "-01";
  const [
    totals,
    covered,
    stale,
    blocked,
    joined,
    newcomers,
    lastTrades,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT count(DISTINCT uid) AS traders,
          coalesce(sum(CAST(volume AS REAL)),0) AS volume
         FROM daily_metrics
         WHERE business_type='all' AND day>=? AND day<date(?,'+1 month')
           AND CAST(volume AS REAL)>0`,
      )
      .bind(start, start)
      .first<{ traders: number; volume: number }>(),
    db
      .prepare(
        `SELECT count(*) AS covered,
          sum(CASE WHEN traded.uid IS NULL THEN 1 ELSE 0 END) AS silent
         FROM metric_coverage mc
         LEFT JOIN (
           SELECT DISTINCT uid FROM daily_metrics
           WHERE business_type='all' AND day>=? AND day<date(?,'+1 month')
             AND CAST(volume AS REAL)>0
         ) traded ON traded.uid=mc.uid
         WHERE mc.business_type='all'
           AND mc.start_day<=? AND mc.end_day>=date(?,'+1 month','-1 day')`,
      )
      .bind(start, start, start, start)
      .first<{ covered: number; silent: number }>(),
    db
      .prepare(
        `SELECT count(*) AS stale FROM metric_coverage
         WHERE business_type='all'
           AND julianday(synced_at) <= julianday('now','-2 days')`,
      )
      .first<{ stale: number }>(),
    db
      .prepare("SELECT count(*) AS count FROM customers WHERE blocked=1")
      .first<{ count: number }>(),
    db
      .prepare("SELECT count(*) AS count FROM customers WHERE stage='joined'")
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT count(*) AS count FROM customers
         WHERE created_at>=? AND created_at<date(?,'+1 month')`,
      )
      .bind(start, start)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT count(*) AS recent FROM (
           SELECT uid, max(day) AS last_day FROM daily_metrics
           WHERE business_type='all' AND CAST(volume AS REAL)>0
           GROUP BY uid
         ) WHERE last_day>=date('now','+8 hours','-30 days')`,
      )
      .first<{ recent: number }>(),
  ]);
  return {
    month,
    volume: totals?.volume ?? 0,
    traders: totals?.traders ?? 0,
    covered: covered?.covered ?? 0,
    silent: covered?.silent ?? 0,
    stale: stale?.stale ?? 0,
    blocked: blocked?.count ?? 0,
    joined: joined?.count ?? 0,
    newcomers: newcomers?.count ?? 0,
    tradedLast30Days: lastTrades?.recent ?? 0,
  };
}
