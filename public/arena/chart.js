// Canvas chart for the sandbox: 1-minute candles over a liquidation-estimate or order-book heatmap,
// averages and VWAP, volume, CVD and open interest, the estimated liquidation map and a footprint
// column. With view.reveal the true crowd map (liquidations, stops, targets, stop entries) is drawn.
import { PRICE_TICK } from "./engine/book.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const labelPrice = (cents, digits = 0) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const btc = (lots) => (lots / 100).toLocaleString("en-US", { maximumFractionDigits: lots >= 1000 ? 0 : 1 });

const MONO = '"JetBrains Mono Variable", "Noto Sans TC Variable", Consolas, monospace';
const UI = '"Noto Sans TC Variable", "Microsoft JhengHei", sans-serif';
const THEME = {
  bgTop: "#070c13",
  bgBottom: "#04070b",
  grid: "rgba(140,178,214,0.06)",
  gridStrong: "rgba(140,178,214,0.12)",
  axisInk: "#6a7c90",
  ink: "#e9f1f8",
  long: "45,226,166",
  short: "255,79,110",
  fuel: "255,173,66",
  gold: "#ffd77a",
  violet: "169,139,255",
  upBody: "#1fcf96",
  upWick: "#4af2bb",
  downBody: "#f0435f",
  downWick: "#ff7a90",
  upFaded: "#2a7564",
  downFaded: "#83394a",
};
// Embers to white heat: the estimated liquidation fuel literally glows.
const HEAT_STOPS = [
  [0, [38, 22, 84]],
  [0.3, [96, 38, 150]],
  [0.55, [196, 52, 120]],
  [0.78, [255, 128, 56]],
  [1, [255, 236, 168]],
];
function heat(t, alpha) {
  let index = 1;
  while (index < HEAT_STOPS.length - 1 && t > HEAT_STOPS[index][0]) index++;
  const [t0, c0] = HEAT_STOPS[index - 1];
  const [t1, c1] = HEAT_STOPS[index];
  const k = clamp((t - t0) / (t1 - t0), 0, 1);
  return `rgba(${c0.map((value, i) => Math.round(value + (c1[i] - value) * k)).join(",")},${alpha.toFixed(3)})`;
}

export const PRICE_TAG = 70;
export const MIN_CANDLES = 4;
const HEAT_BINS = [5000, 10000, 20000, 25000, 50000, 100000, 200000];
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
  // shift: how many candles the view has been dragged back from the newest. While looking back,
  // new candles push the shift up so the same stretch of history stays on screen.
  if (view.shift > 0 && view.seenLength != null && all.length > view.seenLength) view.shift += all.length - view.seenLength;
  view.seenLength = all.length;
  const shift = clamp(Math.round(view.shift ?? 0), 0, Math.max(0, all.length - count));
  view.shift = shift;
  const end = all.length - shift;
  const candles = all.slice(Math.max(0, end - count), end);
  const last = sim.last;
  const live = shift === 0;
  const rawLow = Math.min(live ? last * 0.994 : Infinity, ...candles.map((candle) => candle.low));
  const rawHigh = Math.max(live ? last * 1.006 : -Infinity, ...candles.map((candle) => candle.high));
  const padding = (rawHigh - rawLow) * 0.06;
  let baseLow = rawLow - padding;
  let baseHigh = rawHigh + padding;
  // Sticky price axis: widens as soon as the price needs room, narrows only once the range shrank
  // well inside it, and holds while the pointer is over the plot so a click lands where it points.
  const frame = live ? view.frame : null;
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
  const priceTop = 30;
  // Lower panes collapse when their indicators are off, giving the room back to the candles.
  const ind = view.ind ?? {};
  const showVolume = ind.volume !== false;
  const showFlow = ind.cvd !== false || ind.oi !== false;
  const priceBottom = rect.height * (showVolume && showFlow ? 0.7 : showVolume || showFlow ? 0.8 : 0.94);
  const left = 8;
  const plotRight = rect.width - PRICE_TAG - 8;
  const y = (price) => priceTop + (high - price) / span * (priceBottom - priceTop);
  const slots = Math.max(MIN_CANDLES + 2, candles.length + 2);
  const xStep = (plotRight - left) / slots;
  const x = (index) => left + (index + 0.5) * xStep;
  return { rect, all, candles, first: end - candles.length, shift, high, low, span, priceTop, priceBottom, left, plotRight, y, x, xStep, ind, showVolume, showFlow };
}

// True over the price scale on the right.
export function chartOnAxis(canvas, sim, view, clientX, clientY) {
  const scale = chartGeometry(canvas, sim, view);
  const localX = clientX - scale.rect.left;
  const localY = clientY - scale.rect.top;
  if (localY < scale.priceTop || localY > scale.priceBottom) return false;
  return localX > scale.plotRight;
}

export function chartPriceAt(canvas, sim, view, clientY) {
  const scale = chartGeometry(canvas, sim, view);
  const localY = clientY - scale.rect.top;
  if (localY < scale.priceTop || localY > scale.priceBottom) return null;
  const price = scale.high - (localY - scale.priceTop) / (scale.priceBottom - scale.priceTop) * scale.span;
  return clamp(Math.round(price / PRICE_TICK) * PRICE_TICK, PRICE_TICK, sim.book.maxPrice);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A pill label with a colored edge. Labels nudge up or down so they never stack on each other.
const placed = [];
function tag(ctx, text, x, y, accent, ink = "#e9f1f8", align = "left", fill = "rgba(7,12,19,0.88)") {
  ctx.font = `600 10px ${MONO}`;
  const width = ctx.measureText(text).width + 16;
  const left = align === "right" ? x - width : x;
  const clear = (top) => placed.every((rect) => left + width <= rect.left || left >= rect.left + rect.width || top + 19 <= rect.top || top >= rect.top + 19);
  y += [0, 21, -21, 42, -42].find((step) => clear(y - 9.5 + step)) ?? 0;
  placed.push({ left, top: y - 9.5, width });
  ctx.fillStyle = fill;
  roundRect(ctx, left, y - 9.5, width, 19, 6);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = accent;
  ctx.fillRect(left + 1, y - 5.5, 2, 11);
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + 8, y + 0.5);
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

// A price tag on the right scale, with a notch pointing at its line.
function axisTag(ctx, plotRight, yy, text, fill, ink) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(plotRight + 1, yy);
  ctx.lineTo(plotRight + 7, yy - 10);
  ctx.lineTo(plotRight + PRICE_TAG + 2, yy - 10);
  ctx.lineTo(plotRight + PRICE_TAG + 2, yy + 10);
  ctx.lineTo(plotRight + 7, yy + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.font = `700 11px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, plotRight + 6 + PRICE_TAG / 2, yy + 0.5);
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
  ctx.lineJoin = "round";
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
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, THEME.bgTop);
  background.addColorStop(1, THEME.bgBottom);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "middle";
  const visible = (price) => price >= low && price <= high;
  const last = sim.last;
  const player = sim.player;
  const now = view.now ?? 0;
  const live = scale.shift === 0;

  for (let i = 0; i <= 6; i++) {
    const value = high - (high - low) * i / 6;
    horizontal(ctx, left, plotRight, Math.round(y(value)) + 0.5, THEME.grid);
  }
  ctx.font = `500 10px ${MONO}`;
  ctx.textAlign = "center";
  candles.forEach((candle, index) => {
    if (Math.round(candle.time / 60) % 30 !== 0) return;
    ctx.fillStyle = THEME.axisInk;
    ctx.fillText(gameClock(candle.time), x(index), height - 9);
    ctx.strokeStyle = THEME.grid;
    ctx.beginPath();
    ctx.moveTo(Math.round(x(index)) + 0.5, priceTop);
    ctx.lineTo(Math.round(x(index)) + 0.5, height - 20);
    ctx.stroke();
  });
  const startIndex = candles.findIndex((candle) => candle.time >= 0);
  if (startIndex > 0) {
    const openX = x(startIndex) - xStep / 2;
    // Before the open the history is fast-forwarded: shade it so the player's time stands out.
    ctx.fillStyle = "rgba(140,178,214,0.025)";
    ctx.fillRect(left, priceTop, openX - left, height - 20 - priceTop);
    ctx.strokeStyle = `rgba(${THEME.fuel},0.45)`;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(openX, priceTop);
    ctx.lineTo(openX, height - 20);
    ctx.stroke();
    ctx.setLineDash([]);
    // Near the price scale the label goes on the left of the line.
    const nearScale = openX > plotRight - 40;
    ctx.font = `700 10px ${UI}`;
    ctx.fillStyle = `rgba(${THEME.fuel},0.85)`;
    ctx.textAlign = nearScale ? "right" : "left";
    ctx.fillText("開盤 ▸", openX + (nearScale ? -5 : 5), priceTop + 10);
  }

  // Everything priced stays inside the price pane, however far the axis is stretched.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, priceTop, width, priceBottom - priceTop);
  ctx.clip();

  // Background: the estimated liquidation heat or the resting book over time.
  // Fixed bin steps and a slowly moving brightness scale, so the heat does not reshuffle and blink
  // every second as the price range and the estimate change.
  const bin = HEAT_BINS.find((step) => step >= (high - low) / 90) ?? HEAT_BINS.at(-1);
  const estimate = sim.estimate.levels(bin).filter((row) => visible(row.price));
  const peak = Math.max(2000, ...estimate.map((row) => row.long + row.short));
  view.heatMax = view.heatMax ? view.heatMax + (peak - view.heatMax) * 0.04 : peak;
  const maxEstimate = Math.max(2000, view.heatMax);
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
      ctx.fillStyle = heat(t, 0.05 + t * 0.42);
      ctx.fillRect(left, top, heatRight - left, Math.max(2, y(row.price - bin / 2) - top));
    }
  } else if (layer === "book") {
    let maxDepth = 1;
    for (const candle of candles) for (const level of [...(candle.book?.bids ?? []), ...(candle.book?.asks ?? [])]) maxDepth = Math.max(maxDepth, level.lots);
    const depthScale = Math.log1p(maxDepth);
    const paint = (rows, rgb, xx, w, boost = 0) => {
      for (const level of rows) {
        if (!visible(level.price)) continue;
        ctx.fillStyle = `rgba(${rgb},${(0.03 + boost + Math.log1p(level.lots) / depthScale * 0.34).toFixed(3)})`;
        ctx.fillRect(xx, y(level.price) - 1.3, w, 2.6);
      }
    };
    candles.forEach((candle, index) => {
      if (!candle.book) return;
      paint(candle.book.bids, THEME.long, x(index) - xStep / 2, Math.ceil(xStep + 0.5));
      paint(candle.book.asks, THEME.short, x(index) - xStep / 2, Math.ceil(xStep + 0.5));
    });
    paint(sim.book.depth("buy", 80), THEME.long, plotRight, PRICE_TAG, 0.05);
    paint(sim.book.depth("sell", 80), THEME.short, plotRight, PRICE_TAG, 0.05);
  }
  ctx.restore();

  const ind = scale.ind;
  view.omenBands = [];
  if (view.effects !== false && ind.omen !== false) view.omenBands = drawFuelOmen(ctx, scale, estimate, maxEstimate, last, now);

  // The open position: a tinted zone between the entry and the mark, and a red danger zone beyond
  // the liquidation price.
  if (player?.position && ind.fills !== false) {
    const account = player.account;
    const entryY = y(account.entry);
    const markY = y(last);
    const winning = (account.position > 0) === (last >= account.entry);
    const rgb = winning ? THEME.long : THEME.short;
    const top = Math.min(entryY, markY);
    const zone = ctx.createLinearGradient(left, 0, plotRight, 0);
    zone.addColorStop(0, `rgba(${rgb},0)`);
    zone.addColorStop(1, `rgba(${rgb},0.13)`);
    ctx.fillStyle = zone;
    ctx.fillRect(left, top, plotRight - left, Math.abs(markY - entryY));
    const liq = player.liquidationPrice();
    if (liq) {
      const liqY = y(liq);
      const beyond = account.position > 0 ? 1 : -1;
      const danger = ctx.createLinearGradient(0, liqY, 0, liqY + beyond * 60);
      danger.addColorStop(0, `rgba(${THEME.short},0.22)`);
      danger.addColorStop(1, `rgba(${THEME.short},0)`);
      ctx.fillStyle = danger;
      ctx.fillRect(left, Math.min(liqY, liqY + beyond * 60), plotRight - left, 60);
    }
  }

  const averages = [
    ["vwap", "VWAP 4h", "#6cb6ff", [5, 4]],
    ["ema50", "EMA50", "#a98bff", []],
    ["ema20", "EMA20", "#ffcf70", []],
  ].filter(([key]) => ind[key] !== false);
  let legendX = left + 6;
  if (averages.length) {
    const lines = overlays(scale.all, scale.first);
    ctx.font = `600 9.5px ${MONO}`;
    ctx.textAlign = "left";
    for (const [key, label, color, dash] of averages) {
      line(ctx, lines[key], x, y, `${color}b0`, dash, 1.4);
      const valueText = `${label} ${labelPrice(lines[key].at(-1) ?? 0)}`;
      ctx.fillStyle = color;
      ctx.fillText(valueText, legendX, 14);
      legendX += ctx.measureText(valueText).width + 14;
    }
  }

  const perCandle = xStep >= FOOTPRINT_SLOT && ind.footprint !== false;
  candles.forEach((candle, index) => {
    // With footprints on, a slim candle sits at the left edge of its slot.
    const xx = perCandle ? x(index) - xStep * 0.42 : x(index);
    const up = candle.close >= candle.open;
    const isLive = live && index === candles.length - 1;
    ctx.strokeStyle = candle.synthetic ? (up ? THEME.upFaded : THEME.downFaded) : up ? THEME.upWick : THEME.downWick;
    ctx.fillStyle = candle.synthetic ? (up ? THEME.upFaded : THEME.downFaded) : up ? THEME.upBody : THEME.downBody;
    ctx.lineWidth = 1;
    const wickX = Math.round(xx) + 0.5;
    ctx.beginPath();
    ctx.moveTo(wickX, y(candle.high));
    ctx.lineTo(wickX, y(candle.low));
    ctx.stroke();
    const bodyWidth = perCandle ? 4 : Math.max(1.5, Math.min(10, xStep * 0.68));
    const bodyTop = Math.min(y(candle.open), y(candle.close));
    const bodyHeight = Math.max(1.4, Math.abs(y(candle.open) - y(candle.close)));
    if (isLive) {
      // The live candle glows, breathing while the market runs.
      ctx.save();
      ctx.shadowColor = `rgba(${up ? THEME.long : THEME.short},0.9)`;
      ctx.shadowBlur = view.running ? 10 + 6 * Math.sin(now / 180) : 8;
      ctx.fillRect(xx - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
      ctx.restore();
    } else ctx.fillRect(xx - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
  });

  if (perCandle) drawCandleFootprints(ctx, scale, visible);

  // The player's orders: one hollow circle at the average fill, sized by volume, on a thin line
  // spanning the prices it filled at.
  if (player && ind.fills !== false) {
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
      const color = group.side === "buy" ? THEME.long : THEME.short;
      ctx.strokeStyle = `rgba(${color},0.55)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xx, y(group.low));
      ctx.lineTo(xx, y(group.high));
      ctx.stroke();
      const radius = clamp(3 + Math.sqrt(group.lots / 100) * 0.3, 3, 14);
      ctx.save();
      ctx.shadowColor = `rgba(${color},0.9)`;
      ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(${color},0.16)`;
      ctx.strokeStyle = `rgba(${color},1)`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(xx, y(avg), radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // Cascade shocks: a band from where the wave started to where it ended, and a hot bar on the live candle.
  const liveX = x(Math.max(0, candles.length - 1));
  for (const flash of view.flashes ?? []) {
    const fade = clamp(1 - flash.age, 0, 1);
    if (!fade) continue;
    const rgb = flash.side === "short" ? THEME.long : THEME.short;
    const top = y(Math.max(flash.from, flash.to));
    const bottom = y(Math.min(flash.from, flash.to));
    const band = ctx.createLinearGradient(left, 0, plotRight, 0);
    band.addColorStop(0, `rgba(${rgb},0)`);
    band.addColorStop(1, `rgba(${rgb},${(0.28 * fade).toFixed(3)})`);
    ctx.fillStyle = band;
    ctx.fillRect(left, top, plotRight - left, Math.max(2, bottom - top));
    ctx.save();
    ctx.shadowColor = `rgba(${rgb},1)`;
    ctx.shadowBlur = 16 * fade;
    ctx.fillStyle = `rgba(${rgb},${(0.9 * fade).toFixed(3)})`;
    ctx.fillRect(liveX - 4, top, 8, Math.max(3, bottom - top));
    ctx.restore();
  }

  if (view.pushes?.length) drawPushes(ctx, scale, view.pushes, now);

  // True crowd map (practice reveal).
  const reveal = view.reveal ? sim.reveal(bin) : null;
  if (reveal) {
    ctx.fillStyle = `rgba(${THEME.violet},0.05)`;
    ctx.fillRect(left, priceTop, plotRight - left, priceBottom - priceTop);
    const rows = reveal.levels.filter((row) => visible(row.price));
    const maxRow = Math.max(500, ...rows.map((row) => Math.max(row.liqLong + row.liqShort, row.stopLong + row.stopShort, row.takeLong + row.takeShort, row.entryBuy + row.entrySell)));
    const bar = (value, color) => {
      if (!value) return 0;
      return { width: Math.max(2, value / maxRow * (plotRight - left) * 0.35), color };
    };
    for (const row of rows) {
      const yy = y(row.price);
      let cursor = plotRight;
      for (const item of [
        bar(row.liqLong + row.liqShort, row.liqLong >= row.liqShort ? `rgba(${THEME.short},.85)` : `rgba(${THEME.long},.85)`),
        bar(row.stopLong + row.stopShort, "rgba(255,170,80,.8)"),
        bar(row.takeLong + row.takeShort, "rgba(108,182,255,.75)"),
        bar(row.entryBuy + row.entrySell, `rgba(${THEME.violet},.85)`),
      ]) {
        if (!item) continue;
        cursor -= item.width;
        ctx.fillStyle = item.color;
        roundRect(ctx, cursor, yy - 2.5, item.width, 5, 2);
        ctx.fill();
      }
    }
    // Legend on the left, away from the bars that grow in from the price scale.
    ctx.font = `700 10px ${UI}`;
    ctx.textAlign = "left";
    let lx = left + 10;
    const ly = priceBottom - 14;
    ctx.fillStyle = "rgba(7,12,19,0.85)";
    roundRect(ctx, left + 2, ly - 11, 262, 22, 6);
    ctx.fill();
    for (const [label, color] of [["強平", `rgb(${THEME.short})`], ["止損", "#ffaa50"], ["止盈", "#6cb6ff"], ["觸價進場", `rgb(${THEME.violet})`]]) {
      ctx.fillStyle = color;
      roundRect(ctx, lx, ly - 4, 12, 8, 2);
      ctx.fill();
      ctx.fillStyle = THEME.ink;
      ctx.fillText(label, lx + 17, ly + 0.5);
      lx += ctx.measureText(label).width + 34;
    }
  }

  // Player reference lines.
  if (player?.position) {
    const account = player.account;
    if (visible(account.entry)) {
      horizontal(ctx, left, plotRight, y(account.entry), THEME.gold, [6, 4], 1.2);
      tag(ctx, `均價 ${labelPrice(account.entry)}`, left + 8, y(account.entry) - 13, THEME.gold, "#ffe7ad");
    }
    const liq = player.liquidationPrice();
    if (liq && visible(liq)) {
      ctx.save();
      ctx.shadowColor = `rgba(${THEME.short},0.9)`;
      ctx.shadowBlur = 8;
      horizontal(ctx, left, plotRight, y(liq), `rgb(${THEME.short})`, [2, 3], 1.6);
      ctx.restore();
      tag(ctx, `☠ 你的強平 ${labelPrice(liq)}`, left + 8, y(liq) + (account.position > 0 ? 13 : -13), `rgb(${THEME.short})`, "#ffc2cd", "left", "rgba(40,6,14,0.92)");
    }
    for (const [price, label, color] of [[player.protection.stop, "止損", `rgb(${THEME.short})`], [player.protection.take, "止盈", `rgb(${THEME.long})`]]) {
      if (price == null || !visible(price)) continue;
      horizontal(ctx, left, plotRight, y(price), color, [8, 5]);
      tag(ctx, `${label} ${labelPrice(price)}`, plotRight - 6, y(price) - 12, color, THEME.ink, "right");
    }
  }
  if (player) {
    for (const order of player.orders()) {
      if (!visible(order.price)) continue;
      const buy = order.side === "buy";
      const color = `rgb(${buy ? THEME.long : THEME.short})`;
      horizontal(ctx, left, plotRight, y(order.price), `rgba(${buy ? THEME.long : THEME.short},0.7)`, [3, 3]);
      tag(ctx, `掛${buy ? "買" : "賣"} ${btc(order.lots)}`, plotRight - 6, y(order.price), color, THEME.ink, "right");
    }
    // Limit orders still waiting to be sent when the market resumes.
    for (const order of player.queue) {
      if (order.type !== "limit" || !visible(order.price)) continue;
      horizontal(ctx, left, plotRight, y(order.price), `rgba(${THEME.fuel},0.7)`, [2, 4]);
      tag(ctx, `⏳ 待送出 ${order.side === "buy" ? "買" : "賣"} ${btc(order.lots)}`, plotRight - 6, y(order.price), THEME.gold, "#ffe7ad", "right");
    }
  }

  for (const signal of ind.absorb !== false ? sim.icebergSignals() : []) {
    if (!visible(signal.price)) continue;
    horizontal(ctx, left, plotRight, y(signal.price), `rgba(${THEME.fuel},0.85)`, [1, 3], 2);
    tag(ctx, `🛡 吸收 ${btc(signal.traded)} BTC`, plotRight - 6, y(signal.price), `rgb(${THEME.fuel})`, "#ffe7ad", "right");
  }

  // Crosshair: a vertical line through the hovered candle and a readout of its numbers.
  const hovered = view.cursorX != null && view.cursorX >= left && view.cursorX <= plotRight ? Math.round((view.cursorX - left) / xStep - 0.5) : null;
  const hoverCandle = hovered != null ? candles[hovered] : null;
  if (hoverCandle) {
    const hx = Math.round(x(hovered)) + 0.5;
    ctx.strokeStyle = "rgba(233,241,248,0.28)";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(hx, priceTop);
    ctx.lineTo(hx, priceBottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Price scale on the right; the last price and the cursor sit on it as tags.
  ctx.fillStyle = "rgba(5,8,13,0.82)";
  ctx.fillRect(plotRight, priceTop, PRICE_TAG + 8, priceBottom - priceTop);
  ctx.strokeStyle = THEME.gridStrong;
  ctx.beginPath();
  ctx.moveTo(plotRight + 0.5, priceTop);
  ctx.lineTo(plotRight + 0.5, priceBottom);
  ctx.stroke();
  ctx.font = `500 10px ${MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = THEME.axisInk;
  for (let i = 0; i <= 6; i++) {
    const value = high - (high - low) * i / 6;
    ctx.fillText(labelPrice(value), plotRight + 9, clamp(y(value), priceTop + 6, priceBottom - 6));
  }
  const lastY = y(last);
  if (lastY >= priceTop && lastY <= priceBottom) {
    const liveCandle = candles.at(-1);
    const up = !liveCandle || liveCandle.close >= liveCandle.open;
    const rgb = up ? THEME.long : THEME.short;
    horizontal(ctx, left, plotRight, lastY, `rgba(${rgb},0.6)`, [4, 4]);
    if (live && view.running) {
      // A sonar ping on the live price while the market runs.
      const ping = (now % 1400) / 1400;
      ctx.strokeStyle = `rgba(${rgb},${(0.7 * (1 - ping)).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(liveX, lastY, 3 + ping * 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = `rgba(${rgb},0.8)`;
    ctx.shadowBlur = 12;
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.beginPath();
    ctx.arc(liveX, lastY, 3, 0, Math.PI * 2);
    ctx.fill();
    axisTag(ctx, plotRight, lastY, labelPrice(last, 0), `rgb(${rgb})`, up ? "#03251a" : "#fff");
    ctx.restore();
  }

  if (view.cursorPrice != null && visible(view.cursorPrice)) {
    const yy = y(view.cursorPrice);
    horizontal(ctx, left, plotRight, yy, "rgba(233,241,248,0.4)", [3, 4]);
    if (view.cursorLabel) {
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(233,241,248,0.75)";
      ctx.font = `600 10.5px ${UI}`;
      ctx.fillText(view.cursorLabel, (view.cursorX ?? left) + 12, clamp(yy - 12, priceTop + 12, priceBottom - 6));
    }
    axisTag(ctx, plotRight, yy, labelPrice(view.cursorPrice), "#e9f1f8", "#070c13");
  }

  ctx.restore();

  if (hoverCandle) {
    const hx = x(hovered);
    const label = gameClock(hoverCandle.time);
    ctx.font = `600 10px ${MONO}`;
    const w = ctx.measureText(label).width + 14;
    ctx.fillStyle = "#e9f1f8";
    roundRect(ctx, clamp(hx - w / 2, left, plotRight - w), height - 19, w, 17, 5);
    ctx.fill();
    ctx.fillStyle = "#070c13";
    ctx.textAlign = "center";
    ctx.fillText(label, clamp(hx, left + w / 2, plotRight - w / 2), height - 10);
    // OHLC readout beside the legend.
    const change = hoverCandle.close / hoverCandle.open - 1;
    const parts = [["O", labelPrice(hoverCandle.open)], ["H", labelPrice(hoverCandle.high)], ["L", labelPrice(hoverCandle.low)], ["C", labelPrice(hoverCandle.close)], ["Δ", `${change >= 0 ? "+" : ""}${(change * 100).toFixed(2)}%`], ["V", btc(hoverCandle.volume)]];
    let readX = Math.max(legendX + 6, left + 6);
    ctx.textAlign = "left";
    ctx.font = `600 9.5px ${MONO}`;
    for (const [key, value] of parts) {
      ctx.fillStyle = THEME.axisInk;
      ctx.fillText(key, readX, 14);
      readX += ctx.measureText(key).width + 4;
      ctx.fillStyle = key === "Δ" ? `rgb(${change >= 0 ? THEME.long : THEME.short})` : THEME.ink;
      ctx.fillText(value, readX, 14);
      readX += ctx.measureText(value).width + 10;
    }
  }

  if (scale.shift > 0) {
    ctx.font = `700 10.5px ${UI}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = THEME.gold;
    ctx.fillText(`◀ 往回看 ${scale.shift} 根 · 雙擊回到最新`, plotRight - 8, priceTop + 14);
  }

  // Volume, then CVD and open interest, each only when switched on.
  const lowerTop = priceBottom + 10;
  const lowerBottom = height - 24;
  let volumeTop = lowerTop;
  let volumeBottom = lowerBottom;
  let cvdTop = lowerTop;
  const cvdBottom = lowerBottom;
  if (scale.showVolume && scale.showFlow) {
    volumeBottom = lowerTop + (lowerBottom - lowerTop) * 0.45;
    cvdTop = volumeBottom + 12;
  }
  ctx.strokeStyle = THEME.gridStrong;
  ctx.beginPath();
  ctx.moveTo(left, priceBottom + 1);
  ctx.lineTo(plotRight + PRICE_TAG, priceBottom + 1);
  if (scale.showVolume && scale.showFlow) {
    ctx.moveTo(left, cvdTop - 5);
    ctx.lineTo(plotRight, cvdTop - 5);
  }
  ctx.stroke();
  ctx.font = `700 9px ${MONO}`;
  ctx.textAlign = "left";
  if (scale.showVolume) {
    const maxVolume = Math.max(1, ...candles.map((candle) => candle.volume));
    candles.forEach((candle, index) => {
      const barHeight = candle.volume / maxVolume * (volumeBottom - volumeTop);
      ctx.fillStyle = candle.delta >= 0 ? `rgba(${THEME.long},0.42)` : `rgba(${THEME.short},0.42)`;
      ctx.fillRect(x(index) - Math.max(0.75, xStep * 0.32), volumeBottom - barHeight, Math.max(1.5, xStep * 0.64), barHeight);
      const liq = (candle.liq?.long ?? 0) + (candle.liq?.short ?? 0);
      if (liq) {
        ctx.fillStyle = `rgb(${THEME.fuel})`;
        ctx.beginPath();
        ctx.arc(x(index), volumeTop + 2, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.fillStyle = THEME.axisInk;
    ctx.fillText("VOL", left + 4, volumeTop + 9);
  }
  if (scale.showFlow && candles.length > 1) {
    const series = (values, rgb, area) => {
      let lowValue = Math.min(...values);
      let highValue = Math.max(...values);
      if (lowValue === highValue) { lowValue--; highValue++; }
      const yy = (value) => cvdTop + (highValue - value) / (highValue - lowValue) * (cvdBottom - cvdTop);
      if (area) {
        const gradient = ctx.createLinearGradient(0, cvdTop, 0, cvdBottom);
        gradient.addColorStop(0, `rgba(${rgb},0.2)`);
        gradient.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        values.forEach((value, index) => (index ? ctx.lineTo(x(index), yy(value)) : ctx.moveTo(x(index), yy(value))));
        ctx.lineTo(x(values.length - 1), cvdBottom);
        ctx.lineTo(x(0), cvdBottom);
        ctx.closePath();
        ctx.fill();
      }
      line(ctx, values, x, yy, `rgba(${rgb},0.95)`, [], 1.5);
    };
    let labelX = left + 4;
    if (ind.cvd !== false) {
      series(candles.map((candle) => candle.cvd), "255,191,102", true);
      ctx.fillStyle = "#ffbf66";
      ctx.fillText("CVD", labelX, cvdTop + 9);
      labelX += 30;
    }
    if (ind.oi !== false) {
      series(candles.map((candle) => candle.oi ?? 0), "108,182,255", false);
      ctx.fillStyle = "#6cb6ff";
      ctx.fillText("OI", labelX, cvdTop + 9);
    }
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
    ctx.font = `500 ${fontSize}px ${MONO}`;
    ctx.textBaseline = "middle";
    for (const [price, row] of rows) {
      if (!visible(price)) continue;
      const top = y(price + bin / 2);
      const total = row.buy + row.sell;
      const imbalance = row.buy > row.sell * 3 && row.buy >= 100 ? "buy" : row.sell > row.buy * 3 && row.sell >= 100 ? "sell" : null;
      const alpha = (0.06 + total / max * 0.26).toFixed(3);
      ctx.fillStyle = imbalance === "buy" ? `rgba(${THEME.long},${alpha})` : imbalance === "sell" ? `rgba(${THEME.short},${alpha})` : `rgba(140,178,214,${(total / max * 0.16).toFixed(3)})`;
      ctx.fillRect(left, top, width, rowHeight - 1);
      if (price === poc) {
        ctx.strokeStyle = `rgba(${THEME.fuel},0.9)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(left + 0.5, top + 0.5, width - 1, rowHeight - 2);
      }
      if (top < priceTop - 2 || top + rowHeight > priceBottom + 2) continue;
      ctx.fillStyle = "#ffa6b6";
      ctx.textAlign = "right";
      ctx.fillText(shortBtc(row.sell), left + width / 2 - 4, top + rowHeight / 2);
      ctx.fillStyle = "#6a7c90";
      ctx.textAlign = "center";
      ctx.fillText("×", left + width / 2, top + rowHeight / 2);
      ctx.fillStyle = "#93f7d4";
      ctx.textAlign = "left";
      ctx.fillText(shortBtc(row.buy), left + width / 2 + 4, top + rowHeight / 2);
    }
  });
}

const OMEN_PERIOD = 260; // ms per radian: one breath about every 1.6s

// The brightest estimated liquidation bands breathe, all on one rhythm whatever the price does;
// a band with more fuel glows brighter, and a spark of light runs along it. The two biggest carry a
// tag with their fuel. Returns the bands so the effects layer can let them smolder.
function drawFuelOmen(ctx, scale, estimate, maxEstimate, last, now) {
  const { left, plotRight, y } = scale;
  const breath = 0.5 + 0.5 * Math.sin(now / OMEN_PERIOD);
  const bright = estimate
    .map((row) => ({ row, lots: row.long + row.short }))
    .filter(({ lots }) => lots / maxEstimate >= 0.45 && lots >= 3000)
    .sort((first, second) => second.lots - first.lots);
  const bands = [];
  bright.forEach(({ row, lots }, rank) => {
    const strength = Math.min(1, lots / maxEstimate);
    const glow = 0.35 + 0.65 * breath;
    const yy = y(row.price);
    const band = 5 + strength * 10;
    ctx.save();
    ctx.shadowColor = `rgba(255,150,60,${(0.6 * strength * glow).toFixed(3)})`;
    ctx.shadowBlur = 8 + strength * 18 * glow;
    ctx.fillStyle = `rgba(255,150,60,${((0.05 + strength * 0.2) * glow).toFixed(3)})`;
    ctx.fillRect(left, yy - band / 2, plotRight - left, band);
    ctx.fillStyle = `rgba(255,214,150,${((0.3 + strength * 0.55) * glow).toFixed(3)})`;
    ctx.fillRect(left, yy - 0.75, plotRight - left, 1.5);
    // A bright runner travels along the strongest bands.
    if (rank < 3) {
      const runX = left + (plotRight - left) * ((now / 2600 + rank * 0.37) % 1);
      const runner = ctx.createLinearGradient(runX - 90, 0, runX + 10, 0);
      runner.addColorStop(0, "rgba(255,230,180,0)");
      runner.addColorStop(1, `rgba(255,240,200,${(0.75 * strength).toFixed(3)})`);
      ctx.fillStyle = runner;
      ctx.fillRect(runX - 90, yy - 1.5, 100, 3);
    }
    ctx.restore();
    bands.push({ y: yy, strength, side: row.price < last ? "long" : "short", lots });
    if (rank < 2) {
      const side = row.price < last ? "多單" : "空單";
      tag(ctx, `🔥 ${side}燃料 ${btc(lots)}`, left + (plotRight - left) * 0.34, yy, `rgb(${THEME.fuel})`, "#ffdca0", "left", `rgba(48,20,4,${(0.78 + 0.18 * breath).toFixed(3)})`);
    }
  });
  return bands;
}

// A market push: a wave front sweeps from where the price was to where the order reached, leaving a
// glow behind it. If something unseen absorbed the order, a ghost line marks the price the visible
// book promised (the effects layer shatters the wall).
function drawPushes(ctx, scale, pushes, now) {
  const { left, plotRight, y, x, candles } = scale;
  const liveX = x(Math.max(0, candles.length - 1));
  for (const push of pushes) {
    const age = now - push.born;
    if (age < 0 || age > 1500) continue;
    const grow = Math.min(1, age / 350);
    const ease = 1 - (1 - grow) ** 3;
    const fade = age < 350 ? 1 : Math.max(0, 1 - (age - 350) / 1150);
    const rgb = push.side === "buy" ? THEME.long : THEME.short;
    const front = push.from + (push.to - push.from) * ease;
    const top = Math.min(y(push.from), y(front));
    const height = Math.abs(y(push.from) - y(front));
    ctx.save();
    const trail = ctx.createLinearGradient(0, y(push.from), 0, y(front));
    trail.addColorStop(0, `rgba(${rgb},0)`);
    trail.addColorStop(1, `rgba(${rgb},${(0.3 * fade).toFixed(3)})`);
    ctx.fillStyle = trail;
    ctx.fillRect(left, top, plotRight - left, Math.max(1, height));
    ctx.shadowColor = `rgba(${rgb},${fade.toFixed(3)})`;
    ctx.shadowBlur = 20;
    ctx.fillStyle = `rgba(${rgb},${(0.95 * fade).toFixed(3)})`;
    ctx.fillRect(left, y(front) - 1.5, plotRight - left, 3);
    ctx.fillRect(liveX - 3, top, 6, Math.max(2, height));
    ctx.restore();
    if (!push.stalled || age < 300 || !push.expected) continue;
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = `rgba(${THEME.fuel},${(0.8 * fade).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, y(push.expected));
    ctx.lineTo(plotRight, y(push.expected));
    ctx.stroke();
    ctx.restore();
    ctx.font = `700 10px ${UI}`;
    ctx.fillStyle = `rgba(255,215,122,${fade.toFixed(3)})`;
    ctx.textAlign = "right";
    ctx.fillText(`應推到 ${labelPrice(push.expected)}`, plotRight - 8, y(push.expected) + (push.side === "buy" ? -9 : 11));
  }
}
