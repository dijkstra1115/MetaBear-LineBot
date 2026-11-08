import { test } from "node:test";
import assert from "node:assert/strict";
import { CRON_TASKS, runCron, type CronTask } from "../src/cron";

test("a failing cron task does not stop the ones after it, and the run still fails", async (t) => {
  const ran: string[] = [];
  const errors = t.mock.method(console, "error", () => {});
  const tasks: CronTask[] = [
    ["first", async () => ran.push("first")],
    ["broken", async () => {
      ran.push("broken");
      throw new TypeError("D1 hiccup");
    }],
    ["last", async () => ran.push("last")],
  ];
  await assert.rejects(runCron({} as Env, tasks), /Cron tasks failed: broken/);
  assert.deepEqual(ran, ["first", "broken", "last"]);
  assert.match(String(errors.mock.calls[0].arguments[0]), /"task":"broken","errorType":"TypeError"/);
});

test("the cron keeps every dispatcher and cleanup", () => {
  assert.deepEqual(
    CRON_TASKS.map(([name]) => name),
    ["campaigns", "signals", "orderflow-alerts", "crm", "support", "auth-cleanup", "conversation-cleanup", "rich-menu"],
  );
});
