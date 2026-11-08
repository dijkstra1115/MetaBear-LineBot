import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { handleArenaScores, parseScore } from "../src/arena-scores";
import { createHash } from "node:crypto";
import { RANKED_VERSION, replayRanked } from "../public/arena/engine/ranked.js";

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-09-11", d1Databases: ["DB"],
  }));
  db = await mf.getD1Database("DB");
  const schema = await readFile("migrations-arena/0001_arena_scores.sql", "utf8");
  await db.batch(schema.split(";").map((sql) => sql.trim()).filter(Boolean).map((sql) => db.prepare(sql)));
  for (const [name, pnl, version] of [["legacy-v1", 9000, 1], ["legacy-v2", 10000, 2], ["current", 50, RANKED_VERSION]]) {
    await db.prepare("INSERT INTO arena_scores (name,pnl,seed,turns,version,stats,actions,ip_hash) VALUES (?,?,42,24,?,'{}','[]','fixture')")
      .bind(name, pnl, version).run();
  }
});
after(async () => { await mf?.dispose(); });
const score = () => ({ version: RANKED_VERSION, seed: 42, turns: 24, name: "new-player", pnl: 100,
  stats: { settled: true, position: 0, volume: 10000 },
  actions: [{ t: 1, op: "execute", args: { type: "market", side: "buy", lots: 10000 } }],
});
const request = (query = "") => new Request(`https://metabear.io/arena/api/scores${query}`);

test("legacy scores remain visible and new uploads rank only against their season", async () => {
  const env = { ARENA_DB: db as unknown as D1Database };
  const oldBefore = await db.prepare("SELECT * FROM arena_scores WHERE version < 3 ORDER BY id").all();
  const current = await handleArenaScores(request(), env);
  assert.deepEqual((await current.json() as any).scores.map((s: any) => s.name), ["current"]);
  const legacy = await handleArenaScores(request("?season=legacy"), env);
  const oldBody = await legacy.json() as any;
  assert.equal(oldBody.season, "legacy");
  assert.deepEqual(oldBody.scores.map((s: any) => s.name), ["legacy-v2", "legacy-v1"]);
  // The upload is ranked by its replay; keep the current season's fixture just under it.
  const replayed = replayRanked({ seed: 42, actions: score().actions }).pnl;
  await db.prepare("UPDATE arena_scores SET pnl = ? WHERE name = 'current'").bind(replayed - 1).run();
  const uploaded = await handleArenaScores(new Request(request(), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(score()),
  }), env);
  assert.equal(uploaded.status, 201);
  assert.equal((await uploaded.json() as any).rank, 1, "larger legacy scores do not affect the new rank");
  const oldAfter = await db.prepare("SELECT * FROM arena_scores WHERE version < 3 ORDER BY id").all();
  assert.deepEqual(oldAfter.results, oldBefore.results, "legacy records are never rewritten");
  await db.prepare("UPDATE arena_scores SET stats = ? WHERE name = 'current'")
    .bind(JSON.stringify({ settled: true, position: 0, recalculatedFrom: 2 })).run();
  const withRecalculated = await handleArenaScores(request(), env);
  const recalculatedRows = (await withRecalculated.json() as any).scores;
  assert.equal(recalculatedRows.find((s: any) => s.name === "current").recalculatedFrom, 2);
  assert.equal(recalculatedRows.find((s: any) => s.name === "new-player").recalculatedFrom, null);
  const invalid = await handleArenaScores(request("?season=unknown"), env);
  assert.equal(invalid.status, 400);
});

test("new uploads require the new engine and completed flat settlement", () => {
  assert.equal(parseScore(JSON.stringify(score())).version, RANKED_VERSION);
  assert.equal('recalculatedFrom' in parseScore(JSON.stringify({ ...score(), stats: { ...score().stats, recalculatedFrom: 1 } })).stats, false, "uploads cannot claim an administrative recalculation");
  for (const version of [1, 2]) assert.throws(() => parseScore(JSON.stringify({ ...score(), version })), /遊戲版本不符/);
  for (const stats of [{}, { settled: false, position: 0 }, { settled: true, position: 1 }, null]) {
    assert.throws(() => parseScore(JSON.stringify({ ...score(), stats })), /完成平倉/);
  }
});

test("a claimed score is replaced by its replay, and the address hash is keyed and kept for an hour", async () => {
  const env = { ARENA_DB: db as unknown as D1Database, ARENA_IP_KEY: "test-arena-ip-key" };
  // An earlier upload whose hour has passed: the next upload clears its hash.
  await db.prepare("UPDATE arena_scores SET created_at = datetime('now', '-2 hours') WHERE name = 'current'").run();
  const forged = await handleArenaScores(new Request(request(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7" },
    body: JSON.stringify({ ...score(), name: "forged", pnl: 99_999_999_999 }),
  }), env);
  assert.equal(forged.status, 201);
  const row = await db.prepare("SELECT pnl, verified, ip_hash FROM arena_scores WHERE name = 'forged'")
    .first<{ pnl: number; verified: number; ip_hash: string }>();
  assert.equal(row?.pnl, replayRanked({ seed: 42, actions: score().actions }).pnl, "the replay's result, not the claim");
  assert.equal(row?.verified, 1);
  assert.match(row!.ip_hash, /^[0-9a-f]{24}$/);
  const unkeyed = createHash("sha256").update("flow-arena:203.0.113.7").digest("hex").slice(0, 24);
  assert.notEqual(row!.ip_hash, unkeyed, "keyed with ARENA_IP_KEY");
  const old = await db.prepare("SELECT ip_hash FROM arena_scores WHERE name = 'current'").first<{ ip_hash: string }>();
  assert.equal(old?.ip_hash, "");
});

test("an upload whose replay fails is never ranked but still counts toward the hourly limit", async () => {
  const env = { ARENA_DB: db as unknown as D1Database };
  const failing = () => { throw new Error("engine failure"); };
  const upload = () => handleArenaScores(new Request(request(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.9" },
    body: JSON.stringify({ ...score(), name: "refused" }),
  }), env, failing);
  for (let i = 0; i < 20; i++) assert.equal((await upload()).status, 400);
  assert.equal((await upload()).status, 429);
  const board = (await (await handleArenaScores(request(), env)).json()) as any;
  assert.equal(board.scores.some((s: any) => s.name === "refused"), false);
});
