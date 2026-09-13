import { menu, reply } from "./content";
import { respond } from "./bot";
import { ensureCustomer, now } from "./db";
import { HttpError, json, readBody, signatureValid } from "./http";
import type { LineEvent, LineMessage } from "./types";

export async function webhook(request: Request, env: Env) {
  const raw = await readBody(request, 262144);
  if (
    !(await signatureValid(
      raw,
      request.headers.get("X-Line-Signature") ?? "",
      env.LINE_CHANNEL_SECRET,
    ))
  )
    throw new HttpError(401, "Invalid signature");
  let events: LineEvent[];
  try {
    const parsed = JSON.parse(raw) as { events?: LineEvent[] };
    if (!Array.isArray(parsed.events) || parsed.events.length > 100)
      throw new Error();
    events = parsed.events;
  } catch {
    throw new HttpError(400, "Invalid webhook");
  }
  const accepted: LineEvent[] = [];
  for (const event of events) {
    if (
      !event ||
      !["follow", "unfollow", "message", "postback"].includes(event.type)
    )
      continue;
    // CRM identity and account proofs are only processed in one-to-one chats.
    if (
      event.source?.type !== "user" ||
      !/^U[a-f0-9]{32}$/i.test(event.source.userId ?? "")
    )
      continue;
    if (
      !event.webhookEventId ||
      typeof event.webhookEventId !== "string" ||
      event.webhookEventId.length > 100 ||
      !Number.isFinite(event.timestamp)
    )
      throw new HttpError(400, "Missing event identity");
    accepted.push(event);
  }
  // Acknowledge only after durable enqueue, without waiting for AI or LINE replies.
  // LINE may close its webhook connection before those network calls complete.
  if (accepted.length) {
    await env.LINE_EVENTS.sendBatch(accepted.map((body) => ({ body })));
    console.log(
      JSON.stringify({ event: "webhook.queued", count: accepted.length }),
    );
  }
  return json({ ok: true });
}

export async function processLineEvent(event: LineEvent, env: Env) {
  const id = event.webhookEventId;
  const userId = event.source!.userId!;
  const time = Date.now();
  // Atomic lease stops simultaneous deliveries; saved replies survive transient LINE failures.
  const claim = await env.DB.prepare(
    `INSERT INTO webhook_events(event_id,status,lease_until) VALUES (?,'processing',?)
      ON CONFLICT(event_id) DO UPDATE SET lease_until=excluded.lease_until
      WHERE webhook_events.status != 'done' AND webhook_events.lease_until < ? RETURNING *`,
  )
    .bind(id, time + 60000, time)
    .first<{ status: string; messages_json: string | null }>();
  if (!claim) {
    const existing = await env.DB.prepare(
      "SELECT status FROM webhook_events WHERE event_id=?",
    )
      .bind(id)
      .first<{ status: string }>();
    if (existing?.status === "done") return;
    throw new HttpError(503, "Event is processing; retry later");
  }
  try {
    const customerClaim = await env.DB.prepare(
      `INSERT INTO customer_leases(line_user_id,event_id,lease_until) VALUES (?,?,?)
        ON CONFLICT(line_user_id) DO UPDATE SET event_id=excluded.event_id,lease_until=excluded.lease_until
        WHERE customer_leases.lease_until < ? RETURNING event_id`,
    )
      .bind(userId, id, time + 60000, time)
      .first();
    if (!customerClaim)
      throw new HttpError(503, "Customer is processing; retry later");
    let messages: LineMessage[] = [];
    if (claim.messages_json)
      messages = JSON.parse(claim.messages_json) as LineMessage[];
    else {
      const c = await ensureCustomer(env.DB, userId);
      if (event.timestamp >= c.last_event_at) {
        await env.DB.prepare(
          "UPDATE customers SET blocked=?, last_event_at=?, updated_at=? WHERE line_user_id=? AND last_event_at <= ?",
        )
          .bind(
            event.type === "unfollow" ? 1 : 0,
            event.timestamp,
            now(),
            userId,
            event.timestamp,
          )
          .run();
        if (event.type === "unfollow") {
          await env.DB.prepare(
            "UPDATE customers SET marketing_consent=0, consent_at=? WHERE line_user_id=? AND last_event_at=?",
          )
            .bind(now(), userId, event.timestamp)
            .run();
        } else if (event.type === "follow") messages = [menu()];
        else if (event.type === "message") {
          if (
            event.message?.type === "text" &&
            typeof event.message.text === "string"
          )
            messages = await respond(
              env.DB,
              userId,
              event.message.text,
              env,
              id,
            );
          else if (["image", "video"].includes(event.message?.type ?? "")) {
            await env.DB.prepare(
              "UPDATE customers SET support_requested=1 WHERE line_user_id=?",
            )
              .bind(userId)
              .run();
            messages = [
              reply(
                "已標記你提供了圖片／影片，請小幫手到 LINE 官方帳號對話查看。圖片尚未自動核實，也不會自動通過入群。",
              ),
            ];
          }
        } else if (typeof event.postback?.data === "string") {
          const params = new URLSearchParams(event.postback.data);
          const input =
            params.get("text") ??
            params.get("question_text") ??
            params.get("topic") ??
            "選單";
          messages = await respond(env.DB, userId, input, env, id);
        }
      }
      await env.DB.prepare(
        "UPDATE webhook_events SET status='ready', messages_json=? WHERE event_id=?",
      )
        .bind(JSON.stringify(messages), id)
        .run();
    }
    if (
      env.LINE_DELIVERY_MODE === "live" &&
      messages.length &&
      event.replyToken
    ) {
      if (!env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error("LINE token missing");
      const response = await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ replyToken: event.replyToken, messages }),
        signal: AbortSignal.timeout(10000),
      });
      console.log(
        JSON.stringify({
          event: response.ok ? "line.reply.sent" : "line.reply.failed",
          eventId: id,
          status: response.status,
          requestId: response.headers.get("x-line-request-id"),
          messageTypes: messages.map((message) => message.type),
        }),
      );
      await response.body?.cancel();
      if (!response.ok) throw new Error(`LINE reply HTTP ${response.status}`);
    }
    await env.DB.prepare(
      "UPDATE webhook_events SET status='done', messages_json=NULL WHERE event_id=?",
    )
      .bind(id)
      .run();
    console.log(JSON.stringify({ event: "webhook.processed", eventId: id }));
  } catch (error) {
    await env.DB.prepare(
      "UPDATE webhook_events SET lease_until=0 WHERE event_id=?",
    )
      .bind(id)
      .run();
    throw error;
  } finally {
    await env.DB.prepare(
      "DELETE FROM customer_leases WHERE line_user_id=? AND event_id=?",
    )
      .bind(userId, id)
      .run();
  }
}
