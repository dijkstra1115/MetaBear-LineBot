// Canvas chart for the sandbox: 1-minute candles over a liquidation-estimate or order-book heatmap,
// averages and VWAP, volume, CVD and open interest, the estimated liquidation map and a footprint
// column. With view.reveal the true crowd map (liquidations, stops, targets, stop entries) is drawn.
import { PRICE_TICK } from "./engine/book.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const labelPrice = (cents, digits = 0) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const btc = (lots) => (lots / 100).toLocaleString("en-US", { maximumFractionDigits: lots >= 1000 ? 0 : 1 });
const HEAT_COLD = [92, 64, 170];
const HEAT_HOT = [255, 214, 102];
const heat = (t, alpha) => `rgba(${HEAT_COLD.map((cold, index) => Math.round(cold + (HEAT_HOT[index] - cold) * t)).join(",")},${alpha.toFixed(3)})`;

export const PRICE_TAG = 70;
export const MIN_CANDLES = 4;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 20;
// Zoomed in this far, every candle gets its own footprint.
const FOOTPRINT_SLOT = 56;

// Simulated wall clock: the round opens at 09:00.
export function gameClock(time) {
  const seconds = ((9 * 3600 + time) % 86400 + 86400) % 86400;
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}`;
}

export function chartGeometry(canvas, sim, view = {}) {
  const rect = canvas.getBoundingClientRect();
  const all = sim.allCandles();
  const count = clamp(Math.round(view.count ?? 120), MIN_CANDLES, 360);
  const end = all.length;
  const candles = all.slice(Math.max(0, end - count), end);
  const last = sim.last;
  const rawLow = Math.min(last * 0.994, ...candles.map((candle) => candle.low));
  const rawHigh = Math.max(last * 1.006, ...candles.map((candle) => candle.high));
  const padding = (rawHigh - rawLow) * 0.06;
  let baseLow = rawLow - padding;
  let baseHigh = rawHigh + padding;
  // Sticky price axis: widens as soon as the price needs room, narrows only once the range shrank
  // well inside it, and holds while the pointer is over the plot so a click lands where it points.
  const frame = view.frame;
  if (frame) {
    const span = frame.high - frame.low;
    const onScreen = frame.low != null && last > frame.low + span * 0.03 && last < frame.high - span * 0.03;
    const fits = frame.low != null && baseLow >= frame.low && baseHigh <= frame.high && baseHigh - baseLow > span * 0.6;
    if ((frame.hold && onScreen) || fits) {
      baseLow = frame.low;
      baseHigh = frame.high;
    } else {
      frame.low = baseLow;
      frame.high = baseHigh;
    }
  }
  const span = (baseHigh - baseLow) / clamp(view.zoom ?? 1, MIN_ZOOM, MAX_ZOOM);
  const mid = (baseLow + baseHigh) / 2 + (view.offset ?? 0);
  const high = mid + span / 2;
  const low = mid - span / 2;
  const priceTop = 26;
  const priceBottom = rect.height * 0.7;
  const left = 70;
  const plotRight = rect.width - PRICE_TAG - 8;
  const y = (price) => priceTop + (high - price) / span * (priceBottom - priceTop);
  const slots = Math.max(MIN_CANDLES + 2, candles.length + 2);
  const xStep = (plotRight - left) / slots;
  const x = (index) => left + (index + 0.5) * xStep;
  return { rect, all, candles, first: end - candles.length, high, low, span, priceTop, priceBottom, left, plotRight, y, x, xStep };
}

// True over either price scale: the labels on the left or the last-price column on the right.
export function chartOnAxis(canvas, sim, view, clientX, clientY) {
  const scale = chartGeometry(canvas, sim, view);
  const localX = clientX - scale.rect.left;
  const localY = clientY - scale.rect.top;
  if (localY < scale.priceTop || localY > scale.priceBottom) return false;
  return localX < scale.left || localX > scale.plotRight;
}

export function chartPriceAt(canvas, sim, view, clientY) {
  const scale = chartGeometry(canvas, sim, view);
  const localY = clientY - scale.rect.top;
  if (localY < scale.priceTop || localY > scale.priceBottom) return null;
  const price = scale.high - (localY - scale.priceTop) / (scale.priceBottom - scale.priceTop) * scale.span;
  return clamp(Math.round(price / PRICE_TICK) * PRICE_TICK, PRICE_TICK, sim.book.maxPrice);
}

const placed = [];
function tag(ctx, text, x, y, fill, ink, align = "left") {
  ctx.font = "bold 10px Consolas, monospace";
  const width = ctx.measureText(text).width + 12;
  const left = align === "right" ? x - width : x;
  const clear = (top) => placed.every((rect) => left + width <= rect.left || left >= rect.left + rect.width || top + 18 <= rect.top || top >= rect.top + 18);
  y += [0, 20, -20, 40, -40].find((step) => clear(y - 9 + step)) ?? 0;
  placed.push({ left, top: y - 9, width });
  ctx.fillStyle = fill;
  ctx.fillRect(left, y - 9, width, 18);
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + 6, y);
}

function horizontal(ctx, fromX, toX, yy, color, dash = [], width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(fromX, yy);
  ctx.lineTo(toX, yy);
  ctx.stroke();
  ctx.setLineDash([]);
}

// EMA and VWAP over every candle so the visible part starts warmed up.
function overlays(all, first) {
  const ema20 = [];
  const ema50 = [];
  const vwap = [];
  let e20 = null;
  let e50 = null;
  const window = [];
  let pv = 0;
  let volume = 0;
  for (const candle of all) {
    e20 = e20 == null ? candle.close : e20 + (candle.close - e20) * 2 / 21;
    e50 = e50 == null ? candle.close : e50 + (candle.close - e50) * 2 / 51;
    const typical = (candle.high + candle.low + candle.close) / 3;
    const weight = Math.max(1, candle.volume);
    window.push([typical * weight, weight]);
    pv += typical * weight;
    volume += weight;
    if (window.length > 240) {
      const [oldPv, oldV] = window.shift();
      pv -= oldPv;
      volume -= oldV;
    }
    ema20.push(e20);
    ema50.push(e50);
    vwap.push(pv / volume);
  }
  return { ema20: ema20.slice(first), ema50: ema50.slice(first), vwap: vwap.slice(first) };
}

function line(ctx, values, x, y, color, dash = [], width = 1.3) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  values.forEach((value, index) => (index ? ctx.lineTo(x(index), y(value)) : ctx.moveTo(x(index), y(value))));
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawChart(canvas, sim, view = {}) {
  const scale = chartGeometry(canvas, sim, view);
  const { rect, candles, high, low, priceTop, priceBottom, left, plotRight, y, x, xStep } = scale;
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = rect.width;
  const height = rect.height;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  placed.length = 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#091923";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "middle";
  const visible = (price) => price >= low && price <= high;
  const last = sim.last;
  const player = sim.player;

  ctx.font = "10px Consolas, monospace";
  for (let i = 0; i <= 6; i++) {
    const value = high - (high - low) * i / 6;
    horizontal(ctx, left, plotRight, Math.round(y(value)) + 0.5, "#1f3640");
    ctx.fillStyle = "#77949d";
    ctx.textAlign = "right";
    ctx.fillText(labelPrice(value), left - 8, y(value));
  }
  ctx.textAlign = "center";
  candles.forEach((candle, index) => {
    if (Math.round(candle.time / 60) % 30 !== 0) return;
    ctx.fillStyle = "#5f7d85";
    ctx.fillText(gameClock(candle.time), x(index), height - 8);
    ctx.strokeStyle = "#16303a";
    ctx.beginPath();
    ctx.moveTo(x(index), priceTop);
    ctx.lineTo(x(index), priceBottom);
    ctx.stroke();
  });
  const startIndex = candles.findIndex((candle) => candle.time >= 0);
  if (startIndex > 0) {
    ctx.strokeStyle = "#f2c57555";
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(x(startIndex) - xStep / 2, priceTop);
    ctx.lineTo(x(startIndex) - xStep / 2, height - 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#c9a45a";
    ctx.textAlign = "left";
    ctx.fillText("開盤", x(startIndex) - xStep / 2 + 4, priceTop + 8);
  }

  // Everything priced stays inside the price pane, however far the axis is stretched.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, priceTop, width, priceBottom - priceTop);
  ctx.clip();

  // Background: the estimated liquidation heat or the resting book over time.
  const bin = Math.max(5000, Math.round((high - low) / 90 / 5000) * 5000);
  const estimate = sim.estimate.levels(bin).filter((row) => visible(row.price));
  const maxEstimate = Math.max(2000, ...estimate.map((row) => row.long + row.short));
  const heatRight = plotRight + PRICE_TAG;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, priceTop, heatRight - left, priceBottom - priceTop);
  ctx.clip();
  const layer = view.layer ?? "liq";
  if (layer === "liq") {
    for (const row of estimate) {
      const t = clamp((row.long + row.short) / maxEstimate, 0, 1);
      const top = y(row.price + bin / 2);
      ctx.fillStyle = heat(t, 0.04 + t * 0.32);
      ctx.fillRect(left, top, heatRight - left, Math.max(2, y(row.price - bin / 2) - top));
    }
  } else if (layer === "book") {
    let maxDepth = 1;
    for (const candle of candles) for (const level of [...(candle.book?.bids ?? []), ...(candle.book?.asks ?? [])]) maxDepth = Math.max(maxDepth, level.lots);
    const depthScale = Math.log1p(maxDepth);
    const paint = (rows, rgb, xx, w, boost = 0) => {
      for (const level of rows) {
        if (!visible(level.price)) continue;
        ctx.fillStyle = `rgba(${rgb},${(0.03 + boost + Math.log1p(level.lots) / depthScale * 0.3).toFixed(3)})`;
        ctx.fillRect(xx, y(level.price) - 1.3, w, 2.6);
      }
    };
    candles.forEach((candle, index) => {
      if (!candle.book) return;
      paint(candle.book.bids, "91,225,190", x(index) - xStep / 2, Math.ceil(xStep + 0.5));
      paint(candle.book.asks, "250,117,142", x(index) - xStep / 2, Math.ceil(xStep + 0.5));
    });
    paint(sim.book.depth("buy", 80), "91,225,190", plotRight, PRICE_TAG, 0.04);
    paint(sim.book.depth("sell", 80), "250,117,142", plotRight, PRICE_TAG, 0.04);
  }
  ctx.restore();

  if (view.averages !== false) {
    const lines = overlays(scale.all, scale.first);
    line(ctx, lines.vwap, x, y, "#7fb8ffaa", [5, 4]);
    line(ctx, lines.ema50, x, y, "#b79cffaa");
    line(ctx, lines.ema20, x, y, "#f2c575aa");
    ctx.font = "9px Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#f2c575";
    ctx.fillText("EMA20", left + 6, 12);
    ctx.fillStyle = "#b79cff";
    ctx.fillText("EMA50", left + 48, 12);
    ctx.fillStyle = "#7fb8ff";
    ctx.fillText("VWAP 4h", left + 90, 12);
  }

  const perCandle = xStep >= FOOTPRINT_SLOT;
  candles.forEach((candle, index) => {
    // With footprints on, a slim candle sits at the left edge of its slot.
    const xx = perCandle ? x(index) - xStep * 0.42 : x(index);
    const up = candle.close >= candle.open;
    ctx.strokeStyle = candle.synthetic ? (up ? "#5aa897" : "#b56b78") : up ? "#86edd2" : "#ffa0a9";
    ctx.fillStyle = candle.synthetic ? (up ? "#4f9686" : "#a8606d") : up ? "#75e4c7" : "#f58296";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xx, y(candle.high));
    ctx.lineTo(xx, y(candle.low));
    ctx.stroke();
    const bodyWidth = perCandle ? 4 : Math.max(1.5, Math.min(9, xStep * 0.68));
    ctx.fillRect(xx - bodyWidth / 2, Math.min(y(candle.open), y(candle.close)), bodyWidth, Math.max(1.4, Math.abs(y(candle.open) - y(candle.close))));
  });

  if (perCandle) drawCandleFootprints(ctx, scale, visible);

  // The player's orders: one hollow circle at the average fill, sized by volume, on a thin line
  // spanning the prices it filled at.
  if (player && view.fills !== false) {
    const firstTime = candles[0]?.time ?? 0;
    const groups = new Map();
    for (const fill of player.fills) {
      const index = Math.floor((fill.time - firstTime) / 60);
      if (index < 0 || index >= candles.length) continue;
      const key = `${fill.order}:${index}`;
      const group = groups.get(key) ?? { index, side: fill.side, lots: 0, value: 0, low: fill.price, high: fill.price };
      group.lots += fill.lots;
      group.value += fill.lots * fill.price;
      group.low = Math.min(group.low, fill.price);
      group.high = Math.max(group.high, fill.price);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const avg = group.value / group.lots;
      if (!visible(avg)) continue;
      const xx = perCandle ? x(group.index) - xStep * 0.42 : x(group.index);
      const color = group.side === "buy" ? "112,230,201" : "251,127,145";
      ctx.strokeStyle = `rgba(${color},0.55)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xx, y(group.low));
      ctx.lineTo(xx, y(group.high));
      ctx.stroke();
      const radius = clamp(3 + Math.sqrt(group.lots / 100) * 0.3, 3, 14);
      ctx.fillStyle = `rgba(${color},0.12)`;
      ctx.strokeStyle = `rgba(${color},0.95)`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(xx, y(avg), radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Cascade shocks: a bar on the live candle from where the wave started to where it ended.
  const liveX = x(Math.max(0, candles.length - 1));
  for (const flash of view.flashes ?? []) {
    const fade = clamp(1 - flash.age, 0, 1);
    if (!fade) continue;
    const rgb = flash.side === "short" ? "112,230,201" : "251,127,145";
    const top = y(Math.max(flash.from, flash.to));
    const bottom = y(Math.min(flash.from, flash.to));
    ctx.fillStyle = `rgba(${rgb},${(0.16 * fade).toFixed(3)})`;
    ctx.fillRect(left, top, plotRight - left, Math.max(2, bottom - top));
    ctx.fillStyle = `rgba(${rgb},${(0.85 * fade).toFixed(3)})`;
    ctx.fillRect(liveX - 5, top, 10, Math.max(3, bottom - top));
  }

  // True crowd map (practice reveal).
  const reveal = view.reveal ? sim.reveal(bin) : null;
  if (reveal) {
    const rows = reveal.levels.filter((row) => visible(row.price));
    const maxRow = Math.max(500, ...rows.map((row) => Math.max(row.liqLong + row.liqShort, row.stopLong + row.stopShort, row.takeLong + row.takeShort, row.entryBuy + row.entrySell)));
    const bar = (value, color, offset) => {
      if (!value) return 0;
      return { width: Math.max(2, value / maxRow * (plotRight - left) * 0.35), color, offset };
    };
    for (const row of rows) {
      const yy = y(row.price);
      let cursor = plotRight;
      for (const item of [
        bar(row.liqLong + row.liqShort, row.liqLong >= row.liqShort ? "rgba(251,127,145,.75)" : "rgba(112,230,201,.75)"),
        bar(row.stopLong + row.stopShort, "rgba(255,170,80,.7)"),
        bar(row.takeLong + row.takeShort, "rgba(130,200,255,.6)"),
        bar(row.entryBuy + row.entrySell, "rgba(200,160,255,.7)"),
      ]) {
        if (!item) continue;
        cursor -= item.width;
        ctx.fillStyle = item.color;
        ctx.fillRect(cursor, yy - 2, item.width, 4);
      }
    }
    ctx.font = "bold 10px Consolas, monospace";
    ctx.textAlign = "right";
    const legend = [["強平", "#fb7f91"], ["止損", "#ffaa50"], ["止盈", "#82c8ff"], ["觸價進場", "#c8a0ff"]];
    legend.forEach(([label, color], index) => {
      ctx.fillStyle = color;
      ctx.fillText(label, plotRight - 6 - (legend.length - 1 - index) * 58, priceTop + 10);
    });
    ctx.fillStyle = "#f6d78c";
    ctx.textAlign = "left";
    ctx.fillText("◉ 揭曉：真實分布（練習用）", left + 160, 12);
  }

  // Player reference lines.
  if (player?.position) {
    const account = player.account;
    if (visible(account.entry)) {
      horizontal(ctx, left, plotRight, y(account.entry), "#f3c577", [6, 4], 1.2);
      tag(ctx, `你的均價 ${labelPrice(account.entry)}`, left + 6, y(account.entry) - 12, "#3b3222e6", "#f7d58e");
    }
    const liq = player.liquidationPrice();
    if (liq && visible(liq)) {
      horizontal(ctx, left, plotRight, y(liq), "#ff5f7a", [2, 3], 1.6);
      tag(ctx, `你的強平 ${labelPrice(liq)}`, left + 6, y(liq) + (account.position > 0 ? 12 : -12), "#4a1d2ae6", "#ffb3bf");
    }
    for (const [price, label, color] of [[player.protection.stop, "止損", "#fb7f91"], [player.protection.take, "止盈", "#70e6c9"]]) {
      if (price == null || !visible(price)) continue;
      horizontal(ctx, left, plotRight, y(price), color, [8, 5]);
      tag(ctx, `${label} ${labelPrice(price)}`, plotRight - 4, y(price) - 11, "#12242de6", color, "right");
    }
  }
  if (player) {
    for (const order of player.orders()) {
      if (!visible(order.price)) continue;
      const buy = order.side === "buy";
      horizontal(ctx, left, plotRight, y(order.price), buy ? "#70e6c9aa" : "#fb7f91aa", [3, 3]);
      const hidden = order.iceberg?.hidden ? ` +冰山 ${btc(order.iceberg.hidden)}` : "";
      tag(ctx, `掛${buy ? "買" : "賣"} ${btc(order.lots)}${hidden}`, plotRight - 4, y(order.price), "#12242de6", buy ? "#9ff3dc" : "#ffb3bf", "right");
    }
    for (const trigger of player.triggers) {
      if (!visible(trigger.price)) continue;
      horizontal(ctx, left, plotRight, y(trigger.price), "#c8a0ffaa", [6, 3]);
      tag(ctx, `觸價${trigger.side === "buy" ? "買" : "賣"} ${btc(trigger.lots)}`, plotRight - 4, y(trigger.price), "#21173ae6", "#d9c6ff", "right");
    }
  }

  for (const signal of sim.icebergSignals()) {
    if (!visible(signal.price)) continue;
    horizontal(ctx, left, plotRight, y(signal.price), "#f2c575cc", [1, 3], 2);
    tag(ctx, `吸收 ${btc(signal.traded)} BTC`, plotRight - 4, y(signal.price), "#3a2f17ee", "#f6d78c", "right");
  }

  const lastY = y(last);
  if (lastY >= priceTop && lastY <= priceBottom) {
    horizontal(ctx, left, plotRight, lastY, "#f3c577", [5, 4]);
    ctx.fillStyle = "#f3c577";
    ctx.fillRect(plotRight + 1, lastY - 9, 68, 18);
    ctx.fillStyle = "#142630";
    ctx.font = "bold 10px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(labelPrice(last, 0), plotRight + 35, lastY);
  }

  if (view.cursorPrice != null && visible(view.cursorPrice)) {
    const yy = y(view.cursorPrice);
    horizontal(ctx, left, plotRight, yy, "#d9e8e4aa", [3, 4]);
    ctx.textAlign = "left";
    ctx.fillStyle = "#e7f6ee";
    ctx.font = "bold 11px Consolas, monospace";
    ctx.fillText(`${labelPrice(view.cursorPrice)}${view.cursorLabel ? ` · ${view.cursorLabel}` : ""}`, left + 8, clamp(yy - 12, priceTop + 12, priceBottom - 6));
  }

  ctx.restore();

  // Volume, then CVD and open interest.
  const volumeTop = priceBottom + 10;
  const volumeBottom = height * 0.8;
  const cvdTop = height * 0.83;
  const cvdBottom = height - 22;
  ctx.strokeStyle = "#29424b";
  ctx.beginPath();
  ctx.moveTo(left, priceBottom + 1);
  ctx.lineTo(plotRight, priceBottom + 1);
  ctx.moveTo(left, cvdTop - 5);
  ctx.lineTo(plotRight, cvdTop - 5);
  ctx.stroke();
  ctx.font = "9px Consolas, monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#7597a0";
  ctx.fillText("VOL", 10, volumeTop + 8);
  ctx.fillStyle = "#d5ae73";
  ctx.fillText("CVD", 10, cvdTop + 8);
  ctx.fillStyle = "#8fd4ff";
  ctx.fillText("OI", 36, cvdTop + 8);
  const maxVolume = Math.max(1, ...candles.map((candle) => candle.volume));
  candles.forEach((candle, index) => {
    const barHeight = candle.volume / maxVolume * (volumeBottom - volumeTop);
    ctx.fillStyle = candle.delta >= 0 ? "#48ad9e9c" : "#ca6a7e9c";
    ctx.fillRect(x(index) - Math.max(1, xStep * 0.32), volumeBottom - barHeight, Math.max(1.5, xStep * 0.64), barHeight);
    const liq = (candle.liq?.long ?? 0) + (candle.liq?.short ?? 0);
    if (liq) {
      ctx.fillStyle = "#f6d78c";
      ctx.fillRect(x(index) - 1.5, volumeTop, 3, 3);
    }
  });
  const series = (values, color) => {
    let lowValue = Math.min(...values);
    let highValue = Math.max(...values);
    if (lowValue === highValue) { lowValue--; highValue++; }
    const yy = (value) => cvdTop + (highValue - value) / (highValue - lowValue) * (cvdBottom - cvdTop);
    line(ctx, values, x, yy, color, [], 1.4);
  };
  if (candles.length > 1) {
    series(candles.map((candle) => candle.cvd), "#d5ae73");
    series(candles.map((candle) => candle.oi ?? 0), "#8fd4ffcc");
  }
}

const shortBtc = (lots) => {
  if (!lots) return "0";
  const value = lots / 100;
  return value >= 100 ? String(Math.round(value)) : value >= 10 ? value.toFixed(0) : value.toFixed(1);
};

// Bid × ask volume per price row inside each candle's slot; rows grow so the text never overlaps.
// The busiest row (point of control) gets an outline.
function drawCandleFootprints(ctx, scale, visible) {
  const { candles, x, y, xStep, span, priceTop, priceBottom } = scale;
  const rowPixels = 13;
  const raw = span * rowPixels / (priceBottom - priceTop);
  const steps = [1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  const bin = steps.find((step) => step >= raw) ?? Math.ceil(raw / 100000) * 100000;
  const rowHeight = Math.abs(y(0) - y(bin));
  const fontSize = Math.max(8, Math.min(11, rowHeight - 3));
  candles.forEach((candle, index) => {
    if (!candle.fp?.size) return;
    const rows = new Map();
    for (const [price, cell] of candle.fp) {
      const key = Math.round(price / bin) * bin;
      const row = rows.get(key) ?? { buy: 0, sell: 0 };
      row.buy += cell.buy;
      row.sell += cell.sell;
      rows.set(key, row);
    }
    let poc = null;
    let max = 1;
    for (const [price, row] of rows) {
      const total = row.buy + row.sell;
      if (total > max) {
        max = total;
        poc = price;
      }
    }
    const left = x(index) - xStep * 0.34;
    const width = xStep * 0.8;
    ctx.font = `${fontSize}px Consolas, monospace`;
    ctx.textBaseline = "middle";
    for (const [price, row] of rows) {
      if (!visible(price)) continue;
      const top = y(price + bin / 2);
      const total = row.buy + row.sell;
      const imbalance = row.buy > row.sell * 3 && row.buy >= 100 ? "buy" : row.sell > row.buy * 3 && row.sell >= 100 ? "sell" : null;
      const alpha = (0.05 + total / max * 0.22).toFixed(3);
      ctx.fillStyle = imbalance === "buy" ? `rgba(112,230,201,${alpha})` : imbalance === "sell" ? `rgba(251,127,145,${alpha})` : `rgba(150,180,190,${(total / max * 0.16).toFixed(3)})`;
      ctx.fillRect(left, top, width, rowHeight - 1);
      if (price === poc) {
        ctx.strokeStyle = "#f2c575cc";
        ctx.lineWidth = 1;
        ctx.strokeRect(left + 0.5, top + 0.5, width - 1, rowHeight - 2);
      }
      if (top < priceTop - 2 || top + rowHeight > priceBottom + 2) continue;
      ctx.fillStyle = "#ffa7b4";
      ctx.textAlign = "right";
      ctx.fillText(shortBtc(row.sell), left + width / 2 - 3, top + rowHeight / 2);
      ctx.fillStyle = "#cfd9dc";
      ctx.textAlign = "center";
      ctx.fillText("×", left + width / 2, top + rowHeight / 2);
      ctx.fillStyle = "#97f0d3";
      ctx.textAlign = "left";
      ctx.fillText(shortBtc(row.buy), left + width / 2 + 3, top + rowHeight / 2);
    }
  });
}
