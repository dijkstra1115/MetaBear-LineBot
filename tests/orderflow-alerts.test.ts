import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { orderflowAlert } from "../src/orderflow-alert";
import { HttpError } from "../src/http";

const token = "test-orderflow-alert-token-not-a-live-credential";
const adminToken = "test-orderflow-admin-token-not-a-live-credential";

// ---------- CRM backend: push to the admin's LINE ----------

const adminEnv = (mode: string, lineUser: string | null = "Uadmin0000000000000000000000000000") =>
  ({
    ORDERFLOW_ALERT_TOKEN: token,
    LINE_DELIVERY_MODE: mode,
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    ADMIN_EMAIL: " Admin@Example.test ",
    DB: { prepare: () => ({ bind: (email: string) => ({ first: async () => (email === "admin@example.test" && lineUser ? { line_user_id: lineUser } : null) }) }) },
  }) as unknown as Env;
const post = (body: unknown, auth = `Bearer ${token}`) =>
  new Request("https://backend/api/internal/orderflow-alert", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) });
const status = async (p: Promise<Response>) => {
  try {
    return (await p).status;
  } catch (e) {
    return e instanceof HttpError ? e.status : 0;
  }
};

test("the backend pushes an alert to the admin's LINE only with the shared secret and live delivery", async () => {
  const realFetch = globalThis.fetch;
  const pushes: { headers: Headers; body: any }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.line.me/v2/bot/message/push");
    pushes.push({ headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await status(orderflowAlert(post({ text: "x", key: "orderflow-1" }, "Bearer wrong"), adminEnv("live"))), 401);
    assert.equal(await status(orderflowAlert(post({ text: "", key: "orderflow-1" }), adminEnv("live"))), 400);
    const disabled = await orderflowAlert(post({ text: "hi", key: "orderflow-1" }), adminEnv("disabled"));
    assert.deepEqual(await disabled.json(), { sent: false, reason: "delivery disabled" });
    assert.equal(pushes.length, 0, "dev and test environments never reach LINE");
    assert.equal(await status(orderflowAlert(post({ text: "hi", key: "orderflow-1" }), adminEnv("live", null))), 503);

    const sent = await orderflowAlert(post({ text: "MetaBear 訂單流通知\n測試", key: "orderflow-7" }), adminEnv("live"));
    assert.deepEqual(await sent.json(), { sent: true });
    const again = await orderflowAlert(post({ text: "MetaBear 訂單流通知\n測試", key: "orderflow-7" }), adminEnv("live"));
    assert.equal(again.status, 200);
    assert.equal(pushes.length, 2);
    assert.deepEqual(pushes[0].body, { to: "Uadmin0000000000000000000000000000", messages: [{ type: "text", text: "MetaBear 訂單流通知\n測試" }] });
    const key = pushes[0].headers.get("x-line-retry-key")!;
    assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(pushes[1].headers.get("x-line-retry-key"), key, "a retried alert reuses its retry key");

    globalThis.fetch = (async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    assert.equal(await status(orderflowAlert(post({ text: "hi", key: "orderflow-8" }), adminEnv("live"))), 502);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------- collector: thresholds and delivery ----------

let mf: Miniflare;
const delivered: any[] = [];
before(async () => {
  const result = await build({ entryPoints: ["src/orderflow/index.ts"], bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022", external: ["cloudflare:workers"] });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: "2026-09-11",
      durableObjects: { COLLECTOR: { className: "Collector", useSQLite: true } },
      bindings: { ORDERFLOW_ADMIN_TOKEN: adminToken, ORDERFLOW_STREAMS: "off", ORDERFLOW_ALERTS: "live", ORDERFLOW_ALERT_TOKEN: token },
      serviceBindings: {
        BACKEND: async (request: Request) => {
          assert.equal(request.headers.get("authorization"), `Bearer ${token}`);
          delivered.push(await request.json());
          return Response.json({ sent: true });
        },
      },
      outboundService: async () => new Response("not found", { status: 404 }),
    }),
  );
});
after(async () => {
  await mf?.dispose();
});

const alerts = (init?: RequestInit, auth = `Bearer ${adminToken}`) =>
  mf.dispatchFetch("https://metabear.io/api/orderflow/btcusdt/alerts", { ...init, headers: { authorization: auth, "content-type": "application/json", ...(init?.headers ?? {}) } });

test("alert thresholds are tuned over the admin API and a test alert reaches the backend", async () => {
  assert.equal((await alerts(undefined, "Bearer wrong")).status, 401);
  const initial = (await (await alerts()).json()) as any;
  assert.equal(initial.mode, "live");
  assert.equal(initial.config.printBtc, 50);
  assert.equal(initial.dailyCap, 3, "LINE's free plan: few market pushes a day");
  assert.equal(initial.config.levelOn, 1);

  const tuned = (await (await alerts({ method: "POST", body: JSON.stringify({ config: { printBtc: 80, wallBtc: -1, unknown: 5 } }) })).json()) as any;
  assert.equal(tuned.config.printBtc, 80);
  assert.equal(tuned.config.wallBtc, 60, "invalid values are ignored");
  assert.equal("unknown" in tuned.config, false);

  const tested = (await (await alerts({ method: "POST", body: JSON.stringify({ test: true }) })).json()) as any;
  assert.equal(delivered.length, 1);
  assert.match(delivered[0].text, /^MetaBear 訂單流通知\n✅ 測試通知/);
  assert.match(delivered[0].text, /https:\/\/metabear\.io\/lab\/orderflow\/\?tf=1&at=\d+/);
  assert.match(delivered[0].text, /盤面事件，不是買賣建議。$/);
  assert.match(delivered[0].key, /^orderflow-\d+$/);
  assert.equal(tested.sentToday, 1);
  assert.equal(tested.recent[0].state, "sent");

  // Switching market alerts off keeps test messages and health alerts going.
  const off = (await (await alerts({ method: "POST", body: JSON.stringify({ config: { marketOn: 0, healthOn: 2 } }) })).json()) as any;
  assert.deepEqual([off.config.marketOn, off.config.healthOn], [0, 1], "a switch only takes 0 or 1");
  const reset = (await (await alerts({ method: "POST", body: JSON.stringify({ config: null }) })).json()) as any;
  assert.equal(reset.config.printBtc, 50);
  assert.equal(reset.config.marketOn, 1);
});

test("key levels come from the previous Taipei day and are rebuilt after an import", async () => {
  const day = 86_400_000;
  // The previous Taipei day starts at 16:00 UTC two calendar boundaries back.
  const session = Math.floor((Date.now() + 8 * 3_600_000) / day);
  const prior = session * day - 8 * 3_600_000 - day;
  const rows = [
    [prior + 60_000, 80_000, 80_500, 79_990, 80_400, [[8000, 5, 5], [8040, 30, 20]]],
    [prior + 120_000, 80_400, 80_420, 79_100, 79_200, [[7920, 2, 2]]],
  ];
  const before = (await (await alerts()).json()) as any;
  assert.equal(before.levels.some((L: any) => L.name === "pdh"), false);
  const imported = await mf.dispatchFetch("https://metabear.io/api/orderflow/btcusdt/import", {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  assert.equal(imported.status, 200);
  const view = (await (await alerts()).json()) as any;
  const levels = Object.fromEntries(view.levels.map((L: any) => [L.name, L]));
  assert.equal(levels.pdh.price, 80_500);
  assert.equal(levels.pdl.price, 79_100);
  assert.equal(levels.poc.price, 80_405);
  assert.equal(levels.pdh.label, "前日高");
  const tuned = (await (await alerts({ method: "POST", body: JSON.stringify({ config: { dailyCap: 2.5, levelTolPct: 0.05 } }) })).json()) as any;
  assert.equal(tuned.config.dailyCap, 3, "the cap is a whole number");
  assert.equal(tuned.config.levelTolPct, 0.05);
  await alerts({ method: "POST", body: JSON.stringify({ config: null }) });
});
