import { now } from "./db";

export async function prefetchDisplayName(env: Env, userId: string) {
  if (
    !env.DB ||
    env.LINE_DELIVERY_MODE !== "live" ||
    !env.LINE_CHANNEL_ACCESS_TOKEN
  )
    return;
  try {
    const customer = await env.DB.prepare(
      "SELECT display_name_manual FROM customers WHERE line_user_id=?",
    )
      .bind(userId)
      .first<{ display_name_manual: number }>();
    if (!customer || customer.display_name_manual) return;
    const response = await fetch(
      "https://api.line.me/v2/bot/profile/" + encodeURIComponent(userId),
      {
        headers: {
          Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      return;
    }
    const body = (await response.json()) as { displayName?: unknown };
    if (typeof body.displayName !== "string") return;
    const name = body.displayName.trim().slice(0, 80);
    if (!name) return;
    await env.DB.prepare(
      "UPDATE customers SET display_name=?, updated_at=? WHERE line_user_id=? AND display_name_manual=0",
    )
      .bind(name, now(), userId)
      .run();
  } catch {
    /* Optional; never fail the webhook. */
  }
}
