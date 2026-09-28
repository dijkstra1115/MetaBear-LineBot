import { ARENA_DEFAULT_LEVERAGE, ARENA_LEVERAGES, ARENA_MAX_DRAWDOWN, ARENA_RISK_LIMITS, ARENA_START_BALANCE, ARENA_VERSION, FlowArenaRun } from "./flow-arena-engine.js";
import { ARENA_BOTS, ARENA_BOT_ROSTER } from "./flow-arena-bots.js";
import { arenaChartGeometry, arenaChartPriceAtY, drawArenaChart } from "./flow-arena-chart.js";
import { ArenaReplica } from "./arena-replica.js";
import { ArenaRoomClient, readEntry, roomFromUrl, savedName, showRoomEntry, showRoomLobby } from "./arena-online.js";

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
const size = (lots) => fmt(run.btc(lots), Number.isInteger(run.btc(lots)) || run.btc(lots) >= 100 ? 0 : 1);
const btc = (lots) => `${fmt(run.btc(lots), run.btc(lots) >= 10 ? 0 : 1)} BTC`;
const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const numberClass = (value) => value > 0 ? "positive" : value < 0 ? "negative" : "";
const grade = (score, qualified = true) => !qualified ? "D" : score >= 200 ? "S" : score >= 100 ? "A" : score >= 40 ? "B" : score > 0 ? "C" : "D";
const STORAGE_KEY = "metabear-flow-arena-v7";
const LEVERAGE_KEY = "metabear-flow-arena-leverage";
const GUIDE_KEY = "metabear-flow-arena-guide";
const PROFILE_KEY = "metabear-flow-arena-handle";
const SOUND_KEY = "metabear-flow-arena-sound";
const RIVALS_KEY = "metabear-flow-arena-rivals";
// Computer opponents: one of each difficulty for "mixed"; the seed picks which bot of a level.
const RIVAL_SETTINGS = {
  none: { label: "單人", levels: [] },
  rookie: { label: "新手", levels: ["rookie"] },
  skilled: { label: "中階", levels: ["skilled"] },
  expert: { label: "高手", levels: ["expert"] },
  mixed: { label: "混合", levels: ["rookie", "skilled", "expert"] },
};
function loadRivals() {
  try {
    const value = localStorage.getItem(RIVALS_KEY);
    return RIVAL_SETTINGS[value] ? value : "none";
  } catch { return "none"; }
}
function lineupFor(setting, seed) {
  return RIVAL_SETTINGS[setting].levels.map((level, index) => {
    const roster = ARENA_BOT_ROSTER[level];
    return roster[(seed + index) % roster.length];
  });
}
function createRun(seed, setting) {
  const lineup = lineupFor(setting, seed);
  const next = new FlowArenaRun(seed, { traders: ["player", ...lineup.map((rival, index) => ({ id: `rival:${index + 1}`, name: rival.name }))] });
  lineup.forEach((rival, index) => next.traders[index + 1].setLeverage(rival.leverage));
  next.rivalSetting = setting;
  next.lineup = lineup;
  next.botStates = lineup.map(() => ({}));
  return next;
}
// Computer opponents act on what they see, then the market moves one second.
function stepRun() {
  run.lineup.forEach((rival, index) => ARENA_BOTS[rival.bot](run, run.traders[index + 1], run.botStates[index]));
  run.tick();
}
const traderName = (id) => id === run.you.id ? "你" : run.trader(id)?.name ?? "對手";
function loadLeverage() {
  try {
    const value = Number(localStorage.getItem(LEVERAGE_KEY));
    return ARENA_LEVERAGES.includes(value) ? value : ARENA_DEFAULT_LEVERAGE;
  } catch { return ARENA_DEFAULT_LEVERAGE; }
}
const UNIT_SIZES = [10, 25, 50, 100];
const LIMIT_TEXT = { risk: "風險限額", margin: "可用資金", exit: "平倉中" };
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
}

// Everyone opening the daily market on the same local date gets the same seed.
function dailyKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dailySeed(key = dailyKey()) {
  let hash = 2166136261;
  for (const character of `flow-arena:${key}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash || 1;
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
    return { seed: data.seed, score: Math.round(data.score), name: String(data.name || "匿名交易者").slice(0, 18), path: data.path.filter(Number.isFinite).slice(0, 64), rivals: RIVAL_SETTINGS[data.rivals] ? data.rivals : "none" };
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
let rivalSetting = loadRivals();
let run = createRun(ghost?.seed ?? randomSeed(), ghost?.rivals ?? rivalSetting);
run.setLeverage(loadLeverage());
let playing = false;
let unitSize = 25;
// Size buttons are BTC amounts written for a solo market; a bigger room uses larger contracts,
// so the same BTC is fewer contracts (rounded to the nearest hundredth of one).
const unitLots = (unit) => Math.max(1, Math.round(unit * 100 / run.scale));
const fixedLots = () => unitLots(unitSize === "max" ? UNIT_SIZES[0] : unitSize);
// Room for one order on this side. A market order is checked at its average fill, so when free
// margin is what binds, the room is measured again at the price the order would average.
function sideRoom(side, reference = null) {
  const room = run.orderRoom(side, reference ?? run.market.last);
  if (reference != null || room.limit !== "margin" || !room.lots) return room;
  const average = run.previewOrder(side, "market", room.lots)?.avgPrice;
  return average ? { ...room, lots: Math.min(room.lots, run.orderRoom(side, average).lots) } : room;
}
// Lots one order sends: Max takes all the room (against a position it only closes it, so a flip
// takes a second press), a fixed size larger than the room is cut down to it so the click opens
// what fits. With no room left the plain size goes out and the engine says why.
function orderLots(side, reference = null) {
  const position = run.account.position;
  if (unitSize === "max" && position && (position > 0) !== (side === "buy")) return Math.abs(position);
  if ($("reduce-only").checked) return fixedLots();
  const room = sideRoom(side, reference).lots;
  if (!room) return fixedLots();
  return unitSize === "max" ? room : Math.min(fixedLots(), room);
}
// frame keeps the price axis sticky (see arenaChartGeometry); pointerY is where the pointer rests over the plot.
const chartView = { zoom: 1, offset: 0, cursorPrice: null, pointerY: null, frame: { low: null, high: null, hold: false }, sizeLabel: "", layer: "liq", flashes: [], pulse: 0 };
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
let renderedFeedKeys = [];
let seenExecution = null;
let seenPlayerLiquidation = null;
let seenKnockouts = 0;
let peakShown = ARENA_START_BALANCE;
// A friend room, when the page is in one: the connection, this player's copy of the room's
// market, and when the round's countdown ends. The room moves the market; the page only renders.
let online = null;

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

// Another trader blown out of the market: a violet burst, louder when you did it.
function processKnockouts() {
  const fresh = run.knockouts.slice(seenKnockouts).filter((item) => item.victim !== run.you.id);
  seenKnockouts = run.knockouts.length;
  for (const item of fresh) {
    const point = chartPoint(item.price);
    const yours = item.by === run.you.id;
    floatLabel(`💥 玩家${item.side === "long" ? "多單" : "空單"}被強平`, point.x - 12, point.y, "violet", yours);
    particles(point.x, point.y, "#c3a6ff", yours ? 40 : 18, yours ? 420 : 240);
    if (yours) {
      banner("🎯 你推爆了一名玩家", "violet");
      chime(3);
    } else banner("一名玩家被強平", "violet");
  }
}

// Your own position blowing up gets the loudest effect in the game.
function processPlayerLiquidation() {
  const event = run.lastLiquidation;
  if (!event || event === seenPlayerLiquidation) return;
  seenPlayerLiquidation = event;
  const point = chartPoint(event.price);
  flashScreen("danger", 1);
  shake(3);
  boom(1);
  floatLabel(`💥 你的${event.side === "long" ? "多單" : "空單"}被強平`, point.x - 12, point.y, "coral", true);
  banner(`你被強平了 ${money(-event.lost)}`, "coral");
  setMessage(`${size(event.lots)} BTC ${event.side === "long" ? "多單" : "空單"}在 ${price(event.price)} 爆倉，賠掉這筆倉位的保證金 ${compactMoney(event.lost)}。其他資金不受影響，這局繼續。`, true);
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
  // The visible book promised a bigger move: something hidden absorbed the order.
  if (execution.stalled) {
    floatLabel("推不動！", point.x - 40, point.y + (up ? -30 : 30), "amber", true);
    tone(160, 0.3, "square", 0.03, 110);
    setMessage(`預估推動 ${execution.expectedMove >= 0 ? "+" : ""}${fmt(execution.expectedMove)}%，實際只推到 ${execution.reach >= 0 ? "+" : ""}${fmt(execution.reach)}%：簿上看不到的${execution.side === "buy" ? "賣單" : "買單"}在吸收你的單。`, true);
  }
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
  $("book-depth-label").textContent = `${size(run.market.restingLots)} BTC 掛單中`;
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
  const top = records.filter((row) => row.mode === "random" || row.mode === "daily").sort((a, b) => b.score - a.score).slice(0, 5);
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
    const opponents = record.rivals && record.rivals !== "none" ? ` · vs ${RIVAL_SETTINGS[record.rivals]?.label ?? "電腦"}` : "";
    const label = document.createElement("span"); label.className = "run-id"; label.textContent = `${record.mode === "daily" ? `每日 ${record.day ?? ""}` : `市場 #${String(record.seed).slice(-5)}`}${opponents}`;
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

// Rebuild only when a new wave or a trader liquidation arrives, and animate just the rows that are new.
// Other traders stay anonymous until the round is over.
function renderFeed() {
  const waves = run.liquidationFeed.filter((item) => !item.warm).slice(-7).map((item) => ({ ...item, kind: "wave", key: `w${item.id}` }));
  const knocks = run.knockouts.filter((item) => item.victim !== run.you.id).map((item, index) => ({ ...item, kind: "knockout", key: `k${index}` }));
  const items = [...waves, ...knocks].sort((a, b) => b.time - a.time).slice(0, 7);
  const latest = `${waves.at(-1)?.id ?? 0}:${knocks.length}`;
  if (latest === feedRenderedId) return;
  const shown = new Set(feedRenderedId == null ? items.map((item) => item.key) : renderedFeedKeys);
  feedRenderedId = latest;
  renderedFeedKeys = items.map((item) => item.key);
  const container = $("liq-feed");
  if (!items.length) {
    container.innerHTML = `<p class="empty-state">還沒有人被強平</p>`;
    return;
  }
  container.innerHTML = items.map((item) => {
    const fresh = shown.has(item.key) ? "" : " fresh";
    if (item.kind === "knockout") {
      return `<div class="liq-row rival${fresh}"><span>${clock(Math.max(0, item.time))}</span><strong>玩家${item.side === "long" ? "多單" : "空單"} ${btc(item.lots)}</strong><em>被強平</em>${item.by === run.you.id ? "<b>你推爆</b>" : ""}</div>`;
    }
    const move = (item.to / item.from - 1) * 100;
    return `<div class="liq-row ${item.side}${item.ignited ? " ignited" : ""}${fresh}"><span>${clock(Math.max(0, item.time))}</span><strong>${item.side === "short" ? "空單" : "多單"} ${btc(item.lots)}</strong><em>${move >= 0 ? "+" : ""}${fmt(move)}%${item.chain > 1 ? ` ×${item.chain}` : ""}</em>${item.ignited ? "<b>你引爆</b>" : ""}</div>`;
  }).join("");
}

// The largest position one leverage allows from a flat account: its risk limit or what the wallet covers.
function leverageCap(leverage) {
  const byMargin = Math.floor(run.account.balance * leverage * run.denominator / run.market.last / 10) * 10;
  return Math.min(run.riskLimitLots(leverage), byMargin);
}

// Opening room on the side the account is building (the position's side, or the side its resting
// orders lean when flat): held, resting and still free, and the rule that caps it.
function renderCapacity() {
  const position = run.account.position;
  let buys = 0;
  let sells = 0;
  for (const order of run.playerOrders()) {
    if (order.reduceOnly) continue;
    if (order.side === "buy") buys += order.lots;
    else sells += order.lots;
  }
  const side = position > 0 ? "buy" : position < 0 ? "sell" : sells > buys ? "sell" : "buy";
  const room = run.orderRoom(side);
  const held = Math.abs(position);
  const resting = side === "buy" ? buys : sells;
  const total = Math.max(1, held + resting + room.lots);
  $("cap-held").style.width = `${held / total * 100}%`;
  $("cap-resting").style.width = `${resting / total * 100}%`;
  $("cap-free").style.width = `${room.lots / total * 100}%`;
  const word = side === "buy" ? "多" : "空";
  const parts = [held && `${word} ${size(held)}`, resting && `掛單${held ? "" : word} ${size(resting)}`].filter(Boolean).join(" + ");
  $("capacity-text").innerHTML = parts
    ? `${parts} · 還能加 <b>${size(room.lots)}</b> / ${size(held + resting + room.lots)} BTC`
    : `可開 <b>${size(room.lots)}</b> BTC`;
  const chip = $("capacity-limit");
  chip.textContent = room.limit === "exit" ? "平倉中，暫不能加倉" : room.limit === "risk" ? `上限 ${run.leverage}× 風險限額` : "上限 可用資金";
  chip.className = `capacity-limit ${room.limit}${room.lots ? "" : " full"}`;
  let hint = "";
  if (room.limit === "risk") {
    const best = ARENA_LEVERAGES.filter((leverage) => leverage < run.leverage)
      .map((leverage) => ({ leverage, lots: leverageCap(leverage) }))
      .sort((a, b) => b.lots - a.lots)[0];
    if (best && best.lots > run.riskLimitLots(run.leverage)) hint = `改 ${best.leverage}× 最多約 ${size(best.lots)} BTC${held || resting ? "（空倉才能改）" : ""}`;
  }
  $("capacity-hint").textContent = hint;
  $("capacity").classList.toggle("full", !room.lots);
  for (const button of document.querySelectorAll("[data-unit]")) {
    if (button.dataset.unit === "max") { button.title = `全部可開額度：${size(room.lots)} BTC`; continue; }
    const over = unitLots(Number(button.dataset.unit)) > room.lots;
    button.classList.toggle("over", over);
    button.title = over ? `超過可開額度，下單會自動調整為 ${size(room.lots)} BTC` : "";
  }
  return room;
}

function renderPreview() {
  const last = run.market.last;
  const levels = run.estimatedLevels(Math.max(2000, Math.round(last * 0.001 / 1000) * 1000));
  for (const side of ["buy", "sell"]) {
    const box = $(side === "buy" ? "preview-buy" : "preview-sell");
    const room = $("reduce-only").checked ? null : sideRoom(side);
    if (room && !room.lots) {
      box.classList.remove("hot");
      box.textContent = `${side === "buy" ? "▲ 買入" : "▼ 賣出"}：${room.limit === "exit" ? "平倉進行中，暫不能加倉" : room.limit === "risk" ? `已達 ${run.leverage}× 風險限額` : "可用資金不足"}`;
      continue;
    }
    const lots = orderLots(side);
    const preview = run.previewOrder(side, "market", lots);
    if (!preview?.worstPrice) { box.textContent = `${side === "buy" ? "買入" : "賣出"}：對手盤不足`; continue; }
    const move = (preview.worstPrice / last - 1) * 100;
    const crossed = levels.reduce((sum, row) => side === "buy"
      ? sum + (row.price > last && row.price <= preview.worstPrice ? row.short : 0)
      : sum + (row.price < last && row.price >= preview.worstPrice ? row.long : 0), 0);
    box.innerHTML = `${side === "buy" ? "▲" : "▼"} ${size(lots)} BTC 依可見掛單推到 <b>${price(preview.worstPrice)}</b> (${move >= 0 ? "+" : ""}${fmt(move)}%)${crossed ? ` · <strong>熱圖估計穿過 ${btc(crossed)} ${side === "buy" ? "空單" : "多單"}強平</strong>` : ""}`;
    box.classList.toggle("hot", crossed >= 800);
  }
}

function render() {
  const market = run.market;
  const account = run.account;
  const equity = run.equity();
  const pnl = equity - ARENA_START_BALANCE;
  const roi = (equity / ARENA_START_BALANCE - 1) * 100;
  const liveScore = Math.round(Math.max(0, roi) * Math.max(0, 1 - run.maxDrawdown / ARENA_MAX_DRAWDOWN) * 100);
  const priceChange = (market.last / run.startPrice - 1) * 100;
  const mark = run.markPrice();
  const floating = account.position * (mark - account.entry) / run.denominator;
  const rivals = run.lineup.length ? ` · 對戰電腦 ${RIVAL_SETTINGS[run.rivalSetting].label} ${run.lineup.length} 人` : "";
  $("mode-badge").textContent = online ? `好友對戰 · 房號 ${online.room.code}${online.replica ? ` · ${run.traders.length} 人` : ""}` : `${mode === "random" ? "未知隨機市場" : mode === "daily" ? `每日市場 ${dailyKey()}` : mode === "shadow" ? `影子挑戰 / ${ghost?.name ?? "玩家"}` : "練習重玩"}${rivals}`;
  $("seed-label").textContent = (mode === "random" || online) && !run.finished ? "SEED HIDDEN" : `SEED ${run.seed}`;
  const remaining = Math.max(0, run.duration - run.time);
  $("clock").textContent = clock(remaining);
  $("clock").classList.toggle("urgent", remaining <= 15 && !run.finished);
  $("clock-fill").style.width = `${Math.min(100, run.time / run.duration * 100)}%`;
  const counting = online && online.startsAt > performance.now();
  $("run-status").innerHTML = `<i></i> ${online ? !online.replica ? "等待開局" : run.finished ? "已結算" : counting ? "即將開始" : "連線對戰中" : run.finished ? "已結算" : playing && !document.hidden ? "市場運行中" : document.hidden ? "分頁暫停" : "已暫停"}`;
  $("play-button").textContent = online ? "👥 房間" : run.finished ? "▶ 再開一局" : playing ? "Ⅱ 暫停" : run.time ? "▶ 繼續" : "▶ 開始交易";
  $("last-price").textContent = price(market.last);
  $("price-change").textContent = `${signed(priceChange)}%`;
  $("price-change").className = numberClass(priceChange);
  $("mark-price").textContent = price(mark);
  $("spread").textContent = market.spread() == null ? "—" : price(market.spread());
  $("liq-total").textContent = btc(run.stats.liquidatedLong + run.stats.liquidatedShort);
  $("cvd-value").textContent = signed(run.btc(market.cvd), 0);
  $("cvd-value").className = numberClass(market.cvd);
  $("hud-pnl").textContent = `${money(pnl)} · ${signed(roi)}%`;
  $("hud-pnl").className = numberClass(pnl);
  $("ignited-total").textContent = compactMoney(run.stats.ignitedValue);
  $("ignited-units").textContent = `${btc(run.stats.ignitedLots)} · 最大連環 ${btc(run.stats.biggestCascade)}`;
  $("floating-pnl").innerHTML = `${signed(floating)} <span>未實現盈虧</span>`;
  $("floating-pnl").className = `floating-pnl ${numberClass(floating)}`;
  $("position").textContent = account.position ? `${account.position > 0 ? "多" : "空"} ${size(Math.abs(account.position))} BTC` : "空倉";
  $("position").className = account.position > 0 ? "positive" : account.position < 0 ? "negative" : "";
  $("entry-price").textContent = account.position ? price(account.entry) : "—";
  const liq = run.playerLiquidationPrice();
  $("player-liq").textContent = liq ? `${price(liq)} (${fmt(Math.abs(liq / mark - 1) * 100, 1)}%)` : "—";
  $("player-liq").className = liq && Math.abs(liq / mark - 1) < 0.02 ? "negative" : "";
  $("realized").textContent = signed(account.realized - account.fees);
  $("realized").className = numberClass(account.realized - account.fees);
  // Wallet balance splits into position margin, margin held for resting orders, and free funds.
  const reserve = run.reservedMargin();
  $("wallet-balance").textContent = `$${fmt(account.balance, 0)}`;
  $("unrealized").textContent = money(floating);
  $("unrealized").className = numberClass(floating);
  $("position-margin").textContent = `$${fmt(account.margin, 0)}`;
  $("order-reserve").textContent = `$${fmt(reserve, 0)}`;
  $("leverage-value").textContent = `${run.leverage}×`;
  const available = run.availableMargin();
  $("available-margin").textContent = `$${fmt(Math.max(0, available), 0)}`;
  const room = renderCapacity();
  $("open-room").textContent = room.limit === "risk" && available > 0 && !room.lots
    ? `已達 ${run.leverage}× 風險限額：剩下的資金暫時開不了倉，空倉時降槓桿才能開更大`
    : `可再開約 ${size(room.lots)} BTC（上限：${room.limit === "risk" ? `${run.leverage}× ` : ""}${LIMIT_TEXT[room.limit]}）`;
  const base = Math.max(1, account.balance);
  const marginShare = Math.min(100, account.margin / base * 100);
  const reserveShare = Math.min(100 - marginShare, reserve / base * 100);
  $("bar-margin").style.width = `${marginShare}%`;
  $("bar-reserve").style.width = `${reserveShare}%`;
  $("bar-free").style.width = `${Math.max(0, 100 - marginShare - reserveShare)}%`;
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
  $("player-liquidations").textContent = `${run.stats.playerLiquidations} 次`;
  $("player-liquidations").className = run.stats.playerLiquidations ? "negative" : "";
  const flat = !account.position && !run.playerOrders().length;
  for (const button of document.querySelectorAll("[data-leverage]")) {
    button.classList.toggle("active", Number(button.dataset.leverage) === run.leverage);
    button.disabled = !flat;
  }
  $("leverage-hint").textContent = flat ? "空倉時可調整" : "有倉位或掛單時鎖定";
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
  processKnockouts();
  processPlayerLiquidation();
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
  if (equity > peakShown + 2000 * run.contractBtc && equity > ARENA_START_BALANCE + 5000 * run.contractBtc && playing) {
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
  chartView.sizeLabel = unitSize === "max" ? "MAX" : `${size(fixedLots())} BTC`;
  // A resting pointer still reads the price under it, even when the axis had to move.
  if (chartView.pointerY != null) chartView.cursorPrice = arenaChartPriceAtY($("market-chart"), run, chartView, chartView.pointerY);
  drawArenaChart($("market-chart"), run, { ...chartView, pulse: chartView.pulse * (0.5 + 0.5 * Math.sin(now / 160)) });
}

function saveResult(result) {
  const record = { ...result, mode, rivals: run.rivalSetting, day: mode === "daily" ? dailyKey() : null, id: Date.now() + Math.floor(Math.random() * 1000) };
  records.unshift(record);
  records = records.sort((a, b) => b.score - a.score).slice(0, 40);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* Local preview remains playable. */ }
  renderBoard();
}

function listItem(tag, text, className = "") {
  const item = document.createElement(tag);
  if (className) item.className = className;
  item.textContent = text;
  return item;
}

// Post-round review: coaching notes, each position, and what the hidden players did.
function renderReview() {
  const review = run.review();
  const notes = $("review-notes");
  notes.replaceChildren();
  const texts = review.notes.map((note) => note.text);
  if (!texts.length) texts.push(review.episodes.length ? "沒有明顯失誤：挑對亮帶、推得動、出得乾淨。下一局試著加大部位或多抓一次反手。" : "這局沒有開倉。先找一條近、夠亮、前面沒有牆的亮帶，用 500 BTC 試探看看。");
  for (const text of texts) notes.append(listItem("li", text));

  const episodes = $("review-episodes");
  episodes.replaceChildren();
  if (!review.episodes.length) episodes.append(listItem("p", "沒有持倉紀錄。", "empty-state"));
  for (const episode of review.episodes.slice(-8)) {
    const row = document.createElement("div");
    row.className = `episode-row ${episode.pnl >= 0 ? "gain" : "loss"}`;
    row.append(
      listItem("span", `${clock(Math.max(0, episode.start))}–${clock(Math.max(0, episode.end))}`),
      listItem("strong", `${episode.direction > 0 ? "多" : "空"} ${size(episode.peakLots)} BTC`),
      listItem("em", money(episode.pnl)),
    );
    const tags = document.createElement("div");
    tags.className = "episode-tags";
    if (episode.ignited) tags.append(listItem("i", `引爆 ${btc(episode.ignited)}`, "tag-gold"));
    if (episode.absorbed >= 100) tags.append(listItem("i", `撞冰山 ${btc(episode.absorbed)}`, "tag-amber"));
    if (episode.slippage >= 5000 * run.contractBtc) tags.append(listItem("i", `滑價 ${compactMoney(episode.slippage)}`, "tag-coral"));
    if (episode.bestMove != null) tags.append(listItem("i", `最佳 ${signed(episode.bestMove)}% → 出場 ${signed(episode.exitMove)}%`));
    if (episode.hunted) tags.append(listItem("i", "被獵手盯上", "tag-coral"));
    row.append(tags);
    episodes.append(row);
  }

  const reveals = $("review-reveals");
  reveals.replaceChildren();
  if (!review.defenders.length) reveals.append(listItem("li", "護盤者：這局沒有人守亮帶。"));
  for (const defender of review.defenders) {
    const status = defender.status === "broken" ? `第 ${defender.brokenAt} 秒被吃穿` : defender.status === "withdrawn" ? "價格遠離後撤單" : "守到最後";
    reveals.append(listItem("li", `護盤者：在 ${price(defender.price)} 藏了 ${btc(defender.total)} 冰山${defender.side === "sell" ? "賣單" : "買單"}，守住 ${price(defender.band)} 的 ${btc(defender.bandLots)} ${defender.side === "sell" ? "空單" : "多單"}強平帶；吃掉 ${btc(defender.absorbed)}${defender.fromPlayer ? `（其中 ${btc(defender.fromPlayer)} 是你的單）` : ""}，${status}。`));
  }
  const strikes = review.hunter.strikes;
  const aimed = strikes.filter((strike) => strike.target === "player").length;
  reveals.append(listItem("li", strikes.length ? `獵手：出手 ${strikes.length} 次${aimed ? `，其中 ${aimed} 次瞄準你的強平價` : ""}，損益 ${money(review.hunter.pnl)}。` : "獵手：這局沒有找到值得出手的目標。"));
}

// Rank table and who did what to whom, names revealed.
function renderStandings() {
  const box = $("result-standings");
  box.hidden = run.traders.length < 2;
  if (box.hidden) return;
  const list = $("standings-list");
  list.replaceChildren();
  for (const row of run.standings) {
    const item = document.createElement("li");
    item.className = row.id === run.you.id ? "you" : "";
    item.append(
      listItem("b", `#${row.rank}`),
      listItem("span", traderName(row.id)),
      listItem("strong", String(row.score)),
      listItem("em", `${signed(row.roi)}%`),
      listItem("small", row.playerLiquidations ? `被強平 ${row.playerLiquidations} 次` : ""),
    );
    list.append(item);
  }
  const duels = $("duel-list");
  duels.replaceChildren();
  const review = run.review();
  for (const item of review.knockouts) {
    const victim = traderName(item.victim);
    const side = item.side === "long" ? "多單" : "空單";
    duels.append(listItem("li", item.by ? `第 ${item.time} 秒：${traderName(item.by)}推爆了${victim === "你" ? "你" : victim}的${side}（${btc(item.lots)}）。` : `第 ${item.time} 秒：${victim === "你" ? "你" : victim}的${side}被市場強平（${btc(item.lots)}）。`));
  }
  for (const duel of review.duels.filter((item) => item.taker === run.you.id || item.maker === run.you.id)) {
    duels.append(listItem("li", duel.taker === run.you.id ? `你吃了 ${traderName(duel.maker)} 的掛單 ${btc(duel.lots)}，均價 ${price(duel.avgPrice)}。` : `${traderName(duel.taker)} 吃了你的掛單 ${btc(duel.lots)}，均價 ${price(duel.avgPrice)}。`));
  }
  if (!duels.children.length) duels.append(listItem("li", "這局沒有玩家之間的交手紀錄。"));
}

function showResult() {
  const result = run.result ?? run.finish();
  const best = records.filter((row) => row.mode === mode && (mode !== "daily" || row.day === dailyKey())).reduce((top, row) => Math.max(top, row.score), 0);
  // Room rounds are not local records: the room is the market, and a replay could not include the other players.
  if (!run.saved && !online) { saveResult(result); run.saved = true; }
  playing = false;
  const letter = grade(result.score, result.qualified);
  $("result-label").textContent = online ? `好友對戰 · 第 ${result.rank} 名` : result.qualified ? (result.score > best && (mode === "random" || mode === "daily") ? "新紀錄！本局成績" : "本局最終成績") : "本局無成績";
  $("result-score").textContent = String(result.score).padStart(4, "0");
  $("result-grade").textContent = letter;
  $("result-grade").className = `grade-${letter}`;
  $("result-pnl").textContent = `${money(result.pnl)} USDT`;
  $("result-pnl").className = numberClass(result.pnl);
  const placing = run.traders.length > 1 ? `第 ${result.rank} 名 / ${run.traders.length} 人。` : "";
  const comparison = placing + (mode === "shadow" && ghost ? result.score > ghost.score ? `超越 ${ghost.name} ${result.score - ghost.score} 分。` : `距離 ${ghost.name} 還差 ${ghost.score - result.score} 分。` : "市場已結算，所有持倉按簿面平倉。");
  $("result-summary").textContent = `${comparison}${result.settlementFallback ? " 部分倉位因深度不足，按不利標記價結算。" : ""}`;
  $("result-roi").textContent = `${signed(result.roi)}%`;
  $("result-roi").className = numberClass(result.roi);
  $("result-mdd").textContent = `${fmt(result.maxDrawdown)}%`;
  $("result-ignited").textContent = compactMoney(result.ignitedValue);
  $("result-cascade").textContent = `${fmt(result.biggestCascadeUnits * run.contractBtc, 0)} BTC`;
  const blown = result.playerLiquidations ? `你的倉位被強平 ${result.playerLiquidations} 次，共賠掉保證金 ${compactMoney(result.marginLost)}。` : "";
  $("result-reveal").textContent = `${blown}本局共 ${fmt(result.liquidatedUnits * run.contractBtc, 0)} BTC 槓桿倉被強平，其中 ${fmt(result.ignitedUnits * run.contractBtc, 0)} BTC 由你推價觸發。${result.news.length ? `事件：${result.news.join("、")}。` : "本局沒有突發消息。"}`;
  renderReview();
  renderStandings();
  $("share-status").textContent = online ? "好友對戰的成績不存成本機紀錄。" : "連結包含種子與影子分數，可傳給朋友挑戰。";
  if (online) {
    $("room-rematch").hidden = !online.room.leads;
    $("room-rematch-note").textContent = online.room.leads ? "" : "等房主按「再來一局」。";
  }
  if (!$("result-dialog").open) $("result-dialog").showModal();
  if (result.qualified && result.score > 0) {
    const chart = $("market-chart").getBoundingClientRect();
    particles(chart.width / 2, chart.height / 2, "#f6d78c", 46, 520);
    chime(4);
  }
  render();
}

function beginNew(seed, nextMode = "random", nextGhost = null, setting = rivalSetting) {
  playing = false;
  mode = nextMode;
  ghost = nextGhost;
  run = createRun(seed, setting);
  $("rivals").value = setting;
  run.setLeverage(loadLeverage());
  resetView();
  if (nextMode === "random" || nextMode === "daily") history.replaceState(null, "", location.pathname);
  render();
}

function resetView() {
  seenKnockouts = 0;
  renderedFeedKeys = [];
  seenPlayerLiquidation = null;
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
  chartView.pointerY = null;
  chartView.frame = { low: null, high: null, hold: false };
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
}

function setUnit(value) {
  if (value !== "max" && !UNIT_SIZES.includes(value)) return;
  unitSize = value;
  for (const button of document.querySelectorAll("[data-unit]")) button.classList.toggle("active", button.dataset.unit === String(value));
  renderPreview();
}

function togglePlay() {
  audioContext();
  if (online) { showRoomLobby(online.room); return; }
  if (run.finished) beginNew(randomSeed());
  else { playing = !playing; lastFrame = performance.now(); accumulated = 0; render(); }
}

// In a room, trading calls go to the room instead of the local market. Returns true when sent.
function sendToRoom(op, args) {
  if (!online) return false;
  if (!online.replica || run.finished) setMessage("等房主開始對戰", true);
  else if (online.startsAt > performance.now()) setMessage("倒數結束後才能下單", true);
  else online.room.send({ type: "action", op, args });
  return true;
}

function reportSubmit(side, type, limit, result, lots) {
  if (!result.ok) { setMessage(result.error, true); return; }
  const trimmed = unitSize !== "max" && lots < fixedLots() ? `（超過可開額度，已調整為 ${size(lots)} BTC）` : "";
  const fill = result.matched ? `成交 ${size(result.matched)} BTC${result.avgPrice ? ` · 均價 ${price(result.avgPrice)}` : ""}` : "尚未成交";
  const rest = result.resting ? ` · ${size(result.resting)} BTC 掛在 ${price(limit)}` : "";
  const cascade = result.cascade ? ` · 觸發 ${btc(result.cascade.lots)} 強平` : "";
  setMessage(`${side === "buy" ? "買入" : "賣出"} ${fill}${rest}${cascade}${type === "market" && result.unfilled ? ` · ${size(result.unfilled)} BTC 未成交` : ""}${trimmed}`);
  tone(side === "buy" ? 540 : 320, 0.09, "triangle", 0.045, side === "buy" ? 700 : 240);
}

function reportClosePart(result) {
  setMessage(result.ok ? `已減倉 ${size(result.matched)} BTC${result.avgPrice ? ` · 均價 ${price(result.avgPrice)}` : ""} · 剩 ${size(Math.abs(run.account.position))} BTC` : result.error, !result.ok);
}

function reportClose(result) {
  setMessage(result.ok ? `已平倉 ${size(result.matched)} BTC${result.avgPrice ? ` · 均價 ${price(result.avgPrice)}` : ""}${run.account.position ? "；剩餘部位下一秒繼續出場" : ""}` : result.error, !result.ok);
}

function reportLeverage(leverage) {
  try { localStorage.setItem(LEVERAGE_KEY, String(leverage)); } catch { /* Optional preference. */ }
  setMessage(`槓桿改為 ${leverage}×：每開 1 BTC 佔用約 $${fmt(run.market.last / 100 / leverage, 0)} 保證金，強平價在進場價反向約 ${fmt((1 / leverage - 0.004) * 100, 1)}%${leverage === 1 ? "，幾乎不會爆倉" : ""}${Number.isFinite(ARENA_RISK_LIMITS[leverage]) ? `；風險限額最多持有 ${fmt(ARENA_RISK_LIMITS[leverage], 0)} BTC（含掛單）` : ""}。`);
}

function submitOrder(side, type, limit = null) {
  const reduceOnly = $("reduce-only").checked;
  const lots = orderLots(side, type === "limit" ? limit : null);
  if (sendToRoom("submit", [side, type, lots, limit, { reduceOnly }])) return;
  if (!playing || document.hidden) { setMessage("先按「開始交易」啟動市場", true); return; }
  reportSubmit(side, type, limit, run.submit(side, type, lots, limit, { reduceOnly }), lots);
  render();
}

function closePart(fraction) {
  if (sendToRoom("closePart", [fraction])) return;
  if (!playing) { setMessage("先按「開始交易」啟動市場", true); return; }
  reportClosePart(run.closePart(fraction));
  render();
}

function closeNow() {
  if (sendToRoom("close", [])) return;
  if (!playing) { setMessage("先按「開始交易」啟動市場", true); return; }
  reportClose(run.close());
  render();
}

// The room echoed one of this player's actions: report it the way a local action is reported.
function reportOwn(message, result) {
  if (!result) return;
  const [first, type, lots, limit] = message.args;
  if (message.op === "submit") reportSubmit(first, type, limit, result, lots);
  else if (message.op === "close") reportClose(result);
  else if (message.op === "closePart") reportClosePart(result);
  else if (message.op === "setLeverage") reportLeverage(first);
  else if (message.op === "cancel") setMessage("掛單已撤銷");
  else if (message.op === "cancelAll") setMessage(result.count ? `已撤銷 ${result.count} 筆掛單` : "目前沒有掛單");
  else if (message.op === "setProtection") $("protection-status").textContent = first == null && message.args[1] == null ? "風險指令已清除" : `已設定：止損 ${first ?? "—"} · 止盈 ${message.args[1] ?? "—"}`;
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
  if (online) accumulated = 0;
  else if (playing && !document.hidden && !run.finished) {
    accumulated += elapsed * Number($("speed").value);
    let steps = 0;
    while (accumulated >= 1000 && steps < 8 && !run.finished) {
      stepRun();
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
$("daily-button").addEventListener("click", () => beginNew(dailySeed(), "daily"));
document.querySelectorAll("[data-unit]").forEach((button) => button.addEventListener("click", () => setUnit(button.dataset.unit === "max" ? "max" : Number(button.dataset.unit))));
document.querySelectorAll("[data-layer]").forEach((button) => button.addEventListener("click", () => {
  chartView.layer = button.dataset.layer;
  for (const item of document.querySelectorAll("[data-layer]")) item.classList.toggle("active", item === button);
}));
$("quick-buy").addEventListener("click", () => submitOrder("buy", "market"));
$("quick-sell").addEventListener("click", () => submitOrder("sell", "market"));
$("close-position").addEventListener("click", closeNow);
$("close-half").addEventListener("click", () => closePart(0.5));
$("close-quarter").addEventListener("click", () => closePart(0.25));
document.querySelectorAll("[data-leverage]").forEach((button) => button.addEventListener("click", () => {
  const leverage = Number(button.dataset.leverage);
  if (sendToRoom("setLeverage", [leverage])) return;
  const error = run.setLeverage(leverage);
  if (error) { setMessage(error, true); return; }
  reportLeverage(leverage);
  render();
}));
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
  const inPlot = chartInPlot(event);
  chartView.frame.hold = inPlot || Boolean(chartDrag);
  chartView.pointerY = inPlot ? event.clientY : null;
  chartView.cursorPrice = inPlot ? arenaChartPriceAtY(chart, run, chartView, event.clientY) : null;
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
chart.addEventListener("pointerleave", () => {
  if (chartDrag) return;
  chartView.cursorPrice = null;
  chartView.pointerY = null;
  chartView.frame.hold = false;
});
chart.addEventListener("dblclick", () => { chartView.zoom = 1; chartView.offset = 0; });
$("player-orders").addEventListener("click", (event) => {
  const button = event.target.closest("[data-cancel]");
  if (!button || sendToRoom("cancel", [Number(button.dataset.cancel)])) return;
  if (run.cancel(Number(button.dataset.cancel))) { setMessage("掛單已撤銷"); render(); }
});
$("cancel-all").addEventListener("click", () => {
  if (sendToRoom("cancelAll", [])) return;
  const count = run.cancelAll();
  setMessage(count ? `已撤銷 ${count} 筆掛單` : "目前沒有掛單");
  render();
});
$("set-protection").addEventListener("click", () => {
  const stopText = $("stop-price").value.trim();
  const takeText = $("take-price").value.trim();
  const stop = stopText ? Number(stopText) : null;
  const take = takeText ? Number(takeText) : null;
  if (sendToRoom("setProtection", [stop, take])) return;
  const error = run.setProtection(stop, take);
  $("protection-status").textContent = error ?? `已設定：止損 ${stopText || "—"} · 止盈 ${takeText || "—"}`;
});
$("clear-protection").addEventListener("click", () => {
  $("stop-price").value = "";
  $("take-price").value = "";
  if (sendToRoom("setProtection", [null, null])) return;
  run.protection = { stop: null, take: null };
  $("protection-status").textContent = "風險指令已清除";
});
$("leaderboard-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-record]");
  const record = records.find((row) => row.id === Number(button?.dataset.record));
  if (!record) return;
  beginNew(record.seed, "shadow", { seed: record.seed, score: record.score, path: record.path, name: "本機紀錄" }, record.rivals ?? "none");
});
$("result-close").addEventListener("click", () => $("result-dialog").close());
$("retry-button").addEventListener("click", () => beginNew(run.seed, "shadow", { seed: run.seed, score: run.result.score, path: run.result.path, name: "你的上一局" }, run.rivalSetting));
$("rivals").addEventListener("change", (event) => {
  rivalSetting = RIVAL_SETTINGS[event.target.value] ? event.target.value : "none";
  try { localStorage.setItem(RIVALS_KEY, rivalSetting); } catch { /* Optional preference. */ }
  beginNew(mode === "daily" ? dailySeed() : randomSeed(), mode === "daily" ? "daily" : "random");
});
$("next-button").addEventListener("click", () => beginNew(randomSeed()));
$("export-button").addEventListener("click", async () => {
  const text = JSON.stringify(run.exportData(), null, 1);
  try {
    await navigator.clipboard.writeText(text);
    $("share-status").textContent = `本局數據已複製（${Math.round(text.length / 1024)} KB），可以直接貼上。`;
  } catch {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.download = `flow-arena-${run.seed}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    $("share-status").textContent = "無法寫入剪貼簿，已改為下載 JSON 檔。";
  }
});
$("share-button").addEventListener("click", async () => {
  const name = $("handle").value.trim().slice(0, 18) || "匿名交易者";
  try { localStorage.setItem(PROFILE_KEY, name); } catch { /* Optional profile. */ }
  const code = encodeChallenge({ version: ARENA_VERSION, seed: run.seed, score: run.result.score, path: run.result.path, name, rivals: run.rivalSetting });
  const url = new URL(location.pathname, location.href);
  url.searchParams.set("challenge", code);
  try { await navigator.clipboard.writeText(url.href); $("share-status").textContent = "影子挑戰連結已複製，可以傳給朋友。"; }
  catch { $("share-status").textContent = `請複製：${url.href}`; }
});
/* ---------- Friend rooms ---------- */

function enterRoom(code) {
  if (online) online.room.close();
  playing = false;
  document.body.classList.add("online");
  online = { room: null, replica: null, startsAt: 0 };
  online.room = new ArenaRoomClient(code, {
    lobby: roomLobby,
    start: roomStart,
    game: roomMessage,
    rejected: (error) => setMessage(error, true),
    closed: (reason) => { leaveOnline(); showRoomEntry("", reason); },
  });
  showRoomLobby(online.room);
  render();
}

function leaveOnline() {
  if (!online) return;
  online.room.close();
  online = null;
  document.body.classList.remove("online");
  beginNew(randomSeed());
}

// Back in the lobby (a rematch, or before the first round): show the room and drop the old round.
function roomLobby(room) {
  if (room.status === "lobby" && online.replica?.run.finished !== false) {
    online.replica = null;
    if ($("result-dialog").open) $("result-dialog").close();
    showRoomLobby(room);
  }
  render();
}

// A round starts (or this player rejoins one): the page now renders the room's market.
function roomStart(message, you) {
  online.replica = new ArenaReplica(message, you);
  run = online.replica.run;
  run.lineup = [];
  run.rivalSetting = "none";
  online.startsAt = message.type === "start" ? performance.now() + message.countdown * 1000 : 0;
  resetView();
  if ($("room-dialog").open) $("room-dialog").close();
  playing = true;
  if (message.type === "start") {
    for (let left = message.countdown; left > 0; left--) setTimeout(() => { banner(String(left), "gold"); tone(440, 0.1, "square", 0.03); }, (message.countdown - left) * 1000);
    setTimeout(() => { banner("開始！", "mint"); chime(2); render(); }, message.countdown * 1000);
  }
  render();
}

function roomMessage(message) {
  if (!online?.replica) return;
  const result = online.replica.apply(message);
  if (message.type === "action" && message.trader === online.room.you) reportOwn(message, result);
  if (online.replica.desync) setMessage("畫面和房間不同步了，請重新整理頁面", true);
  if (message.type === "end") { playing = false; showResult(); }
  else render();
}

$("room-button").addEventListener("click", () => { audioContext(); if (online) showRoomLobby(online.room); else showRoomEntry(); });
$("room-create").addEventListener("click", () => { const code = readEntry(true); if (code) enterRoom(code); });
$("room-join").addEventListener("click", () => { const code = readEntry(false); if (code) enterRoom(code); });
$("room-code-input").addEventListener("keydown", (event) => { if (event.key === "Enter") $("room-join").click(); });
$("room-close").addEventListener("click", () => $("room-dialog").close());
$("room-leave").addEventListener("click", () => { online?.room.leave(); $("room-dialog").close(); leaveOnline(); });
$("room-start").addEventListener("click", () => online?.room.send({ type: "start" }));
for (const button of document.querySelectorAll("[data-room-bot]")) button.addEventListener("click", () => online?.room.send({ type: "addBot", level: button.dataset.roomBot }));
$("room-seats").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-seat]");
  if (button) online?.room.send({ type: "removeSeat", id: button.dataset.removeSeat });
});
$("room-copy").addEventListener("click", async () => {
  if (!online) return;
  try { await navigator.clipboard.writeText(online.room.link); $("room-share-status").textContent = "邀請連結已複製，貼給朋友就能加入。"; }
  catch { $("room-share-status").textContent = `請複製這個連結：${online.room.link}`; }
});
$("room-rematch").addEventListener("click", () => online?.room.send({ type: "rematch" }));
$("room-back").addEventListener("click", () => { $("result-dialog").close(); if (online) showRoomLobby(online.room); });

document.addEventListener("visibilitychange", () => { accumulated = 0; lastFrame = performance.now(); render(); });
document.addEventListener("keydown", (event) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName) || event.altKey || event.ctrlKey || event.metaKey) return;
  if ($("result-dialog").open || $("room-dialog").open) return;
  const key = event.key.toLowerCase();
  if (key === "q") submitOrder("buy", "market");
  else if (key === "e") submitOrder("sell", "market");
  else if (key === "f") closeNow();
  else if (key === "h") closePart(0.5);
  else if (["1", "2", "3", "4"].includes(key)) setUnit(UNIT_SIZES[Number(key) - 1]);
  else if (key === "5") setUnit("max");
  else if (key === " " && !online) { event.preventDefault(); togglePlay(); }
});
try { $("handle").value = localStorage.getItem(PROFILE_KEY) || ""; } catch { /* Optional profile. */ }
$("rivals").value = run.rivalSetting;
try { if (localStorage.getItem(GUIDE_KEY) === "closed") $("guide-panel").open = false; } catch { /* Optional preference. */ }
$("guide-panel").addEventListener("toggle", () => {
  try { localStorage.setItem(GUIDE_KEY, $("guide-panel").open ? "open" : "closed"); } catch { /* Optional preference. */ }
});
renderSoundToggle();
renderBoard();
render();
requestAnimationFrame(frame);
// An invite link joins the room once this browser has a name; otherwise ask for one first.
const invited = roomFromUrl();
if (invited && savedName()) enterRoom(invited);
else if (invited) showRoomEntry(invited, `你被邀請加入房間 ${invited}，輸入名字後按「加入」。`);
