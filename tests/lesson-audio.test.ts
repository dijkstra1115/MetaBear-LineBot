import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import {
  isLessonAudio,
  parseAudioRange,
  serveLessonAudio,
} from "../src/lesson-audio";
const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
const asset = {
  fetch: async (r: Request) =>
    new Response(r.method === "HEAD" ? null : bytes, {
      headers: {
        "Content-Length": "100",
        "Content-Type": "audio/mp4",
        ETag: '"v1"',
        "Last-Modified": "Mon, 28 Sep 2026 00:00:00 GMT",
      },
    }),
};
const request = (headers = {}, method = "GET") =>
  new Request("https://metabear.io/orderflow/motion/audio/btc-wall.m4a", {
    headers,
    method,
  });
test("audio ranges return exact bytes, including suffix/open/clipped ranges", async () => {
  for (const [value, a, b] of [
    ["bytes=10-19", 10, 19],
    ["bytes=-5", 95, 99],
    ["bytes=90-", 90, 99],
    ["bytes=90-1000", 90, 99],
  ] as const) {
    const response = await serveLessonAudio(request({ Range: value }), asset);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("Accept-Ranges"), "bytes");
    assert.equal(response.headers.get("Content-Range"), `bytes ${a}-${b}/100`);
    assert.equal(response.headers.get("Content-Length"), String(b - a + 1));
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      bytes.slice(a, b + 1),
    );
  }
});
test("GET, HEAD, invalid/multiple ranges and conditional requests retain HTTP semantics", async () => {
  for (const headers of [
    {},
    { Range: "bytes=x-y" },
    { Range: "bytes=0-1,5-6" },
    { Range: "bytes=5-6", "If-Range": '"old"' },
    { Range: "bytes=5-6", "If-Range": 'W/"v1"' },
    { Range: "bytes=5-6", "If-Range": "Sun, 27 Sep 2026 00:00:00 GMT" },
  ]) {
    const r = await serveLessonAudio(request(headers), asset);
    assert.equal(r.status, 200);
    assert.equal((await r.arrayBuffer()).byteLength, 100);
  }
  for (const validator of ['"v1"', "Mon, 28 Sep 2026 00:00:00 GMT"])
    assert.equal(
      (
        await serveLessonAudio(
          request({ Range: "bytes=5-6", "If-Range": validator }),
          asset,
        )
      ).status,
      206,
    );
  const head = await serveLessonAudio(
    request({ Range: "bytes=5-6" }, "HEAD"),
    asset,
  );
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(head.headers.get("Content-Length"), "100");
  const notModified = await serveLessonAudio(
    request({ "If-None-Match": '"v1"' }),
    {
      fetch: async (r) => {
        assert.equal(r.headers.get("If-None-Match"), '"v1"');
        return new Response(null, { status: 304 });
      },
    },
  );
  assert.equal(notModified.status, 304);
  for (const range of ["bytes=100-", "bytes=20-10", "bytes=-0"]) {
    const r = await serveLessonAudio(request({ Range: range }), asset);
    assert.equal(r.status, 416);
    assert.equal(r.headers.get("Content-Range"), "bytes */100");
  }
});
test("range slicing works across source chunks and rejects truncated data", async () => {
  let cancelled = false;
  const r = await serveLessonAudio(request({ Range: "bytes=15-35" }), {
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(bytes.slice(0, 20));
            c.enqueue(bytes.slice(20, 40));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "Content-Length": "100" } },
      ),
  });
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes.slice(15, 36));
  assert.equal(cancelled, true);
  const truncated = await serveLessonAudio(request({ Range: "bytes=90-99" }), {
    fetch: async () =>
      new Response(bytes.slice(0, 50), {
        headers: { "Content-Length": "100" },
      }),
  });
  assert.equal(truncated.status, 502);
});
test("only narration routes handled; all published files satisfy the buffer bound", async () => {
  assert.equal(isLessonAudio("/orderflow/motion/audio/../secret.m4a"), false);
  assert.equal(
    (await serveLessonAudio(request({}, "POST"), asset)).status,
    405,
  );
  assert.equal(parseAudioRange("bytes=99999999999999999999-", 100), null);
  const dir = new URL("../public/orderflow/motion/audio/", import.meta.url);
  for (const name of readdirSync(dir))
    if (name.endsWith(".m4a"))
      assert.ok(statSync(new URL(name, dir)).size <= 2 * 1024 * 1024, name);
});

test("asset streams without Content-Length support ranges with bounded buffering", async () => {
  const withoutLength = {
    fetch: async () => new Response(new ReadableStream({
      start(c) {
        c.enqueue(bytes.slice(0, 40));
        c.enqueue(bytes.slice(40));
        c.close();
      },
    }), { headers: { ETag: '\"v1\"' } }),
  };
  for (const [range, start, end] of [["bytes=35-45", 35, 45], ["bytes=-5", 95, 99]] as const) {
    const r = await serveLessonAudio(request({ Range: range }), withoutLength);
    assert.equal(r.status, 206);
    assert.equal(r.headers.get("Content-Range"), `bytes ${start}-${end}/100`);
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes.slice(start, end + 1));
  }
  const full = await serveLessonAudio(request(), withoutLength);
  assert.equal(full.status, 200);
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), bytes);
  let cancelled = false;
  const oversized = await serveLessonAudio(request({ Range: "bytes=0-1" }), {
    fetch: async () => new Response(new ReadableStream({
      pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { cancelled = true; },
    })),
  });
  assert.equal(oversized.status, 502);
  assert.equal(cancelled, true);
});
