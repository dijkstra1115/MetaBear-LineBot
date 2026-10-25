import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mergeBars, mergeMetrics, mergeParts } from "../src/orderflow/aggregate";

const MINUTE = 60_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 25, 3, 0);

test("全市場 bars take Binance's prices and sum every exchange's volume per price bin", () => {
  const bars = mergeBars({
    binance: [[T0, 80_000, 80_020, 79_990, 80_010, [[8000, 1, 2]]]],
    bybit: [
      [T0, 80_003, 80_030, 79_980, 80_012, [[8000, 0.5, 0], [8001, 1, 1]]],
      [T0 + MINUTE, 80_012, 80_015, 80_005, 80_014, [[8001, 1, 0]]],
    ],
    okx: [[T0, 79_999, 80_019, 79_989, 80_009, [[8000, 0.25, 0.25]]]],
  });
  assert.deepEqual(bars, [
    [T0, 80_000, 80_020, 79_990, 80_010, [[8000, 1.75, 2.25], [8001, 1, 1]]],
    // Binance missing the minute: the next exchange in order prices it.
    [T0 + MINUTE, 80_012, 80_015, 80_005, 80_014, [[8001, 1, 0]]],
  ]);
});

test("全市場 OI sums only the exchanges whose readings cover the period, and ratios are Binance's", () => {
  const m = (t: number, oi: number, usd: number, ratio: number | null = null) => [t, oi, usd, ratio, null, ratio, 1.1, 0.0001];
  const rows = mergeMetrics(
    {
      binance: [m(T0, 100, 8_000_000, 2), m(T0 + 5 * MINUTE, 101, 8_080_000, 2.1)],
      bybit: [m(T0, 50, 4_000_000), m(T0 + 5 * MINUTE, 49, 3_920_000)],
      // BingX started later than the period: left out instead of stepping the sum up.
      bingx: [m(T0 + 10 * MINUTE, 6, 480_000)],
    },
    T0,
  );
  assert.deepEqual(rows, [
    [T0, 150, 12_000_000, 2, null, 2, null, 0.0001],
    [T0 + 5 * MINUTE, 150, 12_000_000, 2.1, null, 2.1, null, 0.0001],
  ]);
});

test("全市場 liquidations come from each collector's own exchange only, and prints carry their exchange", () => {
  const merged = mergeParts(
    {
      bybit: { liquidations: [[T0 + 2, "long", 80_000, 1, "bybit"], [T0 + 1, "short", 80_000, 2, "okx"]], prints: [[T0 + 5, "buy", 80_000, 3]] },
      okx: { liquidations: [[T0 + 1, "short", 80_000, 2, "okx"]], prints: [[T0 + 4, "sell", 80_001, 2]] },
      binance: { heat: [[T0, 80_000, 7900, [1]]] },
    },
    T0,
  );
  assert.deepEqual(merged.liquidations, [[T0 + 1, "short", 80_000, 2, "okx"], [T0 + 2, "long", 80_000, 1, "bybit"]]);
  assert.deepEqual(merged.prints, [[T0 + 4, "sell", 80_001, 2, "okx"], [T0 + 5, "buy", 80_000, 3, "bybit"]]);
  assert.deepEqual(merged.heat, [[T0, 80_000, 7900, [1]]], "the heatmap is Binance's");
});

// Through the Worker: rows imported into each exchange's collector come back merged with ?ex=all.
const token = "test-orderflow-token-not-a-live-credential";
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
      },
      bindings: { ORDERFLOW_ADMIN_TOKEN: token, ORDERFLOW_STREAMS: "off" },
      outboundService: async () => new Response("not found", { status: 404 }),
    }),
  );
});
after(async () => {
  await mf?.dispose();
});

test("?ex=all merges the collectors' days, and only reads are allowed", async () => {
  const day = Math.floor(Date.now() / DAY) * DAY - 2 * DAY;
  const d = new Date(day).toISOString().slice(0, 10);
  const post = (ex: string, rows: unknown[]) =>
    mf.dispatchFetch(`${base}/import?ex=${ex}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ rows }) });
  assert.equal((await post("binance", [[day, 80_000, 80_010, 79_990, 80_005, [[8000, 1, 1]]]])).status, 200);
  assert.equal((await post("okx", [[day, 80_002, 80_012, 79_992, 80_007, [[8000, 0.5, 0]]]])).status, 200);
  assert.equal((await post("bingx", [[day, 80_001, 80_011, 79_991, 80_006, [[8000, 0, 0.25]]]])).status, 200);
  assert.equal((await post("all", [])).status, 400, "全市場 cannot be written");

  const res = await mf.dispatchFetch(`${base}/day?d=${d}&ex=all`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.source, "all");
  assert.deepEqual(body.bars, [[day, 80_000, 80_010, 79_990, 80_005, [[8000, 1.5, 1.25]]]]);
  for (const ex of ["okx", "bingx"]) assert.equal(((await (await mf.dispatchFetch(`${base}/day?d=${d}&ex=${ex}`)).json()) as any).source, ex);
});
