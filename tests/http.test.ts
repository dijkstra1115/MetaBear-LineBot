import { test } from "node:test";
import assert from "node:assert/strict";
import { sameSecret } from "../src/http";

test("secrets are compared by digest, so a different length is just a mismatch", async () => {
  assert.equal(await sameSecret("Bearer abc", "Bearer abc"), true);
  assert.equal(await sameSecret("Bearer abd", "Bearer abc"), false);
  assert.equal(await sameSecret("Bearer ab", "Bearer abc"), false);
  assert.equal(await sameSecret("", "Bearer abc"), false);
});
