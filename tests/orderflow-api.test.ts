import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const token = "test-orderflow-token-not-a-live-credential";
const MINUTE = 60_000;
const DAY = 86_400_000;
const base = "https://metabear.io/api/orderflow/btcusdt";
let mf: Miniflare;

before(async () => {
  const result = await build({
    entryPoints: ["src/orderflow/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    external: ["cloudflare:workers"],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: "2026-09-11",
      durableObjects: { COLLECTOR: { className: "Collector", useSQLite: true } },
      // Streams stay off so tests never reach Bybit or OKX.
      bindings: { ORDERFLOW_ADMIN_TOKEN: token, ORDERFLOW_STREAMS: "off" },
      // The daily archive import still runs; it finds no file (tests/orderflow-archive.test.ts covers it).
      outboundService: async () => new Response("not found", { status: 404 }),
    }),
  );
});
after(async () => {
  await mf?.dispose();
});

const call = (path: string, init?: RequestInit) => mf.dispatchFetch(base + path, init);
const row = (t: number, price: number) => [t, price, price + 5, price - 5, price, [[Math.floor(price / 10), 1.5, 0.25]]];
const importRows = (rows: unknown[], auth = `Bearer ${token}`) =>
  call("/import", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ rows }) });

test("archive imports need the admin token and come back by UTC day and as recent minutes", async () => {
  const yesterday = Math.floor(Date.now() / DAY) * DAY - DAY;
  const recent = Math.floor(Date.now() / MINUTE) * MINUTE - 3 * MINUTE;
  const rows = [row(yesterday, 80_000), row(yesterday + MINUTE, 80_010), row(recent, 81_000)];

  assert.equal((await importRows(rows, "Bearer wrong")).status, 401);
  assert.equal((await importRows(rows, "")).status, 401);
  assert.equal((await call("/import")).status, 405);
  const imported = await importRows(rows);
  assert.equal(imported.status, 200);
  assert.deepEqual(await imported.json(), { imported: 3, prints: 0 });

  const d = new Date(yesterday).toISOString().slice(0, 10);
  const day = await call(`/day?d=${d}`);
  assert.equal(day.status, 200);
  const body = (await day.json()) as any;
  assert.equal(body.source, "bybit");
  assert.equal(body.tick, 10);
  assert.deepEqual(body.bars, rows.slice(0, 2));
  assert.deepEqual([body.heat, body.metrics, body.liquidations], [[], [], []]);
  assert.match(day.headers.get("cache-control")!, /public, max-age=600/);

  const since = await call(`/recent?since=${recent}`);
  const recentBody = (await since.json()) as any;
  assert.deepEqual(recentBody.bars, [rows[2]]);
  assert.match(since.headers.get("cache-control")!, /max-age=3/);
});

test("an archive day's prints replace the stored prints in its range only", async () => {
  // Days no other test reads, so the edge cache holds nothing for them yet.
  const from = Math.floor(Date.now() / DAY) * DAY - 3 * DAY;
  const post = (body: unknown) =>
    call("/import", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = new Date(from).toISOString().slice(0, 10);
  const next = new Date(from + DAY).toISOString().slice(0, 10);
  assert.equal((await post({ prints: [[from + 5, "buy", 80_000, 12]] })).status, 400, "prints need their range");
  assert.equal((await post({ prints: [[from + 5, "buy", 80_000, 12], [from + DAY + 5, "sell", 80_100, 3]], from, to: from + 2 * DAY })).status, 200);
  const replaced = await post({ prints: [[from + 9, "sell", 79_950, 20.5]], from, to: from + DAY });
  assert.deepEqual(await replaced.json(), { imported: 0, prints: 1 });
  const day = (await (await call(`/day?d=${d}`)).json()) as any;
  assert.deepEqual(day.prints, [[from + 9, "sell", 79_950, 20.5]]);
  const after = (await (await call(`/day?d=${next}`)).json()) as any;
  assert.deepEqual(after.prints, [[from + DAY + 5, "sell", 80_100, 3]], "the next day is untouched");
});

test("requests outside the allowed shapes are refused before reaching the collector", async () => {
  const now = Date.now();
  for (const query of ["d=2026-1-5", "d=not-a-day", `d=${new Date(now + 2 * DAY).toISOString().slice(0, 10)}`, "d=2020-01-01"])
    assert.equal((await call(`/day?${query}`)).status, 400, query);
  const minute = Math.floor(now / MINUTE) * MINUTE;
  for (const since of [minute + 1, minute - 3 * DAY, minute + 5 * MINUTE, "abc"])
    assert.equal((await call(`/recent?since=${since}`)).status, 400, String(since));
  assert.equal((await call("/unknown")).status, 404);
  // The 10-second book columns were dropped on 2026-10-29; the heatmap reads per-minute columns.
  assert.equal((await call(`/book?from=${Math.floor(now / (30 * MINUTE)) * 30 * MINUTE}`)).status, 404);
  assert.equal((await mf.dispatchFetch("https://metabear.io/api/orderflow/dogeusdt/status")).status, 404, "markets.js lists the markets");
  assert.equal((await mf.dispatchFetch("https://metabear.io/api/orderflow/btcusdt")).status, 404);
  assert.equal((await call("/status", { method: "POST" })).status, 405);
  const status = (await (await call("/status")).json()) as any;
  assert.deepEqual(status.open, []);
  assert.equal(status.bybit, "idle");
});

test("ETH has its own collector, named for its market, with ETH's price bins", async () => {
  const minute = Math.floor(Date.now() / MINUTE) * MINUTE - 2 * MINUTE;
  const eth = "https://metabear.io/api/orderflow/ethusdt";
  const post = (path: string, rows: unknown[]) =>
    mf.dispatchFetch(path + "/import", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ rows }) });
  assert.equal((await post(eth, [[minute, 2311, 2312, 2310.5, 2311.5, [[4622, 40, 10]]]])).status, 200);
  const body = (await (await mf.dispatchFetch(`${eth}/recent?since=${minute}`)).json()) as any;
  assert.deepEqual([body.symbol, body.tick, body.source], ["ETHUSDT", 0.5, "bybit"]);
  assert.equal(body.bars.length, 1);
  // BTC's collector never sees ETH's minutes.
  const btc = (await (await call(`/recent?since=${minute}`)).json()) as any;
  assert.equal(btc.symbol, "BTCUSDT");
  assert.ok(!btc.bars.some((b: number[]) => b[1] === 2311));
});
