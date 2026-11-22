import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { audienceQuery, customerPage } from "../src/audience";

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

const explain = async (sql: string, values: unknown[]) =>
  (await db.prepare("EXPLAIN QUERY PLAN " + sql).bind(...values).all<{ detail: string }>()).results.map((r) => r.detail);

// processCampaign checks every recipient again before its push, up to 500 per send. The customer list
// pages over every customer, so its volume and last-trade lookups may only touch the 50 rows shown.
test("campaign and customer list queries never scan daily_metrics", async () => {
  for (const filters of [{}, { min: "100", max: "5000" }, { inactive: "7", q: "1234" }]) {
    const query = audienceQuery(new URLSearchParams({ ...filters, month: "2026-11" }), true);
    const recipient = await explain(query.sql + " AND c.line_user_id=?", [...query.values, "U0"]);
    assert.deepEqual(recipient.filter((d) => /^(SCAN|MATERIALIZE) /.test(d)), [], recipient.join(" | "));
    for (const [name, sql, values] of [
      ["count", `SELECT count(*) AS total FROM (${query.sql})`, query.values],
      ["page", customerPage(query.sql), [...query.values, 0]],
      ["preview", query.sql + " ORDER BY c.line_user_id LIMIT ?", [...query.values, 501]],
    ] as const) {
      const plan = await explain(sql, [...values]);
      assert.deepEqual(plan.filter((d) => /^SCAN (dm|daily_metrics)\b|^MATERIALIZE /.test(d)), [], `${name}: ${plan.join(" | ")}`);
    }
  }
});

test("queries run on every reply or every cron use an index", async () => {
  for (const [name, sql] of Object.entries(HOT)) {
    const params = Array((sql.match(/\?/g) ?? []).length).fill(null);
    const plan = (await db.prepare("EXPLAIN QUERY PLAN " + sql).bind(...params).all<{ detail: string }>()).results.map((r) => r.detail);
    assert.ok(plan.length, name);
    assert.deepEqual(plan.filter((d) => /^SCAN /.test(d)), [], `${name}: ${plan.join(" | ")}`);
  }
});
