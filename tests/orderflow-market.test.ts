import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// The 全市場 collector reading the exchanges' collectors: merged minutes, prints that keep their
// exchange, and a 跨所同步大單 found on the merged prints at a key level.
const token = "test-orderflow-token-not-a-live-credential";
const MINUTE = 60_000;
const DAY = 86_400_000;
const base = "https://metabear.io/api/orderflow/btcusdt";
let mf: Miniflare;

before(async () => {
  const result = await build({ entryPoints: ["src/orderflow/index.ts"], bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022", external: ["cloudflare:workers"] });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: "2026-09-11",
      durableObjects: {
        COLLECTOR: { className: "Collector", useSQLite: true },
        BINANCE: { className: "BinanceCollector", useSQLite: true },
        OKX: { className: "OkxCollector", useSQLite: true },
        BINGX: { className: "BingxCollector", useSQLite: true },
        MARKET: { className: "MarketCollector", useSQLite: true },
      },
      bindings: { ORDERFLOW_ADMIN_TOKEN: token, ORDERFLOW_STREAMS: "off" },
      outboundService: async () => new Response("not found", { status: 404 }),
    }),
  );
});
after(async () => {
  await mf?.dispose();
});

const post = (ex: string, body: unknown) =>
  mf.dispatchFetch(`${base}/import?ex=${ex}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
const getJson = async (path: string) => (await (await mf.dispatchFetch(base + path)).json()) as any;
async function until<T>(check: () => Promise<T | undefined | false>, what: string, ms = 15_000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 200))) {
    const v = await check();
    if (v) return v;
  }
  throw new Error(`timed out waiting for ${what}`);
}

test("全市場 merges the exchanges' minutes and finds a 跨所同步大單 at a key level", async () => {
  const now = Date.now();
  const yesterday = Math.floor(now / DAY) * DAY - DAY;
  const minute = Math.floor(now / MINUTE) * MINUTE - MINUTE;
  const row = (t: number, buy: number, sell: number) => [t, 80_000, 80_005, 79_995, 80_000, [[8000, buy, sell]]];
  // Yesterday around 80,000 gives today's levels (POC, high, low) near it.
  assert.equal((await post("binance", { rows: Array.from({ length: 60 }, (_, k) => row(yesterday + k * MINUTE, 5, 5)) })).status, 200);
  for (const [ex, buy] of [["binance", 3], ["okx", 2], ["bybit", 1]] as const) {
    assert.equal((await post(ex, { rows: [row(minute, buy, 0)] })).status, 200);
    // One 12 BTC sell print each, seconds apart: three exchanges within 10 s.
    const t = minute + 1_000 + ["binance", "okx", "bybit"].indexOf(ex) * 2_000;
    assert.equal((await post(ex, { prints: [[t, "sell", 80_000, 12]], from: minute, to: minute + MINUTE })).status, 200);
  }

  await getJson("/status?ex=all"); // wakes the 全市場 collector
  const recent = await until(async () => {
    const r = await getJson(`/recent?ex=all&since=${minute}`);
    return r.bars?.length && r.prints?.length === 3 ? r : undefined;
  }, "merged minutes");
  assert.equal(recent.source, "all");
  assert.deepEqual(recent.bars[0][5], [[8000, 6, 0]], "volume summed over the exchanges");
  assert.deepEqual(recent.prints.map((p: unknown[]) => p[4]).sort(), ["binance", "bybit", "okx"], "prints keep their exchange");

  const events = await until(async () => {
    const r = await getJson(`/events?ex=all&since=${minute}`);
    return r.events?.some((e: { kind: string }) => e.kind === "cross") ? r.events : undefined;
  }, "the cross event");
  const cross = events.find((e: { kind: string }) => e.kind === "cross");
  assert.equal(cross.side, "sell");
  assert.match(cross.text, /跨所同步大單 Binance、OKX、Bybit 10 秒內同時主動賣 36\.0 BTC/);
  assert.ok(cross.level, "placed at a key level");

  // Only reads and the admin's re-merge reach 全市場.
  assert.equal((await post("all", { rows: [] })).status, 400);
});

test("全市場 writes only the rows that changed between merges", async () => {
  const minute = Math.floor(Date.now() / MINUTE) * MINUTE - MINUTE;
  const status = () => getJson("/status?ex=all");
  const printsNow = async () => (await getJson(`/recent?ex=all&since=${minute - 5 * MINUTE}`)).prints as unknown[][];
  const sameCount = async () => (await status()).lastMergeWrites === 0;

  const t = minute + 30_000;
  await until(sameCount, "a merge with nothing to write", 30_000);

  // A print arrives: it is written, and the next merge writes nothing again.
  assert.equal((await post("okx", { prints: [[t, "buy", 80_100, 7]], from: t, to: t + 1 })).status, 200);
  await until(async () => (await status()).lastMergeWrites > 0, "the merge that writes the new print", 30_000);
  assert.deepEqual((await printsNow()).find((p) => p[0] === t), [t, "buy", 80_100, 7, "okx"]);
  await until(sameCount, "the merge after the new print", 30_000);

  // A print leaves the exchange's answer: it leaves the merged minutes too.
  assert.equal((await post("okx", { prints: [], from: t, to: t + 1 })).status, 200);
  await until(async () => !(await printsNow()).some((p) => p[0] === t), "the print to go", 30_000);
});

test("the admin can have 全市場 merge every day again after a late backfill", async () => {
  const remerge = (query: string) => mf.dispatchFetch(`${base}/archive?ex=all${query}`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  const today = new Date(Math.floor(Date.now() / DAY) * DAY).toISOString().slice(0, 10);
  assert.equal((await mf.dispatchFetch(`${base}/archive?ex=all&days=all`, { method: "POST" })).status, 401);
  assert.equal(((await (await remerge("")).json()) as any).remerge.length, 2, "today and yesterday by default");
  const all = ((await (await remerge("&days=all")).json()) as any).remerge as string[];
  assert.equal(all.length, 30);
  assert.equal(all.at(-1), today);
  const yesterday = Math.floor(Date.now() / DAY) * DAY - DAY;
  await until(async () => (await getJson("/status?ex=all")).mergedDays >= 1, "the re-merge to start");
  assert.ok((await getJson(`/recent?ex=all&since=${yesterday}`)).bars?.length, "history merged again");
});
