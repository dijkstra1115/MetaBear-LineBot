import { ARENA_CONTRACT_BTC, ARENA_MAX_DRAWDOWN, ARENA_START_BALANCE, ARENA_VERSION, FlowArenaRun } from "./flow-arena-engine.js";
import { arenaChartGeometry, arenaChartPriceAtY, drawArenaChart } from "./flow-arena-chart.js";

const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => Number(value).toLocaleString("zh-TW", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (value, digits = 2) => `${value >= 0 ? "+" : "−"}${fmt(Math.abs(value), digits)}`;
const money = (value) => `${value >= 0 ? "+" : "−"}$${fmt(Math.abs(value), 0)}`;
const compactMoney = (value) => {
  const abs = Math.abs(value);
  const text = abs >= 1e6 ? `${fmt(abs / 1e6, 2)}M` : abs >= 1e3 ? `${fmt(abs / 1e3, 1)}K` : fmt(abs, 0);
  return `$${text}`;
};
const price = (cents) => fmt(cents / 100);
const size = (lots) => fmt(lots / 100, lots % 100 === 0 ? 0 : 2);
const btc = (lots) => `${fmt(lots / 100, lots >= 1000 ? 0 : 1)} BTC`;
const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const numberClass = (value) => value > 0 ? "positive" : value < 0 ? "negative" : "";
const grade = (score, qualified = true) => !qualified ? "D" : score >= 250 ? "S" : score >= 120 ? "A" : score >= 50 ? "B" : score > 0 ? "C" : "D";
const STORAGE_KEY = "metabear-flow-arena-v4";
const PROFILE_KEY = "metabear-flow-arena-handle";
const SOUND_KEY = "metabear-flow-arena-sound";
const UNIT_SIZES = [10, 25, 50, 100];
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
}

function encodeChallenge(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeChallenge(encoded) {
  try {
    if (!encoded || encoded.length > 4000) return null;
    const bytes = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data.version !== ARENA_VERSION || !Number.isSafeInteger(data.seed) || data.seed < 1 || data.seed > 0xffffffff || !Number.isFinite(data.score) || data.score < 0 || data.score > 1e7 || !Array.isArray(data.path) || data.path.length > 64) return null;
    return { seed: data.seed, score: Math.round(data.score), name: String(data.name || "匿名交易者").slice(0, 18), path: data.path.filter(Number.isFinite).slice(0, 64) };
  } catch { return null; }
}

function loadRecords() {
  try {
    const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(rows) ? rows.filter((row) => row.version === ARENA_VERSION && Number.isSafeInteger(row.seed) && Number.isFinite(row.score)).slice(0, 40) : [];
  } catch { return []; }
}

function loadSoundPreference() {
  try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; }
}

let records = loadRecords();
let ghost = decodeChallenge(new URL(location.href).searchParams.get("challenge"));
let mode = ghost ? "shadow" : "random";
let run = new FlowArenaRun(ghost?.seed ?? randomSeed());
let playing = false;
let unitSize = 25;
const chartView = { zoom: 1, offset: 0, cursorPrice: null, size: unitSize, layer: "liq", flashes: [], pulse: 0 };
let chartDrag = null;
let combo = 0;
let soundEnabled = loadSoundPreference();
let audio = null;
let lastFrame = performance.now();
let accumulated = 0;
let lastRender = 0;
let seenEvent = null;
let eventTimer = null;
let burstTimer = null;
let previousRealized = 0;
let displayedEquity = ARENA_START_BALANCE;
let lastTickEquity = ARENA_START_BALANCE;
let lastEquityTick = 0;
let seenFeedId = run.feedId;
let feedRenderedId = null;
let seenExecution = null;
let peakShown = ARENA_START_BALANCE;

function setMessage(message, error = false) {
  $("order-message").textContent = message;
  $("order-message").classList.toggle("error", error);
}

/* ---------- Sound ---------- */

function audioContext() {
  if (!soundEnabled) return null;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    return audio;
  } catch { return null; }
}

function tone(frequency = 520, duration = 0.1, wave = "sine", volume = 0.05, slideTo = null) {
  const context = audioContext();
  if (!context) return;
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  } catch { /* Audio is optional. */ }
}

// Low thump plus a noise burst; strength 0–1 scales depth and length.
function boom(strength = 0.5) {
  const context = audioContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const length = 0.18 + strength * 0.35;
    tone(110 + strength * 40, length, "sine", 0.09 + strength * 0.08, 38);
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * length), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900 + strength * 1400, now);
    gain.gain.setValueAtTime(0.05 + strength * 0.07, now);
    noise.buffer = buffer;
    noise.connect(filter).connect(gain).connect(context.destination);
    noise.start(now);
  } catch { /* Audio is optional. */ }
}

function chime(step = 0) {
  const base = 660 * 2 ** (Math.min(step, 8) / 12);
  tone(base, 0.12, "triangle", 0.045);
  setTimeout(() => tone(base * 1.5, 0.16, "triangle", 0.04), 70);
}

/* ---------- Effects ---------- */

function chartPoint(priceCents) {
  const geometry = arenaChartGeometry($("market-chart"), run, chartView);
  const yy = Math.max(geometry.priceTop + 14, Math.min(geometry.priceBottom - 14, geometry.y(priceCents)));
  return { x: geometry.x(Math.max(0, geometry.candles.length - 1)), y: yy, geometry };
}

function particles(x, y, color, count = 14, spread = 260) {
  if (reducedMotion) return;
  const layer = $("particle-layer");
  for (let i = 0; i < count; i++) {
    const particle = document.createElement("i");
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.setProperty("--dx", `${(Math.random() - 0.5) * spread}px`);
    particle.style.setProperty("--dy", `${(Math.random() - 0.7) * spread * 0.7}px`);
    particle.style.background = color;
    particle.style.color = color;
    layer.append(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

function floatLabel(text, x, y, tone = "mint", big = false) {
  const layer = $("fx-layer");
  const label = document.createElement("div");
  label.className = `fx-label ${tone}${big ? " big" : ""}`;
  label.textContent = text;
  label.style.left = `${x}px`;
  label.style.top = `${y}px`;
  layer.append(label);
  label.addEventListener("animationend", () => label.remove(), { once: true });
  while (layer.children.length > 14) layer.firstChild.remove();
}

function ring(x, y, tone = "mint", strength = 0.5) {
  if (reducedMotion) return;
  const layer = $("fx-layer");
  const shock = document.createElement("span");
  shock.className = `fx-ring ${tone}`;
  shock.style.left = `${x}px`;
  shock.style.top = `${y}px`;
  shock.style.setProperty("--ring", `${120 + strength * 260}px`);
  layer.append(shock);
  shock.addEventListener("animationend", () => shock.remove(), { once: true });
}

function shake(level = 1) {
  if (reducedMotion) return;
  const panel = document.querySelector(".market-panel");
  panel.classList.remove("shake-1", "shake-2", "shake-3");
  void panel.offsetWidth;
  panel.classList.add(`shake-${Math.max(1, Math.min(3, level))}`);
}

function flashScreen(tone = "mint", strength = 0.5) {
  const overlay = $("flash-overlay");
  overlay.className = `flash-overlay ${tone}`;
  overlay.style.setProperty("--flash", String(Math.min(0.55, 0.14 + strength * 0.4)));
  void overlay.offsetWidth;
  overlay.classList.add("on");
}

function banner(text, tone = "gold") {
  const box = $("combo-banner");
  box.textContent = text;
  box.className = `combo-banner ${tone}`;
  box.hidden = false;
  box.style.animation = "none";
  void box.offsetWidth;
  box.style.animation = "";
  clearTimeout(box.hideTimer);
  box.hideTimer = setTimeout(() => { box.hidden = true; }, 1700);
}

function showEvent(event) {
  const box = $("chart-event");
  clearTimeout(eventTimer);
  box.classList.toggle("coral", event.tone === "coral");
  box.classList.toggle("amber", event.tone === "amber");
  $("chart-event-title").textContent = event.title;
  $("chart-event-detail").textContent = event.detail;
  box.hidden = false;
  box.style.animation = "none";
  void box.offsetWidth;
  box.style.animation = "";
  eventTimer = setTimeout(() => { box.hidden = true; }, 2300);
  if (event.tone === "amber" || event.tone === "coral") shake(1);
  if (event.tone !== "neutral") tone(event.tone === "mint" ? 640 : 220, 0.2, "triangle", 0.04);
}

function showCash(value) {
  const box = $("pnl-burst");
  clearTimeout(burstTimer);
  box.textContent = money(value);
  box.className = `pnl-burst ${value >= 0 ? "gain" : "loss"}`;
  box.hidden = false;
  box.style.animation = "none";
  void box.offsetWidth;
  box.style.animation = "";
  burstTimer = setTimeout(() => { box.hidden = true; }, 1400);
  const chart = $("market-chart").getBoundingClientRect();
  if (value > 0) {
    combo++;
    if (combo > 1) banner(`${combo}× 連續獲利`, "gold");
    particles(chart.width * 0.45, chart.height * 0.34, "#f6d78c", Math.min(40, 14 + combo * 5), 380);
    chime(combo);
  } else {
    combo = 0;
    particles(chart.width * 0.45, chart.height * 0.34, "#ff879d", 8, 200);
    tone(200, 0.22, "sawtooth", 0.035, 120);
  }
}

// Every new forced-order wave gets a label at its price, a shock line on the chart and a thump.
function processLiquidations() {
  const fresh = run.liquidationFeed.filter((item) => item.id > seenFeedId && !item.warm);
  if (!fresh.length) return;
  seenFeedId = fresh.at(-1).id;
  const now = performance.now();
  let wave = 0;
  let ignitedValue = 0;
  let maxChain = 0;
  for (const item of fresh) {
    wave += item.lots;
    maxChain = Math.max(maxChain, item.chain);
    if (item.ignited) ignitedValue += item.value;
    chartView.flashes.push({ from: item.from, to: item.to, side: item.side, born: now, age: 0 });
    const point = chartPoint(item.to);
    const toneName = item.side === "short" ? "mint" : "coral";
    const strength = Math.min(1, item.lots / 3000);
    floatLabel(`💥 ${item.side === "short" ? "空單" : "多單"}爆倉 ${btc(item.lots)}`, point.x - 12, point.y, toneName, item.lots >= 1500);
    ring(point.x, point.y, toneName, strength);
    particles(point.x, point.y, item.side === "short" ? "#8bf2c8" : "#ff879d", Math.round(8 + strength * 26), 180 + strength * 260);
  }
  chartView.flashes = chartView.flashes.slice(-8);
  const strength = Math.min(1, wave / 3500);
  shake(wave >= 2500 ? 3 : wave >= 1000 ? 2 : 1);
  flashScreen(fresh.at(-1).side === "short" ? "mint" : "coral", strength);
  boom(strength);
  if (maxChain >= 2) {
    banner(`連環爆倉 ×${maxChain}`, fresh.at(-1).side === "short" ? "mint" : "coral");
    setTimeout(() => tone(520 + maxChain * 60, 0.14, "square", 0.025), 90);
  }
  if (ignitedValue > 0) {
    banner(`🔥 你引爆了 ${compactMoney(ignitedValue)} 強平`, "gold");
    $("ignited-total").classList.remove("pop");
    void $("ignited-total").offsetWidth;
    $("ignited-total").classList.add("pop");
  }
}

function processExecution() {
  const execution = run.lastExecution;
  if (!execution || execution === seenExecution) return;
  seenExecution = execution;
  const point = chartPoint(run.market.last);
  const up = execution.impact >= 0;
  if (Math.abs(execution.impact) >= 0.15) {
    floatLabel(`推動 ${up ? "+" : ""}${execution.impact.toFixed(2)}%`, point.x - 40, point.y + (up ? 26 : -26), up ? "mint" : "coral", Math.abs(execution.impact) >= 1);
    ring(point.x, point.y, up ? "mint" : "coral", Math.min(1, Math.abs(execution.impact) / 2));
  }
  if (execution.lots >= 2500) shake(execution.lots >= 5000 ? 2 : 1);
  $("last-slippage").textContent = `${execution.slippage >= 0 ? "" : "−"}${fmt(Math.abs(execution.slippage), 2)}%`;
  $("last-slippage").className = execution.slippage > 0.5 ? "negative" : "";
}

/* ---------- Rendering ---------- */

function renderBook() {
  const asks = run.market.depth("sell", 6).reverse();
  const bids = run.market.depth("buy", 6);
  const makeRows = (levels, sideName) => {
    let sum = 0;
    const totals = levels.map((level) => (sum += level.lots));
    const max = Math.max(1, ...totals);
    return levels.map((level, index) => `<div class="book-row ${sideName}" style="--bar:${Math.round(totals[index] / max * 100)}%"><span>${price(level.price)}</span><span>${size(level.lots)}</span><span>${size(totals[index])}</span></div>`).join("");
  };
  $("book-asks").innerHTML = asks.length ? makeRows(asks, "ask") : `<p class="empty-state">賣方暫無掛單</p>`;
  $("book-bids").innerHTML = bids.length ? makeRows(bids, "bid") : `<p class="empty-state">買方暫無掛單</p>`;
  $("book-last").textContent = price(run.market.last);
  $("book-depth-label").textContent = `${size(run.market.restingLots)} 單位掛單中`;
}

function renderTape() {
  const trades = run.market.tradeLog.slice(-12).reverse();
  $("tape-rows").innerHTML = trades.length ? trades.map((trade) => {
    const own = trade.makerOwner === "player" || trade.takerOwner === "player";
    const forced = trade.takerOwner === "liquidation";
    return `<div class="tape-row ${trade.aggressorSide}${own ? " own" : ""}${forced ? " forced" : ""}"><span>${clock(Math.max(0, trade.time))}</span><span>${price(trade.price)}</span><span>${size(trade.lots)}${own ? " ◆" : forced ? " ⚡" : ""}</span></div>`;
  }).join("") : `<p class="empty-state">等待第一筆成交</p>`;
}

function renderOrders() {
  const orders = run.playerOrders();
  const container = $("player-orders");
  container.replaceChildren();
  if (!orders.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "目前沒有掛單";
    container.append(empty);
    return;
  }
  for (const order of orders) {
    const row = document.createElement("div");
    row.className = "player-order";
    const label = document.createElement("span");
    label.textContent = `${order.side === "buy" ? "買" : "賣"} ${size(order.lots)} @ ${price(order.price)}`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "撤單 ✕";
    button.dataset.cancel = String(order.id);
    row.append(label, button);
    container.append(row);
  }
}

function renderBoard() {
  const container = $("leaderboard-list");
  container.replaceChildren();
  const top = records.filter((row) => row.mode === "random").sort((a, b) => b.score - a.score).slice(0, 5);
  if (!top.length) {
    const empty = document.createElement("p");
    empty.className = "board-empty";
    empty.textContent = "完成一局後，成績會出現在這裡。點紀錄可重玩同一市場。";
    container.append(empty);
    return;
  }
  for (const [index, record] of top.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "board-entry";
    button.dataset.record = String(record.id);
    const rank = document.createElement("span"); rank.className = "rank"; rank.textContent = grade(record.score, record.qualified);
    const label = document.createElement("span"); label.className = "run-id"; label.textContent = `市場 #${String(record.seed).slice(-5)}`;
    const score = document.createElement("strong"); score.textContent = record.score.toLocaleString("zh-TW");
    const detail = document.createElement("small"); detail.textContent = `${signed(record.roi)}% · 引爆 ${compactMoney(record.ignitedValue ?? 0)} · ${index === 0 ? "最佳" : "挑戰"}`;
    button.append(rank, label, score, detail);
    container.append(button);
  }
}

function renderFuel() {
  const fuel = run.fuel(0.03);
  const scale = Math.max(3000, fuel.long, fuel.short);
  const mark = run.markPrice();
  $("fuel-short").textContent = btc(fuel.short);
  $("fuel-long").textContent = btc(fuel.long);
  $("fuel-short-bar").style.width = `${Math.min(100, fuel.short / scale * 100)}%`;
  $("fuel-long-bar").style.width = `${Math.min(100, fuel.long / scale * 100)}%`;
  $("fuel-short-peak").textContent = fuel.shortPeak ? `最亮 ${price(fuel.shortPeak.price)} · +${fmt((fuel.shortPeak.price / mark - 1) * 100)}% · ${btc(fuel.shortPeak.lots)}` : "上方 3% 內沒有明顯亮帶";
  $("fuel-long-peak").textContent = fuel.longPeak ? `最亮 ${price(fuel.longPeak.price)} · −${fmt((1 - fuel.longPeak.price / mark) * 100)}% · ${btc(fuel.longPeak.lots)}` : "下方 3% 內沒有明顯亮帶";
  $("open-interest").textContent = btc(run.openInterest());
  // The nearest bright band glows when the price is about to reach it.
  const near = [fuel.shortPeak, fuel.longPeak].filter(Boolean).map((peak) => Math.abs(peak.price / mark - 1));
  chartView.pulse = near.length && Math.min(...near) < 0.004 ? 1 : 0;
}

// Rebuild only when a new wave arrives, and animate just the rows that are new.
function renderFeed() {
  const items = run.liquidationFeed.filter((item) => !item.warm).slice(-7).reverse();
  const latest = items[0]?.id ?? 0;
  if (latest === feedRenderedId) return;
  const previous = feedRenderedId ?? latest;
  feedRenderedId = latest;
  const container = $("liq-feed");
  if (!items.length) {
    container.innerHTML = `<p class="empty-state">還沒有人被強平</p>`;
    return;
  }
  container.innerHTML = items.map((item) => {
    const move = (item.to / item.from - 1) * 100;
    return `<div class="liq-row ${item.side}${item.ignited ? " ignited" : ""}${item.id > previous ? " fresh" : ""}"><span>${clock(Math.max(0, item.time))}</span><strong>${item.side === "short" ? "空單" : "多單"} ${btc(item.lots)}</strong><em>${move >= 0 ? "+" : ""}${fmt(move)}%${item.chain > 1 ? ` ×${item.chain}` : ""}</em>${item.ignited ? "<b>你引爆</b>" : ""}</div>`;
  }).join("");
}

function renderPreview() {
  const last = run.market.last;
  const levels = run.liquidationLevels(Math.max(2000, Math.round(last * 0.001 / 1000) * 1000));
  for (const side of ["buy", "sell"]) {
    const preview = run.previewOrder(side, "market", unitSize * 100);
    const box = $(side === "buy" ? "preview-buy" : "preview-sell");
    if (!preview?.worstPrice) { box.textContent = `${side === "buy" ? "買入" : "賣出"}：對手盤不足`; continue; }
    const move = (preview.worstPrice / last - 1) * 100;
    const crossed = levels.reduce((sum, row) => side === "buy"
      ? sum + (row.price > last && row.price <= preview.worstPrice ? row.short : 0)
      : sum + (row.price < last && row.price >= preview.worstPrice ? row.long : 0), 0);
    box.innerHTML = `${side === "buy" ? "▲" : "▼"} ${unitSize} BTC 推到 <b>${price(preview.worstPrice)}</b> (${move >= 0 ? "+" : ""}${fmt(move)}%)${crossed ? ` · <strong>穿過 ${btc(crossed)} ${side === "buy" ? "空單" : "多單"}強平</strong>` : ""}`;
    box.classList.toggle("hot", crossed >= 800);
  }
}

function render() {
  const market = run.market;
  const account = run.account;
  const equity = run.equity();
  const pnl = equity - ARENA_START_BALANCE;
  const roi = (equity / ARENA_START_BALANCE - 1) * 100;
  const utilizationFactor = 1 / (1 + Math.max(0, run.peakExposure - 100) / 100);
  const liveScore = Math.round(Math.max(0, roi) * Math.max(0, 1 - run.maxDrawdown / ARENA_MAX_DRAWDOWN) * utilizationFactor * 100);
  const priceChange = (market.last / run.startPrice - 1) * 100;
  const mark = run.markPrice();
  const floating = account.position * (mark - account.entry) * ARENA_CONTRACT_BTC / 10000;
  $("mode-badge").textContent = mode === "random" ? "未知隨機市場" : mode === "shadow" ? `影子挑戰 / ${ghost?.name ?? "玩家"}` : "練習重玩";
  $("seed-label").textContent = mode === "random" && !run.finished ? "SEED HIDDEN" : `SEED ${run.seed}`;
  const remaining = Math.max(0, run.duration - run.time);
  $("clock").textContent = clock(remaining);
  $("clock").classList.toggle("urgent", remaining <= 15 && !run.finished);
  $("clock-fill").style.width = `${Math.min(100, run.time / run.duration * 100)}%`;
  $("run-status").innerHTML = `<i></i> ${run.finished ? "已結算" : playing && !document.hidden ? "市場運行中" : document.hidden ? "分頁暫停" : "已暫停"}`;
  $("play-button").textContent = run.finished ? "▶ 再開一局" : playing ? "Ⅱ 暫停" : run.time ? "▶ 繼續" : "▶ 開始交易";
  $("last-price").textContent = price(market.last);
  $("price-change").textContent = `${signed(priceChange)}%`;
  $("price-change").className = numberClass(priceChange);
  $("mark-price").textContent = price(mark);
  $("spread").textContent = market.spread() == null ? "—" : price(market.spread());
  $("liq-total").textContent = btc(run.stats.liquidatedLong + run.stats.liquidatedShort);
  $("cvd-value").textContent = signed(market.cvd / 100, 0);
  $("cvd-value").className = numberClass(market.cvd);
  $("hud-pnl").textContent = `${money(pnl)} · ${signed(roi)}%`;
  $("hud-pnl").className = numberClass(pnl);
  $("ignited-total").textContent = compactMoney(run.stats.ignitedValue);
  $("ignited-units").textContent = `${btc(run.stats.ignitedLots)} · 最大連環 ${btc(run.stats.biggestCascade)}`;
  $("floating-pnl").innerHTML = `${signed(floating)} <span>浮動損益</span>`;
  $("floating-pnl").className = `floating-pnl ${numberClass(floating)}`;
  $("position").textContent = account.position ? `${account.position > 0 ? "多" : "空"} ${size(Math.abs(account.position))} BTC` : "空倉";
  $("position").className = account.position > 0 ? "positive" : account.position < 0 ? "negative" : "";
  $("entry-price").textContent = account.position ? price(account.entry) : "—";
  const liq = run.playerLiquidationPrice();
  $("player-liq").textContent = liq ? `${price(liq)} (${fmt(Math.abs(liq / mark - 1) * 100, 1)}%)` : "—";
  $("player-liq").className = liq && Math.abs(liq / mark - 1) < 0.02 ? "negative" : "";
  $("realized").textContent = signed(account.realized - account.fees);
  $("realized").className = numberClass(account.realized - account.fees);
  $("exposure-value").textContent = `$${fmt(run.exposure(), 0)}`;
  const utilization = run.exposureRatio() * 100;
  $("utilization").textContent = `${fmt(utilization, 0)}%`;
  $("utilization-fill").style.width = `${Math.min(100, utilization)}%`;
  $("utilization-fill").classList.toggle("overused", utilization > 100);
  const hud = $("position-hud");
  hud.hidden = !account.position;
  if (account.position) {
    $("position-hud-side").textContent = `${account.position > 0 ? "多" : "空"} ${size(Math.abs(account.position))} BTC @ ${price(account.entry)}`;
    $("position-hud-pnl").textContent = money(floating);
    $("position-hud-roe").textContent = `${signed((mark / account.entry - 1) * 100 * Math.sign(account.position))}%`;
    hud.className = `position-hud ${floating >= 0 ? "gain" : "loss"}`;
  }
  const exitWarning = $("exit-warning");
  exitWarning.hidden = !run.exitIntent;
  if (run.exitIntent) {
    const reason = run.exitIntent.reason === "stop" ? "止損" : run.exitIntent.reason === "take" ? "止盈" : "平倉";
    exitWarning.textContent = `${reason}已觸發 · 後備深度已吃完，剩餘 ${size(Math.abs(account.position))} BTC 下一秒繼續出場。`;
    $("protection-status").textContent = `${reason}已觸發，等待流動性`;
  } else if (!account.position) $("protection-status").textContent = "尚未設定";
  $("live-score").textContent = String(liveScore).padStart(4, "0");
  $("live-grade").textContent = `評級 ${liveScore ? grade(liveScore) : "—"}`;
  $("roi").textContent = `${signed(roi)}%`;
  $("roi").className = numberClass(roi);
  $("mdd").textContent = `${fmt(run.maxDrawdown)}%`;
  $("peak-exposure").textContent = `${fmt(run.peakExposure, 1)}%`;
  $("utilization-factor").textContent = `${fmt(utilizationFactor, 2)}×`;
  $("score-fill").style.width = `${Math.min(100, liveScore / Math.max(250, ghost?.score ?? 250) * 100)}%`;
  const ghostBox = $("ghost-comparison");
  ghostBox.hidden = mode !== "shadow" || !ghost;
  if (ghost && mode === "shadow") {
    const reference = ghost.path[Math.min(ghost.path.length - 1, Math.floor(run.time / 4))];
    ghostBox.textContent = `影子目標 ${ghost.score.toLocaleString("zh-TW")} 分 · 同時點權益 ${reference ? fmt(reference, 0) : "—"}`;
  }
  $("ticker-time").textContent = clock(Math.max(0, run.time));
  const latestEvent = run.events[0];
  if (latestEvent && latestEvent !== seenEvent) {
    seenEvent = latestEvent;
    $("ticker-text").textContent = `${latestEvent.title} · ${latestEvent.detail}`;
    if (!["新市場形成", "回合結算", "獲利落袋", "認賠出場", "你推動了市場", "大額成交"].includes(latestEvent.title)) showEvent(latestEvent);
  }
  if (Math.abs(account.realized - previousRealized) > 4) showCash(account.realized - previousRealized);
  previousRealized = account.realized;
  processExecution();
  processLiquidations();
  if (document.querySelector(".market-details").open) { renderBook(); renderTape(); }
  renderFuel();
  renderFeed();
  renderPreview();
  renderOrders();
}

// Equity counters roll every frame so gains visibly climb instead of jumping.
function animateEquity(now) {
  const equity = run.equity();
  const gap = equity - displayedEquity;
  displayedEquity = Math.abs(gap) < 0.5 ? equity : displayedEquity + gap * 0.16;
  const hudEquity = $("hud-equity");
  const difference = displayedEquity - ARENA_START_BALANCE;
  hudEquity.textContent = fmt(displayedEquity, 0);
  for (const element of [hudEquity, $("equity")]) {
    element.classList.toggle("positive", difference >= 0.5);
    element.classList.toggle("negative", difference <= -0.5);
  }
  $("equity").textContent = fmt(displayedEquity);
  if (now - lastEquityTick > 280) {
    const change = equity - lastTickEquity;
    if (Math.abs(change) >= 800 && playing) {
      const tick = document.createElement("span");
      tick.className = change > 0 ? "gain" : "loss";
      tick.textContent = money(change);
      $("equity-ticks").append(tick);
      tick.addEventListener("animationend", () => tick.remove(), { once: true });
      hudEquity.classList.remove("bump-up", "bump-down");
      void hudEquity.offsetWidth;
      hudEquity.classList.add(change > 0 ? "bump-up" : "bump-down");
    }
    lastTickEquity = equity;
    lastEquityTick = now;
  }
  if (equity > peakShown + 2000 && equity > ARENA_START_BALANCE + 5000 && playing) {
    peakShown = equity;
    const wallet = document.querySelector(".wallet-panel");
    wallet.classList.remove("new-high");
    void wallet.offsetWidth;
    wallet.classList.add("new-high");
  }
}

function drawChart(now) {
  for (const flash of chartView.flashes) flash.age = (now - flash.born) / 1300;
  chartView.flashes = chartView.flashes.filter((flash) => flash.age < 1);
  chartView.size = unitSize;
  drawArenaChart($("market-chart"), run, { ...chartView, pulse: chartView.pulse * (0.5 + 0.5 * Math.sin(now / 160)) });
}

function saveResult(result) {
  const record = { ...result, mode, id: Date.now() + Math.floor(Math.random() * 1000) };
  records.unshift(record);
  records = records.sort((a, b) => b.score - a.score).slice(0, 40);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* Local preview remains playable. */ }
  renderBoard();
}

function showResult() {
  const result = run.result ?? run.finish();
  const best = records.filter((row) => row.mode === "random").reduce((top, row) => Math.max(top, row.score), 0);
  if (!run.saved) { saveResult(result); run.saved = true; }
  playing = false;
  const letter = grade(result.score, result.qualified);
  $("result-label").textContent = result.qualified ? (result.score > best && mode === "random" ? "新紀錄！本局成績" : "本局最終成績") : "帳戶已被強平";
  $("result-score").textContent = String(result.score).padStart(4, "0");
  $("result-grade").textContent = letter;
  $("result-grade").className = `grade-${letter}`;
  $("result-pnl").textContent = `${money(result.pnl)} USDT`;
  $("result-pnl").className = numberClass(result.pnl);
  const comparison = mode === "shadow" && ghost ? result.score > ghost.score ? `超越 ${ghost.name} ${result.score - ghost.score} 分。` : `距離 ${ghost.name} 還差 ${ghost.score - result.score} 分。` : "市場已結算，所有持倉按簿面平倉。";
  $("result-summary").textContent = `${comparison}${result.settlementFallback ? " 部分倉位因深度不足，按不利標記價結算。" : ""}`;
  $("result-roi").textContent = `${signed(result.roi)}%`;
  $("result-roi").className = numberClass(result.roi);
  $("result-mdd").textContent = `${fmt(result.maxDrawdown)}%`;
  $("result-ignited").textContent = compactMoney(result.ignitedValue);
  $("result-cascade").textContent = `${fmt(result.biggestCascadeUnits, 1)} BTC`;
  $("result-reveal").textContent = `隱藏大戶分批${result.whaleSide === "buy" ? "買進" : "賣出"}，送出 ${result.whaleOrders} 筆子單。本局共 ${fmt(result.liquidatedUnits, 1)} BTC 槓桿倉被強平，其中 ${fmt(result.ignitedUnits, 1)} BTC 由你推價觸發。${result.news.length ? `事件：${result.news.join("、")}。` : "本局沒有突發消息。"}`;
  $("share-status").textContent = "連結包含種子與影子分數，可傳給朋友挑戰。";
  if (!$("result-dialog").open) $("result-dialog").showModal();
  if (result.qualified && result.score > 0) {
    const chart = $("market-chart").getBoundingClientRect();
    particles(chart.width / 2, chart.height / 2, "#f6d78c", 46, 520);
    chime(4);
  }
  render();
}

function beginNew(seed, nextMode = "random", nextGhost = null) {
  playing = false;
  mode = nextMode;
  ghost = nextGhost;
  run = new FlowArenaRun(seed);
  accumulated = 0;
  lastFrame = performance.now();
  previousRealized = 0;
  displayedEquity = ARENA_START_BALANCE;
  lastTickEquity = ARENA_START_BALANCE;
  peakShown = ARENA_START_BALANCE;
  seenFeedId = run.feedId;
  feedRenderedId = null;
  seenExecution = null;
  combo = 0;
  chartView.zoom = 1;
  chartView.offset = 0;
  chartView.cursorPrice = null;
  chartView.flashes = [];
  seenEvent = null;
  clearTimeout(eventTimer);
  $("chart-event").hidden = true;
  $("pnl-burst").hidden = true;
  $("order-message").textContent = "";
  $("protection-status").textContent = "尚未設定";
  $("stop-price").value = "";
  $("take-price").value = "";
  $("last-slippage").textContent = "—";
  $("combo-banner").hidden = true;
  $("particle-layer").replaceChildren();
  $("fx-layer").replaceChildren();
  if ($("result-dialog").open) $("result-dialog").close();
  if (nextMode === "random") history.replaceState(null, "", location.pathname);
  render();
}

function setUnit(value) {
  if (!UNIT_SIZES.includes(value)) return;
  unitSize = value;
  chartView.size = value;
  for (const button of document.querySelectorAll("[data-unit]")) button.classList.toggle("active", Number(button.dataset.unit) === value);
  renderPreview();
}

function togglePlay() {
  audioContext();
  if (run.finished) beginNew(randomSeed());
  else { playing = !playing; lastFrame = performance.now(); accumulated = 0; render(); }
}

function submitOrder(side, type, limit = null) {
  if (!playing || document.hidden) { setMessage("先按「開始交易」啟動市場", true); return; }
  const result = run.submit(side, type, unitSize * 100, limit);
  if (!result.ok) setMessage(result.error, true);
  else {
    const fill = result.matched ? `成交 ${size(result.matched)} BTC${result.avgPrice ? ` · 均價 ${price(result.avgPrice)}` : ""}` : "尚未成交";
    const rest = result.resting ? ` · ${size(result.resting)} BTC 掛在 ${price(limit)}` : "";
    const cascade = result.cascade ? ` · 觸發 ${btc(result.cascade.lots)} 強平` : "";
    setMessage(`${side === "buy" ? "買入" : "賣出"} ${fill}${rest}${cascade}${type === "market" && result.unfilled ? ` · ${size(result.unfilled)} BTC 未成交` : ""}`);
    tone(side === "buy" ? 540 : 320, 0.09, "triangle", 0.045, side === "buy" ? 700 : 240);
  }
  render();
}

function closeNow() {
  if (!playing) { setMessage("先按「開始交易」啟動市場", true); return; }
  const result = run.close();
  setMessage(result.ok ? `已平倉 ${size(result.matched)} BTC${result.avgPrice ? ` · 均價 ${price(result.avgPrice)}` : ""}${run.account.position ? "；剩餘部位下一秒繼續出場" : ""}` : result.error, !result.ok);
  render();
}

function chartLocalX(event) { return event.clientX - $("market-chart").getBoundingClientRect().left; }
function chartInPlot(event) {
  const geometry = arenaChartGeometry($("market-chart"), run, chartView);
  const x = chartLocalX(event);
  return x >= geometry.left && x <= geometry.plotRight && event.clientY - geometry.rect.top >= geometry.priceTop && event.clientY - geometry.rect.top <= geometry.priceBottom;
}

function frame(now) {
  const elapsed = Math.min(250, now - lastFrame);
  lastFrame = now;
  if (playing && !document.hidden && !run.finished) {
    accumulated += elapsed * Number($("speed").value);
    let steps = 0;
    while (accumulated >= 1000 && steps < 8 && !run.finished) {
      run.tick();
      accumulated -= 1000;
      steps++;
    }
    if (steps) render();
    if (run.finished) showResult();
  } else accumulated = 0;
  if (now - lastRender > 200) { render(); lastRender = now; }
  animateEquity(now);
  drawChart(now);
  requestAnimationFrame(frame);
}

$("play-button").addEventListener("click", togglePlay);
$("new-button").addEventListener("click", () => beginNew(randomSeed()));
document.querySelectorAll("[data-unit]").forEach((button) => button.addEventListener("click", () => setUnit(Number(button.dataset.unit))));
document.querySelectorAll("[data-layer]").forEach((button) => button.addEventListener("click", () => {
  chartView.layer = button.dataset.layer;
  for (const item of document.querySelectorAll("[data-layer]")) item.classList.toggle("active", item === button);
}));
$("quick-buy").addEventListener("click", () => submitOrder("buy", "market"));
$("quick-sell").addEventListener("click", () => submitOrder("sell", "market"));
$("close-position").addEventListener("click", closeNow);
function renderSoundToggle() {
  $("sound-toggle").textContent = soundEnabled ? "♫ 音效開" : "♪ 音效關";
  $("sound-toggle").setAttribute("aria-pressed", String(soundEnabled));
}
$("sound-toggle").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  try { localStorage.setItem(SOUND_KEY, soundEnabled ? "on" : "off"); } catch { /* Optional preference. */ }
  renderSoundToggle();
  if (soundEnabled) chime(0);
});
const chart = $("market-chart");
chart.addEventListener("wheel", (event) => {
  if (!chartInPlot(event)) return;
  event.preventDefault();
  const before = arenaChartPriceAtY(chart, run, chartView, event.clientY);
  chartView.zoom = Math.max(0.4, Math.min(5, chartView.zoom * (event.deltaY < 0 ? 1.16 : 1 / 1.16)));
  const after = arenaChartPriceAtY(chart, run, chartView, event.clientY);
  chartView.offset += before - after;
  chartView.cursorPrice = arenaChartPriceAtY(chart, run, chartView, event.clientY);
}, { passive: false });
chart.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !chartInPlot(event)) return;
  chartDrag = { id: event.pointerId, startY: event.clientY, previousY: event.clientY, moved: false };
  chart.setPointerCapture(event.pointerId);
});
chart.addEventListener("pointermove", (event) => {
  if (chartDrag?.id === event.pointerId) {
    const delta = event.clientY - chartDrag.previousY;
    if (Math.abs(event.clientY - chartDrag.startY) > 5) chartDrag.moved = true;
    if (chartDrag.moved) {
      const geometry = arenaChartGeometry(chart, run, chartView);
      chartView.offset += delta / (geometry.priceBottom - geometry.priceTop) * geometry.span;
    }
    chartDrag.previousY = event.clientY;
  }
  chartView.cursorPrice = chartInPlot(event) ? arenaChartPriceAtY(chart, run, chartView, event.clientY) : null;
});
chart.addEventListener("pointerup", (event) => {
  if (chartDrag?.id !== event.pointerId) return;
  const wasMoved = chartDrag.moved;
  chartDrag = null;
  if (chart.hasPointerCapture(event.pointerId)) chart.releasePointerCapture(event.pointerId);
  if (wasMoved || !chartInPlot(event)) return;
  const limit = arenaChartPriceAtY(chart, run, chartView, event.clientY);
  if (limit == null) return;
  if (limit === run.market.last) { setMessage("請點現價上方掛賣，或下方掛買。", true); return; }
  submitOrder(limit < run.market.last ? "buy" : "sell", "limit", limit);
});
chart.addEventListener("pointercancel", () => { chartDrag = null; });
chart.addEventListener("pointerleave", () => { if (!chartDrag) chartView.cursorPrice = null; });
chart.addEventListener("dblclick", () => { chartView.zoom = 1; chartView.offset = 0; });
$("player-orders").addEventListener("click", (event) => {
  const button = event.target.closest("[data-cancel]");
  if (button && run.cancel(Number(button.dataset.cancel))) { setMessage("掛單已撤銷"); render(); }
});
$("cancel-all").addEventListener("click", () => { const count = run.cancelAll(); setMessage(count ? `已撤銷 ${count} 筆掛單` : "目前沒有掛單"); render(); });
$("set-protection").addEventListener("click", () => {
  const stopText = $("stop-price").value.trim();
  const takeText = $("take-price").value.trim();
  const stop = stopText ? Number(stopText) : null;
  const take = takeText ? Number(takeText) : null;
  const error = run.setProtection(stop, take);
  $("protection-status").textContent = error ?? `已設定：止損 ${stopText || "—"} · 止盈 ${takeText || "—"}`;
});
$("clear-protection").addEventListener("click", () => { run.protection = { stop: null, take: null }; $("stop-price").value = ""; $("take-price").value = ""; $("protection-status").textContent = "風險指令已清除"; });
$("leaderboard-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-record]");
  const record = records.find((row) => row.id === Number(button?.dataset.record));
  if (!record) return;
  beginNew(record.seed, "shadow", { seed: record.seed, score: record.score, path: record.path, name: "本機紀錄" });
});
$("result-close").addEventListener("click", () => $("result-dialog").close());
$("retry-button").addEventListener("click", () => beginNew(run.seed, "shadow", { seed: run.seed, score: run.result.score, path: run.result.path, name: "你的上一局" }));
$("next-button").addEventListener("click", () => beginNew(randomSeed()));
$("share-button").addEventListener("click", async () => {
  const name = $("handle").value.trim().slice(0, 18) || "匿名交易者";
  try { localStorage.setItem(PROFILE_KEY, name); } catch { /* Optional profile. */ }
  const code = encodeChallenge({ version: ARENA_VERSION, seed: run.seed, score: run.result.score, path: run.result.path, name });
  const url = new URL(location.pathname, location.href);
  url.searchParams.set("challenge", code);
  try { await navigator.clipboard.writeText(url.href); $("share-status").textContent = "影子挑戰連結已複製，可以傳給朋友。"; }
  catch { $("share-status").textContent = `請複製：${url.href}`; }
});
document.addEventListener("visibilitychange", () => { accumulated = 0; lastFrame = performance.now(); render(); });
document.addEventListener("keydown", (event) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName) || event.altKey || event.ctrlKey || event.metaKey) return;
  if ($("result-dialog").open) return;
  const key = event.key.toLowerCase();
  if (key === "q") submitOrder("buy", "market");
  else if (key === "e") submitOrder("sell", "market");
  else if (key === "f") closeNow();
  else if (["1", "2", "3", "4"].includes(key)) setUnit(UNIT_SIZES[Number(key) - 1]);
  else if (key === " ") { event.preventDefault(); togglePlay(); }
});
try { $("handle").value = localStorage.getItem(PROFILE_KEY) || ""; } catch { /* Optional profile. */ }
renderSoundToggle();
renderBoard();
render();
requestAnimationFrame(frame);
