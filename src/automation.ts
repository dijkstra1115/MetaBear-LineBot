import { recordOutgoing, setOutgoingStatus } from "./conversations";
import {
  BingxClient,
  BingxError,
  record,
  flag,
  decimal,
  sumDecimal,
  taipeiDay,
  dayStart,
  DAY,
  type Row,
} from "./bingx";
import { getTeam, validateTeam, type Team } from "./team";
import { audit, now } from "./db";
import { HttpError, json, readJson, textField } from "./http";

export type CrmMessage = { kind: "crm-sync" | "vip-delivery"; id: string };
type Job = {
  id: string;
  line_user_id: string;
  uid: string;
  kind: "qualification" | "full";
  status: string;
  attempts: number;
  lease_until: number;
};
type Snapshot = {
  uid: string;
  data_json: string;
  qualification: string;
  reasons_json: string;
  settings_revision: number;
  checked_at: string;
};
type Vip = {
  id: string;
  line_user_id: string;
  uid: string;
  status: string;
  body: string;
  settings_revision: number;
  attempts: number;
  first_attempt_at: string | null;
  created_at: string;
  lease_until: number;
};
type Metric = {
  uid: string;
  day: string;
  business_type: string;
  volume: string;
  commission: string;
  expected_fees: string;
  fee_offsets: string;
  collected_fees: string;
};
export const reasons: Record<string, string> = {
  referral: "邀請關係或邀請碼不符合團隊設定",
  kyc: "尚未完成 KYC",
  deposit: "尚未確認符合規則的入金",
  unknown: "交易所資料不完整，等待重新確認",
  stale: "資料已過期，等待更新",
  sync_error: "交易所查詢失敗，等待重試",
};
function configured(env: Env) {
  return Boolean(env.BINGX_API_KEY && env.BINGX_SECRET_KEY);
}
function asText(value: unknown, max = 100): string | null {
  if (
    typeof value === "string" ||
    (typeof value === "number" && Number.isSafeInteger(value))
  )
    return String(value).slice(0, max);
  return null;
}
function timestamp(value: unknown): string | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 8640000000000000
    ? new Date(value).toISOString()
    : null;
}
export function evaluateRelation(
  raw: Row,
  uid: string,
  team: Team,
  deposits: Row[],
) {
  if (String(raw.uid) !== uid) throw new BingxError("uid_mismatch");
  const data = {
    uid,
    inviteResult: flag(raw.inviteResult),
    directInvitation: flag(raw.directInvitation),
    inviterUid: asText(raw.inviterSid),
    inviteCode: asText(raw.inviteCode ?? raw.InvitationCode),
    kyc: flag(raw.kycResult),
    deposited: flag(raw.deposit),
    traded: flag(raw.trade),
    balance: raw.balanceVolume == null ? null : decimal(raw.balanceVolume),
    registeredAt: timestamp(raw.registerDateTime),
    level: asText(raw.userLevel),
    commissionRatio: asText(raw.commissionRatio),
    benefitType: asText(raw.currentBenefit),
    benefitRatio: asText(raw.benefitRatio),
    benefitExpiresAt: timestamp(raw.benefitExpiration),
  };
  const missing: string[] = [];
  const known =
    data.inviteResult !== null &&
    data.kyc !== null &&
    data.deposited !== null &&
    data.directInvitation !== null &&
    data.inviteCode !== null;
  if (!known) missing.push("unknown");
  if (
    data.inviteResult !== true ||
    data.inviteCode !== team.referral_code ||
    (!team.allow_indirect && data.directInvitation !== true) ||
    (team.inviter_uid && data.inviterUid !== team.inviter_uid)
  )
    missing.push("referral");
  if (data.kyc !== true) missing.push("kyc");
  // With internal transfers allowed, the authoritative deposit flag suffices.
  // If they are excluded, additionally require a recognizable external deposit record.
  const externalDeposit = deposits.some(
    (row) =>
      /^(deposit|充值)$/i.test(String(row.assetTypeName)) &&
      Number(row.currencyAmountVolume) > 0,
  );
  if (
    data.deposited !== true ||
    (!team.allow_internal_transfer && !externalDeposit)
  )
    missing.push("deposit");
  return {
    data,
    qualification: missing.length
      ? known
        ? "needs_action"
        : "pending"
      : "eligible",
    reasons: missing,
  };
}
export async function enqueueSync(
  env: Env,
  id: string,
  kind: "qualification" | "full" = "qualification",
) {
  const account = await env.DB.prepare(
    "SELECT uid FROM exchange_accounts WHERE line_user_id=? AND exchange='bingx'",
  )
    .bind(id)
    .first<{ uid: string }>();
  if (!account) return null;
  const jobId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO crm_jobs(id,line_user_id,uid,kind,created_at) VALUES (?,?,?,?,?)`,
  )
    .bind(jobId, id, account.uid, kind, now())
    .run();
  const active = await env.DB.prepare(
    "SELECT id FROM crm_jobs WHERE line_user_id=? AND status IN ('pending','running')",
  )
    .bind(id)
    .first<{ id: string }>();
  if (active) {
    if (kind === "full")
      await env.DB.prepare(
        "UPDATE crm_jobs SET kind='full' WHERE id=? AND status='pending'",
      )
        .bind(active.id)
        .run();
    try {
      await env.CAMPAIGN_EVENTS.send({
        kind: "crm-sync",
        id: active.id,
      } satisfies CrmMessage);
    } catch {
      /* durable job is recovered by the scheduled dispatcher */
    }
  }
  return active?.id ?? null;
}

async function collectMetrics(client: BingxClient, uid: string) {
  const today = dayStart(taipeiDay(Date.now())),
    start = today - 60 * DAY;
  const metrics: Metric[] = [];
  for (const business of ["all", "perpetualFutures", "spot"]) {
    for (let from = start; from < today; from += 30 * DAY) {
      const to = Math.min(today, from + 30 * DAY) - 1;
      const rows = await client.pages(
        "/openApi/agent/v2/reward/commissionDataList",
        {
          uid,
          startTime: from,
          endTime: to,
          ...(business === "all" ? {} : { businessType: business }),
        },
        uid,
      );
      const days = new Map<string, Metric>();
      for (const row of rows) {
        if (
          typeof row.commissionTime !== "number" ||
          row.commissionTime < from ||
          row.commissionTime > to
        )
          throw new BingxError("date_outside_window");
        const day = taipeiDay(row.commissionTime);
        const item: Metric = {
          uid,
          day,
          business_type: business,
          volume: decimal(row.tradingVolume),
          commission: decimal(row.commission),
          expected_fees: decimal(row.expectedTradingFees),
          fee_offsets: decimal(row.offsetTradingFees),
          collected_fees: decimal(row.collectedTradingFees),
        };
        const previous = days.get(day);
        if (previous)
          for (const key of [
            "volume",
            "commission",
            "expected_fees",
            "fee_offsets",
            "collected_fees",
          ] as const)
            item[key] = sumDecimal([previous[key], item[key]]);
        days.set(day, item);
      }
      metrics.push(...days.values());
    }
  }
  return { metrics, start: taipeiDay(start), end: taipeiDay(today - 1) };
}

export async function processSync(message: CrmMessage, env: Env) {
  const team = await getTeam(env.DB);
  if (!configured(env) || !team.automation_enabled) return;
  const job = await env.DB.prepare("SELECT * FROM crm_jobs WHERE id=?")
    .bind(message.id)
    .first<Job>();
  if (!job || !["pending", "running"].includes(job.status)) return;
  // Also serializes API calls when a queue redelivery or another dispatcher overlaps.
  const owner = crypto.randomUUID(),
    time = Date.now();
  const lock = await env.DB.prepare(
    `INSERT INTO crm_locks(id,owner,lease_until) VALUES ('bingx',?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,lease_until=excluded.lease_until WHERE crm_locks.lease_until<? RETURNING owner`,
  )
    .bind(owner, time + 240000, time)
    .first();
  if (!lock) throw new Error("SyncBusy");
  try {
    const claimed = await env.DB.prepare(
      "UPDATE crm_jobs SET status='running',attempts=attempts+1,lease_until=? WHERE id=? AND next_at<=? AND (status='pending' OR (status='running' AND lease_until<?)) RETURNING *",
    )
      .bind(time + 240000, job.id, time, time)
      .first<Job>();
    if (!claimed) return;
    if (claimed.attempts > 8) {
      await env.DB.prepare(
        "UPDATE crm_jobs SET status='failed',error='重試次數已達上限',finished_at=? WHERE id=?",
      )
        .bind(now(), job.id)
        .run();
      return;
    }
    const account = await env.DB.prepare(
      "SELECT uid FROM exchange_accounts WHERE line_user_id=?",
    )
      .bind(job.line_user_id)
      .first<{ uid: string }>();
    if (account?.uid !== job.uid) {
      await env.DB.prepare(
        "UPDATE crm_jobs SET status='cancelled',finished_at=? WHERE id=?",
      )
        .bind(now(), job.id)
        .run();
      return;
    }
    const client = new BingxClient(env.BINGX_API_KEY, env.BINGX_SECRET_KEY);
    const raw = await client.relation(job.uid);
    const deposits =
      flag(raw.inviteResult) === true
        ? await client.pages(
            "/openApi/agent/v1/asset/depositDetailList",
            {
              uid: job.uid,
              bizType: 1,
              startTime: dayStart(taipeiDay(Date.now())) - 60 * DAY,
              endTime: Date.now(),
            },
            job.uid,
          )
        : [];
    const evaluation = evaluateRelation(raw, job.uid, team, deposits);
    const full =
      claimed.kind === "full" && flag(raw.inviteResult) === true
        ? await collectMetrics(client, job.uid)
        : null;
    const latestTeam = await getTeam(env.DB);
    const latestAccount = await env.DB.prepare(
      "SELECT uid FROM exchange_accounts WHERE line_user_id=?",
    )
      .bind(job.line_user_id)
      .first<{ uid: string }>();
    if (latestTeam.revision !== team.revision || latestAccount?.uid !== job.uid)
      throw new BingxError("settings_changed");
    const checked = now(),
      statements: D1PreparedStatement[] = [];
    statements.push(
      env.DB.prepare(
        `INSERT INTO exchange_snapshots VALUES (?,?,?,?,?,?,?) ON CONFLICT(line_user_id) DO UPDATE SET uid=excluded.uid,data_json=excluded.data_json,qualification=excluded.qualification,reasons_json=excluded.reasons_json,settings_revision=excluded.settings_revision,checked_at=excluded.checked_at`,
      ).bind(
        job.line_user_id,
        job.uid,
        JSON.stringify(evaluation.data),
        evaluation.qualification,
        JSON.stringify(evaluation.reasons),
        team.revision,
        checked,
      ),
    );
    statements.push(
      env.DB.prepare(
        "UPDATE exchange_accounts SET referral_status=?,deposit_status=?,verification_note=?,deposit_note=?,verified_at=? WHERE line_user_id=? AND uid=?",
      ).bind(
        evaluation.reasons.includes("referral") ? "pending" : "verified",
        evaluation.reasons.includes("deposit") ? "pending" : "verified",
        `BingX API ${checked}`,
        `BingX API ${checked}；已入金判定；內部轉帳${team.allow_internal_transfer ? "允許" : "不允許"}`,
        checked,
        job.line_user_id,
        job.uid,
      ),
    );
    for (const row of deposits) {
      const occurred = timestamp(row.bizTime);
      if (
        !occurred ||
        typeof row.assetTypeName !== "string" ||
        typeof row.currencyName !== "string"
      )
        throw new BingxError("invalid_deposit");
      const amount = decimal(row.currencyAmountVolume),
        asset = String(row.assetType);
      const canonical = JSON.stringify([
        job.uid,
        occurred,
        asset,
        row.currencyName,
        amount,
      ]);
      const fingerprint = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(canonical),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      statements.push(
        env.DB.prepare(
          `INSERT INTO deposit_records VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET synced_at=excluded.synced_at`,
        ).bind(
          fingerprint,
          job.uid,
          occurred,
          asset,
          row.assetTypeName.slice(0, 120),
          row.currencyName.slice(0, 30),
          amount,
          checked,
        ),
      );
    }
    if (full) {
      statements.push(
        env.DB.prepare(
          "DELETE FROM daily_metrics WHERE uid=? AND day>=? AND day<=?",
        ).bind(job.uid, full.start, full.end),
      );
      for (const m of full.metrics)
        statements.push(
          env.DB.prepare(
            "INSERT INTO daily_metrics VALUES (?,?,?,?,?,?,?,?,?)",
          ).bind(
            m.uid,
            m.day,
            m.business_type,
            m.volume,
            m.commission,
            m.expected_fees,
            m.fee_offsets,
            m.collected_fees,
            checked,
          ),
        );
      for (const business of ["all", "perpetualFutures", "spot"])
        statements.push(
          env.DB.prepare(
            `INSERT INTO metric_coverage VALUES (?,?,?,?,?) ON CONFLICT(uid,business_type) DO UPDATE SET start_day=excluded.start_day,end_day=excluded.end_day,synced_at=excluded.synced_at`,
          ).bind(job.uid, business, full.start, full.end, checked),
        );
    }
    statements.push(
      env.DB.prepare(
        "UPDATE crm_jobs SET status='done',lease_until=0,error='',finished_at=? WHERE id=?",
      ).bind(checked, job.id),
    );
    statements.push(
      env.DB.prepare(
        "INSERT INTO audit_log(line_user_id,action,detail) VALUES (?,?,?)",
      ).bind(
        job.line_user_id,
        "bingx.synced",
        JSON.stringify({
          jobId: job.id,
          uid: job.uid,
          kind: claimed.kind,
          qualification: evaluation.qualification,
          reasons: evaluation.reasons,
          settingsRevision: team.revision,
        }),
      ),
    );
    await env.DB.batch(statements);
    await queueVip(env, job.line_user_id);
  } catch (error) {
    const detail = error instanceof BingxError ? error.message : "同步暫時失敗";
    await env.DB.prepare(
      "UPDATE crm_jobs SET status=CASE WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,lease_until=0,next_at=?,error=?,finished_at=? WHERE id=? AND status='running'",
    )
      .bind(
        Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts),
        detail,
        now(),
        job.id,
      )
      .run();
    throw new Error(detail);
  } finally {
    await env.DB.prepare("DELETE FROM crm_locks WHERE id='bingx' AND owner=?")
      .bind(owner)
      .run();
  }
}

export async function eligibleSnapshot(env: Env, id: string, uid?: string) {
  const team = await getTeam(env.DB);
  const row = await env.DB.prepare(
    `SELECT s.* FROM exchange_snapshots s JOIN exchange_accounts a ON a.line_user_id=s.line_user_id AND a.uid=s.uid JOIN customers c ON c.line_user_id=a.line_user_id WHERE s.line_user_id=? AND c.blocked=0`,
  )
    .bind(id)
    .first<Snapshot>();
  if (
    !row ||
    (uid && uid !== row.uid) ||
    row.qualification !== "eligible" ||
    row.settings_revision !== team.revision ||
    Date.now() - Date.parse(row.checked_at) > 3600000
  )
    return null;
  const failure = await env.DB.prepare(
    "SELECT id FROM crm_jobs WHERE line_user_id=? AND error<>'' AND COALESCE(finished_at,created_at)>=? AND status IN ('pending','running','failed') LIMIT 1",
  )
    .bind(id, row.checked_at)
    .first();
  return failure ? null : row;
}
export async function queueVip(env: Env, id: string) {
  const team = await getTeam(env.DB);
  if (
    !team.automation_enabled ||
    !team.vip_url ||
    env.LINE_DELIVERY_MODE !== "live" ||
    !env.LINE_CHANNEL_ACCESS_TOKEN
  )
    return;
  const snapshot = await eligibleSnapshot(env, id);
  if (!snapshot) return;
  const customer = await env.DB.prepare(
    "SELECT stage FROM customers WHERE line_user_id=?",
  )
    .bind(id)
    .first<{ stage: string }>();
  if (customer?.stage === "joined") return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO vip_deliveries(id,line_user_id,uid,body,settings_revision,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      id,
      snapshot.uid,
      `${team.name} 入群資格已通過！\n\n邀請關係、KYC 與入金均已確認。\nVIP 社群連結：${team.vip_url}\n\n如連結無法開啟，請回覆「人工協助」。`,
      team.revision,
      now(),
    )
    .run();
  // Only unsent, unattempted cancelled invitations may be rebuilt after a rule change.
  await env.DB.prepare(
    "UPDATE vip_deliveries SET status='pending',body=?,settings_revision=?,detail='' WHERE line_user_id=? AND uid=? AND status='cancelled' AND attempts=0",
  )
    .bind(
      `${team.name} 入群資格已通過！\n\nVIP 社群連結：${team.vip_url}\n\n如需協助請回覆「人工協助」。`,
      team.revision,
      id,
      snapshot.uid,
    )
    .run();
  const row = await env.DB.prepare(
    "SELECT id FROM vip_deliveries WHERE line_user_id=? AND uid=? AND status='pending'",
  )
    .bind(id, snapshot.uid)
    .first<{ id: string }>();
  if (row) {
    try {
      await env.CAMPAIGN_EVENTS.send({
        kind: "vip-delivery",
        id: row.id,
      } satisfies CrmMessage);
    } catch {
      /* cron recovery */
    }
  }
}
export async function processVip(message: CrmMessage, env: Env) {
  const time = Date.now();
  const delivery = await env.DB.prepare(
    "UPDATE vip_deliveries SET status='sending',lease_until=? WHERE id=? AND next_at<=? AND (status='pending' OR (status='sending' AND lease_until<?)) RETURNING *",
  )
    .bind(time + 60000, message.id, time, time)
    .first<Vip>();
  if (!delivery) return;
  const finish = async (status: string, detail: string) => {
    await setOutgoingStatus(
      env,
      "vip:" + delivery.id,
      status === "cancelled" ? "not_sent" : status,
    );
    await env.DB.prepare(
      "UPDATE vip_deliveries SET status=?,detail=?,lease_until=0,accepted_at=CASE WHEN ?='accepted' THEN ? ELSE accepted_at END WHERE id=?",
    )
      .bind(status, detail, status, now(), delivery.id)
      .run();
  };
  try {
    const team = await getTeam(env.DB);
    if (
      !team.automation_enabled ||
      team.revision !== delivery.settings_revision ||
      env.LINE_DELIVERY_MODE !== "live" ||
      !env.LINE_CHANNEL_ACCESS_TOKEN ||
      !(await eligibleSnapshot(env, delivery.line_user_id, delivery.uid))
    ) {
      await finish("cancelled", "設定、資格或聯絡狀態已變更，未發送");
      return;
    }
    if (
      delivery.attempts >= 8 ||
      (delivery.first_attempt_at &&
        time - Date.parse(delivery.first_attempt_at) > 23 * 3600000)
    ) {
      await finish(
        "failed",
        "重試期限已到，請人工核對 LINE 紀錄，避免重複發送",
      );
      return;
    }
    await env.DB.prepare(
      "UPDATE vip_deliveries SET attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?) WHERE id=?",
    )
      .bind(now(), delivery.id)
      .run();
    await recordOutgoing(env, delivery.line_user_id, "vip:" + delivery.id, [
      { type: "text", text: delivery.body },
    ]);
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": delivery.id,
      },
      body: JSON.stringify({
        to: delivery.line_user_id,
        messages: [{ type: "text", text: delivery.body }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const accepted =
      response.ok ||
      (response.status === 409 &&
        response.headers.has("x-line-accepted-request-id"));
    await response.body?.cancel();
    if (accepted) {
      await finish("accepted", "LINE 已接受；不代表已讀或已加入社群");
      await audit(env.DB, delivery.line_user_id, "vip.accepted", {
        deliveryId: delivery.id,
      });
      return;
    }
    if (response.status === 429 || response.status >= 500)
      throw new Error("LineRetry");
    await finish(
      "failed",
      `LINE HTTP ${response.status}，請核對帳號額度或設定`,
    );
  } catch {
    await setOutgoingStatus(env, "vip:" + delivery.id, "unconfirmed");
    await env.DB.prepare(
      "UPDATE vip_deliveries SET status='pending',lease_until=0,next_at=?,detail='等待 LINE 重試' WHERE id=? AND status='sending'",
    )
      .bind(
        time + Math.min(3600000, 30000 * 2 ** delivery.attempts),
        delivery.id,
      )
      .run();
    throw new Error("VipRetry");
  }
}

export async function dispatchCrm(env: Env) {
  const team = await getTeam(env.DB);
  if (!configured(env) || !team.automation_enabled) return;
  // Bounded, oldest-first daily refresh. Repeated ticks work through larger teams.
  const due = await env.DB.prepare(
    `SELECT a.line_user_id FROM exchange_accounts a JOIN customers c ON c.line_user_id=a.line_user_id LEFT JOIN metric_coverage m ON m.uid=a.uid AND m.business_type='all' WHERE c.blocked=0 AND (m.synced_at IS NULL OR m.synced_at<?) AND NOT EXISTS (SELECT 1 FROM crm_jobs j WHERE j.line_user_id=a.line_user_id AND (j.status IN ('pending','running') OR (j.status='failed' AND j.created_at>?))) ORDER BY COALESCE(m.synced_at,''),a.line_user_id LIMIT 20`,
  )
    .bind(
      new Date(Date.now() - DAY).toISOString(),
      new Date(Date.now() - DAY).toISOString(),
    )
    .all<{ line_user_id: string }>();
  for (const row of due.results)
    await enqueueSync(env, row.line_user_id, "full");
  const waiting = await env.DB.prepare(
    `SELECT a.line_user_id FROM exchange_accounts a JOIN customers c ON c.line_user_id=a.line_user_id LEFT JOIN exchange_snapshots s ON s.line_user_id=a.line_user_id WHERE c.blocked=0 AND c.stage<>'joined' AND (s.checked_at IS NULL OR s.checked_at<? OR s.settings_revision<>?) AND NOT EXISTS(SELECT 1 FROM crm_jobs j WHERE j.line_user_id=a.line_user_id AND (j.status IN ('pending','running') OR (j.status='failed' AND j.created_at>?))) AND NOT EXISTS(SELECT 1 FROM vip_deliveries v WHERE v.line_user_id=a.line_user_id AND v.uid=a.uid AND v.status='accepted') ORDER BY COALESCE(s.checked_at,'') LIMIT 20`,
  )
    .bind(
      new Date(Date.now() - 15 * 60000).toISOString(),
      team.revision,
      new Date(Date.now() - DAY).toISOString(),
    )
    .all<{ line_user_id: string }>();
  for (const row of waiting.results) await enqueueSync(env, row.line_user_id);
  const jobs = await env.DB.prepare(
    "SELECT id FROM crm_jobs WHERE next_at<=? AND (status='pending' OR (status='running' AND lease_until<?)) ORDER BY created_at LIMIT 50",
  )
    .bind(Date.now(), Date.now())
    .all<{ id: string }>();
  if (jobs.results.length)
    await env.CAMPAIGN_EVENTS.sendBatch(
      jobs.results.map((row) => ({
        body: { kind: "crm-sync", id: row.id } satisfies CrmMessage,
      })),
    );
  const vip = await env.DB.prepare(
    "SELECT id FROM vip_deliveries WHERE next_at<=? AND (status='pending' OR (status='sending' AND lease_until<?)) LIMIT 50",
  )
    .bind(Date.now(), Date.now())
    .all<{ id: string }>();
  if (vip.results.length)
    await env.CAMPAIGN_EVENTS.sendBatch(
      vip.results.map((row) => ({
        body: { kind: "vip-delivery", id: row.id } satisfies CrmMessage,
      })),
    );
}

export async function customerAutomation(env: Env, id: string) {
  const account = await env.DB.prepare(
    "SELECT uid FROM exchange_accounts WHERE line_user_id=?",
  )
    .bind(id)
    .first<{ uid: string }>();
  if (!account)
    return {
      snapshot: null,
      metrics: [],
      deposits: [],
      coverage: [],
      deliveries: [],
      jobs: [],
      summary: null,
    };
  const [snapshot, metrics, deposits, coverage, deliveries, jobs] =
    await Promise.all([
      env.DB.prepare(
        "SELECT * FROM exchange_snapshots WHERE line_user_id=? AND uid=?",
      )
        .bind(id, account.uid)
        .first<Snapshot>(),
      env.DB.prepare(
        "SELECT * FROM daily_metrics WHERE uid=? ORDER BY day DESC,business_type LIMIT 2200",
      )
        .bind(account.uid)
        .all<Metric>(),
      env.DB.prepare(
        "SELECT * FROM deposit_records WHERE uid=? ORDER BY occurred_at DESC LIMIT 100",
      )
        .bind(account.uid)
        .all(),
      env.DB.prepare("SELECT * FROM metric_coverage WHERE uid=?")
        .bind(account.uid)
        .all(),
      env.DB.prepare(
        "SELECT id,uid,status,attempts,detail,created_at,accepted_at,joined_at FROM vip_deliveries WHERE line_user_id=? ORDER BY created_at DESC",
      )
        .bind(id)
        .all(),
      env.DB.prepare(
        "SELECT id,kind,status,attempts,error,created_at,finished_at FROM crm_jobs WHERE line_user_id=? ORDER BY created_at DESC LIMIT 10",
      )
        .bind(id)
        .all(),
    ]);
  const all = metrics.results.filter((row) => row.business_type === "all"),
    today = taipeiDay(Date.now());
  const interval = (days: number) =>
    all.filter(
      (row) =>
        row.day >= taipeiDay(dayStart(today) - days * DAY) && row.day < today,
    );
  const sum = (rows: Metric[], key: "volume" | "commission") =>
    rows.length ? sumDecimal(rows.map((row) => row[key])) : null;
  const monthly = new Map<string, Metric[]>();
  for (const row of all) {
    const month = row.day.slice(0, 7);
    monthly.set(month, [...(monthly.get(month) ?? []), row]);
  }
  const team = await getTeam(env.DB);
  const newerFailure =
    snapshot &&
    jobs.results.some(
      (job) =>
        job.error &&
        ["pending", "running", "failed"].includes(String(job.status)) &&
        String(job.finished_at ?? job.created_at) >= snapshot.checked_at,
    );
  return {
    snapshot: snapshot
      ? {
          ...snapshot,
          data: JSON.parse(snapshot.data_json),
          reasons: JSON.parse(snapshot.reasons_json).map(
            (key: string) => reasons[key] ?? key,
          ),
          stale:
            Boolean(newerFailure) ||
            Date.now() - Date.parse(snapshot.checked_at) > 3600000 ||
            snapshot.settings_revision !== team.revision,
        }
      : null,
    metrics: metrics.results,
    deposits: deposits.results,
    coverage: coverage.results,
    deliveries: deliveries.results,
    jobs: jobs.results,
    summary: {
      volume7: sum(interval(7), "volume"),
      volume30: sum(interval(30), "volume"),
      commission30: sum(interval(30), "commission"),
      lastObservedTrade: all.find((row) => Number(row.volume) > 0)?.day ?? null,
      activeDays30: interval(30).filter((row) => Number(row.volume) > 0).length,
      months: [...monthly].map(([month, rows]) => ({
        month,
        volume: sum(rows, "volume"),
        commission: sum(rows, "commission"),
      })),
    },
  };
}

export async function automationApi(
  request: Request,
  env: Env,
  actor: string,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/automation")) return null;
  if (path === "/api/automation/settings" && request.method === "GET")
    return json({
      team: await getTeam(env.DB),
      bingxConfigured: configured(env),
      lineConfigured: Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),
      deliveryMode: env.LINE_DELIVERY_MODE,
      isolation: "dedicated-deployment",
    });
  if (path === "/api/automation/settings" && request.method === "PUT") {
    const data = await readJson(request),
      previous = await getTeam(env.DB);
    if (data.revision !== previous.revision)
      throw new HttpError(409, "設定已被更新，請重新載入");
    const team = validateTeam(data, previous);
    if (team.automation_enabled && !configured(env))
      throw new HttpError(400, "請先設定 BingX API Key 與 Secret 環境秘密");
    const result = await env.DB.prepare(
      "UPDATE team_settings SET name=?,referral_code=?,inviter_uid=?,allow_indirect=?,allow_internal_transfer=?,automation_enabled=?,vip_url=?,support_url=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?",
    )
      .bind(
        team.name,
        team.referral_code,
        team.inviter_uid,
        team.allow_indirect,
        team.allow_internal_transfer,
        team.automation_enabled,
        team.vip_url,
        team.support_url,
        now(),
        previous.revision,
      )
      .run();
    if (!result.meta.changes) throw new HttpError(409, "設定已被更新");
    await audit(env.DB, null, "team.updated", {
      actor,
      revision: previous.revision + 1,
      automationEnabled: team.automation_enabled,
    });
    return json({ ok: true, revision: previous.revision + 1 });
  }
  if (path === "/api/automation/summary" && request.method === "GET") {
    const [qualifications, jobs, deliveries] = await Promise.all([
      env.DB.prepare(
        "SELECT qualification,count(*) AS count FROM exchange_snapshots GROUP BY qualification",
      ).all(),
      env.DB.prepare(
        "SELECT id,line_user_id,kind,status,attempts,error,created_at,finished_at FROM crm_jobs ORDER BY created_at DESC LIMIT 30",
      ).all(),
      env.DB.prepare(
        "SELECT status,count(*) AS count FROM vip_deliveries GROUP BY status",
      ).all(),
    ]);
    return json({
      qualifications: qualifications.results,
      jobs: jobs.results,
      deliveries: deliveries.results,
    });
  }
  if (path === "/api/automation/sync" && request.method === "POST") {
    if (!configured(env) || !(await getTeam(env.DB)).automation_enabled)
      throw new HttpError(400, "請先設定憑證並啟用自動化");
    await dispatchCrm(env);
    return json({ ok: true }, 202);
  }
  const match = path.match(
    /^\/api\/automation\/customers\/(U[a-f0-9]{32})(?:\/(sync|joined))?$/i,
  );
  if (match) {
    const id = match[1],
      account = await env.DB.prepare(
        "SELECT uid FROM exchange_accounts WHERE line_user_id=?",
      )
        .bind(id)
        .first<{ uid: string }>();
    if (request.method === "GET" && !match[2])
      return json(await customerAutomation(env, id));
    if (!account) throw new HttpError(404, "尚未登記 UID");
    if (request.method === "POST" && match[2] === "sync") {
      if (!configured(env) || !(await getTeam(env.DB)).automation_enabled)
        throw new HttpError(400, "請先完成自動化設定");
      const jobId = await enqueueSync(env, id, "full");
      await audit(env.DB, id, "bingx.requested", { actor, jobId });
      return json({ jobId }, 202);
    }
    if (request.method === "POST" && match[2] === "joined") {
      const data = await readJson(request);
      if (
        data.uid !== account.uid ||
        !(await eligibleSnapshot(env, id, account.uid))
      )
        throw new HttpError(409, "請重新同步此 UID 並確認資格");
      const note = textField(data.note, 500);
      if (!note) throw new HttpError(400, "請填寫已入群的核對依據");
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE customers SET stage='joined',updated_at=? WHERE line_user_id=?",
        ).bind(now(), id),
        env.DB.prepare(
          "UPDATE vip_deliveries SET joined_at=? WHERE line_user_id=? AND uid=?",
        ).bind(now(), id, account.uid),
        env.DB.prepare(
          "INSERT INTO audit_log(line_user_id,action,detail) VALUES (?,?,?)",
        ).bind(
          id,
          "vip.joined",
          JSON.stringify({ actor, uid: account.uid, note }),
        ),
      ]);
      return json({ ok: true });
    }
  }
  throw new HttpError(404, "找不到此自動化功能");
}
