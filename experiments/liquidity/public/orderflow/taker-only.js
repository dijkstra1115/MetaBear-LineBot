import { FLOW_CANDLE_ORDERS, FLOW_DEFAULT_LIFETIME, FLOW_HISTORY, TakerOnlyMarket } from "./taker-only-engine.js";

const $ = (id) => document.getElementById(id);
const price = (cents) => (cents / 100).toFixed(2);
const amount = (lots) => (lots / 100).toFixed(2);
const count = (value) => value.toLocaleString("zh-TW");
const params = new URL(location.href).searchParams;
const requestedSeed = Number(params.get("seed"));
const initialSeed = Number.isSafeInteger(requestedSeed) && requestedSeed > 0 && requestedSeed <= 0xffffffff
  ? requestedSeed : 44021;
const requestedLifetime = Number(params.get("lifetime"));
let lifetimeSeconds = Number.isInteger(requestedLifetime) && requestedLifetime >= 5 && requestedLifetime <= 300 && requestedLifetime % 5 === 0
  ? requestedLifetime : FLOW_DEFAULT_LIFETIME;
$("lifetime").value = String(lifetimeSeconds);
let market = new TakerOnlyMarket(initialSeed, lifetimeSeconds);
let playing = true;
let speed = Number($("speed").value);
let lastFrame = performance.now();
let accumulated = 0;
let lastDraw = 0;

function syncStatus() {
  const active = playing && !document.hidden;
  $("toggle").textContent = playing ? "暫停" : "繼續";
  $("live-status").textContent = active ? "模擬進行中" : playing ? "分頁暫停" : "已暫停";
  $("live-status").classList.toggle("paused", !active);
}

function setSeed(seed) {
  market = new TakerOnlyMarket(seed, lifetimeSeconds);
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  url.searchParams.set("lifetime", String(lifetimeSeconds));
  history.replaceState(null, "", url);
  $("session-id").textContent = `SEED ${seed}`;
  $("compare-link").href = `./taker-compare.html?seed=${seed}&lifetime=${lifetimeSeconds}`;
  accumulated = 0;
  update();
}

function bookRows(side) {
  const levels = market.depth(side, 8);
  if (!levels.length) return '<div class="book-empty">尚無掛單</div>';
  const maxLots = Math.max(...levels.map((level) => level.lots));
  const visible = side === "sell" ? levels.reverse() : levels;
  return visible.map((level) => `<div class="book-row ${side === "sell" ? "ask" : "bid"}" style="--bar:${Math.max(5, level.lots / maxLots * 100).toFixed(1)}%"><span>${price(level.price)}</span><span>${amount(level.lots)}</span></div>`).join("");
}

function drawChart() {
  const canvas = $("market-chart");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const actualWidth = Math.round(rect.width * dpr);
  const actualHeight = Math.round(rect.height * dpr);
  if (canvas.width !== actualWidth || canvas.height !== actualHeight) {
    canvas.width = actualWidth;
    canvas.height = actualHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;
  const left = 62;
  const right = 70;
  const top = 27;
  const bottom = height - 35;
  const plotWidth = width - left - right;
  const plotHeight = bottom - top;
  ctx.fillStyle = "#0d1b26";
  ctx.fillRect(0, 0, width, height);

  const candles = market.candles;
  const snapshots = market.heatmap;
  const visibleLow = Math.min(market.last * 0.987, ...candles.map((candle) => candle.low));
  const visibleHigh = Math.max(market.last * 1.013, ...candles.map((candle) => candle.high));
  const padding = Math.max(15, (visibleHigh - visibleLow) * 0.035);
  const min = visibleLow - padding;
  const max = visibleHigh + padding;
  const y = (value) => top + (max - value) / (max - min) * plotHeight;
  const slots = Math.max(20, candles.length);
  const step = plotWidth / slots;
  const start = slots - candles.length;

  ctx.font = "11px Consolas, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i++) {
    const level = max - (max - min) * i / 5;
    const lineY = y(level);
    ctx.strokeStyle = "#2b404c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, lineY + 0.5);
    ctx.lineTo(width - right, lineY + 0.5);
    ctx.stroke();
    ctx.fillStyle = "#91a7b1";
    ctx.fillText(price(level), left - 8, lineY);
  }

  let maxDepth = 1;
  for (const snapshot of snapshots)
    for (const level of [...snapshot.bids, ...snapshot.asks])
      if (level.price >= min && level.price <= max) maxDepth = Math.max(maxDepth, level.lots);
  const depthScale = Math.log1p(maxDepth);
  snapshots.forEach((snapshot, index) => {
    const x = left + (start + index) * step;
    for (const [levels, color] of [[snapshot.bids, "76,216,188"], [snapshot.asks, "242,120,153"]]) {
      for (const level of levels) {
        if (level.price < min || level.price > max) continue;
        const strength = Math.log1p(level.lots) / depthScale;
        const alpha = (0.035 + strength * 0.43).toFixed(3);
        ctx.fillStyle = `rgba(${color},${alpha})`;
        ctx.fillRect(x, y(level.price) - 1.7, Math.ceil(step + 0.5), 3.4);
      }
    }
  });

  candles.forEach((candle, index) => {
    const x = left + (start + index + 0.5) * step;
    if (!candle.trades) {
      ctx.fillStyle = "#dcb779";
      ctx.fillRect(x - Math.max(1, step * 0.3), y(candle.close), Math.max(2, step * 0.6), 1.4);
      return;
    }
    const color = candle.close >= candle.open ? "#d8f7ee" : "#ffa7b8";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y(candle.high));
    ctx.lineTo(x, y(candle.low));
    ctx.stroke();
    const candleWidth = Math.max(2, Math.min(8, step * 0.62));
    ctx.fillRect(x - candleWidth / 2, Math.min(y(candle.open), y(candle.close)), candleWidth, Math.max(1.5, Math.abs(y(candle.open) - y(candle.close))));
  });

  ctx.strokeStyle = "#dcb779";
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(left, y(market.last));
  ctx.lineTo(width - right, y(market.last));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#dcb779";
  ctx.textAlign = "left";
  ctx.fillText(price(market.last), width - right + 7, y(market.last));
  ctx.fillStyle = "#8298a6";
  ctx.font = "10px Consolas, monospace";
  ctx.fillText(candles.length ? `FROM ORDER ${count(candles[0].bucket * FLOW_CANDLE_ORDERS + 1)}` : "WAITING FOR ORDERS", left, height - 13);
  ctx.textAlign = "right";
  ctx.fillText(`${count(market.orders)} ORDERS`, width - right, height - 13);
}

function update() {
  $("last-price").textContent = price(market.last);
  $("range").textContent = `${((market.high - market.low) / 100).toFixed(2)} USDT`;
  $("orders").textContent = count(market.orders);
  $("trades").textContent = count(market.trades);
  $("resting").textContent = amount(market.restingLots);
  $("expired").textContent = count(market.expiredOrders);
  $("lifetime-value").textContent = `${lifetimeSeconds} 模擬秒`;
  $("spread").textContent = market.spread() == null ? "—" : `${price(market.spread())} USDT`;
  $("asks").innerHTML = bookRows("sell");
  $("bids").innerHTML = bookRows("buy");
  const rate = market.orders ? market.matchedOrders / market.orders * 100 : 0;
  $("match-rate").textContent = market.orders ? `${rate.toFixed(1)}%` : "—";
  $("match-bar").style.width = `${rate}%`;
  const arrival = market.lastArrival;
  if (arrival) {
    const side = arrival.side === "buy" ? "買入" : "賣出";
    const state = arrival.matched && arrival.resting ? "部分成交 · 餘量掛單"
      : arrival.matched ? "全部成交" : "未成交 · 留在簿上";
    $("arrival").innerHTML = `<strong class="${arrival.side}">${side} ${amount(arrival.lots)} BEAR</strong><br>出價 ${price(arrival.price)} USDT · ${state}`;
  }
  const first = market.candles[0]?.bucket * FLOW_CANDLE_ORDERS || 0;
  $("window-label").textContent = market.orders
    ? `${count(first + 1)}–${count(market.orders)} 筆委託 · 每根 ${FLOW_CANDLE_ORDERS} 筆 · 最多 ${FLOW_HISTORY} 根`
    : `等待委託 · 每根 ${FLOW_CANDLE_ORDERS} 筆 · 最多 ${FLOW_HISTORY} 根`;
  drawChart();
}

function frame(now) {
  const elapsed = Math.min(500, now - lastFrame);
  lastFrame = now;
  if (playing && !document.hidden) {
    accumulated += elapsed;
    const batch = Math.min(100, Math.floor(accumulated / (100 / speed)));
    if (batch) {
      market.advance(batch);
      accumulated -= batch * 100 / speed;
      if (now - lastDraw > 80) {
        update();
        lastDraw = now;
      }
    }
  } else accumulated = 0;
  requestAnimationFrame(frame);
}

$("toggle").addEventListener("click", () => {
  playing = !playing;
  syncStatus();
  lastFrame = performance.now();
});
$("restart").addEventListener("click", () => setSeed(crypto.getRandomValues(new Uint32Array(1))[0] || 1));
$("speed").addEventListener("change", () => { speed = Number($("speed").value); accumulated = 0; });
$("lifetime").addEventListener("input", () => {
  lifetimeSeconds = Number($("lifetime").value);
  market.setLifetime(lifetimeSeconds);
  const url = new URL(location.href);
  url.searchParams.set("lifetime", String(lifetimeSeconds));
  history.replaceState(null, "", url);
  $("compare-link").href = `./taker-compare.html?seed=${market.seed}&lifetime=${lifetimeSeconds}`;
  update();
});
document.addEventListener("visibilitychange", () => { lastFrame = performance.now(); accumulated = 0; syncStatus(); });
new ResizeObserver(() => drawChart()).observe($("market-chart"));
setSeed(initialSeed);
syncStatus();
requestAnimationFrame(frame);
