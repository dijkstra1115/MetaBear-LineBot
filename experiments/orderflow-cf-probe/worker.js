// Can a Durable Object placed in Asia-Pacific reach Binance, Bybit and OKX
// (REST and WebSocket), and does it stay alive while it holds those streams?
//
//   /edge?secs=15                       one-shot probe from the Worker (colo nearest the caller)
//   /probe?hint=apac-ne&secs=15&run=1   one-shot probe from a Durable Object at that hint
//   /soak/start?hint=apac-ne&minutes=30&keepalive=1&every=30
//   /soak/status?hint=apac-ne&keepalive=1&every=30
//   /soak/start?hint=apac-se&minutes=60&hold=14   one alarm invocation holds the sockets for up to 14 min
//
// keepalive=1 re-arms an alarm every `every` seconds (the plan for the real collector);
// keepalive=0 relies on the open streams alone, to see whether the object is evicted.
// Every route needs ?key=<PROBE_KEY>.
import { DurableObject } from "cloudflare:workers";

const HINTS = ["apac", "apac-ne", "apac-se", "oc", "weur", "enam", "wnam"];

const BUCKET_MS = 10_000;
const bucketOf = (t) => Math.floor(t / BUCKET_MS) * BUCKET_MS;
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const REST = () => [
  ["binance", "depth", "https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=5"],
  ["binance", "openInterest", "https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT"],
  ["binance", "aggTrades", "https://fapi.binance.com/fapi/v1/aggTrades?symbol=BTCUSDT&limit=1"],
  ["binance", "globalLongShort", "https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=1"],
  ["binance", "archive", `https://data.binance.vision/data/futures/um/daily/metrics/BTCUSDT/BTCUSDT-metrics-${daysAgo(2)}.zip`, "HEAD"],
  ["bybit", "tickers", "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT"],
  ["bybit", "openInterest", "https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=5min&limit=1"],
  ["okx", "openInterest", "https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP"],
  ["okx", "trades", "https://www.okx.com/api/v5/market/trades?instId=BTC-USDT-SWAP&limit=1"],
];

const OKX_SUB = { op: "subscribe", args: [{ channel: "trades", instId: "BTC-USDT-SWAP" }, { channel: "liquidation-orders", instType: "SWAP" }] };
const STREAMS = {
  "binance-aggTrade": { url: "https://fstream.binance.com/market/stream?streams=btcusdt@aggTrade" },
  "binance-depth": { url: "https://fstream.binance.com/public/stream?streams=btcusdt@depth@100ms" },
  "binance-forceOrder": { url: "https://fstream.binance.com/market/stream?streams=btcusdt@forceOrder" },
  bybit: {
    url: "https://stream.bybit.com/v5/public/linear",
    subscribe: { op: "subscribe", args: ["publicTrade.BTCUSDT", "allLiquidation.BTCUSDT"] },
    ping: JSON.stringify({ op: "ping" }),
  },
  "okx-8443": { url: "https://ws.okx.com:8443/ws/v5/public", subscribe: OKX_SUB, ping: "ping" },
  "okx-443": { url: "https://ws.okx.com/ws/v5/public", subscribe: OKX_SUB, ping: "ping" },
};
// Binance answers 403 to every Cloudflare egress, so the soak holds the feeds that work.
const SOAK_STREAMS = ["bybit", "okx-8443"];
const GAP_FEED = "okx-8443"; // BTC-USDT-SWAP trades arrive several times a second

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function trace() {
  const text = await (await fetch("https://www.cloudflare.com/cdn-cgi/trace")).text();
  const kv = Object.fromEntries(text.trim().split("\n").map((line) => line.split("=")));
  return { colo: kv.colo, loc: kv.loc, ip: kv.ip };
}

async function restProbe([ex, name, url, method = "GET"]) {
  const started = Date.now();
  try {
    const res = await fetch(url, { method, signal: AbortSignal.timeout(10_000) });
    const body = method === "HEAD" ? "" : await res.text();
    return { ex, name, status: res.status, ms: Date.now() - started, sample: body.slice(0, 160) };
  } catch (err) {
    return { ex, name, error: String(err), ms: Date.now() - started };
  }
}

async function openStream(spec) {
  const started = Date.now();
  // No AbortSignal here: it stays attached to the upgraded socket and would cut it when it fires.
  let timer;
  const timeout = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error("connect timeout")), 10_000)));
  const res = await Promise.race([fetch(spec.url, { headers: { Upgrade: "websocket" } }), timeout]).finally(() => clearTimeout(timer));
  const ws = res.webSocket;
  const connectMs = Date.now() - started;
  if (!ws) return { ws: null, status: res.status, connectMs, body: (await res.text()).slice(0, 200) };
  ws.accept();
  if (spec.subscribe) ws.send(JSON.stringify(spec.subscribe));
  return { ws, status: res.status, connectMs };
}

const dataText = (data) => (typeof data === "string" ? data : new TextDecoder().decode(data));

async function streamProbe(name, spec, secs) {
  const out = { name, msgs: 0, bytes: 0 };
  let opened;
  try {
    opened = await openStream(spec);
  } catch (err) {
    return { ...out, error: String(err) };
  }
  Object.assign(out, { status: opened.status, connectMs: opened.connectMs });
  if (!opened.ws) return { ...out, body: opened.body };
  const ws = opened.ws;
  const samples = [];
  ws.addEventListener("message", (e) => {
    const text = dataText(e.data);
    out.msgs++;
    out.bytes += text.length;
    if (samples.length < 2 && text !== "pong") samples.push(text.slice(0, 160));
  });
  ws.addEventListener("close", (e) => (out.closed = { code: e.code, reason: e.reason }));
  const ping = spec.ping ? setInterval(() => ws.send(spec.ping), 15_000) : null;
  await sleep(secs * 1000);
  clearInterval(ping);
  if (!out.closed) ws.close(1000, "probe done");
  return { ...out, perSec: Math.round((out.msgs / secs) * 10) / 10, samples };
}

async function probe(secs) {
  const [where, rest, streams] = await Promise.all([
    trace(),
    Promise.all(REST().map(restProbe)),
    Promise.all(Object.entries(STREAMS).map(([name, spec]) => streamProbe(name, spec, secs))),
  ]);
  return { where, secs, rest, streams };
}

export class Probe extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS boots (t INTEGER);
      CREATE TABLE IF NOT EXISTS events (t INTEGER, feed TEXT, kind TEXT, detail TEXT);
      CREATE TABLE IF NOT EXISTS buckets (t INTEGER, feed TEXT, msgs INTEGER, bytes INTEGER, parse_errors INTEGER);
    `);
    this.sql.exec("INSERT INTO boots VALUES (?)", Date.now());
    this.streams = new Map(); // feed → { ws, ping, lastMessage }
    this.counts = new Map(); // feed → [msgs, bytes, parseErrors] for this.bucket
    this.bucket = bucketOf(Date.now());
  }

  log(feed, kind, detail = "") {
    this.sql.exec("INSERT INTO events VALUES (?, ?, ?, ?)", Date.now(), feed, kind, String(detail).slice(0, 300));
  }

  flush(force = false) {
    const bucket = bucketOf(Date.now());
    if (bucket === this.bucket && !force) return;
    for (const [feed, [msgs, bytes, errors]] of this.counts) this.sql.exec("INSERT INTO buckets VALUES (?, ?, ?, ?, ?)", this.bucket, feed, msgs, bytes, errors);
    this.counts.clear();
    this.bucket = bucket;
  }

  async config() {
    return (await this.ctx.storage.get("soak")) ?? null;
  }

  async connect(feed) {
    const spec = STREAMS[feed];
    let opened;
    try {
      opened = await openStream(spec);
    } catch (err) {
      this.log(feed, "connect-error", err);
      return;
    }
    if (!opened.ws) {
      this.log(feed, "rejected", `${opened.status} ${opened.body}`);
      return;
    }
    const ws = opened.ws;
    const entry = { ws, ping: null, lastMessage: Date.now() };
    this.streams.set(feed, entry);
    this.log(feed, "open", `${opened.connectMs} ms`);
    ws.addEventListener("message", (e) => {
      // A socket handed over by an earlier invocation keeps talking briefly; count only the current one.
      if (this.streams.get(feed) !== entry) return;
      this.flush();
      entry.lastMessage = Date.now();
      const text = dataText(e.data);
      const c = this.counts.get(feed) ?? [0, 0, 0];
      c[0]++;
      c[1] += text.length;
      // Parse every message so CPU use resembles the real collector.
      if (text !== "pong")
        try {
          JSON.parse(text);
        } catch {
          c[2]++;
        }
      this.counts.set(feed, c);
    });
    const dropped = (kind, detail) => {
      if (this.streams.get(feed) !== entry) return;
      clearInterval(entry.ping);
      this.streams.delete(feed);
      this.log(feed, kind, detail);
    };
    ws.addEventListener("close", (e) => dropped("close", `${e.code} ${e.reason}`));
    ws.addEventListener("error", (e) => dropped("error", e.message ?? ""));
    if (spec.ping) entry.ping = setInterval(() => ws.send(spec.ping), 20_000);
  }

  async ensureStreams() {
    for (const feed of SOAK_STREAMS) {
      const entry = this.streams.get(feed);
      if (entry && Date.now() - entry.lastMessage > 45_000) {
        this.log(feed, "silent");
        clearInterval(entry.ping);
        this.streams.delete(feed);
        try {
          entry.ws.close(1000, "silent");
        } catch {}
      }
      if (!this.streams.has(feed)) await this.connect(feed);
    }
  }

  stopStreams(reason) {
    for (const [feed, entry] of this.streams) {
      clearInterval(entry.ping);
      try {
        entry.ws.close(1000, reason);
      } catch {}
      this.log(feed, "stopped", reason);
    }
    this.streams.clear();
    this.flush(true);
  }

  async alarm() {
    const soak = await this.config();
    if (!soak) return;
    if (Date.now() >= soak.endAt) {
      this.stopStreams("soak finished");
      this.log("-", "end");
      return;
    }
    if (soak.hold) return this.hold(soak);
    this.flush();
    await this.ensureStreams();
    await this.ctx.storage.setAlarm(soak.keepalive ? Date.now() + soak.every * 1000 : soak.endAt);
  }

  // Outbound sockets die about 10 s after the invocation that opened them ends, so
  // keep one alarm invocation running (alarms may run 15 min of wall time) and hand
  // over to the next: fresh sockets open while the previous ones are still alive.
  async hold(soak) {
    const until = Math.min(soak.endAt, Date.now() + soak.hold * 60_000);
    this.log("-", "hold", new Date(until).toISOString());
    this.streams.clear();
    while (Date.now() < until) {
      await this.ensureStreams();
      this.flush();
      await sleep(Math.min(5_000, Math.max(0, until - Date.now())));
    }
    this.flush(true);
    await this.ctx.storage.setAlarm(Date.now());
  }

  async status() {
    const soak = await this.config();
    const rows = (q, ...args) => [...this.sql.exec(q, ...args)];
    const iso = (t) => new Date(t).toISOString();
    // Coverage: share of 10-second buckets since the start in which the feed delivered anything.
    const from = soak ? bucketOf(soak.startedAt) + BUCKET_MS : 0;
    const to = soak ? bucketOf(Math.min(Date.now(), soak.endAt)) : 0;
    const expected = Math.max(1, (to - from) / BUCKET_MS);
    const perFeed = rows("SELECT feed, COUNT(*) AS buckets, SUM(msgs) AS msgs, SUM(bytes) AS bytes, SUM(parse_errors) AS parse_errors FROM buckets WHERE t >= ? AND t < ? GROUP BY feed", from, to).map((r) => ({
      ...r,
      coverage: Math.round((r.buckets / expected) * 1000) / 10,
      perSec: Math.round((r.msgs / (expected * BUCKET_MS / 1000)) * 10) / 10,
    }));
    // Gaps: runs of empty buckets for a feed that never goes quiet.
    const seen = new Set(rows("SELECT t FROM buckets WHERE feed = ? AND msgs > 0", GAP_FEED).map((r) => r.t));
    const gaps = [];
    for (let t = from; t < to; t += BUCKET_MS) {
      if (seen.has(t)) continue;
      const last = gaps.at(-1);
      if (last && last.to === t) last.to = t + BUCKET_MS;
      else gaps.push({ from: t, to: t + BUCKET_MS });
    }
    return {
      soak: soak && { ...soak, startedAt: iso(soak.startedAt), endAt: iso(soak.endAt) },
      now: iso(Date.now()),
      boots: rows("SELECT t FROM boots ORDER BY t").map((r) => iso(r.t)),
      perFeed,
      gaps: gaps.map((g) => `${iso(g.from).slice(11, 19)}–${iso(g.to).slice(11, 19)}`),
      events: rows("SELECT t, feed, kind, detail FROM events WHERE kind != 'open' ORDER BY t DESC LIMIT 60").map((r) => [iso(r.t).slice(11, 19), r.feed, r.kind, r.detail]),
      opens: rows("SELECT feed, COUNT(*) AS n FROM events WHERE kind = 'open' GROUP BY feed"),
      open: [...this.streams.keys()],
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const secs = Math.min(60, Math.max(3, Number(url.searchParams.get("secs")) || 15));
    if (url.pathname === "/probe") return json(await probe(secs));
    if (url.pathname === "/soak/start") {
      const minutes = Math.min(180, Math.max(1, Number(url.searchParams.get("minutes")) || 30));
      const keepalive = url.searchParams.get("keepalive") !== "0";
      const every = Math.min(300, Math.max(2, Number(url.searchParams.get("every")) || 30));
      const hold = Math.min(14, Math.max(0, Number(url.searchParams.get("hold")) || 0));
      const soak = { startedAt: Date.now(), endAt: Date.now() + minutes * 60_000, keepalive, every, hold, where: await trace() };
      await this.ctx.storage.put("soak", soak);
      this.log("-", "start", JSON.stringify(soak));
      if (hold) {
        await this.ctx.storage.setAlarm(Date.now());
        return json({ soak });
      }
      await this.ensureStreams();
      await this.ctx.storage.setAlarm(keepalive ? Date.now() + every * 1000 : soak.endAt);
      return json({ soak, open: [...this.streams.keys()] });
    }
    if (url.pathname === "/soak/status") return json(await this.status());
    return json({ error: "not found" }, 404);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.PROBE_KEY || url.searchParams.get("key") !== env.PROBE_KEY) return json({ error: "forbidden" }, 403);
    const secs = Math.min(60, Math.max(3, Number(url.searchParams.get("secs")) || 15));
    if (url.pathname === "/edge") return json(await probe(secs));
    if (url.pathname !== "/probe" && !url.pathname.startsWith("/soak/")) return json({ error: "not found" }, 404);
    const hint = url.searchParams.get("hint") || "apac-ne";
    if (!HINTS.includes(hint)) return json({ error: `hint must be one of ${HINTS.join(", ")}` }, 400);
    const mode =
      url.pathname === "/probe"
        ? "probe"
        : url.searchParams.get("hold")
          ? `soak-hold${url.searchParams.get("hold")}`
          : url.searchParams.get("keepalive") === "0"
            ? "soak-bare"
            : `soak-alarm${url.searchParams.get("every") || 30}`;
    // The hint only applies the first time an object is created, so a new run name gives a fresh placement.
    const name = `${mode}:${hint}:${url.searchParams.get("run") || "1"}`;
    return env.PROBE.get(env.PROBE.idFromName(name), { locationHint: hint }).fetch(request);
  },
};
