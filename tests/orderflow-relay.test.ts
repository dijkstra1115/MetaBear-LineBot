import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// The Binance collector driven through its relay socket, with this test playing the relay:
// it forwards stream messages and answers the collector's REST requests.
const relayToken = "test-relay-token-not-a-live-credential";
const MINUTE = 60_000;
const base = "https://metabear.io/api/orderflow";
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
      durableObjects: { COLLECTOR: { className: "Collector", useSQLite: true }, BINANCE: { className: "BinanceCollector", useSQLite: true } },
      bindings: { ORDERFLOW_RELAY_TOKEN: relayToken, ORDERFLOW_STREAMS: "off" },
      outboundService: async () => new Response("not found", { status: 404 }),
    }),
  );
});
after(async () => {
  await mf?.dispose();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(check: () => T | undefined | false | Promise<T | undefined | false>, what: string, ms = 3_000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await wait(20)) {
    const v = await check();
    if (v) return v;
  }
  throw new Error(`timed out waiting for ${what}`);
}

test("only the relay's token opens the relay socket, and unknown exchanges are refused", async () => {
  const open = (auth: string) => mf.dispatchFetch(`${base}/relay`, { headers: { upgrade: "websocket", authorization: auth } });
  assert.equal((await open("Bearer wrong")).status, 401);
  assert.equal((await open("")).status, 401);
  assert.equal((await mf.dispatchFetch(`${base}/relay`, { headers: { authorization: `Bearer ${relayToken}` } })).status, 426);
  assert.equal((await mf.dispatchFetch(`${base}/btcusdt/status?ex=kraken`)).status, 404);
});

test("relayed trades and depth become Binance footprints, prints and a book; missed trade ids are fetched", async () => {
  const res = await mf.dispatchFetch(`${base}/relay`, { headers: { upgrade: "websocket", authorization: `Bearer ${relayToken}` } });
  assert.equal(res.status, 101);
  const ws = res.webSocket!;
  ws.accept();
  const asked: string[] = [];
  const t0 = Math.floor(Date.now() / MINUTE) * MINUTE - MINUTE;
  const agg = (a: number, t: number, p: string, q: string, m: boolean) => ({ a, T: t, p, q, m, e: "aggTrade" });
  ws.addEventListener("message", (e) => {
    const req = JSON.parse(String(e.data));
    asked.push(req.get);
    const reply = (body: unknown) => ws.send(JSON.stringify({ id: req.id, status: 200, body: JSON.stringify(body) }));
    if (req.get.startsWith("/fapi/v1/depth")) reply({ lastUpdateId: 100, bids: [["80000.0", "1"]], asks: [["80000.1", "2"]] });
    else if (req.get.startsWith("/fapi/v1/aggTrades")) reply([agg(2, t0 + 2_000, "80003.0", "1.2", false), agg(3, t0 + 2_000, "80004.0", "1.3", false)]);
  });
  const send = (stream: string, data: unknown) => ws.send(JSON.stringify({ stream, data }));
  send("btcusdt@depth@100ms", { e: "depthUpdate", E: t0, U: 95, u: 101, pu: 94, b: [["79999.0", "3"]], a: [] });
  send("btcusdt@aggTrade", agg(1, t0 + 1_000, "80001.0", "0.5", true));
  // Ids 2 and 3 never arrive on the stream.
  send("btcusdt@aggTrade", agg(4, t0 + 3_000, "80010.0", "0.25", true));
  send("btcusdt@aggTrade", agg(5, t0 + 4_000, "80011.0", "0.1", false)); // closes the run of 4
  send("btcusdt@forceOrder", { e: "forceOrder", o: { S: "SELL", q: "0.3", p: "79990", ap: "79995", z: "0.3", T: t0 + 4_500 } });

  await until(() => asked.some((p) => p === "/fapi/v1/aggTrades?symbol=BTCUSDT&fromId=2&limit=1000"), "the gap request");
  await until(() => asked.some((p) => p.startsWith("/fapi/v1/depth")), "the depth snapshot");

  const recent = async () => (await (await mf.dispatchFetch(`${base}/btcusdt/recent?ex=binance&since=${t0}`)).json()) as any;
  const body = await until(async () => {
    const b = await recent();
    return b.prints?.length ? b : undefined;
  }, "the backfilled trades");
  assert.equal(body.source, "binance");
  assert.equal(body.status.binance, "open");
  // Trade 5 is still held as an open run (it closes with the next trade or alarm).
  assert.deepEqual(body.bars, [[t0, 80_001, 80_010, 80_001, 80_010, [[8000, 2.5, 0.5], [8001, 0, 0.25]]]], "open and close follow trade time, backfill included");
  assert.deepEqual(body.prints, [[t0 + 2_000, "buy", 80_003.5, 2.5]], "the backfilled order's two fills are one print");
  assert.deepEqual(body.liquidations, [[t0 + 4_500, "long", 79_995, 0.3, "binance"]]);

  const status = (await (await mf.dispatchFetch(`${base}/btcusdt/status?ex=binance`)).json()) as any;
  assert.equal(status.bookReady, true);
  assert.equal(status.aggId, 5);
  assert.equal(status.bybit, undefined);

  // Bybit's object is untouched.
  const bybit = (await (await mf.dispatchFetch(`${base}/btcusdt/recent?since=${t0}`)).json()) as any;
  assert.equal(bybit.source, "bybit");
  assert.deepEqual(bybit.bars, []);
  ws.close(1000, "done");
});
