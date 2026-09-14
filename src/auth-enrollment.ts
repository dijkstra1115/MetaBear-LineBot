import { HttpError, json } from "./http";
import type { LineMessage } from "./types";
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const time = () => Math.floor(Date.now() / 1000);

// Called only after adminIdentity has authenticated the current administrator.
export async function enrollmentApi(
  request: Request,
  env: Env,
  email: string,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/auth/line-enrollment")
    return null;
  if (
    env.AUTH_CHANNEL !== "line" ||
    email.toLowerCase() !== env.ADMIN_EMAIL.trim().toLowerCase()
  )
    throw new HttpError(403, "目前無法設定此登入方式");
  email = email.toLowerCase();
  if (request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT enrolled_at FROM auth_admin_channels WHERE email=?",
    )
      .bind(email)
      .first<{ enrolled_at: number }>();
    return json({ email, bound: !!row, enrolledAt: row?.enrolled_at || null });
  }
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
  if (env.LINE_DELIVERY_MODE !== "live" || !env.LINE_CHANNEL_ACCESS_TOKEN)
    throw new HttpError(503, "請先設定 LINE 官方帳號");
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const expires = time() + 600;
  await env.DB.prepare(
    `INSERT INTO auth_line_enrollments(email,token_hash,expires_at) VALUES (?,?,?)
    ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at`,
  )
    .bind(email, await digest(token), expires)
    .run();
  return json({ command: `綁定後台 ${token}`, expiresAt: expires });
}

// Intercepted before AI routing. The token comes only from the authenticated
// admin endpoint, never from public CRM or UID data.
export async function enrollFromLine(
  env: Env,
  userId: string,
  text: string,
  eventId: string,
): Promise<LineMessage[] | null> {
  if (!text.trim().startsWith("綁定後台")) return null;
  const invalid: LineMessage[] = [
    {
      type: "text",
      text: "這組後台綁定碼無效或已過期。請登入管理員後台重新取得；一般 UID 審核不需要此步驟。",
    },
  ];
  if (env.AUTH_CHANNEL !== "line") return invalid;
  const match = /^綁定後台\s+([a-f0-9]{48})$/.exec(text.trim());
  if (!match) return invalid;
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const done = await env.DB.prepare(
    "SELECT email FROM auth_admin_channels WHERE email=? AND line_user_id=? AND enrolled_event_id=?",
  )
    .bind(email, userId, eventId)
    .first();
  const success: LineMessage[] = [
    {
      type: "text",
      text: "已完成 MetaBear 管理員登入綁定。之後後台登入驗證碼會傳到這個 LINE。請回到瀏覽器測試登入。",
    },
  ];
  if (done) return success;
  const tokenHash = await digest(match[1]);
  const now = time();
  const result = await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM auth_sessions WHERE email=? AND EXISTS (SELECT 1 FROM auth_line_enrollments WHERE email=? AND token_hash=? AND expires_at>?)`,
    ).bind(email, email, tokenHash, now),
    env.DB.prepare(
      `INSERT INTO auth_admin_channels(email,line_user_id,enrolled_at,enrolled_event_id)
      SELECT email,?,?,? FROM auth_line_enrollments WHERE email=? AND token_hash=? AND expires_at>?
      ON CONFLICT(email) DO UPDATE SET line_user_id=excluded.line_user_id,enrolled_at=excluded.enrolled_at,enrolled_event_id=excluded.enrolled_event_id`,
    ).bind(userId, now, eventId, email, tokenHash, now),
    env.DB.prepare(
      "DELETE FROM auth_line_enrollments WHERE email=? AND token_hash=? AND expires_at>?",
    ).bind(email, tokenHash, now),
    env.DB.prepare(
      "DELETE FROM auth_challenges WHERE email=? AND EXISTS (SELECT 1 FROM auth_admin_channels WHERE email=? AND enrolled_event_id=?)",
    ).bind(email, email, eventId),
  ]);
  return result[1].meta.changes === 1 ? success : invalid;
}
