import { test } from "node:test";
import assert from "node:assert/strict";
import { linePush } from "../src/line-push";

// Campaigns, signals, VIP invites, order-flow alerts, support notices and login codes all push
// through linePush, so they read LINE's answers the same way.
test("a LINE push is accepted, retried later, or refused for good", async (t) => {
  const seen: Request[] = [];
  let answer = () => new Response("{}");
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Request(input, init));
    return answer();
  });
  const to = "U" + "a1".repeat(16);
  const env = { LINE_CHANNEL_ACCESS_TOKEN: "test-token" } as Env;
  const cases: [() => Response, string][] = [
    [() => new Response("{}"), "accepted"],
    // An earlier try with the same retry key already went through.
    [() => new Response("{}", { status: 409, headers: { "x-line-accepted-request-id": "abc" } }), "accepted"],
    [() => new Response("{}", { status: 409 }), "rejected"],
    [() => new Response("{}", { status: 429 }), "retry"],
    [() => new Response("{}", { status: 503 }), "retry"],
    [() => new Response("{}", { status: 400 }), "rejected"],
  ];
  for (const [response, outcome] of cases) {
    answer = response;
    const result = await linePush(env, to, [{ type: "text", text: "hi" }], "retry-key-1");
    assert.equal(result.outcome, outcome, `HTTP ${result.status}`);
  }
  const request = seen[0];
  assert.equal(request.url, "https://api.line.me/v2/bot/message/push");
  assert.equal(request.headers.get("Authorization"), "Bearer test-token");
  assert.equal(request.headers.get("X-Line-Retry-Key"), "retry-key-1");
  assert.deepEqual(await request.json(), { to, messages: [{ type: "text", text: "hi" }] });
});
