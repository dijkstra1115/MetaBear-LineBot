import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { dispatchCampaigns } from "../src/campaigns";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fallbackRoute } from "../src/assistant";
import { isGreeting } from "../src/greetings";
import {
  knowledgeCandidates,
  matchKnowledge,
  normalizeKnowledge,
} from "../src/knowledge";
import faqSeed from "../data/bingx-faq.json";
import {
  redactConversation,
  recentConversation,
  cleanupConversations,
} from "../src/conversations";
import { guide, guidePages, menu, moreMenu, STEPS } from "../src/content";
import { activeSupportCase } from "../src/support";
import { createHmac } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

let adminJwt: string, signingKey: CryptoKey, publicJwk: any;
const issuer = "https://test.cloudflareaccess.com",
  audience = "test-audience",
  owner = "owner@example.test";
const signAdmin = (claims: Record<string, unknown> = {}) =>
  new SignJWT({ email: owner, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("owner-id")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(signingKey);
const pushes: { to: string; messages: any[]; retryKey: string }[] = [];
let pushMode = "ok",
  pushGate: Promise<void> | undefined;
let quotaLimit = 1000;
const adminToken = "test-admin-token-not-a-live-credential-123456";
const lineSecret = "test-line-secret";
const alice = "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const bob = "Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
let mf: Miniflare, db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
let clock = Date.now(),
  calls: { replyToken: string; messages: Record<string, unknown>[] }[] = [],
  failOnce = false;
let aiMode: "normal" | "invalid" | "unavailable" = "normal";
let aiGate: Promise<void> | undefined;
let aiCalls = 0;
const event = (text: string, userId = alice, id = crypto.randomUUID()) => ({
  webhookEventId: id,
  type: "message",
  timestamp: ++clock,
  source: { type: "user", userId },
  replyToken: crypto.randomUUID(),
  message: { type: "text", text },
});
const call = (path: string, method = "GET", body?: unknown, auth = true) =>
  mf.dispatchFetch("https://crm.test" + path, {
    method,
    headers: {
      ...(auth ? { "Cf-Access-Jwt-Assertion": adminJwt } : {}),
      Origin: "https://crm.test",
      "X-MetaBear-Request": "crm",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function waitForEvent(id: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const row = await db
      .prepare("SELECT status FROM webhook_events WHERE event_id=?")
      .bind(id)
      .first<{ status: string }>();
    if (row?.status === "done") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("Queued event did not finish: " + id);
}
async function webhook(
  events: unknown[],
  signature?: string,
  waitForProcessing = true,
) {
  const body = JSON.stringify({ events });
  const response = await mf.dispatchFetch("https://crm.test/webhook/line", {
    method: "POST",
    headers: {
      "X-Line-Signature":
        signature ??
        createHmac("sha256", lineSecret).update(body).digest("base64"),
    },
    body,
  });
  if (response.ok && waitForProcessing) {
    for (const e of events as any[]) {
      if (
        e?.source?.type === "user" &&
        ["follow", "unfollow", "message", "postback", "unsend"].includes(e.type)
      )
        await waitForEvent(e.webhookEventId);
    }
  }
  return response;
}
async function getCustomer(id = alice) {
  const response = await call("/api/customers/" + id);
  assert.equal(response.status, 200);
  return response.json() as Promise<any>;
}

before(async () => {
  const keys = await generateKeyPair("RS256");
  signingKey = keys.privateKey;
  publicJwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: "test-key",
    alg: "RS256",
  };
  adminJwt = await signAdmin();
  const result = await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: "2026-09-11",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      queueProducers: {
        LINE_EVENTS: "test-line-events",
        CAMPAIGN_EVENTS: "test-campaigns",
      },
      queueConsumers: {
        "test-campaigns": {
          maxBatchSize: 1,
          maxBatchTimeout: 0,
          maxRetries: 5,
          retryDelay: 0,
        },
        "test-line-events": {
          maxBatchSize: 1,
          maxBatchTimeout: 0,
          maxRetries: 5,
          retryDelay: 0,
        },
      },
      bindings: {
        ADMIN_TOKEN: adminToken,
        ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
        ACCESS_AUD: audience,
        ADMIN_EMAIL: owner,
        LINE_CHANNEL_SECRET: lineSecret,
        LINE_CHANNEL_ACCESS_TOKEN: "test",
        LINE_DELIVERY_MODE: "live",
        PUBLIC_BASE_URL: "https://crm.test",
        OPENAI_MODEL: "gpt-5.6-luna",
        OPENAI_API_KEY: "test-only-openai-key",
        ENVIRONMENT: "production",
      },
      outboundService: async (request) => {
        if (request.url === issuer + "/cdn-cgi/access/certs")
          return Response.json({ keys: [publicJwk] });
        if (request.url.endsWith("/message/quota"))
          return Response.json({ type: "limited", value: quotaLimit });
        if (request.url.endsWith("/message/quota/consumption"))
          return Response.json({ totalUsage: 0 });
        if (request.url.endsWith("/message/push")) {
          if (pushGate) await pushGate;
          const p = (await request.json()) as any;
          pushes.push({
            ...p,
            retryKey: request.headers.get("X-Line-Retry-Key")!,
          });
          if (pushMode === "retry") {
            pushMode = "accepted";
            return new Response("{}", { status: 503 });
          }
          if (pushMode === "accepted")
            return new Response("{}", {
              status: 409,
              headers: { "x-line-accepted-request-id": "mock" },
            });
          if (pushMode === "fail") return new Response("{}", { status: 400 });
          return Response.json({});
        }
        if (request.url === "https://api.openai.com/v1/responses") {
          aiCalls++;
          if (aiGate) await aiGate;
          if (aiMode === "unavailable")
            return new Response("{}", { status: 503 });
          const payload = (await request.json()) as any;
          const input = JSON.parse(payload.input[1].content);
          assert.equal(payload.store, false);
          assert.equal(payload.reasoning.effort, "none");
          assert.equal(payload.text.format.type, "json_schema");
          assert.equal(JSON.stringify(input).includes(alice), false);
          const route =
            input.question === "這個地方要寫誰介紹的？"
              ? { topic: "code", format: "image" }
              : fallbackRoute(
                  input.question,
                  input.currentTopic
                    ? {
                        topic: input.currentTopic,
                        format: "image",
                      }
                    : null,
                );
          return Response.json({
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(
                      aiMode === "invalid"
                        ? {
                            topic: "https://untrusted.test/image.jpg",
                            format: "image",
                          }
                        : route,
                    ),
                  },
                ],
              },
            ],
          });
        }
        assert.equal(request.url, "https://api.line.me/v2/bot/message/reply");
        if (failOnce) {
          failOnce = false;
          return new Response("{}", { status: 503 });
        }
        calls.push((await request.json()) as (typeof calls)[number]);
        return new Response("{}", { status: 200 });
      },
    }),
  );
  db = await mf.getD1Database("DB");
  const sql = (
    await Promise.all(
      (await readdir("migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => readFile("migrations/" + f, "utf8")),
    )
  ).join("\n");
  await db.batch(
    sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => db.prepare(s)),
  );
  await db
    .prepare(
      "INSERT INTO auth_admin_channels(email,line_user_id,enrolled_at,enrolled_event_id) VALUES (?,?,?,?)",
    )
    .bind(owner, alice, Date.now(), "test-admin-enrollment")
    .run();
});
after(async () => {
  await mf?.dispose();
});

test("Access JWT rejects spoofed headers, other accounts, expired tokens and cross-site mutations", async () => {
  const custom = (token: string, extra: Record<string, string> = {}) =>
    mf.dispatchFetch("https://crm.test/api/config", {
      headers: { "Cf-Access-Jwt-Assertion": token, ...extra },
    });
  assert.equal(
    (await custom("forged", { "Cf-Access-Authenticated-User-Email": owner }))
      .status,
    403,
  );
  assert.equal(
    (
      await mf.dispatchFetch("https://crm.test/api/config", {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).status,
    401,
  );
  assert.equal(
    (await custom(await signAdmin({ email: "other@example.test" }))).status,
    403,
  );
  const wrongAud = await new SignJWT({ email: owner })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience("other-app")
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(signingKey);
  const expired = await new SignJWT({ email: owner })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
    .sign(signingKey);
  assert.equal((await custom(wrongAud)).status, 403);
  assert.equal((await custom(expired)).status, 403);
  assert.equal(
    (
      await mf.dispatchFetch("https://crm.test/api/campaigns", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": adminJwt,
          Origin: "https://attacker.test",
          "X-MetaBear-Request": "crm",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await mf.dispatchFetch("https://crm.test/api/campaigns", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": adminJwt,
          Origin: "https://crm.test",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  const config = (await (await custom(adminJwt)).json()) as any;
  assert.equal(config.identity.email, owner);
});

test("admin endpoints reject missing/wrong credentials and disable development endpoints in production", async () => {
  assert.equal(
    (await call("/api/customers", "GET", undefined, false)).status,
    401,
  );
  assert.equal(
    (await call("/api/simulate", "POST", { text: "選單", userId: alice }))
      .status,
    404,
  );
  assert.equal((await call("/api/demo", "POST", {})).status, 404);
});
test("webhook verifies original body before processing; LINE verification accepts empty events", async () => {
  assert.equal((await webhook([event("UID 12345678")], "invalid")).status, 401);
  assert.equal(
    (
      await db
        .prepare("SELECT count(*) AS n FROM customers")
        .first<{ n: number }>()
    )?.n,
    0,
  );
  assert.equal((await webhook([])).status, 200);
  assert.equal(
    (await mf.dispatchFetch("https://crm.test/webhook/line")).status,
    405,
  );
});
test("registration and original image reply use fixed invitation code and public HTTPS", async () => {
  assert.equal((await webhook([event("我要註冊")])).status, 200);
  assert.match(String(calls.at(-1)?.messages[0]?.text), /ZD0CQ0/);
  assert.equal((await getCustomer()).customer.stage, "registering");
  assert.equal((await webhook([event("圖片教學 code")])).status, 200);
  assert.equal(calls.at(-1)?.messages[0].type, "text");
  assert.equal(calls.at(-1)?.messages[1].type, "image");
  assert.equal(
    calls.at(-1)?.messages[1].originalContentUrl,
    "https://crm.test/guides/register.jpg",
  );
});
test("admin command returns the protected dashboard link without using AI", async () => {
  const before = aiCalls;
  assert.equal((await webhook([event("後台")])).status, 200);
  assert.match(
    String(calls.at(-1)?.messages[0]?.text),
    /https:\/\/crm\.test\/admin/,
  );
  assert.equal(aiCalls, before);
});
test("greetings bypass lesson classification without starting registration or clearing progress", async () => {
  const user = "U78787878787878787878787878787878";
  const beforeAI = aiCalls;
  for (const greeting of [
    "哈嘍",
    "哈囉～",
    "哈啰",
    "嗨 👋",
    "你好！",
    "您好",
    "早安",
    "午安",
    "晚安",
    "安安",
    "在嗎？",
    "有人嗎",
    "Hi!",
    "HELLO",
    "ｈｉ",
  ]) {
    await webhook([event(greeting, user)]);
    const messages = calls.at(-1)!.messages as any[];
    assert.equal(messages.length, 1);
    assert.match(messages[0].text, /哈囉.*今天有什麼想了解/);
    assert.ok(messages[0].quickReply.items.length);
  }
  assert.equal(aiCalls, beforeAI);
  assert.equal((await getCustomer(user)).customer.stage, "new");
  assert.equal(
    await db
      .prepare("SELECT * FROM teaching_context WHERE line_user_id=?")
      .bind(user)
      .first(),
    null,
  );
  await webhook([event("圖片教學 deposit_bitopro 2", user)]);
  const beforeContext = await db
    .prepare("SELECT * FROM teaching_context WHERE line_user_id=?")
    .bind(user)
    .first();
  await webhook([event("哈嘍！", user)]);
  assert.deepEqual(
    await db
      .prepare("SELECT * FROM teaching_context WHERE line_user_id=?")
      .bind(user)
      .first(),
    beforeContext,
  );
  await webhook([event("下一張", user)]);
  assert.match((calls.at(-1)!.messages[0] as any).altText, /4\/14/);
});
test("greetings with an actual question still open the requested topic", async () => {
  const user = "U89898989898989898989898989898989";
  for (const [text, topic] of [
    ["哈嘍，我想問入金", "deposit"],
    ["你好，我要註冊", "register"],
    ["Hi，KYC 怎麼做？", "kyc"],
  ]) {
    assert.equal(isGreeting(text), false);
    await webhook([event(text, user)]);
    assert.equal((await getCustomer(user)).customer.guide_step, topic);
    assert.doesNotMatch(
      String(calls.at(-1)!.messages[0].text),
      /今天有什麼想了解/,
    );
  }
});
test("related question buttons open the named answer directly", async () => {
  await webhook([event("選單")]);
  await webhook([event("開始註冊")]);
  const message = calls.at(-1)?.messages[0] as any;
  const action = message.quickReply.items[0].action;
  assert.equal(action.type, "message");
  assert.equal(action.label, "邀請碼填在哪裡？");
  assert.equal(action.text, action.label);
  await webhook([event(action.text)]);
  assert.equal(calls.at(-1)?.messages[0].type, "text");
  assert.equal(calls.at(-1)?.messages[1].type, "image");
  assert.equal((await getCustomer()).customer.guide_step, "code");
});
test("same webhook is processed only once and group UID messages are ignored", async () => {
  const e = event("UID 12345678");
  const start = calls.length;
  assert.equal((await webhook([e])).status, 200);
  assert.equal((await webhook([e])).status, 200);
  assert.equal(calls.length, start + 1);
  const group = event("UID 23456789", bob);
  group.source.type = "group";
  assert.equal((await webhook([group])).status, 200);
  assert.equal(
    await db
      .prepare("SELECT * FROM customers WHERE line_user_id=?")
      .bind(bob)
      .first(),
    null,
  );
});
test("UID registration is pending, preserves verified accounts and prevents duplicate mapping", async () => {
  const c = await getCustomer();
  assert.equal(c.account.uid, "12345678");
  assert.equal(c.account.referral_status, "pending");
  assert.equal(
    (await call("/api/customers/" + alice, "PATCH", { stage: "joined" }))
      .status,
    400,
  );
  await webhook([event("UID 12345678", bob)]);
  assert.equal((await getCustomer(bob)).account, null);
  assert.match(String(calls.at(-1)?.messages[0].text), /暫時無法登記/);
  assert.equal(
    (
      await call("/api/customers/" + alice, "PATCH", {
        account: { uid: "12345678", referral_status: "verified" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/customers/" + alice, "PATCH", {
        stage: "joined",
        account: {
          uid: "12345678",
          referral_status: "verified",
          deposit_status: "verified",
          verification_note: "已核對推薦關係",
          deposit_note: "已核對 200 USDT 入金",
        },
      })
    ).status,
    200,
  );
  await webhook([event("UID 12345678")]);
  assert.equal((await getCustomer()).customer.stage, "joined");
  await webhook([event("UID 87654321")]);
  assert.equal((await getCustomer()).account.uid, "12345678");
  assert.equal(
    (
      await call("/api/customers/" + alice, "PATCH", {
        stage: "review",
        account: { uid: "87654321" },
      })
    ).status,
    200,
  );
  assert.equal((await getCustomer()).account.referral_status, "pending");
  assert.equal((await getCustomer()).account.deposit_status, "pending");
});
test("monthly volumes replace the same month and unknown amounts do not pass a zero-volume filter", async () => {
  const url = "/api/customers/" + alice + "/volume";
  assert.equal(
    (
      await call(url, "PUT", {
        month: "2026-09",
        volume_usdt: 20000,
        source: "manual",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(url, "PUT", {
        month: "2026-09",
        volume_usdt: 42000,
        source: "affiliate_report",
        note: "人工核對",
      })
    ).status,
    200,
  );
  assert.equal((await getCustomer()).volumes.length, 1);
  assert.equal((await getCustomer()).volumes[0].volume_usdt, 42000);
  assert.equal(
    (
      await call(url, "PUT", {
        month: "2026-19",
        volume_usdt: 10,
        source: "manual",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(url, "PUT", {
        month: "2026-09",
        volume_usdt: -1,
        source: "manual",
      })
    ).status,
    400,
  );
  const result = (await (
    await call("/api/customers?month=2026-09&min=0")
  ).json()) as any;
  assert.equal(result.total, 1);
  assert.equal(result.customers[0].line_user_id, alice);
  assert.equal((await call("/api/customers?min=99&max=10")).status, 400);
});
test("only explicit subscriptions enter campaign audience; unsubscribe and unfollow remove them", async () => {
  const audience = async () =>
    (await (await call("/api/audience?month=2026-09")).json()) as any;
  assert.equal((await audience()).total, 0);
  await call("/api/customers/" + alice, "PATCH", { marketing_consent: true });
  assert.equal((await audience()).total, 0);
  await webhook([event("訂閱通知")]);
  assert.equal((await audience()).total, 1);
  await webhook([event("退訂")]);
  assert.equal((await audience()).total, 0);
  await webhook([event("訂閱通知")]);
  const unfollow = { ...event("", alice), type: "unfollow" };
  await webhook([unfollow]);
  assert.equal((await audience()).total, 0);
  const stale = event("訂閱通知");
  stale.timestamp = unfollow.timestamp - 1;
  await webhook([stale]);
  assert.equal((await audience()).total, 0);
});
test("concept teaching allows leverage/stop loss and draft saving never sends messages", async () => {
  await webhook([event("槓桿是什麼")]);
  assert.match(String(calls.at(-1)?.messages[0].text), /名義/);
  await webhook([event("停損與強平")]);
  assert.match(String(calls.at(-1)?.messages[0].text), /強制平倉/);
  const n = calls.length;
  assert.equal(
    (
      await call("/api/campaigns", "POST", {
        title: "入門教學",
        body: "新教學已更新",
        filters: "month=2026-09",
      })
    ).status,
    201,
  );
  assert.equal(calls.length, n);
  assert.equal((await call("/api/campaigns/send", "POST", {})).status, 404);
});
test("transient LINE failures retry stored replies without repeating subscription audit", async () => {
  const before = await db
    .prepare("SELECT count(*) AS n FROM audit_log WHERE action='consent'")
    .first<{ n: number }>();
  failOnce = true;
  const e = event("訂閱通知");
  const sentBefore = calls.length;
  // Only one HTTP delivery: the queue must retry LINE independently.
  assert.equal((await webhook([e])).status, 200);
  const after = await db
    .prepare("SELECT count(*) AS n FROM audit_log WHERE action='consent'")
    .first<{ n: number }>();
  assert.equal(after?.n, (before?.n ?? 0) + 1);
  assert.equal(calls.length, sentBefore + 1);
});
test("concurrent duplicate requests produce a single reply", async () => {
  const e = event("選單");
  const n = calls.length;
  const responses = await Promise.all([webhook([e]), webhook([e])]);
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal((await webhook([e])).status, 200);
  assert.equal(calls.length, n + 1);
});

test("webhook acknowledges while AI is still pending; queue completes after HTTP connection closes", async () => {
  let release!: () => void;
  aiGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const e = event("我該如何註冊？");
  const n = calls.length;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      webhook([e], undefined, false),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Webhook waited for AI")),
          1500,
        );
      }),
    ]);
    assert.equal(response.status, 200);
    await response.body?.cancel();
    assert.equal(calls.length, n);
  } finally {
    clearTimeout(timer);
    release();
    aiGate = undefined;
  }
  await waitForEvent(e.webhookEventId);
  assert.equal(calls.length, n + 1);
  assert.match(JSON.stringify(calls.at(-1)!.messages), /ZD0CQ0/);
});

test("AI selects approved native images for semantic questions", async () => {
  await webhook([event("這個地方要寫誰介紹的？")]);
  const messages = calls.at(-1)!.messages;
  assert.equal(messages[0].type, "text");
  assert.match(String(messages[0].text), /Referral Code/);
  assert.match(String(messages[0].text), /ZD0CQ0/);
  assert.equal(messages[1].type, "image");
  assert.equal(
    messages[1].originalContentUrl,
    "https://crm.test/guides/register.jpg",
  );
  assert.equal((await getCustomer()).customer.guide_step, "code");
});

test("natural follow-ups attach available images and keep each user's context separate", async () => {
  const learner = "Ucccccccccccccccccccccccccccccccc";
  const other = "Udddddddddddddddddddddddddddddddd";
  await webhook([event("我該如何註冊？", learner)]);
  assert.equal(calls.at(-1)!.messages[0].type, "text");
  assert.equal(calls.at(-1)!.messages[1].type, "image");
  await webhook([event("給我看圖", learner)]);
  assert.equal(calls.at(-1)!.messages[1].type, "image");
  await webhook([event("看圖", other)]);
  assert.equal(
    calls.at(-1)!.messages.some((m) => m.type === "image"),
    false,
  );
  assert.match(String(calls.at(-1)!.messages[0].text), /你想了解/);
  await webhook([event("我已經註冊好了，接下來呢？", learner)]);
  const c = await getCustomer(learner);
  assert.equal(c.customer.guide_step, "kyc");
  assert.equal(c.customer.support_requested, 0);
  assert.equal(c.account, null);
  await webhook([event("看圖", learner)]);
  assert.equal(
    calls.at(-1)!.messages[1].originalContentUrl,
    "https://crm.test/guides/kyc.jpg",
  );
  await webhook([event("UID 要在哪裡找？", learner)]);
  assert.match(String(calls.at(-1)!.messages[0].text), /個人資料頁/);
  assert.equal((await getCustomer(learner)).account, null);
  await webhook([event("槓桿是什麼", learner)]);
  await webhook([event("給我看圖", learner)]);
  assert.equal(
    calls.at(-1)!.messages.some((m) => m.type === "image"),
    false,
  );
  assert.match(String(calls.at(-1)!.messages[0].text), /名義倉位/);
  assert.doesNotMatch(String(calls.at(-1)!.messages[0].text), /還沒有對應/);
});

test("high-confidence rules skip AI and route metrics expose latency without message text", async () => {
  const user = "U" + crypto.randomUUID().replaceAll("-", "");
  const before = aiCalls;
  const e = event("KYC 怎麼做", user);
  await webhook([e]);
  assert.equal(aiCalls, before);
  const route = await db
    .prepare("SELECT * FROM route_events WHERE event_id=?")
    .bind(e.webhookEventId)
    .first<any>();
  assert.equal(route.method, "rule");
  assert.equal(route.topic, "kyc");
  assert.ok(route.latency_ms >= 0);
  assert.ok(route.queue_delay_ms >= 0);
  assert.equal(JSON.stringify(route).includes("KYC 怎麼做"), false);
  const stats = (await (await call("/api/stats")).json()) as any;
  assert.ok(Number(stats.routing.total) >= 1);
  assert.ok(Array.isArray(stats.routing.methods));
});

test("unavailable or invalid AI output falls back to approved content without changing consent", async () => {
  const user = "Ueeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  try {
    for (const mode of ["invalid", "unavailable"] as const) {
      aiMode = mode;
      await webhook([event("註冊時邀請碼填在哪裡？", user)]);
      assert.match(JSON.stringify(calls.at(-1)!.messages), /ZD0CQ0/);
      assert.equal(
        JSON.stringify(calls.at(-1)!.messages).includes("untrusted.test"),
        false,
      );
      assert.equal((await getCustomer(user)).customer.marketing_consent, 0);
    }
  } finally {
    aiMode = "normal";
  }
});

test("every menu question works independently without AI or prior registration", async () => {
  const entry = menu();
  assert.equal(entry.type, "text");
  if (entry.type !== "text") return;
  const labels = entry.quickReply!.items.map(({ action }) => action.label);
  assert.deepEqual(labels, [
    "開始註冊",
    "入金教學",
    "查詢進度",
    "遇到問題",
    "更多教學",
  ]);
  const more = moreMenu();
  assert.equal(more.type, "text");
  const allLabels = [
    ...labels,
    ...(more.type === "text"
      ? more.quickReply!.items.map(({ action }) => action.label)
      : []),
  ];
  try {
    aiMode = "unavailable";
    for (const [topic, item] of Object.entries(STEPS)) {
      assert.ok(
        allLabels.includes(item.title) ||
          (topic === "register" && labels.includes("開始註冊")) ||
          (topic === "deposit" && labels.includes("入金教學")),
      );
      assert.ok(item.title.length <= 20);
      const user = "U" + crypto.randomUUID().replaceAll("-", "");
      await webhook([event(item.title, user)]);
      assert.equal((await getCustomer(user)).customer.guide_step, topic);
      assert.equal((await getCustomer(user)).account, null);
      const messages = calls.at(-1)!.messages;
      const expectedImages = Math.min(3, item.image ? 1 : 0);
      assert.equal(
        messages.filter((m) => m.type === "image").length,
        expectedImages,
      );
      assert.ok(messages.length <= 5);
      const answer = messages[0] as any;
      assert.match(
        answer.text ?? answer.altText,
        new RegExp(item.title.replace(/[？?]/g, "")),
      );
      const actions = answer.quickReply.items.map((i: any) => i.action);
      assert.ok(
        actions.every(
          (a: any) => !["下一步", "看文字", "看圖片"].includes(a.label),
        ),
      );
      if (!item.images)
        for (const related of item.related)
          assert.ok(actions.some((a: any) => a.text === STEPS[related].title));
      assert.ok((messages.at(-1) as any).quickReply);
    }
  } finally {
    aiMode = "normal";
  }
});

test("LINE images require HTTPS; missing images stay in the conversation with text", () => {
  assert.equal(
    guide("register", "http://localhost:8787").some((m) => m.type === "image"),
    false,
  );
  assert.equal(
    guide("register", "http://localhost:8787", true)[0].type,
    "text",
  );
  const messages = guide("deposit", "https://crm.test");
  assert.equal(messages.length, 2);
  assert.equal(
    messages.some((m) => m.type === "image"),
    false,
  );
  assert.equal(JSON.stringify(messages).includes("guide.html"), false);
});

test("deposit teaching pairs each website row and preserves navigation through LINE postbacks", async () => {
  const id = "U12121212121212121212121212121212";
  for (const topic of ["deposit_bitopro", "deposit_card"] as const) {
    const rows = guidePages(topic);
    await webhook([event(STEPS[topic].title, id)]);
    for (let page = 0; page < rows.length; page++) {
      const messages = calls.at(-1)!.messages as any[];
      assert.equal(messages.length, 1);
      const card = messages[0];
      assert.equal(card.type, "flex");
      assert.match(card.altText, new RegExp(page + 1 + "/" + rows.length));
      const images = card.contents.body.contents.filter(
        (c: any) => c.type === "image",
      );
      assert.equal(images.length, rows[page].src ? 1 : 0);
      if (images.length) {
        assert.equal(images[0].url, "https://crm.test" + rows[page].src);
        assert.equal(images[0].aspectMode, "fit");
        await readFile("public" + rows[page].src);
      }
      assert.equal(card.contents.body.contents.at(-1).text, rows[page].text);
      const buttons = card.contents.footer.contents.map((c: any) => c.action);
      assert.ok(buttons.some((a: any) => a.label === "選單"));
      assert.equal(
        buttons.some((a: any) => a.label === "上一張"),
        page > 0,
      );
      const next = buttons.find((a: any) => a.label === "下一張");
      assert.equal(Boolean(next), page + 1 < rows.length);
      if (next)
        await webhook([
          { ...event("", id), type: "postback", postback: { data: next.data } },
        ]);
      else assert.ok(buttons.some((a: any) => a.label === "提交 UID"));
    }
    await webhook([event("下一張", id)]);
    assert.match(
      (calls.at(-1)!.messages[0] as any).altText,
      new RegExp(rows.length + "/" + rows.length),
    );
    await webhook([event("上一張", id)]);
    assert.match(
      (calls.at(-1)!.messages[0] as any).altText,
      new RegExp(rows.length - 1 + "/" + rows.length),
    );
    // An old card always targets its own topic/page, regardless of current context.
    await webhook([event("圖片教學 " + topic + " 0", id)]);
    assert.match((calls.at(-1)!.messages[0] as any).altText, /1\//);
    await webhook([event("圖片教學 " + topic + " 99999", id)]);
    const context = await db
      .prepare("SELECT image_page FROM teaching_context WHERE line_user_id=?")
      .bind(id)
      .first<any>();
    assert.equal(context.image_page, rows.length - 1);
    await webhook([event("上一張", id)]);
    assert.match(
      (calls.at(-1)!.messages[0] as any).altText,
      new RegExp(rows.length - 1 + "/" + rows.length),
    );
  }
});
test("progress without UID offers submission instead of a waiting state", async () => {
  await webhook([event("我的進度", "U34343434343434343434343434343434")]);
  assert.match(String(calls.at(-1)!.messages[0].text), /還沒有提交/);
  assert.match(JSON.stringify(calls.at(-1)!.messages), /提交 UID/);
});
test("next step advances deposit cards but preserves registration topic progression", async () => {
  const user = "U56565656565656565656565656565656";
  aiMode = "unavailable";
  try {
    await webhook([event("開始註冊", user)]);
    await webhook([event("下一步", user)]);
    assert.equal((await getCustomer(user)).customer.guide_step, "code");
    await webhook([event("BitoPro 入金", user)]);
    await webhook([event("下一步", user)]);
    assert.match((calls.at(-1)!.messages[0] as any).altText, /2\/14/);
  } finally {
    aiMode = "normal";
  }
});
async function newPreview(id = alice) {
  await db
    .prepare(
      "UPDATE customers SET marketing_consent=1,blocked=0,preference=? WHERE line_user_id=?",
    )
    .bind("futures", id)
    .run();
  const draft = (await (
    await call("/api/campaigns", "POST", {
      title: "測試限定草稿",
      body: "教學更新（測試）",
      filters: "q=" + id + "&preference=futures",
    })
  ).json()) as any;
  const response = await call(`/api/campaigns/${draft.id}/preview`, "POST", {});
  assert.equal(response.status, 201);
  const preview = (await response.json()) as any;
  return { draft, preview };
}
async function waitRun(id: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const r = await db
      .prepare("SELECT status FROM campaign_runs WHERE id=?")
      .bind(id)
      .first<any>();
    if (r.status === "completed") return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail("Campaign did not complete");
}
test("campaign preview never sends; confirmation and queue retries use one immutable LINE retry key", async () => {
  const beforePush = pushes.length;
  const { draft, preview } = await newPreview();
  assert.equal(pushes.length, beforePush);
  assert.equal(preview.run.audience_count, 1);
  const path = `/api/campaigns/${draft.id}/send`;
  assert.equal(
    (await call(path, "POST", { runId: preview.run.id, confirmCount: 9 }))
      .status,
    400,
  );
  pushMode = "retry";
  const confirmation = { runId: preview.run.id, confirmCount: 1 };
  const results = await Promise.all([
    call(path, "POST", confirmation),
    call(path, "POST", confirmation),
  ]);
  assert.ok(results.every((r) => r.ok));
  await waitRun(preview.run.id);
  pushMode = "ok";
  const attempts = pushes.slice(beforePush);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].retryKey, attempts[1].retryKey);
  assert.equal(attempts[0].to, alice);
  assert.deepEqual(attempts[0].messages, attempts[1].messages);
  await call(path, "POST", confirmation);
  assert.equal(pushes.length, beforePush + 2);
  const delivery = await db
    .prepare("SELECT status FROM campaign_deliveries WHERE run_id=?")
    .bind(preview.run.id)
    .first<any>();
  assert.equal(delivery.status, "accepted");
});
test("confirmed campaign excludes recipients whose subscription or segment changes after preview", async () => {
  for (const update of [
    "marketing_consent=0",
    "preference='spot'",
    "blocked=1",
  ]) {
    const { draft, preview } = await newPreview();
    const beforePush = pushes.length;
    await db
      .prepare(`UPDATE customers SET ${update} WHERE line_user_id=?`)
      .bind(alice)
      .run();
    assert.equal(
      (
        await call(`/api/campaigns/${draft.id}/send`, "POST", {
          runId: preview.run.id,
          confirmCount: 1,
        })
      ).status,
      202,
    );
    await waitRun(preview.run.id);
    assert.equal(pushes.length, beforePush);
    const d = await db
      .prepare("SELECT status FROM campaign_deliveries WHERE run_id=?")
      .bind(preview.run.id)
      .first<any>();
    assert.equal(d.status, "skipped");
  }
});
test("expired previews and insufficient LINE quota cannot send; permanent errors finish visibly", async () => {
  const { draft, preview } = await newPreview();
  const path = `/api/campaigns/${draft.id}/send`;
  const body = { runId: preview.run.id, confirmCount: 1 };
  quotaLimit = 0;
  assert.equal((await call(path, "POST", body)).status, 409);
  quotaLimit = 1000;
  await db
    .prepare("UPDATE campaign_runs SET expires_at=? WHERE id=?")
    .bind(new Date(Date.now() - 1000).toISOString(), preview.run.id)
    .run();
  assert.equal((await call(path, "POST", body)).status, 409);
  const next = await newPreview();
  pushMode = "fail";
  await call(`/api/campaigns/${next.draft.id}/send`, "POST", {
    runId: next.preview.run.id,
    confirmCount: 1,
  });
  await waitRun(next.preview.run.id);
  pushMode = "ok";
  const r = await db
    .prepare("SELECT status,detail FROM campaign_deliveries WHERE run_id=?")
    .bind(next.preview.run.id)
    .first<any>();
  assert.equal(r.status, "failed");
  assert.match(r.detail, /400/);
});

test("durable outbox recovers interrupted queue submission and expired processing leases without resending completed deliveries", async () => {
  const { preview } = await newPreview();
  const id = preview.run.id;
  await db
    .prepare(
      "UPDATE campaign_runs SET status='queued',confirmed_at=? WHERE id=?",
    )
    .bind(new Date().toISOString(), id)
    .run();
  await db
    .prepare(
      "UPDATE campaign_deliveries SET status='sending',lease_until=? WHERE run_id=?",
    )
    .bind(new Date(Date.now() - 1000).toISOString(), id)
    .run();
  const producer = await mf.getQueueProducer("CAMPAIGN_EVENTS");
  const env = { DB: db, CAMPAIGN_EVENTS: producer } as unknown as Env;
  const before = pushes.length;
  await dispatchCampaigns(env, id);
  await waitRun(id);
  assert.equal(pushes.length, before + 1);
  await dispatchCampaigns(env, id);
  assert.equal(pushes.length, before + 1);
});

test("knowledge answers referral questions first, keeps context and marks only once", async () => {
  const user = "U" + crypto.randomUUID().replaceAll("-", "");
  const first = event("我已經有綁定其他人的邀請碼該怎麼辦", user);
  await webhook([first]);
  assert.match(String(calls.at(-1)!.messages[0].text), /推薦歸屬問題/);
  assert.match(String(calls.at(-1)!.messages[0].text), /已通知客服/);
  assert.equal((await getCustomer(user)).customer.support_requested, 1);
  await webhook([event("可以改嗎", user)]);
  assert.match(String(calls.at(-1)!.messages[0].text), /不能直接承諾/);
  assert.doesNotMatch(
    String(calls.at(-1)!.messages[0].text),
    /已通知客服|已標記/,
  );
  await webhook([event("槓桿", user)]);
  assert.match(String(calls.at(-1)!.messages[0].text), /槓桿/);
  const count = calls.length;
  await webhook([first]);
  assert.equal(calls.length, count);
  const transcript = (await (
    await call(`/api/customers/${user}/messages`)
  ).json()) as any;
  assert.equal(transcript.messages.length, 8);
  assert.equal(
    transcript.messages.filter(
      (m: any) => m.direction === "bot" && m.delivery_status === "accepted",
    ).length,
    5,
  );
  assert.equal(
    (await call(`/api/customers/${user}/messages`, "GET", undefined, false))
      .status,
    401,
  );
});

test("reviewed official FAQs are versioned and answer specific problems without AI", async () => {
  const beforeAI = aiCalls;
  const cases = [
    ["收不到驗證碼怎麼辦", "bingx-code-channel"],
    ["我的 Email 驗證碼沒有來", "bingx-email-code"],
    ["我收不到簡訊", "bingx-sms-code"],
    ["Google 驗證碼錯誤", "bingx-authenticator"],
    ["KYC 被退件怎麼辦？", "bingx-kyc-failed"],
    ["KYC 一直審核中", "bingx-kyc-pending"],
    ["入金沒到帳怎麼辦", "bingx-deposit-pending"],
    ["充值網路要選哪個", "bingx-deposit-network"],
    ["為什麼有最低充值數量", "bingx-deposit-minimum"],
    ["我漏填 Memo 了", "bingx-deposit-memo"],
    ["我的提幣被退回了", "bingx-withdraw-returned"],
    ["資金帳戶轉合約怎麼做", "bingx-account-transfer"],
    ["找不到 UID", "bingx-uid-location"],
  ];
  for (const [question, id] of cases) {
    const seed = faqSeed.find((a) => a.id === id)!;
    const article = await db
      .prepare("SELECT * FROM knowledge_articles WHERE id=?")
      .bind(id)
      .first<any>();
    assert.equal(article.answer, seed.answer);
    assert.match(article.source_note, /查核：2026-09-14/);
    assert.ok(article.source_note.includes(seed.source_url));
    assert.ok(
      await db
        .prepare(
          "SELECT 1 FROM knowledge_versions WHERE article_id=? AND revision=?",
        )
        .bind(id, article.revision)
        .first(),
    );
    const user = "U" + crypto.randomUUID().replaceAll("-", "");
    await webhook([event(question, user)]);
    assert.equal(calls.at(-1)!.messages[0].text, seed.answer, question);
    const card = calls.at(-1)!.messages.at(-1) as any;
    assert.equal(card.type, "flex");
    assert.ok(
      card.quickReply.items.some((i: any) => i.action.uri === seed.source_url),
    );
    assert.equal((await getCustomer(user)).customer.support_requested, 0);
  }
  assert.equal(aiCalls, beforeAI);
});

test("FAQ menus offer published questions and explicit channel buttons", async () => {
  const user = "U" + crypto.randomUUID().replaceAll("-", "");
  await webhook([event("常見問題", user)]);
  assert.equal(calls.at(-1)!.messages[0].type, "flex");
  for (const category of [
    "登入與驗證碼問題",
    "身分認證問題",
    "充值與提幣問題",
    "推薦碼與社群問題",
  ]) {
    await webhook([event(category, user)]);
    const card = calls.at(-1)!.messages[0] as any;
    assert.ok(card.quickReply.items.length <= 13);
    const first = card.contents.footer.contents[0].action;
    await webhook([
      event(first.text ?? new URLSearchParams(first.data).get("text"), user),
    ]);
    assert.equal(calls.at(-1)!.messages[0].type, "text");
  }
  await webhook([event("收不到驗證碼", user)]);
  const actions = (calls.at(-1)!.messages[0] as any).quickReply.items.map(
    (i: any) => i.action,
  );
  const sms = actions.find((a: any) => a.label === "簡訊收不到");
  await webhook([
    { ...event("", user), type: "postback", postback: { data: sms.data } },
  ]);
  assert.equal(
    calls.at(-1)!.messages[0].text,
    faqSeed.find((a) => a.id === "bingx-sms-code")!.answer,
  );
});

test("aliases survive final matching; context-only aliases do not become global answers", async () => {
  const phrase = "KYC照片被系統打回";
  await db
    .prepare(
      "INSERT INTO knowledge_aliases(article_id,phrase,normalized,weight) VALUES ('bingx-kyc-failed',?,?,20)",
    )
    .bind(phrase, normalizeKnowledge(phrase))
    .run();
  const candidates = await knowledgeCandidates(db, phrase);
  assert.equal(matchKnowledge(phrase, candidates)?.id, "bingx-kyc-failed");
  const user = "U" + crypto.randomUUID().replaceAll("-", "");
  await webhook([event(phrase, user)]);
  assert.equal(
    calls.at(-1)!.messages[0].text,
    faqSeed.find((a) => a.id === "bingx-kyc-failed")!.answer,
  );
  assert.equal(
    matchKnowledge("可以改嗎", await knowledgeCandidates(db, "可以改嗎")),
    undefined,
  );
});

test("FAQ migration preserves edits and withdrawals, and withdrawn articles leave menus and routing", async () => {
  const original = await db
    .prepare("SELECT * FROM knowledge_articles WHERE id='bingx-email-code'")
    .first<any>();
  await db
    .prepare(
      "UPDATE knowledge_articles SET status='draft',answer='管理員修改',revision=revision+1 WHERE id='bingx-email-code'",
    )
    .run();
  const migration = await readFile("migrations/0011_bingx_faq.sql", "utf8");
  await db.batch(
    migration
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => db.prepare(s)),
  );
  const edited = await db
    .prepare("SELECT * FROM knowledge_articles WHERE id='bingx-email-code'")
    .first<any>();
  assert.equal(edited.answer, "管理員修改");
  assert.equal(edited.status, "draft");
  assert.equal(
    (await knowledgeCandidates(db, original.title)).some(
      (a) => a.id === original.id,
    ),
    false,
  );
  const user = "U" + crypto.randomUUID().replaceAll("-", "");
  await webhook([event("登入與驗證碼問題", user)]);
  assert.equal(
    JSON.stringify(calls.at(-1)!.messages).includes(original.title),
    false,
  );
  await db
    .prepare(
      "UPDATE knowledge_articles SET status=?,answer=?,revision=? WHERE id=?",
    )
    .bind(original.status, original.answer, original.revision, original.id)
    .run();
});

test("support notification, claim, bot pause, resume and resolution form one workflow", async () => {
  const user = "U" + crypto.randomUUID().replaceAll("-", "");
  const beforePush = pushes.length;
  await webhook([event("人工協助", user)]);
  const pending = await db
    .prepare("SELECT * FROM support_cases WHERE line_user_id=?")
    .bind(user)
    .first<any>();
  assert.equal(pending.status, "pending");
  assert.equal(pending.notification_status, "sent");
  assert.equal(pushes.length, beforePush + 1);
  assert.doesNotMatch(JSON.stringify(pushes.at(-1)), new RegExp(user));

  assert.equal(
    (
      await call(`/api/customers/${user}`, "PATCH", {
        owner_name: "小熊客服",
        support_status: "claimed",
      })
    ).status,
    200,
  );
  await webhook([event("槓桿是什麼", user)]);
  assert.match(String(calls.at(-1)!.messages[0].text), /已接手|暫停/);
  await webhook([event("哈嘍", user)]);
  assert.match(String(calls.at(-1)!.messages[0].text), /已接手|暫停/);
  await webhook([event("繼續使用小幫手", user)]);
  await webhook([event("槓桿是什麼", user)]);
  assert.match(String(calls.at(-1)!.messages[0].text), /名義倉位/);
  assert.equal(
    (
      await call(`/api/customers/${user}`, "PATCH", {
        owner_name: "小熊客服",
        support_status: "resolved",
      })
    ).status,
    200,
  );
  assert.equal((await getCustomer(user)).customer.support_requested, 0);
  assert.equal(
    await db
      .prepare(
        "SELECT 1 FROM support_cases WHERE line_user_id=? AND status IN ('pending','claimed')",
      )
      .bind(user)
      .first(),
    null,
  );
  assert.equal(
    (
      await call(`/api/customers/${user}`, "PATCH", {
        owner_name: "小熊客服",
        support_status: "pending",
      })
    ).status,
    200,
  );
  assert.equal((await getCustomer(user)).customer.support_requested, 1);
  assert.equal((await activeSupportCase(db, user))?.status, "pending");
});

test("knowledge drafts, publish, revision conflicts and withdrawn context", async () => {
  const body = {
    title: "測試專屬問題",
    keywords: "特殊測試詞",
    answer: "經核對的專屬解法",
    source_note: "團隊測試",
    status: "draft",
    requires_support: false,
  };
  assert.equal(
    (await call("/api/knowledge", "GET", undefined, false)).status,
    401,
  );
  assert.equal(
    (
      await call("/api/knowledge", "POST", {
        ...body,
        status: "published",
        source_note: "",
      })
    ).status,
    400,
  );
  const created = (await (
    await call("/api/knowledge", "POST", body)
  ).json()) as any;
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS n FROM knowledge_versions WHERE article_id=?",
        )
        .bind(created.id)
        .first<{ n: number }>()
    )?.n,
    1,
  );
  const user = "Udddddddddddddddddddddddddddddddd";
  await webhook([event("特殊測試詞", user)]);
  assert.doesNotMatch(
    String(calls.at(-1)!.messages[0].text),
    /經核對的專屬解法/,
  );
  assert.equal(
    (
      await call("/api/knowledge/" + created.id, "PUT", {
        ...body,
        status: "published",
        revision: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS n FROM knowledge_versions WHERE article_id=?",
        )
        .bind(created.id)
        .first<{ n: number }>()
    )?.n,
    2,
  );
  assert.equal(
    (
      await call("/api/knowledge/" + created.id, "PUT", {
        ...body,
        revision: 1,
      })
    ).status,
    409,
  );
  await webhook([event("特殊測試詞", user)]);
  assert.equal(calls.at(-1)!.messages[0].text, body.answer);
  assert.equal(
    (
      await call("/api/knowledge/" + created.id, "PUT", {
        ...body,
        revision: 2,
      })
    ).status,
    200,
  );
  aiMode = "unavailable";
  try {
    await webhook([event("看不懂", user)]);
    assert.doesNotMatch(
      String(calls.at(-1)!.messages[0].text),
      /經核對的專屬解法|undefined/,
    );
  } finally {
    aiMode = "normal";
  }
});

test("transcripts redact credentials, scope context, paginate and expire", async () => {
  const user = "U" + crypto.randomUUID().replaceAll("-", "");
  assert.doesNotMatch(
    redactConversation("Secret: test-sensitive-value\n驗證碼 123456"),
    /test-sensitive-value|123456/,
  );
  assert.equal(
    redactConversation("綁定後台 abcd-1234"),
    "[後台登入綁定指令已隱藏]",
  );
  await db.batch(
    Array.from({ length: 55 }, (_, i) =>
      db
        .prepare(
          "INSERT INTO conversation_messages(message_key,line_user_id,event_id,direction,message_type,content,delivery_status,occurred_at) VALUES (?,?,?,'user','text',?,'received',?)",
        )
        .bind("page:" + i, user, "page:" + i, "問題" + i, Date.now()),
    ),
  );
  const first = (await (
    await call(`/api/customers/${user}/messages`)
  ).json()) as any;
  assert.equal(first.messages.length, 50);
  assert.equal(first.messages[0].content, "問題5");
  const second = (await (
    await call(`/api/customers/${user}/messages?before=${first.nextBefore}`)
  ).json()) as any;
  assert.equal(second.messages.length, 5);
  assert.equal(second.messages[0].content, "問題0");
  assert.equal(second.nextBefore, null);
  assert.equal(
    (await call(`/api/customers/${user}/messages?before=-1`)).status,
    400,
  );
  const recent = await recentConversation(db as any, user, "page:54");
  assert.equal(recent.length, 6);
  assert.equal(recent.at(-1)!.text, "問題53");
  await db
    .prepare(
      "UPDATE conversation_messages SET occurred_at=1 WHERE line_user_id=?",
    )
    .bind(user)
    .run();
  await cleanupConversations({ DB: db } as unknown as Env);
  assert.equal(
    ((await (await call(`/api/customers/${user}/messages`)).json()) as any)
      .messages.length,
    0,
  );
});

test("unsends remove received text and suppress late-arriving original content", async () => {
  const user = "Uffffffffffffffffffffffffffffffff";
  const original = {
    ...event("槓桿", user),
    message: { type: "text", text: "槓桿", id: "withdraw-one" },
  };
  await webhook([original]);
  const unsend = (messageId: string) => ({
    ...event("", user),
    type: "unsend",
    message: undefined,
    replyToken: undefined,
    unsend: { messageId },
  });
  await webhook([unsend("withdraw-one")]);
  const late = {
    ...event("不應保留的文字", user),
    message: { type: "text", text: "不應保留的文字", id: "withdraw-two" },
  };
  await webhook([unsend("withdraw-two")]);
  await webhook([late]);
  const transcript = (await (
    await call(`/api/customers/${user}/messages`)
  ).json()) as any;
  assert.equal(
    transcript.messages.filter((m: any) => m.message_type === "unsent").length,
    2,
  );
  assert.equal(
    transcript.messages.some((m: any) => m.content === "不應保留的文字"),
    false,
  );
});
