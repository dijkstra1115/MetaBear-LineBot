import { FLOW_CANDLE_ORDERS, FLOW_DEFAULT_LIFETIME, FLOW_MODE_LIMIT, FLOW_MODE_TARGET, TakerOnlyMarket } from "./taker-only-engine.js";

const $ = (id) => document.getElementById(id);
const price = (cents) => (cents / 100).toFixed(2);
const amount = (lots) => (lots / 100).toFixed(2);
const count = (number) => number.toLocaleString("zh-TW");
const params = new URL(location.href).searchParams;
const requestedSeed = Number(params.get("seed"));
const initialSeed = Number.isSafeInteger(requestedSeed) && requestedSeed > 0 && requestedSeed <= 0xffffffff ? requestedSeed : 44021;
const requestedLifetime = Number(params.get("lifetime"));
let lifetimeSeconds = Number.isInteger(requestedLifetime) && requestedLifetime >= 5 && requestedLifetime <= 300 && requestedLifetime % 5 === 0
  ? requestedLifetime : FLOW_DEFAULT_LIFETIME;
$("lifetime").value = String(lifetimeSeconds);
let markets = {
  limit: new TakerOnlyMarket(initialSeed, lifetimeSeconds, FLOW_MODE_LIMIT),
  target: new TakerOnlyMarket(initialSeed, lifetimeSeconds, FLOW_MODE_TARGET),
};
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
  markets = {
    limit: new TakerOnlyMarket(seed, lifetimeSeconds, FLOW_MODE_LIMIT),
    target: new TakerOnlyMarket(seed, lifetimeSeconds, FLOW_MODE_TARGET),
  };
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  url.searchParams.set("lifetime", String(lifetimeSeconds));
  history.replaceState(null, "", url);
  $("session-id").textContent = `SEED ${seed}`;
  $("limit-link").href = `./taker-only.html?seed=${seed}&lifetime=${lifetimeSeconds}`;
  accumulated = 0;
  update();
}

function sharedScale() {
  let low = Math.min(markets.limit.last, markets.target.last);
  let high = Math.max(markets.limit.last, markets.target.last);
  let maxDepth = 1;
  for (const market of Object.values(markets)) {
    for (const candle of market.candles) {
      low = Math.min(low, candle.low);
      high = Math.max(high, candle.high);
    }
    for (const snapshot of market.heatmap) {
      for (const level of snapshot.bids) maxDepth = Math.max(maxDepth, level.lots);
      for (const level of snapshot.asks) maxDepth = Math.max(maxDepth, level.lots);
    }
  }
  const padding = Math.max(20, (high - low) * 0.1, Math.max(Math.abs(high), Math.abs(low)) * 0.004);
  return { min: low - padding, max: high + padding, maxDepth };
}

function drawChart(canvas, market, scale) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(rect.width * dpr);
  const pixelHeight = Math.round(rect.height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;
  const left = 55;
  const right = 62;
  const top = 18;
  const bottom = height - 33;
  const plotHeight = bottom - top;
  const plotWidth = width - left - right;
  const y = (value) => top + (scale.max - value) / (scale.max - scale.min) * plotHeight;
  const candles = market.candles;
  const slots = Math.max(20, candles.length);
  const step = plotWidth / slots;
  const start = slots - candles.length;

  ctx.fillStyle = "#0d1b26";
  ctx.fillRect(0, 0, width, height);
  ctx.font = "10px Consolas, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let index = 0; index <= 5; index++) {
    const level = scale.max - (scale.max - scale.min) * index / 5;
    const lineY = y(level);
    ctx.strokeStyle = "#29404b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, lineY + 0.5);
    ctx.lineTo(width - right, lineY + 0.5);
    ctx.stroke();
    ctx.fillStyle = "#8da3ae";
    ctx.fillText(price(level), left - 7, lineY);
  }

  const depthScale = Math.log1p(scale.maxDepth);
  market.heatmap.forEach((snapshot, index) => {
    const x = left + (start + index) * step;
    for (const [levels, color] of [[snapshot.bids, "76,216,188"], [snapshot.asks, "242,120,153"]]) {
      for (const level of levels) {
        if (level.price < scale.min || level.price > scale.max) continue;
        const strength = Math.log1p(level.lots) / depthScale;
        ctx.fillStyle = `rgba(${color},${(0.035 + strength * 0.43).toFixed(3)})`;
        ctx.fillRect(x, y(level.price) - 1.5, Math.ceil(step + 0.5), 3);
      }
    }
  });

  candles.forEach((candle, index) => {
    const x = left + (start + index + 0.5) * step;
    if (!candle.trades) {
      ctx.fillStyle = "#dcb779";
      ctx.fillRect(x - Math.max(1, step * 0.3), y(candle.close), Math.max(2, step * 0.6), 1.5);
      return;
    }
    ctx.strokeStyle = candle.close >= candle.open ? "#d8f7ee" : "#ffa7b8";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y(candle.high));
    ctx.lineTo(x, y(candle.low));
    ctx.stroke();
    const candleWidth = Math.max(2, Math.min(7, step * 0.62));
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
  ctx.fillText(price(market.last), width - right + 6, y(market.last));
  ctx.fillStyle = "#8298a6";
  ctx.font = "9px Consolas, monospace";
  ctx.fillText(candles.length ? `FROM ORDER ${count(candles[0].bucket * FLOW_CANDLE_ORDERS + 1)}` : "WAITING FOR ORDERS", left, height - 12);
  ctx.textAlign = "right";
  ctx.fillText(`${count(market.orders)} ORDERS`, width - right, height - 12);
}

function drawAll() {
  const scale = sharedScale();
  drawChart($("limit-chart"), markets.limit, scale);
  drawChart($("target-chart"), markets.target, scale);
}

function updatePanel(mode) {
  const market = markets[mode];
  const panel = $(`${mode}-panel`);
  const stat = (name) => panel.querySelector(`[data-stat="${name}"]`);
  stat("last").textContent = price(market.last);
  stat("rate").textContent = market.orders ? `${(market.matchedOrders / market.orders * 100).toFixed(1)}%` : "—";
  stat("resting").textContent = amount(market.restingLots);
  stat("expired").textContent = count(market.expiredOrders);
  stat("range").textContent = `成交區間 ${price(market.high - market.low)} USDT`;
  stat("bid").textContent = market.bestBid() == null ? "—" : `${price(market.bestBid())} USDT`;
  stat("ask").textContent = market.bestAsk() == null ? "—" : `${price(market.bestAsk())} USDT`;
  const arrival = market.lastArrival;
  stat("arrival").textContent = !arrival ? "等待委託"
    : `${arrival.side === "buy" ? "買" : "賣"} 1 BEAR · ${arrival.matched ? `成交 ${price(arrival.executionPrice)}` : `掛單 ${price(arrival.price)}`}`;
}

function update() {
  $("shared-orders").textContent = count(markets.limit.orders);
  $("lifetime-value").textContent = `${lifetimeSeconds} 模擬秒`;
  updatePanel("limit");
  updatePanel("target");
  drawAll();
}

function frame(now) {
  const elapsed = Math.min(500, now - lastFrame);
  lastFrame = now;
  if (playing && !document.hidden) {
    accumulated += elapsed;
    const batch = Math.min(100, Math.floor(accumulated / (100 / speed)));
    if (batch) {
      markets.limit.advance(batch);
      markets.target.advance(batch);
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
  markets.limit.setLifetime(lifetimeSeconds);
  markets.target.setLifetime(lifetimeSeconds);
  const url = new URL(location.href);
  url.searchParams.set("lifetime", String(lifetimeSeconds));
  history.replaceState(null, "", url);
  $("limit-link").href = `./taker-only.html?seed=${markets.limit.seed}&lifetime=${lifetimeSeconds}`;
  update();
});
document.addEventListener("visibilitychange", () => { lastFrame = performance.now(); accumulated = 0; syncStatus(); });
new ResizeObserver(drawAll).observe($("limit-chart"));
new ResizeObserver(drawAll).observe($("target-chart"));
setSeed(initialSeed);
syncStatus();
requestAnimationFrame(frame);
