import { test } from "node:test";
import assert from "node:assert/strict";
import { getRate } from "../src/rates";

test("public rate uses the USDT/TWD market and reports retrieval time", async () => {
  const response = await getRate(async (input) => {
    assert.equal(input, "https://api.bitopro.com/v3/tickers/usdt_twd");
    return Response.json({
      data: { pair: "usdt_twd", lastPrice: "31.72500000" },
    });
  });
  const body = (await response.json()) as { rate: number; fetchedAt: string };
  assert.equal(response.status, 200);
  assert.equal(body.rate, 31.725);
  assert.ok(Math.abs(Date.now() - Date.parse(body.fetchedAt)) < 5000);
});
test("invalid, failed, or missing rates never produce a fabricated quote", async () => {
  for (const data of [
    { pair: "btc_twd", lastPrice: "31" },
    { pair: "usdt_twd", lastPrice: "0" },
    { pair: "usdt_twd", lastPrice: "NaN" },
    {},
  ]) {
    assert.equal(
      (await getRate(async () => Response.json({ data }))).status,
      503,
    );
  }
  const failed = await getRate(async () => {
    throw Error("offline");
  });
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("Cache-Control"), "no-store");
  assert.equal(
    (await getRate(async () => new Response(null, { status: 429 }))).status,
    503,
  );
});
