import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const legacy = new URL("legacy/flow-arena-v7/", root);

test("legacy FLOW ARENA retains its original bytes outside the public site", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", legacy), "utf8"));
  assert.equal(manifest.sourceCommit, "5b968b6278d3e71d2a675b708f0c71354bf92228");
  assert.equal(manifest.files.length, 31);
  for (const file of manifest.files) {
    const destination = new URL(file.snapshot, legacy);
    assert.ok(destination.href.startsWith(legacy.href));
    const bytes = readFileSync(destination);
    assert.equal(bytes.length, file.size, file.source);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.source);
  }
  for (const path of ["public/orderflow/challenge.js", "public/orderflow/flow-arena-engine.js", "src/arena.ts", "src/arena-room.js"]) {
    assert.equal(existsSync(new URL(path, root)), false, `Legacy implementation is active: ${path}`);
  }
  assert.ok(existsSync(new URL("public/arena/engine/market.js", root)));
});
