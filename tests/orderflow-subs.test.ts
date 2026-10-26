import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Members' LINE order-flow alerts: subscribing with the /alerts/ keyword, the VIP rule as the gate,
// fan-out from the collector's events with types, daily counts and quiet hours, and delivery.
const lineSecret = "test-line-secret";
const alertToken = "test-orderflow-alert-token-not-a-live-credential";
const alice = "U" + "a1".repeat(16);
const bob = "U" + "b2".repeat(16);
const carol = "U" + "c3".repeat(16);
let mf: Miniflare, db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
const pushes: { to: string; messages: any[]; retryKey: string }[] = [];
const replies: { replyToken: string; messages: any[] }[] = [];
let quotaUsed = 0;
let clock = Date.now();

const event = (text: string, userId: string, id = crypto.randomUUID()) => ({
  webhookEventId: id,
  type: "message",
  timestamp: ++clock,
  source: { type: "user", userId },
  replyToken: crypto.randomUUID(),
  message: { type: "text", text },
});
async function say(userId: string, text: string) {
  const e = event(text, userId);
  const body = JSON.stringify({ events: [e] });
  const res = await mf.dispatchFetch("https://crm.test/webhook/line", {
    method: "POST",
    headers: { "X-Line-Signature": createHmac("sha256", lineSecret).update(body).digest("base64") },
    body,
  });
  assert.equal(res.status, 200);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const row = await db.prepare("SELECT status FROM webhook_events WHERE event_id=?").bind(e.webhookEventId).first<{ status: string }>();
    if (row?.status === "done") break;
    await new Promise((r) => setTimeout(r, 20));
  }
  const reply = replies.find((r) => r.replyToken === e.replyToken);
  assert.ok(reply, "the bot replied");
  return reply.messages.map((m) => m.text ?? "").join("\n");
}
const post = (body: unknown, token = alertToken) =>
  mf.dispatchFetch("https://crm.test/api/internal/orderflow-alert", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
async function settle() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const open = await db.prepare("SELECT count(*) AS n FROM orderflow_alert_deliveries WHERE status IN ('pending','sending')").first<{ n: number }>();
    if (!open?.n) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail("deliveries did not finish");
}
// 12:00 in Taiwan on 2026-10-22, and 01:00 the next Taiwan day.
const noon = Date.parse("2026-10-22T04:00:00Z");
const night = Date.parse("2026-10-22T17:00:00Z");
const ev = (key: string, kind: string, t = noon, m?: string) => ({ key, t, kind, text: `${kind} 測試事件｜VWAP 81,900（差 $10）`, at: Math.floor(t / 60_000) * 60_000, ...(m ? { m } : {}) });

before(async () => {
  const result = await build({ entryPoints: ["src/index.ts"], bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022" });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: "2026-09-11",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      queueProducers: { LINE_EVENTS: "test-line-events", CAMPAIGN_EVENTS: "test-campaigns" },
      queueConsumers: {
        "test-campaigns": { maxBatchSize: 1, maxBatchTimeout: 0, maxRetries: 5, retryDelay: 0 },
        "test-line-events": { maxBatchSize: 1, maxBatchTimeout: 0, maxRetries: 5, retryDelay: 0 },
      },
      bindings: {
        ADMIN_TOKEN: "test-admin-token-not-a-live-credential-123456",
        ADMIN_EMAIL: "owner@example.test",
        AUTH_CHANNEL: "line",
        LINE_CHANNEL_SECRET: lineSecret,
        LINE_CHANNEL_ACCESS_TOKEN: "test",
        LINE_DELIVERY_MODE: "live",
        PUBLIC_BASE_URL: "https://crm.test",
        OPENAI_MODEL: "gpt-5.6-luna",
        OPENAI_API_KEY: "test-only-openai-key",
        ENVIRONMENT: "production",
        ORDERFLOW_ALERT_TOKEN: alertToken,
      },
      serviceBindings: { ASSETS: async () => new Response("<html></html>") },
      outboundService: async (request: Request) => {
        if (request.url.startsWith("https://api.line.me/v2/bot/profile/")) return Response.json({ displayName: "LINE暱稱", userId: request.url.split("/").at(-1) });
        if (request.url.endsWith("/chat/loading/start")) return new Response("{}");
        if (request.url.endsWith("/message/quota")) return Response.json({ type: "limited", value: 1000 });
        if (request.url.endsWith("/message/quota/consumption")) return Response.json({ totalUsage: quotaUsed });
        if (request.url.endsWith("/message/push")) {
          pushes.push({ ...((await request.json()) as any), retryKey: request.headers.get("X-Line-Retry-Key")! });
          return Response.json({});
        }
        if (request.url.endsWith("/message/reply")) {
          replies.push((await request.json()) as (typeof replies)[number]);
          return new Response("{}");
        }
        throw new Error("unexpected request " + request.url);
      },
    }),
  );
  db = await mf.getD1Database("DB");
  const sql = (
    await Promise.all(
      (await readdir("migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => readFile("migrations/" + f, "utf8").then((s) => s.replaceAll("\r\n", "\n"))),
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

test("only members can subscribe, with the keyword from /alerts/", async () => {
  const notYet = await say(alice, "訂閱警報 吸收,掃蕩收回 每天2則 安靜00-08");
  assert.match(notYet, /60 日內累計入金 200 USDT（不含內部轉帳）/);
  assert.match(notYet, /還沒有提交 BingX UID/);
  assert.equal(await db.prepare("SELECT 1 FROM orderflow_alert_subs WHERE line_user_id=?").bind(alice).first(), null);

  assert.match(await say(alice, "訂閱警報 每天9則"), /每天最多可以選 1 到 3 則/);

  await db.prepare("UPDATE customers SET stage='joined' WHERE line_user_id=?").bind(alice).run();
  const done = await say(alice, "訂閱警報 吸收,掃蕩收回 每天2則 安靜00-08");
  assert.match(done, /已開通 LINE 關鍵位提醒/);
  assert.match(done, /幣種：BTC\n事件：吸收、掃蕩收回/);
  assert.match(done, /安靜時段（台灣時間）：00:00–08:00/);
  assert.deepEqual(await db.prepare("SELECT kinds,daily,quiet,markets FROM orderflow_alert_subs WHERE line_user_id=?").bind(alice).first(), {
    kinds: "absorption,sweep",
    daily: 2,
    quiet: "00-08",
    markets: "btc",
  });
  assert.match(await say(alice, "警報設定"), /每天最多 2 則/);

  // A current eligible BingX check also counts; a stale one (an older settings revision) does not.
  await say(bob, "選單");
  const revision = (await db.prepare("SELECT revision FROM team_settings WHERE id=1").first<{ revision: number }>())!.revision;
  await db
    .prepare("INSERT INTO exchange_snapshots VALUES (?,?,?,?,?,?,?)")
    .bind(bob, "90000001", "{}", "eligible", "[]", revision - 1, new Date().toISOString())
    .run();
  await db.prepare("INSERT INTO exchange_accounts(line_user_id,exchange,uid) VALUES (?,'bingx','90000001')").bind(bob).run();
  assert.match(await say(bob, "訂閱警報"), /會員資格查詢中或需要更新/);
  await db.prepare("UPDATE exchange_snapshots SET settings_revision=? WHERE line_user_id=?").bind(revision, bob).run();
  assert.match(await say(bob, "訂閱警報"), /事件：全部\n每天最多 3 則/);

  // Carol has a subscription row but is not a member.
  await say(carol, "選單");
  await db.prepare("INSERT INTO orderflow_alert_subs(line_user_id,kinds,daily,quiet,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(carol, "sweep", 3, "", "x", "x").run();
});

test("events reach the subscribers who chose them, within their daily count and outside quiet hours", async () => {
  assert.equal((await post({ events: [ev("k0", "sweep")] }, "wrong")).status, 401);
  assert.equal((await post({ events: [{ ...ev("k0", "sweep"), kind: "test" }] })).status, 400);
  assert.equal((await post({ events: [ev("k0", "sweep", noon, "doge")] })).status, 400);

  const first = await post({ events: [ev("k1", "sweep"), ev("k2", "absorption"), ev("k3", "print"), ev("k4", "sweep")] });
  assert.deepEqual(await first.json(), { queued: 5, dropped: 0 });
  await settle();
  const to = (user: string) => pushes.filter((p) => p.to === user);
  assert.equal(to(alice).length, 2, "alice chose sweeps and absorption, two a day");
  assert.equal(to(bob).length, 3, "bob chose everything, three a day");
  assert.equal(to(carol).length, 0, "not a member");
  const text = to(alice)[0].messages[0].text as string;
  assert.match(text, /^MetaBear 關鍵位提醒（BTC）\nsweep 測試事件/);
  assert.doesNotMatch(text, /&m=/, "BTC links stay as they were");
  assert.match(text, /看當下盤面：https:\/\/crm\.test\/lab\/orderflow\/\?tf=1&at=\d+/);
  assert.match(text, /看這段覆盤：https:\/\/crm\.test\/lab\/orderflow\/\?replay=\d+&k=sweep/);
  assert.match(text, /對應課程：https:\/\/crm\.test\/orderflow\/failed-auction/);
  assert.match(text, /非投資建議/);
  const ids = (await db.prepare("SELECT id FROM orderflow_alert_deliveries WHERE line_user_id=? ORDER BY created_at").bind(alice).all<{ id: string }>()).results.map((r) => r.id);
  assert.ok(ids.includes(to(alice)[0].retryKey), "a retried push reuses its delivery id as the retry key");

  // The same events again are not sent twice.
  assert.deepEqual(await (await post({ events: [ev("k1", "sweep")] })).json(), { queued: 0, dropped: 0 });

  // 01:00 the next Taiwan day: alice is in her quiet hours, bob's count starts over.
  assert.deepEqual(await (await post({ events: [ev("k5", "sweep", night)] })).json(), { queued: 1, dropped: 0 });
  await settle();
  assert.equal(to(bob).length, 4);
  assert.equal(to(alice).length, 2);
});

test("the quota floor, the stop switch and unsubscribing hold alerts back", async () => {
  const day3 = Date.parse("2026-10-24T04:00:00Z");
  quotaUsed = 960; // 1,000 a month, 50 kept for signals and campaigns
  assert.deepEqual(await (await post({ events: [ev("q1", "sweep", day3)] })).json(), { queued: 0, dropped: 2 });
  quotaUsed = 0;

  await db.prepare("UPDATE team_settings SET orderflow_alerts_enabled=0 WHERE id=1").run();
  assert.deepEqual(await (await post({ events: [ev("s1", "sweep", day3)] })).json(), { queued: 0, dropped: 0 });
  await db.prepare("UPDATE team_settings SET orderflow_alerts_enabled=1 WHERE id=1").run();

  assert.match(await say(alice, "退訂警報"), /已取消 LINE 關鍵位提醒/);
  assert.match(await say(alice, "警報設定"), /還沒有開通/);
  const before = pushes.length;
  assert.deepEqual(await (await post({ events: [ev("u1", "sweep", day3)] })).json(), { queued: 1, dropped: 0 });
  await settle();
  assert.deepEqual(
    pushes.slice(before).map((p) => p.to),
    [bob],
  );
});

test("members choose BTC, ETH or both, and ETH alerts name the coin and open ETH", async () => {
  const day4 = Date.parse("2026-10-25T04:00:00Z");
  assert.match(await say(bob, "訂閱警報 BTC,ETH 全部 每天3則"), /幣種：BTC、ETH\n事件：全部/);
  const before = pushes.length;
  assert.deepEqual(await (await post({ events: [ev("e1", "sweep", day4, "eth"), ev("b1", "absorption", day4)] })).json(), { queued: 2, dropped: 0 });
  await settle();
  const sent = pushes.slice(before).map((p) => p.messages[0].text as string);
  const eth = sent.find((t) => t.includes("（ETH）"));
  assert.ok(eth, "the ETH alert names its coin");
  assert.match(eth, /看當下盤面：https:\/\/crm\.test\/lab\/orderflow\/\?tf=1&at=\d+&m=eth/);
  assert.match(eth, /看這段覆盤：.*&k=sweep&m=eth/);
  assert.ok(sent.some((t) => t.startsWith("MetaBear 關鍵位提醒（BTC）")));

  // Back to BTC only: ETH events no longer reach bob.
  assert.match(await say(bob, "訂閱警報 全部 每天3則"), /幣種：BTC\n/);
  assert.deepEqual(await (await post({ events: [ev("e2", "sweep", day4, "eth")] })).json(), { queued: 0, dropped: 0 });
});
