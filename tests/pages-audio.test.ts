import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../pages/functions/orderflow/motion/audio/[file]";

test("Pages narration adapter supports seeking using only its ASSETS binding", async () => {
  const body = Uint8Array.from({ length: 100 }, (_, index) => index);
  const context = {
    request: new Request("https://metabear.io/orderflow/motion/audio/btc-wall.m4a", { headers: { Range: "bytes=10-19" } }),
    env: { ASSETS: { fetch: async () => new Response(body, { headers: { "Content-Length": "100", "Content-Type": "audio/mp4" } }) } },
  } as Parameters<typeof onRequest>[0];
  const response = await onRequest(context);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 10-19/100");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), body.slice(10, 20));
});
