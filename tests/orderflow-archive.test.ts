import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { ArchiveDay, archiveUrl } from "../public/lab/orderflow/bybit.js";

const token = "test-orderflow-token-not-a-live-credential";
const MINUTE = 60_000;
const DAY = 86_400_000;
const base = "https://metabear.io/api/orderflow/btcusdt";

// The day the collector imports first: the latest whose file is due (an hour after it ends).
const from = Math.floor((Date.now() - 3_600_000) / DAY) * DAY - DAY;
const day = new Date(from).toISOString().slice(0, 10);

// A small archive in Bybit's format: 30 minutes, each with small fills and one 3-fill taker
// order of 3.6 BTC (a large print). Random trade ids keep gzip from shrinking it to a few
// bytes, so a cut-off download stops partway through the day.
const lines = ["timestamp,symbol,side,size,price,tickDirection,trdMatchID,grossValue,homeNotional,foreignNotional,RPI"];
for (let m = 0; m < 30; m++) {
  for (let k = 0; k < 100; k++) {
    const t = (from + m * MINUTE + k * 500) / 1000;
    const price = (80_000 + m * 7 + (k % 13) * 1.5).toFixed(2);
    const side = k % 3 ? "Buy" : "Sell";
    const fills = k === 50 ? 3 : 1;
    for (let f = 0; f < fills; f++) lines.push(`${t.toFixed(4)},BTCUSDT,${side},${fills > 1 ? 1.2 : 0.01},${price},PlusTick,${randomUUID()},0,0,0,0`);
  }
}
const csv = lines.join("\n") + "\n";
const archive = gzipSync(csv);
const expected = new ArchiveDay();
for (const line of lines) expected.add(line);
const { rows: expectedRows, prints: expectedPrints } = expected.take();

let serve: "missing" | "cut" | "full" = "missing";
const requests: string[] = [];
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
      bindings: { ORDERFLOW_ADMIN_TOKEN: token, ORDERFLOW_STREAMS: "off" },
      outboundService: async (request: Request) => {
        // The collector adds a retry query to get past CDN edges that cached a 404.
        requests.push(request.url.split("?")[0]);
        // As Bybit's CloudFront does.
        if (!request.headers.get("user-agent")) return new Response("forbidden", { status: 403 });
        if (request.url.split("?")[0] !== archiveUrl(day) || serve === "missing") return new Response("not found", { status: 404 });
        if (serve === "full") return new Response(archive);
        // Half the file, then the connection drops.
        let sent = false;
        return new Response(
          new ReadableStream({
            async pull(controller) {
              if (sent) {
                // Give the half time to reach the Worker; an error drops whatever is still queued.
                await new Promise((r) => setTimeout(r, 200));
                return controller.error(new Error("connection reset"));
              }
              controller.enqueue(new Uint8Array(archive.subarray(0, archive.length >> 1)));
              sent = true;
            },
          }),
        );
      },
    }),
  );
});
after(async () => {
  await mf?.dispose();
});

const call = (path: string, init?: RequestInit) => mf.dispatchFetch(base + path, init);
const admin = (path: string, body?: unknown) =>
  call(path, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const status = async () => ((await (await call("/status")).json()) as any);

async function until(check: (s: any) => boolean, what: string) {
  for (let i = 0; i < 100; i++) {
    const s = await status();
    if (check(s)) return s;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`timed out waiting for ${what}: ${JSON.stringify((await status()).archive)}`);
}

test("the collector imports the previous day's archive by itself, resuming after a dropped download", async () => {
  // What the collector held before: a live-looking row for the first minute and prints for the
  // day (replaced) and for the next day (kept).
  const seeded = [from, 1, 1, 1, 1, [[8000, 9, 9]]];
  const nextDayPrint = [from + DAY + 5, "sell", 80_100, 3];
  assert.equal((await admin("/import", { rows: [seeded] })).status, 200);
  assert.equal((await admin("/import", { prints: [[from + 5, "buy", 1, 50], nextDayPrint], from, to: from + 2 * DAY })).status, 200);

  // Not published yet: wait and retry; only a file still missing 6 hours after the day is an error.
  let s = await until((s) => s.archive.state === "waiting", "a missing file");
  assert.equal(s.archive.day, day);
  assert.equal(s.archive.last, null);
  if (Date.now() < from + DAY + 6 * 3_600_000 - MINUTE) assert.deepEqual(s.errors, []);
  else if (Date.now() > from + DAY + 6 * 3_600_000 + MINUTE) assert.match(s.errors[0], /still missing \(HTTP 404\)/);

  // A download that drops halfway keeps the finished minutes and reports the failure.
  assert.equal((await call("/archive", { method: "POST" })).status, 401);
  serve = "cut";
  assert.equal((await admin("/archive")).status, 200);
  s = await until((s) => s.archive.state === "retrying", "the dropped download");
  assert.match(s.errors[0], new RegExp(`archive ${day}: `));
  const partial = s.counts.bars;
  assert.ok(partial > 1 && partial < 31, `some minutes written before the drop (${partial} bars)`);

  // The retry picks up from the last finished minute and completes the day.
  serve = "full";
  const fetched = requests.length;
  await admin("/archive");
  s = await until((s) => s.archive.state === "done", "the import");
  assert.equal(s.archive.last, day);
  assert.ok(s.archive.trades < lines.length - 1, "the retry skipped the minutes already written");
  assert.equal(requests.slice(fetched).filter((u) => u === archiveUrl(day)).length, 1, "one more download");

  const body = (await (await call(`/day?d=${day}`)).json()) as any;
  assert.deepEqual(body.bars, expectedRows, "archive bars, the seeded first minute replaced");
  assert.ok(expectedPrints.length === 30 && expectedPrints.every((p: any) => p[3] === 3.6));
  assert.deepEqual(body.prints, expectedPrints, "the day's prints are the archive's");
  const next = (await (await call(`/day?d=${new Date(from + DAY).toISOString().slice(0, 10)}`)).json()) as any;
  assert.deepEqual(next.prints, [nextDayPrint], "the next day is untouched");

  // Imported days are not fetched again.
  const done = requests.length;
  await admin("/archive");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(requests.length, done);
  assert.equal((await status()).archive.last, day);
});
