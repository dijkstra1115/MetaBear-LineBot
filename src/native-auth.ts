import { HttpError, json, readJson } from "./http";

declare global {
  interface Env {
    AUTH_MODE?: string;
    AUTH_CHANNEL?: string;
    AUTH_EMAIL_FROM?: string;
    AUTH_EMAIL?: {
      send(message: {
        from: { email: string; name: string };
        to: string;
        subject: string;
        text: string;
      }): Promise<unknown>;
    };
  }
}

const CHALLENGE = "__Host-metabear-challenge";
const SESSION = "__Host-metabear-session";
const OTP_TTL = 600;
const SESSION_TTL = 8 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);
const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const cookie = (name: string, value: string, age: number) =>
  `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
function readCookie(request: Request, name: string): string | null {
  const values = (request.headers.get("Cookie") || "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function checkMutation(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (
    new URL(request.url).protocol !== "https:" ||
    request.headers.get("Origin") !== new URL(request.url).origin ||
    request.headers.get("X-MetaBear-Request") !== "crm"
  )
    throw new HttpError(403, "操作來源驗證失敗，請從登入頁重新操作");
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "操作需使用 JSON 格式");
}

async function limit(
  db: D1Database,
  bucket: string,
  max: number,
  seconds: number,
): Promise<void> {
  const time = now();
  const row = await db
    .prepare(
      `INSERT INTO auth_rate_limits(bucket,count,reset_at) VALUES (?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,
    reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END
    WHERE reset_at<=? OR count<? RETURNING count`,
    )
    .bind(bucket, time + seconds, time, time, time, max)
    .first();
  if (!row) throw new HttpError(429, "請求次數較多，請稍後再試");
}

export async function nativeIdentity(
  request: Request,
  env: Env,
): Promise<{ email: string; mode: "native" }> {
  if (!env.ADMIN_EMAIL) throw new HttpError(503, "管理員登入尚未完成設定");
  const token = readCookie(request, SESSION);
  if (!token) throw new HttpError(401, "請先登入 MetaBear");
  const row = await env.DB.prepare(
    "SELECT email FROM auth_sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hash(token), now())
    .first<{ email: string }>();
  if (!row || row.email !== env.ADMIN_EMAIL.trim().toLowerCase())
    throw new HttpError(401, "登入已失效，請重新登入");
  checkMutation(request);
  return { email: row.email, mode: "native" };
}

export async function cleanupAuth(env: Env): Promise<void> {
  if (!["native", "native-preview"].includes(env.AUTH_MODE || "")) return;
  const time = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at<=?").bind(
      time,
    ),
    env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").bind(time),
    env.DB.prepare("DELETE FROM auth_rate_limits WHERE reset_at<=?").bind(time),
    env.DB.prepare(
      "DELETE FROM auth_line_enrollments WHERE expires_at<=?",
    ).bind(time),
  ]);
}

export async function authRoute(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  const enabled = ["native", "native-preview"].includes(env.AUTH_MODE || "");
  if (path === "/auth/config" && request.method === "GET")
    return json({
      mode: enabled ? "native" : "cloudflare",
      channel: env.AUTH_CHANNEL === "line" ? "line" : "email",
      preview: env.AUTH_MODE === "native-preview",
    });
  if (!enabled) throw new HttpError(404, "登入服務尚未啟用");
  if (path === "/auth/session" && request.method === "GET")
    return json(await nativeIdentity(request, env));
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
  checkMutation(request);
  if (path === "/auth/logout") {
    const token = readCookie(request, SESSION);
    if (token)
      await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash=?")
        .bind(await hash(token))
        .run();
    const response = json({ ok: true });
    response.headers.append("Set-Cookie", cookie(SESSION, "", 0));
    response.headers.append("Set-Cookie", cookie(CHALLENGE, "", 0));
    return response;
  }
  if (!["/auth/request", "/auth/verify"].includes(path))
    throw new HttpError(404, "Not found");
  const body = await readJson(request);
  if (path === "/auth/request") {
    const viaLine = env.AUTH_CHANNEL === "line";
    if (
      !env.ADMIN_EMAIL ||
      (viaLine
        ? env.LINE_DELIVERY_MODE !== "live" || !env.LINE_CHANNEL_ACCESS_TOKEN
        : !env.AUTH_EMAIL || !env.AUTH_EMAIL_FROM)
    )
      throw new HttpError(503, "登入驗證碼傳送尚未完成設定，請稍後再試");
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new HttpError(400, "請輸入有效的 Email");
    // CF-Connecting-IP is set by Cloudflare; client-provided forwarding headers are never trusted.
    await limit(
      env.DB,
      "ip:" +
        (await hash(request.headers.get("CF-Connecting-IP") || "unknown")),
      20,
      3600,
    );
    const response = json({
      ok: true,
      message: viaLine
        ? "若此 Email 有管理權限，驗證碼將傳到已綁定的 LINE，有效 10 分鐘。請在這個瀏覽器輸入。"
        : "若此 Email 有管理權限，你將收到一封驗證信。驗證碼有效 10 分鐘。",
    });
    if (email !== env.ADMIN_EMAIL.trim().toLowerCase()) return response;
    const channel = viaLine
      ? await env.DB.prepare(
          "SELECT line_user_id,enrolled_event_id FROM auth_admin_channels WHERE email=?",
        )
          .bind(email)
          .first<{ line_user_id: string; enrolled_event_id: string }>()
      : null;
    if (viaLine && !channel)
      throw new HttpError(503, "請先從現有管理員後台完成 LINE 登入綁定");
    await limit(env.DB, "cooldown:" + (await hash(email)), 1, 60);
    await limit(env.DB, "email:" + (await hash(email)), 5, 3600);
    const challenge = randomToken();
    const idHash = await hash(challenge);
    // Rejection sampling avoids modulo bias. The browser's random challenge is also
    // needed to hash an OTP, so a database copy alone cannot brute force the code.
    let n: number;
    do {
      n = crypto.getRandomValues(new Uint32Array(1))[0];
    } while (n >= 4290000000);
    const code = String(n % 1000000).padStart(6, "0");
    const codeHash = await hash(`${challenge}:${code}`);
    const insert = viaLine
      ? env.DB.prepare(
          `INSERT INTO auth_challenges(id_hash,email,code_hash,expires_at)
          SELECT ?,email,?,? FROM auth_admin_channels WHERE email=? AND enrolled_event_id=?`,
        ).bind(
          idHash,
          codeHash,
          now() + OTP_TTL,
          email,
          channel!.enrolled_event_id,
        )
      : env.DB.prepare(
          "INSERT INTO auth_challenges(id_hash,email,code_hash,expires_at) VALUES (?,?,?,?)",
        ).bind(idHash, email, codeHash, now() + OTP_TTL);
    if ((await insert.run()).meta.changes !== 1)
      throw new HttpError(409, "登入綁定已更新，請重新索取驗證碼");
    try {
      if (viaLine) {
        const sent = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          redirect: "manual",
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "X-Line-Retry-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            to: channel!.line_user_id,
            messages: [
              {
                type: "text",
                text: `MetaBear 後台登入驗證碼：${code}\n\n請回到發起登入的瀏覽器輸入，10 分鐘內有效。請勿轉傳此驗證碼。\n若不是你本人操作，請忽略這則訊息。`,
              },
            ],
          }),
        });
        await sent.body?.cancel();
        if (!sent.ok) throw new Error("OTP delivery failed");
      } else
        await env.AUTH_EMAIL!.send({
          from: { email: env.AUTH_EMAIL_FROM!, name: "MetaBear" },
          to: email,
          subject: "MetaBear 登入驗證碼",
          text: `你的 MetaBear 登入驗證碼是：${code}\n\n請回到發起登入的瀏覽器輸入，10 分鐘內有效。\n若你沒有要求登入，請忽略這封信。\n\nMetaBear 客戶工作台`,
        });
      const ready = await env.DB.prepare(
        "UPDATE auth_challenges SET ready=1 WHERE id_hash=?",
      )
        .bind(idHash)
        .run();
      if (ready.meta.changes !== 1) throw new Error("Challenge invalidated");
    } catch {
      await env.DB.prepare("DELETE FROM auth_challenges WHERE id_hash=?")
        .bind(idHash)
        .run();
      throw new HttpError(503, "驗證碼暫時無法傳送，請稍後再試");
    }
    const previous = readCookie(request, CHALLENGE);
    if (previous)
      await env.DB.prepare("DELETE FROM auth_challenges WHERE id_hash=?")
        .bind(await hash(previous))
        .run();
    response.headers.append(
      "Set-Cookie",
      cookie(CHALLENGE, challenge, OTP_TTL),
    );
    return response;
  }
  const challenge = readCookie(request, CHALLENGE);
  if (!challenge) throw new HttpError(401, "請先在這個瀏覽器索取驗證碼");
  const idHash = await hash(challenge);
  // Atomic attempt reservation bounds concurrent guesses, including malformed input.
  const attempt = await env.DB.prepare(
    "UPDATE auth_challenges SET attempts=attempts+1 WHERE id_hash=? AND ready=1 AND expires_at>? AND attempts<5 RETURNING email",
  )
    .bind(idHash, now())
    .first<{ email: string }>();
  if (
    !attempt ||
    typeof body.code !== "string" ||
    !/^\d{6}$/.test(body.code) ||
    attempt.email !== env.ADMIN_EMAIL?.trim().toLowerCase()
  )
    throw new HttpError(401, "驗證碼錯誤、已過期或嘗試過多，請重新索取");
  const token = randomToken();
  const tokenHash = await hash(token);
  const codeHash = await hash(`${challenge}:${body.code}`);
  const time = now();
  // Both statements commit together. Only the first successful verification can
  // create a session; concurrent retries see the consumed challenge.
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO auth_sessions(token_hash,email,created_at,expires_at)
      SELECT ?,email,?,? FROM auth_challenges WHERE id_hash=? AND code_hash=? AND ready=1 AND expires_at>? AND attempts<=5`,
    ).bind(tokenHash, time, time + SESSION_TTL, idHash, codeHash, time),
    env.DB.prepare(
      "DELETE FROM auth_challenges WHERE id_hash=? AND code_hash=?",
    ).bind(idHash, codeHash),
  ]);
  if (results[0].meta.changes !== 1)
    throw new HttpError(401, "驗證碼錯誤或已使用，請重新確認");
  const previous = readCookie(request, SESSION);
  if (previous)
    await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash=?")
      .bind(await hash(previous))
      .run();
  const response = json({ ok: true });
  response.headers.append("Set-Cookie", cookie(SESSION, token, SESSION_TTL));
  response.headers.append("Set-Cookie", cookie(CHALLENGE, "", 0));
  return response;
}
