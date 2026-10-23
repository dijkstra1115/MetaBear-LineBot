import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".m4a": "audio/mp4",
  ".txt": "text/plain",
  ".json": "application/json",
};
// `--api https://metabear.io` reads the live order-flow API instead of a local Worker, for checking
// the page against real data; only reads are forwarded there.
const apiArg = process.argv.indexOf("--api");
const UPSTREAM = apiArg > 0 ? process.argv[apiArg + 1].replace(/\/$/, "") : "http://127.0.0.1:8792";
const REMOTE = !UPSTREAM.startsWith("http://127.0.0.1");
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:8790");
    // The order-flow API is its own Worker; forward to `npm run orderflow:dev` (GET and the admin POSTs).
    if (url.pathname.startsWith("/api/orderflow/")) {
      if (REMOTE && !["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "read-only against a remote API" }));
        return;
      }
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
          method: req.method,
          headers: { authorization: req.headers.authorization ?? "", "content-type": req.headers["content-type"] ?? "application/json" },
          body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
        });
        res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" });
        res.end(Buffer.from(await upstream.arrayBuffer()));
      } catch {
        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "order-flow Worker not running (npm run orderflow:dev)" }));
      }
      return;
    }
    if (url.pathname === "/" || url.pathname === "/orderflow") {
      res.writeHead(302, { Location: `/orderflow/${url.search}` });
      res.end();
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(
      root,
      "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
    );
    if (!file.startsWith(root + sep) || !types[extname(file)]) {
      res.writeHead(404);
      res.end();
      return;
    }
    const body = await readFile(file);
    // The order-flow lab streams straight from the exchanges (same list as scripts/build-pages.mjs).
    const lab = url.pathname.startsWith("/lab/") ? " wss://ws.okx.com:8443 wss://fstream.binance.com" : "";
    const headers = {
      "Content-Type": types[extname(file)] + "; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
      "Content-Security-Policy":
        `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' wss://stream.bybit.com${lab}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    };
    // Byte ranges make lesson audio seekable, as it is in production;
    // without them the player cannot move the soundtrack to the playhead.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range) {
      const size = body.length;
      let start = range[1] === "" ? size - Number(range[2]) : Number(range[1]);
      let end = range[1] === "" || range[2] === "" ? size - 1 : Number(range[2]);
      start = Math.max(0, start);
      end = Math.min(end, size - 1);
      if (start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
      res.end(req.method === "HEAD" ? undefined : body.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { ...headers, "Content-Length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(8790, "127.0.0.1", () =>
  console.log("Orderflow Academy: http://127.0.0.1:8790/orderflow/"),
);
