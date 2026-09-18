import { HttpError, json, readJson, textField } from "./http";
import { now } from "./db";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function ownerEmail(env: Env): string {
  return env.ADMIN_EMAIL.trim().toLowerCase();
}
export function normalizeEmail(value: unknown): string {
  const email = textField(value, 254).toLowerCase();
  if (!email || !emailPattern.test(email))
    throw new HttpError(400, "請輸入有效的 Email");
  return email;
}
export async function ensureOwnerStaff(env: Env): Promise<void> {
  const email = ownerEmail(env);
  if (!email) return;
  await env.DB.prepare(
    `INSERT INTO staff(email,name,created_by) VALUES (?,?,?)
     ON CONFLICT(email) DO NOTHING`,
  )
    .bind(email, "管理員", email)
    .run();
}
export async function analystEnabled(
  env: Env,
  email: string,
): Promise<boolean> {
  if (email === "local-preview" || email === ownerEmail(env))
    return true;
  const row = await env.DB.prepare("SELECT enabled FROM staff WHERE email=?")
    .bind(email)
    .first<{ enabled: number }>();
  return row?.enabled === 1;
}
export async function analystName(env: Env, email: string): Promise<string> {
  if (email === "local-preview" || email === ownerEmail(env))
    return "管理員";
  const row = await env.DB.prepare("SELECT name FROM staff WHERE email=?")
    .bind(email)
    .first<{ name: string }>();
  return row?.name || "分析師";
}
export async function signalCategories(db: D1Database) {
  return (
    await db
      .prepare(
        "SELECT id,label FROM signal_categories WHERE enabled=1 ORDER BY sort_order,id",
      )
      .all<{ id: string; label: string }>()
  ).results;
}
export async function staffApi(
  request: Request,
  env: Env,
  actor: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  await ensureOwnerStaff(env);
  if (url.pathname === "/api/staff" && request.method === "GET") {
    const owner = ownerEmail(env);
    const rows = await env.DB.prepare(
      `SELECT s.email,s.name,s.role,s.enabled,s.created_at,
        c.line_user_id IS NOT NULL AS bound,
        (SELECT count(*) FROM signals g WHERE g.analyst_email=s.email) AS signals
       FROM staff s
       LEFT JOIN auth_admin_channels c ON c.email=s.email
       ORDER BY s.email=? DESC, s.created_at`,
    )
      .bind(owner)
      .all<{
        email: string;
        name: string;
        role: string;
        enabled: number;
        created_at: string;
        bound: number;
        signals: number;
      }>();
    return json({
      staff: rows.results.map((row) => ({
        ...row,
        bound: !!row.bound,
        owner: row.email === owner,
      })),
    });
  }
  if (url.pathname === "/api/staff" && request.method === "POST") {
    const data = await readJson(request);
    const email = normalizeEmail(data.email);
    const name = textField(data.name, 40);
    if (!name) throw new HttpError(400, "請填寫分析師名稱");
    if (email === ownerEmail(env))
      throw new HttpError(400, "管理員帳號已由系統設定，不需加入分析師名單");
    try {
      await env.DB.prepare(
        "INSERT INTO staff(email,name,created_by) VALUES (?,?,?)",
      )
        .bind(email, name, actor)
        .run();
    } catch (error) {
      if (String(error).includes("UNIQUE constraint"))
        throw new HttpError(409, "這組 Email 已在分析師名單中");
      throw error;
    }
    return json({ email, name, enabled: 1 }, 201);
  }
  const match = url.pathname.match(
    /^\/api\/staff\/([^/]+)(?:\/(line-enrollment))?$/,
  );
  if (!match) return null;
  const email = normalizeEmail(decodeURIComponent(match[1]));
  const staff = await env.DB.prepare("SELECT * FROM staff WHERE email=?")
    .bind(email)
    .first<{ email: string; name: string; enabled: number }>();
  if (!staff) throw new HttpError(404, "找不到這位分析師");
  if (match[2] === "line-enrollment") {
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed");
    if (env.AUTH_CHANNEL !== "line")
      throw new HttpError(403, "目前無法設定此登入方式");
    if (env.LINE_DELIVERY_MODE !== "live" || !env.LINE_CHANNEL_ACCESS_TOKEN)
      throw new HttpError(503, "請先設定 LINE 官方帳號");
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const expires = Math.floor(Date.now() / 1000) + 600;
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    await env.DB.prepare(
      `INSERT INTO auth_line_enrollments(email,token_hash,expires_at) VALUES (?,?,?)
      ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at`,
    )
      .bind(email, digest, expires)
      .run();
    return json({ email, command: `綁定後台 ${token}`, expiresAt: expires });
  }
  if (request.method !== "PATCH") return null;
  if (email === ownerEmail(env))
    throw new HttpError(400, "管理員帳號不能停用");
  const data = await readJson(request);
  if (typeof data.enabled !== "boolean")
    throw new HttpError(400, "請指定是否啟用");
  const next = data.enabled ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare("UPDATE staff SET enabled=? WHERE email=?").bind(
      next,
      email,
    ),
    ...(next
      ? []
      : [
          env.DB.prepare("DELETE FROM auth_sessions WHERE email=?").bind(email),
          env.DB.prepare("DELETE FROM auth_challenges WHERE email=?").bind(
            email,
          ),
        ]),
  ]);
  return json({ email, enabled: next, updatedAt: now() });
}
