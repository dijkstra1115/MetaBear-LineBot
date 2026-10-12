// BTC order-flow lab: footprint, volume profile, CVD, OI and long/short
// ratios drawn on one canvas from the dataset built by
// scripts/orderflow-data.mjs (1-minute bars with $10 price bins).

import { LIQ_EXCHANGES, LIQ_FEEDS } from "./liquidations.js";
import { BIN as MAP_BIN, buildLiqMap, stepAt } from "./liqmap.js";
import { SIGNALS, aggregate as aggregateSignals, detect } from "./signals.js";

const DATA_URL = "/lab/data/btcusdt.json";
const LIVE_URL = "/lab/data/btcusdt-live.json";
const HEAT_URL = "/lab/data/btcusdt-heatmap.json";
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
const ui = { events: $("events"), lmap: $("lmap"), tf: $("tf"), tick: $("tick"), mode: $("mode"), unit: $("unit"), profile: $("profile"), heat: $("heat"), liq: $("liq"), live: $("live"), readout: $("readout"), status: $("status") };

let raw = null; // archive dataset (complete days)
let live = null; // collector output: recent bars, metrics, liquidations
let heatCols = new Map(); // minute → [t, mid, lowBin, sizes]
let liqs = [];
let mergedRows = []; // 1-minute rows after merging archive, collector and stream
let mergedOi = []; // [t, OI in BTC]
let liqMap = null;
let liqMapAt = 0;
let events = []; // order-flow events on closed 5-minute bars
let eventsKey = "";
let bars = [];
let tick = 25;
const view = { end: 0, barW: 14, yScale: 1, yShift: 0 };
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

// ---------- data ----------

function build() {
  const tfMin = Number(ui.tf.value);
  const tfMs = tfMin * 60_000;
  tick = ui.tick.value === "auto" ? AUTO_TICK[tfMin] : Number(ui.tick.value);
  const baseTick = raw.tick;
  const groups = new Map();
  // The archive is authoritative; collector bars only extend past its last minute.
  const archiveEnd = raw.bars.at(-1)?.[0] ?? 0;
  const rows = new Map(raw.bars.map((r) => [r[0], r]));
  for (const r of live?.bars ?? []) if (r[0] > archiveEnd) rows.set(r[0], r);
  // Minutes streamed in full by this page win; the minute the page opened in is partial here.
  for (const [t, b] of stream.bars) if (t > archiveEnd && (t > stream.start || !rows.has(t))) rows.set(t, streamRow(t, b));
  mergedRows = [...rows.values()].sort((x, y) => x[0] - y[0]);
  for (const [t, o, h, l, c, levels, xbuy = 0, xsell = 0] of mergedRows) {
    const key = Math.floor(t / tfMs) * tfMs;
    let b = groups.get(key);
    if (!b) groups.set(key, (b = { t: key, o, h, l, c, map: new Map(), xbuy: 0, xsell: 0, partial: false }));
    if (h > b.h) b.h = h;
    if (l < b.l) b.l = l;
    b.c = c;
    // Kline-backfilled minutes have totals but no price levels.
    const k = usd() ? c : 1;
    b.xbuy += xbuy * k;
    b.xsell += xsell * k;
    if (!levels.length && (xbuy || xsell)) b.partial = true;
    for (let [bin, buy, sell] of levels) {
      const p = Math.floor((bin * baseTick) / tick) * tick;
      if (usd()) {
        // Notional at the bin midpoint; within ±$5 of the traded price.
        const mid = bin * baseTick + baseTick / 2;
        buy *= mid;
        sell *= mid;
      }
      const lv = b.map.get(p);
      if (lv) {
        lv[0] += buy;
        lv[1] += sell;
      } else b.map.set(p, [buy, sell]);
    }
  }
  const metricsByT = new Map(raw.metrics.map((r) => [r[0], r]));
  for (const r of live?.metrics ?? []) if (!metricsByT.has(r[0])) metricsByT.set(r[0], r);
  const metrics = [...metricsByT.values()].sort((x, y) => x[0] - y[0]);
  let m = 0;
  let cvd = 0;
  bars = [...groups.values()]
    .sort((a, b) => a.t - b.t)
    .map((b) => {
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
      // Latest metrics row published at or before the bar's close.
      const close = b.t + tfMs;
      while (m + 1 < metrics.length && metrics[m + 1][0] <= close) m++;
      const row = metrics[m] && metrics[m][0] <= close ? metrics[m] : null;
      return {
        t: b.t, end: close, partial: b.partial, o: b.o, h: b.h, l: b.l, c: b.c, levels, buy, sell, delta: buy - sell, cvd, poc: poc?.p,
        oi: row?.[usd() ? 2 : 1] ?? null, topPos: row?.[3] ?? null, global: row?.[5] ?? null,
      };
    });
  // Binance publishes OI every few seconds but ratios only every 5 minutes.
  const last = bars.at(-1);
  if (last && stream.oi && (!metrics.length || metrics.at(-1)[0] < last.t)) last.oi = usd() ? stream.oi * last.c : stream.oi;
  attachLiquidations(tfMs);
  mergedOi = metrics.filter((m) => m[1] != null).map((m) => [m[0], m[1]]);
  if (stream.oi && mergedOi.length && Date.now() > mergedOi.at(-1)[0] + 30_000) mergedOi.push([Date.now(), stream.oi]);
  updateLiqMap(false);
  updateEvents();
}

function updateEvents() {
  if (!ui.events.checked) return;
  // Detection runs on its own closed 5-minute bars, whatever the chart shows; only
  // redo it when a new 5-minute bar has closed.
  const now = Date.now();
  const key = `${mergedRows.length}:${Math.floor(now / 300_000)}`;
  if (key === eventsKey) return;
  eventsKey = key;
  events = detect(aggregateSignals(mergedRows, raw.tick, mergedOi, now));
}

function eventsIn(b) {
  return events.filter((e) => e.t > b.t && e.t <= b.end);
}

function updateLiqMap(force) {
  if (!ui.lmap.checked) return;
  // The model replays every interval; refreshing it every 10 s is plenty.
  if (!force && Date.now() - liqMapAt < 10_000) return;
  liqMapAt = Date.now();
  liqMap = buildLiqMap(mergedRows, raw.tick, mergedOi);
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

function layout() {
  const axisW = 74;
  const timeH = 24;
  const plotW = size.w - axisW;
  const avail = size.h - timeH;
  const sub = Math.max(52, Math.round(avail * 0.12));
  const priceH = avail - sub * 4;
  const panes = {
    price: { y: 0, h: priceH },
    cvd: { y: priceH, h: sub, label: "CVD", key: "cvd" },
    liq: { y: priceH + sub, h: sub, label: "爆倉 (USD)" },
    oi: { y: priceH + sub * 2, h: sub, label: `OI (${usd() ? "USD" : "BTC"})`, key: "oi" },
    ratio: { y: priceH + sub * 3, h: sub, label: "大戶持倉比", key: "topPos" },
  };
  return { axisW, timeH, plotW, panes, timeY: avail };
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
  view.end = Math.min(bars.length + 8, Math.max(8, view.end));
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
  for (const key of ["cvd", "oi", "ratio"]) drawSub(L, L.panes[key], from, to);
  drawLiqPane(L, L.panes.liq, from, to);
  drawTimeAxis(L, from, to);
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
  const pad = (hi - lo) * 0.04 || tick;
  lo -= pad;
  hi += pad;
  // Manual vertical scale: yScale > 1 zooms into prices, yShift pans them.
  const mid = (lo + hi) / 2 + view.yShift;
  const half = (hi - lo) / 2 / view.yScale;
  lo = mid - half;
  hi = mid + half;
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

  if (ui.heat.checked && heatCols.size) drawHeat(L, from, to, yOf);
  if (ui.lmap.checked && liqMap) drawLiqMap(L, from, to, yOf);
  if (ui.lmap.checked && liqMap) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, P.y, L.plotW, P.h);
    ctx.clip();
    drawLiqProfile(L, yOf);
    ctx.restore();
  } else if (ui.profile.checked) {
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
  if (ui.liq.checked) drawLiquidations(L, from, to, yOf);
  if (ui.events.checked) drawEvents(L, from, to, yOf);
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
  const bin = raw.tick;
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

function drawLiquidations(L, from, to, yOf) {
  for (let i = from; i <= to; i++) {
    const liq = bars[i].liq;
    if (!liq) continue;
    const cx = xOf(i, L) + view.barW / 2;
    for (const side of ["long", "short"]) {
      const s = liq[side];
      if (s.usd < 20_000) continue;
      const r = Math.min(22, Math.max(3, Math.sqrt(s.usd) / 90));
      ctx.beginPath();
      ctx.arc(cx, yOf(s.pq / s.q), r, 0, Math.PI * 2);
      // Longs are force-sold (amber), shorts force-bought (mint).
      ctx.fillStyle = side === "long" ? "rgba(240,154,90,0.35)" : "rgba(120,225,213,0.35)";
      ctx.strokeStyle = side === "long" ? C.sell : C.buy;
      ctx.fill();
      ctx.stroke();
    }
  }
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
  ctx.fillText(P.label, 8, P.y + 6);
  const labelW = ctx.measureText(P.label).width;
  ctx.fillStyle = C.buy;
  ctx.fillText("▲ 空單", 8 + labelW + 10, P.y + 6);
  ctx.fillStyle = C.sell;
  ctx.fillText("▼ 多單", 8 + labelW + 64, P.y + 6);
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
  ctx.fillText(P.label, 8, P.y + 6);
  if (P.key === "topPos") {
    ctx.fillStyle = C.dim;
    ctx.fillText("— 全體帳戶多空比", 8 + ctx.measureText(P.label).width + 10, P.y + 6);
  }
  ctx.textBaseline = "middle";
  if (!Number.isFinite(lo)) return;
  if (P.key === "topPos") {
    for (let i = from; i <= to; i++) {
      const g = bars[i].global;
      if (g != null) {
        lo = Math.min(lo, g);
        hi = Math.max(hi, g);
      }
    }
  }
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
  if (P.key === "topPos" && lo < 1 && hi > 1) {
    const y = Math.round(yOf(1)) + 0.5;
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
  if (P.key === "topPos") line("global", C.dim, 1.2);
  line(P.key, P.key === "cvd" ? C.buy : C.gold, 1.6);
  ctx.restore();

  ctx.fillStyle = C.muted;
  const fmt = (v) => (P.key === "topPos" ? v.toFixed(2) : P.key === "oi" ? fmtVol(v) : fmtSigned(v));
  ctx.fillText(fmt(hi - pad), L.plotW + 8, yOf(hi - pad));
  ctx.fillText(fmt(lo + pad), L.plotW + 8, yOf(lo + pad));
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
    ctx.fillText(fmtPrice(P.pOf(hover.y)), L.plotW + 8, hover.y);
  }
}

function liqHint() {
  if (!ui.lmap.checked || !liqMap || !hover) return "";
  const P = pricePane;
  if (!P || hover.y <= P.y || hover.y >= P.y + P.h) return "";
  const p = P.pOf(hover.y);
  const est = liqUntil(p);
  if (!est) return "";
  const cls = est.down ? "sell" : "buy";
  return `估算：${est.down ? "跌" : "漲"}到 ${fmtPrice(Math.round(p))} 累計${est.down ? "多單" : "空單"}強平 <span class="${cls}">${fmtVol(est.usd)}</span> USD`;
}

function updateReadout() {
  const b = bars[hover?.i ?? bars.length - 1];
  if (!b) return;
  const span = (cls, v) => `<span class="${cls}">${v}</span>`;
  ui.readout.innerHTML = [
    `<b>${fmtTime(b.t)}</b>`,
    `開 ${fmtPrice(b.o)} 高 ${fmtPrice(b.h)} 低 ${fmtPrice(b.l)} 收 <b>${fmtPrice(b.c)}</b>`,
    `買 ${span("buy", fmtVol(b.buy))} 賣 ${span("sell", fmtVol(b.sell))} Δ ${span(b.delta >= 0 ? "buy" : "sell", fmtSigned(b.delta))}`,
    `CVD ${fmtSigned(b.cvd)}`,
    b.oi != null ? `OI ${fmtVol(b.oi)} ${usd() ? "USD" : "BTC"}` : "",
    b.topPos != null ? `大戶持倉比 ${span("gold", b.topPos.toFixed(2))} 全體 ${b.global.toFixed(2)}` : "",
    b.liq
      ? `爆倉 多 ${span("sell", fmtVol(b.liq.long.usd))} 空 ${span("buy", fmtVol(b.liq.short.usd))} USD（${Object.entries(b.liq.byEx).map(([ex, v]) => `${LIQ_EXCHANGES[ex] ?? ex} ${fmtVol(v)}`).join("、")}）`
      : "",
    b.partial ? "（部分分鐘無足跡）" : "",
    liqHint(),
    ...(ui.events.checked
      ? eventsIn(b).map((e) => `<span class="${e.dir === "up" ? "buy" : e.dir === "down" ? "sell" : "gold"}">${SIGNALS[e.kind].name}</span> ${e.note}`)
      : []),
  ]
    .filter(Boolean)
    .join("　");
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
      clampView();
      redraw();
    } else zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, Math.min(e.clientX - rect.left, layout().plotW));
  },
  { passive: false },
);

function zoomY(factor) {
  view.yScale = Math.min(40, Math.max(0.5, view.yScale * factor));
  redraw();
}
function resetY() {
  view.yScale = 1;
  view.yShift = 0;
  redraw();
}

const pointers = new Map();
let pinch = null;
let dragAxis = false;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const L = layout();
  const rect = canvas.getBoundingClientRect();
  const y = e.clientY - rect.top;
  dragAxis = pointers.size === 1 && e.clientX - rect.left > L.plotW && y < L.panes.price.h;
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
  const x = e.clientX - rect.left;
  const L = layout();
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
    // Vertical panning only makes sense once the price scale is manual.
    if (view.yScale !== 1 || view.yShift !== 0) view.yShift += (e.clientY - last.y) * lastPricePerPx;
    clampView();
  }
  hover = { i: Math.floor(view.end - (L.plotW - x) / view.barW), y: e.clientY - rect.top };
  redraw();
});
const release = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("pointerleave", () => {
  if (!pointers.size) {
    hover = null;
    redraw();
  }
});

$("zoom-in").addEventListener("click", () => zoomAt(1.4, layout().plotW));
$("zoom-out").addEventListener("click", () => zoomAt(1 / 1.4, layout().plotW));
$("latest").addEventListener("click", () => {
  view.end = bars.length + 2;
  resetY();
});
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    view.end += (e.key === "ArrowLeft" ? -10 : 10) * (14 / view.barW);
    clampView();
    redraw();
  } else if (e.key === "+" || e.key === "=") zoomAt(1.25, layout().plotW);
  else if (e.key === "-") zoomAt(0.8, layout().plotW);
});

function rebuild() {
  view.yScale = 1;
  view.yShift = 0;
  const anchorT = bars[Math.min(bars.length - 1, Math.floor(view.end))]?.t;
  build();
  if (anchorT != null) {
    const idx = bars.findIndex((b) => b.t >= anchorT);
    view.end = (idx < 0 ? bars.length : idx) + 1;
  }
  clampView();
  redraw();
}
ui.tf.addEventListener("change", rebuild);
ui.tick.addEventListener("change", rebuild);
ui.profile.addEventListener("change", redraw);
ui.mode.addEventListener("change", redraw);
ui.unit.addEventListener("change", rebuild);
new ResizeObserver(resize).observe(canvas);

// ---------- direct exchange streams ----------

const stream = {
  start: Math.floor(Date.now() / 60_000) * 60_000,
  bars: new Map(), // minute → { o, h, l, c, levels: Map(bin → [buy, sell]) }
  lastTrade: 0,
  oi: null,
  book: { bids: new Map(), asks: new Map(), lastU: 0, ready: false, needFirst: false, buffer: [], syncing: false },
};
const liqKeys = new Set();

function streamRow(t, b) {
  return [t, b.o, b.h, b.l, b.c, [...b.levels.entries()].map(([bin, [buy, sell]]) => [bin, buy, sell])];
}

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
    refresh();
  }, 300);
}

function connectWs(url, { onOpen, onMessage, ping: pingText }) {
  let delay = 1000;
  const open = () => {
    const ws = new WebSocket(url);
    let ping;
    // Recycle sockets that hang or go silent after a network drop.
    let lastMessage = Date.now();
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
}

function onTrade(d) {
  const price = Number(d.p);
  const minute = Math.floor(d.T / 60_000) * 60_000;
  let b = stream.bars.get(minute);
  if (!b) stream.bars.set(minute, (b = { o: price, h: price, l: price, c: price, levels: new Map() }));
  if (price > b.h) b.h = price;
  if (price < b.l) b.l = price;
  b.c = price;
  const bin = Math.floor(price / raw.tick);
  let lv = b.levels.get(bin);
  if (!lv) b.levels.set(bin, (lv = [0, 0]));
  lv[d.m ? 1 : 0] += Number(d.q);
  stream.lastTrade = Date.now();
  scheduleRefresh();
}

// Local order book, maintained the way Binance documents for diff depth streams.
async function syncBook() {
  const book = stream.book;
  if (book.syncing) return;
  book.syncing = true;
  book.ready = false;
  try {
    const res = await fetch("https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=1000");
    const snap = await res.json();
    book.bids = new Map(snap.bids.map(([p, q]) => [Number(p), Number(q)]));
    book.asks = new Map(snap.asks.map(([p, q]) => [Number(p), Number(q)]));
    const pending = book.buffer.filter((e) => e.u >= snap.lastUpdateId);
    book.buffer = [];
    book.lastU = snap.lastUpdateId;
    book.ready = true;
    book.needFirst = true;
    for (const e of pending) applyDepth(e);
  } catch {
    setTimeout(syncBook, 3000);
  } finally {
    book.syncing = false;
  }
}

function applyDepth(e) {
  const book = stream.book;
  if (!book.ready) {
    book.buffer.push(e);
    if (book.buffer.length > 2000) book.buffer.shift();
    return;
  }
  if (book.needFirst) {
    if (e.u < book.lastU) return;
    if (e.U > book.lastU) {
      book.buffer = [e];
      syncBook();
      return;
    }
    book.needFirst = false;
  } else if (e.pu !== book.lastU) {
    book.buffer = [e];
    syncBook();
    return;
  }
  for (const [p, q] of e.b) Number(q) === 0 ? book.bids.delete(Number(p)) : book.bids.set(Number(p), Number(q));
  for (const [p, q] of e.a) Number(q) === 0 ? book.asks.delete(Number(p)) : book.asks.set(Number(p), Number(q));
  book.lastU = e.u;
}

function snapshotBook() {
  const book = stream.book;
  if (!book.ready || !book.bids.size || !book.asks.size) return;
  let bid = -Infinity;
  let ask = Infinity;
  for (const p of book.bids.keys()) if (p > bid) bid = p;
  for (const p of book.asks.keys()) if (p < ask) ask = p;
  const mid = (bid + ask) / 2;
  const lowBin = Math.floor((mid * 0.98) / raw.tick);
  const sizes = new Array(Math.floor((mid * 1.02) / raw.tick) - lowBin + 1).fill(0);
  for (const side of [book.bids, book.asks])
    for (const [p, q] of side) {
      const i = Math.floor(p / raw.tick) - lowBin;
      if (i >= 0 && i < sizes.length) sizes[i] += q;
    }
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  heatCols.set(minute, [minute, mid, lowBin, sizes]);
  redraw();
}

function startStreams() {
  connectWs("wss://fstream.binance.com/market/stream?streams=btcusdt@aggTrade", {
    onMessage: (m) => m.data?.e === "aggTrade" && onTrade(m.data),
  });
  connectWs("wss://fstream.binance.com/public/stream?streams=btcusdt@depth@100ms", {
    onOpen: () => {
      stream.book.buffer = [];
      syncBook();
    },
    onMessage: (m) => m.data?.e === "depthUpdate" && applyDepth(m.data),
  });
  for (const feed of LIQ_FEEDS) {
    connectWs(feed.url, {
      ping: feed.ping,
      onOpen: (ws) => feed.subscribe && ws.send(JSON.stringify(feed.subscribe)),
      onMessage: (m) => mergeLiquidations(feed.parse(m)) && scheduleRefresh(),
    });
  }
  setInterval(snapshotBook, 1_000);
  const pollOi = async () => {
    try {
      const r = await (await fetch("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT")).json();
      stream.oi = Number(r.openInterest);
    } catch {}
  };
  pollOi();
  setInterval(pollOi, 10_000);
}

// ---------- live ----------

function refresh() {
  // Keep following the newest bar if the view was already at the right edge.
  const following = view.end >= bars.length - 1;
  const anchorT = bars[Math.min(bars.length - 1, Math.floor(view.end))]?.t;
  build();
  if (following) view.end = bars.length + 2;
  else if (anchorT != null) view.end = bars.findIndex((b) => b.t >= anchorT) + 1;
  clampView();
  redraw();
}

function showLive() {
  if (Date.now() - stream.lastTrade < 5_000) {
    ui.live.textContent = "即時 · 直連交易所";
    ui.live.dataset.state = "on";
    return;
  }
  if (!live) {
    ui.live.textContent = "僅歷史資料";
    ui.live.dataset.state = "off";
    return;
  }
  const age = Math.round((Date.now() - live.updated) / 1000);
  const stale = age > 30;
  ui.live.textContent = stale ? `即時資料中斷（${age} 秒前）` : `即時 · ${age} 秒前更新`;
  ui.live.dataset.state = stale ? "stale" : "on";
}

async function pollLive() {
  try {
    const res = await fetch(LIVE_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    live = await res.json();
    mergeLiquidations(live.liquidations ?? []);
    refresh();
  } catch {
    // Collector not running: the page keeps working from the archive.
  }
  showLive();
}

async function pollHeat() {
  try {
    const res = await fetch(HEAT_URL, { cache: "no-store" });
    if (!res.ok) return;
    const heat = await res.json();
    // Columns this page built from its own stream are newer; keep them.
    for (const c of heat.columns) if (c[0] <= stream.start || !heatCols.has(c[0])) heatCols.set(c[0], c);
    redraw();
  } catch {}
}

ui.heat.addEventListener("change", redraw);
ui.events.addEventListener("change", () => {
  eventsKey = "";
  updateEvents();
  redraw();
});
ui.lmap.addEventListener("change", () => {
  updateLiqMap(true);
  redraw();
});
ui.liq.addEventListener("change", redraw);

// ---------- boot ----------

try {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  raw = res.ok ? await res.json() : { tick: 10, bars: [], metrics: [] };
  await Promise.all([pollLive(), pollHeat()]);
  if (!raw.bars.length && !live) throw new Error("no data");
  $("source").textContent =
    "資料：幣安 BTCUSDT 永續合約（USDT 本位，僅單一交易所，未含 BTCUSD 幣本位合約與其他交易所）" +
    (raw.from ? `；歷史 ${raw.from} 至 ${raw.to}（UTC）` : "") +
    "；之後的資料來自本機收集器，收集器啟動前的分鐘只有 K 線與主動買賣量，沒有足跡。爆倉合併 Bybit（完整）、OKX 與幣安（每秒只推一筆，連環爆倉時會少算）。";
  build();
  view.end = bars.length + 2;
  view.barW = 14;
  clampView();
  ui.status.hidden = true;
  resize();
  updateReadout();
  startStreams();
  setInterval(pollLive, 5_000);
  setInterval(pollHeat, 30_000);
  setInterval(showLive, 1_000);
} catch {
  ui.status.textContent = "找不到資料。請先執行 npm run lab:orderflow -- --days 3，或啟動 npm run lab:orderflow:collect。";
}
