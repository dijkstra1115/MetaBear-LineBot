// LINE order-flow alerts for members (docs/ORDERFLOW-ALERT-SUBSCRIPTION.md). A member sends the
// keyword built on /alerts/; the collector forwards each key-level event (POST
// /api/internal/orderflow-alert with { events }); one delivery per subscriber who chose that type
// is queued, within their daily count and outside their quiet hours, and pushed by the queue
// consumer. Eligibility is the VIP rule: joined, an accepted VIP invitation, or a current eligible
// BingX check (referral, KYC and the 60-day deposit minimum). Members choose BTC, ETH or both; the
// daily count covers them together.
import { HttpError, json, readJson } from "./http";
import { audit, now } from "./db";
import { lineQuota, reservedLineMessages } from "./campaigns";
import { recordOutgoing, setOutgoingStatus } from "./conversations";
import { reasons } from "./automation";
import { taipeiDay } from "./bingx";
import { getTeam } from "./team";
import { NOTIFY_KINDS, choiceOf, inQuiet, storedKinds, upgradeKinds } from "../public/lab/orderflow/notify.js";
import { MARKETS } from "../public/lab/orderflow/markets.js";

export type OrderflowAlertMessage = { kind: "orderflow-alert-delivery"; id: string };
export type AlertSettings = { kinds: string[]; daily: number; quiet: string; markets: string[] };
type Delivery = { id: string; line_user_id: string; kind: string; body: string; market: string; status: string; attempts: number; created_at: string };

// Events are only worth sending while price is still near what they describe.
const STALE_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
// Keep this many messages of the month for analyst signals, campaigns and support.
const QUOTA_FLOOR = 50;
const MAX_EVENTS = 50;
const SUBSCRIBERS_MAX = 2_000;

// The VIP rule as SQL over customers c; bind the current settings revision once.
const ELIGIBLE = `c.blocked=0 AND (c.stage='joined'
  OR EXISTS (SELECT 1 FROM vip_deliveries v WHERE v.line_user_id=c.line_user_id AND v.status='accepted')
  OR EXISTS (SELECT 1 FROM exchange_snapshots x WHERE x.line_user_id=c.line_user_id AND x.qualification='eligible' AND x.settings_revision=?))`;

/** Whether a customer may receive LINE alerts, and if not, what is missing in plain words. */
export async function alertEligibility(db: D1Database, userId: string) {
  const team = await getTeam(db);
  const row = await db
    .prepare(
      `SELECT ${ELIGIBLE.replace("?", "?1")} AS ok,
        (SELECT uid FROM exchange_accounts a WHERE a.line_user_id=c.line_user_id) AS uid,
        (SELECT reasons_json FROM exchange_snapshots x WHERE x.line_user_id=c.line_user_id AND x.settings_revision=?1) AS reasons_json
       FROM customers c WHERE c.line_user_id=?2`,
    )
    .bind(team.revision, userId)
    .first<{ ok: number; uid: string | null; reasons_json: string | null }>();
  if (row?.ok) return { ok: true as const };
  if (!row?.uid) return { ok: false as const, missing: "uid" as const, reasons: [] as string[] };
  const keys = row.reasons_json ? (JSON.parse(row.reasons_json) as string[]) : [];
  return { ok: false as const, missing: keys.length ? ("rules" as const) : ("check" as const), reasons: keys.map((k) => reasons[k] ?? k) };
}

export async function getSubscription(db: D1Database, userId: string): Promise<AlertSettings | null> {
  const row = await db
    .prepare("SELECT kinds,daily,quiet,markets FROM orderflow_alert_subs WHERE line_user_id=?")
    .bind(userId)
    .first<{ kinds: string; daily: number; quiet: string; markets: string }>();
  // Stored lists predate later types; upgradeKinds gives 「全部」 subscribers the new ones.
  return row ? { kinds: upgradeKinds(row.kinds.split(",").filter(Boolean)), daily: row.daily, quiet: row.quiet, markets: row.markets.split(",").filter(Boolean) } : null;
}

export async function setSubscription(db: D1Database, userId: string, settings: AlertSettings | null) {
  if (!settings) {
    await db.prepare("DELETE FROM orderflow_alert_subs WHERE line_user_id=?").bind(userId).run();
    return;
  }
  await db
    .prepare(
      "INSERT INTO orderflow_alert_subs(line_user_id,kinds,daily,quiet,markets,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(line_user_id) DO UPDATE SET kinds=excluded.kinds,daily=excluded.daily,quiet=excluded.quiet,markets=excluded.markets,updated_at=excluded.updated_at",
    )
    .bind(userId, storedKinds(settings.kinds).join(","), settings.daily, settings.quiet, settings.markets.join(","), now(), now())
    .run();
}

type IncomingEvent = { key: string; t: number; kind: string; text: string; at: number; m: string };
function readEvents(value: unknown): IncomingEvent[] {
  if (!Array.isArray(value) || value.length > MAX_EVENTS) throw new HttpError(400, "事件格式不正確");
  return value.map((e) => {
    const ok =
      e &&
      typeof e.key === "string" &&
      /^[\w-]{1,64}$/.test(e.key) &&
      Number.isSafeInteger(e.t) &&
      Number.isSafeInteger(e.at) &&
      typeof e.kind === "string" &&
      choiceOf(e.kind) &&
      typeof e.text === "string" &&
      e.text.length > 0 &&
      e.text.length <= 400 &&
      (e.m === undefined || Object.hasOwn(MARKETS, e.m));
    if (!ok) throw new HttpError(400, "事件格式不正確");
    // Collectors from before ETH send no market.
    return { key: e.key, t: e.t, kind: e.kind, text: e.text.replace(/[\r\n]+/g, " "), at: e.at, m: e.m ?? "btc" };
  });
}

function alertBody(env: Env, e: IncomingEvent) {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const lesson = NOTIFY_KINDS.find((k) => k.id === choiceOf(e.kind))?.lesson;
  const market = e.m === "btc" ? "" : `&m=${e.m}`;
  return [
    `MetaBear 關鍵位提醒（${MARKETS[e.m as keyof typeof MARKETS].base}）`,
    e.text,
    `看當下盤面：${base}/lab/orderflow/?tf=1&at=${e.at}${market}`,
    // The lab's 一鍵覆盤 of the story this event belongs to (public/lab/orderflow/event-replay.js).
    `看這段覆盤：${base}/lab/orderflow/?replay=${e.t}&k=${encodeURIComponent(e.kind)}${market}`,
    ...(lesson ? [`對應課程：${base}/orderflow/${lesson}`] : []),
    "提醒不是買賣訊號，要不要進場請看接下來的訂單流。非投資建議。",
    "回覆「警報設定」可以修改或取消。",
  ].join("\n");
}

const taipeiHour = (t: number) => new Date(t + 8 * 3_600_000).getUTCHours();

/**
 * Queues deliveries for events from the collector. Each subscriber gets the types and markets they
 * chose, at most their daily count per Taiwan day and nothing in their quiet hours; when the month's LINE
 * quota would dip under QUOTA_FLOOR, the rest are dropped rather than kept for later.
 */
export async function enqueueOrderflowEvents(env: Env, value: unknown) {
  const events = readEvents(value).sort((a, b) => a.t - b.t);
  const team = await getTeam(env.DB);
  if (!team.orderflow_alerts_enabled || !events.length) return { queued: 0, dropped: 0 };
  const subs = (
    await env.DB.prepare(
      `SELECT s.line_user_id,s.kinds,s.daily,s.quiet,s.markets FROM orderflow_alert_subs s JOIN customers c ON c.line_user_id=s.line_user_id
       WHERE ${ELIGIBLE} ORDER BY s.created_at LIMIT ?`,
    )
      .bind(team.revision, SUBSCRIBERS_MAX)
      .all<{ line_user_id: string; kinds: string; daily: number; quiet: string; markets: string }>()
  ).results;
  // Messages already counted against each subscriber's Taiwan day ("user|day" → count).
  const used = new Map<string, number>();
  for (const day of new Set(events.map((e) => taipeiDay(e.t)))) {
    const counts = await env.DB.prepare(
      "SELECT line_user_id,count(*) AS n FROM orderflow_alert_deliveries WHERE day=? AND status IN ('pending','sending','accepted') GROUP BY line_user_id",
    )
      .bind(day)
      .all<{ line_user_id: string; n: number }>();
    for (const c of counts.results) used.set(`${c.line_user_id}|${day}`, c.n);
  }
  const rows: { id: string; key: string; user: string; kind: string; body: string; day: string; market: string }[] = [];
  for (const e of events) {
    const choice = choiceOf(e.kind);
    const day = taipeiDay(e.t);
    for (const s of subs) {
      if (!choice || !upgradeKinds(s.kinds.split(",")).includes(choice) || !s.markets.split(",").includes(e.m) || inQuiet(s.quiet, taipeiHour(e.t))) continue;
      const key = `${s.line_user_id}|${day}`;
      if ((used.get(key) ?? 0) >= s.daily) continue;
      used.set(key, (used.get(key) ?? 0) + 1);
      rows.push({ id: crypto.randomUUID(), key: e.key, user: s.line_user_id, kind: e.kind, body: alertBody(env, e), day, market: e.m });
    }
  }
  let dropped = 0;
  if (rows.length && env.LINE_DELIVERY_MODE === "live") {
    const quota = await lineQuota(env);
    if (quota.remaining !== null) {
      const room = Math.max(0, quota.remaining - (await reservedLineMessages(env)) - QUOTA_FLOOR);
      dropped = Math.max(0, rows.length - room);
      rows.length = Math.min(rows.length, room);
    }
  }
  if (dropped) console.error(JSON.stringify({ event: "orderflow_alerts_quota", dropped }));
  if (!rows.length) return { queued: 0, dropped };
  const created = now();
  const results = await env.DB.batch(
    rows.map((r) =>
      env.DB.prepare("INSERT OR IGNORE INTO orderflow_alert_deliveries(id,event_key,line_user_id,kind,body,day,market,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(
        r.id,
        r.key,
        r.user,
        r.kind,
        r.body,
        r.day,
        r.market,
        created,
      ),
    ),
  );
  const fresh = rows.filter((_, i) => results[i].meta.changes);
  for (let i = 0; i < fresh.length; i += 100)
    await env.CAMPAIGN_EVENTS.sendBatch(fresh.slice(i, i + 100).map((r) => ({ body: { kind: "orderflow-alert-delivery" as const, id: r.id } })));
  return { queued: fresh.length, dropped };
}

export async function processOrderflowDelivery(message: OrderflowAlertMessage, env: Env) {
  const time = Date.now();
  const delivery = await env.DB.prepare(
    "UPDATE orderflow_alert_deliveries SET status='sending',lease_until=?,attempts=attempts+1 WHERE id=? AND (status='pending' OR (status='sending' AND lease_until<?)) RETURNING *",
  )
    .bind(new Date(time + 60_000).toISOString(), message.id, new Date(time).toISOString())
    .first<Delivery>();
  if (!delivery) return;
  const finish = async (status: string, detail: string) => {
    await setOutgoingStatus(env, "orderflow:" + delivery.id, status === "skipped" ? "not_sent" : status);
    await env.DB.prepare("UPDATE orderflow_alert_deliveries SET status=?,detail=?,finished_at=?,lease_until=NULL WHERE id=?").bind(status, detail, now(), delivery.id).run();
  };
  try {
    if (env.LINE_DELIVERY_MODE !== "live") return await finish("skipped", "發送模式已關閉");
    const team = await getTeam(env.DB);
    if (!team.orderflow_alerts_enabled) return await finish("skipped", "訂單流提醒已急停");
    if (time - Date.parse(delivery.created_at) > STALE_MS) return await finish("skipped", "事件已過時，不再發送");
    if (delivery.attempts > MAX_ATTEMPTS) return await finish("failed", "重試次數已達上限；請核對 LINE 紀錄");
    const still = await env.DB.prepare(`SELECT s.kinds,s.markets FROM orderflow_alert_subs s JOIN customers c ON c.line_user_id=s.line_user_id WHERE s.line_user_id=? AND ${ELIGIBLE}`)
      .bind(delivery.line_user_id, team.revision)
      .first<{ kinds: string; markets: string }>();
    if (!still || !upgradeKinds(still.kinds.split(",")).includes(choiceOf(delivery.kind) ?? "") || !still.markets.split(",").includes(delivery.market))
      return await finish("skipped", "已退訂、封鎖或不再符合會員資格");
    const messages = [{ type: "text" as const, text: delivery.body }];
    await recordOutgoing(env, delivery.line_user_id, "orderflow:" + delivery.id, messages);
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json", "X-Line-Retry-Key": delivery.id },
      body: JSON.stringify({ to: delivery.line_user_id, messages }),
      signal: AbortSignal.timeout(10_000),
    });
    const accepted = response.ok || (response.status === 409 && response.headers.has("x-line-accepted-request-id"));
    await response.body?.cancel();
    if (accepted) return await finish("accepted", "LINE 已接受，未提供個別送達或已讀保證");
    if (response.status === 429 || response.status >= 500) throw new Error("LineRetry");
    await finish("failed", `LINE 拒絕請求（HTTP ${response.status}），請核對帳戶額度或設定`);
  } catch (error) {
    await setOutgoingStatus(env, "orderflow:" + delivery.id, "unconfirmed");
    await env.DB.prepare("UPDATE orderflow_alert_deliveries SET status='pending',lease_until=NULL WHERE id=? AND status='sending'").bind(delivery.id).run();
    throw error;
  }
}

/** Cron: drops stale deliveries and re-queues the ones a failed send or an expired lease left behind. */
export async function dispatchOrderflowAlerts(env: Env) {
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  await env.DB.prepare(
    "UPDATE orderflow_alert_deliveries SET status='skipped',detail='事件已過時，不再發送',finished_at=?,lease_until=NULL WHERE status IN ('pending','sending') AND created_at<? AND (status='pending' OR lease_until<?)",
  )
    .bind(now(), stale, now())
    .run();
  const rows = await env.DB.prepare("SELECT id FROM orderflow_alert_deliveries WHERE status='pending' OR (status='sending' AND lease_until<?) ORDER BY created_at LIMIT 500")
    .bind(now())
    .all<{ id: string }>();
  for (let i = 0; i < rows.results.length; i += 100)
    await env.CAMPAIGN_EVENTS.sendBatch(rows.results.slice(i, i + 100).map((r) => ({ body: { kind: "orderflow-alert-delivery" as const, id: r.id } })));
}

// Admin view and emergency stop. The switch is its own column outside the versioned team settings,
// so stopping alerts does not invalidate anyone's VIP check. Stopping skips queued deliveries too.
export async function adminOrderflowAlertsApi(request: Request, env: Env, actor: string): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/api/orderflow-alerts" && request.method === "GET") {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [team, subs, recent] = await Promise.all([
      getTeam(env.DB),
      env.DB.prepare("SELECT count(*) AS n FROM orderflow_alert_subs").first<{ n: number }>(),
      env.DB.prepare("SELECT status,count(*) AS n FROM orderflow_alert_deliveries WHERE created_at>=? GROUP BY status").bind(since).all<{ status: string; n: number }>(),
    ]);
    return json({
      enabled: team.orderflow_alerts_enabled !== 0,
      subscribers: subs?.n ?? 0,
      last24h: Object.fromEntries(recent.results.map((r) => [r.status, r.n])),
    });
  }
  if (path === "/api/orderflow-alerts/settings" && request.method === "POST") {
    const data = await readJson(request);
    if (typeof data.enabled !== "boolean") throw new HttpError(400, "請指定是否開放關鍵位提醒");
    await env.DB.prepare("UPDATE team_settings SET orderflow_alerts_enabled=? WHERE id=1").bind(data.enabled ? 1 : 0).run();
    await audit(env.DB, null, data.enabled ? "orderflow.alerts.resumed" : "orderflow.alerts.stopped", { actor });
    return json({ enabled: data.enabled });
  }
  if (path === "/api/orderflow-alerts/collector") return collectorSettings(request, env, actor);
  return null;
}

// The thresholds and switches of the collector whose events go to LINE, held by the order-flow
// Worker. It is reached over the ORDERFLOW service binding (its OrderflowAdmin entrypoint), so the
// admin's session here stands in for the order-flow admin token.
async function collectorSettings(request: Request, env: Env & { ORDERFLOW?: Fetcher }, actor: string) {
  if (!env.ORDERFLOW) throw new HttpError(503, "訂單流服務未連線");
  const market = new URL(request.url).searchParams.get("m") ?? "btc";
  if (!Object.hasOwn(MARKETS, market)) throw new HttpError(400, "沒有這個市場");
  let body: string | undefined;
  let action = "";
  let detail: Record<string, unknown> = {};
  if (request.method === "POST") {
    const data = await readJson(request);
    if (data.test === true) action = "orderflow.collector.tested";
    else if (data.config === null) action = "orderflow.collector.reset";
    else if (data.config && typeof data.config === "object" && !Array.isArray(data.config)) {
      const config = data.config as Record<string, unknown>;
      if (!Object.keys(config).length || Object.keys(config).length > 40 || !Object.values(config).every((v) => typeof v === "number" && Number.isFinite(v)))
        throw new HttpError(400, "門檻需為數字");
      action = "orderflow.collector.tuned";
      detail = { config };
    } else throw new HttpError(400, "請指定要調整的門檻或測試通知");
    body = JSON.stringify(data.test === true ? { test: true } : { config: data.config });
  } else if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
  const res = await env.ORDERFLOW.fetch(`https://orderflow/alerts?m=${market}`, { method: request.method, body, headers: { "content-type": "application/json" } });
  const answer = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new HttpError(502, typeof answer.error === "string" ? answer.error : "訂單流服務暫時無法回應");
  if (action) await audit(env.DB, null, action, { actor, market, ...detail });
  return json(answer);
}
