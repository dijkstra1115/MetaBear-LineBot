import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { dispatchCrm, processSync } from "../src/automation";
import { campaignApi, reservedLineMessages } from "../src/campaigns";
import {
  dispatchSupportNotifications,
  processSupportNotification,
} from "../src/support";

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
let env: Env;
let queued: { kind: string; id: string }[] = [];
let pushes: string[] = [];
let pushResponse: () => Promise<Response>;
const originalFetch = globalThis.fetch;
const stamp = () => new Date().toISOString();

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
  for (const file of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("migrations/" + file, "utf8");
    await db.batch(
      sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
  }
  env = {
    DB: db,
    BINGX_API_KEY: "test-key",
    BINGX_SECRET_KEY: "test-secret",
    ADMIN_EMAIL: "owner@example.test",
    LINE_DELIVERY_MODE: "live",
    LINE_CHANNEL_ACCESS_TOKEN: "test",
    CAMPAIGN_EVENTS: {
      send: async (body: { kind: string; id: string }) => {
        queued.push(body);
      },
      sendBatch: async (items: { body: { kind: string; id: string } }[]) => {
        queued.push(...items.map((i) => i.body));
      },
    },
  } as unknown as Env;
  await db
    .prepare(
      "INSERT INTO auth_admin_channels VALUES (?, ?, 0, 'test-enrollment')",
    )
    .bind(env.ADMIN_EMAIL, "U" + "f".repeat(32))
    .run();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "open-api.bingx.com") {
      assert.ok(url.pathname.endsWith("inviteRelationCheck"));
      return Response.json({
        code: 0,
        data: {
          uid: url.searchParams.get("uid"),
          inviteResult: false,
          directInvitation: false,
          inviteCode: "OTHER",
          kycResult: false,
          deposit: false,
        },
      });
    }
    assert.equal(url.hostname, "api.line.me");
    if (url.pathname.endsWith("/quota"))
      return Response.json({ type: "limited", value: 1 });
    if (url.pathname.endsWith("/consumption"))
      return Response.json({ totalUsage: 0 });
    assert.ok(url.pathname.endsWith("/push"));
    pushes.push(new Headers(init?.headers).get("X-Line-Retry-Key")!);
    return pushResponse();
  };
});
beforeEach(() => {
  queued = [];
  pushes = [];
  pushResponse = async () => new Response("{}");
});
after(async () => {
  globalThis.fetch = originalFetch;
  await mf?.dispose();
});

test("full checks without metric coverage advance past the first 20 accounts and expire daily", async () => {
  await db.prepare("UPDATE team_settings SET automation_enabled=1").run();
  const users = Array.from(
    { length: 21 },
    (_, i) => "U" + (i + 1).toString(16).padStart(32, "0"),
  );
  await db.batch(
    users.flatMap((id, i) => [
      db
        .prepare(
          "INSERT INTO customers(line_user_id,stage) VALUES (?,'joined')",
        )
        .bind(id),
      db
        .prepare(
          "INSERT INTO exchange_accounts(line_user_id,exchange,uid) VALUES (?,'bingx',?)",
        )
        .bind(id, String(1000 + i)),
    ]),
  );
  await dispatchCrm(env);
  const first = (
    await db
      .prepare("SELECT id FROM crm_jobs WHERE status='pending'")
      .all<{ id: string }>()
  ).results;
  assert.equal(first.length, 20);
  for (const job of first)
    await processSync({ kind: "crm-sync", id: job.id }, env);
  assert.equal(
    (await db
      .prepare("SELECT count(*) AS n FROM metric_coverage")
      .first<{ n: number }>())!.n,
    0,
  );
  await dispatchCrm(env);
  const next = (
    await db
      .prepare("SELECT id,line_user_id FROM crm_jobs WHERE status='pending'")
      .all<{ id: string; line_user_id: string }>()
  ).results;
  assert.deepEqual(
    next.map((j) => j.line_user_id),
    [users[20]],
  );
  await processSync({ kind: "crm-sync", id: next[0].id }, env);
  await dispatchCrm(env);
  assert.equal(
    (await db
      .prepare("SELECT count(*) AS n FROM crm_jobs WHERE status='pending'")
      .first<{ n: number }>())!.n,
    0,
  );

  // A completed check of the old UID must not delay the replacement account.
  await db
    .prepare("UPDATE exchange_accounts SET uid='9999' WHERE line_user_id=?")
    .bind(users[20])
    .run();
  await dispatchCrm(env);
  const changed = await db
    .prepare("SELECT id,uid FROM crm_jobs WHERE status='pending'")
    .first<{ id: string; uid: string }>();
  assert.equal(changed!.uid, "9999");
  await processSync({ kind: "crm-sync", id: changed!.id }, env);

  await db
    .prepare("UPDATE crm_jobs SET finished_at=? WHERE status='done'")
    .bind(new Date(Date.now() - 2 * 86400000).toISOString())
    .run();
  await dispatchCrm(env);
  assert.equal(
    (await db
      .prepare("SELECT count(*) AS n FROM crm_jobs WHERE status='pending'")
      .first<{ n: number }>())!.n,
    20,
  );
});

test("campaign confirmation respects pending and sending signal reservations", async () => {
  const user = "U" + "a".repeat(32);
  const draft = crypto.randomUUID(),
    signal = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO customers(line_user_id,marketing_consent) VALUES (?,1)",
    )
    .bind(user)
    .run();
  await db
    .prepare(
      "INSERT INTO campaign_drafts(id,title,body,filters_json,audience_count) VALUES (?,'test','test',?,1)",
    )
    .bind(draft, JSON.stringify({ q: user }))
    .run();
  await db
    .prepare(
      "INSERT INTO signals(id,analyst_email,category_id,direction,leverage,entry,take_profit,stop_loss,audience_count,created_at,created_by) VALUES (?,?,'BTC','long','1x','1','2','0.5',1,?,'test')",
    )
    .bind(signal, env.ADMIN_EMAIL, stamp())
    .run();
  await db
    .prepare(
      "INSERT INTO signal_deliveries(id,signal_id,line_user_id) VALUES (?,?,?)",
    )
    .bind(crypto.randomUUID(), signal, user)
    .run();
  const preview = await campaignApi(
    new Request(`https://test/api/campaigns/${draft}/preview`, {
      method: "POST",
    }),
    env,
    env.ADMIN_EMAIL,
  );
  const { run } = (await preview!.json()) as { run: { id: string } };
  const send = () =>
    campaignApi(
      new Request(`https://test/api/campaigns/${draft}/send`, {
        method: "POST",
        body: JSON.stringify({ runId: run.id, confirmCount: 1 }),
      }),
      env,
      env.ADMIN_EMAIL,
    );
  for (const status of ["pending", "sending"]) {
    await db
      .prepare("UPDATE signal_deliveries SET status=? WHERE signal_id=?")
      .bind(status, signal)
      .run();
    assert.equal(await reservedLineMessages(env), 1);
    await assert.rejects(send, (e: { status: number }) => e.status === 409);
    assert.equal(
      (await db
        .prepare("SELECT status FROM campaign_runs WHERE id=?")
        .bind(run.id)
        .first<{ status: string }>())!.status,
      "preview",
    );
  }
  assert.equal(queued.length, 0);
  await db
    .prepare("UPDATE signal_deliveries SET status='accepted' WHERE signal_id=?")
    .bind(signal)
    .run();
  assert.equal((await send())!.status, 202);
  assert.equal(
    await reservedLineMessages(env),
    1,
    "the campaign now reserves the released capacity",
  );
});

async function supportCase(status = "processing", leaseUntil = 0) {
  const id = crypto.randomUUID(),
    key = crypto.randomUUID();
  const user = "U" + id.replaceAll("-", "");
  await db
    .prepare("INSERT INTO customers(line_user_id) VALUES (?)")
    .bind(user)
    .run();
  await db
    .prepare(
      `INSERT INTO support_cases(id,line_user_id,request_event_id,notification_key,requested_at,updated_at,notification_status,notification_lease_until)
    VALUES (?,?,?,?,0,0,?,?)`,
    )
    .bind(id, user, id, key, status, leaseUntil)
    .run();
  return { id, key };
}

test("cron reclaims interrupted notifications but skips live leases and resolved cases", async () => {
  const expired = await supportCase(); // Existing processing rows migrate with lease=0.
  const active = await supportCase("processing", Date.now() + 60000);
  const resolved = await supportCase();
  await db
    .prepare("UPDATE support_cases SET status='resolved' WHERE id=?")
    .bind(resolved.id)
    .run();
  await dispatchSupportNotifications(env);
  assert.deepEqual(queued, [{ kind: "support-notification", id: expired.id }]);
  await assert.rejects(
    processSupportNotification(
      { kind: "support-notification", id: active.id },
      env,
    ),
    /processing/,
  );
  await processSupportNotification(
    { kind: "support-notification", id: resolved.id },
    env,
  );
  pushResponse = async () =>
    new Response("{}", {
      status: 409,
      headers: { "x-line-accepted-request-id": "previous-attempt" },
    });
  await processSupportNotification(
    { kind: "support-notification", id: expired.id },
    env,
  );
  await processSupportNotification(
    { kind: "support-notification", id: expired.id },
    env,
  );
  assert.deepEqual(pushes, [expired.key]);
  assert.equal(
    (await db
      .prepare("SELECT notification_status FROM support_cases WHERE id=?")
      .bind(expired.id)
      .first<{ notification_status: string }>())!.notification_status,
    "sent",
  );
});

test("a stale notification worker cannot overwrite the replacement worker's success", async () => {
  const support = await supportCase("pending");
  let release!: (response: Response) => void;
  let started!: () => void;
  const reachedPush = new Promise<void>((resolve) => {
    started = resolve;
  });
  pushResponse = () => {
    started();
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const message = { kind: "support-notification" as const, id: support.id };
  const oldWorker = processSupportNotification(message, env);
  await reachedPush;
  try {
    await db
      .prepare("UPDATE support_cases SET notification_lease_until=0 WHERE id=?")
      .bind(support.id)
      .run();
    pushResponse = async () => new Response("{}");
    await processSupportNotification(message, env);
  } finally {
    release(new Response("{}", { status: 503 }));
  }
  await assert.rejects(oldWorker, /503/);
  assert.deepEqual(pushes, [support.key, support.key]);
  const state = await db
    .prepare(
      "SELECT notification_status,notification_lease_token,notification_lease_until FROM support_cases WHERE id=?",
    )
    .bind(support.id)
    .first();
  assert.deepEqual(state, {
    notification_status: "sent",
    notification_lease_token: "",
    notification_lease_until: 0,
  });
});

test("failed notification attempts release the lease and reuse the LINE retry key", async () => {
  const support = await supportCase("pending");
  const message = { kind: "support-notification" as const, id: support.id };
  pushResponse = async () => new Response("{}", { status: 503 });
  await assert.rejects(processSupportNotification(message, env), /503/);
  const state = await db
    .prepare(
      "SELECT notification_status,notification_lease_token,notification_lease_until FROM support_cases WHERE id=?",
    )
    .bind(support.id)
    .first();
  assert.deepEqual(state, {
    notification_status: "failed",
    notification_lease_token: "",
    notification_lease_until: 0,
  });
  pushResponse = async () => new Response("{}");
  await processSupportNotification(message, env);
  assert.deepEqual(pushes, [support.key, support.key]);
});
