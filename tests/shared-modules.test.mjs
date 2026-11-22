import { test } from "node:test";
import assert from "node:assert/strict";
import { WORKERS, fingerprint } from "../scripts/shared-modules.mjs";

// npm run check:deployed compares these with what the live Workers report, so they must cover the
// modules whose drift breaks the site (LINE keywords, markets, the ranked engine) and stay stable.
test("each Worker's fingerprint covers the public/ modules it shares with the site", async () => {
  const backend = await fingerprint(WORKERS.backend.entry);
  for (const file of ["public/lab/orderflow/notify.js", "public/lab/orderflow/markets.js", "public/arena/engine/ranked.js"])
    assert.ok(backend.files.includes(file), file);
  const orderflow = await fingerprint(WORKERS.orderflow.entry);
  assert.ok(orderflow.files.includes("public/lab/orderflow/markets.js"));
  for (const { files, hash } of [backend, orderflow]) {
    assert.ok(files.every((file) => file.startsWith("public/")), "only shared modules count");
    assert.match(hash, /^[0-9a-f]{16}$/);
  }
  assert.equal((await fingerprint(WORKERS.backend.entry)).hash, backend.hash, "deterministic");
  assert.notEqual(orderflow.hash, backend.hash);
});
