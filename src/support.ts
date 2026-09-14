import { now } from "./db";

export type SupportCase = {
  id: string;
  line_user_id: string;
  status: "pending" | "claimed" | "resolved";
  owner_name: string;
  notification_status: "pending" | "processing" | "sent" | "failed";
  bot_paused: number;
  requested_at: number;
  updated_at: number;
};

export type SupportNotificationMessage = {
  kind: "support-notification";
  id: string;
};

export async function activeSupportCase(db: D1Database, userId: string) {
  return db
    .prepare(
      "SELECT * FROM support_cases WHERE line_user_id=? AND status IN ('pending','claimed') ORDER BY requested_at DESC LIMIT 1",
    )
    .bind(userId)
    .first<SupportCase>();
}

export async function requestSupport(
  env: Env,
  userId: string,
  eventId: string,
): Promise<{ support: SupportCase; created: boolean }> {
  const existing = await activeSupportCase(env.DB, userId);
  if (existing) return { support: existing, created: false };
  const id = crypto.randomUUID();
  const timestamp = Date.now();
  const result = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO support_cases(id,line_user_id,request_event_id,notification_key,requested_at,updated_at)
       SELECT ?,?,?,?,?,? WHERE NOT EXISTS (
         SELECT 1 FROM support_cases WHERE line_user_id=? AND status IN ('pending','claimed')
       ) ON CONFLICT DO NOTHING`,
    ).bind(
      id,
      userId,
      eventId,
      crypto.randomUUID(),
      timestamp,
      timestamp,
      userId,
    ),
    env.DB.prepare(
      "UPDATE customers SET support_requested=1,updated_at=? WHERE line_user_id=?",
    ).bind(now(), userId),
  ]);
  const support = (await activeSupportCase(env.DB, userId))!;
  const created = result[0].meta.changes === 1 && support.id === id;
  if (created) {
    try {
      await env.CAMPAIGN_EVENTS.send({ kind: "support-notification", id });
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "support.notification.enqueue_failed",
          errorType: error instanceof Error ? error.name : "Unknown",
        }),
      );
    }
  }
  return { support, created };
}

export async function updateSupportCase(
  db: D1Database,
  userId: string,
  status: SupportCase["status"],
  ownerName: string,
) {
  const active = await activeSupportCase(db, userId);
  const timestamp = Date.now();
  if (!active && status === "resolved") {
    await db
      .prepare(
        "UPDATE customers SET support_requested=0,updated_at=? WHERE line_user_id=?",
      )
      .bind(now(), userId)
      .run();
    return;
  }
  if (!active) {
    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `INSERT INTO support_cases(id,line_user_id,status,owner_name,request_event_id,notification_key,
         notification_status,requested_at,updated_at,claimed_at,bot_paused)
         VALUES (?,?,?,?,?,?,'sent',?,?,?,?)`,
        )
        .bind(
          id,
          userId,
          status,
          ownerName,
          `admin:${id}`,
          crypto.randomUUID(),
          timestamp,
          timestamp,
          status === "claimed" ? timestamp : null,
          status === "claimed" ? 1 : 0,
        ),
      db
        .prepare(
          "UPDATE customers SET support_requested=1,updated_at=? WHERE line_user_id=?",
        )
        .bind(now(), userId),
    ]);
    return;
  }
  const botPaused = status === "claimed" ? 1 : 0;
  await db.batch([
    db
      .prepare(
        `UPDATE support_cases SET status=?,owner_name=?,bot_paused=?,updated_at=?,
       claimed_at=CASE WHEN ?='claimed' THEN COALESCE(claimed_at,?) ELSE claimed_at END,
       resolved_at=CASE WHEN ?='resolved' THEN ? ELSE NULL END WHERE id=?`,
      )
      .bind(
        status,
        ownerName,
        botPaused,
        timestamp,
        status,
        timestamp,
        status,
        timestamp,
        active.id,
      ),
    db
      .prepare(
        "UPDATE customers SET support_requested=?,updated_at=? WHERE line_user_id=?",
      )
      .bind(status === "resolved" ? 0 : 1, now(), userId),
  ]);
}

export async function resumeBot(db: D1Database, userId: string) {
  await db
    .prepare(
      "UPDATE support_cases SET bot_paused=0,updated_at=? WHERE line_user_id=? AND status='claimed'",
    )
    .bind(Date.now(), userId)
    .run();
}

export async function dispatchSupportNotifications(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT id FROM support_cases WHERE notification_status IN ('pending','failed') AND status<>'resolved' ORDER BY requested_at LIMIT 50",
  ).all<{ id: string }>();
  for (const row of rows.results)
    await env.CAMPAIGN_EVENTS.send({
      kind: "support-notification",
      id: row.id,
    });
}

export async function processSupportNotification(
  message: SupportNotificationMessage,
  env: Env,
) {
  const support = await env.DB.prepare(
    `UPDATE support_cases SET notification_status='processing',updated_at=? WHERE id=?
     AND notification_status IN ('pending','failed') RETURNING *`,
  )
    .bind(Date.now(), message.id)
    .first<SupportCase & { notification_key: string }>();
  if (!support) {
    const existing = await env.DB.prepare(
      "SELECT notification_status FROM support_cases WHERE id=?",
    )
      .bind(message.id)
      .first<{ notification_status: string }>();
    if (!existing || existing.notification_status === "sent") return;
    throw new Error("Support notification is processing");
  }
  try {
    const admin = await env.DB.prepare(
      "SELECT line_user_id FROM auth_admin_channels WHERE email=?",
    )
      .bind(env.ADMIN_EMAIL.trim().toLowerCase())
      .first<{ line_user_id: string }>();
    if (!admin || env.LINE_DELIVERY_MODE !== "live")
      throw new Error("Admin LINE channel unavailable");
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": support.notification_key,
      },
      body: JSON.stringify({
        to: admin.line_user_id,
        messages: [
          {
            type: "text",
            text: "MetaBear 有新的人工協助需求。請開啟客戶工作台，在「需協助」名單中認領並查看 LINE 對話。",
          },
        ],
      }),
    });
    const accepted =
      response.ok ||
      (response.status === 409 &&
        response.headers.has("x-line-accepted-request-id"));
    await response.body?.cancel();
    if (!accepted)
      throw new Error(`LINE support notification HTTP ${response.status}`);
    await env.DB.prepare(
      "UPDATE support_cases SET notification_status='sent',updated_at=? WHERE id=?",
    )
      .bind(Date.now(), support.id)
      .run();
  } catch (error) {
    await env.DB.prepare(
      "UPDATE support_cases SET notification_status='failed',updated_at=? WHERE id=?",
    )
      .bind(Date.now(), support.id)
      .run();
    throw error;
  }
}
