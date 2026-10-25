// Order-flow data API (Worker metabear-orderflow, config wrangler.orderflow.jsonc), served at
// metabear.io/api/orderflow/*, apart from the CRM backend:
//
//   GET  /api/orderflow/btcusdt/day?d=YYYY-MM-DD   one UTC day: bars, heatmap, OI, liquidations
//   GET  /api/orderflow/btcusdt/recent?since=ms    everything since a minute in the last 2 days
//   GET  /api/orderflow/btcusdt/book?from=ms       fine order-book columns, one 30-minute chunk
//   GET  /api/orderflow/btcusdt/status             collector health
//   GET  /api/orderflow/btcusdt/events?since=ms    market events at a key level since a minute in the last 30 days
//   POST /api/orderflow/btcusdt/import             archive footprint rows (Bearer ORDERFLOW_ADMIN_TOKEN)
//   POST /api/orderflow/btcusdt/archive            try the pending daily archive import now (same token)
//   GET  /api/orderflow/btcusdt/alerts             alert thresholds and the latest alerts (same token)
//   POST /api/orderflow/btcusdt/alerts             { config } tunes thresholds, { test: true } sends a test
//   GET  /api/orderflow/relay                      WebSocket from the Binance relay (Bearer ORDERFLOW_RELAY_TOKEN)
//
// Every btcusdt path takes ?ex=binance, okx or bingx for that exchange's collector and ?ex=all for
// 全市場, the exchanges merged (src/orderflow/aggregate.ts); without it, Bybit's answers.
// Every viewer polls the same minute-aligned URLs, so the edge cache absorbs repeat requests
// and the single collector object only answers each URL once per few seconds.
import { BOOK_CHUNK_MS } from "../../public/lab/orderflow/bybit.js";
import { describe } from "../../public/lab/orderflow/watch.js";
import { EXCHANGES, mergeParts, type Exchange, type Part } from "./aggregate";
import { BinanceCollector } from "./binance-collector";
import { BingxCollector } from "./bingx-collector";
import { Collector, type OrderflowEnv } from "./collector";
import { OkxCollector } from "./okx-collector";

export { BinanceCollector, BingxCollector, Collector, OkxCollector };

const PREFIX = "/api/orderflow/btcusdt";
const MINUTE = 60_000;
const DAY = 86_400_000;
const HISTORY_DAYS = 30; // matches the collector's KEEP_MS

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });

function collector(env: OrderflowEnv) {
  // Asia-Pacific: Bybit blocks US data centers (docs/ORDERFLOW-CF-PROBE.md).
  return env.COLLECTOR.get(env.COLLECTOR.idFromName("BTCUSDT"), { locationHint: "apac-se" });
}

function binanceCollector(env: OrderflowEnv) {
  // Near the relay in Tokyo.
  return env.BINANCE?.get(env.BINANCE.idFromName("BTCUSDT"), { locationHint: "apac" }) ?? null;
}

function stubFor(env: OrderflowEnv, ex: string) {
  if (ex === "bybit") return collector(env);
  if (ex === "binance") return binanceCollector(env);
  const ns = ex === "okx" ? env.OKX : ex === "bingx" ? env.BINGX : undefined;
  return ns?.get(ns.idFromName("BTCUSDT"), { locationHint: "apac" }) ?? null;
}

// 全市場: every exchange's answer for the same collector path, merged. An exchange that does not
// answer is left out rather than failing the whole response.
async function mergedAnswer(env: OrderflowEnv, path: string, from: number, extra: Record<string, unknown>) {
  const answers = await Promise.all(
    EXCHANGES.map(async (ex): Promise<[Exchange, (Part & { status?: { lastTrade?: number } }) | null]> => {
      const stub = stubFor(env, ex);
      if (!stub) return [ex, null];
      try {
        const res = await stub.fetch(`https://collector${path}`);
        return [ex, res.ok ? await res.json() : null];
      } catch {
        return [ex, null];
      }
    }),
  );
  const parts = Object.fromEntries(answers.filter(([, part]) => part)) as Partial<Record<Exchange, Part>>;
  const lastTrades = Object.fromEntries(answers.map(([ex, part]) => [ex, Number(part?.status?.lastTrade) || null]));
  const lastTrade = Math.max(0, ...Object.values(lastTrades).map(Number));
  return new Response(JSON.stringify({ symbol: "BTCUSDT", tick: 10, source: "all", ...extra, status: { lastTrade: lastTrade || null, exchanges: lastTrades }, ...mergeParts(parts, from) }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function cached(request: Request, ctx: ExecutionContext, maxAge: number, load: () => Promise<Response>) {
  const cache = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default;
  const key = new Request(request.url, { method: "GET" });
  const hit = await cache?.match(key);
  if (hit) return hit;
  const res = await load();
  const out = new Response(res.body, res);
  out.headers.set("cache-control", `public, max-age=${maxAge}`);
  out.headers.set("x-content-type-options", "nosniff");
  if (res.ok && cache) ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

export async function handleOrderflow(request: Request, env: OrderflowEnv, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/orderflow/relay") {
    const token = env.ORDERFLOW_RELAY_TOKEN;
    const auth = request.headers.get("authorization") ?? "";
    if (!token || !timingSafeEqual(auth, `Bearer ${token}`)) return json({ error: "未授權" }, 401);
    const binance = binanceCollector(env);
    if (!binance) return json({ error: "找不到這個路徑" }, 404);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "需要 WebSocket" }, 426);
    return binance.fetch("https://collector/relay", { headers: { upgrade: "websocket" } });
  }
  if (!url.pathname.startsWith(`${PREFIX}/`)) return json({ error: "找不到這個路徑" }, 404);
  const route = url.pathname.slice(PREFIX.length);
  const now = Date.now();
  const ex = url.searchParams.get("ex") ?? "bybit";
  const all = ex === "all";
  // 全市場 draws Binance's heatmap and events; only the bars, prints and readings are merged.
  const stub = stubFor(env, all ? "binance" : ex);
  if (!stub) return json({ error: "沒有這個交易所" }, 404);
  if (all && !["/day", "/recent", "/book", "/events", "/status"].includes(route)) return json({ error: "全市場只能讀取" }, 400);

  if (route === "/import" || route === "/archive" || route === "/alerts") {
    if (request.method !== "POST" && route !== "/alerts") return json({ error: "只接受 POST" }, 405);
    const token = env.ORDERFLOW_ADMIN_TOKEN;
    const auth = request.headers.get("authorization") ?? "";
    if (!token || !timingSafeEqual(auth, `Bearer ${token}`)) return json({ error: "未授權" }, 401);
    if (route === "/archive") return json(await (await stub.fetch("https://collector/archive", { method: "POST" })).json());
    if (route === "/alerts") {
      if (!["GET", "POST"].includes(request.method)) return json({ error: "只接受 GET 或 POST" }, 405);
      const body = request.method === "POST" ? await request.text() : undefined;
      if (body && body.length > 4_000) return json({ error: "內容太長" }, 413);
      return json(await (await stub.fetch("https://collector/alerts", { method: request.method, body, headers: { "content-type": "application/json" } })).json());
    }
    return stub.fetch("https://collector/import", { method: "POST", body: request.body, headers: { "content-type": "application/json" } });
  }
  if (request.method !== "GET") return json({ error: "只接受 GET" }, 405);

  if (route === "/status") {
    if (!all) return json(await (await stub.fetch("https://collector/status")).json());
    const list = await Promise.all(EXCHANGES.map(async (name) => [name, await stubFor(env, name)?.fetch("https://collector/status").then((r) => r.json(), () => null)] as const));
    return json(Object.fromEntries(list.map(([name, st]) => [name, st && { lastTrade: (st as { lastTrade?: unknown }).lastTrade, errors: ((st as { errors?: unknown[] }).errors ?? []).length }])));
  }

  if (route === "/day") {
    const d = url.searchParams.get("d") ?? "";
    const from = /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(`${d}T00:00:00Z`) : NaN;
    if (!Number.isFinite(from) || from > now || from < now - HISTORY_DAYS * DAY) return json({ error: "日期格式錯誤或超出範圍" }, 400);
    // A finished day only changes when an archive import lands; today keeps growing.
    const done = from + DAY <= now - 10 * MINUTE;
    return cached(request, ctx, done ? 600 : 5, () => (all ? mergedAnswer(env, `/day?d=${d}`, from, { day: d, updated: now }) : stub.fetch(`https://collector/day?d=${d}`)));
  }

  if (route === "/book") {
    // Fine order-book columns (10 s, $1) in 30-minute chunks, so every viewer shares cache entries.
    const from = Number(url.searchParams.get("from"));
    if (!Number.isInteger(from) || from % BOOK_CHUNK_MS !== 0 || from > now || from < now - HISTORY_DAYS * DAY) return json({ error: "from 需為 30 天內、對齊 30 分鐘的毫秒時間" }, 400);
    const done = from + BOOK_CHUNK_MS <= now - MINUTE;
    return cached(request, ctx, done ? 3600 : 10, () => stub.fetch(`https://collector/book?from=${from}`));
  }

  if (route === "/recent") {
    const since = Number(url.searchParams.get("since"));
    if (!Number.isInteger(since) || since % MINUTE !== 0 || since < now - 2 * DAY || since > now) return json({ error: "since 需為最近兩天內的整分鐘毫秒時間" }, 400);
    return cached(request, ctx, 3, () => (all ? mergedAnswer(env, `/recent?since=${since}`, since, { since, updated: now }) : stub.fetch(`https://collector/recent?since=${since}`)));
  }

  if (route === "/events") {
    // The lab asks from the hour its data starts, so viewers share cache entries.
    const since = Number(url.searchParams.get("since"));
    if (!Number.isInteger(since) || since % MINUTE !== 0 || since < now - HISTORY_DAYS * DAY || since > now) return json({ error: "since 需為 30 天內的整分鐘毫秒時間" }, 400);
    return cached(request, ctx, 10, () => stub.fetch(`https://collector/events?since=${since}`));
  }

  return json({ error: "找不到這個路徑" }, 404);
}

export default {
  fetch: handleOrderflow,
  // The collector re-arms its own alarm; the cron only restarts the chain if it ever breaks. It
  // also covers the one failure the collector cannot report itself: not answering at all.
  async scheduled(event: ScheduledController, env: OrderflowEnv) {
    // The other exchanges' objects only need their alarm chains kept; they report their own outages.
    for (const ex of ["binance", "okx", "bingx"]) {
      const stub = stubFor(env, ex);
      if (stub) await stub.fetch("https://collector/wake").catch((err) => console.error(JSON.stringify({ event: "orderflow_collector_unreachable", ex, detail: String(err) })));
    }
    try {
      const res = await Promise.race([
        collector(env).fetch("https://collector/wake"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("20 秒沒有回應")), 20_000)),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error(JSON.stringify({ event: "orderflow_collector_unreachable", detail: String(err) }));
      // Every 30 minutes while it lasts (the cron runs every 5).
      if (Math.floor(event.scheduledTime / 300_000) % 6 !== 0) return;
      if (env.ORDERFLOW_ALERTS !== "live" || !env.BACKEND || !env.ORDERFLOW_ALERT_TOKEN) return;
      const text = `MetaBear 訂單流通知\n${describe({ kind: "health_unreachable", t: Date.now(), reason: err instanceof Error ? err.message : String(err) })}`;
      await env.BACKEND.fetch("https://backend/api/internal/orderflow-alert", {
        method: "POST",
        headers: { authorization: `Bearer ${env.ORDERFLOW_ALERT_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ text, key: `orderflow-down-${Math.floor(event.scheduledTime / 300_000)}` }),
      }).catch(() => {});
    }
  },
} satisfies ExportedHandler<OrderflowEnv>;
