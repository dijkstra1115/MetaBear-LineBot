import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  BingxClient,
  sumDecimal,
  taipeiDay,
  dayStart,
  DAY,
} from "../src/bingx";
import {
  evaluateRelation,
  enqueueSync,
  processSync,
  processVip,
  queueVip,
  customerAutomation,
  eligibleSnapshot,
  automationApi,
  dispatchCrm,
} from "../src/automation";
import { getTeam, validateTeam } from "../src/team";
import { audienceQuery } from "../src/audience";
let mf: Miniflare, db: any, env: any;
let serial = 0,
  mode = "ok",
  pushes: any[] = [],
  queued: any[] = [];
const originalFetch = globalThis.fetch;
const key = "unit-test-bingx-key",
  secret = "unit-test-secret";
const lastDay = dayStart(taipeiDay(Date.now())) - DAY;
const relation = (uid: string) => ({
  uid,
  inviteResult: true,
  directInvitation: true,
  inviterSid: "33289471",
  inviteCode: "ZD0CQ0",
  kycResult: true,
  deposit: true,
  trade: true,
  balanceVolume: "282.54431476",
  registerDateTime: 1757769260000,
  userLevel: 1,
  commissionRatio: 10,
  currentBenefit: 1,
  benefitRatio: 25,
  benefitExpiration: 1778529466000,
});
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: "2026-09-11",
      d1Databases: ["DB"],
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
  env = {
    DB: db,
    BINGX_API_KEY: key,
    BINGX_SECRET_KEY: secret,
    LINE_DELIVERY_MODE: "live",
    LINE_CHANNEL_ACCESS_TOKEN: "test-line-token",
    CAMPAIGN_EVENTS: {
      send: async (body: any) => {
        queued.push(body);
      },
      sendBatch: async (items: any[]) =>
        queued.push(...items.map((i) => i.body)),
    },
  };
  globalThis.fetch = async (input: any, init?: any) => {
    const url = new URL(String(input));
    if (url.hostname === "api.line.me") {
      assert.equal(url.pathname, "/v2/bot/message/push");
      pushes.push({
        body: JSON.parse(init.body),
        key: init.headers["X-Line-Retry-Key"],
      });
      if (mode === "line-transient") return new Response("{}", { status: 503 });
      if (mode === "line-duplicate")
        return new Response("{}", {
          status: 409,
          headers: { "x-line-accepted-request-id": "test" },
        });
      return new Response("{}");
    }
    assert.equal(url.origin, "https://open-api.bingx.com");
    assert.equal(init.headers["X-BX-APIKEY"], key);
    const sig = url.searchParams.get("signature");
    url.searchParams.delete("signature");
    assert.equal(
      sig,
      createHmac("sha256", secret)
        .update(url.searchParams.toString())
        .digest("hex"),
    );
    assert.equal(url.searchParams.get("recvWindow"), "5000");
    if (mode === "api-failure")
      return Response.json({
        code: 100410,
        msg: "do not surface arbitrary upstream content",
      });
    const uid = url.searchParams.get("uid")!;
    if (url.pathname.endsWith("inviteRelationCheck"))
      return Response.json({
        code: 0,
        data: {
          ...relation(mode === "uid-mismatch" ? "99999999" : uid),
          ...(mode === "no-kyc" ? { kycResult: false } : {}),
          ...(mode === "wrong-code" ? { inviteCode: "OTHER" } : {}),
        },
      });
    assert.ok(
      Number(url.searchParams.get("startTime")) > 1e12,
      "milliseconds required",
    );
    if (url.pathname.endsWith("depositDetailList"))
      return Response.json({
        code: 0,
        data: {
          total: 1,
          list: [
            {
              uid,
              bizTime: lastDay + 1000,
              assetType: 131,
              assetTypeName: "Internal Transfer-transfer in",
              currencyName: "USDT",
              currencyAmountVolume: "250",
            },
          ],
        },
      });
    if (url.pathname.endsWith("commissionDataList")) {
      if (mode === "bad-page")
        return Response.json({ code: 0, data: { total: 2, list: [] } });
      const start = Number(url.searchParams.get("startTime")),
        end = Number(url.searchParams.get("endTime"));
      assert.ok(end - start < 30 * DAY);
      const rows =
        url.searchParams.get("businessType") === "spot"
          ? []
          : [
              {
                uid,
                commissionTime: start + DAY,
                tradingVolume: "30.41",
                commission: "0.00684318",
                expectedTradingFees: "0.01520707",
                offsetTradingFees: "0",
                collectedTradingFees: "0.01520707",
              },
            ];
      return Response.json({
        code: 0,
        data: rows.length ? { total: rows.length, list: rows } : null,
      });
    }
    throw new Error("Unexpected endpoint");
  };
});
after(async () => {
  globalThis.fetch = originalFetch;
  await mf?.dispose();
});
beforeEach(async () => {
  mode = "ok";
  pushes = [];
  queued = [];
  await db
    .prepare(
      "UPDATE team_settings SET name='MetaBear',referral_code='ZD0CQ0',inviter_uid='',allow_indirect=0,allow_internal_transfer=1,automation_enabled=1,vip_url='https://example.test/vip',revision=1 WHERE id=1",
    )
    .run();
});
async function customer() {
  const index = ++serial,
    id = "U" + index.toString(16).padStart(32, "0"),
    uid = String(90000000 + index);
  await db
    .prepare("INSERT INTO customers(line_user_id) VALUES (?)")
    .bind(id)
    .run();
  await db
    .prepare(
      "INSERT INTO exchange_accounts(line_user_id,exchange,uid) VALUES (?,'bingx',?)",
    )
    .bind(id, uid)
    .run();
  return { id, uid };
}
async function sync(
  c: { id: string; uid: string },
  kind: "full" | "qualification" = "qualification",
) {
  const id = await enqueueSync(env, c.id, kind);
  await processSync({ kind: "crm-sync", id: id! }, env);
  return id!;
}
async function delivery(c: { id: string }) {
  return db
    .prepare("SELECT * FROM vip_deliveries WHERE line_user_id=?")
    .bind(c.id)
    .first();
}
test("qualification requires exact referral, KYC and deposit, accepts boolean strings, never unknown truthiness", async () => {
  const team = await getTeam(db),
    r = relation("12345678");
  assert.equal(evaluateRelation(r, r.uid, team, []).qualification, "eligible");
  assert.equal(
    evaluateRelation({ ...r, kycResult: "false" }, r.uid, team, [])
      .qualification,
    "needs_action",
  );
  assert.equal(
    evaluateRelation({ ...r, deposit: "false" }, r.uid, team, []).qualification,
    "needs_action",
  );
  assert.equal(
    evaluateRelation({ ...r, kycResult: undefined }, r.uid, team, [])
      .qualification,
    "pending",
  );
  assert.ok(
    evaluateRelation(
      { ...r, inviteCode: "BAD" },
      r.uid,
      team,
      [],
    ).reasons.includes("referral"),
  );
  assert.ok(
    evaluateRelation(
      { ...r, directInvitation: false },
      r.uid,
      team,
      [],
    ).reasons.includes("referral"),
  );
  assert.equal(
    evaluateRelation(
      { ...r, kycResult: "true", deposit: "true" },
      r.uid,
      team,
      [],
    ).qualification,
    "eligible",
  );
  assert.ok(
    evaluateRelation(
      r,
      r.uid,
      { ...team, allow_internal_transfer: 0 },
      [],
    ).reasons.includes("deposit"),
  );
  assert.throws(() =>
    evaluateRelation({ ...r, uid: "other" }, r.uid, team, []),
  );
  assert.throws(() => validateTeam({ vip_url: "javascript:alert(1)" }, team));
});
test("decimal money preserves precision", () => {
  assert.equal(sumDecimal(["0.1", "0.2"]), "0.3");
  assert.equal(sumDecimal(["0.00684318", "0.00684318"]), "0.01368636");
  assert.throws(() => sumDecimal(["NaN"]));
});
test("UID submission deduplicates jobs; sync creates invitation without ownership proof; no duplicate pushes", async () => {
  const c = await customer(),
    j = await enqueueSync(env, c.id);
  assert.equal(await enqueueSync(env, c.id), j);
  await processSync({ kind: "crm-sync", id: j! }, env);
  const v = await delivery(c);
  assert.ok(v);
  assert.equal(v.attempts, 0);
  await processVip({ kind: "vip-delivery", id: v.id }, env);
  await processVip({ kind: "vip-delivery", id: v.id }, env);
  await queueVip(env, c.id);
  assert.equal(pushes.length, 1);
  assert.equal((await delivery(c)).status, "accepted");
  assert.equal(
    (
      await db
        .prepare("SELECT stage FROM customers WHERE line_user_id=?")
        .bind(c.id)
        .first()
    ).stage,
    "new",
    "sending does not imply joined",
  );
});
test("full sync stores money and internal deposits; repeat sync replaces daily values, no double counting classifications", async () => {
  const c = await customer();
  await sync(c, "full");
  const first = await customerAutomation(env, c.id);
  assert.equal(first.deposits.length, 1);
  assert.equal(first.deposits[0].type_name, "Internal Transfer-transfer in");
  assert.equal(first.summary?.volume30, "30.41");
  assert.equal(first.summary?.commission30, "0.00684318");
  assert.equal(
    first.metrics.filter((m) => m.business_type === "spot").length,
    0,
  );
  await sync(c, "full");
  const second = await customerAutomation(env, c.id);
  assert.equal(second.metrics.length, first.metrics.length);
  assert.equal(second.deposits.length, 1);
  assert.equal(second.summary?.volume30, "30.41");
});
test("KYC false and wrong referral code cannot enqueue VIP", async () => {
  for (const setting of ["no-kyc", "wrong-code"]) {
    const c = await customer();
    mode = setting;
    await sync(c);
    assert.equal(await delivery(c), null);
    assert.equal(await eligibleSnapshot(env, c.id), null);
  }
});
test("UID mismatch and upstream errors fail closed without overwriting evidence or leaking response content", async () => {
  const c = await customer();
  mode = "uid-mismatch";
  await assert.rejects(() => sync(c));
  assert.equal(await delivery(c), null);
  const d = await customer();
  mode = "api-failure";
  await assert.rejects(() => sync(d));
  const data = await customerAutomation(env, d.id);
  assert.equal(data.snapshot, null);
  assert.equal(data.jobs[0].error, "BingX 100410");
});
test("incomplete pagination never writes partial metrics or qualifies", async () => {
  const c = await customer();
  mode = "bad-page";
  await assert.rejects(() => sync(c, "full"));
  assert.equal((await customerAutomation(env, c.id)).metrics.length, 0);
  assert.equal(await delivery(c), null);
});
test("rules or UID changes invalidate pending invitation", async () => {
  const c = await customer();
  await sync(c);
  const v = await delivery(c);
  await db
    .prepare("UPDATE team_settings SET revision=revision+1 WHERE id=1")
    .run();
  await processVip({ kind: "vip-delivery", id: v.id }, env);
  assert.equal(pushes.length, 0);
  assert.equal((await delivery(c)).status, "cancelled");
  await db.prepare("UPDATE team_settings SET revision=1 WHERE id=1").run();
  const d = await customer();
  await sync(d);
  const vd = await delivery(d);
  await db
    .prepare("UPDATE exchange_accounts SET uid=? WHERE line_user_id=?")
    .bind("88888888", d.id)
    .run();
  await processVip({ kind: "vip-delivery", id: vd.id }, env);
  assert.equal(pushes.length, 0);
});
test("blocked LINE user and disabled automation prevent delivery", async () => {
  const c = await customer();
  await sync(c);
  const v = await delivery(c);
  await db
    .prepare("UPDATE customers SET blocked=1 WHERE line_user_id=?")
    .bind(c.id)
    .run();
  await processVip({ kind: "vip-delivery", id: v.id }, env);
  assert.equal(pushes.length, 0);
  const d = await customer();
  await sync(d);
  await db
    .prepare("UPDATE team_settings SET automation_enabled=0 WHERE id=1")
    .run();
  await processVip({ kind: "vip-delivery", id: (await delivery(d)).id }, env);
  assert.equal(pushes.length, 0);
});
test("LINE timeout/503 retry uses same UUID and frozen body; accepted 409 is terminal", async () => {
  const c = await customer();
  await sync(c);
  const v = await delivery(c);
  mode = "line-transient";
  await assert.rejects(() =>
    processVip({ kind: "vip-delivery", id: v.id }, env),
  );
  await db
    .prepare("UPDATE vip_deliveries SET next_at=0 WHERE id=?")
    .bind(v.id)
    .run();
  mode = "line-duplicate";
  await processVip({ kind: "vip-delivery", id: v.id }, env);
  assert.equal(pushes.length, 2);
  assert.equal(pushes[0].key, pushes[1].key);
  assert.deepEqual(pushes[0].body, pushes[1].body);
  assert.equal((await delivery(c)).status, "accepted");
});
test("expired retry window fails without sending again", async () => {
  const c = await customer();
  await sync(c);
  const v = await delivery(c);
  await db
    .prepare(
      "UPDATE vip_deliveries SET attempts=1,first_attempt_at=? WHERE id=?",
    )
    .bind(new Date(Date.now() - DAY).toISOString(), v.id)
    .run();
  await processVip({ kind: "vip-delivery", id: v.id }, env);
  assert.equal(pushes.length, 0);
  assert.equal((await delivery(c)).status, "failed");
});
test("stale qualification is not used for new invitations", async () => {
  const c = await customer();
  await sync(c);
  await db
    .prepare("UPDATE exchange_snapshots SET checked_at=? WHERE line_user_id=?")
    .bind(new Date(Date.now() - 2 * 3600000).toISOString(), c.id)
    .run();
  assert.equal(await eligibleSnapshot(env, c.id), null);
});
test("settings API uses optimistic revision and never returns credentials", async () => {
  const response = await automationApi(
    new Request("https://crm.test/api/automation/settings"),
    env,
    "admin",
  );
  const body = (await response!.json()) as any;
  assert.equal(body.bingxConfigured, true);
  assert.equal(JSON.stringify(body).includes(secret), false);
  await assert.rejects(() =>
    automationApi(
      new Request("https://crm.test/api/automation/settings", {
        method: "PUT",
        body: JSON.stringify({ revision: 0, name: "Other" }),
      }),
      env,
      "admin",
    ),
  );
});
test("joined confirmation requires matching UID, current qualification and audit note", async () => {
  const c = await customer();
  await sync(c);
  const request = (body: any) =>
    new Request(
      "https://crm.test/api/automation/customers/" + c.id + "/joined",
      { method: "POST", body: JSON.stringify(body) },
    );
  await assert.rejects(() =>
    automationApi(request({ uid: c.uid, note: "" }), env, "admin"),
  );
  await assert.rejects(() =>
    automationApi(request({ uid: "12345678", note: "checked" }), env, "admin"),
  );
  assert.equal(
    (await automationApi(
      request({ uid: c.uid, note: "社群名單已核對" }),
      env,
      "admin",
    ))!.status,
    200,
  );
});
test("CRM segment query joins API volume and retains opt-in and blocked exclusions", async () => {
  const c = await customer();
  await sync(c, "full");
  await db
    .prepare(
      "UPDATE customers SET marketing_consent=1,tags='新手',owner_name='客服 A' WHERE line_user_id=?",
    )
    .bind(c.id)
    .run();
  const month = taipeiDay(dayStart(taipeiDay(Date.now())) - 29 * DAY).slice(
    0,
    7,
  );
  const q = audienceQuery(
    new URLSearchParams({ month, tag: "新手", owner: "客服 A", min: "1" }),
    true,
  );
  const rows = await db
    .prepare(q.sql)
    .bind(...q.values)
    .all();
  assert.ok(rows.results.some((r: any) => r.line_user_id === c.id));
  await db
    .prepare("UPDATE customers SET blocked=1 WHERE line_user_id=?")
    .bind(c.id)
    .run();
  const after = await db
    .prepare(q.sql)
    .bind(...q.values)
    .all();
  assert.ok(!after.results.some((r: any) => r.line_user_id === c.id));
});
