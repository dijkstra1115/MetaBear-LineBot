import type { LineMessage } from "./types";

// Every push to one LINE user goes through here, so each sender reads LINE's answer the same way:
// a 409 that carries an accepted request ID means an earlier try with this retry key already got
// through; 429 (rate limit) and 5xx may pass on a later try; anything else will not.
export type PushOutcome = "accepted" | "retry" | "rejected";

export async function linePush(
  env: Env,
  to: string,
  messages: LineMessage[],
  retryKey: string,
): Promise<{ outcome: PushOutcome; status: number }> {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": retryKey,
    },
    body: JSON.stringify({ to, messages }),
  });
  await response.body?.cancel();
  const accepted =
    response.ok ||
    (response.status === 409 &&
      response.headers.has("x-line-accepted-request-id"));
  return {
    outcome: accepted
      ? "accepted"
      : response.status === 429 || response.status >= 500
        ? "retry"
        : "rejected",
    status: response.status,
  };
}
