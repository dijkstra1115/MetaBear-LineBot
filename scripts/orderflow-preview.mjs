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
};
createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const url = new URL(req.url, "http://127.0.0.1:8790");
    if (url.pathname === "/" || url.pathname === "/orderflow") {
      res.writeHead(302, { Location: `/orderflow/${url.search}` });
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
    const headers = {
      "Content-Type": types[extname(file)] + "; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' wss://stream.bybit.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
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
