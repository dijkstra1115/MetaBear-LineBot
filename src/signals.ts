import { choice, HttpError, json, readJson, textField } from "./http";
import { recordOutgoing, setOutgoingStatus } from "./conversations";
import { audit, now } from "./db";
import { lineQuota } from "./campaigns";
import { rateLimit } from "./native-auth";
import { staffIdentity, type AdminIdentity } from "./auth";
import {
  analystEnabled,
  analystName,
  ensureOwnerStaff,
  signalCategories,
} from "./staff";
import type { LineMessage } from "./types";
import { command } from "./content";
import { getTeam } from "./team";

export type SignalMessage = { kind: "signal-delivery"; id: string };
type SignalRow = {
  id: string;
  analyst_email: string;
  category_id: string;
  direction: "long" | "short";
  leverage: string;
  entry: string;
  take_profit: string;
  stop_loss: string;
  note: string;
  image_id: string | null;
  status: string;
  result: string;
  result_note: string;
  result_at: string | null;
  audience_count: number;
  created_at: string;
  created_by: string;
};
type Delivery = {
  id: string;
  signal_id: string;
  line_user_id: string;
  status: string;
  first_attempt_at: string | null;
  attempts: number;
};
const MAX_AUDIENCE = 500;
const HOUR_LIMIT = 8;
const DAY_LIMIT = 24;
const IMAGE_MAX = 800_000;
const apiBase = "https://api.line.me/v2/bot/message";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function publicBase(env: Env): string {
  return env.PUBLIC_BASE_URL.replace(/\/$/, "");
}
function eligibleSql(categoryId: string) {
  return {
    sql: `SELECT c.line_user_id FROM customers c
      JOIN customer_signal_subs s ON s.line_user_id=c.line_user_id AND s.category_id=?
      WHERE c.stage='joined' AND c.blocked=0`,
    values: [categoryId] as unknown[],
  };
}
async function audienceRows(env: Env, categoryId: string) {
  const query = eligibleSql(categoryId);
  return (
    await env.DB.prepare(query.sql + " ORDER BY c.line_user_id LIMIT ?")
      .bind(...query.values, MAX_AUDIENCE + 1)
      .all<{ line_user_id: string }>()
  ).results;
}
export async function setSignalSubscription(
  db: D1Database,
  userId: string,
  categoryId: string,
  subscribed: boolean,
): Promise<string | null> {
  const category = await db
    .prepare("SELECT id,label FROM signal_categories WHERE id=? AND enabled=1")
    .bind(categoryId)
    .first<{ id: string; label: string }>();
  if (!category) return null;
  if (subscribed)
    await db
      .prepare(
        "INSERT OR IGNORE INTO customer_signal_subs(line_user_id,category_id,created_at) VALUES (?,?,?)",
      )
      .bind(userId, category.id, now())
      .run();
  else
    await db
      .prepare(
        "DELETE FROM customer_signal_subs WHERE line_user_id=? AND category_id=?",
      )
      .bind(userId, category.id)
      .run();
  return category.label;
}
export async function userSignalSubs(db: D1Database, userId: string) {
  const [categories, subs] = await Promise.all([
    signalCategories(db),
    db
      .prepare(
        "SELECT category_id FROM customer_signal_subs WHERE line_user_id=?",
      )
      .bind(userId)
      .all<{ category_id: string }>(),
  ]);
  const selected = new Set(subs.results.map((s) => s.category_id));
  return categories.map((c) => ({ ...c, subscribed: selected.has(c.id) }));
}
function parseLeverage(value: unknown): string {
  const raw = textField(value, 8);
  const match = /^(\d{1,3})\s*x$/i.exec(raw);
  if (!match) throw new HttpError(400, "槓桿請填 1x 到 125x");
  const n = Number(match[1]);
  if (n < 1 || n > 125) throw new HttpError(400, "槓桿請填 1x 到 125x");
  return `${n}x`;
}
function parseLevel(value: unknown, label: string): string {
  const text = textField(value, 40);
  if (!text || /[\n\r]/.test(text))
    throw new HttpError(400, `請填寫${label}，且不要換行`);
  return text;
}
function parseImage(
  value: unknown,
): { mime: string; bytes: Uint8Array } | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 1_100_000)
    throw new HttpError(400, "圖片格式不正確或太大");
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=\s]+)$/.exec(
    value,
  );
  if (!match) throw new HttpError(400, "圖片只接受 JPEG 或 PNG");
  let binary: string;
  try {
    binary = atob(match[2].replace(/\s/g, ""));
  } catch {
    throw new HttpError(400, "圖片資料不正確");
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (bytes.length < 32 || bytes.length > IMAGE_MAX)
    throw new HttpError(413, "圖片需小於 800 KB");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  if (
    (match[1] === "image/jpeg" && !jpeg) ||
    (match[1] === "image/png" && !png)
  )
    throw new HttpError(400, "圖片內容與格式不符");
  return { mime: match[1], bytes };
}
async function signalsEnabled(env: Env): Promise<boolean> {
  const team = await getTeam(env.DB);
  return team.signals_enabled !== 0;
}
async function signalSummary(env: Env, id: string, email?: string) {
  const signal = await env.DB.prepare(
    email
      ? "SELECT * FROM signals WHERE id=? AND analyst_email=?"
      : "SELECT * FROM signals WHERE id=?",
  )
    .bind(id, ...(email ? [email] : []))
    .first<SignalRow>();
  if (!signal) throw new HttpError(404, "找不到這則報單");
  const counts = await env.DB.prepare(
    "SELECT status,count(*) AS count FROM signal_deliveries WHERE signal_id=? GROUP BY status",
  )
    .bind(id)
    .all<{ status: string; count: number }>();
  const name = await analystName(env, signal.analyst_email);
  return {
    id: signal.id,
    categoryId: signal.category_id,
    direction: signal.direction,
    leverage: signal.leverage,
    entry: signal.entry,
    takeProfit: signal.take_profit,
    stopLoss: signal.stop_loss,
    note: signal.note,
    hasImage: Boolean(signal.image_id),
    imageUrl: signal.image_id
      ? `${publicBase(env)}/media/signals/${signal.image_id}`
      : null,
    status: signal.status,
    result: signal.result || "",
    resultNote: signal.result_note,
    resultAt: signal.result_at,
    audienceCount: signal.audience_count,
    createdAt: signal.created_at,
    analystName: name,
    counts: Object.fromEntries(counts.results.map((c) => [c.status, c.count])),
  };
}
function signalCard(
  env: Env,
  signal: SignalRow,
  name: string,
): Extract<LineMessage, { type: "flex" }> {
  const dir = signal.direction === "long" ? "做多" : "做空";
  const heading = `${signal.category_id} ${dir} ${signal.leverage}`;
  const imageUrl = signal.image_id
    ? `${publicBase(env)}/media/signals/${signal.image_id}`
    : "";
  const levels = `進場 ${signal.entry}\n止盈 ${signal.take_profit}\n止損 ${signal.stop_loss}`;
  return {
    type: "flex",
    altText: `報單 ${heading}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "分析師報單",
            wrap: true,
            size: "sm",
            color: "#666666",
          },
          {
            type: "text",
            text: heading,
            wrap: true,
            size: "lg",
            weight: "bold",
            margin: "md",
          },
          ...(imageUrl
            ? [
                {
                  type: "image" as const,
                  url: imageUrl,
                  size: "full" as const,
                  aspectMode: "fit" as const,
                  aspectRatio: "16:9",
                  action: command("報單通知"),
                  margin: "md" as const,
                },
              ]
            : []),
          {
            type: "text",
            text: levels,
            wrap: true,
            size: "md",
            margin: "md",
          },
          ...(signal.note
            ? [
                {
                  type: "text" as const,
                  text: signal.note,
                  wrap: true as const,
                  size: "sm",
                  margin: "md" as const,
                },
              ]
            : []),
          {
            type: "text",
            text: `分析師：${name}`,
            wrap: true,
            size: "sm",
            color: "#666666",
            margin: "md",
          },
          {
            type: "text",
            text: "此內容為分析師觀點，非投資建議，請自行判斷風險。不是即時委託，也不保證成交。",
            wrap: true,
            size: "xs",
            color: "#888888",
            margin: "md",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            action: command("報單通知"),
            style: "primary",
            height: "sm",
          },
          {
            type: "button",
            action: command("選單"),
            style: "link",
            height: "sm",
          },
        ],
      },
    },
  };
}
async function createSignal(
  env: Env,
  identity: AdminIdentity,
  data: Record<string, unknown>,
) {
  if (!(await signalsEnabled(env)))
    throw new HttpError(409, "報單發送已暫停，請聯絡管理員");
  if (
    identity.role !== "admin" &&
    !(await analystEnabled(env, identity.email))
  )
    throw new HttpError(403, "這個分析師帳號已停用");
  const categories = await signalCategories(env.DB);
  const categoryId = choice(
    data.categoryId,
    categories.map((c) => c.id),
  );
  const direction = choice(data.direction, ["long", "short"] as const);
  const leverage = parseLeverage(data.leverage);
  const entry = parseLevel(data.entry, "進場");
  const takeProfit = parseLevel(data.takeProfit, "止盈");
  const stopLoss = parseLevel(data.stopLoss, "止損");
  const note = textField(data.note, 80);
  if (/[\n\r]/.test(note)) throw new HttpError(400, "備註請寫在同一行");
  const image = parseImage(data.image);
  if (image && !/^https:\/\//.test(env.PUBLIC_BASE_URL))
    throw new HttpError(400, "目前環境無法附加報單圖片");
  if (typeof data.confirmCount !== "number" || data.confirmCount < 1)
    throw new HttpError(400, "請先確認訂閱人數後再送出");
  await rateLimit(
    env.DB,
    "signal-hour:" + identity.email,
    HOUR_LIMIT,
    3600,
    "這小時的報單次數已用完，請稍後再試",
  );
  await rateLimit(
    env.DB,
    "signal-day:" + identity.email,
    DAY_LIMIT,
    86400,
    "今天的報單次數已用完，請明天再試",
  );
  const rows = await audienceRows(env, categoryId);
  if (!rows.length)
    throw new HttpError(400, "目前沒有已入群且訂閱此品項的用戶");
  if (rows.length > MAX_AUDIENCE)
    throw new HttpError(400, "每次最多 500 位，請先縮小訂閱範圍");
  if (data.confirmCount !== rows.length)
    throw new HttpError(400, "訂閱人數已變化，請重新確認後再送出");
  if (env.LINE_DELIVERY_MODE !== "live")
    throw new HttpError(409, "本機不會發送 LINE 訊息");
  const quota = await lineQuota(env);
  const reserved = await env.DB.prepare(
    `SELECT
      (SELECT count(*) FROM campaign_deliveries d JOIN campaign_runs r ON r.id=d.run_id WHERE r.status='queued' AND d.status IN ('pending','sending'))
      + (SELECT count(*) FROM signal_deliveries d JOIN signals s ON s.id=d.signal_id WHERE s.status='queued' AND d.status IN ('pending','sending'))
      AS n`,
  ).first<{ n: number }>();
  if (
    quota.remaining !== null &&
    quota.remaining - (reserved?.n ?? 0) < rows.length
  )
    throw new HttpError(409, "LINE 本月可用額度不足，請稍後再試或聯絡管理員");
  const id = crypto.randomUUID();
  const imageId = image ? crypto.randomUUID() : null;
  const created = now();
  await env.DB.batch([
    ...(image && imageId
      ? [
          env.DB.prepare(
            "INSERT INTO signal_images(id,mime,bytes,created_at) VALUES (?,?,?,?)",
          ).bind(imageId, image.mime, image.bytes, created),
        ]
      : []),
    env.DB.prepare(
      `INSERT INTO signals(id,analyst_email,category_id,direction,leverage,entry,take_profit,stop_loss,note,image_id,audience_count,created_at,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id,
      identity.email,
      categoryId,
      direction,
      leverage,
      entry,
      takeProfit,
      stopLoss,
      note,
      imageId,
      rows.length,
      created,
      identity.email,
    ),
    ...rows.map((c) =>
      env.DB.prepare(
        "INSERT INTO signal_deliveries(id,signal_id,line_user_id) VALUES (?,?,?)",
      ).bind(crypto.randomUUID(), id, c.line_user_id),
    ),
  ]);
  await audit(env.DB, null, "signal.create", {
    id,
    categoryId,
    audienceCount: rows.length,
    analyst: identity.email,
  });
  try {
    await dispatchSignals(env, id);
  } catch {
    console.error(JSON.stringify({ event: "signal.enqueue.deferred", id }));
  }
  return signalSummary(
    env,
    id,
    identity.role === "analyst" ? identity.email : undefined,
  );
}
export async function dispatchSignals(env: Env, signalId?: string) {
  const rows = await env.DB.prepare(
    `SELECT d.id FROM signal_deliveries d JOIN signals s ON s.id=d.signal_id
     WHERE s.status='queued' AND (d.status='pending' OR (d.status='sending' AND d.lease_until<?))
     ${signalId ? "AND s.id=?" : ""} ORDER BY s.created_at,d.id LIMIT 500`,
  )
    .bind(now(), ...(signalId ? [signalId] : []))
    .all<{ id: string }>();
  for (let i = 0; i < rows.results.length; i += 100)
    await env.CAMPAIGN_EVENTS.sendBatch(
      rows.results.slice(i, i + 100).map((r) => ({
        body: { kind: "signal-delivery" as const, id: r.id },
      })),
    );
  await env.DB.prepare(
    `UPDATE signals SET status=CASE
      WHEN (SELECT signals_enabled FROM team_settings WHERE id=1)=0 THEN 'halted'
      WHEN EXISTS (SELECT 1 FROM staff st WHERE st.email=signals.analyst_email AND st.enabled=0) THEN 'halted'
      ELSE 'completed' END
     WHERE status='queued' AND NOT EXISTS (
       SELECT 1 FROM signal_deliveries d WHERE d.signal_id=signals.id AND d.status IN ('pending','sending')
     )`,
  ).run();
}
export async function processSignal(message: SignalMessage, env: Env) {
  const delivery = await env.DB.prepare(
    "SELECT * FROM signal_deliveries WHERE id=?",
  )
    .bind(message.id)
    .first<Delivery>();
  if (!delivery || !["pending", "sending"].includes(delivery.status)) return;
  const signal = await env.DB.prepare("SELECT * FROM signals WHERE id=?")
    .bind(delivery.signal_id)
    .first<SignalRow>();
  if (!signal || signal.status !== "queued") return;
  const claimed = await env.DB.prepare(
    "UPDATE signal_deliveries SET status='sending',lease_until=?,first_attempt_at=COALESCE(first_attempt_at,?),attempts=attempts+1 WHERE id=? AND (status='pending' OR (status='sending' AND lease_until<?))",
  )
    .bind(new Date(Date.now() + 60000).toISOString(), now(), delivery.id, now())
    .run();
  if (!claimed.meta.changes) return;
  const finish = async (status: string, detail: string) => {
    await setOutgoingStatus(
      env,
      "signal:" + delivery.id,
      status === "skipped" ? "not_sent" : status,
    );
    await env.DB.prepare(
      "UPDATE signal_deliveries SET status=?,detail=?,finished_at=?,lease_until=NULL WHERE id=?",
    )
      .bind(status, detail, now(), delivery.id)
      .run();
    await env.DB.prepare(
      `UPDATE signals SET status=CASE
        WHEN (SELECT signals_enabled FROM team_settings WHERE id=1)=0 THEN 'halted'
        WHEN EXISTS (SELECT 1 FROM staff st WHERE st.email=signals.analyst_email AND st.enabled=0) THEN 'halted'
        ELSE 'completed' END
       WHERE id=? AND NOT EXISTS (
         SELECT 1 FROM signal_deliveries WHERE signal_id=? AND status IN ('pending','sending')
       )`,
    )
      .bind(signal.id, signal.id)
      .run();
  };
  try {
    if (env.LINE_DELIVERY_MODE !== "live") {
      await finish("skipped", "發送模式已關閉");
      return;
    }
    if (!(await signalsEnabled(env))) {
      await finish("skipped", "報單發送已急停");
      return;
    }
    if (!(await analystEnabled(env, signal.analyst_email))) {
      await finish("skipped", "分析師帳號已停用");
      return;
    }
    if (
      Date.now() - Date.parse(delivery.first_attempt_at ?? signal.created_at) >
        23 * 60 * 60 * 1000 ||
      delivery.attempts >= 8
    ) {
      await finish("failed", "重試期限或次數已達上限；請核對 LINE 紀錄");
      return;
    }
    const query = eligibleSql(signal.category_id);
    const eligible = await env.DB.prepare(query.sql + " AND c.line_user_id=?")
      .bind(...query.values, delivery.line_user_id)
      .first();
    if (!eligible) {
      await finish("skipped", "已退訂、封鎖或不再符合入群條件");
      return;
    }
    const name = await analystName(env, signal.analyst_email);
    const messages = [signalCard(env, signal, name)];
    await recordOutgoing(env, delivery.line_user_id, "signal:" + delivery.id, [
      messages[0],
    ]);
    const response = await fetch(apiBase + "/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": delivery.id,
      },
      body: JSON.stringify({
        to: delivery.line_user_id,
        messages,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (
      response.ok ||
      (response.status === 409 &&
        response.headers.has("x-line-accepted-request-id"))
    ) {
      await finish("accepted", "LINE 已接受，未提供個別送達或已讀保證");
      return;
    }
    if (response.status >= 500) throw new Error("LineUnavailable");
    await finish(
      "failed",
      `LINE 拒絕請求（HTTP ${response.status}），請核對帳戶額度或設定`,
    );
  } catch (error) {
    await setOutgoingStatus(env, "signal:" + delivery.id, "unconfirmed");
    await env.DB.prepare(
      "UPDATE signal_deliveries SET status='pending',lease_until=NULL WHERE id=? AND status='sending'",
    )
      .bind(delivery.id)
      .run();
    throw error;
  }
}
async function listSignals(env: Env, email?: string) {
  const rows = await env.DB.prepare(
    email
      ? "SELECT id FROM signals WHERE analyst_email=? ORDER BY created_at DESC LIMIT 40"
      : "SELECT id FROM signals ORDER BY created_at DESC LIMIT 40",
  )
    .bind(...(email ? [email] : []))
    .all<{ id: string }>();
  return Promise.all(rows.results.map((r) => signalSummary(env, r.id, email)));
}
export async function deskApi(request: Request, env: Env): Promise<Response> {
  const identity = await staffIdentity(request, env);
  await ensureOwnerStaff(env);
  const url = new URL(request.url);
  const path = url.pathname;
  const own = identity.role === "analyst" ? identity.email : undefined;
  if (path === "/api/desk/config" && request.method === "GET") {
    const [enabled, analyst, categories, hour, day, stats] = await Promise.all([
      signalsEnabled(env),
      analystEnabled(env, identity.email).then(
        (ok) => identity.role === "admin" || ok,
      ),
      signalCategories(env.DB),
      env.DB.prepare(
        "SELECT count AS used,reset_at FROM auth_rate_limits WHERE bucket=?",
      )
        .bind("signal-hour:" + identity.email)
        .first<{ used: number; reset_at: number }>(),
      env.DB.prepare(
        "SELECT count AS used,reset_at FROM auth_rate_limits WHERE bucket=?",
      )
        .bind("signal-day:" + identity.email)
        .first<{ used: number; reset_at: number }>(),
      env.DB.prepare(
        `SELECT count(*) AS sent,
          sum(CASE WHEN result='tp' THEN 1 ELSE 0 END) AS tp,
          sum(CASE WHEN result='sl' THEN 1 ELSE 0 END) AS sl,
          sum(CASE WHEN result='expired' THEN 1 ELSE 0 END) AS expired
         FROM signals WHERE analyst_email=?`,
      )
        .bind(identity.email)
        .first(),
    ]);
    const time = Math.floor(Date.now() / 1000);
    return json({
      identity: {
        email: identity.email,
        role: identity.role,
        name: await analystName(env, identity.email),
        mode: identity.mode,
      },
      enabled: enabled && analyst,
      signalsEnabled: enabled,
      analystEnabled: analyst,
      categories,
      limits: {
        hour: HOUR_LIMIT,
        day: DAY_LIMIT,
        hourUsed: hour && hour.reset_at > time ? hour.used : 0,
        dayUsed: day && day.reset_at > time ? day.used : 0,
      },
      stats: stats ?? { sent: 0, tp: 0, sl: 0, expired: 0 },
    });
  }
  if (path === "/api/desk/preview" && request.method === "GET") {
    const categories = await signalCategories(env.DB);
    const categoryId = choice(
      url.searchParams.get("category") || "",
      categories.map((c) => c.id),
    );
    const rows = await audienceRows(env, categoryId);
    if (rows.length > MAX_AUDIENCE)
      throw new HttpError(400, "每次最多 500 位，請先縮小訂閱範圍");
    return json({ categoryId, count: rows.length });
  }
  if (path === "/api/desk/signals" && request.method === "GET")
    return json({ signals: await listSignals(env, own || identity.email) });
  if (path === "/api/desk/signals" && request.method === "POST") {
    const data = await readJson(request, 1_200_000);
    return json(await createSignal(env, identity, data), 202);
  }
  const match = path.match(/^\/api\/desk\/signals\/([a-f0-9-]{36})$/);
  if (!match || request.method !== "PATCH")
    throw new HttpError(404, "找不到此功能");
  const data = await readJson(request);
  const result = choice(data.result, [
    "tp",
    "sl",
    "expired",
    "closed",
  ] as const);
  const resultNote = textField(data.note, 80);
  const changed = await env.DB.prepare(
    own
      ? "UPDATE signals SET result=?,result_note=?,result_at=? WHERE id=? AND analyst_email=?"
      : "UPDATE signals SET result=?,result_note=?,result_at=? WHERE id=?",
  )
    .bind(result, resultNote, now(), match[1], ...(own ? [own] : []))
    .run();
  if (!changed.meta.changes) throw new HttpError(404, "找不到這則報單");
  return json(await signalSummary(env, match[1], own));
}
export async function adminSignalsApi(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/signals" && request.method === "GET")
    return json({
      enabled: await signalsEnabled(env),
      signals: await listSignals(env),
    });
  if (url.pathname === "/api/signals/settings" && request.method === "POST") {
    const data = await readJson(request);
    if (typeof data.enabled !== "boolean")
      throw new HttpError(400, "請指定是否開放報單發送");
    await env.DB.prepare(
      "UPDATE team_settings SET signals_enabled=? WHERE id=1",
    )
      .bind(data.enabled ? 1 : 0)
      .run();
    return json({ enabled: data.enabled });
  }
  return null;
}
export async function signalMedia(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!["GET", "HEAD"].includes(request.method))
    throw new HttpError(405, "Method not allowed");
  const match = new URL(request.url).pathname.match(
    /^\/media\/signals\/([0-9a-f-]{36})$/i,
  );
  if (!match || !uuid.test(match[1])) throw new HttpError(404, "找不到圖片");
  const row = await env.DB.prepare(
    "SELECT mime,bytes FROM signal_images WHERE id=?",
  )
    .bind(match[1].toLowerCase())
    .first<{ mime: string; bytes: ArrayBuffer }>();
  if (!row) throw new HttpError(404, "找不到圖片");
  return new Response(request.method === "HEAD" ? null : row.bytes, {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
