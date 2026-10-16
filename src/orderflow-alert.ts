// Order-flow alerts from the metabear-orderflow Worker (service binding BACKEND), pushed to the
// admin's LINE. The CRM backend holds the LINE token and the admin channel, so the collector only
// needs a shared secret: POST /api/internal/orderflow-alert, Authorization: Bearer
// ORDERFLOW_ALERT_TOKEN, body { text, key }.
import { HttpError, json, readJson } from "./http";

type AlertEnv = Env & { ORDERFLOW_ALERT_TOKEN?: string };

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function orderflowAlert(request: Request, env: AlertEnv): Promise<Response> {
  if (request.method !== "POST") throw new HttpError(405, "只接受 POST");
  const token = env.ORDERFLOW_ALERT_TOKEN;
  if (!token || !sameSecret(request.headers.get("authorization") ?? "", `Bearer ${token}`)) throw new HttpError(401, "未授權");
  const body = await readJson(request, 8_000);
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4_000) : "";
  const key = typeof body.key === "string" && /^[\w-]{1,64}$/.test(body.key) ? body.key : "";
  if (!text || !key) throw new HttpError(400, "缺少通知內容");
  if (env.LINE_DELIVERY_MODE !== "live") return json({ sent: false, reason: "delivery disabled" });
  const admin = await env.DB.prepare("SELECT line_user_id FROM auth_admin_channels WHERE email=?")
    .bind(env.ADMIN_EMAIL.trim().toLowerCase())
    .first<{ line_user_id: string }>();
  if (!admin) throw new HttpError(503, "管理員尚未綁定 LINE");
  // X-Line-Retry-Key needs a UUID; derive a stable one from the alert key so a retried
  // delivery of the same message is accepted once.
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`orderflow:${key}`)));
  const hex = [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const retryKey = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": retryKey,
    },
    body: JSON.stringify({ to: admin.line_user_id, messages: [{ type: "text", text }] }),
  });
  const accepted = response.ok || (response.status === 409 && response.headers.has("x-line-accepted-request-id"));
  await response.body?.cancel();
  if (!accepted) {
    console.error(JSON.stringify({ event: "orderflow_alert_failed", status: response.status }));
    throw new HttpError(502, "LINE 推播失敗");
  }
  return json({ sent: true });
}
