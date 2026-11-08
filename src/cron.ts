import { dispatchCrm } from "./automation";
import { dispatchCampaigns } from "./campaigns";
import { cleanupConversations } from "./conversations";
import { ensureRichMenu } from "./line-rich-menu";
import { cleanupAuth } from "./native-auth";
import { dispatchOrderflowAlerts } from "./orderflow-subs";
import { dispatchSignals } from "./signals";
import { dispatchSupportNotifications } from "./support";

export type CronTask = [name: string, run: (env: Env) => Promise<unknown>];

// The 5-minute cron, in order.
export const CRON_TASKS: CronTask[] = [
  ["campaigns", (env) => dispatchCampaigns(env)],
  ["signals", (env) => dispatchSignals(env)],
  ["orderflow-alerts", dispatchOrderflowAlerts],
  ["crm", dispatchCrm],
  ["support", dispatchSupportNotifications],
  ["auth-cleanup", cleanupAuth],
  ["conversation-cleanup", cleanupConversations],
  ["rich-menu", ensureRichMenu],
];

// Every task runs even when an earlier one fails, so one broken dispatcher does not hold back the
// other deliveries and cleanups; the run still fails afterwards so Cloudflare records it.
export async function runCron(env: Env, tasks: CronTask[] = CRON_TASKS) {
  const failed: string[] = [];
  for (const [task, run] of tasks) {
    try {
      await run(env);
    } catch (error) {
      failed.push(task);
      console.error(
        JSON.stringify({
          event: "cron.task.failed",
          task,
          errorType: error instanceof Error ? error.name : "Unknown",
        }),
      );
    }
  }
  if (failed.length) throw new Error(`Cron tasks failed: ${failed.join(", ")}`);
}
