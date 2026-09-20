import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index";

// These routes must depend only on ASSETS, never on CRM, credentials or a database.
const env = {
  ASSETS: {
    fetch: async (request: Request) =>
      new Response(new URL(request.url).pathname),
  },
} as Env;
const context = {} as ExecutionContext;

test("orderflow canonical URL preserves the requested lesson", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/orderflow?lesson=iceberg"),
    env,
    context,
  );
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    "https://example.test/orderflow/?lesson=iceberg",
  );
});

test("orderflow route serves its document with narrowly scoped Bybit WebSocket access", async () => {
  for (const path of ["/orderflow/", "/orderflow/index.html"]) {
    const response = await worker.fetch(
      new Request("https://example.test" + path),
      env,
      context,
    );
    assert.equal(await response.text(), "/orderflow/index.html");
    assert.match(
      response.headers.get("Content-Security-Policy")!,
      /connect-src 'self' wss:\/\/stream\.bybit\.com;/,
    );
    assert.doesNotMatch(
      response.headers.get("Content-Security-Policy")!,
      /unsafe-inline|unsafe-eval/,
    );
  }
});

test("existing pages retain their original connection restrictions", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/learn"),
    env,
    context,
  );
  assert.equal(await response.text(), "/guide.html");
  assert.match(
    response.headers.get("Content-Security-Policy")!,
    /connect-src 'self';/,
  );
  assert.doesNotMatch(
    response.headers.get("Content-Security-Policy")!,
    /bybit/,
  );
});
