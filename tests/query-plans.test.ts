import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Queries run on every reply or by the 5-minute cron (migrations/0019_hot_query_indexes.sql). D1 bills
// every row read, and these tables only grow, so none of them may scan its table.
const HOT: Record<string, string> = {
  "setOutgoingStatus (conversations.ts)":
    "UPDATE conversation_messages SET delivery_status=? WHERE event_id=? AND direction='bot' AND delivery_status<>'accepted'",
  "dispatchCrm, jobs due (automation.ts)":
    "SELECT id FROM crm_jobs WHERE next_at<=? AND (status='pending' OR (status='running' AND lease_until<?)) ORDER BY created_at LIMIT 50",
  "dispatchCrm, an account's open job (automation.ts)":
    "SELECT 1 FROM crm_jobs j WHERE j.line_user_id=? AND (j.status IN ('pending','running') OR (j.status='failed' AND j.created_at>?))",
  "ensureRichMenu (line-rich-menu.ts)":
    "SELECT id FROM audit_log WHERE json_extract(detail,'$.menuName')=? AND (action='line.menu.installed' OR (action='line.menu.queued' AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 minutes'))) LIMIT 1",
  "enqueueOrderflowEvents, daily counts (orderflow-subs.ts)":
    "SELECT line_user_id,count(*) AS n FROM orderflow_alert_deliveries WHERE day=? AND status IN ('pending','sending','accepted') GROUP BY line_user_id",
};

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: "2026-09-11", d1Databases: ["DB"],
  }));
  db = await mf.getD1Database("DB");
  const sql = (await Promise.all((await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => readFile("migrations/" + f, "utf8").then((s) => s.replaceAll("\r\n", "\n"))))).join("\n");
  await db.batch(sql.split(";").map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s)));
});
after(async () => { await mf?.dispose(); });

test("queries run on every reply or every cron use an index", async () => {
  for (const [name, sql] of Object.entries(HOT)) {
    const params = Array((sql.match(/\?/g) ?? []).length).fill(null);
    const plan = (await db.prepare("EXPLAIN QUERY PLAN " + sql).bind(...params).all<{ detail: string }>()).results.map((r) => r.detail);
    assert.ok(plan.length, name);
    assert.deepEqual(plan.filter((d) => /^SCAN /.test(d)), [], `${name}: ${plan.join(" | ")}`);
  }
});
