const labelPrice = (cents, digits = 0) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const units = (lots) => (lots / 100).toFixed(lots >= 1000 ? 0 : 1);
const HEAT_COLD = [92, 64, 170];
const HEAT_HOT = [255, 214, 102];
const heat = (t, alpha) => `rgba(${HEAT_COLD.map((cold, index) => Math.round(cold + (HEAT_HOT[index] - cold) * t)).join(",")},${alpha.toFixed(3)})`;

export const ARENA_PRICE_TAG = 70;
export const ARENA_LIQ_COLUMN = 76;
export const ARENA_FOOTPRINT_COLUMN = 148;

export function arenaChartGeometry(canvas, run, view = {}) {
  const rect = canvas.getBoundingClientRect();
  const candles = run.market.candles.slice(-110);
  const last = run.market.last;
  // Keep nearby liquidation bands in view even when the tape has been quiet.
  const rawLow = Math.min(last * 0.982, ...candles.map((candle) => candle.low));
  const rawHigh = Math.max(last * 1.018, ...candles.map((candle) => candle.high));
  const padding = (rawHigh - rawLow) * 0.06;
  const baseLow = rawLow - padding;
  const baseHigh = rawHigh + padding;
  const baseMid = (baseLow + baseHigh) / 2;
  const span = (baseHigh - baseLow) / clamp(view.zoom ?? 1, 0.4, 5);
  const mid = baseMid + (view.offset ?? 0);
  const high = mid + span / 2;
  const low = mid - span / 2;
  const priceTop = 26;
  const priceBottom = rect.height * 0.74;
  const left = 70;
  const plotRight = rect.width - ARENA_PRICE_TAG - ARENA_LIQ_COLUMN - ARENA_FOOTPRINT_COLUMN - 8;
  const y = (price) => priceTop + (high - price) / span * (priceBottom - priceTop);
  const slots = Math.max(40, candles.length + 3);
  const xStep = (plotRight - left) / slots;
  const x = (index) => left + (index + 0.5) * xStep;
  return { rect, candles, baseMid, high, low, span, priceTop, priceBottom, left, plotRight, y, x, xStep };
}

export function arenaChartPriceAtY(canvas, run, view, clientY) {
  const scale = arenaChartGeometry(canvas, run, view);
  const localY = clientY - scale.rect.top;
  if (localY < scale.priceTop || localY > scale.priceBottom) return null;
  const price = scale.high - (localY - scale.priceTop) / (scale.priceBottom - scale.priceTop) * scale.span;
  return clamp(Math.round(price / 1000) * 1000, 100, run.market.maxPrice); // $10 tick for chart orders.
}

function tag(ctx, text, x, y, fill, ink, align = "left") {
  ctx.font = "bold 10px Consolas, monospace";
  const width = ctx.measureText(text).width + 12;
  const left = align === "right" ? x - width : x;
  ctx.fillStyle = fill;
  ctx.fillRect(left, y - 9, width, 18);
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
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

export function drawArenaChart(canvas, run, view = {}) {
  const scale = arenaChartGeometry(canvas, run, view);
  canvas.dataset.zoom = String(view.zoom ?? 1);
  canvas.dataset.priceOffset = String(view.offset ?? 0);
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#091923";
  ctx.fillRect(0, 0, width, height);
  const visible = (price) => price >= low && price <= high;
  const last = run.market.last;

  ctx.font = "10px Consolas, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 6; i++) {
    const value = high - (high - low) * i / 6;
    horizontal(ctx, left, plotRight, Math.round(y(value)) + .5, "#223a44");
    ctx.fillStyle = "#77949d";
    ctx.textAlign = "right";
    ctx.fillText(labelPrice(value), left - 8, y(value));
  }

  // Liquidation bands (default) or the resting-order heatmap behind the candles.
  const bin = Math.max(2000, Math.round(last * 0.001 / 1000) * 1000);
  const levels = run.liquidationLevels(bin).filter((row) => visible(row.price));
  const maxLiq = Math.max(800, ...levels.map((row) => row.long + row.short));
  if ((view.layer ?? "liq") === "liq") {
    for (const row of levels) {
      const t = clamp((row.long + row.short) / maxLiq, 0, 1);
      const top = y(row.price + bin / 2);
      const bandHeight = Math.max(2, y(row.price - bin / 2) - top);
      ctx.fillStyle = heat(t, 0.05 + t * 0.34 + (view.pulse ?? 0) * t * 0.12);
      ctx.fillRect(left, top, plotRight - left, bandHeight);
    }
  } else {
    const snapshots = run.market.heatmap.slice(-candles.length);
    let maxDepth = 1;
    for (const snapshot of snapshots) {
      if (!snapshot) continue;
      for (const level of [...snapshot.bids, ...snapshot.asks]) maxDepth = Math.max(maxDepth, level.lots);
    }
    const depthScale = Math.log1p(maxDepth);
    snapshots.forEach((snapshot, index) => {
      if (!snapshot) return;
      const xx = x(index) - xStep / 2;
      for (const [rows, rgb] of [[snapshot.bids.slice(0, 48), "91,225,190"], [snapshot.asks.slice(0, 48), "250,117,142"]]) {
        for (const level of rows) {
          if (!visible(level.price)) continue;
          const strength = Math.log1p(level.lots) / depthScale;
          ctx.fillStyle = `rgba(${rgb},${(0.035 + strength * .3).toFixed(3)})`;
          ctx.fillRect(xx, y(level.price) - 1.3, Math.ceil(xStep + .5), 2.6);
        }
      }
    });
  }

  candles.forEach((candle, index) => {
    if (!candle.trades) return;
    const xx = x(index);
    const up = candle.close >= candle.open;
    ctx.strokeStyle = up ? "#86edd2" : "#ffa0a9";
    ctx.fillStyle = up ? "#75e4c7" : "#f58296";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xx, y(candle.high));
    ctx.lineTo(xx, y(candle.low));
    ctx.stroke();
    const bodyWidth = Math.max(2, Math.min(9, xStep * .68));
    ctx.fillRect(xx - bodyWidth / 2, Math.min(y(candle.open), y(candle.close)), bodyWidth, Math.max(1.6, Math.abs(y(candle.open) - y(candle.close))));
  });

  const firstBucket = candles[0]?.bucket ?? 0;
  for (const trade of run.market.tradeLog.slice(-900)) {
    if (trade.makerOwner !== "player" && trade.takerOwner !== "player") continue;
    if (trade.bucket < firstBucket || !visible(trade.price)) continue;
    ctx.fillStyle = "#f3ce82";
    ctx.beginPath();
    ctx.arc(x(trade.bucket - firstBucket), y(trade.price), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Forced-order shocks: a glowing bar on the live candle from where the cascade started to where it ended.
  const liveX = x(Math.max(0, candles.length - 1));
  for (const flash of view.flashes ?? []) {
    const fade = clamp(1 - flash.age, 0, 1);
    if (!fade) continue;
    const rgb = flash.side === "short" ? "112,230,201" : "251,127,145";
    const top = y(Math.max(flash.from, flash.to));
    const bottom = y(Math.min(flash.from, flash.to));
    ctx.fillStyle = `rgba(${rgb},${(0.18 * fade).toFixed(3)})`;
    ctx.fillRect(left, top, plotRight - left, Math.max(2, bottom - top));
    ctx.shadowColor = `rgba(${rgb},${fade.toFixed(3)})`;
    ctx.shadowBlur = 18 * fade;
    ctx.fillStyle = `rgba(${rgb},${(0.85 * fade).toFixed(3)})`;
    ctx.fillRect(liveX - 5, top, 10, Math.max(3, bottom - top));
    ctx.shadowBlur = 0;
    horizontal(ctx, left, plotRight, y(flash.to), `rgba(${rgb},${(0.9 * fade).toFixed(3)})`, [], 1.5);
  }

  // Player reference lines: average entry, liquidation, stop and take.
  const account = run.account;
  if (account.position) {
    const long = account.position > 0;
    if (visible(account.entry)) {
      horizontal(ctx, left, plotRight, y(account.entry), "#f3c577", [6, 4], 1.2);
      tag(ctx, `你的均價 ${labelPrice(account.entry)}`, left + 6, y(account.entry) - 12, "#3b3222e6", "#f7d58e");
    }
    const liq = run.playerLiquidationPrice();
    if (liq && visible(liq)) {
      horizontal(ctx, left, plotRight, y(liq), "#ff5f7a", [2, 3], 1.6);
      tag(ctx, `你的強平 ${labelPrice(liq)}`, left + 6, y(liq) + (long ? 12 : -12), "#4a1d2ae6", "#ffb3bf");
    }
    for (const [price, label, color] of [[run.protection.stop, "止損", "#fb7f91"], [run.protection.take, "止盈", "#70e6c9"]]) {
      if (price == null || !visible(price)) continue;
      horizontal(ctx, left, plotRight, y(price), color, [8, 5]);
      tag(ctx, `${label} ${labelPrice(price)}`, plotRight - 4, y(price) - 11, "#12242de6", color, "right");
    }
  }
  for (const order of run.playerOrders()) {
    if (!visible(order.price)) continue;
    horizontal(ctx, left, plotRight, y(order.price), order.side === "buy" ? "#70e6c9aa" : "#fb7f91aa", [3, 3]);
    tag(ctx, `掛${order.side === "buy" ? "買" : "賣"} ${units(order.lots)}`, plotRight - 4, y(order.price), "#12242de6", order.side === "buy" ? "#9ff3dc" : "#ffb3bf", "right");
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
    if (account.position) {
      const pnl = account.position * (run.markPrice() - account.entry) / 10000;
      const text = `${pnl >= 0 ? "+" : "−"}$${Math.abs(Math.round(pnl)).toLocaleString("en-US")}`;
      tag(ctx, text, plotRight - 4, lastY + (lastY > priceTop + 30 ? -20 : 20), pnl >= 0 ? "#135646f0" : "#5a2331f0", pnl >= 0 ? "#b6ffe6" : "#ffd0d7", "right");
    }
  }

  if (view.cursorPrice != null && visible(view.cursorPrice)) {
    const yy = y(view.cursorPrice);
    horizontal(ctx, left, plotRight, yy, view.cursorPrice < last ? "#70e6c9" : "#fb7f91", [3, 4]);
    ctx.textAlign = "left";
    ctx.fillStyle = "#e7f6ee";
    ctx.font = "bold 11px Consolas, monospace";
    ctx.fillText(`${view.cursorPrice < last ? "掛買" : "掛賣"} ${labelPrice(view.cursorPrice)} · ${view.size ?? 1} 單位`, left + 8, clamp(yy - 12, priceTop + 12, priceBottom - 6));
  }

  const volumeTop = priceBottom + 10;
  const volumeBottom = height * .84;
  const cvdTop = height * .87;
  const cvdBottom = height - 24;
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
  ctx.fillText("CVD", 10, cvdTop + 8);
  const maxVolume = Math.max(1, ...candles.map((candle) => candle.volume));
  candles.forEach((candle, index) => {
    const barHeight = candle.volume / maxVolume * (volumeBottom - volumeTop);
    ctx.fillStyle = candle.delta >= 0 ? "#48ad9e9c" : "#ca6a7e9c";
    ctx.fillRect(x(index) - Math.max(1, xStep * .32), volumeBottom - barHeight, Math.max(2, xStep * .64), barHeight);
  });
  const cvds = candles.map((candle) => candle.cvd);
  let cvdLow = Math.min(...cvds);
  let cvdHigh = Math.max(...cvds);
  if (cvdLow === cvdHigh) { cvdLow--; cvdHigh++; }
  const cvdY = (value) => cvdTop + (cvdHigh - value) / (cvdHigh - cvdLow) * (cvdBottom - cvdTop);
  ctx.strokeStyle = "#d5ae73";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  cvds.forEach((value, index) => {
    if (index) ctx.lineTo(x(index), cvdY(value)); else ctx.moveTo(x(index), cvdY(value));
  });
  ctx.stroke();

  // Liquidation map column: forced buys sit above the price, forced sells below.
  const liqX = plotRight + ARENA_PRICE_TAG + 2;
  const liqWidth = ARENA_LIQ_COLUMN - 8;
  ctx.fillStyle = "#0d202a";
  ctx.fillRect(liqX - 2, 0, liqWidth + 4, height);
  ctx.fillStyle = "#c9b27a";
  ctx.font = "bold 9px Consolas, monospace";
  ctx.textAlign = "left";
  ctx.fillText("爆倉地圖", liqX + 4, 14);
  for (const row of levels) {
    const lots = row.long + row.short;
    const t = clamp(lots / maxLiq, 0, 1);
    const yy = y(row.price);
    if (yy < priceTop || yy > priceBottom) continue;
    const barWidth = Math.max(2, t * (liqWidth - 4));
    ctx.fillStyle = row.short >= row.long ? `rgba(112,230,201,${(0.35 + t * .6).toFixed(3)})` : `rgba(251,127,145,${(0.35 + t * .6).toFixed(3)})`;
    ctx.fillRect(liqX + liqWidth - barWidth, yy - 2, barWidth, 4);
    if (t > 0.45) {
      ctx.fillStyle = "#f7e6b5";
      ctx.font = "9px Consolas, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${units(lots)}`, liqX + 2, yy - 7);
    }
  }
  ctx.fillStyle = "#6f9aa0";
  ctx.font = "8px Consolas, monospace";
  ctx.fillText("↑ 空單強平", liqX + 3, priceTop + 6);
  ctx.fillText("↓ 多單強平", liqX + 3, priceBottom - 4);

  const footprintX = liqX + liqWidth + 8;
  const footprintWidth = width - footprintX - 6;
  ctx.fillStyle = "#122b35";
  ctx.fillRect(footprintX, 0, footprintWidth, height);
  ctx.textAlign = "left";
  ctx.fillStyle = "#a5c9c3";
  ctx.font = "bold 10px Consolas, monospace";
  ctx.fillText("FOOTPRINT 30s", footprintX + 5, 14);
  ctx.font = "9px Consolas, monospace";
  ctx.fillStyle = "#77969d";
  ctx.fillText("SELL", footprintX + 4, 30);
  ctx.textAlign = "right";
  ctx.fillText("BUY", width - 10, 30);
  const footBin = Math.max(5000, Math.round((high - low) / Math.max(8, (priceBottom - priceTop) / 22) / 5000) * 5000);
  const rows = run.footprint(30, footBin).filter((row) => visible(row.price));
  const maxRow = Math.max(100, ...rows.map((row) => row.buy + row.sell));
  for (const row of rows) {
    const yy = y(row.price);
    if (yy < 40 || yy > priceBottom - 5) continue;
    const intensity = (row.buy + row.sell) / maxRow;
    ctx.fillStyle = `rgba(112,230,201,${(intensity * .16).toFixed(3)})`;
    ctx.fillRect(footprintX + 2, yy - 8, footprintWidth - 4, 16);
    ctx.font = "10px Consolas, monospace";
    ctx.fillStyle = "#ff9aa8";
    ctx.textAlign = "left";
    ctx.fillText(String(Math.round(row.sell / 100)), footprintX + 5, yy);
    ctx.fillStyle = "#8feccc";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(row.buy / 100)), width - 10, yy);
    ctx.fillStyle = "#a9c1bd";
    ctx.textAlign = "center";
    ctx.font = "9px Consolas, monospace";
    ctx.fillText(labelPrice(row.price), footprintX + footprintWidth / 2, yy);
  }
  ctx.font = "9px Consolas, monospace";
  ctx.fillStyle = "#8aa8aa";
  ctx.textAlign = "right";
  ctx.fillText(`${Math.max(0, run.time)} / ${run.duration}s`, plotRight, height - 10);
}
