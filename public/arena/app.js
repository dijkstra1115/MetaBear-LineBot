import { Sandbox } from "./engine/market.js";
import { DEFAULT_LEVERAGE, LEVERAGES, Player } from "./engine/player.js";
import { ALERT_KINDS, Session } from "./engine/session.js";
import { REGIMES } from "./engine/regime.js";
import { Tour, askForTour } from "./tutorial.js";
import { ActionLog, RANKED_TURNS, RANKED_VERSION, applyAction, rankedResult } from "./engine/ranked.js";
import { MAX_ZOOM, MIN_CANDLES, MIN_ZOOM, chartGeometry, chartOnAxis, chartPriceAt, drawChart, gameClock } from "./chart.js";

const $ = (id) => document.getElementById(id);
const TICKS_PER_SECOND = 30;
const fmt = (value, digits = 0) => Number(value).toLocaleString("zh-TW", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const money = (value) => `${value >= 0 ? "+" : "−"}$${fmt(Math.abs(value))}`;
const plain = (value) => `$${fmt(Math.abs(value))}`;
const price = (cents) => fmt(cents / 100, 0);
const btc = (lots) => `${fmt(lots / 100, lots >= 1000 ? 0 : 1)} BTC`;
const signedBtc = (lots) => `${lots >= 0 ? "+" : "−"}${fmt(Math.abs(lots) / 100, Math.abs(lots) >= 1000 ? 0 : 1)} BTC`;
const pct = (value, digits = 2) => `${value >= 0 ? "+" : "−"}${fmt(Math.abs(value) * 100, digits)}%`;
const mmss = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(`flow-arena-sandbox:${key}`);
      return value == null ? fallback : JSON.parse(value);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`flow-arena-sandbox:${key}`, JSON.stringify(value)); } catch { /* storage is optional */ }
  },
};

let sim = null;
let player = null;
let session = null;
let running = false;
let speed = store.get("speed", 1);
let orderType = "market";
let soundEnabled = store.get("sound", true);
let effectsEnabled = store.get("effects", true);
let audio = null;
let seenFeedId = 0;
let accumulator = 0;
let lastFrame = null;
let lastRender = 0;
let openPrice = 0;
let turnOpen = null;
let message = { text: "", error: false };
const alertPrefs = { bigFlow: true, cascade: true, own: true, move: true, event: true, ...store.get("alerts", {}) };
// Chart indicators the player can switch on and off.
const INDICATOR_DEFAULTS = { ema20: true, ema50: true, vwap: true, volume: true, cvd: true, oi: true, footprint: true, absorb: true, omen: true, fills: true };
const view = { count: 120, zoom: 1, offset: 0, layer: "liq", ind: { ...INDICATOR_DEFAULTS, ...store.get("indicators", {}) }, pushes: [], now: 0, reveal: false, frame: { low: null, high: null, hold: false }, flashes: [], cursorPrice: null, cursorLabel: null };

/* ---------- Tutorial ---------- */

let touring = false;
function startTour() {
  if (touring) return;
  touring = true;
  running = false;
  $("pause-card").hidden = true;
  document.querySelector(".indicator-menu")?.removeAttribute("open");
  render();
  new Tour(undefined, { onEnd: () => { touring = false; } }).start();
}

/* ---------- Market lifecycle ---------- */

function randomSeed() {
  return 1 + Math.floor(Math.random() * 0xfffffffe);
}

// Ranked games log every action that can move the market, so the server can replay them later.
let ranked = null; // { log, over, result }

// Every market-changing player action goes through here.
function act(op, args = {}) {
  if (ranked?.over) return op === "leverage" || op === "protect" ? "這局排名賽已經結束" : { ok: false, error: "這局排名賽已經結束" };
  return ranked ? ranked.log.apply(player, op, args) : applyAction(player, { op, args });
}

function newMarket(seed = randomSeed(), { rankedGame = false } = {}) {
  running = false;
  $("loading").hidden = false;
  $("pause-card").hidden = true;
  setTimeout(() => {
    sim = new Sandbox(seed);
    player = new Player(sim);
    ranked = rankedGame ? { log: new ActionLog(sim), over: false, result: null } : null;
    act("leverage", { leverage: store.get("leverage", DEFAULT_LEVERAGE) });
    document.body.classList.toggle("ranked", Boolean(ranked));
    $("ranked-final").hidden = true;
    session = new Session(sim);
    session.alerts = { ...alertPrefs };
    seenFeedId = sim.liquidationFeed.at(-1)?.id ?? 0;
    openPrice = sim.last;
    turnOpen = snapshot();
    cascadeFx = null;
    streak = 0;
    $("streak").hidden = true;
    milestone = { key: null, reached: 0 };
    lastRealized = 0;
    $("cascade-meter").hidden = true;
    $("edge-glow").className = "edge-glow";
    view.frame = { low: null, high: null, hold: false };
    view.flashes = [];
    view.offset = 0;
    view.zoom = 1;
    $("seed-label").textContent = String(seed);
    $("loading").hidden = true;
    setMessage(ranked ? `排名賽開始：${RANKED_TURNS} 回合，比最後的總損益。揭曉在排名賽中停用。` : "新市場已建立。計畫階段市場暫停：先讀圖、推測人群的停損與強平在哪，再按「執行回合」。");
    // First visit: offer the walkthrough once the page is filled in.
    if (!store.get("tourSeen", false)) {
      store.set("tourSeen", true);
      setTimeout(() => askForTour({ onYes: startTour, onNo: () => {} }), 400);
    }
    render();
  }, 30);
}

function snapshot() {
  turnPeak = 0;
  turnStalls = 0;
  const stats = player.stats;
  return { price: sim.last, cvd: sim.cvd, oi: sim.oi, pnl: player.equity(), feed: sim.liquidationFeed.at(-1)?.id ?? 0, time: sim.time, ignited: stats.ignited, volume: stats.volume, liquidations: stats.liquidations };
}

// Best gain reached during the turn, and how many pushes ran into hidden size.
let turnPeak = 0;
let turnStalls = 0;

function setRunning(next) {
  if (!sim || (next && ranked?.over)) return;
  if (next && view.reveal) toggleReveal(false);
  running = next;
  if (running) $("pause-card").hidden = true;
  accumulator = 0;
  render();
}

/* ---------- Sound and effects ---------- */

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
  } catch { /* audio is optional */ }
}

function boom(strength = 0.5) {
  tone(110 + strength * 40, 0.18 + strength * 0.35, "sine", 0.09 + strength * 0.08, 38);
}

function chartPoint(cents) {
  const geometry = chartGeometry($("market-chart"), sim, view);
  const yy = Math.max(geometry.priceTop + 14, Math.min(geometry.priceBottom - 14, geometry.y(cents)));
  return { x: geometry.x(Math.max(0, geometry.candles.length - 1)), y: yy };
}

function particles(x, y, color, count = 14, spread = 260) {
  if (reducedMotion || !effectsEnabled) return;
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

function floatLabel(text, x, y, toneName = "mint", big = false) {
  if (!effectsEnabled) return;
  const layer = $("fx-layer");
  const label = document.createElement("div");
  label.className = `fx-label ${toneName}${big ? " big" : ""}`;
  label.textContent = text;
  label.style.left = `${x}px`;
  label.style.top = `${y}px`;
  layer.append(label);
  label.addEventListener("animationend", () => label.remove(), { once: true });
  while (layer.children.length > 14) layer.firstChild.remove();
}

function ring(x, y, toneName = "mint", strength = 0.5) {
  if (reducedMotion || !effectsEnabled) return;
  const shock = document.createElement("span");
  shock.className = `fx-ring ${toneName}`;
  shock.style.left = `${x}px`;
  shock.style.top = `${y}px`;
  shock.style.setProperty("--ring", `${120 + strength * 260}px`);
  $("fx-layer").append(shock);
  shock.addEventListener("animationend", () => shock.remove(), { once: true });
}

function shake(level = 1) {
  if (reducedMotion || !effectsEnabled) return;
  const panel = document.querySelector(".market-panel");
  panel.classList.remove("shake-1", "shake-2", "shake-3");
  void panel.offsetWidth;
  panel.classList.add(`shake-${Math.max(1, Math.min(3, level))}`);
}

function flashScreen(toneName = "mint", strength = 0.5) {
  if (!effectsEnabled) return;
  const overlay = $("flash-overlay");
  overlay.className = `flash-overlay ${toneName}`;
  overlay.style.setProperty("--flash", String(Math.min(0.55, 0.14 + strength * 0.4)));
  void overlay.offsetWidth;
  overlay.classList.add("on");
}

function banner(text, toneName = "gold") {
  if (!effectsEnabled) return;
  const box = $("combo-banner");
  box.textContent = text;
  box.className = `combo-banner ${toneName}`;
  box.hidden = false;
  box.style.animation = "none";
  void box.offsetWidth;
  box.style.animation = "";
  clearTimeout(box.hideTimer);
  box.hideTimer = setTimeout(() => { box.hidden = true; }, 1700);
}

function setMessage(text, error = false) {
  message = { text, error };
  $("order-message").textContent = text;
  $("order-message").classList.toggle("error", error);
}

// A cascade is a run of liquidation waves on one side with no more than two simulated seconds
// between them. Its tier (1–5) grows with the number of waves and the size burned, and every
// effect scales with it: labels, particles, shake, the edge glow, the chain meter and the sound.
let cascadeFx = null;
const CASCADE_GAP = 2;
const TIER_TITLES = ["", "強平", "連環強平", "連環爆倉！", "MEGA CASCADE", "LIQUIDATION STORM"];

// A long chain of tiny waves is not a storm: the tier needs both length and size, except that a
// truly huge burn (1,000+ BTC) earns its tier on size alone.
function cascadeTier(cascade) {
  const btcBurned = cascade.lots / 100;
  const byWaves = cascade.waves >= 9 ? 5 : cascade.waves >= 6 ? 4 : cascade.waves >= 4 ? 3 : cascade.waves >= 2 ? 2 : 1;
  const bySize = btcBurned >= 800 ? 5 : btcBurned >= 300 ? 4 : btcBurned >= 100 ? 3 : btcBurned >= 20 ? 2 : 1;
  let tier = Math.min(byWaves, bySize);
  if (btcBurned >= 1000) tier = Math.max(tier, 4);
  if (btcBurned >= 3000) tier = 5;
  return tier;
}

function processLiquidations() {
  const fresh = sim.liquidationFeed.filter((item) => item.id > seenFeedId && !item.warm);
  if (!fresh.length) return;
  seenFeedId = fresh.at(-1).id;
  const now = performance.now();
  for (const item of fresh) {
    if (!cascadeFx || cascadeFx.ended || cascadeFx.side !== item.side || item.time - cascadeFx.lastTime > CASCADE_GAP) {
      if (cascadeFx && !cascadeFx.ended) endCascade();
      cascadeFx = { side: item.side, waves: 0, lots: 0, mine: 0, from: item.from, to: item.to, lastTime: item.time, lastReal: now, tier: 0, ended: false };
    }
    const cascade = cascadeFx;
    cascade.waves++;
    cascade.lots += item.lots;
    cascade.to = item.to;
    cascade.lastTime = item.time;
    cascade.lastReal = now;
    if (item.by === "player") cascade.mine += item.lots;
    const tier = cascadeTier(cascade);
    view.flashes.push({ from: item.from, to: item.to, side: item.side, born: now, age: 0 });
    const point = chartPoint(item.to);
    const toneName = item.side === "short" ? "mint" : "coral";
    const color = item.side === "short" ? "#8bf2c8" : "#ff879d";
    floatLabel(`💥 ${item.side === "short" ? "空單" : "多單"}強平 ${btc(item.lots)}`, point.x - 12, point.y, `${toneName} t${tier}`, tier >= 3);
    ring(point.x, point.y, toneName, Math.min(1, 0.25 + tier * 0.18));
    if (tier >= 4) setTimeout(() => ring(point.x, point.y, toneName, 1), 140);
    particles(point.x, point.y, color, 6 + tier * 12, 140 + tier * 90);
    if (tier >= 3) particles(point.x, point.y, "#f6d78c", tier * 6, 200 + tier * 80);
    if (tier > cascade.tier) escalate(cascade, tier);
  }
  view.flashes = view.flashes.slice(-10);
  const cascade = cascadeFx;
  const tier = cascade.tier;
  shake(Math.min(3, tier));
  flashScreen(cascade.side === "short" ? "mint" : "coral", Math.min(1, tier / 4));
  boom(Math.min(1, 0.2 + tier * 0.18));
  // The pitch climbs with every wave of the chain.
  if (cascade.waves >= 2) setTimeout(() => tone(330 * 2 ** (Math.min(cascade.waves, 14) / 12), 0.12, "square", 0.025), 80);
  updateCascadeMeter(true);
}

// Crossing into a new tier: a banner for each step, the storm treatment at the top.
function escalate(cascade, tier) {
  cascade.tier = tier;
  const toneName = cascade.side === "short" ? "mint" : "coral";
  const glow = $("edge-glow");
  glow.className = `edge-glow ${cascade.side} on`;
  glow.style.setProperty("--tier", String(tier));
  if (!effectsEnabled) glow.className = "edge-glow";
  if (tier === 2) banner(`連環強平 ×${cascade.waves}`, toneName);
  if (tier === 3) banner(`連環爆倉 ×${cascade.waves}！`, toneName);
  if (tier === 4) {
    banner("MEGA CASCADE", "gold");
    chime(6);
  }
  if (tier === 5 && effectsEnabled) {
    const storm = $("storm-text");
    storm.className = `storm-text ${cascade.side}`;
    storm.hidden = false;
    storm.style.animation = "none";
    void storm.offsetWidth;
    storm.style.animation = "";
    clearTimeout(storm.hideTimer);
    storm.hideTimer = setTimeout(() => { storm.hidden = true; }, 1700);
    const wrap = document.querySelector(".chart-wrap");
    wrap.classList.remove("glitch");
    void wrap.offsetWidth;
    if (!reducedMotion) wrap.classList.add("glitch");
    boom(1);
    setTimeout(() => boom(0.8), 180);
  }
  if (cascade.mine && tier >= 2) setTimeout(() => banner(`🔥 你點燃了${TIER_TITLES[tier]}`, "gold"), 500);
}

function updateCascadeMeter(pop = false) {
  const meter = $("cascade-meter");
  const cascade = cascadeFx;
  if (!cascade || !effectsEnabled || cascade.waves < 2) {
    if (!cascade?.ended) meter.hidden = true;
    return;
  }
  meter.hidden = false;
  meter.className = `cascade-meter ${cascade.side} tier-${cascade.tier}${cascade.ended ? " ended" : ""}${pop ? " pop" : ""}`;
  meter.style.setProperty("--tier", String(cascade.tier));
  $("cascade-title").textContent = cascade.ended ? "連環結束" : TIER_TITLES[cascade.tier];
  $("cascade-count").textContent = `×${cascade.waves}`;
  $("cascade-detail").textContent = `${btc(cascade.lots)} · ${pct(cascade.to / cascade.from - 1)}${cascade.mine ? ` · 你引爆 ${btc(cascade.mine)}` : ""}`;
  if (pop) {
    void meter.offsetWidth;
    meter.classList.add("pop");
  }
}

function endCascade() {
  const cascade = cascadeFx;
  if (!cascade || cascade.ended) return;
  cascade.ended = true;
  $("edge-glow").className = "edge-glow";
  updateCascadeMeter();
  const meter = $("cascade-meter");
  clearTimeout(meter.hideTimer);
  meter.hideTimer = setTimeout(() => { if (cascadeFx === cascade) meter.hidden = true; }, 2600);
  if (cascade.mine && cascade.waves >= 2) banner(`🔥 你引爆的連環：${btc(cascade.lots)}`, "gold");
}

// A cascade ends once no wave follows within two simulated seconds, or five real seconds while paused.
function checkCascadeEnd(now) {
  if (!cascadeFx || cascadeFx.ended) return;
  if (sim.time - cascadeFx.lastTime > CASCADE_GAP + 1 || now - cascadeFx.lastReal > 5000) endCascade();
}

// Danger glow and heartbeat while your liquidation price is close to the mark.
let heartbeatAt = 0;
function updateDanger(now, mark) {
  const glow = $("danger-glow");
  const liq = player?.position ? player.liquidationPrice() : null;
  const distance = liq ? Math.abs(liq / mark - 1) : Infinity;
  const level = distance < 0.004 ? 2 : distance < 0.01 ? 1 : 0;
  glow.className = level && effectsEnabled ? `danger-glow on${level === 2 ? " critical" : ""}` : "danger-glow";
  if (level && running && now > heartbeatAt) {
    heartbeatAt = now + (level === 2 ? 520 : 950);
    tone(62, 0.11, "sine", 0.14);
    setTimeout(() => tone(52, 0.13, "sine", 0.11), 150);
  }
}

// Floating-profit milestones on the open position, and a cash burst when a big result is banked.
const MILESTONES = [1e6, 2.5e6, 5e6, 1e7, 2.5e7, 5e7, 1e8];
let milestone = { key: null, reached: 0 };
let lastRealized = 0;
function updateMoneyMoments(floating) {
  const account = player.account;
  const key = account.position ? `${Math.sign(account.position)}:${account.entry}` : null;
  if (key !== milestone.key) milestone = { key, reached: 0 };
  const next = MILESTONES[milestone.reached];
  if (key && next != null && floating >= next) {
    milestone.reached = MILESTONES.filter((value) => floating >= value).length;
    const point = chartPoint(sim.last);
    banner(`💰 浮盈 +$${fmt(MILESTONES[milestone.reached - 1] / 1e6, 1)}M`, "gold");
    particles(point.x, point.y, "#f6d78c", 20 + milestone.reached * 8, 260 + milestone.reached * 40);
    chime(milestone.reached + 2);
  }
  // Realized PnL only: opening a big position pays a big fee, which is not a result.
  const banked = account.realized - lastRealized;
  if (Math.abs(banked) >= 100000) showCash(banked);
  if (Math.abs(banked) >= 10000) registerResult(banked);
  lastRealized = account.realized;
}

function showCash(value) {
  if (!effectsEnabled) return;
  const box = $("pnl-burst");
  box.textContent = money(value);
  box.className = `pnl-burst ${value >= 0 ? "gain" : "loss"}`;
  box.hidden = false;
  box.style.animation = "none";
  void box.offsetWidth;
  box.style.animation = "";
  clearTimeout(box.hideTimer);
  box.hideTimer = setTimeout(() => { box.hidden = true; }, 1400);
  const chart = $("market-chart").getBoundingClientRect();
  if (value > 0) {
    particles(chart.width * 0.45, chart.height * 0.34, "#f6d78c", Math.min(60, 16 + Math.log10(value) * 6), 420);
    chime(Math.min(8, Math.round(Math.log10(value))));
  } else {
    particles(chart.width * 0.45, chart.height * 0.34, "#ff879d", 10, 220);
    tone(200, 0.22, "sawtooth", 0.035, 120);
  }
}

function chime(step = 0) {
  const base = 660 * 2 ** (Math.min(step, 10) / 12);
  tone(base, 0.12, "triangle", 0.045);
  setTimeout(() => tone(base * 1.5, 0.16, "triangle", 0.04), 70);
}

function describeEvent(event) {
  const side = event.side === "buy" ? "買" : "賣";
  switch (event.kind) {
    case "fill": return `掛單成交：${side} ${btc(event.lots)} @ ${price(event.price)}`;
    case "stop": return `止損觸發（標記價 ${price(event.price)}），市價平倉 ${Math.round((event.fraction ?? 1) * 100)}%`;
    case "take": return `止盈觸發（標記價 ${price(event.price)}），市價平倉 ${Math.round((event.fraction ?? 1) * 100)}%`;
    case "liquidation": return `你的${event.side === "long" ? "多單" : "空單"} ${btc(event.lots)} 在 ${price(event.price)} 被強平，賠掉保證金 ${plain(event.lost)}`;
    case "danger": return `你的強平價 ${price(event.price)} 距離標記價不到 1%`;
    case "rejected": return `委託沒有送出：${event.error}`;
    default: return "";
  }
}

// A market order (or a close) went out: report it, and show the push or the wall it hit.
function showPush(event) {
  const word = event.side === "buy" ? "買入" : "賣出";
  const label = event.reduceOnly ? "平倉" : `市價${word}`;
  const move = event.to / event.from - 1;
  if (event.stalled) {
    turnStalls++;
    const promisedMove = event.promised / event.from - 1;
    setMessage(`${label} ${btc(event.matched)}：簿上看得到的掛單應該推到 ${price(event.promised)}（${pct(promisedMove)}），實際只到 ${price(event.to)}（${pct(move)}）。看不見的掛單在吸收你的單。`, true);
  } else {
    setMessage(`${label} ${btc(event.matched)}，均價 ${price(event.avgPrice ?? event.from)}，價格 ${pct(move)}${event.unfilled ? `；${btc(event.unfilled)} 超出 10% 保護價未成交` : ""}${event.wave ? `；引爆強平 ${btc(event.wave.lots)}` : ""}`);
  }
  if (event.reduceOnly && !event.stalled) return;
  if (effectsEnabled && event.matched >= 5000) {
    view.pushes.push({ from: event.from, to: event.to, expected: event.stalled ? event.promised : null, side: event.side, stalled: event.stalled, born: performance.now() });
    view.pushes = view.pushes.slice(-4);
  }
  const point = chartPoint(event.to);
  if (event.stalled) {
    floatLabel("🛡 撞牆！有人在吸收", point.x - 40, point.y + (event.side === "buy" ? -28 : 28), "amber", true);
    // A dull thud instead of the usual click.
    tone(78, 0.3, "square", 0.07, 48);
    boom(0.35);
    shake(2);
    return;
  }
  if (Math.abs(move) >= 0.0015) {
    floatLabel(`推動 ${pct(move)}`, point.x - 40, point.y + (move > 0 ? 26 : -26), move > 0 ? "mint" : "coral", Math.abs(move) >= 0.01);
    ring(point.x, point.y, move > 0 ? "mint" : "coral", Math.min(1, Math.abs(move) * 50));
  }
  if (event.matched >= 125000) shake(event.matched >= 500000 ? 2 : 1);
  tone(event.side === "buy" ? 680 : 420, 0.1, "triangle", 0.04);
}

function processEvents(events) {
  for (const event of events) {
    const point = chartPoint(event.price ?? event.to ?? sim.last);
    if (event.kind === "push") showPush(event);
    else if (event.kind === "placed") {
      setMessage(`限價${event.side === "buy" ? "買入" : "賣出"} ${btc(event.lots)} @ ${price(event.price)}${event.matched ? `，立即成交 ${btc(event.matched)}` : ""}${event.resting ? `，掛單 ${btc(event.resting)}` : ""}`);
    } else if (event.kind === "liquidation") {
      flashScreen("danger", 1);
      shake(3);
      boom(1);
      floatLabel(`💥 你的${event.side === "long" ? "多單" : "空單"}被強平`, point.x - 12, point.y, "coral", true);
      banner(`你被強平了 ${money(-event.lost)}`, "coral");
      setMessage(describeEvent(event), true);
    } else if (event.kind === "fill") {
      floatLabel(`◆ ${event.side === "buy" ? "買" : "賣"} ${btc(event.lots)}`, point.x - 12, point.y, event.side === "buy" ? "mint" : "coral");
      tone(event.side === "buy" ? 720 : 520, 0.08, "triangle", 0.03);
    } else {
      setMessage(describeEvent(event), Boolean(event.error));
    }
  }
}

/* ---------- Turns and pauses ---------- */

// The verdict on a turn, most telling first.
function judgeTurn({ pnl, ignited, liquidated, traded, peak, stalls }) {
  if (liquidated) return { text: "💀 被市場反殺", tone: "coral", tip: "你的強平價就是別人眼中的燃料。降低槓桿，或把止損放在強平價前面。" };
  if (!traded) return { text: "👀 觀望", tone: "amber", tip: "沒出手也是一種選擇。下回合想好要找哪一條燃料、怎麼確認它是真的。" };
  if (ignited >= 30000 && pnl > 0) return { text: "🔥 完美點火", tone: "gold", tip: "推穿燃料、吃到連環、帶著利潤離場。" };
  if (ignited > 0 && pnl > 0) return { text: "💥 點火成功", tone: "mint", tip: "連環停下的那一刻就是出場訊號，留意 OI 和 CVD 何時轉向。" };
  if (pnl > 0 && peak >= 300000 && pnl < peak * 0.5) return { text: "🎢 坐了趟雲霄飛車", tone: "amber", tip: `最高曾賺 ${money(peak)}，最後留不到一半。推完後別等價格自己回頭。` };
  if (pnl >= 1e6) return { text: "💰 大豐收", tone: "gold", tip: "賺到的單就讓它落袋，別讓它變成下一回合的燃料。" };
  if (pnl > 0) return { text: "✅ 小有斬獲", tone: "mint", tip: "穩穩賺到。下回合可以找更亮的燃料試試看。" };
  if (stalls) return { text: "🛡 撞牆了", tone: "coral", tip: "推之前先丟小單試探：價格推不動、Footprint 在同一價位堆量，就是有人在吸收。" };
  if (ignited > 0) return { text: "🧨 點了火卻燒到自己", tone: "coral", tip: "引爆後沒及時離場，回彈吃掉了利潤。" };
  return { text: "📉 繳學費", tone: "coral", tip: "看看這回合的 OI 和 CVD：價格動之前，它們有沒有先給訊號？" };
}

// Numbers on the report count up from zero, one row after another.
function countUp(element, target, format, delay) {
  element.textContent = format(0);
  setTimeout(() => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 550);
      element.textContent = format(target * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    tone(520 + delay / 3, 0.05, "triangle", 0.025);
  }, delay);
}

function showRankedFinal() {
  const result = ranked.result;
  $("ranked-pnl").textContent = money(result.pnl);
  $("ranked-pnl").className = result.pnl > 0 ? "positive" : result.pnl < 0 ? "negative" : "";
  $("ranked-stats").textContent = `成交 ${btc(result.volume)} · 引爆強平 ${btc(result.ignited)} · 被強平 ${result.liquidations} 次 · 種子 ${sim.seed}`;
  $("ranked-name").value = store.get("rankedName", "");
  $("ranked-status").textContent = "";
  $("ranked-name").disabled = false;
  $("ranked-upload").textContent = "上傳成績";
  $("ranked-upload").disabled = false;
  $("ranked-final").hidden = false;
  if (result.pnl > 0) chime(8);
}

async function uploadRanked() {
  const name = $("ranked-name").value.trim().slice(0, 18);
  if (!name) return ($("ranked-status").textContent = "請輸入名稱");
  store.set("rankedName", name);
  $("ranked-upload").disabled = true;
  $("ranked-status").textContent = "上傳中…";
  try {
    const response = await fetch("/arena/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: RANKED_VERSION, seed: sim.seed, turns: RANKED_TURNS, name, pnl: ranked.result.pnl, stats: ranked.result, actions: ranked.log.actions }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body.error ?? `伺服器回應 ${response.status}`);
    // Stay on the card; the button turns into the way to the board.
    ranked.uploadedId = body.id;
    $("ranked-status").textContent = `已上傳，目前第 ${body.rank} 名。`;
    $("ranked-name").disabled = true;
    $("ranked-upload").textContent = "查看排行榜";
    $("ranked-upload").disabled = false;
  } catch (error) {
    $("ranked-upload").disabled = false;
    $("ranked-status").textContent = `上傳失敗：${error.message}`;
  }
}

async function showLeaderboard(highlight = null) {
  const dialog = $("leaderboard");
  const list = $("leaderboard-rows");
  list.replaceChildren();
  $("leaderboard-status").textContent = "讀取中…";
  if (!dialog.open) dialog.showModal();
  try {
    const response = await fetch("/arena/api/scores");
    const body = await response.json();
    if (!response.ok) throw Error(body.error ?? `伺服器回應 ${response.status}`);
    $("leaderboard-status").textContent = body.scores.length ? "" : "還沒有成績，成為第一個吧。";
    list.replaceChildren(...body.scores.map((row, index) => {
      const tr = document.createElement("tr");
      if (row.id === highlight) tr.className = "you";
      const cells = [index + 1, row.name, money(row.pnl), row.seed, new Date(row.createdAt).toLocaleDateString("zh-TW")];
      for (const value of cells) {
        const td = document.createElement("td");
        td.textContent = String(value);
        tr.append(td);
      }
      if (row.pnl < 0) tr.children[2].className = "negative";
      else if (row.pnl > 0) tr.children[2].className = "positive";
      return tr;
    }));
  } catch (error) {
    $("leaderboard-status").textContent = `讀取失敗：${error.message}（本機預覽伺服器沒有排行榜 API）`;
  }
}

function showReport() {
  const before = turnOpen;
  const pnl = player.equity() - before.pnl;
  const ignited = player.stats.ignited - before.ignited;
  const liquidated = player.stats.liquidations - before.liquidations;
  const traded = player.stats.volume - before.volume;
  const burned = sim.liquidationFeed.filter((item) => item.id > before.feed && !item.warm).reduce((sum, item) => sum + item.lots, 0);
  const verdict = judgeTurn({ pnl, ignited, liquidated, traded, peak: turnPeak, stalls: turnStalls });
  const rows = [
    ["本回合損益", pnl, money, pnl > 0 ? "positive" : pnl < 0 ? "negative" : ""],
    ["最高浮盈", Math.max(0, turnPeak), money, ""],
    ["你引爆的強平", ignited, (value) => btc(Math.round(value)), ignited ? "gold" : ""],
    ["撞牆", turnStalls, (value) => `${Math.round(value)} 次`, turnStalls ? "negative" : ""],
    ["成交量", traded, (value) => btc(Math.round(value)), ""],
  ];
  const market = [
    ["價格", `${price(before.price)} → ${price(sim.last)}（${pct(sim.last / before.price - 1)}）`],
    ["CVD／OI", `${signedBtc(sim.cvd - before.cvd)}／${signedBtc(sim.oi - before.oi)}`],
    ["全場強平", burned ? btc(burned) : "無"],
  ];
  const card = $("pause-card");
  $("pause-kind").textContent = `TURN REPORT · 第 ${session.turn - 1} 回合`;
  $("pause-title").textContent = verdict.text;
  const items = [];
  rows.forEach(([label, value, format, className], index) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    if (className) dd.className = className;
    dt.style.setProperty("--i", String(index));
    dd.style.setProperty("--i", String(index));
    items.push(dt, dd);
    countUp(dd, value, format, 250 + index * 160);
  });
  market.forEach(([label, value], index) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    dt.className = "market";
    const dd = document.createElement("dd");
    dd.textContent = value;
    dd.className = "market";
    dt.style.setProperty("--i", String(rows.length + index));
    dd.style.setProperty("--i", String(rows.length + index));
    items.push(dt, dd);
  });
  $("pause-stats").replaceChildren(...items);
  $("pause-detail").textContent = verdict.tip;
  card.className = `pause-card report ${verdict.tone}`;
  card.hidden = false;
  setTimeout(() => {
    if (verdict.tone === "gold") {
      chime(7);
      const box = card.getBoundingClientRect();
      const chart = $("market-chart").getBoundingClientRect();
      particles(box.left - chart.left + box.width / 2, box.top - chart.top + 40, "#f6d78c", 36, 420);
    } else if (verdict.tone === "coral") tone(180, 0.3, "sawtooth", 0.03, 110);
    else chime(3);
  }, 250 + rows.length * 160);
  turnOpen = snapshot();
  // The game ends the moment the last turn does: lock it and take the score now, then let the
  // report play before the final card.
  if (ranked && !ranked.over && session.turn > RANKED_TURNS) {
    ranked.over = true;
    ranked.result = rankedResult(sim, player);
    running = false;
    setTimeout(showRankedFinal, 1400);
  }
}

// Consecutive profitable closes stack into a streak; a losing close breaks it.
let streak = 0;
function registerResult(banked) {
  const box = $("streak");
  if (banked > 0) {
    streak++;
    if (streak < 2 || !effectsEnabled) return;
    box.hidden = false;
    box.className = `streak tier-${streak >= 10 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1 : 0}`;
    $("streak-count").textContent = `×${streak}`;
    void box.offsetWidth;
    box.classList.add("pop");
    chime(Math.min(10, streak + 1));
    if (streak === 3 || streak === 5 || streak === 10 || (streak > 10 && streak % 5 === 0)) banner(`🔥 ${streak} 連勝！`, "gold");
    return;
  }
  if (streak >= 2 && effectsEnabled) {
    $("streak-count").textContent = `×${streak}`;
    box.hidden = false;
    box.className = "streak broken";
    tone(440, 0.25, "sawtooth", 0.035, 140);
    clearTimeout(box.hideTimer);
    box.hideTimer = setTimeout(() => { box.hidden = true; }, 900);
  }
  streak = 0;
}

function showPause(result) {
  const card = $("pause-card");
  const stats = [];
  let title = "";
  let kind = "";
  let detail = "";
  let toneName = "amber";
  if (result.stop === "turn") {
    showReport();
    return;
  } else {
    const alert = result.alert;
    kind = `TACTICAL PAUSE · ${ALERT_KINDS[alert.kind]}`;
    const move = `${price(alert.from)} → ${price(alert.to)}（${pct(alert.to / alert.from - 1)}）`;
    if (alert.kind === "bigFlow") {
      title = `大額主動${alert.side === "buy" ? "買" : "賣"}單：${btc(alert.lots)}`;
      toneName = alert.side === "buy" ? "mint" : "coral";
      stats.push(["10 秒價格", move], ["CVD", signedBtc(alert.cvd)], ["OI", signedBtc(alert.oi)]);
      detail = alert.oi > 0 ? "OI 增加：有人在開新倉。跟上、接住，還是等它力竭？" : "OI 減少：這是平倉或停損潮，燃料用掉後動能可能衰退。";
    } else if (alert.kind === "cascade") {
      title = `${alert.side === "long" ? "多單" : "空單"}連環強平開始`;
      toneName = alert.side === "long" ? "coral" : "mint";
      stats.push(["第一波", btc(alert.lots)], ["10 秒價格", move], ["OI", signedBtc(alert.oi)]);
      detail = alert.by === "player" ? "是你推出來的。下一條燃料在哪？什麼時候該走？" : "強平單會繼續推價，直到燃料用完；之後價格守不守得住，要看場內有沒有人接手。";
    } else if (alert.kind === "event") {
      title = `⚡ ${alert.name}`;
      toneName = alert.eventKind === "squeeze" || alert.eventKind === "accumulate" ? "mint" : "coral";
      stats.push(["10 秒價格", move], ["CVD", signedBtc(alert.cvd)], ["OI", signedBtc(alert.oi)]);
      detail = alert.text;
      shake(2);
      boom(0.6);
    } else if (alert.kind === "move") {
      title = `回合內價格已移動 ${pct(alert.move)}`;
      stats.push(["回合開始", price(session.turnStartPrice)], ["現價", price(sim.last)], ["CVD 10 秒", signedBtc(alert.cvd)]);
    } else {
      title = "你的委託有動靜";
      toneName = "mint";
      detail = alert.events.map(describeEvent).join("；");
      if (alert.events.some((event) => event.kind === "liquidation" || event.kind === "danger")) toneName = "coral";
    }
  }
  $("pause-kind").textContent = kind;
  $("pause-title").textContent = title;
  $("pause-stats").replaceChildren(...stats.flatMap(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));
  $("pause-detail").textContent = detail;
  card.className = `pause-card ${toneName}`;
  card.hidden = false;
  tone(toneName === "coral" ? 260 : 600, 0.18, "triangle", 0.04);
}

function handleRun(result) {
  processEvents(result.events);
  processLiquidations();
  if (turnOpen) turnPeak = Math.max(turnPeak, player.equity() - turnOpen.pnl);
  if (result.stop) {
    running = false;
    showPause(result);
    render();
  }
}

/* ---------- Orders ---------- */

function sizeLots() {
  const value = Number($("size-input").value);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

function priceCents() {
  const value = Number(String($("price-input").value).replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

// While the market runs an order goes straight in; while paused it waits in the queue and is sent at
// a random point in the first second of the next run.
function place(order) {
  if (!sim) return;
  if (running) {
    const result = act("execute", order);
    processEvents(player.drainEvents());
    if (!result.ok) setMessage(result.error, true);
  } else {
    const result = act("enqueue", order);
    if (!result.ok) return setMessage(result.error, true);
    setMessage(`${describeOrder(order)} 已排入待送出：按「執行」後，會在第一秒內和其他人的單一起送出。`);
    tone(560, 0.06, "triangle", 0.03);
  }
  processLiquidations();
  render();
}

function describeOrder(order) {
  if (order.type === "close") return `平倉 ${Math.round(order.fraction * 100)}%`;
  const word = order.side === "buy" ? "買" : "賣";
  return order.type === "limit" ? `限價${word} ${btc(order.lots)} @ ${price(order.price)}` : `市價${word} ${btc(order.lots)}`;
}

function submit(side) {
  const lots = sizeLots();
  if (!lots) return setMessage("請輸入數量", true);
  const reduceOnly = $("reduce-only").checked;
  if (orderType === "limit") {
    const cents = priceCents();
    if (!cents) return setMessage("請輸入價格，或直接點圖表填入", true);
    return place({ type: "limit", side, lots, price: cents, reduceOnly });
  }
  place({ type: "market", side, lots, reduceOnly });
}

function closeFraction() {
  return Math.max(0.01, Math.min(1, Number($("close-range").value) / 100));
}

function closeNow(fraction = closeFraction()) {
  if (!player?.position) return setMessage("目前沒有持倉", true);
  place({ type: "close", fraction });
}

function setOrderType(type) {
  orderType = type;
  document.querySelectorAll("[data-type]").forEach((button) => button.classList.toggle("active", button.dataset.type === type));
  $("price-field").hidden = type !== "limit";
  render();
}

function toggleReveal(next = !view.reveal) {
  if (next && ranked) return setMessage("排名賽中不能揭曉。", true);
  view.reveal = next;
  if (next) {
    running = false;
    $("pause-card").hidden = true;
  }
  $("reveal-button").setAttribute("aria-pressed", String(next));
  $("reveal-panel").hidden = !next;
  render();
}

/* ---------- Rendering ---------- */

function renderBook() {
  // Depth around the mid: right after a sweep the last trade sits at the tip of the wick.
  const mid = sim.markPrice();
  const asks = sim.book.depth("sell", 12).reverse();
  const bids = sim.book.depth("buy", 12);
  const max = Math.max(1, ...asks.map((level) => level.lots), ...bids.map((level) => level.lots));
  const row = (level, side, total) => {
    const div = document.createElement("div");
    div.className = `book-row ${side}`;
    div.style.setProperty("--bar", `${level.lots / max * 100}%`);
    div.innerHTML = `<span>${price(level.price)}</span><span>${fmt(level.lots / 100, 2)}</span><span>${fmt(total / 100, 1)}</span>`;
    return div;
  };
  let total = asks.reduce((sum, level) => sum + level.lots, 0);
  $("book-asks").replaceChildren(...asks.map((level) => { const div = row(level, "ask", total); total -= level.lots; return div; }));
  total = 0;
  $("book-bids").replaceChildren(...bids.map((level) => { total += level.lots; return row(level, "bid", total); }));
  $("book-last").textContent = price(sim.last);
  $("book-depth-label").textContent = `±1% ${btc(sim.book.depthWithin("buy", mid, 0.01))} / ${btc(sim.book.depthWithin("sell", mid, 0.01))}`;
  const rows = [];
  for (let i = sim.tape.length - 1; i >= 0 && rows.length < 18; i--) {
    const trade = sim.tape[i];
    if (trade.lots < 100 && trade.tag === "npc") continue;
    const div = document.createElement("div");
    const own = trade.tag === "player" || trade.tag === "player-maker";
    div.className = `tape-row ${trade.side}${own ? " own" : ""}${trade.tag === "liquidation" ? " forced" : ""}${trade.tag === "stop" ? " stop" : ""}`;
    const mark = own ? "◆ " : trade.tag === "liquidation" ? "⚡ " : trade.tag === "stop" ? "▼ " : "";
    div.innerHTML = `<span>${gameClock(trade.time)}:${String(((trade.time % 60) + 60) % 60).padStart(2, "0")}</span><span>${mark}${price(trade.price)}</span><span>${fmt(trade.lots / 100, 2)}</span>`;
    rows.push(div);
  }
  $("tape-rows").replaceChildren(...rows);
}

function renderFuel() {
  const last = sim.last;
  let long = 0;
  let short = 0;
  let longPeak = null;
  let shortPeak = null;
  for (const row of sim.estimate.levels(25000)) {
    if (row.long && row.price <= last && row.price >= last * 0.97) {
      long += row.long;
      if (!longPeak || row.long > longPeak.lots) longPeak = { price: row.price, lots: row.long };
    }
    if (row.short && row.price >= last && row.price <= last * 1.03) {
      short += row.short;
      if (!shortPeak || row.short > shortPeak.lots) shortPeak = { price: row.price, lots: row.short };
    }
  }
  const max = Math.max(long, short, 50000);
  $("fuel-long").textContent = btc(long);
  $("fuel-short").textContent = btc(short);
  $("fuel-long-bar").style.width = `${long / max * 100}%`;
  $("fuel-short-bar").style.width = `${short / max * 100}%`;
  $("fuel-long-peak").textContent = longPeak ? `最亮 ${price(longPeak.price)} · ${btc(longPeak.lots)}` : "—";
  $("fuel-short-peak").textContent = shortPeak ? `最亮 ${price(shortPeak.price)} · ${btc(shortPeak.lots)}` : "—";
  $("open-interest").textContent = btc(sim.oi);
  const past = sim.allCandles().findLast((candle) => candle.time <= sim.time - 300);
  const change = past ? sim.oi - past.oi : 0;
  $("oi-change").textContent = signedBtc(change);
  $("oi-change").className = change > 0 ? "positive" : change < 0 ? "negative" : "";
}

function renderReveal() {
  if (!view.reveal) return;
  const reveal = sim.reveal();
  $("reveal-regime").textContent = REGIMES[reveal.regime.key] ?? reveal.regime.key;
  $("reveal-value").textContent = `${price(reveal.fairValue)}（現價 ${pct(sim.last / reveal.fairValue - 1)}）`;
  const phases = { omen: "徵兆中", main: "爆發中", after: "餘波" };
  $("reveal-event").textContent = reveal.event ? `${reveal.event.name}（${phases[reveal.event.phase]}）` : "無";
  $("reveal-event-text").hidden = !reveal.event;
  $("reveal-event-text").textContent = reveal.event?.text ?? "";
  $("reveal-mood").style.left = `${(reveal.sentiment + 1) * 50}%`;
  $("reveal-mood-text").textContent = reveal.sentiment >= 0 ? `偏多 ${fmt(reveal.sentiment, 2)}` : `偏空 ${fmt(reveal.sentiment, 2)}`;
  $("pool-rows").replaceChildren(...reveal.pools.map((pool) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${pool.name}</td><td>${fmt(pool.activity, 1)}</td><td>${fmt(pool.long / 100)}</td><td>${fmt(pool.short / 100)}</td><td>${fmt(pool.pending / 100)}</td>`;
    return tr;
  }));
}

function renderOrders() {
  const items = [];
  const add = (text, id) => {
    const row = document.createElement("div");
    row.className = "player-order";
    const span = document.createElement("span");
    span.textContent = text;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "撤單";
    button.addEventListener("click", () => { act("cancel", { id }); render(); });
    row.append(span, button);
    items.push(row);
  };
  for (const order of player.queue) add(`⏳ 待送出：${describeOrder(order)}`, order.id);
  for (const order of player.orders()) add(`限價${order.side === "buy" ? "買" : "賣"} ${btc(order.lots)} @ ${price(order.price)}${player.reduceOnly.has(order.id) ? " · 只減倉" : ""}`, order.id);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "目前沒有委託";
    items.push(empty);
  }
  $("player-orders").replaceChildren(...items);
}

function renderPreview() {
  const lots = sizeLots();
  if (!lots) {
    $("order-preview").textContent = "—";
    return;
  }
  if (orderType === "market") {
    const buy = sim.book.preview("buy", lots, sim.book.maxPrice, "player");
    const sell = sim.book.preview("sell", lots, 1, "player");
    const reach = (result) => result.worstPrice ? `${price(result.worstPrice)}（${pct(result.worstPrice / sim.last - 1)}）` : "簿面不足";
    $("order-preview").textContent = `${running ? "依可見掛單" : "依暫停時的簿面估計"}：買推到 ${reach(buy)} · 賣推到 ${reach(sell)}`;
  } else {
    const cents = priceCents();
    $("order-preview").textContent = cents ? `${price(cents)}（距現價 ${pct(cents / sim.last - 1)}）` : "點圖表填入價格";
  }
}

function render() {
  if (!sim) return;
  const mark = sim.markPrice();
  const mid = mark;
  const equity = player.equity(mark);
  const account = player.account;
  $("turn-title").textContent = ranked ? "排名賽回合" : "回合";
  $("turn-label").textContent = ranked ? `${Math.min(session.turn, RANKED_TURNS)} / ${RANKED_TURNS}` : `第 ${session.turn} 回合`;
  $("clock-label").textContent = `${gameClock(sim.time)} · 剩 ${mmss(Math.max(0, session.secondsLeft))}`;
  $("turn-fill").style.width = `${(1 - session.secondsLeft / session.turnSeconds) * 100}%`;
  $("hud-pnl").textContent = money(equity);
  $("hud-pnl").className = equity > 0 ? "positive" : equity < 0 ? "negative" : "";
  $("hud-pnl-detail").textContent = `已實現 ${money(account.realized)} · 手續費 ${plain(player.fees)}`;
  $("ignited-total").textContent = btc(player.stats.ignited);
  $("liq-count").textContent = `被強平 ${player.stats.liquidations} 次`;
  const fresh = session.secondsLeft === session.turnSeconds;
  $("run-button").innerHTML = running ? "⏸ 暫停 <kbd>Space</kbd>" : `▶ ${fresh ? "執行回合" : "繼續回合"} <kbd>Space</kbd>`;
  $("run-status").innerHTML = `<i></i> ${running ? "執行中" : view.reveal ? "揭曉中（暫停）" : "計畫中"}`;
  $("run-status").className = running ? "running" : "planning";
  $("speed").value = String(speed);
  $("sound-toggle").textContent = soundEnabled ? "♫ 開" : "♫ 關";

  $("last-price").textContent = fmt(sim.last / 100, 0);
  const change = sim.last / openPrice - 1;
  $("price-change").textContent = `${pct(change)} 自開盤`;
  $("price-change").className = change >= 0 ? "positive" : "negative";
  $("mark-price").textContent = price(mark);
  const bid = sim.book.bestBid();
  const ask = sim.book.bestAsk();
  $("spread").textContent = bid && ask ? `$${fmt((ask - bid) / 100)}` : "—";
  $("depth").textContent = `${fmt(sim.book.depthWithin("buy", mid, 0.01) / 100)} / ${fmt(sim.book.depthWithin("sell", mid, 0.01) / 100)}`;
  $("cvd-value").textContent = signedBtc(sim.cvd);

  renderFuel();
  renderReveal();
  const feed = sim.liquidationFeed.filter((item) => !item.warm).slice(-8).reverse();
  if (feed.length) {
    $("liq-feed").replaceChildren(...feed.map((item) => {
      const row = document.createElement("div");
      row.className = `liq-row ${item.side}${item.by === "player" ? " ignited" : ""}`;
      row.innerHTML = `<span>${gameClock(item.time)}</span><strong>${item.side === "long" ? "多單" : "空單"} ${btc(item.lots)}</strong><em>×${item.chain}</em>${item.by === "player" ? "<b>你引爆的</b>" : ""}`;
      return row;
    }));
  }
  $("alert-log").replaceChildren(...session.log.slice(0, 12).map((alert) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${gameClock(alert.time)}</span>${ALERT_KINDS[alert.kind]}${alert.lots ? ` ${btc(alert.lots)}` : ""}`;
    return li;
  }));

  $("equity").textContent = money(equity);
  $("equity").className = equity > 0 ? "positive" : equity < 0 ? "negative" : "";
  const floating = player.position ? account.position * (mark - account.entry) / 10000 : 0;
  updateDanger(performance.now(), mark);
  updateMoneyMoments(floating);
  $("floating-pnl").textContent = money(floating);
  $("floating-pnl").className = floating > 0 ? "positive" : floating < 0 ? "negative" : "";
  $("realized").textContent = money(account.realized);
  $("fees").textContent = plain(player.fees);
  $("position-margin").textContent = plain(player.margin);
  $("drawdown").textContent = plain(player.stats.maxDrawdown);
  $("position").textContent = player.position ? `${player.position > 0 ? "多" : "空"} ${btc(Math.abs(player.position))}` : "空倉";
  $("position").className = player.position > 0 ? "positive" : player.position < 0 ? "negative" : "";
  $("entry-price").textContent = player.position ? price(account.entry) : "—";
  $("leverage-value").textContent = `${player.leverage}×`;
  const liq = player.liquidationPrice();
  $("player-liq").textContent = liq ? `${price(liq)}（${pct(liq / mark - 1)}）` : "—";
  $("volume").textContent = btc(player.stats.volume);
  const locked = Boolean(player.position) || player.orders().length > 0 || player.queue.length > 0;
  document.querySelectorAll("[data-leverage]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.leverage) === player.leverage);
    button.disabled = locked && Number(button.dataset.leverage) !== player.leverage;
  });
  $("leverage-hint").textContent = locked ? "有部位或委託時鎖定" : "空倉時可調整";
  const { stop, take } = player.protection;
  const share = (value) => (value < 1 ? ` 平 ${Math.round(value * 100)}%` : "");
  $("protection-status").textContent = stop || take ? `止損 ${stop ? price(stop) + share(player.protection.stopFraction) : "—"} · 止盈 ${take ? price(take) + share(player.protection.takeFraction) : "—"}` : "尚未設定";
  renderOrders();
  renderPreview();

  const hud = $("position-hud");
  hud.hidden = !player.position;
  if (player.position) {
    $("position-hud-side").textContent = `${player.position > 0 ? "多" : "空"} ${btc(Math.abs(player.position))} @ ${price(account.entry)}`;
    $("position-hud-pnl").textContent = money(floating);
    $("position-hud-roe").textContent = player.margin ? `保證金報酬 ${pct(floating / player.margin)}` : "";
    hud.classList.toggle("loss", floating < 0);
  }
  if (document.querySelector(".market-details").open) renderBook();
}

/* ---------- Loop ---------- */

function frame(now) {
  const dt = lastFrame == null ? 0 : Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (running && sim) {
    accumulator += dt * TICKS_PER_SECOND * speed;
    const ticks = Math.floor(accumulator);
    if (ticks > 0) {
      accumulator -= ticks;
      handleRun(session.advance(ticks));
    }
  }
  if (sim) {
    view.now = now;
    view.effects = effectsEnabled;
    view.pushes = view.pushes.filter((push) => now - push.born < 1500);
    for (const flash of view.flashes) flash.age = (now - flash.born) / 1600;
    view.flashes = view.flashes.filter((flash) => flash.age < 1);
    checkCascadeEnd(now);
    drawChart($("market-chart"), sim, view);
    if (now - lastRender > 120) {
      lastRender = now;
      render();
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- Input ---------- */

document.querySelectorAll("[data-type]").forEach((button) => button.addEventListener("click", () => setOrderType(button.dataset.type)));
document.querySelectorAll("[data-size]").forEach((button) => button.addEventListener("click", () => {
  $("size-input").value = button.dataset.size;
  document.querySelectorAll("[data-size]").forEach((item) => item.classList.toggle("active", item === button));
  render();
}));
$("size-input").addEventListener("input", () => {
  document.querySelectorAll("[data-size]").forEach((item) => item.classList.toggle("active", item.dataset.size === $("size-input").value));
  render();
});
$("price-input").addEventListener("input", render);
document.querySelectorAll("[data-leverage]").forEach((button) => button.addEventListener("click", () => {
  const error = act("leverage", { leverage: Number(button.dataset.leverage) });
  if (error) return setMessage(error, true);
  store.set("leverage", player.leverage);
  setMessage(`槓桿改為 ${player.leverage}×：部位大小不限，槓桿越高，保證金越少、強平價越近`);
  render();
}));
document.querySelectorAll("[data-layer]").forEach((button) => button.addEventListener("click", () => {
  view.layer = button.dataset.layer;
  document.querySelectorAll("[data-layer]").forEach((item) => item.classList.toggle("active", item === button));
}));
document.querySelectorAll("[data-alert]").forEach((input) => {
  input.checked = alertPrefs[input.dataset.alert] !== false;
  input.addEventListener("change", () => {
    alertPrefs[input.dataset.alert] = input.checked;
    store.set("alerts", alertPrefs);
    if (session) session.alerts = { ...alertPrefs };
  });
});
document.querySelectorAll("[data-ind]").forEach((input) => {
  input.checked = view.ind[input.dataset.ind] !== false;
  input.addEventListener("change", () => {
    view.ind[input.dataset.ind] = input.checked;
    store.set("indicators", view.ind);
    view.frame.low = null;
  });
});
$("effects").checked = effectsEnabled;
$("effects").addEventListener("change", () => {
  effectsEnabled = $("effects").checked;
  store.set("effects", effectsEnabled);
  if (!effectsEnabled) {
    $("fx-layer").replaceChildren();
    $("particle-layer").replaceChildren();
    $("combo-banner").hidden = true;
    $("cascade-meter").hidden = true;
    $("edge-glow").className = "edge-glow";
    $("danger-glow").className = "danger-glow";
    $("storm-text").hidden = true;
  }
});
$("buy-button").addEventListener("click", () => submit("buy"));
$("sell-button").addEventListener("click", () => submit("sell"));
$("close-position").addEventListener("click", () => closeNow());
$("close-range").addEventListener("input", () => {
  $("close-label").textContent = `${$("close-range").value}%`;
  document.querySelectorAll("[data-close]").forEach((button) => button.classList.toggle("active", button.dataset.close === $("close-range").value));
});
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => {
  $("close-range").value = button.dataset.close;
  $("close-range").dispatchEvent(new Event("input"));
}));
$("cancel-all").addEventListener("click", () => {
  const count = act("cancelAll");
  setMessage(count ? `已撤掉 ${count} 筆委託` : "沒有可撤的委託");
  render();
});
$("set-protection").addEventListener("click", () => {
  const read = (id) => {
    const value = Number(String($(id).value).replace(/,/g, ""));
    return $(id).value && Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
  };
  const error = act("protect", { stop: read("stop-price"), take: read("take-price"), stopFraction: Number($("stop-share").value) / 100, takeFraction: Number($("take-share").value) / 100 });
  setMessage(error ?? "止損止盈已設定", Boolean(error));
  render();
});
$("clear-protection").addEventListener("click", () => {
  act("unprotect");
  $("stop-price").value = "";
  $("take-price").value = "";
  render();
});
for (const key of ["stop", "take"]) {
  $(`${key}-share`).addEventListener("input", () => { $(`${key}-share-label`).textContent = `${$(`${key}-share`).value}%`; });
}
$("tour-button").addEventListener("click", () => startTour());
$("ranked-button").addEventListener("click", () => {
  if (ranked && !ranked.over && !confirm("放棄目前這局排名賽，重新開一局？")) return;
  newMarket(randomSeed(), { rankedGame: true });
});
$("board-button").addEventListener("click", () => showLeaderboard());
$("ranked-upload").addEventListener("click", () => (ranked?.uploadedId ? showLeaderboard(ranked.uploadedId) : uploadRanked()));
$("ranked-again").addEventListener("click", () => newMarket(randomSeed(), { rankedGame: true }));
$("ranked-sandbox").addEventListener("click", () => newMarket());
$("leaderboard-close").addEventListener("click", () => $("leaderboard").close());
$("run-button").addEventListener("click", () => setRunning(!running));
$("pause-continue").addEventListener("click", () => setRunning(true));
$("reveal-button").addEventListener("click", () => toggleReveal());
$("new-button").addEventListener("click", () => {
  if (ranked && !ranked.over && !confirm("放棄目前這局排名賽，回到沙盤？")) return;
  const typed = Number($("seed-input").value);
  newMarket(Number.isSafeInteger(typed) && typed >= 1 && typed <= 0xffffffff ? typed : randomSeed());
});
$("speed").addEventListener("change", () => {
  speed = Number($("speed").value) || 1;
  store.set("speed", speed);
});
$("sound-toggle").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  store.set("sound", soundEnabled);
  $("sound-toggle").setAttribute("aria-pressed", String(soundEnabled));
  render();
});

const canvas = $("market-chart");
// Price-scale drag, as on TradingView: drag up to stretch the prices, down to squeeze them.
let axisDrag = null;
let dragged = false;
const zoomBy = (factor) => {
  view.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor));
};
// Dragging inside the plot pans: sideways through time, up and down through prices. A press that
// barely moves is still a click that fills the order price.
let panDrag = null;
canvas.addEventListener("mousedown", (event) => {
  if (!sim || event.button !== 0) return;
  dragged = false;
  if (chartOnAxis(canvas, sim, view, event.clientX, event.clientY)) {
    axisDrag = { y: event.clientY, zoom: view.zoom };
    event.preventDefault();
    return;
  }
  const geometry = chartGeometry(canvas, sim, view);
  const localY = event.clientY - geometry.rect.top;
  if (localY > geometry.priceBottom) return;
  panDrag = { x: event.clientX, y: event.clientY, shift: geometry.shift, offset: view.offset, xStep: geometry.xStep, pricePerPixel: geometry.span / (geometry.priceBottom - geometry.priceTop) };
  event.preventDefault();
});
window.addEventListener("mousemove", (event) => {
  if (axisDrag) {
    const dy = event.clientY - axisDrag.y;
    if (Math.abs(dy) > 2) dragged = true;
    view.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, axisDrag.zoom * Math.exp(-dy * 0.008)));
  } else if (panDrag) {
    const dx = event.clientX - panDrag.x;
    const dy = event.clientY - panDrag.y;
    if (!dragged && Math.abs(dx) + Math.abs(dy) <= 4) return;
    dragged = true;
    canvas.style.cursor = "grabbing";
    view.cursorPrice = null;
    view.shift = Math.max(0, Math.round(panDrag.shift + dx / panDrag.xStep));
    view.offset = panDrag.offset + dy * panDrag.pricePerPixel;
  }
});
window.addEventListener("mouseup", () => {
  axisDrag = null;
  panDrag = null;
});
canvas.addEventListener("mousemove", (event) => {
  if (!sim) return;
  const onAxis = chartOnAxis(canvas, sim, view, event.clientX, event.clientY);
  canvas.style.cursor = axisDrag || onAxis ? "ns-resize" : panDrag && dragged ? "grabbing" : "crosshair";
  if (axisDrag || onAxis || (panDrag && dragged)) {
    view.cursorPrice = null;
    return;
  }
  view.frame.hold = true;
  view.cursorPrice = chartPriceAt(canvas, sim, view, event.clientY);
  view.cursorLabel = "點擊填入委託價格";
});
canvas.addEventListener("mouseleave", () => {
  view.frame.hold = false;
  view.cursorPrice = null;
});
// A click fills the order price after a short wait, so a double-click (reset view) does not.
let clickTimer = null;
canvas.addEventListener("click", (event) => {
  if (!sim || dragged || event.detail > 1 || chartOnAxis(canvas, sim, view, event.clientX, event.clientY)) {
    dragged = false;
    return;
  }
  const cents = chartPriceAt(canvas, sim, view, event.clientY);
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => fillPrice(cents), 220);
});
function fillPrice(cents) {
  if (cents == null) return;
  if (orderType === "market") setOrderType("limit");
  $("price-input").value = String(cents / 100);
  $("price-field").classList.add("flash");
  setTimeout(() => $("price-field").classList.remove("flash"), 600);
  setMessage(`價格 ${price(cents)} 已填入限價單，按買入或賣出送出。`);
  render();
}
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  if (event.shiftKey || chartOnAxis(canvas, sim, view, event.clientX, event.clientY)) zoomBy(event.deltaY > 0 ? 0.9 : 1.1);
  else {
    // Finer steps when zoomed in close, so the footprint view is easy to reach.
    const step = view.count <= 40 ? 2 : 10;
    view.count = Math.max(MIN_CANDLES, Math.min(360, view.count + (event.deltaY > 0 ? step : -step)));
  }
  view.frame.low = null;
}, { passive: false });
canvas.addEventListener("dblclick", () => {
  clearTimeout(clickTimer);
  view.zoom = 1;
  view.offset = 0;
  view.shift = 0;
  view.count = 120;
  view.frame.low = null;
});

document.addEventListener("keydown", (event) => {
  if (touring || event.target.closest?.("input, select, textarea") || event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === " ") {
    event.preventDefault();
    setRunning(!running);
  } else if (key === "q") submit("buy");
  else if (key === "e") submit("sell");
  else if (key === "f") closeNow();
  else if (key === "r") toggleReveal();
  else if (/^[1-5]$/.test(key)) document.querySelectorAll("[data-size]")[Number(key) - 1]?.click();
});

if (!LEVERAGES.includes(store.get("leverage", DEFAULT_LEVERAGE))) store.set("leverage", DEFAULT_LEVERAGE);
setOrderType("market");
newMarket();
requestAnimationFrame(frame);

// Development hook: with ?debug in the address, the session and the effect functions are reachable
// from the console, so each effect can be triggered and checked on its own.
if (new URLSearchParams(location.search).has("debug")) {
  window.arenaDebug = {
    get sim() { return sim; },
    get player() { return player; },
    get session() { return session; },
    get ranked() { return ranked; },
    processLiquidations, processEvents, showPause, registerResult, showCash, updateMoneyMoments, render, showRankedFinal,
  };
}
