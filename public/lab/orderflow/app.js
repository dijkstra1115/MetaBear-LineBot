// BTC order-flow lab: footprint, volume profile, CVD, OI and long/short
// ratios drawn on one canvas. History comes from the order-flow API (src/orderflow/),
// whose collector records Bybit BTCUSDT 1-minute bars with $10 price bins; the page
// streams the newest minutes straight from Bybit.

import { BOOK_CHUNK_MS, BOOK_STEP_MS, BOOK_TICK, BOOK_TOPIC, OrderBook, PING, PRINT_MIN, StreamGaps, TICK, TICKER_TOPIC, TRADE_TOPIC, WS_URL, addTrade, applyTicker, barRow, groupPrints, parseTrades } from "./bybit.js";
import { LIQ_EXCHANGES, LIQ_FEEDS } from "./liquidations.js";
import { BIN as MAP_BIN, buildLiqMap, stepAt } from "./liqmap.js";
import { readingsAt } from "./metrics.js";
import { Player, drawOverlay, prepare } from "./replay.js";
import { SIGNALS, aggregate as aggregateSignals, detect, valueArea } from "./signals.js";

const API = "/api/orderflow/btcusdt";
const MINUTE = 60_000;
const DAY = 86_400_000;
// A shared link (see shareUrl) opens the same view: ?tf=&mode=&at=<bar start ms>&ind=<ids>&pm=.
const query = new URLSearchParams(location.search);
const SHARED_AT = Number(query.get("at")) || 0;
// ?case=<id> replays a recorded case from cases/ instead of loading live data; ?rec=1 hides the
// controls and plays it through for screen recording.
const CASE = /^[\w-]{1,40}$/.test(query.get("case") ?? "") ? query.get("case") : null;
// Days of history to load (today included): ?days=N, enough to reach a shared bar, at most the
// 30 days the collector keeps.
const DAYS = Math.min(
  30,
  Math.max(1, Math.floor(Number(query.get("days"))) || 3, SHARED_AT ? Math.floor(Date.now() / DAY) - Math.floor(SHARED_AT / DAY) + 1 : 0),
);
const C = {
  bg: "#05090f",
  grid: "rgba(120,160,190,0.08)",
  line: "rgba(120,160,190,0.22)",
  text: "#edf2ed",
  muted: "#94a8b9",
  dim: "#5f7486",
  buy: "#78e1d5",
  sell: "#f09a5a",
  gold: "#e8bd7d",
};
const BUY_RGB = "120,225,213";
const SELL_RGB = "240,154,90";
const AUTO_TICK = { 1: 10, 5: 10, 15: 25, 60: 50, 240: 100 };
const IMBALANCE = 3;
const MONO = '"JetBrains Mono Variable", ui-monospace, Menlo, monospace';

const $ = (id) => document.getElementById(id);
const canvas = $("chart");
const ctx = canvas.getContext("2d");
const ui = { tf: $("tf"), tick: $("tick"), mode: $("mode"), unit: $("unit"), printMin: $("print-min"), live: $("live"), readout: $("readout"), status: $("status") };

// Every indicator can be switched on and off; choices persist per browser.
// [id, where, label, on by default]
const INDICATORS = [
  ["profile", "overlay", "成交量分布", true],
  ["heat", "overlay", "掛單熱力圖", true],
  ["prints", "overlay", "大單泡泡", true],
  ["vwap", "overlay", "VWAP（日內 ±1σ、±2σ）", true],
  ["levels", "overlay", "前日高低點與價值區", false],
  ["liqmark", "overlay", "爆倉標記 ▲▼", true],
  ["events", "overlay", "事件", true],
  ["lmap", "overlay", "爆倉地圖（估算）", false],
  ["stats", "pane", "K 棒統計列", true],
  ["volume", "pane", "成交量", true],
  ["delta", "pane", "Delta", false],
  ["cvd", "pane", "CVD", true],
  ["liq", "pane", "爆倉", true],
  ["oi", "pane", "OI", true],
  ["doi", "pane", "OI 變化", false],
  ["funding", "pane", "資金費率", false],
  ["ratio", "pane", "多空比", true],
  ["imb", "pane", "掛單簿失衡", false],
];
const PREFS_KEY = "metabear-orderflow-indicators";
// Phones (most visitors arrive from LINE) start with fewer panes so the price chart keeps room.
const NARROW = matchMedia("(max-width: 720px)").matches;
const NARROW_OFF = new Set(["stats", "ratio", "levels"]);
const prefs = (() => {
  // Phones show fewer, larger prints by default so 15-minute bars do not drown in bubbles.
  const out = { show: Object.fromEntries(INDICATORS.map(([id, , , def]) => [id, def && !(NARROW && NARROW_OFF.has(id))])), printMin: NARROW ? 25 : 10 };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (saved?.show) for (const id of Object.keys(out.show)) if (typeof saved.show[id] === "boolean") out.show[id] = saved.show[id];
    if (Number(saved?.printMin) >= PRINT_MIN) out.printMin = Number(saved.printMin);
  } catch {}
  // A shared view shows the sender's indicators without changing this browser's saved choice.
  if (query.has("ind")) {
    const shown = new Set(query.get("ind").split(","));
    for (const id of Object.keys(out.show)) out.show[id] = shown.has(id);
  }
  if (Number(query.get("pm")) >= PRINT_MIN) out.printMin = Number(query.get("pm"));
  return out;
})();
const on = (id) => prefs.show[id];
for (const [param, select] of [["tf", "tf"], ["mode", "mode"]]) {
  const value = query.get(param);
  if (value && [...$(select).options].some((o) => o.value === value)) $(select).value = value;
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

// Server rows by time: footprint bars (archive and collector) and reading-time metrics.
const store = { bars: new Map(), metrics: new Map() };
let server = null; // { updated, status } from the latest /recent poll
let recentSince = 0;
let heatCols = new Map(); // minute → [t, mid, lowBin, sizes] at $10
// Fine book columns every 10 s at $1, fetched in 30-minute chunks for short timeframes.
const fineCols = new Map(); // t → [t, mid, lowBin, sizes]
const fineChunks = new Map(); // chunk start → "loading" | "done"
const FINE_MAX_TF = 5; // minutes; longer bars use the per-minute columns
const FINE_MAX_SPAN = 6 * 3_600_000; // load fine columns only for views this short
let liqs = [];
const prints = new Map(); // "t|side|price|qty" → [t, side, price, BTC]
let printList = []; // sorted by time, rebuilt when prints change
let printsDirty = false;
let barIndex = new Map(); // bar start → index in bars
let dayLevels = new Map(); // UTC day → previous day's high, low, POC, VAH, VAL
let mergedRows = []; // 1-minute rows after merging archive, collector and stream
let mergedOi = []; // [t, OI in BTC]
let liqMap = null;
let liqMapAt = 0;
let events = []; // order-flow events on closed 5-minute bars
let eventsKey = "";
let bars = [];
let tick = 25;
let replay = null; // replay mode: { player, prepared, raw, sec, printsN, readingsN, playing, last, viewKey }
// end: bar index at the right edge; follow: keep the newest bar in view as it forms (off once the
// user pans, back on at the right edge or with the latest button); yRange: a price scale the user
// dragged or zoomed, null for automatic.
const view = { end: 0, barW: 14, yRange: null, follow: true };
const RIGHT_PAD = 3; // empty bars right of the newest one
let lastAuto = null; // the automatic price range of the last frame
// Sub-pane heights the user dragged, per pane id, kept per browser apart from the indicator choice.
const PANES_KEY = "metabear-orderflow-panes";
const paneH = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(PANES_KEY) ?? "{}");
    return Object.fromEntries(Object.entries(saved).filter(([, v]) => Number.isFinite(v) && v > 0));
  } catch {
    return {};
  }
})();
const savePanes = () => {
  try {
    localStorage.setItem(PANES_KEY, JSON.stringify(paneH));
  } catch {}
};
let lastPricePerPx = 1;
let pricePane = null; // last drawn price pane, for hit-testing outside draw()
let hover = null; // { i, y }
let size = { w: 0, h: 0, dpr: 1 };

const taipei = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fmtTime = (t) => taipei.format(t).replace(/\s+/, " ");
const fmtVol = (v) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
const usd = () => ui.unit.value === "usd";
const fmtSigned = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmtVol(Math.abs(v));
const fmtPrice = (p) => p.toLocaleString("en-US", { maximumFractionDigits: 1 });
const fmtRate = (v) => `${(v * 100).toFixed(4)}%`;

// ---------- data ----------

// One minute row as the chart uses it: the page's own stream wins for minutes it saw in full,
// the collector's row otherwise (the minute the page opened in, and minutes around a dropped
// connection, are partial in the stream).
function mergedRow(t) {
  const own = stream.bars.get(t);
  const server = store.bars.get(t);
  if (own && ((t > stream.start && !stream.gaps.covers(t, t + MINUTE)) || !server)) return barRow(t, own);
  return server ?? null;
}

// Sorted 1-minute rows → bar groups for the timeframe.
function groupBars(rows, tfMs) {
  const baseTick = TICK;
  const groups = new Map();
  for (const [t, o, h, l, c, levels, xbuy = 0, xsell = 0] of rows) {
    const key = Math.floor(t / tfMs) * tfMs;
    let b = groups.get(key);
    if (!b) groups.set(key, (b = { t: key, o, h, l, c, map: new Map(), xbuy: 0, xsell: 0, partial: false, run: 0, maxD: -Infinity, minD: Infinity }));
    if (h > b.h) b.h = h;
    if (l < b.l) b.l = l;
    b.c = c;
    // Kline-filled minutes have prices but no price levels or taker split.
    const k = usd() ? c : 1;
    b.xbuy += xbuy * k;
    b.xsell += xsell * k;
    if (!levels.length) b.partial = true;
    let minuteDelta = (xbuy - xsell) * k;
    for (let [bin, buy, sell] of levels) {
      const p = Math.floor((bin * baseTick) / tick) * tick;
      if (usd()) {
        // Notional at the bin midpoint; within ±$5 of the traded price.
        const mid = bin * baseTick + baseTick / 2;
        buy *= mid;
        sell *= mid;
      }
      minuteDelta += buy - sell;
      const lv = b.map.get(p);
      if (lv) {
        lv[0] += buy;
        lv[1] += sell;
      } else b.map.set(p, [buy, sell]);
    }
    // Highest and lowest running delta inside the bar, sampled at each minute's close.
    b.run += minuteDelta;
    if (b.run > b.maxD) b.maxD = b.run;
    if (b.run < b.minD) b.minD = b.run;
  }
  return [...groups.values()].sort((x, y) => x.t - y.t);
}

// Bar groups → bars with levels, imbalances, POC, CVD from `cvd` on, and the readings at close.
function finishBars(groups, tfMs, readingAt, cvd = 0) {
  return groups.map((b) => {
    const levels = [...b.map.entries()].map(([p, [buy, sell]]) => ({ p, buy, sell })).sort((x, y) => y.p - x.p);
    let buy = b.xbuy;
    let sell = b.xsell;
    let poc = levels[0];
    for (const lv of levels) {
      buy += lv.buy;
      sell += lv.sell;
      if (lv.buy + lv.sell > poc.buy + poc.sell) poc = lv;
    }
    const byPrice = new Map(levels.map((lv) => [lv.p, lv]));
    for (const lv of levels) {
      const below = byPrice.get(lv.p - tick);
      const above = byPrice.get(lv.p + tick);
      lv.buyImb = lv.buy > 0 && lv.buy >= IMBALANCE * (below ? below.sell : 0) && (below?.sell ?? 0) > 0;
      lv.sellImb = lv.sell > 0 && lv.sell >= IMBALANCE * (above ? above.buy : 0) && (above?.buy ?? 0) > 0;
    }
    cvd += buy - sell;
    // Latest reading at or before the bar's close.
    const close = b.t + tfMs;
    const row = readingAt(close);
    return {
      t: b.t, end: close, partial: b.partial, maxD: b.maxD, minD: b.minD, o: b.o, h: b.h, l: b.l, c: b.c, levels, buy, sell, delta: buy - sell, cvd, poc: poc?.p,
      oi: row?.[usd() ? 2 : 1] ?? null, topPos: row?.[3] ?? null, global: row?.[5] ?? null, funding: row?.[7] ?? null,
    };
  });
}

// The forming bar follows the live stream: OI several times a second, the predicted funding rate.
function applyLive(last, prev) {
  if (!last || last.end <= Date.now()) return;
  if (stream.oi) {
    last.oi = usd() ? stream.oi * last.c : stream.oi;
    last.doi = prev?.oi != null ? last.oi - prev.oi : null;
  }
  if (stream.ticker.funding != null) last.funding = stream.ticker.funding;
}

let metricsSorted = [];

function build() {
  const tfMin = Number(ui.tf.value);
  const tfMs = tfMin * 60_000;
  tick = ui.tick.value === "auto" ? AUTO_TICK[tfMin] : Number(ui.tick.value);
  const minutes = new Set([...store.bars.keys(), ...stream.bars.keys()]);
  mergedRows = [...minutes].sort((x, y) => x - y).map(mergedRow).filter(Boolean);
  // The API stamps every metrics row at its reading time (metrics.js).
  metricsSorted = [...store.metrics.values()].sort((a, b) => a[0] - b[0]);
  bars = finishBars(groupBars(mergedRows, tfMs), tfMs, readingsAt(metricsSorted));
  barIndex = new Map(bars.map((b, i) => [b.t, i]));
  for (let i = 0; i < bars.length; i++) {
    const a = bars[i - 1]?.oi;
    const b = bars[i].oi;
    bars[i].doi = a != null && b != null ? b - a : null;
    bars[i].imb = bookImbalance(bars[i]);
  }
  attachVwap(mergedRows, bars);
  dayLevels = priorDayLevels(mergedRows);
  applyLive(bars.at(-1), bars.at(-2));
  attachLiquidations(tfMs);
  mergedOi = metricsSorted.filter((m) => m[1] != null).map((m) => [m[0], m[1]]);
  if (stream.oi && mergedOi.length && Date.now() > mergedOi.at(-1)[0] + 30_000) mergedOi.push([Date.now(), stream.oi]);
  updateLiqMap(false);
  updateEvents();
}

// New trades only change the forming bar, so redo just that one (about every 0.3 s while trading)
// instead of every minute of history; a full build runs when a new bar opens or older data lands.
function buildTail() {
  const tfMs = Number(ui.tf.value) * MINUTE;
  const last = bars.at(-1);
  if (!last || Math.floor(Date.now() / tfMs) * tfMs !== last.t) return build();
  const rows = [];
  for (let t = last.t; t < last.end; t += MINUTE) {
    const row = mergedRow(t);
    if (row) rows.push(row);
  }
  let cut = mergedRows.length;
  while (cut > 0 && mergedRows[cut - 1][0] >= last.t) cut--;
  mergedRows.length = cut;
  mergedRows.push(...rows);
  const prev = bars.at(-2);
  const [bar] = finishBars(groupBars(rows, tfMs), tfMs, readingsAt(metricsSorted), prev?.cvd ?? 0);
  if (!bar) return;
  bar.doi = prev?.oi != null && bar.oi != null ? bar.oi - prev.oi : null;
  bar.imb = bookImbalance(bar);
  vwapTail(bar, prev, rows);
  applyLive(bar, prev);
  bar.liq = liquidationsIn(bar.t, bar.end);
  bars[bars.length - 1] = bar;
  if (stream.oi && mergedOi.length && Date.now() > mergedOi.at(-1)[0] + 30_000) mergedOi.push([Date.now(), stream.oi]);
  updateLiqMap(false);
  updateEvents();
}

// Session VWAP per UTC day from the footprint (bin midpoints), with its volume-weighted standard
// deviation; a bar shows the value at its last minute. Kline-only minutes add nothing.
function attachVwap(rows, list) {
  const series = [];
  let day = -1;
  let pv = 0;
  let p2v = 0;
  let vol = 0;
  for (const [t, , , , , levels] of rows) {
    const d = Math.floor(t / DAY);
    if (d !== day) (day = d), (pv = 0), (p2v = 0), (vol = 0);
    for (const [bin, buy, sell] of levels) {
      const price = bin * TICK + TICK / 2;
      const v = buy + sell;
      pv += price * v;
      p2v += price * price * v;
      vol += v;
    }
    series.push([t, d, pv, p2v, vol]);
  }
  let j = -1;
  for (const b of list) {
    while (j + 1 < series.length && series[j + 1][0] < b.end) j++;
    const s = j >= 0 && series[j][1] === Math.floor(b.t / DAY) ? series[j] : null;
    setVwap(b, s ? s.slice(1) : null);
  }
}

// b.vw = [UTC day, Σ price·volume, Σ price²·volume, Σ volume] at the bar's close.
function setVwap(b, sums) {
  b.vw = sums;
  const vol = sums?.[3] ?? 0;
  if (!vol) {
    b.vwap = b.vwapSd = null;
    return;
  }
  const vwap = sums[1] / vol;
  b.vwap = vwap;
  b.vwapSd = Math.sqrt(Math.max(0, sums[2] / vol - vwap * vwap));
}

function vwapTail(bar, prev, rows) {
  const day = Math.floor(bar.t / DAY);
  const sums = prev?.vw && prev.vw[0] === day ? [...prev.vw] : [day, 0, 0, 0];
  for (const [, , , , , levels] of rows)
    for (const [bin, buy, sell] of levels) {
      const price = bin * TICK + TICK / 2;
      const v = buy + sell;
      sums[1] += price * v;
      sums[2] += price * price * v;
      sums[3] += v;
    }
  setVwap(bar, sums);
}

// Previous UTC day's high, low and value area for each day, from 1-minute rows.
function priorDayLevels(rows) {
  const days = new Map();
  for (const [t, , h, l, , levels] of rows) {
    const d = Math.floor(t / DAY);
    let day = days.get(d);
    if (!day) days.set(d, (day = { high: -Infinity, low: Infinity, volume: new Map() }));
    day.high = Math.max(day.high, h);
    day.low = Math.min(day.low, l);
    for (const [bin, buy, sell] of levels) day.volume.set(bin, (day.volume.get(bin) ?? 0) + buy + sell);
  }
  const out = new Map();
  for (const [d, day] of days) {
    const va = valueArea(day.volume);
    const mid = (bin) => bin * TICK + TICK / 2;
    const list = [
      { name: "前日高", price: day.high, color: C.muted },
      { name: "前日低", price: day.low, color: C.muted },
    ];
    if (va) list.push({ name: "前日 POC", price: mid(va.poc), color: C.gold }, { name: "前日 VAH", price: mid(va.vah), color: C.dim }, { name: "前日 VAL", price: mid(va.val), color: C.dim });
    out.set(d + 1, list);
  }
  return out;
}

// Resting size below mid against above it, (bid − ask) ÷ (bid + ask), from the last heatmap column
// in the bar. Bybit's book reaches about ±0.25 %, so this is near-touch pressure only.
function bookImbalance(b) {
  for (let t = b.end - MINUTE; t >= b.t; t -= MINUTE) {
    const col = heatCols.get(t);
    if (!col) continue;
    const [, mid, lowBin, sizes] = col;
    const midBin = Math.floor(mid / TICK);
    let bid = 0;
    let ask = 0;
    for (let i = 0; i < sizes.length; i++) {
      const bin = lowBin + i;
      if (bin < midBin) bid += sizes[i];
      else if (bin > midBin) ask += sizes[i];
    }
    return bid + ask > 0 ? (bid - ask) / (bid + ask) : null;
  }
  return null;
}

function updateEvents() {
  if (!on("events")) return;
  // Detection runs on its own closed 5-minute bars, whatever the chart shows; only
  // redo it when a new 5-minute bar has closed.
  const now = Date.now();
  const key = `${mergedRows.length}:${Math.floor(now / 300_000)}`;
  if (key === eventsKey) return;
  eventsKey = key;
  events = detect(aggregateSignals(mergedRows, TICK, mergedOi, now));
}

function eventsIn(b) {
  return events.filter((e) => e.t > b.t && e.t <= b.end);
}

function updateLiqMap(force) {
  if (!on("lmap")) return;
  // The model replays every interval; refreshing it every 10 s is plenty.
  if (!force && Date.now() - liqMapAt < 10_000) return;
  liqMapAt = Date.now();
  liqMap = buildLiqMap(mergedRows, TICK, mergedOi);
}

function liquidationsIn(from, to) {
  let liq = null;
  for (const [t, side, price, qty, ex = "bybit"] of liqs) {
    if (t < from || t >= to) continue;
    liq ??= { long: { usd: 0, pq: 0, q: 0 }, short: { usd: 0, pq: 0, q: 0 }, byEx: {} };
    const s = liq[side];
    s.usd += price * qty;
    s.pq += price * qty;
    s.q += qty;
    liq.byEx[ex] = (liq.byEx[ex] ?? 0) + price * qty;
  }
  return liq;
}

function attachLiquidations(tfMs) {
  const byT = new Map(bars.map((b) => [b.t, b]));
  for (const b of bars) b.liq = null;
  for (const [t, side, price, qty, ex = "bybit"] of liqs) {
    const b = byT.get(Math.floor(t / tfMs) * tfMs);
    if (!b) continue;
    b.liq ??= { long: { usd: 0, pq: 0, q: 0 }, short: { usd: 0, pq: 0, q: 0 }, byEx: {} };
    const s = b.liq[side];
    s.usd += price * qty;
    s.pq += price * qty;
    s.q += qty;
    b.liq.byEx[ex] = (b.liq.byEx[ex] ?? 0) + price * qty;
  }
}

// ---------- layout ----------

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  size = { w: rect.width, h: rect.height, dpr };
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  draw();
}

const unitLabel = () => (usd() ? "USD" : "BTC");
// Sub-panes in display order: `key` panes draw a line of that bar field, the rest are histograms.
const PANES = {
  stats: { label: () => "K 棒統計" },
  volume: { label: () => `成交量 (${unitLabel()})` },
  delta: { label: () => `Delta (${unitLabel()})` },
  cvd: { label: () => "CVD", key: "cvd" },
  liq: { label: () => "爆倉 (USD)" },
  oi: { label: () => `OI (${unitLabel()})`, key: "oi" },
  doi: { label: () => `OI 變化 (${unitLabel()})` },
  funding: { label: () => "資金費率（每 8 小時）", key: "funding" },
  ratio: { label: () => "多空比（Bybit 全體帳戶）", key: "global" },
  imb: { label: () => "掛單簿失衡（現價 ±0.25%，買 − 賣）" },
};

// K-bar statistics under the chart, one line each, like the footprint tools' statistics table.
// Max and min delta are the running delta's extremes at minute closes within the bar.
const STAT_ROW = 15;
const STATS = [
  ["量", (b) => b.buy + b.sell, "vol"],
  ["Δ", (b) => b.delta, "signed"],
  ["Δ%", (b) => (b.buy + b.sell > 0 ? (b.delta / (b.buy + b.sell)) * 100 : null), "pct"],
  ["最大Δ", (b) => (Number.isFinite(b.maxD) ? b.maxD : null), "signed"],
  ["最小Δ", (b) => (Number.isFinite(b.minD) ? b.minD : null), "signed"],
  ["ΔOI", (b) => b.doi, "signed"],
];

function layout() {
  const axisW = size.w < 560 ? 58 : 74;
  const timeH = 24;
  const plotW = size.w - axisW;
  const avail = size.h - timeH;
  const subIds = Object.keys(PANES).filter(on);
  const statsH = on("stats") ? STATS.length * STAT_ROW + 6 : 0;
  const flexIds = subIds.filter((id) => id !== "stats");
  const sub = flexIds.length ? Math.max(40, Math.min(Math.round(avail * 0.12), Math.floor((avail * 0.55 - statsH) / flexIds.length))) : 0;
  // Dragged heights win; together the sub-panes never take more than 75 % of the chart.
  const want = Object.fromEntries(flexIds.map((id) => [id, paneH[id] ?? sub]));
  const total = flexIds.reduce((sum, id) => sum + want[id], 0);
  const fit = total > avail * 0.75 - statsH ? (avail * 0.75 - statsH) / total : 1;
  const heights = Object.fromEntries(flexIds.map((id) => [id, Math.max(28, Math.round(want[id] * fit))]));
  const priceH = avail - statsH - flexIds.reduce((sum, id) => sum + heights[id], 0);
  const panes = { price: { y: 0, h: priceH } };
  let y = priceH;
  for (const id of subIds) {
    const h = id === "stats" ? statsH : heights[id];
    panes[id] = { id, y, h, label: PANES[id].label(), key: PANES[id].key };
    y += h;
  }
  return { axisW, timeH, plotW, panes, subIds, timeY: avail };
}

const xOf = (i, L) => L.plotW - (view.end - i) * view.barW;
function visibleRange(L) {
  const from = Math.max(0, Math.floor(view.end - L.plotW / view.barW) - 1);
  const to = Math.min(bars.length - 1, Math.ceil(view.end));
  return [from, to];
}
function clampView() {
  const minW = 2;
  const maxW = 260;
  view.barW = Math.min(maxW, Math.max(minW, view.barW));
  // Up to half a screen of empty space past the newest bar, as on other charting tools.
  const plotW = Math.max(100, size.w - 74);
  view.end = Math.min(bars.length + Math.max(8, (plotW / view.barW) * 0.5), Math.max(5, view.end));
}

// ---------- drawing ----------

function niceStep(range, target) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

function draw() {
  if (!size.w) return;
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size.w, size.h);
  if (!bars.length) return;
  const L = layout();
  const [from, to] = visibleRange(L);
  drawPrice(L, from, to);
  for (const id of L.subIds) {
    if (id === "stats") drawStats(L, L.panes.stats, from, to);
    else if (id === "liq") drawLiqPane(L, L.panes.liq, from, to);
    else if (PANES[id].key) drawSub(L, L.panes[id], from, to);
    else drawHist(L, L.panes[id], from, to);
  }
  drawTimeAxis(L, from, to);
  drawLegend(L);
  drawCrosshair(L);
}

function drawPrice(L, from, to) {
  const P = L.panes.price;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = from; i <= to; i++) {
    lo = Math.min(lo, bars[i].l);
    hi = Math.max(hi, bars[i].h + tick);
  }
  // A replay keeps its open position and the levels it talks about (within 2 %) on screen.
  if (replay) {
    const { position, lines } = replay.player.state;
    const near = [...lines.values()].map((l) => l.price).filter((p) => Math.abs(p / bars[to].c - 1) < 0.02);
    // Footprint cells need the room; the target joins the scale once the script leaves them.
    if (position) near.push(position.stop, ...(ui.mode.value === "footprint" ? [] : [position.target]));
    for (const p of near) {
      lo = Math.min(lo, p - tick);
      hi = Math.max(hi, p + tick);
    }
  }
  const pad = (hi - lo) * 0.06 || tick;
  lo -= pad;
  hi += pad;
  lastAuto = { lo, hi };
  // A dragged or zoomed price scale stays where the user put it until reset.
  if (view.yRange) ({ lo, hi } = view.yRange);
  const top = P.y + 8;
  const h = P.h - 16;
  P.pricePerPx = (hi - lo) / h;
  lastPricePerPx = P.pricePerPx;
  pricePane = P;
  const yOf = (p) => top + ((hi - p) / (hi - lo)) * h;
  P.yOf = yOf;
  P.pOf = (y) => hi - ((y - top) / h) * (hi - lo);

  // grid + axis
  ctx.font = `11px ${MONO}`;
  ctx.textBaseline = "middle";
  const step = niceStep(hi - lo, 8);
  for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
    const y = Math.round(yOf(p)) + 0.5;
    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(L.plotW, y);
    ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.fillText(fmtPrice(p), L.plotW + 8, y);
  }

  if (on("heat") && !drawFineHeat(L, from, to, yOf) && heatCols.size) drawHeat(L, from, to, yOf);
  if (on("lmap") && liqMap) drawLiqMap(L, from, to, yOf);
  if (on("lmap") && liqMap) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, P.y, L.plotW, P.h);
    ctx.clip();
    drawLiqProfile(L, yOf);
    ctx.restore();
  } else if (on("profile")) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, P.y, L.plotW, P.h);
    ctx.clip();
    drawProfile(L, from, to, yOf);
    ctx.restore();
  }

  const rowH = (tick / (hi - lo)) * h;
  const showCells = ui.mode.value === "footprint" && view.barW >= 14 && rowH >= 3;
  const showNumbers = view.barW >= 64 && rowH >= 11;
  let maxRow = 0;
  if (showCells) for (let i = from; i <= to; i++) for (const lv of bars[i].levels) maxRow = Math.max(maxRow, lv.buy + lv.sell);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, P.y, L.plotW, P.h);
  ctx.clip();
  for (let i = from; i <= to; i++) {
    const b = bars[i];
    const x0 = xOf(i, L);
    const up = b.c >= b.o;
    if (showCells) {
      const candleW = Math.max(3, Math.min(8, view.barW * 0.12));
      const cellX = x0 + candleW + 3;
      const cellW = view.barW - candleW - 5;
      for (const lv of b.levels) {
        const y = yOf(lv.p + tick);
        const ch = Math.max(1, rowH - (rowH > 6 ? 1 : 0));
        const vol = lv.buy + lv.sell;
        const a = 0.1 + 0.55 * Math.sqrt(vol / (maxRow || 1));
        ctx.fillStyle = `rgba(${lv.buy >= lv.sell ? BUY_RGB : SELL_RGB},${a.toFixed(3)})`;
        ctx.fillRect(cellX, y, cellW, ch);
        if (lv.p === b.poc) {
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 1;
          ctx.strokeRect(cellX + 0.5, y + 0.5, cellW - 1, ch - 1);
        }
        if (showNumbers) {
          const fs = Math.min(12, Math.max(9, rowH - 3));
          ctx.font = `${fs}px ${MONO}`;
          ctx.textBaseline = "middle";
          const cy = y + ch / 2;
          ctx.textAlign = "right";
          ctx.fillStyle = lv.sellImb ? "#ffd2b0" : "rgba(237,242,237,0.82)";
          ctx.fillText(fmtVol(lv.sell), cellX + cellW / 2 - 4, cy);
          ctx.textAlign = "left";
          ctx.fillStyle = lv.buyImb ? "#c9fff7" : "rgba(237,242,237,0.82)";
          ctx.fillText(fmtVol(lv.buy), cellX + cellW / 2 + 4, cy);
          if (lv.sellImb || lv.buyImb) {
            ctx.fillStyle = lv.buyImb ? C.buy : C.sell;
            ctx.fillRect(lv.buyImb ? cellX + cellW - 3 : cellX, y, 3, ch);
          }
        }
      }
      ctx.textAlign = "left";
      drawCandle(x0 + 1, candleW, b, yOf, up);
      if (showNumbers) {
        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = b.delta >= 0 ? C.buy : C.sell;
        ctx.textAlign = "center";
        ctx.fillText(`Δ ${fmtSigned(b.delta)}`, cellX + cellW / 2, yOf(b.l) + 12);
        ctx.textAlign = "left";
      }
    } else {
      const w = Math.max(1, view.barW * 0.7);
      drawCandle(x0 + (view.barW - w) / 2, w, b, yOf, up);
    }
  }
  if (on("levels")) drawLevels(L, from, to, yOf);
  if (on("vwap")) drawVwap(L, from, to, yOf);
  if (on("prints")) drawPrints(L, from, to, yOf);
  if (on("liqmark")) drawLiquidations(L, from, to, yOf);
  if (on("events")) drawEvents(L, from, to, yOf);
  ctx.restore();

  // last price tag
  const last = bars[bars.length - 1];
  const ly = yOf(last.c);
  if (ly > P.y && ly < P.y + P.h) {
    ctx.fillStyle = last.c >= last.o ? C.buy : C.sell;
    ctx.fillRect(L.plotW, ly - 9, L.axisW, 18);
    ctx.fillStyle = C.bg;
    ctx.font = `11px ${MONO}`;
    ctx.fillText(fmtPrice(last.c), L.plotW + 8, ly);
  }
  if (replay) drawReplay(L, P, yOf, last.c);
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.moveTo(0, P.y + P.h + 0.5);
  ctx.lineTo(size.w, P.y + P.h + 0.5);
  ctx.moveTo(L.plotW + 0.5, 0);
  ctx.lineTo(L.plotW + 0.5, L.timeY);
  ctx.stroke();
}

function drawCandle(x, w, b, yOf, up) {
  const color = up ? C.buy : C.sell;
  const cx = Math.round(x + w / 2) + 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, yOf(b.h));
  ctx.lineTo(cx, yOf(b.l));
  ctx.stroke();
  const y1 = yOf(Math.max(b.o, b.c));
  const y2 = yOf(Math.min(b.o, b.c));
  ctx.fillStyle = color;
  ctx.fillRect(x, y1, w, Math.max(1, y2 - y1));
}

// Fetches the 30-minute chunks of fine columns a short view needs; the page's own stream adds
// columns after it opened.
function loadFine(t0, t1) {
  for (let c = Math.floor(t0 / BOOK_CHUNK_MS) * BOOK_CHUNK_MS; c < t1; c += BOOK_CHUNK_MS) {
    if (fineChunks.has(c) || c + BOOK_CHUNK_MS <= Date.now() - 30 * DAY || c > Date.now()) continue;
    fineChunks.set(c, "loading");
    fetch(`${API}/book?from=${c}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((d) => {
        for (const col of d.columns) if (!fineCols.has(col[0])) fineCols.set(col[0], col);
        // The current chunk is still filling; let a later view fetch it again.
        if (c + BOOK_CHUNK_MS <= Date.now()) fineChunks.set(c, "done");
        else setTimeout(() => fineChunks.delete(c), 60_000);
        redraw();
      })
      .catch(() => setTimeout(() => fineChunks.delete(c), 30_000));
  }
}

// Book detail for 1- and 5-minute bars: a slice per 10 s inside each bar and price rows of $1,
// merged to $2, $5 or $10 when rows would be thinner than 2 px. Returns false to fall back to the
// per-minute columns.
function drawFineHeat(L, from, to, yOf) {
  const tfMs = Number(ui.tf.value) * MINUTE;
  if (tfMs > FINE_MAX_TF * MINUTE) return false;
  const t0 = bars[from].t;
  const t1 = bars[to].t + tfMs;
  if (t1 - t0 > FINE_MAX_SPAN) return false;
  loadFine(t0, t1);
  const pxPerDollar = Math.abs(yOf(0) - yOf(1));
  const step = [1, 2, 5, 10].find((s) => pxPerDollar * s >= 2) ?? 10;
  const cells = [];
  for (let i = from; i <= to; i++) {
    const b = bars[i];
    for (let t = b.t; t < b.t + tfMs; t += BOOK_STEP_MS) {
      const col = fineCols.get(t);
      if (!col) continue;
      // Merging $1 rows is the costly part; columns are immutable once stored, so do it once.
      if (col.step !== step) {
        const rows = new Map();
        const [, , lowBin, sizes] = col;
        for (let k = 0; k < sizes.length; k++) {
          if (!sizes[k]) continue;
          const row = Math.floor(((lowBin + k) * BOOK_TICK) / step);
          rows.set(row, (rows.get(row) ?? 0) + sizes[k]);
        }
        col.step = step;
        col.rows = rows;
      }
      cells.push([xOf(i, L) + ((t - b.t) / tfMs) * view.barW, col.rows]);
    }
  }
  if (!cells.length) return false;
  const all = cells.flatMap(([, rows]) => [...rows.values()]).sort((x, y) => x - y);
  const ref = all[Math.floor(all.length * 0.985)] || 1;
  const w = Math.max(1, (view.barW * BOOK_STEP_MS) / tfMs + 0.5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, L.panes.price.y, L.plotW, L.panes.price.h);
  ctx.clip();
  for (const [x, rows] of cells) {
    for (const [row, q] of rows) {
      const v = Math.min(1, q / ref);
      if (v < 0.05) continue;
      const y1 = yOf((row + 1) * step);
      const y2 = yOf(row * step);
      ctx.fillStyle = v > 0.6 ? `rgba(232,189,125,${(0.25 + 0.6 * v).toFixed(3)})` : `rgba(90,140,200,${(0.08 + 0.45 * v).toFixed(3)})`;
      ctx.fillRect(x, y1, w, Math.max(1, y2 - y1));
    }
  }
  ctx.restore();
  return true;
}

function drawHeat(L, from, to, yOf) {
  // Latest resting-liquidity snapshot inside each bar, at the collector's $10 bins.
  const cols = [];
  for (let i = from; i <= to; i++) {
    const b = bars[i];
    let col = null;
    for (let t = b.end - 60_000; t >= b.t; t -= 60_000) {
      col = heatCols.get(t);
      if (col) break;
    }
    if (col) cols.push([i, col]);
  }
  if (!cols.length) return;
  const all = cols.flatMap(([, c]) => c[3]).filter((q) => q > 0).sort((x, y) => x - y);
  const ref = all[Math.floor(all.length * 0.98)] || 1;
  const bin = TICK;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, L.panes.price.y, L.plotW, L.panes.price.h);
  ctx.clip();
  for (const [i, [, , lowBin, sizes]] of cols) {
    const x = xOf(i, L);
    for (let k = 0; k < sizes.length; k++) {
      const q = sizes[k];
      if (!q) continue;
      const v = Math.min(1, q / ref);
      if (v < 0.04) continue;
      const y1 = yOf((lowBin + k + 1) * bin);
      const y2 = yOf((lowBin + k) * bin);
      ctx.fillStyle = v > 0.6 ? `rgba(232,189,125,${(0.25 + 0.6 * v).toFixed(3)})` : `rgba(90,140,200,${(0.08 + 0.45 * v).toFixed(3)})`;
      ctx.fillRect(x, y1, view.barW + 0.5, Math.max(1, y2 - y1));
    }
  }
  ctx.restore();
}

// Liquidations as triangles in the forced direction (longs force-sold ▼ amber, shorts force-bought
// ▲ mint) at their average price, three sizes by USD; bubbles are reserved for large trades.
function drawLiquidations(L, from, to, yOf) {
  for (let i = from; i <= to; i++) {
    const liq = bars[i].liq;
    if (!liq) continue;
    const cx = xOf(i, L) + view.barW / 2;
    for (const side of ["long", "short"]) {
      const s = liq[side];
      if (s.usd < 20_000) continue;
      const r = s.usd >= 1_000_000 ? 9 : s.usd >= 200_000 ? 6.5 : 4.5;
      const y = yOf(s.pq / s.q);
      const dir = side === "long" ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx - r, y - dir * r * 0.6);
      ctx.lineTo(cx + r, y - dir * r * 0.6);
      ctx.lineTo(cx, y + dir * r * 0.9);
      ctx.closePath();
      ctx.fillStyle = side === "long" ? C.sell : C.buy;
      ctx.strokeStyle = C.bg;
      ctx.fill();
      ctx.stroke();
    }
  }
}

// Large prints: one bubble per aggregated taker order of at least the chosen size, placed at its
// time within the bar and its average price; area grows with size.
function drawPrints(L, from, to, yOf) {
  if (printsDirty) {
    printList = [...prints.values()].sort((a, b) => a[0] - b[0]);
    printsDirty = false;
  }
  const tfMs = Number(ui.tf.value) * MINUTE;
  const t0 = bars[from].t;
  const t1 = bars[to].t + tfMs;
  let lo = 0;
  let hi = printList.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (printList[m][0] < t0) lo = m + 1;
    else hi = m;
  }
  const shown = [];
  for (let k = lo; k < printList.length && printList[k][0] < t1; k++) if (printList[k][3] >= prefs.printMin) shown.push(printList[k]);
  shown.sort((a, b) => a[3] - b[3]); // largest on top
  for (const [t, side, price, qty] of shown) {
    const i = barIndex.get(Math.floor(t / tfMs) * tfMs);
    if (i == null) continue;
    const x = xOf(i, L) + ((t - bars[i].t) / tfMs) * view.barW;
    const r = Math.min(30, Math.max(3, 2.2 * Math.sqrt(qty)));
    ctx.beginPath();
    ctx.arc(x, yOf(price), r, 0, Math.PI * 2);
    ctx.fillStyle = side === "buy" ? `rgba(${BUY_RGB},0.3)` : `rgba(${SELL_RGB},0.3)`;
    ctx.strokeStyle = side === "buy" ? C.buy : C.sell;
    ctx.fill();
    ctx.stroke();
  }
}

function drawVwap(L, from, to, yOf) {
  const path = (k, color, width, dash) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    let prevDay = null;
    for (let i = from; i <= to; i++) {
      const b = bars[i];
      if (b.vwap == null) {
        prevDay = null;
        continue;
      }
      const x = xOf(i, L) + view.barW / 2;
      const y = yOf(b.vwap + k * b.vwapSd);
      const day = Math.floor(b.t / DAY);
      // Each UTC day starts a new line.
      if (day === prevDay) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      prevDay = day;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  };
  for (const k of [-2, 2]) path(k, "rgba(196,160,255,0.28)", 1, [2, 4]);
  for (const k of [-1, 1]) path(k, "rgba(196,160,255,0.45)", 1, [5, 4]);
  path(0, "#c4a0ff", 1.6, []);
}

function drawLevels(L, from, to, yOf) {
  ctx.font = `10px ${MONO}`;
  ctx.textBaseline = "bottom";
  let i = from;
  while (i <= to) {
    const day = Math.floor(bars[i].t / DAY);
    let j = i;
    while (j + 1 <= to && Math.floor(bars[j + 1].t / DAY) === day) j++;
    const x0 = Math.max(0, xOf(i, L));
    const x1 = Math.min(L.plotW, xOf(j, L) + view.barW);
    for (const lv of dayLevels.get(day) ?? []) {
      const y = Math.round(yOf(lv.price)) + 0.5;
      ctx.strokeStyle = lv.color;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = lv.color;
      ctx.fillText(lv.name, x0 + 4, y - 2);
    }
    i = j + 1;
  }
  ctx.textBaseline = "middle";
}

function drawLiqPane(L, P, from, to) {
  // Shorts liquidated (forced buys) above the midline, longs (forced sells) below.
  let max = 0;
  for (let i = from; i <= to; i++) {
    const liq = bars[i].liq;
    if (liq) max = Math.max(max, liq.long.usd, liq.short.usd);
  }
  ctx.font = `11px ${MONO}`;
  ctx.textBaseline = "top";
  ctx.fillStyle = C.muted;
  drawPaneLabel(P);
  const labelW = drawPaneLabel(P);
  ctx.fillStyle = C.buy;
  ctx.fillText("▲ 空單", labelW + 12, P.y + 6);
  ctx.fillStyle = C.sell;
  ctx.fillText("▼ 多單", labelW + 66, P.y + 6);
  ctx.textBaseline = "middle";
  const top = P.y + 22;
  const h = P.h - 26;
  const mid = Math.round(top + h / 2) + 0.5;
  ctx.strokeStyle = C.grid;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(L.plotW, mid);
  ctx.stroke();
  if (max > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, P.y, L.plotW, P.h);
    ctx.clip();
    const w = Math.max(1, view.barW * 0.7);
    for (let i = from; i <= to; i++) {
      const liq = bars[i].liq;
      if (!liq) continue;
      const x = xOf(i, L) + (view.barW - w) / 2;
      const up = (liq.short.usd / max) * (h / 2);
      const down = (liq.long.usd / max) * (h / 2);
      ctx.fillStyle = C.buy;
      if (up) ctx.fillRect(x, mid - up, w, up);
      ctx.fillStyle = C.sell;
      if (down) ctx.fillRect(x, mid, w, down);
    }
    ctx.restore();
    ctx.fillStyle = C.muted;
    ctx.fillText(fmtVol(max), L.plotW + 8, top + 4);
    ctx.fillText(fmtVol(max), L.plotW + 8, top + h - 4);
  }
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.moveTo(0, P.y + P.h + 0.5);
  ctx.lineTo(size.w, P.y + P.h + 0.5);
  ctx.stroke();
}

// Purple → teal → yellow, like the liquidation maps traders already know.
const MAP_RAMP = [
  [0, [40, 20, 70]],
  [0.45, [33, 145, 140]],
  [1, [253, 231, 37]],
];
function rampColor(v) {
  let k = 1;
  while (k < MAP_RAMP.length - 1 && v > MAP_RAMP[k][0]) k++;
  const [a0, c0] = MAP_RAMP[k - 1];
  const [a1, c1] = MAP_RAMP[k];
  const f = Math.min(1, Math.max(0, (v - a0) / (a1 - a0)));
  return c0.map((c, i) => Math.round(c + (c1[i] - c) * f));
}

function drawEvents(L, from, to, yOf) {
  ctx.font = `10px ${MONO}`;
  ctx.textAlign = "center";
  for (let i = from; i <= to; i++) {
    const b = bars[i];
    const list = eventsIn(b);
    if (!list.length) continue;
    const cx = xOf(i, L) + view.barW / 2;
    let above = 0;
    let below = 0;
    for (const e of list) {
      // Bearish context above the bar, bullish below, OI (no direction) above in gold.
      const up = e.dir === "up";
      const y = up ? yOf(b.l) + 10 + below++ * 12 : yOf(b.h) - 10 - above++ * 12;
      ctx.fillStyle = e.dir === "up" ? C.buy : e.dir === "down" ? C.sell : C.gold;
      ctx.beginPath();
      if (up) {
        ctx.moveTo(cx, y - 4);
        ctx.lineTo(cx - 4, y + 3);
        ctx.lineTo(cx + 4, y + 3);
      } else {
        ctx.moveTo(cx, y + 4);
        ctx.lineTo(cx - 4, y - 3);
        ctx.lineTo(cx + 4, y - 3);
      }
      ctx.fill();
      if (view.barW >= 28) ctx.fillText(SIGNALS[e.kind].name, cx, up ? y + 12 : y - 11);
    }
  }
  ctx.textAlign = "left";
}

function drawLiqMap(L, from, to, yOf) {
  const P = L.panes.price;
  const pLo = P.pOf(P.y + P.h);
  const pHi = P.pOf(P.y);
  const iLo = Math.max(0, Math.floor((pLo - liqMap.lo) / MAP_BIN));
  const iHi = Math.min(liqMap.bins - 1, Math.ceil((pHi - liqMap.lo) / MAP_BIN));
  const cols = [];
  const values = [];
  for (let i = from; i <= to; i++) {
    const s = stepAt(liqMap, bars[i].end);
    if (!s) continue;
    cols.push([i, s]);
    for (let k = iLo; k <= iHi; k++) {
      const v = s.long[k] + s.short[k];
      if (v > 0) values.push(v);
    }
  }
  if (!values.length) return;
  values.sort((x, y) => x - y);
  const ref = values[Math.floor(values.length * 0.99)] || 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, P.y, L.plotW, P.h);
  ctx.clip();
  for (const [i, s] of cols) {
    const x = xOf(i, L);
    for (let k = iLo; k <= iHi; k++) {
      const v = (s.long[k] + s.short[k]) / ref;
      if (v < 0.03) continue;
      const [r, g, b] = rampColor(Math.min(1, v));
      const y1 = yOf(liqMap.lo + (k + 1) * MAP_BIN);
      const y2 = yOf(liqMap.lo + k * MAP_BIN);
      ctx.fillStyle = `rgba(${r},${g},${b},${(0.25 + 0.6 * Math.min(1, v)).toFixed(3)})`;
      ctx.fillRect(x, y1, view.barW + 0.5, Math.max(1, y2 - y1));
    }
  }
  ctx.restore();
}

// Current estimated liquidation levels: longs below price, shorts above.
function drawLiqProfile(L, yOf) {
  const s = liqMap.steps.at(-1);
  if (!s) return;
  const P = L.panes.price;
  const iLo = Math.max(0, Math.floor((P.pOf(P.y + P.h) - liqMap.lo) / MAP_BIN));
  const iHi = Math.min(liqMap.bins - 1, Math.ceil((P.pOf(P.y) - liqMap.lo) / MAP_BIN));
  let max = 0;
  for (let k = iLo; k <= iHi; k++) max = Math.max(max, s.long[k], s.short[k]);
  if (!max) return;
  const width = Math.min(160, L.plotW * 0.22);
  const right = L.plotW - 2;
  for (let k = iLo; k <= iHi; k++) {
    const y1 = yOf(liqMap.lo + (k + 1) * MAP_BIN);
    const h = Math.max(1, yOf(liqMap.lo + k * MAP_BIN) - y1 - 1);
    if (s.long[k]) {
      ctx.fillStyle = "rgba(240,154,90,0.55)";
      ctx.fillRect(right - (s.long[k] / max) * width, y1, (s.long[k] / max) * width, h);
    }
    if (s.short[k]) {
      ctx.fillStyle = "rgba(120,225,213,0.55)";
      ctx.fillRect(right - (s.short[k] / max) * width, y1, (s.short[k] / max) * width, h);
    }
  }
  ctx.font = `10px ${MONO}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = "right";
  ctx.fillText("預估強平分布", right, P.y + 14);
  ctx.textAlign = "left";
}

// Cumulative estimated liquidations between the last price and price p.
function liqUntil(p) {
  const s = liqMap?.steps.at(-1);
  const last = bars.at(-1);
  if (!s || !last) return null;
  const from = Math.floor((Math.min(p, last.c) - liqMap.lo) / MAP_BIN);
  const to = Math.floor((Math.max(p, last.c) - liqMap.lo) / MAP_BIN);
  const side = p < last.c ? s.long : s.short;
  let usd = 0;
  for (let k = Math.max(0, from); k <= Math.min(liqMap.bins - 1, to); k++) usd += side[k] * (liqMap.lo + (k + 0.5) * MAP_BIN);
  return { down: p < last.c, usd };
}

function drawProfile(L, from, to, yOf) {
  const totals = new Map();
  for (let i = from; i <= to; i++) {
    for (const lv of bars[i].levels) {
      const t = totals.get(lv.p) ?? { buy: 0, sell: 0 };
      t.buy += lv.buy;
      t.sell += lv.sell;
      totals.set(lv.p, t);
    }
  }
  const rows = [...totals.entries()].sort((a, b) => b[0] - a[0]);
  if (!rows.length) return;
  let max = 0;
  let total = 0;
  let pocIdx = 0;
  rows.forEach(([, t], idx) => {
    const v = t.buy + t.sell;
    total += v;
    if (v > max) {
      max = v;
      pocIdx = idx;
    }
  });
  // Value area: grow from the POC toward the heavier neighbour until 70% of volume.
  let lo = pocIdx;
  let hi = pocIdx;
  let acc = max;
  const vol = (idx) => rows[idx][1].buy + rows[idx][1].sell;
  while (acc < total * 0.7 && (lo > 0 || hi < rows.length - 1)) {
    const up = lo > 0 ? vol(lo - 1) : -1;
    const down = hi < rows.length - 1 ? vol(hi + 1) : -1;
    if (up >= down) acc += vol(--lo);
    else acc += vol(++hi);
  }
  const width = Math.min(160, L.plotW * 0.22);
  const right = L.plotW - 2;
  for (const [idx, [p, t]] of rows.entries()) {
    const y = yOf(p + tick);
    const h = Math.max(1, yOf(p) - y - (yOf(p) - y > 4 ? 1 : 0));
    const inVA = idx >= lo && idx <= hi;
    const wb = (t.buy / max) * width;
    const ws = (t.sell / max) * width;
    ctx.fillStyle = `rgba(${SELL_RGB},${inVA ? 0.32 : 0.16})`;
    ctx.fillRect(right - ws - wb, y, ws, h);
    ctx.fillStyle = `rgba(${BUY_RGB},${inVA ? 0.32 : 0.16})`;
    ctx.fillRect(right - wb, y, wb, h);
  }
  const mark = (p, color, label, dash) => {
    const y = Math.round(yOf(p + tick / 2)) + 0.5;
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(L.plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.fillText(label, right - width - 6, y - 7);
    ctx.textAlign = "left";
  };
  mark(rows[pocIdx][0], "rgba(232,189,125,0.75)", "POC", []);
  mark(rows[lo][0], "rgba(148,168,185,0.5)", "VAH", [4, 4]);
  mark(rows[hi][0], "rgba(148,168,185,0.5)", "VAL", [4, 4]);
}

function drawSub(L, P, from, to) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = from; i <= to; i++) {
    const v = bars[i][P.key];
    if (v == null) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  ctx.fillStyle = C.muted;
  ctx.font = `11px ${MONO}`;
  ctx.textBaseline = "top";
  drawPaneLabel(P);
  ctx.textBaseline = "middle";
  if (!Number.isFinite(lo)) return;
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad;
  hi += pad;
  const top = P.y + 22;
  const h = P.h - 28;
  const yOf = (v) => top + ((hi - v) / (hi - lo)) * h;
  P.yOf = yOf;

  if (P.key === "cvd") {
    // Per-bar delta as faint columns behind the cumulative line.
    let maxD = 0;
    for (let i = from; i <= to; i++) maxD = Math.max(maxD, Math.abs(bars[i].delta));
    const mid = top + h / 2;
    for (let i = from; i <= to; i++) {
      const d = bars[i].delta;
      const bh = (Math.abs(d) / (maxD || 1)) * (h / 2);
      ctx.fillStyle = d >= 0 ? `rgba(${BUY_RGB},0.18)` : `rgba(${SELL_RGB},0.18)`;
      const w = Math.max(1, view.barW * 0.6);
      ctx.fillRect(xOf(i, L) + (view.barW - w) / 2, d >= 0 ? mid - bh : mid, w, bh);
    }
  }
  const base = P.key === "global" ? 1 : P.key === "funding" ? 0 : null;
  if (base != null && lo < base && hi > base) {
    const y = Math.round(yOf(base)) + 0.5;
    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(L.plotW, y);
    ctx.stroke();
  }

  const line = (key, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    for (let i = from; i <= to; i++) {
      const v = bars[i][key];
      if (v == null) continue;
      const x = xOf(i, L) + view.barW / 2;
      if (started) ctx.lineTo(x, yOf(v));
      else {
        ctx.moveTo(x, yOf(v));
        started = true;
      }
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, P.y, L.plotW, P.h);
  ctx.clip();
  line(P.key, P.key === "cvd" ? C.buy : C.gold, 1.6);
  ctx.restore();

  ctx.fillStyle = C.muted;
  const fmt = (v) => (P.key === "global" ? v.toFixed(2) : P.key === "funding" ? fmtRate(v) : P.key === "oi" ? fmtVol(v) : fmtSigned(v));
  ctx.fillText(fmt(hi - pad), L.plotW + 8, yOf(hi - pad));
  ctx.fillText(fmt(lo + pad), L.plotW + 8, yOf(lo + pad));
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.moveTo(0, P.y + P.h + 0.5);
  ctx.lineTo(size.w, P.y + P.h + 0.5);
  ctx.stroke();
}

// One row per statistic: cells tinted by sign and size relative to the visible bars, with the
// number once a bar is wide enough to hold it.
function drawStats(L, P, from, to) {
  const showText = view.barW >= 44;
  ctx.font = `10px ${MONO}`;
  ctx.textBaseline = "middle";
  STATS.forEach(([name, value, kind], row) => {
    const y = P.y + 3 + row * STAT_ROW;
    let max = 0;
    for (let i = from; i <= to; i++) max = Math.max(max, Math.abs(value(bars[i]) ?? 0));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, L.plotW, STAT_ROW);
    ctx.clip();
    for (let i = from; i <= to; i++) {
      const v = value(bars[i]);
      if (v == null) continue;
      const x = xOf(i, L);
      const a = 0.06 + 0.4 * (max ? Math.abs(v) / max : 0);
      ctx.fillStyle = kind === "vol" ? `rgba(148,168,185,${a.toFixed(3)})` : `rgba(${v >= 0 ? BUY_RGB : SELL_RGB},${a.toFixed(3)})`;
      ctx.fillRect(x + 0.5, y + 1, Math.max(1, view.barW - 1), STAT_ROW - 2);
      if (!showText) continue;
      ctx.fillStyle = kind === "vol" ? C.text : v >= 0 ? "#c9fff7" : "#ffd2b0";
      ctx.textAlign = "center";
      ctx.fillText(kind === "pct" ? `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%` : kind === "vol" ? fmtVol(v) : fmtSigned(v), x + view.barW / 2, y + STAT_ROW / 2);
    }
    ctx.restore();
    ctx.textAlign = "left";
    ctx.fillStyle = C.muted;
    ctx.fillText(name, L.plotW + 8, y + STAT_ROW / 2);
  });
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.moveTo(0, P.y + P.h + 0.5);
  ctx.lineTo(size.w, P.y + P.h + 0.5);
  ctx.stroke();
}

// Histogram panes: volume stacked by taker side, signed delta and OI change, imbalance on ±1.
function drawHist(L, P, from, to) {
  const id = P.id;
  const value = (b) => (id === "volume" ? b.buy + b.sell : id === "delta" ? b.delta : id === "doi" ? b.doi : b.imb);
  let max = id === "imb" ? 1 : 0;
  if (id !== "imb") for (let i = from; i <= to; i++) max = Math.max(max, Math.abs(value(bars[i]) ?? 0));
  ctx.fillStyle = C.muted;
  ctx.font = `11px ${MONO}`;
  ctx.textBaseline = "top";
  drawPaneLabel(P);
  ctx.textBaseline = "middle";
  const top = P.y + 22;
  const h = P.h - 26;
  const signed = id !== "volume";
  const base = signed ? Math.round(top + h / 2) + 0.5 : top + h;
  const scale = (signed ? h / 2 : h) / (max || 1);
  if (signed) {
    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    ctx.moveTo(0, base);
    ctx.lineTo(L.plotW, base);
    ctx.stroke();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, P.y, L.plotW, P.h);
  ctx.clip();
  const w = Math.max(1, view.barW * 0.7);
  for (let i = from; i <= to; i++) {
    const b = bars[i];
    const x = xOf(i, L) + (view.barW - w) / 2;
    if (id === "volume") {
      const hs = b.sell * scale;
      const hb = b.buy * scale;
      ctx.fillStyle = `rgba(${SELL_RGB},0.75)`;
      ctx.fillRect(x, base - hs, w, hs);
      ctx.fillStyle = `rgba(${BUY_RGB},0.75)`;
      ctx.fillRect(x, base - hs - hb, w, hb);
      continue;
    }
    const v = value(b);
    if (v == null) continue;
    const bh = Math.abs(v) * scale;
    ctx.fillStyle = v >= 0 ? C.buy : C.sell;
    ctx.fillRect(x, v >= 0 ? base - bh : base, w, bh);
  }
  ctx.restore();
  ctx.fillStyle = C.muted;
  const fmt = (v) => (id === "imb" ? v.toFixed(1) : fmtVol(v));
  if (max > 0) {
    ctx.fillText(fmt(max), L.plotW + 8, top + 4);
    if (signed) ctx.fillText("−" + fmt(max), L.plotW + 8, top + h - 4);
  }
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.moveTo(0, P.y + P.h + 0.5);
  ctx.lineTo(size.w, P.y + P.h + 0.5);
  ctx.stroke();
}

function drawTimeAxis(L, from, to) {
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = C.muted;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const every = Math.max(1, Math.ceil(110 / view.barW));
  for (let i = from; i <= to; i++) {
    if (i % every) continue;
    const x = xOf(i, L) + view.barW / 2;
    if (x < 40 || x > L.plotW - 40) continue;
    ctx.fillText(fmtTime(bars[i].t), x, L.timeY + L.timeH / 2);
    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, L.timeY);
    ctx.stroke();
  }
  ctx.textAlign = "left";
}

const focusBar = () => bars[hover?.i ?? bars.length - 1] ?? bars.at(-1);

// The bar under the pointer (or the newest), in each pane's own terms.
function paneValue(id, b) {
  switch (id) {
    case "volume":
      return `${fmtVol(b.buy + b.sell)}  買 ${fmtVol(b.buy)}  賣 ${fmtVol(b.sell)}`;
    case "delta":
      return fmtSigned(b.delta);
    case "cvd":
      return fmtSigned(b.cvd);
    case "oi":
      return b.oi != null ? `${fmtVol(b.oi)}${b.doi != null ? `  ${fmtSigned(b.doi)}` : ""}` : "";
    case "doi":
      return b.doi != null ? fmtSigned(b.doi) : "";
    case "funding":
      return b.funding != null ? fmtRate(b.funding) : "";
    case "ratio":
      return b.global != null ? b.global.toFixed(2) : "";
    case "imb":
      return b.imb != null ? (b.imb >= 0 ? "+" : "") + b.imb.toFixed(2) : "";
    case "liq":
      return b.liq ? `多 ${fmtVol(b.liq.long.usd)}  空 ${fmtVol(b.liq.short.usd)}` : "";
    default:
      return "";
  }
}

// Draws "Label  value" at the pane's top-left; returns the x where it ends.
function drawPaneLabel(P) {
  ctx.font = `11px ${MONO}`;
  ctx.textBaseline = "top";
  ctx.fillStyle = C.muted;
  ctx.fillText(P.label, 8, P.y + 6);
  let x = 8 + ctx.measureText(P.label).width;
  const b = focusBar();
  const value = b ? paneValue(P.id, b) : "";
  if (value) {
    ctx.fillStyle = C.text;
    ctx.fillText(value, x + 8, P.y + 6);
    x += 8 + ctx.measureText(value).width;
  }
  return x;
}

// OHLC of the bar under the pointer (or the newest) at the chart's top-left, and below it only
// what that bar has: events, large prints, liquidation estimates, missing footprint.
function drawLegend(L) {
  const b = focusBar();
  if (!b) return;
  const P = L.panes.price;
  const up = b.c >= b.o;
  const change = b.o ? ((b.c - b.o) / b.o) * 100 : 0;
  // Narrow screens already show the symbol in the top bar and need the room for prices.
  const narrow = L.plotW < 600;
  const gap = narrow ? " " : "  ";
  const parts = [
    ...(narrow ? [] : [["BTCUSDT", C.text], [` · ${replay ? "Binance" : "Bybit"} · ${TF_NAMES[ui.tf.value] ?? ""}   `, C.dim]]),
    ["O ", C.dim],
    [fmtPrice(b.o), C.muted],
    [`${gap}H `, C.dim],
    [fmtPrice(b.h), C.muted],
    [`${gap}L `, C.dim],
    [fmtPrice(b.l), C.muted],
    [`${gap}C `, C.dim],
    [fmtPrice(b.c), up ? C.buy : C.sell],
    [`${gap}${change >= 0 ? "+" : ""}${change.toFixed(2)}%`, up ? C.buy : C.sell],
  ];
  ctx.font = `${narrow ? 11 : 12}px ${MONO}`;
  ctx.textBaseline = "top";
  // A soft backing keeps the legend readable over candles and bubbles.
  const width = parts.reduce((w, [text]) => w + ctx.measureText(text).width, 0);
  ctx.fillStyle = "rgba(5,9,15,0.78)";
  ctx.fillRect(4, P.y + 4, width + 12, 20);
  let x = 10;
  for (const [text, color] of parts) {
    ctx.fillStyle = color;
    ctx.fillText(text, x, P.y + 8);
    x += ctx.measureText(text).width;
  }
  // Details only for a bar the user points at or pinned; the resting legend is just OHLC.
  if (!hover) return;
  const notes = [
    hover ? fmtTime(b.t) : "",
    b.partial ? "部分分鐘無足跡" : "",
    on("prints") ? printsText(b) : "",
    ...(on("events") ? eventsIn(b).map((e) => `${SIGNALS[e.kind].name} ${e.note}`) : []),
    liqText(),
  ].filter(Boolean);
  if (!notes.length) return;
  ctx.font = `11px ${MONO}`;
  let line = notes.join("   ");
  while (line.length > 4 && ctx.measureText(line).width > L.plotW - 20) line = line.slice(0, -2);
  if (line !== notes.join("   ")) line += "…";
  ctx.fillStyle = "rgba(5,9,15,0.78)";
  ctx.fillRect(4, P.y + 24, ctx.measureText(line).width + 12, 18);
  ctx.fillStyle = C.muted;
  ctx.fillText(line, 10, P.y + 27);
}

const TF_NAMES = { 1: "1m", 5: "5m", 15: "15m", 60: "1h", 240: "4h" };

function drawCrosshair(L) {
  if (!hover || hover.i < 0 || hover.i >= bars.length) return;
  const x = Math.round(xOf(hover.i, L) + view.barW / 2) + 0.5;
  ctx.strokeStyle = "rgba(237,242,237,0.28)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, L.timeY);
  const P = L.panes.price;
  const inPrice = hover.y > P.y && hover.y < P.y + P.h;
  if (inPrice) {
    ctx.moveTo(0, Math.round(hover.y) + 0.5);
    ctx.lineTo(L.plotW, Math.round(hover.y) + 0.5);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  if (inPrice) {
    ctx.fillStyle = "#1b2a38";
    ctx.fillRect(L.plotW, hover.y - 9, L.axisW, 18);
    ctx.fillStyle = C.text;
    ctx.font = `11px ${MONO}`;
    ctx.textBaseline = "middle";
    ctx.fillText(fmtPrice(P.pOf(hover.y)), L.plotW + 8, hover.y);
  }
  // The bar's time on the time axis.
  const label = fmtTime(bars[hover.i].t);
  ctx.font = `11px ${MONO}`;
  const w = ctx.measureText(label).width + 14;
  const bx = Math.min(L.plotW - w, Math.max(0, x - w / 2));
  ctx.fillStyle = "#1b2a38";
  ctx.fillRect(bx, L.timeY + 2, w, L.timeH - 4);
  ctx.fillStyle = C.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + w / 2, L.timeY + L.timeH / 2);
  ctx.textAlign = "left";
}

function printsText(b) {
  let nb = 0;
  let qb = 0;
  let ns = 0;
  let qs = 0;
  for (const [t, side, , qty] of printList) {
    if (t < b.t || t >= b.end || qty < prefs.printMin) continue;
    if (side === "buy") (nb++, (qb += qty));
    else (ns++, (qs += qty));
  }
  return nb || ns ? `大單 買 ${nb} 筆 ${fmtVol(qb)} / 賣 ${ns} 筆 ${fmtVol(qs)} BTC` : "";
}

function liqText() {
  if (!on("lmap") || !liqMap || !hover) return "";
  const P = pricePane;
  if (!P || hover.y <= P.y || hover.y >= P.y + P.h) return "";
  const p = P.pOf(hover.y);
  const est = liqUntil(p);
  return est ? `估算：${est.down ? "跌" : "漲"}到 ${fmtPrice(Math.round(p))} 累計${est.down ? "多單" : "空單"}強平 ${fmtVol(est.usd)} USD` : "";
}

// The visible legend is drawn on the canvas; this keeps the same values for screen readers.
function updateReadout() {
  const b = bars[hover?.i ?? bars.length - 1];
  if (!b) return;
  ui.readout.textContent = `${fmtTime(b.t)} 開 ${fmtPrice(b.o)} 高 ${fmtPrice(b.h)} 低 ${fmtPrice(b.l)} 收 ${fmtPrice(b.c)}，CVD ${fmtSigned(b.cvd)}`;
}

// ---------- interaction ----------

let frame = 0;
function redraw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    draw();
    updateReadout();
  });
}

function zoomAt(factor, px) {
  const L = layout();
  // While following the newest bar, zoom around the right edge so it stays in view.
  if (view.follow) px = L.plotW;
  const anchor = view.end - (L.plotW - px) / view.barW;
  view.barW *= factor;
  clampView();
  view.end = anchor + (L.plotW - px) / view.barW;
  clampView();
  redraw();
}

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    if (e.altKey || e.ctrlKey || e.clientX - rect.left > layout().plotW) {
      zoomY(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      view.end += (e.deltaX || e.deltaY) / view.barW;
      view.follow = view.end >= bars.length;
      clampView();
      redraw();
    } else zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, Math.min(e.clientX - rect.left, layout().plotW));
  },
  { passive: false },
);

function zoomY(factor) {
  const range = view.yRange ?? lastAuto;
  if (!range) return;
  const mid = (range.lo + range.hi) / 2;
  const half = Math.max(tick * 2, (range.hi - range.lo) / 2 / factor);
  view.yRange = { lo: mid - half, hi: mid + half };
  redraw();
}
function resetY() {
  view.yRange = null;
  redraw();
}

const pointers = new Map();
let pinch = null;
let dragAxis = false;
let drag = null; // one-finger or mouse drag: { dy, inPrice }
let paneDrag = null; // dragging a pane border: { id, above, startY, startH, aboveH }

// The border at the top of a sub-pane, within a few pixels of y; the statistics row has a fixed height.
function borderAt(L, x, y) {
  if (x > L.plotW) return null;
  for (let k = 0; k < L.subIds.length; k++) {
    const id = L.subIds[k];
    if (id === "stats" || Math.abs(y - L.panes[id].y) > 5) continue;
    const above = k > 0 ? L.subIds[k - 1] : "price";
    return { id, above: above === "stats" ? "price" : above };
  }
  return null;
}
let tap = null; // a press that has not moved yet: releasing it pins the bar under it
let pinnedT = null; // start time of the pinned bar, kept across timeframe changes
const pinnedIndex = () => (pinnedT == null ? -1 : bars.findIndex((b) => b.t <= pinnedT && pinnedT < b.end));
const hoverAt = (clientX, clientY) => {
  const rect = canvas.getBoundingClientRect();
  const L = layout();
  hover = { i: Math.floor(view.end - (L.plotW - (clientX - rect.left)) / view.barW), y: clientY - rect.top };
};
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  tap = pointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
  const L = layout();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const border = pointers.size === 1 ? borderAt(L, x, y) : null;
  if (border) {
    paneDrag = { ...border, startY: e.clientY, startH: L.panes[border.id].h, aboveH: L.panes[border.above].h };
    tap = null;
    return;
  }
  dragAxis = pointers.size === 1 && x > L.plotW && y < L.panes.price.h;
  drag = pointers.size === 1 ? { dy: 0, inPrice: y < L.panes.price.h && x <= L.plotW } : null;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.abs(a.x - b.x), barW: view.barW };
  }
});
canvas.addEventListener("dblclick", (e) => {
  const rect = canvas.getBoundingClientRect();
  if (e.clientX - rect.left > layout().plotW) resetY();
});
canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  if (tap?.id === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null;
  if (paneDrag && pointers.has(e.pointerId)) {
    const dy = e.clientY - paneDrag.startY;
    const max = Math.max(60, size.h * 0.6);
    paneH[paneDrag.id] = Math.min(max, Math.max(28, paneDrag.startH - dy));
    if (paneDrag.above !== "price") paneH[paneDrag.above] = Math.min(max, Math.max(28, paneDrag.aboveH + dy));
    redraw();
    return;
  }
  if (!pointers.size && e.pointerType === "mouse") canvas.classList.toggle("row-resize", !!borderAt(layout(), e.clientX - rect.left, e.clientY - rect.top));
  if (pointers.has(e.pointerId)) {
    const last = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const factor = (pinch.barW * (Math.abs(a.x - b.x) / (pinch.dist || 1))) / view.barW;
      zoomAt(factor, (a.x + b.x) / 2 - rect.left);
      return;
    }
    if (dragAxis) {
      // Dragging the price axis up stretches prices, down compresses them.
      zoomY(Math.exp((last.y - e.clientY) * 0.01));
      return;
    }
    view.end -= (e.clientX - last.x) / view.barW;
    if (e.clientX !== last.x) view.follow = false;
    // Dragging the price chart up or down frees the price scale, as on other charting tools; a
    // few pixels of wobble while panning sideways do not.
    if (drag?.inPrice && lastAuto) {
      drag.dy += e.clientY - last.y;
      if (view.yRange || Math.abs(drag.dy) > 12) {
        const range = view.yRange ?? lastAuto;
        const shift = (view.yRange ? e.clientY - last.y : drag.dy) * lastPricePerPx;
        view.yRange = { lo: range.lo + shift, hi: range.hi + shift };
      }
    }
    clampView();
  }
  // A finger dragging the chart pans it; the crosshair stays where it was tapped.
  if (e.pointerType !== "touch") hoverAt(e.clientX, e.clientY);
  redraw();
});
const release = (e) => {
  if (paneDrag) {
    paneDrag = null;
    savePanes();
  }
  // Panning back to the newest bar resumes following it.
  if (drag && view.end >= bars.length) view.follow = true;
  drag = null;
  if (e.type === "pointerup" && tap?.id === e.pointerId) {
    hoverAt(e.clientX, e.clientY);
    pinnedT = bars[hover.i]?.t ?? null;
    redraw();
  }
  tap = null;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("pointerleave", (e) => {
  if (e.pointerType !== "touch" && !pointers.size) {
    // Leaving the chart falls back to the pinned bar, so the share menu can still link to it.
    const i = pinnedIndex();
    hover = i >= 0 ? { i, y: -1 } : null;
    redraw();
  }
});

$("zoom-in").addEventListener("click", () => zoomAt(1.4, layout().plotW));
$("zoom-out").addEventListener("click", () => zoomAt(1 / 1.4, layout().plotW));
$("latest").addEventListener("click", () => {
  pinnedT = null;
  hover = null;
  view.follow = true;
  view.end = bars.length + RIGHT_PAD;
  resetY();
});
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    view.end += (e.key === "ArrowLeft" ? -10 : 10) * (14 / view.barW);
    view.follow = view.end >= bars.length;
    clampView();
    redraw();
  } else if (e.key === "+" || e.key === "=") zoomAt(1.25, layout().plotW);
  else if (e.key === "-") zoomAt(0.8, layout().plotW);
});

function rebuild() {
  view.yRange = null;
  // A new timeframe changes every index; keep the same moment at the right edge.
  const anchorT = bars[Math.min(bars.length - 1, Math.floor(view.end))]?.t;
  build();
  if (view.follow) view.end = bars.length + RIGHT_PAD;
  else if (anchorT != null) {
    const idx = bars.findIndex((b) => b.t >= anchorT);
    view.end = (idx < 0 ? bars.length : idx) + 1;
  }
  // Bar indices change with the timeframe; keep the pinned time selected.
  const pin = pinnedIndex();
  hover = pin >= 0 ? { i: pin, y: -1 } : null;
  clampView();
  redraw();
}
ui.tf.addEventListener("change", rebuild);
ui.tick.addEventListener("change", rebuild);
ui.mode.addEventListener("change", redraw);
ui.unit.addEventListener("change", rebuild);
new ResizeObserver(resize).observe(canvas);

// ---------- direct exchange streams ----------

const stream = {
  start: Math.floor(Date.now() / 60_000) * 60_000,
  bars: new Map(), // minute → { o, h, l, c, levels: Map(bin → [buy, sell]) }
  lastTrade: 0,
  oi: null,
  ticker: {},
  book: new OrderBook(),
  firstTrade: 0, // prints after this come from the page's own stream, except in gaps
  gaps: new StreamGaps(),
};

function addPrint(p) {
  const key = p.join("|");
  if (prints.has(key)) return;
  prints.set(key, p);
  printsDirty = true;
}
const liqKeys = new Set();

function mergeLiquidations(rows) {
  let added = false;
  for (const r of rows) {
    const key = r.join("|");
    if (liqKeys.has(key)) continue;
    liqKeys.add(key);
    liqs.push(r);
    added = true;
  }
  return added;
}

let refreshTimer = 0;
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = 0;
    refresh(false);
  }, 300);
}

// Returns resume(), which recycles the socket if it went quiet, e.g. while a phone kept the
// page in the background.
function connectWs(url, { onOpen, onMessage, ping: pingText }) {
  let delay = 1000;
  let ws;
  let lastMessage = Date.now();
  const open = () => {
    ws = new WebSocket(url);
    let ping;
    // Recycle sockets that hang or go silent after a network drop.
    lastMessage = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastMessage > 45_000) {
        ws.close();
        if (ws.readyState !== WebSocket.CLOSED) ws.onclose?.();
      }
    }, 10_000);
    ws.onopen = () => {
      delay = 1000;
      onOpen?.(ws);
      if (pingText) ping = setInterval(() => ws.send(pingText), 20_000);
    };
    ws.onmessage = (e) => {
      lastMessage = Date.now();
      if (e.data === "pong") return;
      try {
        onMessage(JSON.parse(e.data));
      } catch {}
    };
    ws.onclose = () => {
      clearInterval(ping);
      clearInterval(watchdog);
      ws.onclose = null;
      setTimeout(open, delay);
      delay = Math.min(30_000, delay * 2);
    };
  };
  open();
  return () => {
    if (Date.now() - lastMessage < 5_000 || ws.readyState !== WebSocket.OPEN) return;
    delay = 1000;
    ws.close();
    ws.onclose?.();
  };
}

function onTrade(tr) {
  stream.gaps.trade(tr.t);
  addTrade(stream.bars, tr, TICK);
  stream.lastTrade = Date.now();
  scheduleRefresh();
}

function snapshotBook() {
  const col = stream.book.column();
  if (!col) return;
  const now = Date.now();
  const minute = Math.floor(now / 60_000) * 60_000;
  heatCols.set(minute, [minute, ...col]);
  const slot = Math.floor(now / BOOK_STEP_MS) * BOOK_STEP_MS;
  const fine = stream.book.span(BOOK_TICK);
  if (fine) fineCols.set(slot, [slot, ...fine]);
  redraw();
}

function startStreams() {
  const resumeBybit = connectWs(WS_URL, {
    ping: PING,
    onOpen: (ws) => {
      stream.gaps.reconnect();
      stream.book.reset();
      ws.send(JSON.stringify({ op: "subscribe", args: [TRADE_TOPIC, BOOK_TOPIC, TICKER_TOPIC] }));
    },
    onMessage: (m) => {
      if (m.topic === TRADE_TOPIC) {
        const trades = parseTrades(m);
        for (const tr of trades) onTrade(tr);
        if (!stream.firstTrade && trades.length) stream.firstTrade = trades[0].t;
        for (const p of groupPrints(trades)) if (p[3] >= PRINT_MIN) addPrint(p);
      }
      else if (m.topic === BOOK_TOPIC) stream.book.apply(m);
      else if (m.topic === TICKER_TOPIC) stream.oi = applyTicker(stream.ticker, m).oi ?? null;
    },
  });
  for (const feed of LIQ_FEEDS) {
    connectWs(feed.url, {
      ping: feed.ping,
      onOpen: (ws) => feed.subscribe && ws.send(JSON.stringify(feed.subscribe)),
      onMessage: (m) => mergeLiquidations(feed.parse(m)) && scheduleRefresh(),
    });
  }
  setInterval(snapshotBook, 1_000);
  // Phones suspend background pages: on return, catch up from the collector and reconnect.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    resumeBybit();
    if (staleWhileHidden) (staleWhileHidden = false), refresh(true);
    pollRecent();
  });
  // A long-open page keeps only the recent half day of fine book columns; older chunks reload on demand.
  setInterval(() => {
    const keep = Date.now() - 12 * 3_600_000;
    for (const t of fineCols.keys()) if (t < keep) fineCols.delete(t);
    for (const c of fineChunks.keys()) if (c + BOOK_CHUNK_MS < keep) fineChunks.delete(c);
  }, 60_000);
}

// ---------- live ----------

let staleWhileHidden = false;
function refresh(full = true) {
  // A phone keeps background pages running for a while; do the work once it is visible again.
  if (document.hidden) {
    staleWhileHidden = true;
    return;
  }
  const following = view.follow;
  // Not following: keep the same moment at the same place, fraction of a bar included. Snapping
  // to a whole bar and adding one on every update used to creep the view toward the newest bar.
  const anchorI = Math.min(bars.length - 1, Math.floor(view.end));
  const anchorT = bars[anchorI]?.t;
  const offset = view.end - anchorI;
  if (full) build();
  else buildTail();
  if (following) view.end = bars.length + RIGHT_PAD;
  else if (anchorT != null) {
    const idx = bars.findIndex((b) => b.t >= anchorT);
    if (idx >= 0) view.end = idx + offset;
  }
  clampView();
  redraw();
}

function showLive() {
  if (Date.now() - stream.lastTrade < 5_000) {
    ui.live.textContent = "即時 · 直連 Bybit";
    ui.live.dataset.state = "on";
    return;
  }
  const lastTrade = server?.status?.lastTrade;
  if (!lastTrade) {
    ui.live.textContent = "僅歷史資料";
    ui.live.dataset.state = "off";
    return;
  }
  const age = Math.round((Date.now() - lastTrade) / 1000);
  const stale = age > 30;
  ui.live.textContent = stale ? `即時資料中斷（${age} 秒前）` : `即時 · 收集器 ${age} 秒前`;
  ui.live.dataset.state = stale ? "stale" : "on";
}

// Returns whether anything older than the forming bar changed, which needs a full build.
function ingest(d) {
  const tail = bars.at(-1)?.t ?? Infinity;
  let older = d.metrics.some((m) => !store.metrics.has(m[0])) || d.liquidations.some((l) => l[0] < tail);
  for (const r of d.bars) {
    if (r[0] < tail && JSON.stringify(store.bars.get(r[0])) !== JSON.stringify(r)) older = true;
    store.bars.set(r[0], r);
  }
  for (const m of d.metrics) store.metrics.set(m[0], m);
  // Columns this page built from its own stream are newer; keep them.
  for (const c of d.heat) if (c[0] <= stream.start || !heatCols.has(c[0])) heatCols.set(c[0], c);
  mergeLiquidations(d.liquidations);
  for (const p of d.prints ?? []) if (!stream.firstTrade || p[0] < stream.firstTrade || stream.gaps.covers(p[0], p[0] + 1)) addPrint(p);
  return older;
}

const utcDay = (t) => new Date(t).toISOString().slice(0, 10);

async function loadDays() {
  const today = Math.floor(Date.now() / DAY) * DAY;
  const days = [];
  for (let k = DAYS - 1; k >= 1; k--) days.push(utcDay(today - k * DAY));
  const results = await Promise.all(days.map((d) => fetch(`${API}/day?d=${d}`).then((res) => (res.ok ? res.json() : null), () => null)));
  for (const d of results) if (d) ingest(d);
  recentSince = today;
  await pollRecent();
}

async function pollRecent() {
  try {
    const res = await fetch(`${API}/recent?since=${recentSince}`);
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    const older = ingest(d);
    server = { updated: d.updated, status: d.status };
    // Re-read the last two minutes each time; minute-aligned URLs let viewers share the edge cache.
    const last = d.bars.at(-1)?.[0];
    if (last) recentSince = Math.max(recentSince, last - 2 * MINUTE);
    if (bars.length) refresh(older);
  } catch {
    // Collector unreachable: the page keeps what it has and its own Bybit stream.
  }
  showLive();
}

function buildIndicatorPanel() {
  for (const [id, where, label] of INDICATORS) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = on(id);
    box.addEventListener("change", () => {
      prefs.show[id] = box.checked;
      savePrefs();
      if (id === "lmap") updateLiqMap(true);
      if (id === "events") {
        eventsKey = "";
        updateEvents();
      }
      redraw();
    });
    const row = document.createElement("label");
    row.className = "check";
    row.append(box, label);
    $(`ind-${where}`).append(row);
  }
  // Tapping anywhere else closes the menu, which covers most of a phone screen.
  const menu = document.querySelector(".ind");
  document.addEventListener("pointerdown", (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
  ui.printMin.value = String(prefs.printMin);
  ui.printMin.addEventListener("change", () => {
    prefs.printMin = Number(ui.printMin.value);
    savePrefs();
    redraw();
  });
}
buildIndicatorPanel();

// Timeframe and chart-type buttons set the hidden selects the chart reads.
function bindSegment(selector, select, attr) {
  const buttons = [...document.querySelectorAll(selector)];
  const sync = () => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === select.value)));
  for (const b of buttons)
    b.addEventListener("click", () => {
      if (select.value === b.dataset[attr]) return;
      select.value = b.dataset[attr];
      select.dispatchEvent(new Event("change"));
      sync();
    });
  sync();
}
bindSegment("[data-tf]", ui.tf, "tf");
bindSegment("[data-mode]", ui.mode, "mode");

// ---------- sharing ----------

// The link reproduces timeframe, chart mode, indicators, print size and the selected bar; with no
// bar selected it opens live.
function shareUrl() {
  const url = new URL("/lab/orderflow/", location.origin);
  url.searchParams.set("tf", ui.tf.value);
  if (ui.mode.value !== "candles") url.searchParams.set("mode", ui.mode.value);
  const b = hover ? bars[hover.i] : null;
  if (b && b.end <= Date.now()) url.searchParams.set("at", String(b.t));
  url.searchParams.set("ind", INDICATORS.map(([id]) => id).filter(on).join(","));
  url.searchParams.set("pm", String(prefs.printMin));
  return url.href;
}

function shareText() {
  const b = hover ? bars[hover.i] : null;
  return b && b.end <= Date.now() ? `BTC 訂單流 ${fmtTime(b.t)}（MetaBear）` : "BTC 即時訂單流（MetaBear）";
}

const sharePanel = document.querySelector(".share");
sharePanel.addEventListener("toggle", () => {
  if (!sharePanel.open) return;
  $("share-url").value = shareUrl();
  $("share-line").href = `https://line.me/R/share?text=${encodeURIComponent(`${shareText()}\n${shareUrl()}`)}`;
  $("share-note").textContent = hover && bars[hover.i]?.end <= Date.now() ? `連結會打開 ${fmtTime(bars[hover.i].t)} 這根 K 棒。` : "沒有選 K 棒，連結會打開即時畫面。";
});
document.addEventListener("pointerdown", (e) => {
  if (sharePanel.open && !sharePanel.contains(e.target)) sharePanel.open = false;
});
$("share-copy").addEventListener("click", async () => {
  const input = $("share-url");
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand("copy");
  }
  $("share-copy").textContent = "已複製";
  setTimeout(() => ($("share-copy").textContent = "複製連結"), 1600);
});

// ---------- replay ----------

// Screen x of a moment, within its bar; null outside the loaded bars.
function xAtTime(t, L) {
  const tfMs = Number(ui.tf.value) * MINUTE;
  const i = barIndex.get(Math.floor(t / tfMs) * tfMs);
  if (i == null) return t >= (bars.at(-1)?.end ?? Infinity) ? L.plotW : null;
  return xOf(i, L) + ((t - bars[i].t) / tfMs) * view.barW;
}

function drawReplay(L, P, yOf, lastPrice) {
  drawOverlay(replay.player, { ctx, plotW: L.plotW, axisW: L.axisW, top: P.y, bottom: P.y + P.h, xAt: (t) => xAtTime(t, L), barW: view.barW, yOf, font: MONO, fmtPrice, last: lastPrice });
  ctx.font = `11px ${MONO}`;
  ctx.textBaseline = "bottom";
  ctx.fillStyle = C.dim;
  ctx.fillText(`歷史資料回放 · ${replay.raw.source} · 非投資建議`, 10, P.y + P.h - 8);
  const cap = $("caption");
  // Under the replay controls (or the top edge when recording), clear of the newest bars' prices.
  cap.style.top = `${Math.round(P.y + (document.body.classList.contains("rec") ? 14 : 56))}px`;
}

// Puts what a live viewer would have had at the replay clock into the chart's stores.
function replayFeed() {
  const { player, prepared, raw } = replay;
  const sec = Math.floor(player.t / 1000);
  if (sec === replay.sec) return false;
  if (sec < replay.sec) {
    prints.clear();
    printsDirty = true;
    store.metrics.clear();
    replay.printsN = 0;
    replay.readingsN = 0;
  }
  replay.sec = sec;
  store.bars = new Map(prepared.rowsUntil(player.t).map((r) => [r[0], r]));
  const pn = prepared.printsUntil(player.t);
  for (; replay.printsN < pn; replay.printsN++) addPrint(raw.prints[replay.printsN]);
  const rn = prepared.readingsUntil(player.t);
  for (; replay.readingsN < rn; replay.readingsN++) store.metrics.set(raw.metrics[replay.readingsN][0], raw.metrics[replay.readingsN]);
  return true;
}

// The script's view steps: timeframe, chart type, bar width and indicators.
function replayView() {
  const v = replay.player.state.view;
  const key = JSON.stringify(v);
  if (key === replay.viewKey) return;
  replay.viewKey = key;
  if (v.ind) for (const [id, shown] of Object.entries(v.ind)) if (id in prefs.show) prefs.show[id] = !!shown;
  if (v.printMin) prefs.printMin = v.printMin;
  if (v.mode && ui.mode.value !== v.mode) document.querySelector(`[data-mode="${v.mode}"]`)?.click();
  if (v.tf && ui.tf.value !== String(v.tf)) document.querySelector(`[data-tf="${v.tf}"]`)?.click();
  if (v.barW) {
    // Scripts are written for a desktop-wide chart; narrower screens scale bars down, keeping
    // footprint bars wide enough for their numbers.
    const scaled = v.barW * Math.min(1, layout().plotW / 1100);
    view.barW = ui.mode.value === "footprint" ? Math.max(64, scaled) : scaled;
    view.follow = true;
    view.end = bars.length + RIGHT_PAD;
    clampView();
  }
}

const taipeiClock = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
let seeking = false;

function replaySync() {
  const { player } = replay;
  const fed = replayFeed();
  if (fed) refresh(true);
  replayView();
  const s = player.state;
  const cap = $("caption");
  if (cap.textContent !== s.caption) cap.textContent = s.caption;
  cap.hidden = !s.caption;
  const speed = $("rp-speed");
  if (speed.value !== String(s.speed)) {
    if (![...speed.options].some((o) => o.value === String(s.speed))) speed.add(new Option(`${s.speed}×`, String(s.speed)));
    speed.value = String(s.speed);
  }
  $("rp-clock").textContent = taipeiClock.format(player.t).replace(/\s+/, " ");
  if (!seeking) $("rp-seek").value = String(Math.round(((player.t - player.data.start) / (player.data.end - player.data.start)) * 1000));
  ui.live.textContent = s.ended ? "回放結束" : replay.playing ? "歷史回放中" : "歷史回放 · 已暫停";
  if (!fed) redraw();
}

function setPlaying(playing) {
  if (playing && replay.player.state.ended) replay.player.restart();
  replay.playing = playing;
  $("rp-play").textContent = playing ? "❚❚" : "▶";
  $("rp-play").setAttribute("aria-label", playing ? "暫停" : "播放");
}

function replayLoop(now) {
  const dt = Math.min(250, now - replay.last);
  replay.last = now;
  if (replay.playing) {
    replay.player.advance(dt);
    if (replay.player.state.ended) setPlaying(false);
  }
  replaySync();
  requestAnimationFrame(replayLoop);
}

async function startReplay() {
  const load = (file) => fetch(`./cases/${file}`).then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))));
  const script = await load(`${CASE}.json`);
  const raw = await load(script.data ?? `${CASE}.data.json`);
  const prepared = prepare(raw);
  const player = new Player(script, prepared);
  replay = { player, prepared, raw, sec: -1, printsN: 0, readingsN: 0, playing: false, last: performance.now(), viewKey: "" };
  // Book heat and liquidation markers were not recorded for replays.
  prefs.show.heat = false;
  prefs.show.liqmark = false;
  prefs.show.liq = false;
  document.title = `${script.title ?? CASE} · MetaBear 回放`;
  ui.live.dataset.state = "replay";
  document.querySelector(".symbol small").textContent = "永續 · Binance";
  $("source").textContent = `資料：${raw.source} BTCUSDT 歷史逐筆成交，依原本的時間逐秒重播；足跡格距 $${raw.tick}。OI 為交易所每 5 分鐘的公開數據。這是過去行情的回放，不是即時資料，也不是投資建議。`;
  $("replay").hidden = false;
  replayFeed();
  build();
  ui.status.hidden = true;
  resize();
  if (!player.state.view.barW) view.barW = NARROW ? 9 : 14;
  replayView();
  view.end = bars.length + RIGHT_PAD;
  clampView();
  $("rp-play").addEventListener("click", () => setPlaying(!replay.playing));
  $("rp-restart").addEventListener("click", () => {
    player.restart();
    replay.viewKey = "";
    view.yRange = null;
  });
  $("rp-speed").addEventListener("change", (e) => (player.state.speed = Number(e.target.value)));
  const seek = $("rp-seek");
  seek.addEventListener("input", () => {
    seeking = true;
    player.seek(player.data.start + (Number(seek.value) / 1000) * (player.data.end - player.data.start));
    replay.viewKey = "";
  });
  seek.addEventListener("change", () => (seeking = false));
  window.addEventListener("keydown", (e) => {
    if (e.key !== " " || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
    setPlaying(!replay.playing);
  });
  if (query.get("rec") === "1") {
    document.body.classList.add("rec");
    resize();
    setTimeout(() => setPlaying(true), 1500);
  }
  requestAnimationFrame(replayLoop);
}

// ---------- boot ----------

if (CASE) {
  try {
    await startReplay();
  } catch {
    ui.status.textContent = `找不到回放案例「${CASE}」。`;
  }
} else {
  try {
    await loadDays();
    if (!store.bars.size) throw new Error("no data");
    $("source").textContent =
      "資料：Bybit BTCUSDT 永續合約（USDT 本位，僅單一交易所）。歷史足跡由 Bybit 每日成交封存檔重建，之後由 MetaBear 收集器即時記錄；" +
      "掛單熱力圖只有收集器啟動後的資料，且 Bybit 只提供現價上下約 0.25% 的掛單；1 分與 5 分 K 會顯示每 10 秒、$1 格距的細節。多空比是 Bybit 全體帳戶多空比。資料保留 30 天。" +
      "爆倉合併 Bybit（完整）、OKX 與幣安（每秒只推一筆，連環爆倉時會少算）；收集器只記錄 Bybit 與 OKX。";
    build();
    view.end = bars.length + RIGHT_PAD;
    view.barW = NARROW ? 9 : 14;
    ui.status.hidden = true;
    resize();
    // A shared bar is selected and placed about two thirds across the chart.
    const shared = SHARED_AT ? bars.findIndex((b) => b.t <= SHARED_AT && SHARED_AT < b.end) : -1;
    if (shared >= 0) {
      pinnedT = bars[shared].t;
      view.follow = false;
      hover = { i: shared, y: -1 };
      view.end = shared + 1 + (layout().plotW / view.barW) * 0.35;
    }
    clampView();
    redraw();
    updateReadout();
    startStreams();
    setInterval(pollRecent, 5_000);
    setInterval(showLive, 1_000);
  } catch {
    ui.status.textContent = "找不到資料。本機請先執行 npm run orderflow:dev，再用 npm run lab:orderflow:bybit 匯入歷史。";
  }
}
