import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BybitFeed } from "./market.js";
import { QuantStore } from "./store.js";
import { createDemo } from "./demo.js";
import { features, equity } from "./engine.js";
import { modelInput } from "./model-input.js";
import { buildHeatmap } from "./liquidity.js";
import { gzipSync } from "node:zlib";
import {
  SYMBOLS,
  type Frame,
  type Decision,
  type Fill,
  type Event,
} from "./types.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.QUANT_PORT ?? 8788);
const host = process.env.QUANT_HOST ?? "127.0.0.1";
const dbPath = resolve(root, process.env.QUANT_DB ?? "quant/.data/live.sqlite");
const store = new QuantStore(dbPath),
  feed = new BybitFeed();
let demo: QuantStore | null = null;
let lastError: string | null = null,
  lastCycle = 0;
const started = Date.now();
const heatmapCache = new Map<
  string,
  { key: string; body: Buffer; plain: Buffer }
>();
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
function publicFrame(f: Frame | null) {
  if (!f) return null;
  return {
    ...f,
    liquidity: undefined,
    bids: f.bids.slice(0, 1000),
    asks: f.asks.slice(0, 1000),
    features: features(f),
  };
}
const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, { error: "唯讀研究介面" });
      return;
    }
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    const source =
      url.searchParams.get("mode") === "demo" ? (demo ??= createDemo()) : store;
    const isDemo = source !== store;
    const symbol =
      SYMBOLS.find((s) => s === url.searchParams.get("symbol")) ?? "BTCUSDT";
    if (url.pathname === "/health") {
      send(res, 200, {
        service: "metabear-quant",
        mode: "paper",
        started,
        lastCycle,
        lastError,
        connections: feed.connections,
      });
      return;
    }
    if (url.pathname === "/api/quant/summary") {
      const state = source.state();
      const latest = source.latest(symbol);
      send(res, 200, {
        mode: isDemo ? "demo" : "live",
        source: isDemo ? "合成示例資料" : "Bybit 公開主網行情",
        execution: "paper",
        model: { status: "not-connected", name: "Jev" },
        time: Date.now(),
        started: isDemo ? null : started,
        lastCycle: isDemo ? latest?.time : lastCycle,
        error: isDemo ? null : lastError,
        connections: isDemo ? null : feed.connections,
        config: source.config,
        state,
        equity: equity(state),
        markets: SYMBOLS.map((s) => {
          const f = source.latest(s);
          return {
            symbol: s,
            price: f?.mark ?? null,
            healthy: f?.healthy ?? false,
            time: f?.time ?? null,
          };
        }),
        frame: publicFrame(latest),
        samples: source.samples(symbol),
        decisions: source.recent<Decision>("decisions", 100),
        fills: source.recent<Fill>("fills", 100),
        events: source.recent<Event>("events", 50),
      });
      return;
    }
    if (url.pathname === "/api/quant/heatmap") {
      const minutes = Number(url.searchParams.get("minutes") ?? 60);
      const range = Number(url.searchParams.get("range") ?? 1) / 100;
      if (
        ![15, 60, 240].includes(minutes) ||
        ![0.005, 0.01, 0.02, 0.05].includes(range)
      ) {
        send(res, 400, {
          error: "minutes 須為 15、60、240；range 須為 0.5、1、2、5",
        });
        return;
      }
      const latest = source.latest(symbol),
        now = isDemo ? (latest?.time ?? Date.now()) : Date.now();
      const interval = Math.max(
        isDemo ? 60000 : 10000,
        (minutes * 60000) / 360,
      );
      const end = (Math.floor(now / interval) + 1) * interval,
        start = end - minutes * 60000;
      const slot = `${isDemo}:${symbol}:${minutes}:${range}`,
        key = `${latest?.id}:${end}`;
      let cached = heatmapCache.get(slot);
      if (!cached || cached.key !== key) {
        const result = {
          ...buildHeatmap(source.heatmapFrames(symbol, start, end, interval), {
            start,
            end,
            interval,
            range,
          }),
          symbol,
          mode: isDemo ? "demo" : "live",
          error: latest?.liquidityError ?? null,
          asOf: latest?.time ?? null,
        };
        const plain = Buffer.from(JSON.stringify(result));
        cached = { key, plain, body: gzipSync(plain) };
        if (heatmapCache.size >= 16 && !heatmapCache.has(slot))
          heatmapCache.delete(heatmapCache.keys().next().value!);
        heatmapCache.set(slot, cached);
      }
      const compressed = /\bgzip\b/.test(req.headers["accept-encoding"] ?? "");
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        Vary: "Accept-Encoding",
        ...(compressed ? { "Content-Encoding": "gzip" } : {}),
        "X-Content-Type-Options": "nosniff",
      });
      res.end(
        req.method === "HEAD"
          ? undefined
          : compressed
            ? cached.body
            : cached.plain,
      );
      return;
    }
    if (url.pathname === "/api/quant/decision") {
      const id = url.searchParams.get("id") ?? "";
      const result = id.length < 200 ? source.detail(id) : null;
      send(res, result ? 200 : 404, result ?? { error: "找不到決策" });
      return;
    }
    if (url.pathname === "/api/quant/jev-input") {
      const f = source.latest(symbol);
      send(
        res,
        f ? 200 : 503,
        f
          ? modelInput(f, source.state(), source.config)
          : { error: "等待第一份行情" },
      );
      return;
    }
    if (url.pathname === "/api/quant/export") {
      const format = url.searchParams.get("kind");
      if (format !== "decisions" && format !== "fills" && format !== "events") {
        send(res, 400, { error: "kind 必須是 decisions、fills 或 events" });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="${isDemo ? "demo" : "paper"}-${format}.jsonl"`,
        "Cache-Control": "no-store",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      // Export all audit records, not just the dashboard's most recent page.
      for (const row of source.db
        .prepare(`SELECT body FROM ${format} ORDER BY time`)
        .iterate()) {
        if (!res.write(String(row.body) + "\n"))
          await new Promise<void>((resolve) => {
            const done = () => {
              res.off("drain", done);
              res.off("close", done);
              resolve();
            };
            res.once("drain", done);
            res.once("close", done);
            if (res.destroyed) done();
          });
        if (res.destroyed) break;
      }
      res.end();
      return;
    }
    const assets: Record<string, [string, string]> = {
      "/": ["quant.html", "text/html"],
      "/lab/jev": ["quant.html", "text/html"],
      "/lab/jev/": ["quant.html", "text/html"],
      "/quant.css": ["quant.css", "text/css"],
      "/quant.js": ["quant.js", "text/javascript"],
      "/quant-heatmap.js": ["quant-heatmap.js", "text/javascript"],
      "/logo.webp": ["logo.webp", "image/webp"],
    };
    const asset = assets[url.pathname];
    if (!asset) {
      send(res, 404, { error: "Not found" });
      return;
    }
    const body = await readFile(resolve(root, "public", asset[0]));
    res.writeHead(200, {
      "Content-Type": `${asset[1]}; charset=utf-8`,
      "Cache-Control": "no-cache",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "request_error");
    if (!res.headersSent) send(res, 500, { error: "研究服務暫時無法完成請求" });
    else res.end();
  }
});
server.listen(port, host, () => {
  console.log(`MetaBear paper research: http://${host}:${port}/lab/jev`);
  console.log(
    "Market data: Bybit public streams. Execution: local simulation only.",
  );
  void feed.start().catch((e) => {
    lastError = e instanceof Error ? e.message : "feed_start_failed";
  });
});
server.on("error", (e) => {
  console.error(e.message);
  feed.stop();
  store.close();
  process.exit(1);
});
let collecting = false;
const timer = setInterval(async () => {
  if (collecting) return;
  collecting = true;
  try {
    await feed.refresh();
    const now = Date.now();
    // Serial portfolio updates in one process, committed atomically per observation.
    for (const symbol of SYMBOLS) store.process(feed.frame(symbol, now));
    lastCycle = now;
    lastError = null;
  } catch (e) {
    lastError = e instanceof Error ? e.message : "frame_failed";
    console.error(lastError);
  } finally {
    collecting = false;
  }
}, 10000);
const shutdown = () => {
  clearInterval(timer);
  feed.stop();
  server.close();
  store.close();
  demo?.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
