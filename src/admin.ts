import { choice, HttpError, json, readJson, textField } from "./http";
import { customerSelect, ensureCustomer, now, currentMonth } from "./db";
import { respond } from "./bot";
import { BUSINESS, STEPS, LESSONS } from "./content";
import type { Customer, Account } from "./types";
import { adminIdentity } from "./auth";
import { audienceQuery, validMonth } from "./audience";
import { campaignApi } from "./campaigns";
import { automationApi, eligibleSnapshot, enqueueSync } from "./automation";
import { getTeam, personalize } from "./team";
import { enrollmentApi } from "./auth-enrollment";
import { knowledgeApi } from "./knowledge";
import { conversationApi } from "./conversations";

const stages = [
  "new",
  "registering",
  "kyc",
  "deposit",
  "review",
  "joined",
] as const;
const preferences = ["unknown", "spot", "futures", "both", "learning"] as const;
const statuses = ["pending", "verified", "rejected"] as const;
const validId = (id: string) => {
  if (!/^U[a-f0-9]{32}$/i.test(id))
    throw new HttpError(
      400,
      "需要 LINE webhook 提供的 userId（U 開頭的 33 字元），不是個人 LINE ID",
    );
  return id;
};
export async function admin(request: Request, env: Env): Promise<Response> {
  const identity = await adminIdentity(request, env);
  const knowledgeResponse = await knowledgeApi(request, env, identity.email);
  if (knowledgeResponse) return knowledgeResponse;
  const conversationResponse = await conversationApi(request, env);
  if (conversationResponse) return conversationResponse;
  const enrollmentResponse = await enrollmentApi(request, env, identity.email);
  if (enrollmentResponse) return enrollmentResponse;
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/line/rich-menu" && request.method === "POST") {
    if (env.LINE_DELIVERY_MODE !== "live" || !env.LINE_CHANNEL_ACCESS_TOKEN)
      throw new HttpError(400, "請先設定 LINE 發送環境");
    const id = crypto.randomUUID();
    await env.CAMPAIGN_EVENTS.send({ kind: "line-menu-install", id });
    return json({ operationId: id }, 202);
  }
  const automationResponse = await automationApi(request, env, identity.email);
  if (automationResponse) return automationResponse;
  const campaignResponse = await campaignApi(request, env, identity.email);
  if (campaignResponse) return campaignResponse;
  if (request.method === "GET" && path === "/api/config")
    return json({
      business: personalize(BUSINESS, await getTeam(env.DB)),
      identity,
      steps: personalize(STEPS, await getTeam(env.DB)),
      lessons: LESSONS,
      development: env.ENVIRONMENT === "development",
      deliveryMode: env.LINE_DELIVERY_MODE,
      assistant: {
        provider: "openai",
        model: env.OPENAI_MODEL,
        configured: Boolean(env.OPENAI_API_KEY && env.OPENAI_MODEL),
      },
    });
  if (request.method === "GET" && path === "/api/stats") {
    const counts = await env.DB.prepare(
      "SELECT stage, count(*) AS count FROM customers GROUP BY stage",
    ).all();
    const review = await env.DB.prepare(
      "SELECT count(*) AS count FROM exchange_accounts WHERE referral_status='pending' OR deposit_status='pending'",
    ).first();
    const support = await env.DB.prepare(
      "SELECT count(*) AS count FROM customers WHERE support_requested=1",
    ).first();
    return json({ stages: counts.results, review, support });
  }
  if (
    request.method === "GET" &&
    ["/api/customers", "/api/audience"].includes(path)
  ) {
    const query = audienceQuery(url.searchParams, path === "/api/audience");
    const page = Number(url.searchParams.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100000)
      throw new HttpError(400, "頁數不正確");
    const count = await env.DB.prepare(
      `SELECT count(*) AS total FROM (${query.sql})`,
    )
      .bind(...query.values)
      .first<{ total: number }>();
    const rows = await env.DB.prepare(
      `${query.sql} ORDER BY c.updated_at DESC, c.line_user_id LIMIT 50 OFFSET ?`,
    )
      .bind(...query.values, (page - 1) * 50)
      .all();
    return json({
      customers: rows.results,
      total: count?.total ?? 0,
      page,
      month: query.month,
    });
  }
  const match = path.match(
    /^\/api\/customers\/(U[a-f0-9]{32})(?:\/(volume))?$/i,
  );
  if (match) {
    const id = validId(match[1]);
    const customer = await env.DB.prepare(
      "SELECT * FROM customers WHERE line_user_id=?",
    )
      .bind(id)
      .first<Customer>();
    if (!customer) throw new HttpError(404, "找不到這位用戶");
    if (request.method === "GET" && !match[2]) {
      const [account, volumes, audit] = await Promise.all([
        env.DB.prepare("SELECT * FROM exchange_accounts WHERE line_user_id=?")
          .bind(id)
          .first(),
        env.DB.prepare(
          "SELECT * FROM volume_records WHERE line_user_id=? ORDER BY month DESC LIMIT 24",
        )
          .bind(id)
          .all(),
        env.DB.prepare(
          "SELECT action, detail, created_at FROM audit_log WHERE line_user_id=? ORDER BY id DESC LIMIT 30",
        )
          .bind(id)
          .all(),
      ]);
      return json({
        customer,
        account,
        volumes: volumes.results,
        audit: audit.results,
      });
    }
    if (request.method === "PUT" && match[2] === "volume") {
      const data = await readJson(request);
      const month = validMonth(textField(data.month, 7));
      const volume = data.volume_usdt;
      if (
        typeof volume !== "number" ||
        !Number.isFinite(volume) ||
        volume < 0 ||
        volume > 1e12
      )
        throw new HttpError(400, "交易量需為 0 至一兆之間的數字");
      const source = choice(data.source, ["manual", "affiliate_report"]);
      const note = textField(data.note, 500);
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO volume_records(id,line_user_id,exchange,month,volume_usdt,source,note) VALUES (?,?,'bingx',?,?,?,?)
          ON CONFLICT(line_user_id,exchange,month) DO UPDATE SET volume_usdt=excluded.volume_usdt,source=excluded.source,note=excluded.note,updated_at=?`,
        ).bind(crypto.randomUUID(), id, month, volume, source, note, now()),
        env.DB.prepare(
          "INSERT INTO audit_log(line_user_id,action,detail) VALUES (?,?,?)",
        ).bind(
          id,
          "volume.update",
          JSON.stringify({ month, volume, source, note }),
        ),
      ]);
      return json({ ok: true });
    }
    if (request.method === "PATCH" && !match[2]) {
      const data = await readJson(request);
      const name = textField(data.display_name, 80, customer.display_name);
      const handle = textField(data.line_handle, 100, customer.line_handle);
      const notes = textField(data.notes, 3000, customer.notes);
      const ownerName = textField(data.owner_name, 80, customer.owner_name);
      const tags = textField(data.tags, 500, customer.tags);
      const stage =
        data.stage === undefined ? customer.stage : choice(data.stage, stages);
      const preference =
        data.preference === undefined
          ? customer.preference
          : choice(data.preference, preferences);
      const support =
        data.support_requested === undefined
          ? customer.support_requested
          : data.support_requested === true
            ? 1
            : data.support_requested === false
              ? 0
              : -1;
      if (support === -1) throw new HttpError(400, "人工協助欄位不正確");
      const account = await env.DB.prepare(
        "SELECT * FROM exchange_accounts WHERE line_user_id=?",
      )
        .bind(id)
        .first<Account>();
      const statements: D1PreparedStatement[] = [];
      let referral = account?.referral_status;
      let deposit = account?.deposit_status;
      if (data.account !== undefined) {
        if (
          !data.account ||
          typeof data.account !== "object" ||
          Array.isArray(data.account)
        )
          throw new HttpError(400, "帳戶格式不正確");
        const a = data.account as Record<string, unknown>;
        const uid = textField(a.uid, 30, account?.uid);
        if (!/^\d{4,30}$/.test(uid))
          throw new HttpError(400, "UID 需要 4–30 位數字");
        const changed = !!account && uid !== account.uid;
        referral = changed
          ? "pending"
          : a.referral_status === undefined
            ? (account?.referral_status ?? "pending")
            : choice(a.referral_status, statuses);
        deposit = changed
          ? "pending"
          : a.deposit_status === undefined
            ? (account?.deposit_status ?? "pending")
            : choice(a.deposit_status, statuses);
        const verificationNote = changed
          ? ""
          : textField(a.verification_note, 1000, account?.verification_note);
        const depositNote = changed
          ? ""
          : textField(a.deposit_note, 1000, account?.deposit_note);
        if (referral === "verified" && !verificationNote)
          throw new HttpError(400, "核實推薦關係前，請填寫核對依據");
        if (deposit === "verified" && !depositNote)
          throw new HttpError(400, "核實已入金前，請填寫核對依據");
        const collision = await env.DB.prepare(
          "SELECT line_user_id FROM exchange_accounts WHERE exchange=? AND uid=? AND line_user_id<>?",
        )
          .bind("bingx", uid, id)
          .first();
        if (collision)
          throw new HttpError(409, "此 UID 已有登記，請核對後再操作");
        statements.push(
          env.DB.prepare(
            `INSERT INTO exchange_accounts(line_user_id,exchange,uid,referral_status,verified_at,verification_note,deposit_status,deposit_note)
          VALUES (?,'bingx',?,?,?,?,?,?) ON CONFLICT(line_user_id,exchange) DO UPDATE SET uid=excluded.uid,referral_status=excluded.referral_status,verified_at=excluded.verified_at,verification_note=excluded.verification_note,deposit_status=excluded.deposit_status,deposit_note=excluded.deposit_note`,
          ).bind(
            id,
            uid,
            referral,
            referral === "verified" ? now() : null,
            verificationNote,
            deposit,
            depositNote,
          ),
        );
      }
      if (
        stage === "joined" &&
        (referral !== "verified" || deposit !== "verified")
      )
        throw new HttpError(400, "先核實推薦關係與入金門檻，才能標記已入群");
      if (stage === "joined" && (await getTeam(env.DB)).automation_enabled) {
        const requested = data.account as Record<string, unknown> | undefined;
        if (
          !(await eligibleSnapshot(
            env,
            id,
            typeof requested?.uid === "string" ? requested.uid : account?.uid,
          ))
        )
          throw new HttpError(
            400,
            "需先取得此 UID 最新的邀請、KYC 與入金通過結果",
          );
      }
      statements.push(
        env.DB.prepare(
          "UPDATE customers SET owner_name=?,tags=? WHERE line_user_id=?",
        ).bind(ownerName, tags, id),
      );
      statements.push(
        env.DB.prepare(
          "UPDATE customers SET display_name=?,line_handle=?,notes=?,stage=?,preference=?,support_requested=?,updated_at=? WHERE line_user_id=?",
        ).bind(name, handle, notes, stage, preference, support, now(), id),
      );
      // Consent is only changed by the LINE user. Admin edits cannot opt someone in.
      statements.push(
        env.DB.prepare(
          "INSERT INTO audit_log(line_user_id,action,detail) VALUES (?,?,?)",
        ).bind(
          id,
          "customer.update",
          JSON.stringify({
            before: { customer, account },
            after: {
              name,
              handle,
              notes,
              stage,
              preference,
              support,
              referral,
              deposit,
            },
          }),
        ),
      );
      try {
        await env.DB.batch(statements);
        if (data.account && (await getTeam(env.DB)).automation_enabled)
          await enqueueSync(env, id);
      } catch (error) {
        if (String(error).includes("UNIQUE constraint"))
          throw new HttpError(409, "UID 已有登記");
        throw error;
      }
      return json({ ok: true });
    }
  }
  if (path === "/api/campaigns" && request.method === "GET")
    return json(
      (
        await env.DB.prepare(
          "SELECT * FROM campaign_drafts ORDER BY created_at DESC LIMIT 30",
        ).all()
      ).results,
    );
  if (path === "/api/campaigns" && request.method === "POST") {
    const data = await readJson(request);
    const title = textField(data.title, 80);
    const content = textField(data.body, 4500);
    if (!title || !content) throw new HttpError(400, "請填寫草稿名稱與內容");
    const body = content.includes("退訂")
      ? content
      : content + "\n\n回覆「退訂」可停止活動通知。";
    const filters = textField(data.filters, 1000);
    const query = audienceQuery(new URLSearchParams(filters), true);
    const count = await env.DB.prepare(
      `SELECT count(*) AS total FROM (${query.sql})`,
    )
      .bind(...query.values)
      .first<{ total: number }>();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO campaign_drafts(id,title,body,filters_json,audience_count) VALUES (?,?,?,?,?)",
    )
      .bind(
        id,
        title,
        body,
        JSON.stringify(Object.fromEntries(new URLSearchParams(filters))),
        count?.total ?? 0,
      )
      .run();
    return json({ id, audienceCount: count?.total ?? 0, status: "draft" }, 201);
  }
  if (
    env.ENVIRONMENT === "development" &&
    env.LINE_DELIVERY_MODE === "disabled" &&
    path === "/api/simulate" &&
    request.method === "POST"
  ) {
    const data = await readJson(request);
    const id = validId(textField(data.userId, 33));
    const input = textField(data.text, 1500);
    if (!input) throw new HttpError(400, "請輸入測試訊息");
    return json({
      messages: await respond(env.DB, id, input, env, crypto.randomUUID()),
    });
  }
  if (
    env.ENVIRONMENT === "development" &&
    env.LINE_DELIVERY_MODE === "disabled" &&
    path === "/api/demo" &&
    request.method === "POST"
  ) {
    const samples = [
      ["測試 · 小安", "review", "learning", null],
      ["測試 · Ethan", "joined", "futures", 42000],
      ["測試 · 小魚", "deposit", "spot", null],
      ["測試 · Ruby", "joined", "both", 8500],
      ["測試 · Ken", "kyc", "learning", null],
    ] as const;
    for (const [i, s] of samples.entries()) {
      const id = "U" + String(i + 1).padStart(32, "0");
      const exists = await env.DB.prepare(
        "SELECT line_user_id FROM customers WHERE line_user_id=?",
      )
        .bind(id)
        .first();
      if (exists) continue;
      await ensureCustomer(env.DB, id);
      await env.DB.prepare(
        "UPDATE customers SET display_name=?,stage=?,preference=?,marketing_consent=?,consent_at=?,support_requested=? WHERE line_user_id=?",
      )
        .bind(
          s[0],
          s[1],
          s[2],
          i % 2,
          i % 2 ? now() : null,
          i === 0 ? 1 : 0,
          id,
        )
        .run();
      if (s[1] === "joined" || s[1] === "review")
        await env.DB.prepare(
          "INSERT INTO exchange_accounts(line_user_id,exchange,uid,referral_status,deposit_status,verification_note,deposit_note) VALUES (?,'bingx',?,?,?,'示範資料，非真實核實','示範資料，非真實核實')",
        )
          .bind(
            id,
            "90000000" + i,
            s[1] === "joined" ? "verified" : "pending",
            s[1] === "joined" ? "verified" : "pending",
          )
          .run();
      if (s[3] !== null)
        await env.DB.prepare(
          "INSERT INTO volume_records(id,line_user_id,exchange,month,volume_usdt,source,note) VALUES (?,?,'bingx',?,?,'manual','示範資料')",
        )
          .bind(crypto.randomUUID(), id, currentMonth(), s[3])
          .run();
    }
    return json({ ok: true });
  }
  throw new HttpError(404, "找不到此功能");
}
