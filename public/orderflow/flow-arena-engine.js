import {
  FLOW_MODE_TARGET,
  FlowRandom,
  TakerOnlyMarket,
} from "./taker-only-engine.js";

export const ARENA_VERSION = 6;
export const ARENA_DURATION = 120;
export const ARENA_START_BALANCE = 500000000;
export const ARENA_MAX_DRAWDOWN = 20;
// One engine unit is 50 BTC so resting depth sits near a major venue's BTC perpetual book.
export const ARENA_CONTRACT_BTC = 50;
export const ARENA_INITIAL_PRICE = 10000000; // Cents: 100,000 USDT/BTC.
export const ARENA_CANDLE_SECONDS = 2;
export const ARENA_PREHISTORY = 150;
export const ARENA_MAINTENANCE = 0.004;
export const ARENA_LEVERAGES = [1, 3, 5, 10, 20];
export const ARENA_DEFAULT_LEVERAGE = 3;
// Risk limits: the larger the possible position, the lower the leverage, as on a real exchange's
// leverage brackets (about $100M at 20×, $250M at 10×, $500M at 5×, $800M at 3×). Lots are
// hundredths of a contract.
export const ARENA_RISK_LIMITS = { 1: Infinity, 3: 16000, 5: 10000, 10: 5000, 20: 2000 };
const ARENA_MAX_PRICE = 100000000;
const ARENA_HISTORY = 160;
const CONTRACT_DENOMINATOR = 10000 / ARENA_CONTRACT_BTC; // Price cents × hundredths of a contract → USDT.
const MAKER_FEE = 0.0002;
const TAKER_FEE = 0.0005;
const RETAIL_PER_SECOND = 10;
const RETAIL_QUOTE_RANGE = 0.004;
const MAKER_REFRESH_STEPS = 4;
const MAKER_REFILL = 0.3;
const MAKER_TOLERANCE = 0.35;
const WHALE_STALE_DISTANCE = 0.012;
const WHALE_STALE_AGE = 25;
const DEFEND_CHANCE = 0.65;
const HUNTER_MAX_LOTS = 4000;
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
// Lots are hundredths of a contract; text shows the BTC they stand for.
export const arenaBtc = (lots) => lots * ARENA_CONTRACT_BTC / 100;
const btcText = (lots) => arenaBtc(lots).toLocaleString("en-US", { maximumFractionDigits: 1 });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function insertPrice(prices, price) {
  let low = 0;
  let high = prices.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (prices[middle] < price) low = middle + 1;
    else high = middle;
  }
  prices.splice(low, 0, price);
}

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
// A very large player position draws the hunter, which pushes 1% against it.
const PREY_LOTS = 8000;
const PREY_PUSH = 0.01;
// Mid-round, trend followers pile in at one leverage over several seconds and form a new band.
const BUILDUP_LEVERAGE = [[25, 0.4], [50, 0.6]];
const BUILDUP_EVERY = [16, 24];

// Candles follow simulated seconds so maker requotes do not compress the time axis.
class ArenaMarket extends TakerOnlyMarket {
  constructor(seed, lifetimeSeconds, options) {
    super(seed, lifetimeSeconds, FLOW_MODE_TARGET, options);
    this.simTime = 0;
    this.expiryDue = false;
    this.orderIndex = new Map();
  }

  order(id) {
    const order = this.orderIndex.get(id);
    if (order && order.lots > 0) return order;
    this.orderIndex.delete(id);
    return null;
  }

  // Iceberg orders show a small display size and refill it from hidden size inside the
  // matching loop, so one sweep keeps hitting the same price until the hidden size is gone.
  removeResting(order, lots) {
    super.removeResting(order, lots);
    const iceberg = order.iceberg;
    if (!iceberg || order.lots > 0 || iceberg.hidden <= 0) return;
    const refill = Math.min(iceberg.display, iceberg.hidden);
    iceberg.hidden -= refill;
    iceberg.refills++;
    const prices = order.side === "buy" ? this.bids : this.asks;
    const levels = order.side === "buy" ? this.bidLots : this.askLots;
    if (!levels.has(order.price)) insertPrice(prices, order.price);
    levels.set(order.price, (levels.get(order.price) ?? 0) + refill);
    order.lots = refill;
    this.restingLots += refill;
  }

  // Canceling an iceberg drops its hidden size too; otherwise the removal would refill it.
  cancel(id, owner) {
    const order = this.order(id);
    if (order?.iceberg && order.owner === owner) order.iceberg.hidden = 0;
    return super.cancel(id, owner);
  }

  cancelIceberg(order) {
    return this.cancel(order.id, order.owner);
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
      if (order?.id === arrival.id) {
        order.bornAt = this.simTime;
        this.orderIndex.set(order.id, order);
      }
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
    if (this.orderIndex.size > 4000) this.orderIndex = new Map(this.restingOrders.map((order) => [order.id, order]));
  }

  removeOwner(owner) {
    let count = 0;
    for (const order of this.restingOrders) {
      if (order.owner !== owner || !order.lots) continue;
      if (order.iceberg) order.iceberg.hidden = 0;
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
    this.account = { balance: ARENA_START_BALANCE, position: 0, entry: 0, realized: 0, fees: 0, margin: 0 };
    this.leverage = ARENA_DEFAULT_LEVERAGE;
    this.forcedExit = false;
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
    this.cascade = null;
    this.buildup = null;
    this.buildups = [];
    this.stats = { ignitedLots: 0, ignitedValue: 0, liquidatedLong: 0, liquidatedShort: 0, biggestCascade: 0, peakEquity: ARENA_START_BALANCE, playerLiquidations: 0, marginLost: 0 };
    this.markCache = { key: "", value: 0 };

    this.eventPlan = [];
    for (let start = this.rng.int(10, 16); start < this.duration - 12; start += this.rng.int(24, 34)) {
      const headline = HEADLINES[this.rng.int(0, HEADLINES.length - 1)];
      this.eventPlan.push({ ...headline, start, duration: this.rng.int(8, 13), happened: false });
    }
    this.activeEvent = null;
    this.maker = { inventory: 0, maxInventory: 60000, fair: ARENA_INITIAL_PRICE, value: ARENA_INITIAL_PRICE, posted: 0, fills: 0, requotes: 0, quotes: new Map() };
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
      orders: [],
      canceled: 0,
    };
    this.defenders = [];
    this.hunter = { position: 0, entry: 0, realized: 0, next: this.rng.int(18, 32), exitAt: null, strike: null, strikes: [] };
    this.episodes = [];
    this.episode = null;

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
    this.seedDefenders();
    this.market.captureDepth();
    this.warming = false;
    this.startPrice = this.market.last;
    this.nextBuildup = this.rng.int(...BUILDUP_EVERY);
    this.lastTradeIndex = this.market.tradeLog.length;
    this.announce("新市場形成", "槓桿散戶已經開倉；熱圖上的亮帶是他們的強平位置。", "neutral");
  }

  rebase(target) {
    const shift = rebaseMarket(this.market, target);
    this.maker.fair += shift;
    this.maker.value += shift;
    for (const quote of this.maker.quotes.values()) quote.price += shift;
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

  // Isolated margin: the position is liquidated when its loss uses up its own margin down to
  // the maintenance requirement. The rest of the wallet is never touched.
  playerLiquidationPrice() {
    const { position, entry, margin } = this.account;
    if (!position) return null;
    const lots = Math.abs(position);
    const price = position > 0
      ? (lots * entry - margin * CONTRACT_DENOMINATOR) / (lots * (1 - ARENA_MAINTENANCE))
      : (lots * entry + margin * CONTRACT_DENOMINATOR) / (lots * (1 + ARENA_MAINTENANCE));
    return price > 0 ? Math.round(price) : null;
  }

  // Leverage can only change while flat with no resting orders, so margin never moves under a position.
  setLeverage(leverage) {
    if (!ARENA_LEVERAGES.includes(leverage)) return "不支援這個槓桿倍數";
    if (this.account.position || this.playerOrders().length) return "空倉且沒有掛單時才能調整槓桿";
    this.leverage = leverage;
    this.actions.push({ time: this.time, kind: "leverage", leverage });
    return null;
  }

  // Lots of an order that would open or add exposure (the rest only reduces the position).
  openingLots(side, lots) {
    const position = this.account.position;
    if (!position || (position > 0) === (side === "buy")) return lots;
    return Math.max(0, lots - Math.abs(position));
  }

  // Margin set aside for resting orders that would open exposure if they filled.
  reservedMargin() {
    const position = this.account.position;
    let same = 0;
    let opposite = 0;
    let oppositeValue = 0;
    for (const order of this.playerOrders()) {
      if (order.reduceOnly) continue;
      const value = order.lots * order.price / CONTRACT_DENOMINATOR;
      if (!position || (position > 0) === (order.side === "buy")) same += value;
      else {
        opposite += order.lots;
        oppositeValue += value;
      }
    }
    const excess = Math.max(0, opposite - Math.abs(position));
    const excessValue = opposite ? oppositeValue * excess / opposite : 0;
    return round((same + excessValue) / this.leverage);
  }

  availableMargin() {
    return round(this.account.balance - this.account.margin - this.reservedMargin());
  }

  // How many more BTC-hundredths could be opened at the given price with the free margin.
  maxOpenLots(price = this.market.last) {
    const free = this.availableMargin();
    if (free <= 0) return 0;
    const byMargin = Math.floor(free * this.leverage * CONTRACT_DENOMINATOR / (price * (1 + TAKER_FEE * this.leverage)) / 10) * 10;
    return Math.max(0, Math.min(byMargin, ARENA_RISK_LIMITS[this.leverage] - Math.abs(this.account.position)));
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

  // The largest position the account could reach if every resting order that opens exposure filled.
  worstExposure(side = null, lots = 0) {
    let buys = side === "buy" ? lots : 0;
    let sells = side === "sell" ? lots : 0;
    for (const order of this.playerOrders()) {
      if (order.reduceOnly) continue;
      if (order.side === "buy") buys += order.lots;
      else sells += order.lots;
    }
    const position = this.account.position;
    return Math.max(position + buys, sells - position);
  }

  validateOrder(side, lots, price, reference = price) {
    if (this.finished) return "本局已結束";
    if (!["buy", "sell"].includes(side) || !Number.isSafeInteger(lots) || lots <= 0) return "請輸入有效數量";
    if (!Number.isSafeInteger(price) || price < 100 || price > this.market.maxPrice) return "請輸入有效價格";
    if (this.exitIntent && this.account.position && side === (this.account.position > 0 ? "buy" : "sell")) return "平倉等待流動性，暫不能加倉";
    const opening = this.openingLots(side, lots);
    const cap = ARENA_RISK_LIMITS[this.leverage];
    if (opening && this.worstExposure(side, lots) > cap) {
      return `風險限額：${this.leverage}× 最多持有 ${btcText(cap)} BTC（含掛單），降低槓桿才能開更大的部位`;
    }
    if (opening) {
      const required = opening * reference / CONTRACT_DENOMINATOR / this.leverage;
      if (required > this.availableMargin() + 0.01) {
        const room = this.maxOpenLots(reference);
        return `可用保證金不足：${this.leverage}× 下最多還能開 ${btcText(room)} BTC`;
      }
    }
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
    const opening = lots - closing;
    if (closing) account.margin = round(account.margin * (1 - closing / Math.abs(old)));
    if (!next) account.margin = 0;
    if (opening) account.margin = round(account.margin + opening * trade.price / CONTRACT_DENOMINATOR / this.leverage);
    account.position = next;
    account.balance = round(account.balance + realized - fee);
    account.realized = round(account.realized + realized);
    account.fees = round(account.fees + fee);
    this.trackEpisode(old, next, direction, lots, trade.price, realized, fee);
    return realized;
  }

  // One episode runs from flat to flat (a flip closes one and opens the next).
  trackEpisode(old, next, direction, lots, price, realized, fee) {
    if (!old && next) this.openEpisode(Math.sign(next));
    const episode = this.episode;
    if (!episode) return;
    const closing = old && Math.sign(old) !== direction ? Math.min(Math.abs(old), lots) : 0;
    const opening = lots - closing;
    episode.fees += fee;
    episode.realized += realized;
    if (closing) {
      episode.exitLots += closing;
      episode.exitValue += price * closing;
    }
    if (direction === episode.direction && opening) {
      episode.entryLots += opening;
      episode.entryValue += price * opening;
    }
    episode.peakLots = Math.max(episode.peakLots, Math.abs(next));
    if (!next || Math.sign(next) !== episode.direction) {
      this.closeEpisode();
      if (next) {
        this.openEpisode(Math.sign(next));
        this.episode.entryLots = Math.abs(next);
        this.episode.entryValue = price * Math.abs(next);
        this.episode.peakLots = Math.abs(next);
      }
    }
  }

  openEpisode(direction) {
    this.episode = {
      start: this.time, end: null, direction, peakLots: 0, entryLots: 0, entryValue: 0, exitLots: 0, exitValue: 0,
      realized: 0, fees: 0, slippage: 0, absorbed: 0, stalled: 0, pushes: 0,
      ignitedStart: this.stats.ignitedLots, best: this.market.last, bestAt: this.time, hunted: false,
    };
  }

  closeEpisode() {
    const episode = this.episode;
    if (!episode) return;
    episode.end = this.time;
    episode.avgEntry = episode.entryLots ? Math.round(episode.entryValue / episode.entryLots) : null;
    episode.avgExit = episode.exitLots ? Math.round(episode.exitValue / episode.exitLots) : null;
    episode.pnl = round(episode.realized - episode.fees);
    episode.ignited = this.stats.ignitedLots - episode.ignitedStart;
    if (episode.avgEntry) {
      episode.bestMove = round(episode.direction * (episode.best / episode.avgEntry - 1) * 100);
      episode.exitMove = episode.avgExit ? round(episode.direction * (episode.avgExit / episode.avgEntry - 1) * 100) : 0;
    }
    this.episodes.push(episode);
    this.episode = null;
  }

  trackEpisodeExtreme() {
    const episode = this.episode;
    if (!episode) return;
    const last = this.market.last;
    if (episode.direction > 0 ? last > episode.best : last < episode.best) {
      episode.best = last;
      episode.bestAt = this.time;
    }
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
      if (trade.makerOwner === "hunter" || trade.takerOwner === "hunter") this.applyHunterFill(trade);
      if (trade.makerOwner === "defender") {
        const defender = this.defenders.find((item) => item.price === trade.price);
        if (defender) {
          defender.absorbed += trade.lots;
          if (trade.takerOwner === "player") defender.fromPlayer += trade.lots;
        }
        if (trade.takerOwner === "player" && this.episode) this.episode.absorbed += trade.lots;
      }
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

  submit(side, type, lots, limitPrice = null, options = {}) {
    const price = type === "market" ? side === "buy" ? this.market.maxPrice : 100 : limitPrice;
    if (!["market", "limit"].includes(type)) return { ok: false, error: "委託類型無效" };
    if (options.reduceOnly) {
      const position = this.account.position;
      if (!position || (position > 0) === (side === "buy")) return { ok: false, error: "只減倉：目前沒有可以減少的部位" };
      lots = Math.min(lots, Math.abs(position));
    }
    const estimate = type === "market" ? this.previewOrder(side, "market", lots)?.avgPrice ?? this.market.last : limitPrice;
    const error = this.validateOrder(side, lots, price, estimate);
    if (error) return { ok: false, error };
    const before = this.market.last;
    const reference = this.markPrice();
    const expected = type === "market" ? this.previewOrder(side, "market", lots) : null;
    const firstTrade = this.market.tradeLog.length;
    const result = this.market.submit(side, price, lots, { owner: "player", restRemainder: type === "limit" });
    if (result.resting && options.reduceOnly) {
      const order = this.market.order(result.id);
      if (order) order.reduceOnly = true;
    }
    let value = 0;
    let reachPrice = null;
    for (const trade of this.market.tradeLog.slice(firstTrade)) {
      if (trade.takerOwner !== "player") continue;
      value += trade.price * trade.lots;
      reachPrice = trade.price;
    }
    const avgPrice = result.matched ? Math.round(value / result.matched) : null;
    this.processTrades();
    if (result.matched >= 500) this.playerPush = { side, until: this.time + 3 };
    const cascade = result.matched ? this.resolveTriggers() : null;
    this.processTrades();
    this.updateRisk();
    this.pruneReduceOnly();
    this.actions.push({ time: this.time, kind: "submit", side, type, lots, price: type === "limit" ? price : null, reduceOnly: Boolean(options.reduceOnly), leverage: this.leverage });
    const impact = (this.market.last / before - 1) * 100;
    // A sweep whose own fills stop well short of where the visible book said it would go hit hidden
    // size. Judge it by the player's last fill, not the last trade: stops and take-profits the push
    // triggered can move the last trade back without anything absorbing the order.
    const expectedMove = expected?.worstPrice != null ? (expected.worstPrice / before - 1) * 100 : null;
    const reach = reachPrice != null ? (reachPrice / before - 1) * 100 : null;
    const stalled = expectedMove != null && reach != null && Math.abs(expectedMove) >= 0.2 && Math.abs(reach) < Math.abs(expectedMove) * 0.6;
    const episode = this.episode ?? (this.episodes.at(-1)?.end === this.time ? this.episodes.at(-1) : null);
    if (episode && result.matched) {
      const adverse = side === "buy" ? avgPrice - reference : reference - avgPrice;
      episode.slippage = round(episode.slippage + Math.max(0, adverse) * result.matched / CONTRACT_DENOMINATOR);
      if (type === "market" && result.matched >= 500 && side === (episode.direction > 0 ? "buy" : "sell")) episode.pushes++;
      if (stalled) episode.stalled++;
    }
    this.trackEpisodeExtreme();
    this.lastExecution = result.matched ? {
      id: this.market.orders,
      side,
      lots: result.matched,
      avgPrice,
      reference,
      slippage: round((side === "buy" ? avgPrice / reference - 1 : 1 - avgPrice / reference) * 100),
      impact: round(impact),
      expectedMove: expectedMove == null ? null : round(expectedMove),
      reach: reach == null ? null : round(reach),
      stalled,
      cascade,
    } : null;
    if (result.matched >= 2000) {
      this.announce(Math.abs(impact) >= 0.5 ? "你推動了市場" : "大額成交", `${btcText(result.matched)} BTC · 價格 ${impact >= 0 ? "+" : ""}${impact.toFixed(2)}%`, side === "buy" ? "mint" : "coral");
    }
    return { ok: true, ...result, avgPrice, impact: round(impact), expectedMove: expectedMove == null ? null : round(expectedMove), reach: reach == null ? null : round(reach), stalled, cascade };
  }

  close(reason = "manual") {
    if (!this.account.position) return { ok: false, error: "目前沒有持倉" };
    this.cancelAll();
    const side = this.account.position > 0 ? "sell" : "buy";
    const result = this.submit(side, "market", Math.abs(this.account.position), null, { reduceOnly: true });
    if (result.ok && this.account.position) {
      if (!this.exitIntent) this.announce("平倉等待流動性", "後備深度已被吃完，剩餘部位下一秒繼續出場。", "coral");
      this.exitIntent = { reason };
    } else if (result.ok) this.exitIntent = null;
    return { ...result, pending: Boolean(this.exitIntent) };
  }

  // Market-close a share of the position, rounded to 0.1 BTC; a share that rounds to all closes all.
  closePart(fraction) {
    const position = Math.abs(this.account.position);
    if (!position) return { ok: false, error: "目前沒有持倉" };
    const lots = Math.max(10, Math.round(position * fraction / 10) * 10);
    if (lots >= position) return this.close();
    return this.submit(this.account.position > 0 ? "sell" : "buy", "market", lots, null, { reduceOnly: true });
  }

  // Reduce-only orders never open exposure: drop them when flat or on the position's own side,
  // and trim the newest ones when together they exceed the position.
  pruneReduceOnly() {
    const position = this.account.position;
    let room = Math.abs(position);
    const orders = this.playerOrders().filter((order) => order.reduceOnly).sort((a, b) => a.id - b.id);
    for (const order of orders) {
      const opposite = position && (position > 0) !== (order.side === "buy");
      if (!opposite || room <= 0) { this.market.cancel(order.id, "player"); continue; }
      if (order.lots > room) {
        this.market.cancel(order.id, "player");
        const arrival = this.market.submit(order.side, order.price, room, { owner: "player" });
        const trimmed = this.market.order(arrival.id);
        if (trimmed) trimmed.reduceOnly = true;
        room = 0;
      } else room -= order.lots;
    }
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

  // Quotes rest on the book and keep their queue place. Each refresh tops up what was taken
  // (about a third of the level at a time) and only moves a level that drifted too far from
  // its target or no longer fits the target size.
  actMaker(newSecond = true) {
    const maker = this.maker;
    const market = this.market;
    const last = market.last;
    if (newSecond) {
      maker.fair += (last - maker.fair) * FAIR_FOLLOW;
      maker.value += (last - maker.value) * VALUE_FOLLOW;
    }
    const toxicity = this.toxicity();
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
      const loaded = side === "buy" ? Math.max(0, maker.inventory) : Math.max(0, -maker.inventory);
      const room = clamp(1 - loaded / maker.maxInventory, 0.15, 1);
      const opposing = this.bestNonMaker(side === "buy" ? "sell" : "buy");
      MAKER_LADDER.forEach((level, index) => {
        const key = `${side}:${index}`;
        const quote = maker.quotes.get(key) ?? { ids: [], price: null, jitter: 0.9 + this.rng.next() * 0.2 };
        maker.quotes.set(key, quote);
        const near = level.distance < 0.01;
        const widen = near ? 1 + toxicity * 0.9 : 1 + toxicity * 0.25;
        const offset = Math.max(100, Math.round(center * level.distance * widen * quote.jitter));
        let target = Math.round(side === "buy" ? center - offset : center + offset);
        if (opposing != null) target = side === "buy" ? Math.min(target, opposing - 100) : Math.max(target, opposing + 100);
        target = clamp(target, 100, market.maxPrice);
        const factor = (near ? nearDepth / (1 + toxicity * 0.6) : backDepth) * room;
        const size = Math.round(level.units * 100 * factor);
        const alive = quote.ids.map((id) => market.order(id)).filter(Boolean);
        const resting = alive.reduce((sum, order) => sum + order.lots, 0);
        const tolerance = Math.max(center * 0.0003, center * level.distance * MAKER_TOLERANCE);
        const crossed = opposing != null && quote.price != null && (side === "buy" ? quote.price >= opposing : quote.price <= opposing);
        const keep = alive.length && Math.abs(quote.price - target) <= tolerance && !crossed && resting <= size * 1.6;
        if (keep) {
          quote.ids = alive.map((order) => order.id);
          const refill = Math.min(size - resting, Math.round(size * MAKER_REFILL));
          if (refill >= 10) this.postMakerQuote(quote, side, quote.price, refill);
          return;
        }
        for (const order of alive) market.cancel(order.id, "maker");
        if (alive.length) maker.requotes++;
        quote.ids = [];
        quote.price = target;
        quote.jitter = 0.9 + this.rng.next() * 0.2;
        const fresh = Math.round(size * (0.8 + this.rng.next() * 0.4));
        if (fresh >= 10) this.postMakerQuote(quote, side, target, fresh);
      });
    }
  }

  postMakerQuote(quote, side, price, lots) {
    const arrival = this.market.submit(side, price, lots, { owner: "maker" });
    if (arrival.resting) quote.ids.push(arrival.id);
    this.maker.posted++;
  }

  // Best resting price from anyone but the maker (the player's quotes included).
  bestNonMaker(side) {
    let best = null;
    for (const order of this.market.restingOrders) {
      if (order.owner === "maker" || order.side !== side || order.lots <= 0) continue;
      if (best == null || (side === "buy" ? order.price > best : order.price < best)) best = order.price;
    }
    return best;
  }

  // The whale works passive child orders too, and pulls them when the price leaves them
  // behind; unfilled size goes back into its remaining target.
  actWhale() {
    const whale = this.whale;
    const last = this.market.last;
    const done = this.time > whale.end;
    whale.orders = whale.orders.filter((entry) => {
      const order = this.market.order(entry.id);
      if (!order) return false;
      const stale = Math.abs(order.price / last - 1) > WHALE_STALE_DISTANCE || this.time - entry.born > WHALE_STALE_AGE;
      if (!stale && !done) return true;
      if (!done) whale.remaining += order.lots;
      whale.canceled += order.lots;
      this.market.cancel(order.id, "whale");
      return false;
    });
    if (this.time < whale.start || done || this.time < whale.next || whale.remaining <= 0) return;
    const lots = Math.min(whale.remaining, this.rng.int(450, 1050));
    const aggressive = this.rng.next() < 0.62;
    const reference = whale.side === "buy" ? this.market.bestAsk() : this.market.bestBid();
    const aggressiveOffset = Math.round(last * this.rng.int(8, 28) / 10000);
    const passiveOffset = Math.round(last * this.rng.int(8, 38) / 10000);
    const price = aggressive
      ? whale.side === "buy" ? Math.min(this.market.maxPrice, (reference ?? last) + aggressiveOffset) : Math.max(100, (reference ?? last) - aggressiveOffset)
      : whale.side === "buy" ? Math.max(100, last - passiveOffset) : Math.min(this.market.maxPrice, last + passiveOffset);
    const arrival = this.market.submit(whale.side, price, lots, { owner: "whale", restRemainder: !aggressive });
    if (arrival.resting) whale.orders.push({ id: arrival.id, born: this.time });
    whale.remaining -= lots;
    whale.childOrders++;
    whale.next = this.time + this.rng.int(3, 7);
    if (aggressive && lots >= 700) this.announce("大額委託進場", `${btcText(lots)} BTC ${whale.side === "buy" ? "主動買入" : "主動賣出"}，觀察是否持續。`, whale.side === "buy" ? "mint" : "coral");
  }

  // Some trapped crowds are protected: a large holder hides an iceberg a little before the
  // band. The book only ever shows a few BTC at that price; the footprint shows the rest.
  seedDefenders() {
    for (const cohort of this.cohorts.filter((item) => item.kind === "trapped")) this.defend(cohort);
  }

  // Some big bands get a guard: an iceberg just in front of the liquidation price.
  defend(cohort) {
    const last = this.market.last;
    if (this.rng.next() > DEFEND_CHANCE) return;
    const side = cohort.side < 0 ? "sell" : "buy";
    const gap = 0.002 + this.rng.next() * 0.003;
    const price = Math.round(cohort.side < 0 ? cohort.liq * (1 - gap) : cohort.liq * (1 + gap));
    if (side === "sell" ? price <= last * 1.002 : price >= last * 0.998) return;
    const total = Math.round(cohort.lots * (0.9 + this.rng.next() * 0.9));
    const display = this.rng.int(2, 4) * 100;
    const arrival = this.market.submit(side, price, display, { owner: "defender" });
    const order = this.market.order(arrival.id);
    if (!order) return;
    order.iceberg = { display, hidden: total - display, refills: 0 };
    this.defenders.push({ id: arrival.id, cohortId: cohort.id, side, price, total, band: cohort.liq, bandLots: cohort.lots, absorbed: 0, fromPlayer: 0, broken: false, withdrawn: false });
  }

  // Trend followers pile in with market orders at one leverage, so their entries merge into one
  // band. The flow shows on the tape and the band grows on the heatmap while it builds.
  actBuildup() {
    const buildup = this.buildup;
    if (buildup) {
      const cohort = this.openCrowd(buildup.side, buildup.chunk, "crowd", [[buildup.leverage, 1]], null);
      if (cohort && !buildup.cohorts.includes(cohort)) buildup.cohorts.push(cohort);
      if (--buildup.seconds > 0) return;
      const band = buildup.cohorts.filter((item) => this.cohorts.includes(item)).sort((a, b) => b.lots - a.lots)[0];
      this.buildups.push({ start: buildup.start, side: buildup.side, leverage: buildup.leverage, lots: buildup.chunk * buildup.total, band: band?.liq ?? null });
      this.buildup = null;
      return;
    }
    if (this.time < this.nextBuildup || this.time > this.duration - 25) return;
    this.nextBuildup = this.time + this.rng.int(...BUILDUP_EVERY);
    const trail = this.priceTrail;
    const side = trail.length >= 30 ? (this.market.last >= trail.at(-30) ? 1 : -1) : this.rng.next() < 0.5 ? 1 : -1;
    const seconds = this.rng.int(6, 10);
    this.buildup = { start: this.time, side, leverage: this.pick(BUILDUP_LEVERAGE), seconds, total: seconds, chunk: Math.round(this.rng.int(20, 40) * 100 / seconds / 10) * 10, cohorts: [] };
  }

  // Defenders stay until their iceberg is eaten or the price walks far away from it.
  actDefenders() {
    for (const defender of this.defenders) {
      if (defender.broken || defender.withdrawn) continue;
      const order = this.market.order(defender.id);
      if (!order) {
        defender.broken = true;
        defender.brokenAt = this.time;
        continue;
      }
      const away = defender.side === "sell" ? this.market.last < defender.price * 0.97 : this.market.last > defender.price * 1.03;
      if (away) {
        this.market.cancelIceberg(order);
        defender.withdrawn = true;
      }
    }
  }

  // The hunter reads the same visible book and liquidation map as the player. It pushes
  // into bands it can afford to reach, takes profit within a few seconds, and goes after
  // the player's liquidation price when the player carries heavy exposure near it.
  actHunter() {
    const hunter = this.hunter;
    if (hunter.position) {
      if (this.time >= hunter.exitAt) {
        const side = hunter.position > 0 ? "sell" : "buy";
        this.market.submit(side, side === "buy" ? this.market.maxPrice : 100, Math.abs(hunter.position), { owner: "hunter", restRemainder: false });
        this.processTrades();
        if (!hunter.position && hunter.strike) {
          hunter.strike.pnl = round(hunter.realized - hunter.strike.realizedBefore);
          hunter.strike = null;
        }
      }
      return;
    }
    if (this.time < hunter.next || this.time > this.duration - 6) return;
    const last = this.market.last;
    const targets = [];
    for (const row of this.liquidationLevels(25000)) {
      if (row.short >= 1500 && row.price > last && row.price < last * 1.018) targets.push({ direction: 1, price: row.price, lots: row.short, kind: "band" });
      if (row.long >= 1500 && row.price < last && row.price > last * 0.982) targets.push({ direction: -1, price: row.price, lots: row.long, kind: "band" });
    }
    const liq = this.playerLiquidationPrice();
    const exposure = Math.abs(this.account.position);
    if (liq && exposure >= 3000 && Math.abs(liq / last - 1) < 0.022) {
      targets.push({ direction: liq > last ? 1 : -1, price: liq, lots: exposure * 2, kind: "player" });
    } else if (exposure >= PREY_LOTS) {
      const direction = this.account.position > 0 ? -1 : 1;
      targets.push({ direction, price: Math.round(last * (1 + direction * PREY_PUSH)), lots: exposure, kind: "player" });
    }
    let best = null;
    for (const target of targets) {
      const side = target.direction > 0 ? "buy" : "sell";
      let lots = 500;
      let preview = this.previewOrder(side, "market", lots);
      while (lots < HUNTER_MAX_LOTS && !(preview?.worstPrice != null && (target.direction > 0 ? preview.worstPrice >= target.price : preview.worstPrice <= target.price))) {
        lots += 500;
        preview = this.previewOrder(side, "market", lots);
      }
      if (preview?.worstPrice == null || (target.direction > 0 ? preview.worstPrice < target.price : preview.worstPrice > target.price)) continue;
      const appeal = target.lots / lots;
      if (appeal >= 1.1 && (!best || appeal > best.appeal)) best = { ...target, side, lots, appeal };
    }
    hunter.next = this.time + 4;
    if (!best) return;
    const realizedBefore = hunter.realized;
    const arrival = this.market.submit(best.side, best.side === "buy" ? this.market.maxPrice : 100, best.lots, { owner: "hunter", restRemainder: false });
    this.processTrades();
    if (!arrival.matched) return;
    hunter.strike = { time: this.time, side: best.side, lots: arrival.matched, target: best.kind, targetPrice: best.price, realizedBefore, pnl: null };
    if (best.kind === "player" && this.episode) this.episode.hunted = true;
    hunter.strikes.push(hunter.strike);
    hunter.exitAt = this.time + this.rng.int(2, 4);
    hunter.next = this.time + this.rng.int(16, 26);
    this.announce("大額主動單掃盤", `${btcText(arrival.matched)} BTC ${best.side === "buy" ? "主動買入" : "主動賣出"}，一次吃穿多檔掛單。`, best.side === "buy" ? "mint" : "coral");
  }

  applyHunterFill(trade) {
    const hunter = this.hunter;
    const side = trade.takerOwner === "hunter" ? trade.aggressorSide : trade.aggressorSide === "buy" ? "sell" : "buy";
    const direction = side === "buy" ? 1 : -1;
    const old = hunter.position;
    const closing = old && Math.sign(old) !== direction ? Math.min(Math.abs(old), trade.lots) : 0;
    if (closing) hunter.realized = round(hunter.realized + Math.sign(old) * (trade.price - hunter.entry) * closing / CONTRACT_DENOMINATOR);
    const next = old + direction * trade.lots;
    if (!old || Math.sign(old) === direction) hunter.entry = next ? Math.round((Math.abs(old) * hunter.entry + trade.lots * trade.price) / Math.abs(next)) : 0;
    else if (!next) hunter.entry = 0;
    else if (Math.sign(next) !== Math.sign(old)) hunter.entry = trade.price;
    hunter.position = next;
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
    for (const cohort of this.cohorts) cohort.lots -= Math.ceil(cohort.lots * (cohort.kind === "trapped" || cohort.kind === "crowd" ? TRAPPED_DECAY : COHORT_DECAY));
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
        // A position whose liquidation or stop already fired stays a market order until it is flat,
        // even after the price snaps back across the trigger.
        let kind = cohort.forced ?? null;
        if (!kind && cohort.side > 0) kind = mark <= cohort.liq ? "liquidation" : cohort.stop != null && mark <= cohort.stop ? "stop" : cohort.take != null && mark >= cohort.take ? "take" : null;
        else if (!kind) kind = mark >= cohort.liq ? "liquidation" : cohort.stop != null && mark >= cohort.stop ? "stop" : cohort.take != null && mark <= cohort.take ? "take" : null;
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
        if (group.kind !== "take") for (const cohort of group.cohorts) cohort.forced = group.kind;
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
    if (!this.warming) {
      this.actWhale();
      this.actDefenders();
      this.actHunter();
      this.actBuildup();
    }
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

  // The mark crossing the isolated liquidation price closes the position at market. The loss
  // is capped at the position margin (an insurance fund covers any slippage beyond it).
  checkPlayerLiquidation() {
    const liq = this.playerLiquidationPrice();
    if (!liq) return;
    const mark = this.markPrice();
    const long = this.account.position > 0;
    if (long ? mark > liq : mark < liq) return;
    const margin = this.account.margin;
    const before = this.account.balance;
    const lots = Math.abs(this.account.position);
    this.cancelAll();
    this.protection = { stop: null, take: null };
    this.exitIntent = null;
    const side = long ? "sell" : "buy";
    this.market.submit(side, side === "buy" ? this.market.maxPrice : 100, lots, { owner: "player", restRemainder: false });
    this.processTrades();
    if (this.account.position) {
      const remaining = Math.abs(this.account.position);
      const realized = Math.sign(this.account.position) * (liq - this.account.entry) * remaining / CONTRACT_DENOMINATOR;
      this.account.balance = round(this.account.balance + realized);
      this.account.realized = round(this.account.realized + realized);
      if (this.episode) {
        this.episode.realized += realized;
        this.episode.exitLots += remaining;
        this.episode.exitValue += liq * remaining;
        this.closeEpisode();
      }
      this.account.position = 0;
      this.account.entry = 0;
      this.account.margin = 0;
    }
    const lost = before - this.account.balance;
    if (lost > margin) {
      this.account.balance = round(before - margin);
      this.account.realized = round(this.account.realized + lost - margin);
    }
    const episode = this.episodes.at(-1);
    if (episode) {
      episode.liquidated = true;
      episode.pnl = round(-Math.min(lost, margin));
    }
    this.liquidated = true;
    this.stats.playerLiquidations++;
    this.stats.marginLost = round(this.stats.marginLost + Math.min(lost, margin));
    this.lastLiquidation = { time: this.time, side: long ? "long" : "short", lots, price: liq, lost: round(Math.min(lost, margin)) };
    this.announce("你的倉位被強平", `${btcText(lots)} BTC ${long ? "多單" : "空單"}在 ${(liq / 100).toFixed(2)} 爆倉，賠掉這筆倉位的保證金 ${Math.round(Math.min(lost, margin)).toLocaleString("en-US")} USDT。`, "coral");
    this.updateRisk();
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
    this.trackEpisodeExtreme();
    this.checkProtection();
    this.updateRisk();
    this.checkPlayerLiquidation();
    this.pruneReduceOnly();
    this.equityPath.push({ time: this.time, equity: this.equity() });
    if (this.time >= this.duration) this.finish();
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
        if (this.episode) {
          this.episode.realized += realized;
          this.episode.fees += fee;
          this.episode.exitLots += remaining;
          this.episode.exitValue += price * remaining;
          this.closeEpisode();
        }
        this.account.position = 0;
        this.account.entry = 0;
        this.account.margin = 0;
      }
    }
    this.finished = true;
    this.exitIntent = null;
    this.protection = { stop: null, take: null };
    this.updateRisk();
    const roi = (this.account.balance / ARENA_START_BALANCE - 1) * 100;
    const qualified = this.account.balance > 0;
    const score = qualified ? Math.round(Math.max(0, roi) * Math.max(0, 1 - this.maxDrawdown / ARENA_MAX_DRAWDOWN) * 100) : 0;
    this.result = {
      seed: this.seed,
      version: ARENA_VERSION,
      score,
      roi: round(roi),
      pnl: round(this.account.balance - ARENA_START_BALANCE),
      maxDrawdown: round(this.maxDrawdown),
      peakExposure: round(this.peakExposure),
      leverage: this.leverage,
      playerLiquidations: this.stats.playerLiquidations,
      marginLost: this.stats.marginLost,
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
      episodes: this.episodes.length,
      absorbedUnits: round(this.episodes.reduce((sum, episode) => sum + episode.absorbed, 0) / 100),
      slippageCost: round(this.episodes.reduce((sum, episode) => sum + episode.slippage, 0)),
      path: this.equityPath.filter(({ time }) => time % 4 === 0).map(({ equity }) => Math.round(equity)),
    };
    if (this.time % 4 === 0) this.result.path[this.result.path.length - 1] = Math.round(this.account.balance);
    else this.result.path.push(Math.round(this.account.balance));
    this.announce("回合結算", qualified ? `最終得分 ${score.toLocaleString("zh-TW")}。` : "風險限制未達標，得分為 0。", qualified ? "mint" : "coral");
    return this.result;
  }

  // Post-round review: what each position did, what the hidden actors were, and the
  // costliest mistakes worth fixing next round.
  review() {
    const notes = [];
    for (const episode of this.episodes) {
      const at = `第 ${Math.max(0, episode.start)} 秒的${episode.direction > 0 ? "多單" : "空單"}`;
      const notional = (episode.avgEntry ?? this.market.last) * episode.peakLots / CONTRACT_DENOMINATOR;
      if (episode.absorbed >= 300) {
        notes.push({ kind: "absorbed", cost: arenaBtc(episode.absorbed) * 1000 + Math.max(0, -episode.pnl), text: `${at}：${btcText(episode.absorbed)} BTC 被同一價位的冰山單吃掉。推了價格卻不動、Footprint 在同一價位堆出大量成交時，代表有人在吸收，先停手或出場。` });
      }
      if (episode.slippage >= Math.max(15000 * ARENA_CONTRACT_BTC, Math.abs(episode.pnl) * 0.3)) {
        notes.push({ kind: "slippage", cost: episode.slippage, text: `${at}：滑價成本約 $${Math.round(episode.slippage).toLocaleString("en-US")}。大部位可以分批出場；推穿亮帶後，在亮帶上方預掛限價單讓強平潮吃掉，能省下滑價、讓結果更穩定。` });
      }
      if (episode.bestMove != null && episode.bestMove - episode.exitMove >= 0.8 && episode.bestAt < episode.end) {
        notes.push({ kind: "late", cost: (episode.bestMove - episode.exitMove) / 100 * notional, text: `${at}：最佳時曾有 ${episode.bestMove >= 0 ? "+" : ""}${episode.bestMove.toFixed(2)}%，出場只剩 ${episode.exitMove >= 0 ? "+" : ""}${episode.exitMove.toFixed(2)}%，高點後 ${episode.end - episode.bestAt} 秒才走。連環爆倉停下後造市商就會拉回。` });
      }
      if (!episode.ignited && episode.entryLots >= 2500 && episode.pnl < 0) {
        notes.push({ kind: "empty", cost: -episode.pnl, text: `${at}：推了 ${btcText(episode.entryLots)} BTC 卻沒引爆任何強平。亮帶太遠、太薄，或燃料早被別人引爆了，推價成本只能自己吞。` });
      }
      if (episode.hunted) {
        notes.push({ kind: "hunted", cost: Math.max(0, -episode.pnl) + 5000 * ARENA_CONTRACT_BTC, text: `${at}：獵手盯上了你的強平價。部位越大、強平價越靠近價格，越容易被反向掃盤。` });
      }
    }
    for (const episode of this.episodes.filter((item) => item.liquidated)) {
      notes.push({ kind: "liquidated", cost: Infinity, text: `第 ${Math.max(0, episode.start)} 秒的${episode.direction > 0 ? "多單" : "空單"}被強平，賠掉整筆倉位的保證金。槓桿越高，強平價離進場價越近；你的強平價也是別人眼中的亮帶。` });
    }
    // Costliest note of each kind first, so one habit does not crowd out the others.
    notes.sort((a, b) => b.cost - a.cost);
    const seen = new Set();
    const distinct = notes.filter((note) => !seen.has(note.kind) && seen.add(note.kind));
    const ranked = [...distinct, ...notes.filter((note) => !distinct.includes(note))];
    const defenders = this.defenders.map((defender) => ({
      side: defender.side,
      price: defender.price,
      band: defender.band,
      bandLots: defender.bandLots,
      total: defender.total,
      absorbed: defender.absorbed,
      fromPlayer: defender.fromPlayer,
      status: defender.broken ? "broken" : defender.withdrawn ? "withdrawn" : "holding",
      brokenAt: defender.brokenAt ?? null,
    }));
    const hunterPnl = round(this.hunter.realized);
    return {
      episodes: this.episodes.map((episode) => ({ ...episode })),
      notes: ranked.slice(0, 3),
      defenders,
      hunter: { strikes: this.hunter.strikes.map((strike) => ({ ...strike })), pnl: hunterPnl },
      whale: { side: this.whale.side, filled: this.whale.filled, orders: this.whale.childOrders },
    };
  }

  // Everything needed to discuss a finished round: settings, every player action, positions and the review.
  exportData() {
    return {
      game: "FLOW ARENA",
      version: ARENA_VERSION,
      seed: this.seed,
      duration: this.duration,
      // Order lots are hundredths of a contract; *Units fields count contracts.
      contractBtc: ARENA_CONTRACT_BTC,
      finished: this.finished,
      result: this.result,
      actions: this.actions,
      equityPath: this.equityPath.filter(({ time }) => time % 2 === 0),
      review: this.review(),
    };
  }

  // Public iceberg read: a price that traded far more passive volume than it ever shows,
  // and still has an order resting there. Built only from the tape and the visible book.
  icebergSignals(windowSeconds = 45, minLots = 800) {
    const key = `${this.time}:${this.market.trades}:${this.market.restingLots}:${windowSeconds}:${minLots}`;
    if (this.icebergCache?.key === key) return this.icebergCache.value;
    const value = this.readIcebergs(windowSeconds, minLots);
    this.icebergCache = { key, value };
    return value;
  }

  readIcebergs(windowSeconds, minLots) {
    const traded = new Map();
    const log = this.market.tradeLog;
    for (let i = log.length - 1; i >= 0 && log[i].time > this.time - windowSeconds; i--) {
      const trade = log[i];
      if (trade.makerOwner === "player") continue;
      traded.set(trade.price, (traded.get(trade.price) ?? 0) + trade.lots);
    }
    const signals = [];
    for (const [price, lots] of traded) {
      if (lots < minLots) continue;
      const side = this.market.bidLots.has(price) ? "buy" : this.market.askLots.has(price) ? "sell" : null;
      if (!side) continue;
      const shown = (side === "buy" ? this.market.bidLots : this.market.askLots).get(price);
      if (lots >= shown * 3) signals.push({ price, side, traded: lots, shown });
    }
    return signals.sort((a, b) => b.traded - a.traded);
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
