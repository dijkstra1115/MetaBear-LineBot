// Live collector for the BTC order-flow lab. Runs locally for now:
//
//   npm run lab:orderflow:collect
//
// Binance USDⓈ-M futures: aggTrades → 1-minute footprint bars, diff depth →
// local order book → heatmap snapshots, REST → OI and long/short ratios.
// Liquidations: Bybit (complete), OKX, Binance (one per second) — see public/lab/orderflow/liquidations.js.
//
// Raw history is appended to .data/orderflow/*.ndjson. The lab page polls two
// files that are rewritten in place: public/lab/data/btcusdt-live.json (5 s)
// and public/lab/data/btcusdt-heatmap.json (30 s).
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LIQ_FEEDS } from "../public/lab/orderflow/liquidations.js";

const SYMBOL = "BTCUSDT";
const TICK = 10;
const KEEP_MS = 48 * 3_600_000; // bars, metrics and liquidations in the live file
const HEAT_KEEP_MS = 12 * 3_600_000; // heatmap columns in the heatmap file
const HEAT_RANGE = 0.02; // ±2 % around mid
const BOOK_EVERY_MS = 10_000;
const REST = "https://fapi.binance.com";
const WS_MARKET = `wss://fstream.binance.com/market/stream?streams=${SYMBOL.toLowerCase()}@aggTrade`;
const WS_DEPTH = `wss://fstream.binance.com/public/stream?streams=${SYMBOL.toLowerCase()}@depth@100ms`;

const root = fileURLToPath(new URL("..", import.meta.url));
const rawDir = `${root}.data/orderflow/`;
const pubDir = `${root}public/lab/data/`;
const liveFile = `${pubDir}${SYMBOL.toLowerCase()}-live.json`;
const heatFile = `${pubDir}${SYMBOL.toLowerCase()}-heatmap.json`;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const day = (t) => new Date(t).toISOString().slice(0, 10);
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const append = (kind, t, row) => appendFile(`${rawDir}${kind}-${day(t)}.ndjson`, JSON.stringify(row) + "\n");

async function writeAtomic(file, text) {
  await writeFile(`${file}.tmp`, text);
  await rename(`${file}.tmp`, file);
}

async function getJson(path) {
  const res = await fetch(REST + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

// ---------- state ----------

const bars = new Map(); // minute → { o, h, l, c, levels: Map(bin → [buy, sell]), src }
// Stamped at reading time, unlike the archive (see public/lab/orderflow/metrics.js).
const metrics = new Map(); // t → [t, oi, oiValue, topPos, topAcc, global, taker over [t − 5m, t)]
const liquidations = []; // [t, "long" | "short", price, qty, exchange]
const heat = []; // [t, mid, lowBin, [qty per bin]]
const status = { trades: "connecting", depth: "connecting", liquidations: {}, lastTrade: 0 };

function barOf(minute, price) {
  let bar = bars.get(minute);
  if (!bar || bar.src === "kline") {
    // A kline backfill bar is replaced as soon as real trades arrive for that minute.
    bar = { o: price, h: price, l: price, c: price, levels: new Map(), src: "trades" };
    bars.set(minute, bar);
  }
  return bar;
}

function onTrade(d) {
  const price = Number(d.p);
  const qty = Number(d.q);
  const minute = Math.floor(d.T / 60_000) * 60_000;
  const bar = barOf(minute, price);
  if (price > bar.h) bar.h = price;
  if (price < bar.l) bar.l = price;
  bar.c = price;
  const bin = Math.floor(price / TICK);
  let lv = bar.levels.get(bin);
  if (!lv) bar.levels.set(bin, (lv = [0, 0]));
  lv[d.m ? 1 : 0] += qty;
  status.lastTrade = d.T;
}

const serialize = (t, b) => {
  const row = [t, b.o, b.h, b.l, b.c, [...b.levels.entries()].sort((x, y) => x[0] - y[0]).map(([bin, [buy, sell]]) => [bin, round(buy), round(sell)])];
  if (b.src === "kline") row.push(round(b.buy), round(b.sell));
  return row;
};

// Close finished minutes into the raw log once.
let lastFlushed = 0;
async function flushBars() {
  const current = Math.floor(Date.now() / 60_000) * 60_000;
  for (const [t, b] of [...bars.entries()].sort((a, c) => a[0] - c[0])) {
    if (t >= current || t <= lastFlushed || b.src !== "trades") continue;
    await append("bars", t, serialize(t, b));
    lastFlushed = t;
  }
}

// ---------- Binance trades ----------

function connect(name, url, { onOpen, onMessage, onClose, ping: pingText }) {
  let delay = 1000;
  const open = () => {
    const ws = new WebSocket(url);
    let ping;
    // A socket can hang in CONNECTING or go silent after a network drop without
    // ever closing; recycle it when nothing has arrived for 45 s.
    let lastMessage = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastMessage > 45_000) {
        log(`${name} silent, reconnecting`);
        ws.close();
        if (ws.readyState !== WebSocket.CLOSED) ws.onclose?.();
      }
    }, 10_000);
    ws.onopen = () => {
      delay = 1000;
      log(`${name} connected`);
      onOpen?.(ws);
      if (pingText) ping = setInterval(() => ws.send(pingText), 20_000);
    };
    ws.onmessage = (e) => {
      lastMessage = Date.now();
      if (e.data === "pong") return;
      try {
        onMessage(JSON.parse(String(e.data)));
      } catch (err) {
        log(`${name} message error`, err.message);
      }
    };
    ws.onclose = () => {
      clearInterval(ping);
      clearInterval(watchdog);
      ws.onclose = null;
      onClose?.();
      log(`${name} closed, retrying in ${delay / 1000}s`);
      setTimeout(open, delay);
      delay = Math.min(30_000, delay * 2);
    };
    ws.onerror = () => {};
  };
  open();
}

// ---------- Binance order book ----------

const book = { bids: new Map(), asks: new Map(), lastU: 0, ready: false, needFirst: false, buffer: [], syncing: false };

async function syncBook() {
  if (book.syncing) return;
  book.syncing = true;
  book.ready = false;
  try {
    const snap = await getJson(`/fapi/v1/depth?symbol=${SYMBOL}&limit=1000`);
    book.bids = new Map(snap.bids.map(([p, q]) => [Number(p), Number(q)]));
    book.asks = new Map(snap.asks.map(([p, q]) => [Number(p), Number(q)]));
    const id = snap.lastUpdateId;
    const pending = book.buffer.filter((e) => e.u >= id);
    book.buffer = [];
    const first = pending.findIndex((e) => e.U <= id && e.u >= id);
    if (first < 0 && pending.length) throw new Error("no overlapping depth event");
    book.lastU = id;
    book.ready = true;
    // The first event applied must straddle the snapshot id; later ones chain on pu.
    book.needFirst = true;
    for (const e of pending.slice(Math.max(0, first))) applyDepth(e);
    status.depth = "ok";
    log(`order book synced (${book.bids.size} bids, ${book.asks.size} asks)`);
  } catch (err) {
    log("order book sync failed:", err.message);
    setTimeout(syncBook, 3000);
  } finally {
    book.syncing = false;
  }
}

function applyDepth(e) {
  if (!book.ready) {
    book.buffer.push(e);
    if (book.buffer.length > 2000) book.buffer.shift();
    return;
  }
  if (book.needFirst) {
    if (e.u < book.lastU) return;
    if (e.U > book.lastU) {
      log("depth gap after snapshot, resyncing");
      book.buffer = [e];
      syncBook();
      return;
    }
    book.needFirst = false;
  } else if (e.pu !== book.lastU) {
    log("depth gap, resyncing");
    status.depth = "resync";
    book.buffer = [e];
    syncBook();
    return;
  }
  for (const [p, q] of e.b) Number(q) === 0 ? book.bids.delete(Number(p)) : book.bids.set(Number(p), Number(q));
  for (const [p, q] of e.a) Number(q) === 0 ? book.asks.delete(Number(p)) : book.asks.set(Number(p), Number(q));
  book.lastU = e.u;
}

async function snapshotBook() {
  if (!book.ready || !book.bids.size || !book.asks.size) return;
  let bestBid = -Infinity;
  let bestAsk = Infinity;
  for (const p of book.bids.keys()) if (p > bestBid) bestBid = p;
  for (const p of book.asks.keys()) if (p < bestAsk) bestAsk = p;
  const mid = (bestBid + bestAsk) / 2;
  const lowBin = Math.floor((mid * (1 - HEAT_RANGE)) / TICK);
  const highBin = Math.floor((mid * (1 + HEAT_RANGE)) / TICK);
  const sizes = new Array(highBin - lowBin + 1).fill(0);
  for (const side of [book.bids, book.asks]) {
    for (const [p, q] of side) {
      const i = Math.floor(p / TICK) - lowBin;
      if (i >= 0 && i < sizes.length) sizes[i] += q;
    }
  }
  const t = Math.floor(Date.now() / 1000) * 1000;
  const col = [t, round(mid, 1), lowBin, sizes.map((q) => round(q, 1))];
  await append("book", t, col);
  // Keep one column per minute for the page: the latest snapshot in that minute.
  const minute = Math.floor(t / 60_000) * 60_000;
  const last = heat.at(-1);
  const entry = [minute, col[1], col[2], col[3]];
  if (last && last[0] === minute) heat[heat.length - 1] = entry;
  else heat.push(entry);
  while (heat.length && heat[0][0] < Date.now() - HEAT_KEEP_MS) heat.shift();
}

// ---------- REST: metrics and kline backfill ----------

async function pollMetrics(limit, persist) {
  const q = `symbol=${SYMBOL}&period=5m&limit=${limit}`;
  const [oi, topPos, topAcc, global, taker] = await Promise.all([
    getJson(`/futures/data/openInterestHist?${q}`),
    getJson(`/futures/data/topLongShortPositionRatio?${q}`),
    getJson(`/futures/data/topLongShortAccountRatio?${q}`),
    getJson(`/futures/data/globalLongShortAccountRatio?${q}`),
    getJson(`/futures/data/takerlongshortRatio?${q}`),
  ]);
  const at = (list, t) => list.find((r) => r.timestamp === t);
  // OI and the long/short ratios are stamped when they were read; a taker row is stamped with
  // the open of the 5 minutes it covers, so the period ending at reading t is the row at t − 5m.
  for (const r of oi) {
    const t = r.timestamp;
    if (metrics.has(t)) continue;
    const row = [
      t,
      round(Number(r.sumOpenInterest), 1),
      Math.round(Number(r.sumOpenInterestValue)),
      round(Number(at(topPos, t)?.longShortRatio ?? NaN), 4),
      round(Number(at(topAcc, t)?.longShortRatio ?? NaN), 4),
      round(Number(at(global, t)?.longShortRatio ?? NaN), 4),
      round(Number(at(taker, t - 300_000)?.buySellRatio ?? NaN), 4),
    ].map((v) => (Number.isNaN(v) ? null : v));
    metrics.set(t, row);
    if (persist) await append("metrics", t, row);
  }
}

async function backfillKlines() {
  // Minutes before the collector started have no trade-level detail; klines give
  // OHLC and taker buy volume, enough for candles, delta and CVD.
  const rows = await getJson(`/fapi/v1/klines?symbol=${SYMBOL}&interval=1m&limit=1500`);
  const current = Math.floor(Date.now() / 60_000) * 60_000;
  for (const k of rows) {
    const t = k[0];
    if (t >= current || bars.has(t)) continue;
    const vol = Number(k[5]);
    const buy = Number(k[9]);
    bars.set(t, { o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), levels: new Map(), src: "kline", buy, sell: vol - buy });
  }
}

async function loadRaw() {
  // Resume trade-level bars and liquidations collected earlier today and yesterday.
  for (const t of [Date.now() - 86_400_000, Date.now()]) {
    for (const kind of ["bars", "liq"]) {
      let text = "";
      try {
        text = await readFile(`${rawDir}${kind}-${day(t)}.ndjson`, "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        if (!line) continue;
        const r = JSON.parse(line);
        if (kind === "liq") liquidations.push(r);
        else {
          bars.set(r[0], { o: r[1], h: r[2], l: r[3], c: r[4], levels: new Map(r[5].map(([bin, b, s]) => [bin, [b, s]])), src: "trades" });
          lastFlushed = Math.max(lastFlushed, r[0]);
        }
      }
    }
  }
}

// ---------- outputs ----------

async function writeLive() {
  const cutoff = Date.now() - KEEP_MS;
  for (const t of bars.keys()) if (t < cutoff) bars.delete(t);
  for (const t of metrics.keys()) if (t < cutoff) metrics.delete(t);
  // Three feeds arrive out of order relative to each other.
  liquidations.sort((x, y) => x[0] - y[0]);
  while (liquidations.length && liquidations[0][0] < cutoff) liquidations.shift();
  const out = {
    symbol: SYMBOL,
    tick: TICK,
    updated: Date.now(),
    status,
    // Same row shape as the archive; kline-backfilled bars carry [buyQty, sellQty] after the empty levels.
    bars: [...bars.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => serialize(t, b)),
    metrics: [...metrics.values()].sort((a, b) => a[0] - b[0]),
    liquidations,
  };
  await writeAtomic(liveFile, JSON.stringify(out));
}

async function writeHeat() {
  await writeAtomic(heatFile, JSON.stringify({ symbol: SYMBOL, tick: TICK, updated: Date.now(), columns: heat }));
}

// ---------- boot ----------

await mkdir(rawDir, { recursive: true });
await mkdir(pubDir, { recursive: true });
await loadRaw();
await backfillKlines().catch((err) => log("kline backfill failed:", err.message));
await pollMetrics(288, false).catch((err) => log("metrics backfill failed:", err.message));

connect("binance trades", WS_MARKET, {
  onOpen: () => (status.trades = "ok"),
  onMessage: (m) => m.data?.e === "aggTrade" && onTrade(m.data),
  onClose: () => (status.trades = "reconnecting"),
});
connect("binance depth", WS_DEPTH, {
  onOpen: () => {
    book.buffer = [];
    syncBook();
  },
  onMessage: (m) => m.data?.e === "depthUpdate" && applyDepth(m.data),
  onClose: () => {
    book.ready = false;
    status.depth = "reconnecting";
  },
});
status.liquidations = {};
for (const feed of LIQ_FEEDS) {
  connect(`${feed.ex} liquidations`, feed.url, {
    ping: feed.ping,
    onOpen: (ws) => {
      if (feed.subscribe) ws.send(JSON.stringify(feed.subscribe));
      status.liquidations[feed.ex] = "ok";
    },
    onMessage: (m) => {
      for (const row of feed.parse(m)) {
        liquidations.push(row);
        append("liq", row[0], row);
      }
    },
    onClose: () => (status.liquidations[feed.ex] = "reconnecting"),
  });
}

const every = (ms, fn) => setInterval(() => fn().catch((err) => log(fn.name, "failed:", err.message)), ms);
every(5_000, async function live() {
  await flushBars();
  await writeLive();
});
every(BOOK_EVERY_MS, snapshotBook);
every(30_000, writeHeat);
// OI and ratios are published every 5 minutes, with some delay; new rows are kept once.
every(60_000, async function metricsTick() {
  await pollMetrics(3, true);
});
log(`collecting ${SYMBOL}; raw → ${rawDir}, live → ${liveFile}`);
