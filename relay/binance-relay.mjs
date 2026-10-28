// Binance relay for the order-flow platform. Binance refuses Cloudflare, so this small process on
// the Tokyo VPS (docs/ORDERFLOW-BINANCE-RELAY.md) holds Binance's public streams and passes every
// message, untouched, to the Binance collector Durable Object of its market over one outbound
// WebSocket per market (BTC, ETH; markets.js). To a collector that asks for it ({"hello":{"frames":1}}),
// messages go down once a second in one frame, so it is idle between frames and is not billed for it
// (docs/ORDERFLOW-RELAY-HIBERNATION.md); one on older code still gets them one by one.
// It also answers each collector's REST requests for whitelisted public paths. It keeps no state:
// whatever it drops while either side is down, the collector fetches again by trade id or resyncs.
//
//   ORDERFLOW_RELAY_TOKEN=… node relay/binance-relay.mjs
//   RELAY_TARGET=ws://127.0.0.1:8792/api/orderflow/relay   (local `npm run orderflow:dev`)
//
// Node 22 or newer (built-in WebSocket and fetch); no packages.
import { BINANCE_REST, RELAY_PATHS, binanceStreams } from "../public/lab/orderflow/binance.js";
import { MARKETS } from "../public/lab/orderflow/markets.js";

const TARGET = process.env.RELAY_TARGET ?? "wss://metabear.io/api/orderflow/relay";
const TOKEN = process.env.ORDERFLOW_RELAY_TOKEN;
const HEARTBEAT_MS = 20_000;
const SILENT_MS = 30_000; // trades and depth arrive many times a second
const MAX_BACKOFF_MS = 30_000;
const MAX_BUFFERED = 4 * 1024 * 1024; // drop instead of queueing behind a stalled Cloudflare link
const REST_TIMEOUT_MS = 10_000;
const FRAME_MS = 1_000; // Binance's messages for one market are sent down together this often

if (!TOKEN) {
  console.error("ORDERFLOW_RELAY_TOKEN is not set");
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

// Keeps a socket open, reconnecting with backoff; with `silentMs`, a socket quiet that long is replaced.
function keep(name, open, onMessage, silentMs = null) {
  let backoff = 1_000;
  let last = 0;
  const connect = () => {
    const ws = open();
    let watchdog = null;
    ws.addEventListener("open", () => {
      backoff = 1_000;
      last = Date.now();
      log(`${name} open`);
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
      onMessage(ws, typeof e.data === "string" ? e.data : Buffer.from(e.data).toString());
    });
    ws.addEventListener("error", (e) => log(`${name} error`, e.message ?? ""));
    ws.addEventListener("close", (e) => {
      clearInterval(watchdog);
      log(`${name} closed ${e.code}, retrying in ${backoff / 1000} s`);
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    });
    return ws;
  };
  connect();
}

async function answer(ws, stats, text) {
  let req;
  try {
    req = JSON.parse(text);
  } catch {
    return;
  }
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

// One market: Binance's streams up, the market's collector down.
function relay(m) {
  const stats = { market: m.id, started: Date.now(), forwarded: 0, dropped: 0, rest: 0, lastBinance: 0, upstream: {}, downstream: "connecting" };
  let down = null;
  let framed = false; // set by the collector's hello on this connection
  // Each message is already JSON, so a frame is them joined, not re-encoded: {"b":[m1,m2,…]}.
  let held = [];
  const forward = (text) => {
    if (framed) return held.push(text);
    if (down?.readyState === WebSocket.OPEN && down.bufferedAmount < MAX_BUFFERED) {
      down.send(text);
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
  // Binance closes every connection after 24 hours.
  for (const [name, url] of Object.entries(binanceStreams(m))) {
    stats.upstream[name] = "connecting";
    keep(
      `${m.id} binance ${name}`,
      () => new WebSocket(url),
      (ws, text) => {
        stats.upstream[name] = "open";
        stats.lastBinance = Date.now();
        forward(text);
      },
      SILENT_MS,
    );
  }
  // The collector's requests come back on the same socket. It may stay quiet for a while, so there
  // is no watchdog here; the collector drops a relay it has not heard from in 30 s.
  keep(
    `${m.id} cloudflare`,
    () => {
      const ws = new WebSocket(`${TARGET}?m=${m.id}`, { headers: { authorization: `Bearer ${TOKEN}` } });
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
    (ws, text) => {
      if (text.startsWith('{"hello"')) {
        framed = ws === down && Boolean(JSON.parse(text).hello?.frames);
        stats.framed = framed;
        return log(`${m.id} collector asks for ${framed ? "frames" : "single messages"}`);
      }
      void answer(ws, stats, text);
    },
  );
  setInterval(() => {
    if (down?.readyState === WebSocket.OPEN) down.send(JSON.stringify({ relay: { ...stats, at: Date.now() } }));
  }, HEARTBEAT_MS);
}

for (const m of Object.values(MARKETS)) relay(m);

process.on("SIGTERM", () => process.exit(0));
