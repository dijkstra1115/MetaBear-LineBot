import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { privateAssets, backendAssets } from "./deployment-layout.mjs";
import { fileURLToPath } from "node:url";
import { unstable_generateASSETSBinding } from "wrangler";
import { Request } from "miniflare";

const pages = new URL("../pages/dist/", import.meta.url);
const backend = new URL("../dist/backend/", import.meta.url);
const files = await readdir(pages);
for (const file of privateAssets) assert.ok(!files.includes(file), `Private asset leaked into Pages: ${file}`);
assert.ok(!files.includes("_worker.js") && !files.includes("functions"), "Website must remain static");
const routes = JSON.parse(await readFile(new URL("_routes.json", pages), "utf8"));
assert.deepEqual(routes.include, ["/orderflow/motion/audio/*"]);
for (const file of backendAssets) assert.ok((await stat(new URL(file, backend))).isFile(), file);
assert.equal((await readdir(backend)).length, backendAssets.length);
assert.ok(files.includes("404.html") && files.includes("_redirects") && files.includes("_headers"));
const headers = await readFile(new URL("_headers", pages), "utf8");
assert.ok(headers.split("\n").filter((line) => line && !line.startsWith(" ")).length <= 100);
assert.ok(headers.split("\n").every((line) => line.length <= 2000));
assert.ok(!/unsafe-inline|unsafe-eval/.test(headers));
console.log("Pages/backend isolation and Pages header limits verified");

// Use Wrangler's actual Pages asset handler without loading a CRM Worker,
// its parent configuration, secrets, scheduled handler, or local database.
const controller = new AbortController();
const serve = await unstable_generateASSETSBinding({
  directory: fileURLToPath(pages), log: console, signal: controller.signal,
});
try {
  for (const path of ["/", "/learn?step=code", "/orderflow/", "/orderflow/wick"]) {
    const response = await serve(new Request("https://metabear.io" + path));
    assert.equal(response.status, 200, path);
    const csp = response.headers.get("Content-Security-Policy");
    assert.ok(csp && !csp.includes(","), `Missing or conflicting CSP: ${path}`);
    assert.ok(csp.includes("cloudflareinsights.com"), path);
    assert.equal(csp.includes("wss://stream.bybit.com"), path === "/orderflow/", path);
  }
  for (const path of ["/admin", "/admin.html", "/desk", "/login", "/api/customers", "/missing-page"]) {
    const response = await serve(new Request("https://metabear-site.pages.dev" + path));
    assert.equal(response.status, 404, path);
  }
  const preview = await serve(new Request("https://branch.metabear-site.pages.dev/"));
  assert.ok(preview.headers.get("X-Robots-Tag").includes("noindex"));
  assert.ok(!preview.headers.get("Content-Security-Policy").includes("cloudflareinsights"));
  const audio = await serve(new Request("https://metabear.io/orderflow/motion/audio/btc-wall.m4a"));
  assert.equal(audio.status, 200);
  assert.ok((await audio.arrayBuffer()).byteLength > 32);
  console.log("Pages routes, production/preview CSP, private 404s, and narration assets verified");
} finally {
  controller.abort();
}
