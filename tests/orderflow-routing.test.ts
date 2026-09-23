import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index";
import preview from "../src/preview";

// These routes must depend only on ASSETS, never on CRM, credentials or a database.
const env = {
  ASSETS: {
    fetch: async (request: Request) =>
      new Response(new URL(request.url).pathname),
  },
} as Env;
const context = {} as ExecutionContext;

test("production and preview serve the archive and restrict live access to its workspace", async () => {
  for (const fetch of [
    (request: Request) => worker.fetch(request, env, context),
    (request: Request) => preview.fetch(request, env),
  ]) {
    const redirect = await fetch(
      new Request("https://example.test/orderflow/legacy?keep=1"),
    );
    assert.equal(redirect.status, 308);
    assert.equal(
      redirect.headers.get("Location"),
      "https://example.test/orderflow/legacy/?keep=1",
    );
    for (const [path, asset, live] of [
      ["/orderflow/legacy/", "/orderflow/legacy/index.html", false],
      ["/orderflow/legacy/index.html", "/orderflow/legacy/index.html", false],
      [
        "/orderflow/legacy/classic.html?workspace=live",
        "/orderflow/legacy/classic.html",
        true,
      ],
      [
        "/orderflow/legacy/journey.html",
        "/orderflow/legacy/journey.html",
        false,
      ],
      [
        "/orderflow/legacy/absorption.html",
        "/orderflow/legacy/absorption.html",
        false,
      ],
    ] as const) {
      const response = await fetch(new Request("https://example.test" + path));
      assert.equal(response.status, 200);
      assert.equal(await response.text(), asset);
      assert.equal(
        response.headers
          .get("Content-Security-Policy")!
          .includes("wss://stream.bybit.com"),
        live,
      );
    }
  }
});

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
