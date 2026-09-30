import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { privateAssets } from "./deployment-layout.mjs";

await import("./build-site.mjs");
const output = new URL("../pages/dist/", import.meta.url);
await rm(fileURLToPath(output), { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("../public/", import.meta.url), output, { recursive: true });
for (const name of privateAssets) await rm(new URL(name, output), { force: true });

// Prevent Pages' default SPA fallback from returning the homepage for missing
// API/private paths on pages.dev, where production Worker routes do not exist.
await writeFile(new URL("404.html", output), '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>找不到頁面 · MetaBear</title><h1>找不到頁面</h1><a href="/">回首頁</a></html>\n');
await writeFile(new URL("_redirects", output), [
  "/learn /guide 200",
  "/learn/ /guide 200",
  "",
].join("\n"));
await writeFile(new URL("_routes.json", output), JSON.stringify({
  version: 1, include: ["/orderflow/motion/audio/*"], exclude: [],
}, null, 2) + "\n");

// Only narration needs a Pages Function. Keep production analytics and the
// academy's WebSocket permission scoped to their existing document paths.
const common = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const analytics = common.replace("script-src 'self'", "script-src 'self' https://static.cloudflareinsights.com/beacon.min.js/").replace("connect-src 'self'", "connect-src 'self' https://cloudflareinsights.com");
const academy = analytics.replace("connect-src 'self'", "connect-src 'self' wss://stream.bybit.com");
const rules = [
  "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer",
];
const documents = ["/", "/index.html", "/learn", "/learn/", "/guide", "/guide.html", "/orderflow/", "/orderflow/index.html"];
for (const entry of await readdir(new URL("orderflow/", output))) {
  if (entry.endsWith(".html") && entry !== "index.html")
    documents.push("/orderflow/" + entry, "/orderflow/" + entry.slice(0, -5));
}
for (const path of documents) {
  const csp = ["/orderflow/", "/orderflow/index.html"].includes(path) ? academy : analytics;
  rules.push(`https://metabear.io${path}\n  Content-Security-Policy: ${csp}`);
}
for (const host of ["metabear-site.pages.dev", ":branch.metabear-site.pages.dev"])
  rules.push(`https://${host}/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Content-Security-Policy: ${common}`);
await writeFile(new URL("_headers", output), rules.join("\n\n") + "\n");
console.log("Pages: public site → pages/dist (only narration uses a Function; no CRM/secrets)");
