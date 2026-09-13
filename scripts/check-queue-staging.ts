// Exercises the deployed queue using a temporary synthetic customer and no replyToken.
// No LINE chat is sent. Removes its own test records only after both events finish.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const base = "https://metabear-line-crm-staging.style78432.workers.dev";
const vars = Object.fromEntries(
  (await readFile(".dev.vars.staging", "utf8"))
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
async function sql(command: string) {
  const { stdout } = await execute(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "metabear-crm-staging",
      "--env",
      "staging",
      "--remote",
      "--json",
      "--command",
      command,
    ],
    { timeout: 20000 },
  );
  const results = JSON.parse(stdout);
  assert.ok(results.every((r: any) => r.success));
  return results;
}
const userId = "U" + randomBytes(16).toString("hex");
const eventIds: string[] = [];
assert.equal(
  (
    await sql(
      `SELECT count(*) AS n FROM customers WHERE line_user_id='${userId}'`,
    )
  )[0].results[0].n,
  0,
);
for (const [question, format, topic, page] of [
  [
    "我想透過 BitoPro 轉 USDT 到 BingX，該怎麼做？",
    "text",
    "deposit_bitopro",
    0,
  ],
  ["看圖", "image", "deposit_bitopro", 0],
  ["下一組圖", "image", "deposit_bitopro", 1],
]) {
  const id = "queue-smoke-" + randomUUID();
  eventIds.push(id);
  const body = JSON.stringify({
    events: [
      {
        webhookEventId: id,
        type: "message",
        timestamp: Date.now(),
        source: { type: "user", userId },
        message: { type: "text", text: question },
      },
    ],
  });
  const start = Date.now();
  const response = await fetch(base + "/webhook/line", {
    method: "POST",
    body,
    headers: {
      "X-Line-Signature": createHmac("sha256", vars.LINE_CHANNEL_SECRET)
        .update(body)
        .digest("base64"),
    },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  await response.body?.cancel();
  const acknowledgedMs = Date.now() - start;
  const deadline = Date.now() + 45000;
  let completed = false;
  while (Date.now() < deadline) {
    const result = await sql(
      `SELECT status FROM webhook_events WHERE event_id='${id}'; SELECT topic,format,image_page FROM teaching_context WHERE line_user_id='${userId}'`,
    );
    if (result[0].results[0]?.status === "done") {
      assert.equal(result[1].results[0]?.topic, topic);
      assert.equal(result[1].results[0]?.format, format);
      assert.equal(result[1].results[0]?.image_page, page);
      completed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.ok(completed, "Queue did not complete synthetic event " + id);
  console.log(
    JSON.stringify({
      eventId: id,
      acknowledgedMs,
      completedMs: Date.now() - start,
      format,
      status: "done",
      chatMessagesSent: 0,
    }),
  );
}
await sql(
  `DELETE FROM teaching_context WHERE line_user_id='${userId}'; DELETE FROM audit_log WHERE line_user_id='${userId}'; DELETE FROM customer_leases WHERE line_user_id='${userId}'; DELETE FROM customers WHERE line_user_id='${userId}'; DELETE FROM webhook_events WHERE event_id IN (${eventIds.map((id) => `'${id}'`).join(",")})`,
);
assert.equal(
  (
    await sql(
      `SELECT count(*) AS n FROM customers WHERE line_user_id='${userId}'`,
    )
  )[0].results[0].n,
  0,
);
console.log(
  JSON.stringify({
    check: "deployed queue and teaching context",
    passed: true,
    syntheticCustomerRemoved: true,
    chatMessagesSent: 0,
  }),
);
