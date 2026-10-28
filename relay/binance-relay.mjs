// Exchange relay for the order-flow platform, on the Tokyo VPS (docs/ORDERFLOW-BINANCE-RELAY.md,
// docs/ORDERFLOW-RELAY-HIBERNATION.md). It holds every exchange's public streams — Binance, which
// refuses Cloudflare, and Bybit, OKX and BingX, so their collectors need no outbound socket of their
// own — and passes the messages, untouched, to the exchange's collector Durable Object of each market
// (BTC, ETH; markets.js) over one outbound WebSocket per exchange and market. To a collector that
// asks for it ({"hello":{"frames":1}}), messages go down once a second in one frame, so it is idle
// between frames and is not billed for it; one on older code still gets them one by one.
//
// Exchange keep-alives (pings, BingX's "Ping") are answered here and BingX's gzip is undone here;
// parsing, books, footprints and detectors stay in the collectors. A collector may send
// {"upstream": msg} (OKX resubscribes a broken book) and {"resync": 1} (its book is empty: the
// exchange's streams are reopened for a fresh snapshot). Binance's collector also asks for REST
// paths, which are answered for a whitelist. The relay keeps no state: whatever it drops while either
// side is down, the collectors fetch again or resync.
//
//   ORDERFLOW_RELAY_TOKEN=… node relay/binance-relay.mjs
//   RELAY_TARGET=ws://127.0.0.1:8792/api/orderflow/relay   (local `npm run orderflow:dev`)
//   RELAY_EXCHANGES=binance,bybit                           (default: all four)
//
// Node 22 or newer (built-in WebSocket and fetch); no packages.
import { gunzipSync } from "node:zlib";
import { BINANCE_REST, RELAY_PATHS, binanceStreams } from "../public/lab/orderflow/binance.js";
import { BINGX_WS, bingxTopics } from "../public/lab/orderflow/bingx.js";
import { PING, WS_URL, bybitTopics } from "../public/lab/orderflow/bybit.js";
import { liqFeeds } from "../public/lab/orderflow/liquidations.js";
import { MARKETS } from "../public/lab/orderflow/markets.js";
import { OKX_CHANNELS, OKX_WS } from "../public/lab/orderflow/okx.js";

const TARGET = process.env.RELAY_TARGET ?? "wss://metabear.io/api/orderflow/relay";
const TOKEN = process.env.ORDERFLOW_RELAY_TOKEN;
const EXCHANGES = (process.env.RELAY_EXCHANGES ?? "binance,bybit,okx,bingx").split(",");
const HEARTBEAT_MS = 20_000;
const SILENT_MS = 30_000; // every feed carries trades or book updates many times a minute
const PING_MS = 20_000;
const MAX_BACKOFF_MS = 30_000;
const MAX_BUFFERED = 4 * 1024 * 1024; // drop instead of queueing behind a stalled Cloudflare link
const REST_TIMEOUT_MS = 10_000;
const FRAME_MS = 1_000; // one exchange's messages for one market are sent down together this often
const RESYNC_MS = 10_000; // reopen an exchange's streams at most this often

if (!TOKEN) {
  console.error("ORDERFLOW_RELAY_TOKEN is not set");
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

// Each exchange's sockets for one market: where to connect, what to subscribe to and how to keep
// the socket alive. Bybit's collector also carries OKX's liquidations, as it did when it connected
// itself (Collector in src/orderflow/collector.ts).
const UPSTREAMS = {
  binance: (m) => Object.entries(binanceStreams(m)).map(([name, url]) => ({ name, url })),
  bybit: (m) => {
    const t = bybitTopics(m.symbol);
    const okxLiq = liqFeeds(m).find((f) => f.ex === "okx");
    return [
      { name: "bybit", url: WS_URL, subscribe: [{ op: "subscribe", args: [t.trade, t.book, t.ticker, t.liq] }], ping: PING },
      { name: "okx-liq", url: okxLiq.url, subscribe: [okxLiq.subscribe], ping: okxLiq.ping },
    ];
  },
  okx: (m) => {
    const liq = liqFeeds(m).find((f) => f.ex === "okx").subscribe.args;
    return [{ name: "okx", url: OKX_WS, subscribe: [{ op: "subscribe", args: [...OKX_CHANNELS.map((channel) => ({ channel, instId: m.okxInst })), ...liq] }], ping: "ping" }];
  },
  bingx: (m) => [{ name: "bingx", url: BINGX_WS, subscribe: bingxTopics(m.bingx).map((dataType) => ({ id: dataType, reqType: "sub", dataType })), gzip: true }],
};

// Keeps a socket open, reconnecting with backoff; with `silentMs`, a socket quiet that long is
// replaced. Returns a handle whose restart() reopens the socket now.
function keep(name, open, onMessage, { silentMs = null, onOpen = null } = {}) {
  let backoff = 1_000;
  let last = 0;
  let current = null;
  const connect = () => {
    const ws = open();
    current = ws;
    let watchdog = null;
    ws.addEventListener("open", () => {
      backoff = 1_000;
      last = Date.now();
      log(`${name} open`);
      onOpen?.(ws);
      if (silentMs)
        watchdog = setInterval(() => {
          if (Date.now() - last > silentMs) {
            log(`${name} silent, reconnecting`);
            ws.close();
          }
        }, 5_000);
    });
    ws.addEventListener("message", (e) => {
      last = Date.now();
      onMessage(ws, e.data);
    });
    ws.addEventListener("error", (e) => current === ws && log(`${name} error`, e.message ?? ""));
    ws.addEventListener("close", (e) => {
      clearInterval(watchdog);
      if (current !== ws) return; // replaced by restart()
      log(`${name} closed ${e.code}, retrying in ${backoff / 1000} s`);
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    });
    return ws;
  };
  connect();
  return {
    restart() {
      const old = current;
      connect();
      try {
        old?.close();
      } catch {}
    },
    send(text) {
      if (current?.readyState === WebSocket.OPEN) current.send(text);
    },
  };
}

const text = (data) => (typeof data === "string" ? data : Buffer.from(data).toString());

async function answer(ws, stats, req) {
  if (typeof req.id !== "number" || typeof req.get !== "string") return;
  const reply = (status, body) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ id: req.id, status, body }));
  if (!RELAY_PATHS.test(req.get)) return reply(400, "path not allowed");
  stats.rest++;
  try {
    const res = await fetch(BINANCE_REST + req.get, { signal: AbortSignal.timeout(REST_TIMEOUT_MS) });
    reply(res.status, await res.text());
  } catch (err) {
    reply(502, String(err));
  }
}

// One exchange and market: the exchange's streams up, the collector down.
function relay(ex, m) {
  const id = `${m.id} ${ex}`;
  const stats = { ex, market: m.id, started: Date.now(), forwarded: 0, dropped: 0, rest: 0, lastExchange: 0, upstream: {}, downstream: "connecting" };
  let down = null;
  let framed = false; // set by the collector's hello on this connection
  // Each message is already JSON, so a frame is them joined, not re-encoded: {"b":[m1,m2,…]}.
  let held = [];
  const forward = (msg) => {
    if (framed) return held.push(msg);
    if (down?.readyState === WebSocket.OPEN && down.bufferedAmount < MAX_BUFFERED) {
      down.send(msg);
      stats.forwarded++;
    } else stats.dropped++;
  };
  setInterval(() => {
    if (!held.length) return;
    const frame = held;
    held = [];
    if (down?.readyState === WebSocket.OPEN && down.bufferedAmount < MAX_BUFFERED) {
      down.send(`{"b":[${frame.join(",")}]}`);
      stats.forwarded += frame.length;
      stats.frames = (stats.frames ?? 0) + 1;
    } else stats.dropped += frame.length;
  }, FRAME_MS);

  const ups = UPSTREAMS[ex](m).map((u) => {
    stats.upstream[u.name] = "connecting";
    let ping = null;
    return keep(
      `${id} ${u.name}`,
      () => {
        const ws = new WebSocket(u.url);
        ws.binaryType = "arraybuffer"; // BingX sends gzipped binary frames; Node's default is Blob
        return ws;
      },
      (ws, data) => {
        let msg;
        try {
          msg = u.gzip ? gunzipSync(Buffer.from(data)).toString() : text(data);
        } catch (err) {
          return log(`${id} ${u.name} undecodable frame`, String(err));
        }
        // Keep-alives stay here; only JSON goes down, so a frame stays valid JSON.
        if (msg === "Ping") return ws.send("Pong");
        if (msg[0] !== "{" || msg.includes('"op":"pong"') || msg.includes('"ret_msg":"pong"')) return;
        stats.upstream[u.name] = "open";
        stats.lastExchange = Date.now();
        forward(msg);
      },
      {
        silentMs: SILENT_MS,
        onOpen: (ws) => {
          for (const s of u.subscribe ?? []) ws.send(JSON.stringify(s));
          clearInterval(ping);
          if (u.ping) ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(u.ping), PING_MS);
        },
      },
    );
  });
  let resyncAt = 0;
  const resync = (why) => {
    if (ex === "binance" || Date.now() - resyncAt < RESYNC_MS) return;
    resyncAt = Date.now();
    log(`${id} reopening streams: ${why}`);
    for (const u of ups) u.restart();
  };

  // The collector's requests come back on the same socket. It may stay quiet for a while, so there
  // is no watchdog here; the collector drops a relay it has not heard from in 30 s.
  keep(
    `${id} cloudflare`,
    () => {
      const ws = new WebSocket(`${TARGET}?ex=${ex}&m=${m.id}`, { headers: { authorization: `Bearer ${TOKEN}` } });
      ws.addEventListener("open", () => {
        down = ws;
        framed = false;
        held = [];
        stats.downstream = "open";
        stats.framed = false;
      });
      ws.addEventListener("close", () => {
        if (down === ws) (down = null), (stats.downstream = "closed");
      });
      return ws;
    },
    (ws, data) => {
      let req;
      try {
        req = JSON.parse(text(data));
      } catch {
        return;
      }
      if (req.hello) {
        framed = ws === down && Boolean(req.hello.frames);
        stats.framed = framed;
        log(`${id} collector asks for ${framed ? "frames" : "single messages"}`);
        // A new collector connection starts with an empty book: give it a fresh snapshot.
        return resync("collector connected");
      }
      if (req.resync) return resync("collector asked");
      if (req.upstream != null) return ups[0].send(typeof req.upstream === "string" ? req.upstream : JSON.stringify(req.upstream));
      if (ex === "binance") void answer(ws, stats, req);
    },
  );
  setInterval(() => {
    if (down?.readyState === WebSocket.OPEN) down.send(JSON.stringify({ relay: { ...stats, at: Date.now() } }));
  }, HEARTBEAT_MS);
}

for (const ex of EXCHANGES) for (const m of Object.values(MARKETS)) relay(ex, m);

process.on("SIGTERM", () => process.exit(0));
