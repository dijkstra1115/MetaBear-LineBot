import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index";
import { siteRedirect } from "../src/site-routing";

const oldOrigin = "https://metabear-line-crm-staging.style78432.workers.dev";
const base = "https://metabear.io";

test("public bookmarks move to the new domain with lesson query intact", () => {
  const response = siteRedirect(
    new Request(oldOrigin + "/orderflow?lesson=liquidation"),
    base,
  )!;
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    base + "/orderflow/?lesson=liquidation",
  );
  assert.equal(
    siteRedirect(
      new Request(oldOrigin + "/learn?lesson=槓桿"),
      base,
    )!.headers.get("Location"),
    new URL(base + "/learn?lesson=槓桿").href,
  );
});

test("legacy webhook, APIs, authentication and staff URLs stay on their existing origin", () => {
  for (const path of [
    "/webhook/line",
    "/health",
    "/auth/session",
    "/api/users",
    "/admin",
    "/desk",
    "/login",
    "/media/signals/example",
    "/orderflow/entry.js",
  ]) {
    assert.equal(siteRedirect(new Request(oldOrigin + path), base), null, path);
    assert.equal(
      siteRedirect(new Request(oldOrigin + path, { method: "POST" }), base),
      null,
      path,
    );
  }
});

test("www and HTTP converge on HTTPS apex without redirecting local previews", () => {
  for (const origin of [
    "http://metabear.io",
    "http://www.metabear.io",
    "https://www.metabear.io",
  ]) {
    assert.equal(
      siteRedirect(
        new Request(origin + "/learn?step=deposit"),
        base,
      )!.headers.get("Location"),
      base + "/learn?step=deposit",
    );
  }
  for (const origin of [
    base,
    "http://127.0.0.1:8787",
    "https://metabear.io.example.com",
  ]) {
    assert.equal(siteRedirect(new Request(origin + "/"), base), null);
  }
  assert.equal(siteRedirect(new Request(oldOrigin), ""), null);
});

test("domain migration leaves staff pages protected and old webhook reachable", async () => {
  const env = {
    PUBLIC_BASE_URL: base,
    ENVIRONMENT: "staging",
    AUTH_MODE: "native",
    ADMIN_EMAIL: "admin@example.test",
  } as Env;
  for (const origin of [base, oldOrigin]) {
    for (const path of ["/admin", "/desk"]) {
      const response = await worker.fetch(
        new Request(origin + path),
        env,
        {} as ExecutionContext,
      );
      assert.equal(response.status, 302);
      assert.match(response.headers.get("Location")!, /^\/login/);
    }
    const response = await worker.fetch(
      new Request(origin + "/webhook/line"),
      env,
      {} as ExecutionContext,
    );
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "POST");
  }
});
