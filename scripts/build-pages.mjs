import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { privateAssets } from "./deployment-layout.mjs";

await import("./build-site.mjs");
const output = new URL("../pages/dist/", import.meta.url);
await rm(fileURLToPath(output), { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("../public/", import.meta.url), output, { recursive: true });
for (const name of privateAssets) await rm(new URL(name, output), { force: true });
await versionAssets(fileURLToPath(output));

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
  "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-MetaBear-Hosting: pages",
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

// Pages lets browsers keep CSS and JS for four hours while HTML revalidates on every visit, so a
// deploy could pair new pages with old styles and scripts. Stylesheets and scripts get a content
// version (?v=hash) in the export. Module imports are versioned only where every importer is
// rewritten too (the arena and the homepage bundle): the academy loads some modules both from
// HTML and through dynamic imports, and two URLs for one module would load it twice.
async function versionAssets(root) {
  const versions = new Map();
  const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 10);
  const exists = (file) => stat(file).then((info) => info.isFile(), () => false);
  const owned = (file) => /^(arena|js)[\\/]/.test(relative(root, file));
  const replaceAsync = async (text, pattern, replace) => {
    const parts = [];
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      parts.push(text.slice(last, match.index), await replace(...match));
      last = match.index + match[0].length;
    }
    return parts.join("") + text.slice(last);
  };
  async function versionFile(file) {
    if (versions.has(file)) {
      if (versions.get(file) === null) throw Error(`Import cycle through ${relative(root, file)}`);
      return versions.get(file);
    }
    versions.set(file, null);
    let text = await readFile(file, "utf8");
    if (file.endsWith(".js") && owned(file))
      text = await replaceAsync(text, /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"'?]+\.js)\2/g, async (match, lead, quote, spec) => {
        const target = resolve(dirname(file), spec);
        return (await exists(target)) ? `${lead}${quote}${spec}?v=${await versionFile(target)}${quote}` : match;
      });
    await writeFile(file, text);
    const version = hash(text);
    versions.set(file, version);
    return version;
  }
  const pages = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".html")) pages.push(path);
    }
  };
  await walk(root);
  for (const page of pages) {
    const html = await replaceAsync(await readFile(page, "utf8"), /<(link|script)\b[^>]*>/g, async (tag, kind) => {
      const attribute = kind === "link" ? "href" : "src";
      const found = tag.match(new RegExp(`\\s${attribute}="([^"?#]+)"`));
      if (!found || /^[a-z]+:|^\/\//i.test(found[1])) return tag;
      if (kind === "link" && !/rel="stylesheet"/.test(tag)) return tag;
      const target = found[1].startsWith("/") ? join(root, found[1]) : resolve(dirname(page), found[1]);
      const module = /type="module"/.test(tag);
      if (!(await exists(target)) || (module && !owned(target))) return tag;
      return tag.replace(found[0], ` ${attribute}="${found[1]}?v=${await versionFile(target)}"`);
    });
    await writeFile(page, html);
  }
}
