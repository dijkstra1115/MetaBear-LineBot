import { HttpError, json, readJson, textField } from "./http";
import { recordOutgoing, setOutgoingStatus } from "./conversations";
import { now } from "./db";
import { audienceQuery } from "./audience";

export type CampaignMessage = { kind: "campaign-delivery"; id: string };
type Run = {
  id: string;
  draft_id: string;
  title: string;
  body: string;
  filters_json: string;
  audience_count: number;
  status: string;
  expires_at: string;
  confirmed_at: string | null;
};
type Delivery = {
  id: string;
  run_id: string;
  line_user_id: string;
  status: string;
  first_attempt_at: string | null;
  attempts: number;
};
const MAX_AUDIENCE = 500;
const apiBase = "https://api.line.me/v2/bot/message";
async function lineQuota(env: Env) {
  if (env.LINE_DELIVERY_MODE !== "live")
    return { remaining: 0, used: 0, limit: 0, disabled: true };
  const headers = { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` };
  const responses = await Promise.all([
    fetch(apiBase + "/quota", { headers, signal: AbortSignal.timeout(8000) }),
    fetch(apiBase + "/quota/consumption", {
      headers,
      signal: AbortSignal.timeout(8000),
    }),
  ]);
  if (responses.some((r) => !r.ok))
    throw new HttpError(503, "無法確認 LINE 本月訊息額度，請稍後重新預覽");
  const [quota, usage] = (await Promise.all(
    responses.map((r) => r.json()),
  )) as [{ type: string; value?: number }, { totalUsage: number }];
  if (
    !Number.isFinite(usage.totalUsage) ||
    !["none", "limited"].includes(quota.type) ||
    (quota.type === "limited" && !Number.isFinite(quota.value))
  )
    throw new HttpError(503, "LINE 額度回應不完整");
  return {
    remaining:
      quota.type === "none"
        ? null
        : Math.max(0, quota.value! - usage.totalUsage),
    used: usage.totalUsage,
    limit: quota.type === "none" ? null : quota.value,
    disabled: false,
  };
}
async function runSummary(env: Env, id: string) {
  const run = await env.DB.prepare("SELECT * FROM campaign_runs WHERE id=?")
    .bind(id)
    .first<Run>();
  if (!run) throw new HttpError(404, "找不到這次推播");
  const counts = await env.DB.prepare(
    "SELECT status,count(*) AS count FROM campaign_deliveries WHERE run_id=? GROUP BY status",
  )
    .bind(id)
    .all<{ status: string; count: number }>();
  return {
    ...run,
    counts: Object.fromEntries(counts.results.map((c) => [c.status, c.count])),
  };
}
export async function campaignApi(
  request: Request,
  env: Env,
  email: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/campaign-runs" && request.method === "GET") {
    const runs = await env.DB.prepare(
      "SELECT id FROM campaign_runs WHERE status<>'preview' ORDER BY confirmed_at DESC LIMIT 30",
    ).all<{ id: string }>();
    return json(
      await Promise.all(runs.results.map((r) => runSummary(env, r.id))),
    );
  }
  const match = url.pathname.match(
    /^\/api\/campaigns\/([a-f0-9-]{36})\/(preview|send)$/,
  );
  if (!match || request.method !== "POST") return null;
  const draft = await env.DB.prepare("SELECT * FROM campaign_drafts WHERE id=?")
    .bind(match[1])
    .first<{ id: string; title: string; body: string; filters_json: string }>();
  if (!draft) throw new HttpError(404, "找不到草稿");
  if (match[2] === "preview") {
    const query = audienceQuery(
      new URLSearchParams(JSON.parse(draft.filters_json)),
      true,
    );
    const rows = await env.DB.prepare(
      query.sql + " ORDER BY c.line_user_id LIMIT ?",
    )
      .bind(...query.values, MAX_AUDIENCE + 1)
      .all<{ line_user_id: string; display_name: string }>();
    if (!rows.results.length)
      throw new HttpError(400, "目前沒有已訂閱且符合條件的受眾");
    if (rows.results.length > MAX_AUDIENCE)
      throw new HttpError(400, "每次最多 500 位，請縮小交易量或偏好範圍");
    const quota = await lineQuota(env);
    const id = crypto.randomUUID();
    // Freeze resolved month, content and recipients. A later month boundary cannot broaden a send.
    const filters = JSON.stringify({
      ...JSON.parse(draft.filters_json),
      month: query.month,
    });
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO campaign_runs(id,draft_id,title,body,filters_json,audience_count,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)",
      ).bind(
        id,
        draft.id,
        draft.title,
        draft.body,
        filters,
        rows.results.length,
        email,
        now(),
        expires,
      ),
      ...rows.results.map((c) =>
        env.DB.prepare(
          "INSERT INTO campaign_deliveries(id,run_id,line_user_id,display_name) VALUES (?,?,?,?)",
        ).bind(crypto.randomUUID(), id, c.line_user_id, c.display_name),
      ),
    ]);
    return json(
      { run: await runSummary(env, id), recipients: rows.results, quota },
      201,
    );
  }
  const body = await readJson(request);
  const id = textField(body.runId, 36);
  const run = await env.DB.prepare(
    "SELECT * FROM campaign_runs WHERE id=? AND draft_id=?",
  )
    .bind(id, draft.id)
    .first<Run>();
  if (!run) throw new HttpError(404, "請先產生訊息預覽");
  if (body.confirmCount !== run.audience_count)
    throw new HttpError(400, "確認人數與預覽不一致");
  if (run.status !== "preview") return json(await runSummary(env, id));
  if (Date.parse(run.expires_at) <= Date.now())
    throw new HttpError(409, "預覽已超過 10 分鐘，請重新預覽");
  if (env.LINE_DELIVERY_MODE !== "live")
    throw new HttpError(409, "本機不會發送 LINE 訊息");
  const quota = await lineQuota(env);
  const reserved = await env.DB.prepare(
    "SELECT count(*) AS n FROM campaign_deliveries d JOIN campaign_runs r ON r.id=d.run_id WHERE r.status='queued' AND d.status IN ('pending','sending')",
  ).first<{ n: number }>();
  if (
    quota.remaining !== null &&
    quota.remaining - (reserved?.n ?? 0) < run.audience_count
  )
    throw new HttpError(409, "LINE 本月可用額度不足，請先調整受眾或帳戶額度");
  const changed = await env.DB.prepare(
    "UPDATE campaign_runs SET status='queued',confirmed_at=? WHERE id=? AND status='preview' AND expires_at>?",
  )
    .bind(now(), id, now())
    .run();
  if (!changed.meta.changes) {
    const latest = await runSummary(env, id);
    if (latest.status === "preview")
      throw new HttpError(409, "預覽已過期，請重新預覽");
    return json(latest);
  }
  // Durable outbox is committed before queue submission. Scheduled reconciliation resumes an interrupted submission.
  try {
    await dispatchCampaigns(env, id);
  } catch {
    console.error(
      JSON.stringify({ event: "campaign.enqueue.deferred", runId: id }),
    );
  }
  return json(await runSummary(env, id), 202);
}
export async function dispatchCampaigns(env: Env, runId?: string) {
  const rows = await env.DB.prepare(
    `SELECT d.id FROM campaign_deliveries d JOIN campaign_runs r ON r.id=d.run_id WHERE r.status='queued' AND (d.status='pending' OR (d.status='sending' AND d.lease_until<?)) ${runId ? "AND r.id=?" : ""} ORDER BY r.confirmed_at,d.id LIMIT 500`,
  )
    .bind(now(), ...(runId ? [runId] : []))
    .all<{ id: string }>();
  for (let i = 0; i < rows.results.length; i += 100)
    await env.CAMPAIGN_EVENTS.sendBatch(
      rows.results.slice(i, i + 100).map((r) => ({
        body: { kind: "campaign-delivery" as const, id: r.id },
      })),
    );
  await env.DB.prepare(
    "UPDATE campaign_runs SET status='completed' WHERE status='queued' AND NOT EXISTS (SELECT 1 FROM campaign_deliveries d WHERE d.run_id=campaign_runs.id AND d.status IN ('pending','sending'))",
  ).run();
}
export async function processCampaign(message: CampaignMessage, env: Env) {
  const delivery = await env.DB.prepare(
    "SELECT * FROM campaign_deliveries WHERE id=?",
  )
    .bind(message.id)
    .first<Delivery>();
  if (!delivery || !["pending", "sending"].includes(delivery.status)) return;
  const run = await env.DB.prepare("SELECT * FROM campaign_runs WHERE id=?")
    .bind(delivery.run_id)
    .first<Run>();
  if (!run || run.status !== "queued") return;
  const claimed = await env.DB.prepare(
    "UPDATE campaign_deliveries SET status='sending',lease_until=?,first_attempt_at=COALESCE(first_attempt_at,?),attempts=attempts+1 WHERE id=? AND (status='pending' OR (status='sending' AND lease_until<?))",
  )
    .bind(new Date(Date.now() + 60000).toISOString(), now(), delivery.id, now())
    .run();
  if (!claimed.meta.changes) return;
  const finish = async (status: string, detail: string) => {
    await setOutgoingStatus(
      env,
      "campaign:" + delivery.id,
      status === "skipped" ? "not_sent" : status,
    );
    await env.DB.prepare(
      "UPDATE campaign_deliveries SET status=?,detail=?,finished_at=?,lease_until=NULL WHERE id=?",
    )
      .bind(status, detail, now(), delivery.id)
      .run();
    await env.DB.prepare(
      "UPDATE campaign_runs SET status='completed' WHERE id=? AND NOT EXISTS (SELECT 1 FROM campaign_deliveries WHERE run_id=? AND status IN ('pending','sending'))",
    )
      .bind(run.id, run.id)
      .run();
  };
  try {
    if (env.LINE_DELIVERY_MODE !== "live") {
      await finish("skipped", "發送模式已關閉");
      return;
    }
    if (
      Date.now() - Date.parse(delivery.first_attempt_at ?? run.confirmed_at!) >
        23 * 60 * 60 * 1000 ||
      delivery.attempts >= 8
    ) {
      await finish("failed", "重試期限或次數已達上限；請核對 LINE 紀錄");
      return;
    }
    const query = audienceQuery(
      new URLSearchParams(JSON.parse(run.filters_json)),
      true,
    );
    const eligible = await env.DB.prepare(query.sql + " AND c.line_user_id=?")
      .bind(...query.values, delivery.line_user_id)
      .first();
    if (!eligible) {
      await finish("skipped", "已退訂、封鎖或不再符合原篩選條件");
      return;
    }
    await recordOutgoing(
      env,
      delivery.line_user_id,
      "campaign:" + delivery.id,
      [{ type: "text", text: run.body }],
    );
    const response = await fetch(apiBase + "/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": delivery.id,
      },
      body: JSON.stringify({
        to: delivery.line_user_id,
        messages: [{ type: "text", text: run.body }],
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
    await setOutgoingStatus(env, "campaign:" + delivery.id, "unconfirmed");
    await env.DB.prepare(
      "UPDATE campaign_deliveries SET status='pending',lease_until=NULL WHERE id=? AND status='sending'",
    )
      .bind(delivery.id)
      .run();
    throw error;
  }
}
