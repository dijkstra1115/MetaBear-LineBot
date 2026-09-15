import { audit } from "./db";

export type MenuInstallMessage = { kind: "line-menu-install"; id: string };
const menuName = "MetaBear service menu 2026-09-15-v2";
export function richMenuDefinition(_base: string) {
  const actions = [
    {
      type: "postback",
      data: "text=" + encodeURIComponent("提交 UID"),
      displayText: "我要登記 UID",
    },
    {
      type: "postback",
      data: "text=" + encodeURIComponent("我的進度"),
      displayText: "查詢我的審核進度",
    },
    {
      type: "postback",
      data: "text=" + encodeURIComponent("開始註冊"),
      displayText: "新手教學",
    },
    {
      type: "postback",
      data: "text=" + encodeURIComponent("入金教學"),
      displayText: "入金教學",
    },
    {
      type: "postback",
      data: "text=" + encodeURIComponent("合約基礎"),
      displayText: "合約學習",
    },
    {
      type: "postback",
      data: "text=" + encodeURIComponent("人工協助"),
      displayText: "我需要人工協助",
    },
  ];
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: menuName,
    chatBarText: "教學・審核・客服",
    areas: actions.map((action, i) => ({
      bounds: {
        x: [0, 833, 1667][i % 3],
        y: i < 3 ? 0 : 843,
        width: [833, 834, 833][i % 3],
        height: 843,
      },
      action,
    })),
  };
}
async function lineJson(
  env: Env,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch("https://api.line.me/v2/bot/" + path, {
    method,
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404 && method === "GET") {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`LINE menu HTTP ${response.status}`);
  }
  return (await response.json()) as any;
}
// Invoked only through the account's trusted Cloudflare queue; never by chat input.
export async function installRichMenu(message: MenuInstallMessage, env: Env) {
  try { await install(message,env); }
  catch(error){await audit(env.DB,null,'line.menu.failed',{operationId:message.id,error:error instanceof Error?error.message.slice(0,120):'Menu operation failed'});throw error;}
}
async function install(message: MenuInstallMessage, env: Env) {
  if (env.LINE_DELIVERY_MODE !== "live" || !env.LINE_CHANNEL_ACCESS_TOKEN)
    throw new Error("LINE is not configured");
  if (
    await env.DB.prepare(
      "SELECT id FROM audit_log WHERE action='line.menu.installed' AND json_extract(detail,'$.operationId')=?",
    )
      .bind(message.id)
      .first()
  )
    return;
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  if (!base.startsWith("https://")) throw new Error("Public URL is required");
  const definition = richMenuDefinition(base);
  await lineJson(env, "richmenu/validate", "POST", definition);
  const current = await lineJson(env, "user/all/richmenu");
  const list = await lineJson(env, "richmenu/list");
  let menuId = list.richmenus.find((m: any) => m.name === menuName)?.richMenuId;
  if (!menuId)
    menuId = (await lineJson(env, "richmenu", "POST", definition)).richMenuId;
  const imageUrl = `https://api-data.line.me/v2/bot/richmenu/${menuId}/content`;
  const headers = { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` };
  const existing = await fetch(imageUrl, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  const hasImage = existing.ok;
  await existing.body?.cancel();
  if (!hasImage) {
    if (existing.status !== 404)
      throw new Error(`LINE menu image HTTP ${existing.status}`);
    const image = await env.ASSETS.fetch(
      new Request(base + "/line-rich-menu.png"),
    );
    if (!image.ok || !image.headers.get("Content-Type")?.includes("image/png"))
      throw new Error("Menu image missing");
    const bytes = await image.arrayBuffer();
    if (bytes.byteLength > 1000000) throw new Error("Menu image too large");
    const upload = await fetch(imageUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "image/png" },
      body: bytes,
      signal: AbortSignal.timeout(15000),
    });
    await upload.body?.cancel();
    if (!upload.ok) throw new Error(`LINE menu upload HTTP ${upload.status}`);
  }
  await lineJson(env, "user/all/richmenu/" + menuId, "POST");
  // Existing per-user menus override the default; replace them for known CRM users.
  const users = await env.DB.prepare(
    "SELECT line_user_id FROM customers WHERE blocked=0 LIMIT 100",
  ).all<{ line_user_id: string }>();
  const overrides = [];
  for (const user of users.results) {
    const old = await lineJson(env, "user/" + user.line_user_id + "/richmenu");
    if (old?.richMenuId && old.richMenuId !== menuId) {
      await lineJson(
        env,
        "user/" + user.line_user_id + "/richmenu/" + menuId,
        "POST",
      );
      overrides.push({ userId: user.line_user_id, previous: old.richMenuId });
    }
  }
  const verified = await lineJson(env, "user/all/richmenu");
  if (verified?.richMenuId !== menuId)
    throw new Error("Menu verification failed");
  const bot = await lineJson(env, "info");
  await audit(env.DB, null, "line.menu.installed", {
    operationId: message.id,
    menuId,
    previous: current?.richMenuId ?? null,
    overrides,
    basicId: bot.basicId,
    displayName: bot.displayName,
  });
}
