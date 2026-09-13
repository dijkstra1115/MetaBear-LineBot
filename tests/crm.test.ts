import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { dispatchCampaigns } from "../src/campaigns";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fallbackRoute } from "../src/assistant";
import { guide } from "../src/content";
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
        ["follow", "unfollow", "message", "postback"].includes(e.type)
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
        OPENAI_MODEL: "gpt-4.1-mini",
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
          if (aiGate) await aiGate;
          if (aiMode === "unavailable")
            return new Response("{}", { status: 503 });
          const payload = (await request.json()) as any;
          const input = JSON.parse(payload.input[1].content);
          assert.equal(payload.store, false);
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
                        format: input.preferredFormat,
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
  assert.match(String(calls.at(-1)?.messages[0].text), /ZD0CQ0/);
  assert.equal((await getCustomer()).customer.stage, "registering");
  assert.equal((await webhook([event("圖片教學 code")])).status, 200);
  assert.equal(calls.at(-1)?.messages[0].type, "image");
  assert.equal(
    calls.at(-1)?.messages[0].originalContentUrl,
    "https://crm.test/guides/register.jpg",
  );
});
test("postback buttons preserve step context without exposing internal commands", async () => {
  await webhook([event("選單")]);
  await webhook([event("開始註冊")]);
  const message = calls.at(-1)?.messages[0] as any;
  const action = message.quickReply.items[0].action;
  assert.equal(action.type, "postback");
  assert.equal(action.displayText, "看圖片");
  const e = { ...event(""), type: "postback", postback: { data: action.data } };
  await webhook([e]);
  assert.equal(calls.at(-1)?.messages[0].type, "image");
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
  assert.equal(messages[0].type, "image");
  assert.equal(
    messages[0].originalContentUrl,
    "https://crm.test/guides/register.jpg",
  );
  assert.match(String(messages[1].text), /Referral Code/);
  assert.match(String(messages[1].text), /ZD0CQ0/);
  assert.equal((await getCustomer()).customer.guide_step, "code");
});

test("natural follow-ups preserve format, advance teaching, and keep each user's context separate", async () => {
  const learner = "Ucccccccccccccccccccccccccccccccc";
  const other = "Udddddddddddddddddddddddddddddddd";
  await webhook([event("我該如何註冊？", learner)]);
  assert.equal(calls.at(-1)!.messages[0].type, "text");
  await webhook([event("給我看圖", learner)]);
  assert.equal(calls.at(-1)!.messages[0].type, "image");
  await webhook([event("看圖", other)]);
  assert.equal(
    calls.at(-1)!.messages.some((m) => m.type === "image"),
    false,
  );
  assert.match(String(calls.at(-1)!.messages[0].text), /你想了解/);
  await webhook([event("文字就好", learner)]);
  assert.equal(
    calls.at(-1)!.messages.some((m) => m.type === "image"),
    false,
  );
  await webhook([event("我已經註冊好了，接下來呢？", learner)]);
  const c = await getCustomer(learner);
  assert.equal(c.customer.guide_step, "kyc");
  assert.equal(c.customer.support_requested, 0);
  assert.equal(c.account, null);
  await webhook([event("看圖", learner)]);
  assert.equal(
    calls.at(-1)!.messages[0].originalContentUrl,
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
  assert.match(String(calls.at(-1)!.messages[0].text), /還沒有對應/);
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

test("LINE images require HTTPS; missing images stay in the conversation with text", () => {
  assert.equal(
    guide("register", "http://localhost:8787", true).some(
      (m) => m.type === "image",
    ),
    false,
  );
  assert.equal(
    guide("register", "http://localhost:8787", true, true)[0].type,
    "image",
  );
  const messages = guide("deposit", "https://crm.test", true);
  assert.equal(
    messages.some((m) => m.type === "image"),
    false,
  );
  assert.equal(JSON.stringify(messages).includes("guide.html"), false);
});

test("deposit teaching selects each method and paginates approved images in LINE", async () => {
  const id = "Uffffffffffffffffffffffffffffffff";
  await webhook([event("入金教學", id)]);
  assert.match(JSON.stringify(calls.at(-1)!.messages), /BitoPro/);
  for (const [method, prefix, last] of [
    ["BitoPro 入金", "bitopro-", 7],
    ["信用卡入金", "credit-", 8],
  ] as const) {
    await webhook([event(method, id)]);
    await webhook([event("看圖", id)]);
    const images = () =>
      calls.at(-1)!.messages.filter((m) => m.type === "image");
    assert.equal(images().length, 3);
    assert.match(String(images()[0].originalContentUrl), new RegExp(prefix));
    const first = images()[0].originalContentUrl;
    const lastText = calls.at(-1)!.messages.at(-1) as any;
    const action = lastText.quickReply.items.find(
      (a: any) => a.action.label === "看下一組圖",
    ).action;
    const click = {
      ...event("", id),
      type: "postback",
      postback: { data: action.data },
    };
    await webhook([click]);
    assert.equal(images().length, 3);
    assert.notEqual(images()[0].originalContentUrl, first);
    await webhook([
      event(prefix === "credit-" ? "看下一組圖" : "下一組圖", id),
    ]);
    assert.equal(images().length, last - 6);
    assert.ok(calls.at(-1)!.messages.length <= 5);
    assert.match(JSON.stringify(calls.at(-1)!.messages), /200 USDT/);
    await webhook([event("看文字", id)]);
    assert.equal(images().length, 0);
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
