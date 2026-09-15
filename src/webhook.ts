import { command, menu, reply } from "./content";
import { respond, respondToInboundMedia } from "./bot";
import { isImmediateCommand } from "./assistant";
import { ensureCustomer, now } from "./db";
import { HttpError, json, readBody, signatureValid } from "./http";
import type { LineEvent, LineMessage } from "./types";
import { getTeam, personalize } from "./team";
import { startLoading } from "./line-loading";
import { enrollFromLine } from "./auth-enrollment";
import {
  recordIncoming,
  recordOutgoing,
  setOutgoingStatus,
} from "./conversations";

export function eventCommandText(event: LineEvent): string | undefined {
  if (
    event.type === "message" &&
    event.message?.type === "text" &&
    typeof event.message.text === "string"
  )
    return event.message.text.trim();
  if (event.type === "postback" && typeof event.postback?.data === "string") {
    const params = new URLSearchParams(event.postback.data);
    return (
      params.get("text") ??
      params.get("question_text") ??
      params.get("topic") ??
      "選單"
    ).trim();
  }
}

async function deliverImmediately(event: LineEvent, env: Env) {
  try {
    await processLineEvent(event, env);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "webhook.immediate.failed",
        eventId: event.webhookEventId,
        errorType: error instanceof Error ? error.name : "Unknown",
      }),
    );
    await env.LINE_EVENTS.send(event);
  }
}

export async function webhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) {
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
      !["follow", "unfollow", "message", "postback", "unsend"].includes(
        event.type,
      )
    )
      continue;
    // CRM registration is only processed in one-to-one chats.
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
  const immediate: LineEvent[] = [];
  const queued: LineEvent[] = [];
  for (const event of accepted) {
    const text = eventCommandText(event);
    if (text && isImmediateCommand(text)) immediate.push(event);
    else queued.push(event);
  }
  for (const event of accepted) {
    if (
      ["message", "postback"].includes(event.type) &&
      Date.now() - event.timestamp < 60000
    )
      ctx.waitUntil(
        startLoading(
          env,
          event.source!.userId!,
          immediate.includes(event) ? 5 : 60,
        ),
      );
  }
  for (const event of immediate)
    ctx.waitUntil(deliverImmediately(event, env));
  if (queued.length) {
    await env.LINE_EVENTS.sendBatch(queued.map((body) => ({ body })));
    console.log(
      JSON.stringify({ event: "webhook.queued", count: queued.length }),
    );
  }
  if (immediate.length)
    console.log(
      JSON.stringify({ event: "webhook.immediate", count: immediate.length }),
    );
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
    await recordIncoming(env, event);
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
        if (event.type === "unsend") {
          // The transcript tombstone is recorded even for out-of-order events.
        } else if (event.type === "unfollow") {
          await env.DB.prepare(
            "UPDATE customers SET marketing_consent=0, consent_at=? WHERE line_user_id=? AND last_event_at=?",
          )
            .bind(now(), userId, event.timestamp)
            .run();
        } else if (event.type === "follow")
          messages = personalize([menu()], await getTeam(env.DB));
        else if (event.type === "message") {
          if (
            event.message?.type === "text" &&
            typeof event.message.text === "string"
          )
            messages =
              (await enrollFromLine(env, userId, event.message.text, id)) ??
              (await respond(
                env.DB,
                userId,
                event.message.text,
                env,
                id,
                event.timestamp,
              ));
          else
            messages = await respondToInboundMedia(
              env.DB,
              userId,
              env,
              id,
              event.message?.type ?? "",
            );
        } else if (typeof event.postback?.data === "string") {
          messages = await respond(
            env.DB,
            userId,
            eventCommandText(event) ?? "選單",
            env,
            id,
            event.timestamp,
          );
        }
      }
      await env.DB.prepare(
        "UPDATE webhook_events SET status='ready', messages_json=? WHERE event_id=?",
      )
        .bind(JSON.stringify(messages), id)
        .run();
    }
    await recordOutgoing(env, userId, id, messages);
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
      await setOutgoingStatus(env, id, response.ok ? "accepted" : "failed");
      await response.body?.cancel();
      if (!response.ok) throw new Error(`LINE reply HTTP ${response.status}`);
    } else await setOutgoingStatus(env, id, "not_sent");
    await env.DB.prepare(
      "UPDATE webhook_events SET status='done', messages_json=NULL WHERE event_id=?",
    )
      .bind(id)
      .run();
    console.log(JSON.stringify({ event: "webhook.processed", eventId: id }));
  } catch (error) {
    await setOutgoingStatus(env, id, "unconfirmed");
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
