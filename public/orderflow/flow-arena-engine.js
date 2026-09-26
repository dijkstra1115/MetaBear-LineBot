import {
  FLOW_MODE_TARGET,
  FlowRandom,
  TakerOnlyMarket,
} from "./taker-only-engine.js";

export const ARENA_VERSION = 4;
export const ARENA_DURATION = 120;
export const ARENA_START_BALANCE = 10000000;
export const ARENA_MAX_DRAWDOWN = 20;
export const ARENA_CONTRACT_BTC = 1;
export const ARENA_INITIAL_PRICE = 10000000; // Cents: 100,000 USDT/BTC.
export const ARENA_CANDLE_SECONDS = 2;
export const ARENA_PREHISTORY = 150;
export const ARENA_MAINTENANCE = 0.004;
export const ARENA_PLAYER_MARGIN = 0.06;
const ARENA_MAX_PRICE = 100000000;
const ARENA_HISTORY = 160;
const CONTRACT_DENOMINATOR = 10000; // Price cents × hundredths of a 1 BTC contract.
const MAKER_FEE = 0.0002;
const TAKER_FEE = 0.0005;
const RETAIL_PER_SECOND = 10;
const RETAIL_QUOTE_RANGE = 0.004;
const MAKER_REFRESH_STEPS = 4;
const FAIR_FOLLOW = 0.06;
const MAKER_LEAN = 0.1;
const VALUE_FOLLOW = 0.01;
const VALUE_BAND = 0.02;
const VALUE_LEAN = 0.25;
const INVENTORY_SKEW = 0.000015;
const TOXIC_LOTS = 4000;
const TOXIC_PAUSE = 0.9;
const RETAIL_OPEN_SHARE = 0.28;
const COHORT_DECAY = 0.012;
const TRAPPED_DECAY = 0.003;
const CASCADE_BAND = 0.01;
const NEWS_BIAS = 0.08;
const MAX_COHORTS = 520;
const round = (value) => Math.round(value * 10000) / 10000;
const notional = (price, lots) => price * lots / CONTRACT_DENOMINATOR;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const HEADLINES = [
  { title: "全球關稅談判升溫", detail: "模擬快訊：賣方追價增加，造市商縮減近價掛單。", side: -1, depth: 0.6, activity: 1.35 },
  { title: "能源供應受阻傳聞", detail: "模擬快訊：避險賣單湧入，近價流動性變薄。", side: -1, depth: 0.5, activity: 1.45 },
  { title: "AI 企業財報超預期", detail: "模擬快訊：追多散戶進場，買方報價偏向上緣。", side: 1, depth: 0.7, activity: 1.35 },
  { title: "聯準會措辭轉鷹", detail: "模擬快訊：主動賣出增加，追空散戶開倉。", side: -1, depth: 0.6, activity: 1.3 },
  { title: "現貨 ETF 資金流入", detail: "模擬快訊：買方追價升溫，槓桿多單增加。", side: 1, depth: 0.7, activity: 1.4 },
  { title: "全球風險偏好回升", detail: "模擬快訊：追多散戶進場，賣盤被逐檔消化。", side: 1, depth: 0.8, activity: 1.3 },
  { title: "流動性枯竭", detail: "造市商撤走近價掛單，只留遠處後備深度。", side: 0, depth: 0.15, activity: 1.3, drought: true },
  { title: "交易所短暫延遲", detail: "模擬快訊：近價報價撤離，成交滑價擴大。", side: 0, depth: 0.25, activity: 1.1, drought: true },
];
// Near levels answer everyday flow; the backstop keeps a price for every exit.
const MAKER_LADDER = [
  { distance: 0.0004, units: 2 },
  { distance: 0.001, units: 3 },
  { distance: 0.0018, units: 3 },
  { distance: 0.0028, units: 4 },
  { distance: 0.004, units: 5 },
  { distance: 0.0056, units: 5 },
  { distance: 0.0076, units: 6 },
  { distance: 0.011, units: 10 },
  { distance: 0.016, units: 14 },
  { distance: 0.023, units: 20 },
  { distance: 0.032, units: 28 },
  { distance: 0.045, units: 40 },
];
const RETAIL_LEVERAGE = [[10, 0.2], [20, 0.25], [25, 0.25], [50, 0.3]];
const CHASER_LEVERAGE = [[20, 0.25], [25, 0.3], [50, 0.45]];
const FADER_LEVERAGE = [[20, 0.35], [25, 0.3], [50, 0.35]];

// Candles follow simulated seconds so maker requotes do not compress the time axis.
class ArenaMarket extends TakerOnlyMarket {
  constructor(seed, lifetimeSeconds, options) {
    super(seed, lifetimeSeconds, FLOW_MODE_TARGET, options);
    this.simTime = 0;
    this.expiryDue = false;
  }

  candle() {
    const bucket = Math.floor(this.simTime / ARENA_CANDLE_SECONDS);
    let candle = this.candles.at(-1);
    if (!candle || candle.bucket !== bucket) {
      candle = { bucket, time: bucket * ARENA_CANDLE_SECONDS, open: this.last, high: this.last, low: this.last, close: this.last, volume: 0, trades: 0, buyVolume: 0, sellVolume: 0, delta: 0, cvd: this.cvd };
      this.candles.push(candle);
      this.heatmap.push(this.heatmap.at(-1) ?? null);
      if (this.candles.length > ARENA_HISTORY) {
        this.candles.shift();
        this.heatmap.shift();
      }
    }
    return candle;
  }

  // Arena retail flow trades near the touch instead of anywhere within ±1%.
  quoteBounds() {
    return {
      min: Math.max(100, Math.ceil(this.last * (1 - RETAIL_QUOTE_RANGE))),
      max: Math.min(this.maxPrice, Math.floor(this.last * (1 + RETAIL_QUOTE_RANGE))),
    };
  }

  // The base engine snapshots depth after every order; the arena captures once per second.
  snapshot() {
    return this.heatmap.at(-1) ?? null;
  }

  captureDepth() {
    this.candle();
    this.heatmap[this.heatmap.length - 1] = { bids: this.depth("buy", 70), asks: this.depth("sell", 70) };
  }

  submit(side, price, lots, options = {}) {
    const arrival = super.submit(side, price, lots, options);
    if (arrival.resting) {
      const order = this.restingOrders.at(-1);
      if (order?.id === arrival.id) order.bornAt = this.simTime;
    }
    return arrival;
  }

  // Only anonymous retail quotes expire; player orders stay until filled or canceled.
  expireOldOrders() {
    if (!this.expiryDue) return;
    this.expiryDue = false;
    const threshold = this.simTime - this.lifetimeSeconds;
    let removed = false;
    for (const order of this.restingOrders) {
      if (!order.lots || order.owner || (order.bornAt ?? this.simTime) > threshold) continue;
      this.expiredOrders++;
      this.expiredLots += order.lots;
      this.removeResting(order, order.lots);
      removed = true;
    }
    if (removed) this.restingOrders = this.restingOrders.filter((order) => order.lots > 0);
  }

  expireRetail() {
    this.expiryDue = true;
    this.expireOldOrders();
  }

  removeOwner(owner) {
    let count = 0;
    for (const order of this.restingOrders) {
      if (order.owner !== owner || !order.lots) continue;
      this.removeResting(order, order.lots);
      count++;
    }
    if (count) this.restingOrders = this.restingOrders.filter((order) => order.lots > 0);
    return count;
  }
}

function rebaseMarket(market, targetPrice) {
  const shift = targetPrice - market.last;
  market.last = targetPrice;
  market.high += shift;
  market.low += shift;
  market.bids = market.bids.map((price) => price + shift);
  market.asks = market.asks.map((price) => price + shift);
  market.bidLots = new Map([...market.bidLots].map(([price, lots]) => [price + shift, lots]));
  market.askLots = new Map([...market.askLots].map(([price, lots]) => [price + shift, lots]));
  for (const order of market.restingOrders) order.price += shift;
  for (const trade of market.tradeLog) trade.price += shift;
  for (const candle of market.candles) {
    candle.open += shift;
    candle.high += shift;
    candle.low += shift;
    candle.close += shift;
  }
  for (const snapshot of market.heatmap) {
    if (!snapshot) continue;
    for (const level of [...snapshot.bids, ...snapshot.asks]) level.price += shift;
  }
  if (market.lastArrival) {
    market.lastArrival.price += shift;
    if (market.lastArrival.executionPrice != null) market.lastArrival.executionPrice += shift;
  }
  return shift;
}

export function cohortLiquidationPrice(side, entry, leverage) {
  return Math.round(side > 0 ? entry * (1 - 1 / leverage + ARENA_MAINTENANCE) : entry * (1 + 1 / leverage - ARENA_MAINTENANCE));
}

export class FlowArenaRun {
  constructor(seed = 1) {
    if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff) throw Error("Invalid seed");
    this.seed = seed;
    this.rng = new FlowRandom((seed ^ 0x82e4c995) >>> 0);
    this.market = new ArenaMarket(seed, this.rng.int(30, 55), { initialPrice: ARENA_INITIAL_PRICE, maxPrice: ARENA_MAX_PRICE });
    this.baseLifetime = this.market.lifetimeSeconds;
    this.duration = ARENA_DURATION;
    this.account = { balance: ARENA_START_BALANCE, position: 0, entry: 0, realized: 0, fees: 0 };
    this.peakEquity = ARENA_START_BALANCE;
    this.maxDrawdown = 0;
    this.peakExposure = 0;
    this.equityPath = [{ time: 0, equity: ARENA_START_BALANCE }];
    this.events = [];
    this.actions = [];
    this.protection = { stop: null, take: null };
    this.exitIntent = null;
    this.finished = false;
    this.liquidated = false;
    this.settlementFallback = false;
    this.result = null;
    this.lastExecution = null;
    this.playerPush = null;
    this.cohorts = [];
    this.nextCohortId = 1;
    this.liquidationFeed = [];
    this.feedId = 0;
    this.priceTrail = [];
    this.flowBuckets = [];
    this.flowNow = 0;
    this.forcedBuckets = [];
    this.forcedNow = 0;
    this.pendingOpen = { buy: { lots: 0, value: 0 }, sell: { lots: 0, value: 0 } };
    this.chase = { long: 0, short: 0 };
    this.stats = { ignitedLots: 0, ignitedValue: 0, liquidatedLong: 0, liquidatedShort: 0, biggestCascade: 0, peakEquity: ARENA_START_BALANCE };
    this.markCache = { key: "", value: 0 };

    this.eventPlan = [];
    for (let start = this.rng.int(10, 16); start < this.duration - 12; start += this.rng.int(24, 34)) {
      const headline = HEADLINES[this.rng.int(0, HEADLINES.length - 1)];
      this.eventPlan.push({ ...headline, start, duration: this.rng.int(8, 13), happened: false });
    }
    this.activeEvent = null;
    this.maker = { inventory: 0, maxInventory: 60000, fair: ARENA_INITIAL_PRICE, value: ARENA_INITIAL_PRICE, posted: 0, fills: 0 };
    const whaleSide = this.rng.next() < 0.5 ? "buy" : "sell";
    const whaleStart = this.rng.int(14, 34);
    this.whale = {
      side: whaleSide,
      start: whaleStart,
      end: whaleStart + this.rng.int(42, 65),
      remaining: this.rng.int(5500, 8500),
      next: whaleStart,
      childOrders: 0,
      filled: 0,
    };

    // A warm-up market builds real history, resting depth and leveraged crowd positions.
    this.warming = true;
    this.time = -ARENA_PREHISTORY;
    this.lastTradeIndex = 0;
    this.retailIndex = 0;
    while (this.time < 0) {
      this.time++;
      this.market.simTime = this.time;
      this.simulateSecond();
    }
    this.rebase(ARENA_INITIAL_PRICE);
    this.seedTrappedCrowds();
    this.actMaker(false);
    this.market.captureDepth();
    this.warming = false;
    this.startPrice = this.market.last;
    this.lastTradeIndex = this.market.tradeLog.length;
    this.announce("新市場形成", "槓桿散戶已經開倉；熱圖上的亮帶是他們的強平位置。", "neutral");
  }

  rebase(target) {
    const shift = rebaseMarket(this.market, target);
    this.maker.fair += shift;
    this.maker.value += shift;
    this.priceTrail = this.priceTrail.map((price) => price + shift);
    for (const cohort of this.cohorts) {
      cohort.entry += shift;
      cohort.liq += shift;
      if (cohort.stop != null) cohort.stop += shift;
      if (cohort.take != null) cohort.take += shift;
    }
    for (const item of this.liquidationFeed) {
      item.from += shift;
      item.to += shift;
    }
    this.markCache.key = "";
  }

  // Crowded positions from earlier sessions leave large liquidation bands on both sides of the open.
  seedTrappedCrowds() {
    const count = this.rng.int(3, 4);
    const first = this.rng.next() < 0.5 ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? -first : first;
      const leverage = this.rng.next() < 0.6 ? 50 : 25;
      const distance = 0.009 + this.rng.next() * (leverage === 50 ? 0.012 : 0.02);
      const liq = Math.round(this.market.last * (1 - side * distance));
      const entry = Math.round(side > 0 ? liq / (1 - 1 / leverage + ARENA_MAINTENANCE) : liq / (1 + 1 / leverage - ARENA_MAINTENANCE));
      this.addCohort(side, entry, this.rng.int(18, 42) * 100, leverage, "trapped");
    }
  }

  announce(title, detail, tone = "neutral") {
    if (this.warming) return;
    this.events.unshift({ time: this.time, title, detail, tone });
    this.events.length = Math.min(this.events.length, 18);
  }

  pick(table) {
    let roll = this.rng.next();
    for (const [value, weight] of table) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return table.at(-1)[0];
  }

  markPrice() {
    // Player quotes never set the mark used for risk checks, stops or crowd liquidations.
    const key = `${this.market.orders}:${this.market.trades}:${this.market.restingLots}`;
    if (this.markCache.key === key) return this.markCache.value;
    let bid = null;
    let ask = null;
    for (const order of this.market.restingOrders) {
      if (order.owner === "player" || order.lots <= 0) continue;
      if (order.side === "buy") bid = Math.max(bid ?? order.price, order.price);
      else ask = Math.min(ask ?? order.price, order.price);
    }
    const value = bid == null || ask == null ? this.market.last : Math.round((bid + ask) / 2);
    this.markCache = { key, value };
    return value;
  }

  equity() {
    const { balance, position, entry } = this.account;
    return round(balance + position * (this.markPrice() - entry) / CONTRACT_DENOMINATOR);
  }

  exposure() {
    return notional(this.markPrice(), Math.abs(this.account.position));
  }

  exposureRatio() {
    return this.exposure() / Math.max(1, this.equity());
  }

  // Price at which equity falls to the risk margin on the player's exposure.
  playerLiquidationPrice() {
    const { balance, position, entry } = this.account;
    if (!position) return null;
    const lots = Math.abs(position);
    const price = position > 0
      ? (lots * entry - balance * CONTRACT_DENOMINATOR) / (lots * (1 - ARENA_PLAYER_MARGIN))
      : (balance * CONTRACT_DENOMINATOR + lots * entry) / (lots * (1 + ARENA_PLAYER_MARGIN));
    return price > 0 ? Math.round(price) : null;
  }

  playerOrders() {
    return this.market.restingOrders.filter((order) => order.owner === "player" && order.lots > 0);
  }

  previewOrder(side, type, lots, limitPrice = null) {
    if (!["buy", "sell"].includes(side) || !["market", "limit"].includes(type) || !Number.isSafeInteger(lots) || lots <= 0) return null;
    const limit = type === "market" ? side === "buy" ? this.market.maxPrice : 100 : limitPrice;
    if (!Number.isSafeInteger(limit) || limit < 100 || limit > this.market.maxPrice) return null;
    const candidates = this.market.restingOrders
      .filter((order) => order.owner !== "player" && order.side !== side && order.lots > 0 && (side === "buy" ? order.price <= limit : order.price >= limit))
      .sort((a, b) => side === "buy" ? a.price - b.price || a.id - b.id : b.price - a.price || a.id - b.id);
    let remaining = lots;
    let value = 0;
    let worst = null;
    for (const order of candidates) {
      if (!remaining) break;
      const fill = Math.min(remaining, order.lots);
      remaining -= fill;
      value += notional(order.price, fill);
      worst = order.price;
    }
    const matched = lots - remaining;
    return {
      matched,
      remaining,
      resting: type === "limit" ? remaining : 0,
      avgPrice: matched ? Math.round(value * CONTRACT_DENOMINATOR / matched) : null,
      worstPrice: worst,
      takerFee: round(value * TAKER_FEE),
    };
  }

  validateOrder(side, lots, price) {
    if (this.finished) return "本局已結束";
    if (!["buy", "sell"].includes(side) || !Number.isSafeInteger(lots) || lots <= 0) return "請輸入有效數量";
    if (!Number.isSafeInteger(price) || price < 100 || price > this.market.maxPrice) return "請輸入有效價格";
    if (this.equity() <= 0) return "帳戶權益不足";
    if (this.exitIntent && this.account.position && side === (this.account.position > 0 ? "buy" : "sell")) return "平倉等待流動性，暫不能加倉";
    return null;
  }

  applyPlayerFill(trade) {
    const taker = trade.takerOwner === "player";
    const side = taker ? trade.aggressorSide : trade.aggressorSide === "buy" ? "sell" : "buy";
    const direction = side === "buy" ? 1 : -1;
    const account = this.account;
    const old = account.position;
    const lots = trade.lots;
    const closing = old && Math.sign(old) !== direction ? Math.min(Math.abs(old), lots) : 0;
    const realized = closing ? Math.sign(old) * (trade.price - account.entry) * closing / CONTRACT_DENOMINATOR : 0;
    const fee = notional(trade.price, lots) * (taker ? TAKER_FEE : MAKER_FEE);
    const next = old + direction * lots;
    if (!old || Math.sign(old) === direction) {
      account.entry = next ? Math.round((Math.abs(old) * account.entry + lots * trade.price) / Math.abs(next)) : 0;
    } else if (!next) account.entry = 0;
    else if (Math.sign(next) !== Math.sign(old)) account.entry = trade.price;
    account.position = next;
    account.balance = round(account.balance + realized - fee);
    account.realized = round(account.realized + realized);
    account.fees = round(account.fees + fee);
    return realized;
  }

  processTrades() {
    const newTrades = this.market.tradeLog.slice(this.lastTradeIndex);
    let realized = 0;
    let playerFilled = false;
    for (const trade of newTrades) {
      const signed = trade.aggressorSide === "buy" ? trade.lots : -trade.lots;
      this.flowNow += signed;
      if (trade.takerOwner === "liquidation" || trade.takerOwner === "stop") this.forcedNow += signed;
      if (trade.makerOwner === "player" || trade.takerOwner === "player") {
        realized += this.applyPlayerFill(trade);
        playerFilled = true;
      }
      if (trade.makerOwner === "whale" || trade.takerOwner === "whale") this.whale.filled += trade.lots;
      if (trade.makerOwner === "maker") {
        this.maker.inventory += trade.aggressorSide === "sell" ? trade.lots : -trade.lots;
        this.maker.fills += trade.lots;
      }
    }
    this.lastTradeIndex = this.market.tradeLog.length;
    if (playerFilled) {
      if (Math.abs(realized) >= 4) {
        this.announce(realized > 0 ? "獲利落袋" : "認賠出場", `${realized > 0 ? "+" : ""}${round(realized).toFixed(2)} USDT`, realized > 0 ? "mint" : "coral");
      }
      this.updateRisk();
    }
    return newTrades;
  }

  updateRisk() {
    const equity = this.equity();
    this.peakEquity = Math.max(this.peakEquity, equity);
    this.stats.peakEquity = Math.max(this.stats.peakEquity, equity);
    this.maxDrawdown = Math.max(this.maxDrawdown, (this.peakEquity - equity) / Math.max(1, this.peakEquity) * 100);
    this.peakExposure = Math.max(this.peakExposure, this.exposureRatio() * 100);
  }

  toxicity() {
    const net = this.flowBuckets.slice(-4).reduce((sum, value) => sum + value, 0) + this.flowNow;
    return clamp(Math.abs(net) / TOXIC_LOTS, 0, 2.5);
  }

  // Forced liquidation and stop flow over the last few seconds.
  forcedPressure() {
    const net = this.forcedBuckets.slice(-4).reduce((sum, value) => sum + value, 0) + this.forcedNow;
    return clamp(Math.abs(net) / TOXIC_LOTS, 0, 2.5);
  }

  submit(side, type, lots, limitPrice = null) {
    const price = type === "market" ? side === "buy" ? this.market.maxPrice : 100 : limitPrice;
    if (!["market", "limit"].includes(type)) return { ok: false, error: "委託類型無效" };
    const error = this.validateOrder(side, lots, price);
    if (error) return { ok: false, error };
    const before = this.market.last;
    const reference = this.markPrice();
    const firstTrade = this.market.tradeLog.length;
    const result = this.market.submit(side, price, lots, { owner: "player", restRemainder: type === "limit" });
    let value = 0;
    for (const trade of this.market.tradeLog.slice(firstTrade)) if (trade.takerOwner === "player") value += trade.price * trade.lots;
    const avgPrice = result.matched ? Math.round(value / result.matched) : null;
    this.processTrades();
    if (result.matched >= 500) this.playerPush = { side, until: this.time + 3 };
    const cascade = result.matched ? this.resolveTriggers() : null;
    this.processTrades();
    this.updateRisk();
    this.actions.push({ time: this.time, kind: "submit", side, type, lots, price: type === "limit" ? price : null });
    const impact = (this.market.last / before - 1) * 100;
    this.lastExecution = result.matched ? {
      id: this.market.orders,
      side,
      lots: result.matched,
      avgPrice,
      reference,
      slippage: round((side === "buy" ? avgPrice / reference - 1 : 1 - avgPrice / reference) * 100),
      impact: round(impact),
      cascade,
    } : null;
    if (result.matched >= 2000) {
      this.announce(Math.abs(impact) >= 0.5 ? "你推動了市場" : "大額成交", `${(result.matched / 100).toFixed(0)} 單位 · 價格 ${impact >= 0 ? "+" : ""}${impact.toFixed(2)}%`, side === "buy" ? "mint" : "coral");
    }
    return { ok: true, ...result, avgPrice, impact: round(impact), cascade };
  }

  close(reason = "manual") {
    if (!this.account.position) return { ok: false, error: "目前沒有持倉" };
    this.cancelAll();
    const side = this.account.position > 0 ? "sell" : "buy";
    const result = this.submit(side, "market", Math.abs(this.account.position));
    if (result.ok && this.account.position) {
      if (!this.exitIntent) this.announce("平倉等待流動性", "後備深度已被吃完，剩餘部位下一秒繼續出場。", "coral");
      this.exitIntent = { reason };
    } else if (result.ok) this.exitIntent = null;
    return { ...result, pending: Boolean(this.exitIntent) };
  }

  cancel(id) {
    const canceled = this.market.cancel(id, "player");
    if (canceled) this.actions.push({ time: this.time, kind: "cancel", id });
    return canceled;
  }

  cancelAll() {
    const count = this.market.removeOwner("player");
    if (count) this.actions.push({ time: this.time, kind: "cancel-all" });
    return count;
  }

  setProtection(stop, take) {
    if (this.exitIntent) return "平倉指令已觸發，正在等待流動性";
    if (!this.account.position) return "先建立部位再設定風險指令";
    const mark = this.markPrice();
    const isLong = this.account.position > 0;
    const stopCents = stop == null ? null : Math.round(stop * 100);
    const takeCents = take == null ? null : Math.round(take * 100);
    if (stopCents != null && (!Number.isFinite(stopCents) || stopCents <= 0 || (isLong ? stopCents >= mark : stopCents <= mark))) return "止損價須在目前價格的不利方向";
    if (takeCents != null && (!Number.isFinite(takeCents) || takeCents <= 0 || (isLong ? takeCents <= mark : takeCents >= mark))) return "止盈價須在目前價格的有利方向";
    this.protection = { stop: stopCents, take: takeCents };
    this.actions.push({ time: this.time, kind: "protection", ...this.protection });
    return null;
  }

  actMaker(newSecond = true) {
    const maker = this.maker;
    const market = this.market;
    const last = market.last;
    if (newSecond) {
      maker.fair += (last - maker.fair) * FAIR_FOLLOW;
      maker.value += (last - maker.value) * VALUE_FOLLOW;
    }
    const toxicity = this.toxicity();
    market.removeOwner("maker");
    const event = this.activeEvent;
    const nearDepth = event ? event.depth : 1;
    const backDepth = event?.drought ? 0.6 : 1;
    // Quotes lean toward a slow fair value, so pushes nobody follows drift back; beyond the
    // session value band the pull grows. While forced liquidation flow is running, makers step
    // back first, so a cascade spike holds for a moment and then fades; a push that ignites
    // nothing starts fading at once.
    const calm = 1 - clamp(this.forcedPressure() / TOXIC_PAUSE, 0, 1);
    const drift = Math.abs(last / maker.value - 1);
    const valueLean = VALUE_LEAN * clamp((drift - VALUE_BAND) / VALUE_BAND, 0, 1);
    const center = last + ((maker.fair - last) * MAKER_LEAN + (maker.value - last) * valueLean) * calm - maker.inventory / 100 * INVENTORY_SKEW * last;
    for (const side of ["buy", "sell"]) {
      const opposing = side === "buy" ? market.bestAsk() : market.bestBid();
      const loaded = side === "buy" ? Math.max(0, maker.inventory) : Math.max(0, -maker.inventory);
      const room = clamp(1 - loaded / maker.maxInventory, 0.15, 1);
      for (const level of MAKER_LADDER) {
        const near = level.distance < 0.01;
        const widen = near ? 1 + toxicity * 0.9 : 1 + toxicity * 0.25;
        const offset = Math.max(100, Math.round(center * level.distance * widen * (0.9 + this.rng.next() * 0.2)));
        let price = Math.round(side === "buy" ? center - offset : center + offset);
        if (opposing != null) price = side === "buy" ? Math.min(price, opposing - 100) : Math.max(price, opposing + 100);
        price = clamp(price, 100, market.maxPrice);
        const factor = (near ? nearDepth / (1 + toxicity * 0.6) : backDepth) * room;
        const lots = Math.round(level.units * 100 * factor * (0.8 + this.rng.next() * 0.4));
        if (lots < 10) continue;
        market.submit(side, price, lots, { owner: "maker" });
        maker.posted++;
      }
    }
  }

  actWhale() {
    const whale = this.whale;
    if (this.time < whale.start || this.time > whale.end || this.time < whale.next || whale.remaining <= 0) return;
    const lots = Math.min(whale.remaining, this.rng.int(450, 1050));
    const aggressive = this.rng.next() < 0.62;
    const reference = whale.side === "buy" ? this.market.bestAsk() : this.market.bestBid();
    const aggressiveOffset = Math.round(this.market.last * this.rng.int(8, 28) / 10000);
    const passiveOffset = Math.round(this.market.last * this.rng.int(8, 38) / 10000);
    const price = aggressive
      ? whale.side === "buy" ? Math.min(this.market.maxPrice, (reference ?? this.market.last) + aggressiveOffset) : Math.max(100, (reference ?? this.market.last) - aggressiveOffset)
      : whale.side === "buy" ? Math.max(100, this.market.last - passiveOffset) : Math.min(this.market.maxPrice, this.market.last + passiveOffset);
    this.market.submit(whale.side, price, lots, { owner: "whale", restRemainder: !aggressive });
    whale.remaining -= lots;
    whale.childOrders++;
    whale.next = this.time + this.rng.int(3, 7);
    if (aggressive && lots >= 700) this.announce("大額委託進場", `${(lots / 100).toFixed(0)} 單位 ${whale.side === "buy" ? "主動買入" : "主動賣出"}，觀察是否持續。`, whale.side === "buy" ? "mint" : "coral");
  }

  actNews() {
    if (this.activeEvent && this.time >= this.activeEvent.start + this.activeEvent.duration) {
      this.activeEvent = null;
      this.market.setLifetime(this.baseLifetime);
      this.announce("快訊影響消退", "造市商補回近價掛單。", "neutral");
    }
    const starting = this.eventPlan.find((event) => event.start === this.time);
    if (starting) {
      this.activeEvent = starting;
      starting.happened = true;
      this.market.setLifetime(Math.max(7, Math.round(this.baseLifetime * (starting.drought ? 0.3 : 0.7))));
      this.announce(starting.title, starting.detail, starting.side > 0 ? "mint" : starting.side < 0 ? "coral" : "amber");
      if (starting.side) this.openCrowd(starting.side, this.rng.int(6, 16) * 100, "news", CHASER_LEVERAGE, null);
    }
    return (this.activeEvent?.side ?? 0) * NEWS_BIAS;
  }

  // Crowd positions enter with real market orders, so FOMO itself becomes order flow.
  openCrowd(side, lots, kind, leverageTable, stop) {
    const firstTrade = this.market.tradeLog.length;
    const bound = side > 0 ? Math.round(this.market.last * 1.02) : Math.round(this.market.last * 0.98);
    const arrival = this.market.submit(side > 0 ? "buy" : "sell", clamp(bound, 100, this.market.maxPrice), lots, { owner: "crowd", restRemainder: false });
    if (!arrival.matched) return null;
    let value = 0;
    for (const trade of this.market.tradeLog.slice(firstTrade)) if (trade.takerOwner === "crowd") value += trade.price * trade.lots;
    const entry = Math.round(value / arrival.matched);
    const leverage = this.pick(leverageTable);
    return this.addCohort(side, entry, arrival.matched, leverage, kind, stop, null);
  }

  addCohort(side, entry, lots, leverage, kind, stop = null, take = null) {
    const liq = cohortLiquidationPrice(side, entry, leverage);
    if (stop != null && (side > 0 ? stop <= liq : stop >= liq)) stop = null;
    if (stop == null && take == null) {
      const twin = this.cohorts.find((cohort) => cohort.side === side && cohort.leverage === leverage && cohort.stop == null && cohort.take == null && Math.abs(cohort.entry - entry) <= entry * 0.0012);
      if (twin) {
        twin.entry = Math.round((twin.entry * twin.lots + entry * lots) / (twin.lots + lots));
        twin.lots += lots;
        twin.liq = cohortLiquidationPrice(side, twin.entry, leverage);
        return twin;
      }
    }
    const cohort = { id: this.nextCohortId++, side, kind, entry, lots, leverage, liq, stop, take, born: this.time };
    this.cohorts.push(cohort);
    if (this.cohorts.length > MAX_COHORTS) {
      let smallest = 0;
      for (let i = 1; i < this.cohorts.length; i++) if (this.cohorts[i].lots < this.cohorts[smallest].lots) smallest = i;
      this.cohorts.splice(smallest, 1);
    }
    return cohort;
  }

  // Part of the random retail flow opens leveraged positions at the traded price.
  collectRetailOpens() {
    const log = this.market.tradeLog;
    for (let i = this.retailIndex; i < log.length; i++) {
      const trade = log[i];
      if (trade.takerOwner != null || this.rng.next() > RETAIL_OPEN_SHARE) continue;
      const pending = this.pendingOpen[trade.aggressorSide];
      pending.lots += trade.lots;
      pending.value += trade.price * trade.lots;
    }
    this.retailIndex = log.length;
    for (const side of ["buy", "sell"]) {
      const pending = this.pendingOpen[side];
      if (pending.lots < 250) continue;
      const direction = side === "buy" ? 1 : -1;
      const entry = Math.round(pending.value / pending.lots);
      const leverage = this.pick(RETAIL_LEVERAGE);
      const style = this.rng.next();
      const stop = style < 0.4 ? Math.round(entry * (1 - direction * (0.004 + this.rng.next() * 0.009))) : null;
      const take = style > 0.7 ? Math.round(entry * (1 + direction * (0.006 + this.rng.next() * 0.014))) : null;
      this.addCohort(direction, entry, pending.lots, leverage, "retail", stop, take);
      this.pendingOpen[side] = { lots: 0, value: 0 };
    }
  }

  // Breakouts pull in late chasers; stretched prices invite faders against the move.
  actCrowd() {
    const trail = this.priceTrail;
    if (trail.length < 24) return;
    const last = this.market.last;
    const window = trail.slice(-30, -2);
    const high = Math.max(...window);
    const low = Math.min(...window);
    const breadth = this.activeEvent?.side ? 1.3 : 1;
    if (last > high * 1.0008 && this.time >= this.chase.long) {
      const stop = Math.round(high * (1 - 0.002 - this.rng.next() * 0.003));
      this.openCrowd(1, Math.round(this.rng.int(3, 9) * 100 * breadth), "chaser", CHASER_LEVERAGE, stop);
      this.chase.long = this.time + this.rng.int(4, 8);
    } else if (last < low * 0.9992 && this.time >= this.chase.short) {
      const stop = Math.round(low * (1 + 0.002 + this.rng.next() * 0.003));
      this.openCrowd(-1, Math.round(this.rng.int(3, 9) * 100 * breadth), "chaser", CHASER_LEVERAGE, stop);
      this.chase.short = this.time + this.rng.int(4, 8);
    }
    const stretch = (last - this.maker.fair) / this.maker.fair;
    if (Math.abs(stretch) > 0.007 && this.rng.next() < 0.3) {
      const side = stretch > 0 ? -1 : 1;
      const stop = Math.round(last * (1 - side * (0.005 + this.rng.next() * 0.006)));
      this.openCrowd(side, this.rng.int(4, 10) * 100, "fader", FADER_LEVERAGE, stop);
    }
  }

  decayCohorts() {
    for (const cohort of this.cohorts) cohort.lots -= Math.ceil(cohort.lots * (cohort.kind === "trapped" ? TRAPPED_DECAY : COHORT_DECAY));
    this.cohorts = this.cohorts.filter((cohort) => cohort.lots >= 10);
  }

  // Liquidations, stops and profit targets become market orders. The market resolves one wave per
  // second, so a chain unfolds over several seconds instead of teleporting the price.
  // Crowd triggers read the last trade so a push through a level fires at once; player risk still uses the mark.
  resolveTriggers(passes = 1) {
    let waves = 0;
    let waveLots = 0;
    let waveValue = 0;
    let firstPrice = null;
    for (let pass = 0; pass < passes; pass++) {
      const mark = this.market.last;
      const groups = new Map();
      for (const cohort of this.cohorts) {
        if (cohort.lots <= 0) continue;
        let kind = null;
        if (cohort.side > 0) kind = mark <= cohort.liq ? "liquidation" : cohort.stop != null && mark <= cohort.stop ? "stop" : cohort.take != null && mark >= cohort.take ? "take" : null;
        else kind = mark >= cohort.liq ? "liquidation" : cohort.stop != null && mark >= cohort.stop ? "stop" : cohort.take != null && mark <= cohort.take ? "take" : null;
        if (!kind) continue;
        const flatSide = cohort.side > 0 ? "sell" : "buy";
        const key = `${flatSide}:${kind}`;
        if (!groups.has(key)) groups.set(key, { side: flatSide, kind, cohorts: [], lots: 0 });
        const group = groups.get(key);
        group.cohorts.push(cohort);
        group.lots += cohort.lots;
      }
      if (!groups.size) break;
      let progressed = false;
      for (const group of [...groups.values()].sort((a, b) => (a.kind === "liquidation" ? 0 : 1) - (b.kind === "liquidation" ? 0 : 1))) {
        const before = this.market.last;
        const reference = before;
        const bound = group.side === "sell" ? Math.max(100, Math.round(reference * (1 - CASCADE_BAND))) : Math.min(this.market.maxPrice, Math.round(reference * (1 + CASCADE_BAND)));
        const firstTrade = this.market.tradeLog.length;
        const arrival = this.market.submit(group.side, bound, group.lots, { owner: group.kind, restRemainder: false });
        if (!arrival.matched) continue;
        progressed = true;
        const ratio = arrival.matched / group.lots;
        for (const cohort of group.cohorts) cohort.lots = ratio >= 1 ? 0 : cohort.lots - Math.round(cohort.lots * ratio);
        if (group.kind !== "liquidation") continue;
        let value = 0;
        for (const trade of this.market.tradeLog.slice(firstTrade)) value += trade.price * trade.lots;
        waves++;
        waveLots += arrival.matched;
        waveValue += value / CONTRACT_DENOMINATOR;
        firstPrice ??= before;
        const side = group.side === "sell" ? "long" : "short";
        const cascade = this.cascade;
        if (cascade && cascade.side === side && this.time - cascade.time <= 1) {
          cascade.chain++;
          cascade.lots += arrival.matched;
          cascade.time = this.time;
        } else this.cascade = { side, chain: 1, lots: arrival.matched, time: this.time };
        const ignited = Boolean(this.playerPush && this.time <= this.playerPush.until && this.playerPush.side === group.side);
        // A chain the player started keeps counting as theirs while it keeps firing.
        if (ignited) this.playerPush.until = Math.max(this.playerPush.until, this.time + 1);
        const item = { id: ++this.feedId, time: this.time, side, lots: arrival.matched, value: round(value / CONTRACT_DENOMINATOR), from: before, to: this.market.last, chain: this.cascade.chain, ignited, warm: this.warming };
        this.liquidationFeed.push(item);
        if (this.liquidationFeed.length > 80) this.liquidationFeed.shift();
        if (!this.warming) {
          if (item.side === "long") this.stats.liquidatedLong += item.lots;
          else this.stats.liquidatedShort += item.lots;
          if (ignited) {
            this.stats.ignitedLots += item.lots;
            this.stats.ignitedValue += item.value;
          }
          this.stats.biggestCascade = Math.max(this.stats.biggestCascade, this.cascade.lots);
        }
      }
      this.cohorts = this.cohorts.filter((cohort) => cohort.lots >= 10);
      if (!progressed) break;
    }
    if (!waves) return null;
    return { chain: this.cascade.chain, lots: waveLots, value: round(waveValue), move: round((this.market.last / firstPrice - 1) * 100) };
  }

  simulateSecond() {
    const bias = this.actNews();
    this.market.expireRetail();
    this.decayCohorts();
    this.actMaker();
    if (!this.warming) this.actWhale();
    const count = Math.round(RETAIL_PER_SECOND * (this.activeEvent?.activity ?? 1));
    for (let i = 0; i < count; i++) {
      if (i && i % MAKER_REFRESH_STEPS === 0) this.actMaker(false);
      this.market.step({ bias });
    }
    this.collectRetailOpens();
    this.priceTrail.push(this.market.last);
    if (this.priceTrail.length > 60) this.priceTrail.shift();
    this.actCrowd();
    this.resolveTriggers();
    this.processTrades();
    this.flowBuckets.push(this.flowNow);
    this.forcedBuckets.push(this.forcedNow);
    this.flowNow = 0;
    this.forcedNow = 0;
    if (this.flowBuckets.length > 8) this.flowBuckets.shift();
    if (this.forcedBuckets.length > 8) this.forcedBuckets.shift();
    this.market.captureDepth();
  }

  checkProtection() {
    if (!this.account.position) {
      this.protection = { stop: null, take: null };
      this.exitIntent = null;
      return;
    }
    if (this.exitIntent) {
      this.close(this.exitIntent.reason);
      return;
    }
    const { stop, take } = this.protection;
    const mark = this.markPrice();
    const long = this.account.position > 0;
    const stopHit = stop != null && (long ? mark <= stop : mark >= stop);
    const takeHit = take != null && (long ? mark >= take : mark <= take);
    if (!stopHit && !takeHit) return;
    this.protection = { stop: null, take: null };
    this.announce(stopHit ? "止損觸發" : "止盈觸發", `標記價 ${((mark) / 100).toFixed(2)}，按委託簿市價平倉。`, stopHit ? "coral" : "mint");
    this.close(stopHit ? "stop" : "take");
  }

  tick() {
    if (this.finished) return [];
    this.time++;
    this.market.simTime = this.time;
    if (this.playerPush && this.time > this.playerPush.until) this.playerPush = null;
    const firstTrade = this.market.tradeLog.length;
    this.simulateSecond();
    this.checkProtection();
    this.updateRisk();
    this.equityPath.push({ time: this.time, equity: this.equity() });
    if (this.account.position && this.equity() <= Math.max(0, this.exposure() * ARENA_PLAYER_MARGIN)) {
      this.liquidated = true;
      this.announce("風險強制平倉", "帳戶權益不足，系統按簿面強制出場。", "coral");
      this.finish();
    } else if (this.time >= this.duration) this.finish();
    return this.market.tradeLog.slice(firstTrade);
  }

  finish() {
    if (this.finished) return this.result;
    this.cancelAll();
    if (this.account.position) {
      const side = this.account.position > 0 ? "sell" : "buy";
      this.market.submit(side, side === "buy" ? this.market.maxPrice : 100, Math.abs(this.account.position), { owner: "player", restRemainder: false });
      this.processTrades();
      if (this.account.position) {
        this.settlementFallback = true;
        const remaining = Math.abs(this.account.position);
        const reference = this.markPrice();
        const penalty = Math.max(1, Math.round(reference * 0.005));
        const price = clamp(reference + (this.account.position < 0 ? penalty : -penalty), 100, this.market.maxPrice);
        const realized = Math.sign(this.account.position) * (price - this.account.entry) * remaining / CONTRACT_DENOMINATOR;
        const fee = notional(price, remaining) * TAKER_FEE;
        this.account.balance = round(this.account.balance + realized - fee);
        this.account.realized = round(this.account.realized + realized);
        this.account.fees = round(this.account.fees + fee);
        this.account.position = 0;
        this.account.entry = 0;
      }
    }
    this.finished = true;
    this.exitIntent = null;
    this.protection = { stop: null, take: null };
    this.updateRisk();
    const roi = (this.account.balance / ARENA_START_BALANCE - 1) * 100;
    const qualified = !this.liquidated && this.account.balance > 0;
    const utilizationFactor = 1 / (1 + Math.max(0, this.peakExposure - 100) / 100);
    const score = qualified ? Math.round(Math.max(0, roi) * Math.max(0, 1 - this.maxDrawdown / ARENA_MAX_DRAWDOWN) * utilizationFactor * 100) : 0;
    this.result = {
      seed: this.seed,
      version: ARENA_VERSION,
      score,
      roi: round(roi),
      pnl: round(this.account.balance - ARENA_START_BALANCE),
      maxDrawdown: round(this.maxDrawdown),
      peakExposure: round(this.peakExposure),
      utilizationFactor: round(utilizationFactor),
      balance: this.account.balance,
      fees: this.account.fees,
      tradeCount: this.market.tradeLog.filter((trade) => trade.makerOwner === "player" || trade.takerOwner === "player").length,
      qualified,
      liquidated: this.liquidated,
      settlementFallback: this.settlementFallback,
      whaleSide: this.whale.side,
      whaleOrders: this.whale.childOrders,
      news: this.eventPlan.filter((event) => event.happened).map((event) => event.title),
      makerInventory: round(this.maker.inventory / 100),
      makerFills: round(this.maker.fills / 100),
      ignitedUnits: round(this.stats.ignitedLots / 100),
      ignitedValue: round(this.stats.ignitedValue),
      liquidatedUnits: round((this.stats.liquidatedLong + this.stats.liquidatedShort) / 100),
      biggestCascadeUnits: round(this.stats.biggestCascade / 100),
      path: this.equityPath.filter(({ time }) => time % 4 === 0).map(({ equity }) => Math.round(equity)),
    };
    if (this.time % 4 === 0) this.result.path[this.result.path.length - 1] = Math.round(this.account.balance);
    else this.result.path.push(Math.round(this.account.balance));
    this.announce("回合結算", qualified ? `最終得分 ${score.toLocaleString("zh-TW")}。` : "風險限制未達標，得分為 0。", qualified ? "mint" : "coral");
    return this.result;
  }

  footprint(windowSeconds = 30, binCents = 10) {
    const rows = new Map();
    const threshold = this.time - windowSeconds;
    for (let i = this.market.tradeLog.length - 1; i >= 0; i--) {
      const trade = this.market.tradeLog[i];
      if (trade.time <= threshold) break;
      const price = Math.round(trade.price / binCents) * binCents;
      const row = rows.get(price) ?? { price, buy: 0, sell: 0 };
      row[trade.aggressorSide] += trade.lots;
      rows.set(price, row);
    }
    return [...rows.values()].sort((a, b) => b.price - a.price);
  }

  // Estimated liquidation map: crowd positions grouped by their liquidation price.
  liquidationLevels(binCents = 10000) {
    const rows = new Map();
    for (const cohort of this.cohorts) {
      const price = Math.round(cohort.liq / binCents) * binCents;
      const row = rows.get(price) ?? { price, long: 0, short: 0 };
      row[cohort.side > 0 ? "long" : "short"] += cohort.lots;
      rows.set(price, row);
    }
    return [...rows.values()].sort((a, b) => b.price - a.price);
  }

  // Liquidation fuel within reach on each side of the mark.
  fuel(range = 0.03, binCents = 25000) {
    const mark = this.markPrice();
    const summary = { long: 0, short: 0, longPeak: null, shortPeak: null, longOpen: 0, shortOpen: 0 };
    for (const cohort of this.cohorts) {
      if (cohort.side > 0) summary.longOpen += cohort.lots;
      else summary.shortOpen += cohort.lots;
    }
    for (const row of this.liquidationLevels(binCents)) {
      if (row.long && row.price <= mark && row.price >= mark * (1 - range)) {
        summary.long += row.long;
        if (!summary.longPeak || row.long > summary.longPeak.lots) summary.longPeak = { price: row.price, lots: row.long };
      }
      if (row.short && row.price >= mark && row.price <= mark * (1 + range)) {
        summary.short += row.short;
        if (!summary.shortPeak || row.short > summary.shortPeak.lots) summary.shortPeak = { price: row.price, lots: row.short };
      }
    }
    return summary;
  }

  openInterest() {
    return this.cohorts.reduce((sum, cohort) => sum + cohort.lots, 0) + Math.abs(this.account.position);
  }
}
