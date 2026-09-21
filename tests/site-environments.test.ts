import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import preview from "../src/preview";
import worker from "../src/index";

const assets = {
  fetch: async (request: Request) =>
    new Response(new URL(request.url).pathname),
};
const context = {} as ExecutionContext;

test("preview serves public lessons without any database, queue, or secret binding", async () => {
  const env = { ASSETS: assets };
  for (const [path, expected] of [
    ["/", "/index.html"],
    ["/learn?step=code", "/guide.html"],
    ["/orderflow/?lesson=liquidation", "/orderflow/index.html"],
  ]) {
    const response = await preview.fetch(
      new Request("https://preview.metabear.io" + path),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), expected);
    assert.equal(
      response.headers.get("X-Robots-Tag"),
      "noindex, nofollow, noarchive",
    );
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  const content = await preview.fetch(
    new Request("https://preview.metabear.io/content.json"),
    env,
  );
  const data = (await content.json()) as {
    business: unknown;
    steps: unknown;
    lessons: unknown;
  };
  assert.ok(data.business && data.steps && data.lessons);
  const robots = await preview.fetch(
    new Request("https://preview.metabear.io/robots.txt"),
    env,
  );
  assert.equal(await robots.text(), "User-agent: *\nDisallow: /\n");
});

test("preview cannot expose staff pages, APIs or LINE actions, including encoded paths", async () => {
  const env = {
    ASSETS: {
      fetch: async () => {
        throw new Error("Private path reached assets");
      },
    },
  };
  for (const path of [
    "/admin",
    "/admin.html",
    "/admin.js",
    "/desk/",
    "/login",
    "/login-setup.html",
    "/auth/session",
    "/api/customers",
    "/webhook/line",
    "/media/signals/example",
    "/%61dmin.html",
    "/api%2Fcustomers",
  ]) {
    const response = await preview.fetch(
      new Request("https://preview.metabear.io" + path),
      env,
    );
    assert.equal(response.status, 404, path);
  }
  for (const path of ["/", "/webhook/line", "/auth/start", "/api/settings"]) {
    const response = await preview.fetch(
      new Request("https://preview.metabear.io" + path, { method: "POST" }),
      env,
    );
    assert.equal(response.status, 405);
  }
  for (const path of ["/%2561dmin.html", "/folder%5c..%5cadmin.html"]) {
    const response = await preview.fetch(new Request("https://preview.metabear.io" + path), env);
    assert.equal(response.status, 400);
  }
});

test("analytics CSP is limited to production public HTML; private and preview pages stay restricted", async () => {
  const env = { ASSETS: assets } as Env;
  for (const path of ["/", "/learn", "/orderflow/"]) {
    const response = await worker.fetch(
      new Request("https://metabear.io" + path),
      env,
      context,
    );
    const csp = response.headers.get("Content-Security-Policy")!;
    assert.match(
      csp,
      /https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js/,
    );
    assert.match(csp, /https:\/\/cloudflareinsights\.com/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  }
  for (const path of [
    "/login",
    "/admin.html",
    "/desk.html",
    "/login-setup.html",
  ]) {
    const response = await worker.fetch(
      new Request("https://metabear.io" + path),
      { ...env, ENVIRONMENT: "development" },
      context,
    );
    assert.doesNotMatch(
      response.headers.get("Content-Security-Policy")!,
      /cloudflareinsights/,
    );
  }
  const response = await preview.fetch(
    new Request("https://preview.metabear.io/orderflow/"),
    { ASSETS: assets },
  );
  assert.doesNotMatch(
    response.headers.get("Content-Security-Policy")!,
    /cloudflareinsights/,
  );
  assert.match(
    response.headers.get("Content-Security-Policy")!,
    /wss:\/\/stream\.bybit\.com/,
  );
});

test("analytics loader sends no telemetry from localhost, legacy URLs, or preview", () => {
  const source = readFileSync(
    new URL("../public/analytics.js", import.meta.url),
    "utf8",
  );
  for (const origin of [
    "https://preview.metabear.io",
    "http://127.0.0.1:8790",
    "https://metabear-line-crm-staging.style78432.workers.dev",
  ]) {
    runInNewContext(source, {
      location: { origin },
      document: {
        createElement() {
          throw new Error("Unexpected analytics request");
        },
      },
    });
  }
  const appended: unknown[] = [];
  runInNewContext(source, {
    location: { origin: "https://metabear.io" },
    document: {
      createElement: () => ({ dataset: {} }),
      head: { append: (el: unknown) => appended.push(el) },
    },
  });
  assert.equal(appended.length, 1);
});
