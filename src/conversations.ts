import { HttpError, json } from "./http";
import type { LineEvent, LineMessage } from "./types";
const RETENTION_MS = 90 * 86400000;
export function redactConversation(text: string): string {
  if (/^綁定後台\s/i.test(text.trim())) return "[後台登入綁定指令已隱藏]";
  if (/^\d{6}$/.test(text.trim())) return "[六位數代碼已隱藏]";
  return text
    .replace(
      /((?:api[ _-]?key|api[ _-]?secret|secret|密碼|password|私鑰|助記詞)\s*[:：=]\s*)[^\n]+/gi,
      "$1[已隱藏]",
    )
    .replace(/((?:驗證碼|OTP)\s*[:：=是]?\s*)[A-Za-z0-9-]{4,}/gi, "$1[已隱藏]")
    .replace(/\b[A-Za-z0-9_+/=-]{48,}\b/g, "[長憑證已隱藏]");
}
export async function recordIncoming(
  env: Env,
  event: LineEvent,
): Promise<void> {
  if (event.type === "unsend" && event.unsend?.messageId) {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO conversation_unsends(line_user_id,message_id,occurred_at) VALUES (?,?,?)",
      ).bind(event.source!.userId!, event.unsend.messageId, event.timestamp),
      env.DB.prepare(
        "UPDATE conversation_messages SET content='[用戶已收回訊息]',metadata_json='{}',message_type='unsent' WHERE line_user_id=? AND direction='user' AND json_extract(metadata_json,'$.messageId')=?",
      ).bind(event.source!.userId!, event.unsend.messageId),
    ]);
  }
  let content: string;
  let type = event.type;
  const metadata: Record<string, unknown> = {};
  if (event.type === "message") {
    type = event.message?.type || "unknown";
    content =
      type === "text"
        ? event.message?.text || ""
        : `[用戶傳送${type}；附件請至 LINE 官方帳號查看]`;
    if (event.message?.id) {
      metadata.messageId = event.message.id;
      const withdrawn = await env.DB.prepare(
        "SELECT 1 FROM conversation_unsends WHERE line_user_id=? AND message_id=?",
      )
        .bind(event.source!.userId!, event.message.id)
        .first();
      if (withdrawn) {
        content = "[用戶已收回訊息]";
        type = "unsent";
        delete metadata.messageId;
      }
    }
  } else if (event.type === "postback") {
    const params = new URLSearchParams(event.postback?.data || "");
    content =
      params.get("text") ||
      params.get("question_text") ||
      params.get("topic") ||
      "[點選選單]";
  } else
    content =
      event.type === "follow"
        ? "[加入官方帳號]"
        : event.type === "unsend"
          ? "[收回一則訊息]"
          : "[封鎖官方帳號]";
  await env.DB.prepare(
    `INSERT OR IGNORE INTO conversation_messages(message_key,line_user_id,event_id,direction,message_type,content,metadata_json,delivery_status,occurred_at) VALUES (?,?,?,'user',?,?,?,'received',?)`,
  )
    .bind(
      `${event.webhookEventId}:in`,
      event.source!.userId!,
      event.webhookEventId,
      type,
      redactConversation(content).slice(0, 20000),
      JSON.stringify(metadata),
      event.timestamp,
    )
    .run();
}
export async function recordOutgoing(
  env: Env,
  userId: string,
  eventId: string,
  messages: LineMessage[],
  status = "prepared",
): Promise<void> {
  if (!messages.length) return;
  await env.DB.batch(
    messages.map((m, i) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO conversation_messages(message_key,line_user_id,event_id,direction,message_type,content,metadata_json,delivery_status,occurred_at) VALUES (?,?,?,'bot',?,?,?,?,?)`,
      ).bind(
        `${eventId}:out:${i}`,
        userId,
        eventId,
        m.type,
        m.type === "text" ? redactConversation(m.text) : "[教學圖片]",
        JSON.stringify(
          m.type === "image" ? { imageUrl: m.originalContentUrl } : {},
        ),
        status,
        Date.now(),
      ),
    ),
  );
}
export async function setOutgoingStatus(
  env: Env,
  eventId: string,
  status: string,
): Promise<void> {
  await env.DB.prepare(
    "UPDATE conversation_messages SET delivery_status=? WHERE event_id=? AND direction='bot' AND delivery_status<>'accepted'" +
      (status === "unconfirmed" ? " AND delivery_status='prepared'" : ""),
  )
    .bind(status, eventId)
    .run();
}
export async function recentConversation(
  db: D1Database,
  userId: string,
  excludeEvent: string,
): Promise<{ role: string; text: string }[]> {
  const rows = await db
    .prepare(
      `SELECT direction,content FROM conversation_messages WHERE line_user_id=? AND event_id<>? AND message_type='text' AND occurred_at>? AND delivery_status IN ('received','accepted') ORDER BY id DESC LIMIT 6`,
    )
    .bind(userId, excludeEvent, Date.now() - 86400000)
    .all<{ direction: string; content: string }>();
  return rows.results.reverse().map((row) => ({
    role: row.direction === "user" ? "user" : "assistant",
    text: redactConversation(row.content)
      .replace(/https?:\/\/\S+/g, "[連結]")
      .slice(0, 800),
  }));
}
export async function conversationApi(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/api\/customers\/(U[a-f0-9]{32})\/messages$/i.exec(
    url.pathname,
  );
  if (!match) return null;
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
  const before = url.searchParams.get("before");
  if (before && !/^[1-9]\d{0,14}$/.test(before))
    throw new HttpError(400, "對話分頁不正確");
  const rows = await env.DB.prepare(
    `SELECT id,direction,message_type,content,metadata_json,delivery_status,occurred_at FROM conversation_messages WHERE line_user_id=? AND id<? AND occurred_at>? ORDER BY id DESC LIMIT 51`,
  )
    .bind(
      match[1],
      before ? Number(before) : Number.MAX_SAFE_INTEGER,
      Date.now() - RETENTION_MS,
    )
    .all();
  const messages = rows.results.slice(0, 50);
  return json({
    messages: messages.reverse(),
    nextBefore: rows.results.length > 50 ? messages[0].id : null,
    retentionDays: 90,
  });
}
export async function cleanupConversations(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM conversation_unsends WHERE occurred_at<?")
    .bind(Date.now() - RETENTION_MS)
    .run();
  await env.DB.prepare(
    "DELETE FROM conversation_messages WHERE id IN (SELECT id FROM conversation_messages WHERE occurred_at<? LIMIT 1000)",
  )
    .bind(Date.now() - RETENTION_MS)
    .run();
}
