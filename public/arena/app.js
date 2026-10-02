import { Sandbox } from "./engine/market.js";
import { DEFAULT_LEVERAGE, LEVERAGES, Player } from "./engine/player.js";
import { ALERT_KINDS, Session } from "./engine/session.js";
import { REGIMES } from "./engine/regime.js";
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
const alertPrefs = store.get("alerts", { bigFlow: true, cascade: true, own: true, move: true });
const view = { count: 120, zoom: 1, offset: 0, layer: "liq", averages: true, fills: store.get("fills", true), pushes: [], now: 0, reveal: false, frame: { low: null, high: null, hold: false }, flashes: [], cursorPrice: null, cursorLabel: null };

/* ---------- Market lifecycle ---------- */

function randomSeed() {
  return 1 + Math.floor(Math.random() * 0xfffffffe);
}

function newMarket(seed = randomSeed()) {
  running = false;
  $("loading").hidden = false;
  $("pause-card").hidden = true;
  setTimeout(() => {
    sim = new Sandbox(seed);
    player = new Player(sim);
    player.setLeverage(store.get("leverage", DEFAULT_LEVERAGE));
    session = new Session(sim);
    session.alerts = { ...alertPrefs };
    seenFeedId = sim.liquidationFeed.at(-1)?.id ?? 0;
    openPrice = sim.last;
    turnOpen = snapshot();
    cascadeFx = null;
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
    setMessage("新市場已建立。計畫階段市場暫停：先讀圖、推測人群的停損與強平在哪，再按「執行回合」。");
    render();
  }, 30);
}

function snapshot() {
  return { price: sim.last, cvd: sim.cvd, oi: sim.oi, pnl: player.equity(), feed: sim.liquidationFeed.at(-1)?.id ?? 0, time: sim.time };
}

function setRunning(next) {
  if (!sim) return;
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
    case "trigger": return event.error ? `觸價單觸發但被拒絕：${event.error}` : `觸價單在 ${price(event.price)} 觸發：市價${side} ${btc(event.lots)}`;
    case "stop": return `止損觸發（標記價 ${price(event.price)}），市價平倉`;
    case "take": return `止盈觸發（標記價 ${price(event.price)}），市價平倉`;
    case "twap": return event.error ? `TWAP 停止：${event.error}` : `TWAP 完成：${side} ${btc(event.lots)}，均價 ${event.avgPrice ? price(event.avgPrice) : "—"}`;
    case "liquidation": return `你的${event.side === "long" ? "多單" : "空單"} ${btc(event.lots)} 在 ${price(event.price)} 被強平，賠掉保證金 ${plain(event.lost)}`;
    case "danger": return `你的強平價 ${price(event.price)} 距離標記價不到 1%`;
    default: return "";
  }
}

function processEvents(events) {
  for (const event of events) {
    const point = chartPoint(event.price ?? sim.last);
    if (event.kind === "liquidation") {
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

function showPause(result) {
  const card = $("pause-card");
  const stats = [];
  let title = "";
  let kind = "";
  let detail = "";
  let toneName = "amber";
  if (result.stop === "turn") {
    const before = turnOpen;
    const waves = sim.liquidationFeed.filter((item) => item.id > before.feed && !item.warm);
    kind = "TURN COMPLETE";
    title = `第 ${session.turn - 1} 回合結束`;
    toneName = "mint";
    stats.push(["價格", `${price(before.price)} → ${price(sim.last)}（${pct(sim.last / before.price - 1)}）`]);
    stats.push(["CVD", signedBtc(sim.cvd - before.cvd)]);
    stats.push(["OI", signedBtc(sim.oi - before.oi)]);
    stats.push(["強平", waves.length ? btc(waves.reduce((sum, item) => sum + item.lots, 0)) : "無"]);
    stats.push(["你的損益", money(player.equity() - before.pnl)]);
    detail = "計畫下一回合：價格動了，但 OI 是增加還是減少？CVD 和價格同向嗎？";
    turnOpen = snapshot();
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

function submit(side) {
  if (!sim) return;
  const lots = sizeLots();
  if (!lots) return setMessage("請輸入數量", true);
  const reduceOnly = $("reduce-only").checked;
  let result;
  const before = sim.last;
  // What the visible book says a market order should reach, to tell when hidden size absorbed it.
  const promised = orderType === "market" ? sim.book.preview(side, lots, side === "buy" ? sim.book.maxPrice : 1, "player") : null;
  if (orderType === "market") result = player.submitMarket(side, lots, { reduceOnly });
  else if (orderType === "twap") result = player.addTwap(side, lots, Number($("twap-select").value), 20, { reduceOnly });
  else {
    const cents = priceCents();
    if (!cents) return setMessage("請輸入價格，或直接點圖表填入", true);
    if (orderType === "trigger") result = player.addTrigger(side, cents, lots, { reduceOnly });
    else {
      const display = orderType === "iceberg" ? Math.round(Number($("display-input").value || lots / 1000) * 100) : null;
      if (orderType === "iceberg" && !(display > 0 && display < lots)) return setMessage("冰山顯示量要大於 0 且小於總量", true);
      result = player.submitLimit(side, cents, lots, { reduceOnly, display });
    }
  }
  if (!result.ok) return setMessage(result.error, true);
  const word = side === "buy" ? "買入" : "賣出";
  if (orderType === "market") {
    const move = sim.last / before - 1;
    setMessage(`市價${word} ${btc(result.matched)}，均價 ${price(result.avgPrice ?? before)}，價格 ${pct(move)}${result.unfilled ? `；${btc(result.unfilled)} 超出 10% 保護價未成交` : ""}${result.wave ? `；引爆強平 ${btc(result.wave.lots)}` : ""}`);
    const point = chartPoint(sim.last);
    const reach = result.lastPrice ?? before;
    const promisedMove = promised?.worstPrice ? promised.worstPrice / before - 1 : 0;
    const reachMove = reach / before - 1;
    // Absorbed: the visible book promised a real move and the order stopped well short of it.
    const stalled = result.matched > 0 && Math.abs(promisedMove) >= 0.0015 && Math.abs(reachMove) < Math.abs(promisedMove) * 0.75;
    if (effectsEnabled && result.matched >= 5000) {
      view.pushes.push({ from: before, to: reach, expected: stalled ? promised.worstPrice : null, side, stalled, born: performance.now() });
      view.pushes = view.pushes.slice(-4);
    }
    if (stalled) {
      const wall = chartPoint(reach);
      floatLabel("🛡 撞牆！有人在吸收", wall.x - 40, wall.y + (side === "buy" ? -28 : 28), "amber", true);
      // A dull thud instead of the usual click.
      tone(78, 0.3, "square", 0.07, 48);
      boom(0.35);
      shake(2);
      setMessage(`市價${word} ${btc(result.matched)}：簿上看得到的掛單應該推到 ${price(promised.worstPrice)}（${pct(promisedMove)}），實際只到 ${price(reach)}（${pct(reachMove)}）。看不見的掛單在吸收你的單。`, true);
    } else if (Math.abs(move) >= 0.0015) {
      floatLabel(`推動 ${pct(move)}`, point.x - 40, point.y + (move > 0 ? 26 : -26), move > 0 ? "mint" : "coral", Math.abs(move) >= 0.01);
      ring(point.x, point.y, move > 0 ? "mint" : "coral", Math.min(1, Math.abs(move) * 50));
    }
    if (lots >= 125000) shake(lots >= 500000 ? 2 : 1);
    if (!stalled) tone(side === "buy" ? 680 : 420, 0.1, "triangle", 0.04);
  } else if (orderType === "twap") setMessage(`TWAP ${word} ${btc(lots)}，分 ${Math.min(20, Math.floor(lots / 100) || 1)} 筆在 ${Number($("twap-select").value) / 60} 分鐘內送出`);
  else if (orderType === "trigger") setMessage(`觸價${word} ${btc(lots)} @ ${price(priceCents())}：標記價穿過時送出市價單`);
  else setMessage(`${orderType === "iceberg" ? "冰山" : "限價"}${word} ${btc(lots)} @ ${price(priceCents())}${result.matched ? `，立即成交 ${btc(result.matched)}` : ""}${result.resting ? `，掛單 ${btc(result.resting)}` : ""}`);
  processLiquidations();
  render();
}

function closeNow(fraction = 1) {
  if (!player) return;
  const result = fraction >= 1 ? player.close() : player.closePart(fraction);
  if (!result.ok) return setMessage(result.error, true);
  setMessage(result.pending ? "部分平倉，剩餘部位下一秒繼續出場" : `已平倉 ${btc(result.matched)}，均價 ${price(result.avgPrice ?? sim.last)}`);
  processLiquidations();
  render();
}

function setOrderType(type) {
  orderType = type;
  document.querySelectorAll("[data-type]").forEach((button) => button.classList.toggle("active", button.dataset.type === type));
  $("price-field").hidden = !["limit", "trigger", "iceberg"].includes(type);
  $("display-field").hidden = type !== "iceberg";
  $("twap-field").hidden = type !== "twap";
  render();
}

function toggleReveal(next = !view.reveal) {
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
    button.addEventListener("click", () => { player.cancel(id); render(); });
    row.append(span, button);
    items.push(row);
  };
  for (const order of player.orders()) {
    const hidden = order.iceberg?.hidden ? `（冰山，隱藏 ${btc(order.iceberg.hidden)}）` : "";
    add(`限價${order.side === "buy" ? "買" : "賣"} ${btc(order.lots)} @ ${price(order.price)}${hidden}${player.reduceOnly.has(order.id) ? " · 只減倉" : ""}`, order.id);
  }
  for (const trigger of player.triggers) add(`觸價${trigger.side === "buy" ? "買" : "賣"} ${btc(trigger.lots)} @ ${price(trigger.price)}`, trigger.id);
  for (const twap of player.twaps) add(`TWAP ${twap.side === "buy" ? "買" : "賣"} 剩 ${btc(twap.remaining)}（${twap.left} 筆）`, twap.id);
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
  if (orderType === "market" || orderType === "twap") {
    const buy = sim.book.preview("buy", lots, sim.book.maxPrice, "player");
    const sell = sim.book.preview("sell", lots, 1, "player");
    const reach = (result) => result.worstPrice ? `${price(result.worstPrice)}（${pct(result.worstPrice / sim.last - 1)}）` : "簿面不足";
    $("order-preview").textContent = `依可見掛單：買推到 ${reach(buy)} · 賣推到 ${reach(sell)}`;
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
  $("turn-label").textContent = `第 ${session.turn} 回合`;
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
  $("floating-pnl").innerHTML = `${money(floating)} <span>未實現</span>`;
  $("floating-pnl").className = `floating-pnl ${floating > 0 ? "positive" : floating < 0 ? "negative" : ""}`;
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
  const locked = Boolean(player.position) || player.orders().length > 0 || player.triggers.length > 0 || player.twaps.length > 0;
  document.querySelectorAll("[data-leverage]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.leverage) === player.leverage);
    button.disabled = locked && Number(button.dataset.leverage) !== player.leverage;
  });
  $("leverage-hint").textContent = locked ? "有部位或委託時鎖定" : "空倉時可調整";
  const { stop, take } = player.protection;
  $("protection-status").textContent = stop || take ? `止損 ${stop ? price(stop) : "—"} · 止盈 ${take ? price(take) : "—"}` : "尚未設定";
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
  const error = player.setLeverage(Number(button.dataset.leverage));
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
$("averages").addEventListener("change", () => { view.averages = $("averages").checked; });
$("fills").checked = view.fills;
$("fills").addEventListener("change", () => {
  view.fills = $("fills").checked;
  store.set("fills", view.fills);
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
$("close-position").addEventListener("click", () => closeNow(1));
$("close-half").addEventListener("click", () => closeNow(0.5));
$("cancel-all").addEventListener("click", () => {
  const count = player.cancelAll();
  setMessage(count ? `已撤掉 ${count} 筆委託` : "沒有可撤的委託");
  render();
});
$("set-protection").addEventListener("click", () => {
  const read = (id) => {
    const value = Number(String($(id).value).replace(/,/g, ""));
    return $(id).value && Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
  };
  const error = player.setProtection(read("stop-price"), read("take-price"));
  setMessage(error ?? "止損止盈已設定", Boolean(error));
  render();
});
$("clear-protection").addEventListener("click", () => {
  player.protection = { stop: null, take: null };
  $("stop-price").value = "";
  $("take-price").value = "";
  render();
});
$("run-button").addEventListener("click", () => setRunning(!running));
$("pause-continue").addEventListener("click", () => setRunning(true));
$("reveal-button").addEventListener("click", () => toggleReveal());
$("new-button").addEventListener("click", () => {
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
  if (orderType === "market" || orderType === "twap") setOrderType("limit");
  $("price-input").value = String(cents / 100);
  $("price-field").classList.add("flash");
  setTimeout(() => $("price-field").classList.remove("flash"), 600);
  setMessage(`價格 ${price(cents)} 已填入（${orderType === "trigger" ? "觸價" : orderType === "iceberg" ? "冰山" : "限價"}），按買入或賣出送出。`);
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
  if (event.target.closest?.("input, select, textarea") || event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === " ") {
    event.preventDefault();
    setRunning(!running);
  } else if (key === "q") submit("buy");
  else if (key === "e") submit("sell");
  else if (key === "f") closeNow(1);
  else if (key === "h") closeNow(0.5);
  else if (key === "r") toggleReveal();
  else if (/^[1-5]$/.test(key)) document.querySelectorAll("[data-size]")[Number(key) - 1]?.click();
});

if (!LEVERAGES.includes(store.get("leverage", DEFAULT_LEVERAGE))) store.set("leverage", DEFAULT_LEVERAGE);
setOrderType("market");
newMarket();
requestAnimationFrame(frame);
