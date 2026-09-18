import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { enrollFromLine } from "../src/auth-enrollment";

const owner = "owner@example.test";
const analyst = "analyst@example.test";
const alice = "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const analystLine = "Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const issuer = "https://test.cloudflareaccess.com";
const audience = "test-audience";
const adminToken = "test-admin-token-not-a-live-credential-123456";
const lineSecret = "test-line-secret";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
let adminJwt: string, signingKey: CryptoKey, publicJwk: JsonWebKey;
let mf: Miniflare, db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
const pushes: { to: string; messages: any[]; retryKey: string }[] = [];
const replies: { replyToken: string; messages: any[] }[] = [];
let clock = Date.now();
const signAdmin = () =>
  new SignJWT({ email: owner })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("owner-id")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(signingKey);
const call = (
  path: string,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
) =>
  mf.dispatchFetch("https://crm.test" + path, {
    method,
    headers: {
      "Cf-Access-Jwt-Assertion": extra.jwt ?? adminJwt,
      Origin: extra.Origin ?? "https://crm.test",
      "X-MetaBear-Request": extra["X-MetaBear-Request"] ?? "crm",
      "Content-Type": "application/json",
      Cookie: extra.Cookie ?? "",
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const event = (text: string, userId = alice, id = crypto.randomUUID()) => ({
  webhookEventId: id,
  type: "message",
  timestamp: ++clock,
  source: { type: "user", userId },
  replyToken: crypto.randomUUID(),
  message: { type: "text", text },
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
async function webhook(events: unknown[]) {
  const body = JSON.stringify({ events });
  const response = await mf.dispatchFetch("https://crm.test/webhook/line", {
    method: "POST",
    headers: {
      "X-Line-Signature": createHmac("sha256", lineSecret)
        .update(body)
        .digest("base64"),
    },
    body,
  });
  if (response.ok) {
    for (const e of events as any[]) {
      if (e?.source?.type === "user" && e.type === "message")
        await waitForEvent(e.webhookEventId);
    }
  }
  return response;
}
async function waitSignal(id: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const row = await db
      .prepare("SELECT status FROM signals WHERE id=?")
      .bind(id)
      .first<{ status: string }>();
    if (row && row.status !== "queued") return row.status;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("Signal did not finish: " + id);
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
        AUTH_CHANNEL: "line",
        LINE_CHANNEL_SECRET: lineSecret,
        LINE_CHANNEL_ACCESS_TOKEN: "test",
        LINE_DELIVERY_MODE: "live",
        PUBLIC_BASE_URL: "https://crm.test",
        OPENAI_MODEL: "gpt-5.6-luna",
        OPENAI_API_KEY: "test-only-openai-key",
        ENVIRONMENT: "production",
      },
      serviceBindings: {
        ASSETS: async () => new Response("<html>private workspace</html>"),
      },
      outboundService: async (request: Request) => {
        if (request.url.startsWith("https://api.line.me/v2/bot/profile/"))
          return Response.json({
            displayName: "LINE暱稱",
            userId: request.url.split("/").at(-1),
          });
        if (request.url.endsWith("/chat/loading/start"))
          return new Response("{}", { status: 200 });
        if (request.url === issuer + "/cdn-cgi/access/certs")
          return Response.json({ keys: [publicJwk] });
        if (request.url.endsWith("/message/quota"))
          return Response.json({ type: "limited", value: 1000 });
        if (request.url.endsWith("/message/quota/consumption"))
          return Response.json({ totalUsage: 0 });
        if (request.url.endsWith("/message/push")) {
          const p = (await request.json()) as any;
          pushes.push({
            ...p,
            retryKey: request.headers.get("X-Line-Retry-Key")!,
          });
          return Response.json({});
        }
        if (request.url === "https://api.openai.com/v1/responses")
          return Response.json({
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ topic: "register", format: "auto" }),
                  },
                ],
              },
            ],
          });
        assert.equal(request.url, "https://api.line.me/v2/bot/message/reply");
        replies.push((await request.json()) as (typeof replies)[number]);
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
        .map((f) =>
          readFile("migrations/" + f, "utf8").then((s) =>
            s.replaceAll("\r\n", "\n"),
          ),
        ),
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
beforeEach(async () => {
  pushes.length = 0;
  replies.length = 0;
  await db.exec(
    "DELETE FROM signal_deliveries; DELETE FROM signals; DELETE FROM signal_images; DELETE FROM customer_signal_subs; DELETE FROM staff; DELETE FROM auth_sessions; DELETE FROM auth_challenges; DELETE FROM auth_line_enrollments; DELETE FROM auth_rate_limits; UPDATE team_settings SET signals_enabled=1;",
  );
  await db
    .prepare(
      "INSERT OR IGNORE INTO customers(line_user_id,stage,blocked) VALUES (?,?,0)",
    )
    .bind(alice, "joined")
    .run();
  await db
    .prepare(
      "UPDATE customers SET stage='joined',blocked=0 WHERE line_user_id=?",
    )
    .bind(alice)
    .run();
});

test("LINE users opt into signal categories separately from marketing", async () => {
  const id = crypto.randomUUID();
  await webhook([event("報單通知", alice, id)]);
  const text = JSON.stringify(replies.at(-1));
  assert.match(text, /BTC/);
  assert.match(text, /未訂閱/);
  await webhook([event("訂閱報單 BTC")]);
  assert.match(JSON.stringify(replies.at(-1)), /已訂閱 BTC/);
  const sub = await db
    .prepare(
      "SELECT category_id FROM customer_signal_subs WHERE line_user_id=?",
    )
    .bind(alice)
    .first();
  assert.equal(sub?.category_id, "BTC");
  const customer = await db
    .prepare("SELECT marketing_consent FROM customers WHERE line_user_id=?")
    .bind(alice)
    .first<{ marketing_consent: number }>();
  assert.equal(customer?.marketing_consent, 0);
});

test("admin can manage analysts, kill switch, and send without exposing recipients", async () => {
  const created = await call("/api/staff", "POST", {
    email: analyst,
    name: "阿熊",
  });
  assert.equal(created.status, 201, await created.clone().text());
  assert.equal(
    (await call("/api/staff", "POST", { email: owner, name: "管理員" })).status,
    400,
  );
  assert.equal(
    (
      await call(`/api/staff/${encodeURIComponent(owner)}`, "PATCH", {
        enabled: false,
      })
    ).status,
    400,
  );
  const roster = await (await call("/api/staff")).json();
  const me = roster.staff.find((row: { email: string }) => row.email === owner);
  assert.equal(me?.owner, true);
  assert.equal(me?.name, "管理員");
  assert.equal(me?.enabled, 1);
  const enrollment = await call(
    `/api/staff/${encodeURIComponent(analyst)}/line-enrollment`,
    "POST",
    {},
  );
  assert.equal(enrollment.status, 200, await enrollment.clone().text());
  const command = ((await enrollment.json()) as { command: string }).command;
  const bound = await enrollFromLine(
    { DB: db, ADMIN_EMAIL: owner, AUTH_CHANNEL: "line" } as Env,
    analystLine,
    command,
    "analyst-bind",
  );
  assert.match((bound![0] as { text: string }).text, /工作台登入綁定/);
  await webhook([event("訂閱報單 BTC")]);
  const preview = await call("/api/desk/preview?category=BTC");
  assert.equal(preview.status, 200, await preview.clone().text());
  assert.deepEqual(await preview.json(), { categoryId: "BTC", count: 1 });
  const sent = await call("/api/desk/signals", "POST", {
    categoryId: "BTC",
    direction: "long",
    leverage: "10x",
    entry: "98000",
    takeProfit: "102000",
    stopLoss: "96000",
    note: "短線",
    image: png,
    confirmCount: 1,
  });
  assert.equal(sent.status, 202, await sent.clone().text());
  const body = (await sent.json()) as any;
  assert.equal(body.audienceCount, 1);
  assert.equal(JSON.stringify(body).includes(alice), false);
  await waitSignal(body.id);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].to, alice);
  assert.equal(pushes[0].messages[0].type, "flex");
  assert.match(pushes[0].messages[0].altText, /BTC 做多 10x/);
  assert.match(JSON.stringify(pushes[0].messages), /非投資建議/);
  assert.equal(JSON.stringify(pushes[0].messages).includes(alice), false);
  const media = await mf.dispatchFetch(
    "https://crm.test" + body.imageUrl.replace("https://crm.test", ""),
  );
  assert.equal(media.status, 200);
  assert.equal(media.headers.get("content-type"), "image/png");
  const listed = (await (await call("/api/signals")).json()) as any;
  assert.equal(listed.signals[0].audienceCount, 1);
  assert.equal(JSON.stringify(listed).includes(alice), false);
  assert.equal(
    (await call("/api/signals/settings", "POST", { enabled: false })).status,
    200,
  );
  assert.equal(
    (
      await call("/api/desk/signals", "POST", {
        categoryId: "BTC",
        direction: "short",
        leverage: "5x",
        entry: "1",
        takeProfit: "2",
        stopLoss: "0.5",
        confirmCount: 1,
      })
    ).status,
    409,
  );
});

test("unsubscribed users are excluded before send; in-flight deliveries are skipped", async () => {
  await webhook([event("訂閱報單 ETH")]);
  await db
    .prepare("DELETE FROM customer_signal_subs WHERE line_user_id=?")
    .bind(alice)
    .run();
  assert.equal(
    (
      await call("/api/desk/signals", "POST", {
        categoryId: "ETH",
        direction: "short",
        leverage: "8x",
        entry: "2500",
        takeProfit: "2400",
        stopLoss: "2550",
        confirmCount: 1,
      })
    ).status,
    400,
  );
  await webhook([event("訂閱報單 ETH")]);
  const id = crypto.randomUUID();
  const deliveryId = crypto.randomUUID();
  const created = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO signals(id,analyst_email,category_id,direction,leverage,entry,take_profit,stop_loss,note,audience_count,created_at,created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        owner,
        "ETH",
        "short",
        "8x",
        "2500",
        "2400",
        "2550",
        "",
        1,
        created,
        owner,
      ),
    db
      .prepare(
        "INSERT INTO signal_deliveries(id,signal_id,line_user_id) VALUES (?,?,?)",
      )
      .bind(deliveryId, id, alice),
  ]);
  await db
    .prepare("DELETE FROM customer_signal_subs WHERE line_user_id=?")
    .bind(alice)
    .run();
  const { processSignal } = await import("../src/signals");
  await processSignal({ kind: "signal-delivery", id: deliveryId }, {
    DB: db,
    LINE_DELIVERY_MODE: "live",
    LINE_CHANNEL_ACCESS_TOKEN: "test",
    PUBLIC_BASE_URL: "https://crm.test",
    ADMIN_EMAIL: owner,
  } as Env);
  const delivery = await db
    .prepare("SELECT status FROM signal_deliveries WHERE id=?")
    .bind(deliveryId)
    .first<{ status: string }>();
  assert.equal(delivery?.status, "skipped");
  await webhook([event("訂閱報單 ETH")]);
  await db
    .prepare(
      "INSERT INTO auth_rate_limits(bucket,count,reset_at) VALUES (?,?,?) ON CONFLICT(bucket) DO UPDATE SET count=excluded.count,reset_at=excluded.reset_at",
    )
    .bind("signal-hour:" + owner, 8, Math.floor(Date.now() / 1000) + 3600)
    .run();
  assert.equal(
    (
      await call("/api/desk/signals", "POST", {
        categoryId: "ETH",
        direction: "long",
        leverage: "3x",
        entry: "1",
        takeProfit: "2",
        stopLoss: "0.5",
        confirmCount: 1,
      })
    ).status,
    429,
  );
});
