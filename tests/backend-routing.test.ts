import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import backend from "../src/backend";
import worker from "../src/index";
import { backendRoutePaths, privateAssets } from "../scripts/deployment-layout.mjs";

const base = "https://metabear.io";
const legacy = "https://metabear-line-crm-staging.style78432.workers.dev";
const env = { PUBLIC_BASE_URL: base, ENVIRONMENT: "production", AUTH_MODE: "native", ADMIN_EMAIL: "admin@example.test" } as Env;
const context = {} as ExecutionContext;

test("backend preserves webhook restrictions and private-page authentication", async () => {
  for (const origin of [base, legacy]) {
    for (const path of ["/admin", "/admin.html", "/desk", "/desk.html", "/%61dmin.html"]) {
      const response = await backend.fetch(new Request(origin + path), env, context);
      assert.equal(response.status, 302, path);
      assert.match(response.headers.get("Location")!, /^\/login/);
    }
    const response = await backend.fetch(new Request(origin + "/webhook/line"), env, context);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "POST");
    const health = await backend.fetch(new Request(origin + "/health"), env, context);
    assert.equal(health.status, 200);
  }
  assert.equal(backend.queue, worker.queue);
  assert.equal(backend.scheduled, worker.scheduled);
});

test("the production backend serves the FLOW ARENA leaderboard from its own database", async () => {
  const response = await backend.fetch(new Request(base + "/arena/api/scores"), env, context);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "排行榜尚未啟用" });
  const scores = [{ id: 7, name: "熊", pnl: 1250000, seed: 42, turns: 24, verified: 0, created_at: "2026-10-03 08:00:00" }];
  const ARENA_DB = {
    prepare: () => ({ bind: () => ({ all: async () => ({ results: scores }) }) }),
  } as unknown as D1Database;
  const board = await backend.fetch(new Request(base + "/arena/api/scores"), { ...env, ARENA_DB } as Env, context);
  assert.equal(board.status, 200);
  const body = (await board.json()) as { scores: { name: string; createdAt: string }[] };
  assert.equal(body.scores[0].name, "熊");
  assert.equal(body.scores[0].createdAt, "2026-10-03T08:00:00Z");
  const config = runInNewContext("(" + readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8") + ")");
  const databases = config.env.production.d1_databases;
  const arena = databases.find((db: { binding: string }) => db.binding === "ARENA_DB");
  assert.equal(arena.database_name, "metabear-arena-production");
  assert.notEqual(arena.database_id, config.env.staging.d1_databases[0].database_id);
});

test("legacy public asset URLs move to Pages while same-origin misses cannot loop", async () => {
  for (const path of ["/orderflow/wick.html?lesson=wick", "/guides/example.png", "/js/site.js"]) {
    const response = await backend.fetch(new Request(legacy + path), env, context);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("Location"), base + path);
    assert.equal((await backend.fetch(new Request(base + path), env, context)).status, 404);
  }
  assert.equal((await backend.fetch(new Request(legacy + "/", { method: "POST" }), env, context)).status, 405);
  for (const path of ["/%2561dmin.html", "/folder%5c..%5cadmin.html", "/%ZZ"])
    assert.equal((await backend.fetch(new Request(legacy + path), env, context)).status, 400);
});

test("production routes cover every private asset and preserve existing backend resources", () => {
  const config = runInNewContext("(" + readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8") + ")");
  const production = config.env.production;
  assert.equal(production.main, "src/backend.ts");
  assert.equal(production.assets.directory, "./dist/backend");
  assert.equal(production.d1_databases[0].database_id, "60f13265-4f4d-4086-9851-ed027c968ee6");
  assert.equal(production.name, "metabear-backend");
  assert.ok(production.queues.consumers.length === 2 && production.triggers.crons.length === 1);
  const patterns = production.routes.filter((route: { custom_domain?: boolean }) => !route.custom_domain).map((route: { pattern: string }) => route.pattern.replace("metabear.io", ""));
  assert.deepEqual(Array.from(patterns), backendRoutePaths);
  for (const file of privateAssets)
    assert.ok(patterns.some((pattern: string) => new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*") + "$").test("/" + file)), file);
  assert.ok(!patterns.includes("/*"));
});
