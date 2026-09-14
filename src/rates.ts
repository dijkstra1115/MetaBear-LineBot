const ENDPOINT = "https://api.bitopro.com/v3/tickers/usdt_twd";

export async function getRate(
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  try {
    const upstream = await fetcher(ENDPOINT, {
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) throw Error("Rate unavailable");
    const body = (await upstream.json()) as {
      data?: { pair?: string; lastPrice?: string };
    };
    const rate = Number(body.data?.lastPrice);
    if (body.data?.pair !== "usdt_twd" || !Number.isFinite(rate) || rate <= 0)
      throw Error("Invalid rate");
    return Response.json(
      {
        rate,
        source: "BitoPro",
        pair: "USDT/TWD",
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, max-age=15" } },
    );
  } catch {
    return Response.json(
      { error: "匯率暫時無法取得，請稍後重試。" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
