// LINE only shows this while a user has the one-to-one chat open.
// Failure of this optional indicator must never delay or fail the actual reply.
export async function startLoading(
  env: Env,
  userId: string,
  loadingSeconds = 60,
) {
  if (env.LINE_DELIVERY_MODE !== "live" || !env.LINE_CHANNEL_ACCESS_TOKEN)
    return;
  const seconds = Math.min(
    60,
    Math.max(5, Math.round(loadingSeconds / 5) * 5),
  );
  try {
    const response = await fetch(
      "https://api.line.me/v2/bot/chat/loading/start",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chatId: userId, loadingSeconds: seconds }),
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!response.ok)
      console.warn(
        JSON.stringify({
          event: "line.loading.failed",
          status: response.status,
        }),
      );
    await response.body?.cancel();
  } catch {
    console.warn(JSON.stringify({ event: "line.loading.unavailable" }));
  }
}
