import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  communityUrl,
  ensureRichMenu,
  menuName,
  richMenuDefinition,
} from "../src/line-rich-menu";
import { startLoading } from "../src/line-loading";
import { webhook } from "../src/webhook";
import { isImmediateCommand } from "../src/assistant";

test("BingX signed fetch runs inside workerd and never follows a credential redirect", async () => {
  const result = await build({
    stdin: {
      contents: `import {BingxClient} from './src/bingx'; export default {async fetch(){try{return Response.json(await new BingxClient('test-key','test-secret').relation('33289218'));}catch(e){return Response.json({error:e.message},{status:502});}}}`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
  });
  let redirect = false,
    requests = 0;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: "2026-09-11",
      outboundService: async (request: Request) => {
        requests++;
        assert.equal(new URL(request.url).hostname, "open-api.bingx.com");
        assert.equal(request.headers.get("X-BX-APIKEY"), "test-key");
        return redirect
          ? new Response(null, {
              status: 302,
              headers: { Location: "https://untrusted.test" },
            })
          : Response.json({
              code: 0,
              data: { uid: 33289218, kycResult: true },
            });
      },
    }),
  );
  try {
    assert.equal(
      ((await (await mf.dispatchFetch("http://test")).json()) as any).uid,
      "33289218",
    );
    redirect = true;
    const rejected = await mf.dispatchFetch("http://test");
    assert.equal(rejected.status, 502);
    assert.equal(((await rejected.json()) as any).error, "BingX http_302");
    assert.equal(requests, 2);
  } finally {
    await mf.dispose();
  }
});
test("loading indicator is optional, lasts 60 seconds, and respects disabled delivery", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(
      String(input),
      "https://api.line.me/v2/bot/chat/loading/start",
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      chatId: "U" + "a".repeat(32),
      loadingSeconds: 60,
    });
    throw new Error("offline");
  };
  try {
    const env = {
      LINE_CHANNEL_ACCESS_TOKEN: "test",
      LINE_DELIVERY_MODE: "live",
    } as Env;
    await startLoading(env, "U" + "a".repeat(32));
    assert.equal(calls, 1);
    await startLoading(
      { ...env, LINE_DELIVERY_MODE: "disabled" },
      "U" + "a".repeat(32),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});
test("verified webhook starts loading before the queued reply is processed", async () => {
  const previous = globalThis.fetch;
  const secret = "test-line-secret";
  const userId = "U" + "a".repeat(32);
  const body = JSON.stringify({
    events: [
      {
        webhookEventId: "event-1",
        type: "message",
        timestamp: Date.now(),
        source: { type: "user", userId },
        replyToken: "reply-1",
        message: { type: "text", text: "後台" },
      },
    ],
  });
  let loadingStarted = false;
  let enqueued = false;
  const background: Promise<unknown>[] = [];
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      "https://api.line.me/v2/bot/chat/loading/start",
    );
    loadingStarted = true;
    return new Response("{}", { status: 202 });
  };
  try {
    const response = await webhook(
      new Request("https://crm.test/webhook/line", {
        method: "POST",
        headers: {
          "X-Line-Signature": createHmac("sha256", secret)
            .update(body)
            .digest("base64"),
        },
        body,
      }),
      {
        LINE_CHANNEL_SECRET: secret,
        LINE_CHANNEL_ACCESS_TOKEN: "test",
        LINE_DELIVERY_MODE: "live",
        LINE_EVENTS: {
          async send() {
            enqueued = true;
          },
          async sendBatch() {
            assert.equal(loadingStarted, true);
            enqueued = true;
          },
        },
      } as Env,
      {
        waitUntil(promise) {
          background.push(promise);
        },
        passThroughOnException() {},
      } as ExecutionContext,
    );
    assert.equal(response.status, 200);
    assert.equal(enqueued, true);
    await Promise.all(background);
  } finally {
    globalThis.fetch = previous;
  }
});
test("short commands skip the queue and run through waitUntil", async () => {
  const previous = globalThis.fetch;
  const secret = "test-line-secret";
  const userId = "U" + "a".repeat(32);
  const body = JSON.stringify({
    events: [
      {
        webhookEventId: "event-menu",
        type: "message",
        timestamp: Date.now(),
        source: { type: "user", userId },
        replyToken: "reply-menu",
        message: { type: "text", text: "選單" },
      },
    ],
  });
  let batched = false;
  const background: Promise<unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://api.line.me/v2/bot/chat/loading/start") {
      assert.equal(JSON.parse(String(init?.body)).loadingSeconds, 5);
      return new Response("{}", { status: 202 });
    }
    return new Response("{}", { status: 200 });
  };
  try {
    const response = await webhook(
      new Request("https://crm.test/webhook/line", {
        method: "POST",
        headers: {
          "X-Line-Signature": createHmac("sha256", secret)
            .update(body)
            .digest("base64"),
        },
        body,
      }),
      {
        LINE_CHANNEL_SECRET: secret,
        LINE_CHANNEL_ACCESS_TOKEN: "test",
        LINE_DELIVERY_MODE: "live",
        LINE_EVENTS: {
          async send() {},
          async sendBatch() {
            batched = true;
          },
        },
      } as Env,
      {
        waitUntil(promise) {
          background.push(promise);
        },
        passThroughOnException() {},
      } as ExecutionContext,
    );
    assert.equal(response.status, 200);
    assert.equal(batched, false);
    assert.ok(background.length >= 1);
    assert.equal(isImmediateCommand("選單"), true);
    assert.equal(isImmediateCommand("開始註冊"), true);
    assert.equal(isImmediateCommand("我該如何註冊？"), false);
  } finally {
    globalThis.fetch = previous;
  }
});
test("rich menu covers exactly six tiles and has no AI toggles or public VIP link", () => {
  const menu = richMenuDefinition("https://crm.test");
  assert.equal(menu.areas.length, 6);
  assert.equal(
    menu.areas.reduce((sum, a) => sum + a.bounds.width * a.bounds.height, 0),
    2500 * 1686,
  );
  assert.ok(
    !JSON.stringify(menu).match(/TOGGLE_LLM|reurl|免費加入|開啟 AI|關閉 AI/),
  );
  const [community] = menu.areas.splice(3, 1);
  assert.deepEqual(community.action, {
    type: "uri",
    label: "加入聊天社群",
    uri: communityUrl,
  });
  assert.ok(communityUrl.startsWith("https://line.me/ti/g2/"));
  assert.ok(menu.areas.slice(0, 4).every((area) => area.action.type === "postback"));
  const text = (i: number) =>
    new URLSearchParams((menu.areas[i].action as { data: string }).data).get(
      "text",
    );
  assert.equal(
    text(0),
    "提交 UID",
  );
  assert.equal(
    text(1),
    "我的進度",
  );
  assert.equal(
    text(2),
    "開始註冊",
  );
  assert.equal(
    text(3),
    "合約基礎",
  );
  assert.deepEqual(menu.areas[4].action, {
    type: "message",
    text: "人工協助",
  });
  for (const command of ["提交 UID", "開始註冊", "合約基礎", "人工協助"])
    assert.equal(isImmediateCommand(command), true);
});

test("cron queues the rich menu install once per menu name", async () => {
  let pending: unknown = null;
  const audits: unknown[][] = [];
  const sent: unknown[] = [];
  const env = {
    LINE_DELIVERY_MODE: "live",
    LINE_CHANNEL_ACCESS_TOKEN: "token",
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            assert.match(sql, /line\.menu\.installed/);
            assert.deepEqual(args, [menuName]);
            return pending;
          },
          run: async () => void audits.push(args),
        }),
      }),
    },
    CAMPAIGN_EVENTS: { send: async (body: unknown) => void sent.push(body) },
  } as unknown as Env;
  await ensureRichMenu(env);
  assert.equal(sent.length, 1);
  assert.equal((sent[0] as { kind: string }).kind, "line-menu-install");
  assert.equal(audits[0][1], "line.menu.queued");
  assert.equal(JSON.parse(audits[0][2] as string).menuName, menuName);
  pending = { id: 1 };
  await ensureRichMenu(env);
  assert.equal(sent.length, 1);
  await ensureRichMenu({ ...env, LINE_DELIVERY_MODE: "disabled" } as Env);
  assert.equal(sent.length, 1);
});
