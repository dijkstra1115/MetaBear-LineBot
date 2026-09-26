// Both experiments use the same random draws. The target-price experiment
// derives order side from its quote relative to the last trade.
export const FLOW_INITIAL_PRICE = 10000; // Cents
export const FLOW_ORDER_LOTS = 100; // 1 BEAR per incoming order
export const FLOW_ORDERS_PER_SECOND = 10;
export const FLOW_DEFAULT_LIFETIME = 60; // Simulated seconds
export const FLOW_CANDLE_ORDERS = 12;
export const FLOW_HISTORY = 160;
export const FLOW_MODE_LIMIT = "limit";
export const FLOW_MODE_TARGET = "target";
const MAX_PRICE = 1000000;

export class FlowRandom {
  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }
  next() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

function insertSorted(values, price) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] < price) low = middle + 1;
    else high = middle;
  }
  values.splice(low, 0, price);
}

export class TakerOnlyMarket {
  constructor(seed = 1, lifetimeSeconds = FLOW_DEFAULT_LIFETIME, mode = FLOW_MODE_LIMIT, options = {}) {
    this.seed = seed >>> 0 || 1;
    this.rng = new FlowRandom(this.seed);
    this.maxPrice = options.maxPrice ?? MAX_PRICE;
    this.last = options.initialPrice ?? FLOW_INITIAL_PRICE;
    if (!Number.isSafeInteger(this.last) || this.last < 100 || !Number.isSafeInteger(this.maxPrice) || this.maxPrice < this.last) throw Error("Invalid price range");
    this.orders = 0;
    this.matchedOrders = 0;
    this.trades = 0;
    this.executedLots = 0;
    this.restingLots = 0;
    this.expiredOrders = 0;
    this.expiredLots = 0;
    this.restingOrders = [];
    this.nextOrderId = 0;
    this.tradeLog = [];
    this.cvd = 0;
    this.lifetimeSeconds = lifetimeSeconds;
    if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0 || lifetimeSeconds > 3600) throw Error("Invalid lifetime");
    if (mode !== FLOW_MODE_LIMIT && mode !== FLOW_MODE_TARGET) throw Error("Invalid order mode");
    this.mode = mode;
    this.high = this.last;
    this.low = this.last;
    this.bidLots = new Map();
    this.askLots = new Map();
    this.bids = [];
    this.asks = [];
    this.candles = [];
    this.heatmap = [];
    this.lastArrival = null;
  }
  quoteBounds() {
    return {
      min: Math.max(100, Math.ceil(this.last * 0.99)),
      max: Math.min(this.maxPrice, Math.floor(this.last * 1.01)),
    };
  }
  bestBid() { return this.bids.at(-1) ?? null; }
  bestAsk() { return this.asks[0] ?? null; }
  spread() {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    return bid == null || ask == null ? null : ask - bid;
  }
  depth(side, count = 10) {
    const prices = side === "buy" ? this.bids : this.asks;
    const lots = side === "buy" ? this.bidLots : this.askLots;
    const visible = side === "buy" ? prices.slice(-count).reverse() : prices.slice(0, count);
    return visible.map((price) => ({ price, lots: lots.get(price) }));
  }
  snapshot() {
    return {
      bids: this.depth("buy", 100),
      asks: this.depth("sell", 100),
    };
  }
  candle() {
    const bucket = Math.floor((this.orders - 1) / FLOW_CANDLE_ORDERS);
    let candle = this.candles.at(-1);
    if (!candle || candle.bucket !== bucket) {
      candle = { bucket, open: this.last, high: this.last, low: this.last, close: this.last, volume: 0, trades: 0, buyVolume: 0, sellVolume: 0, delta: 0, cvd: this.cvd };
      this.candles.push(candle);
      this.heatmap.push(this.snapshot());
      if (this.candles.length > FLOW_HISTORY) {
        this.candles.shift();
        this.heatmap.shift();
      }
    }
    return candle;
  }
  removeResting(order, lots) {
    const prices = order.side === "buy" ? this.bids : this.asks;
    const levels = order.side === "buy" ? this.bidLots : this.askLots;
    const remainingAtLevel = levels.get(order.price) - lots;
    order.lots -= lots;
    this.restingLots -= lots;
    if (remainingAtLevel) levels.set(order.price, remainingAtLevel);
    else {
      levels.delete(order.price);
      prices.splice(prices.indexOf(order.price), 1);
    }
  }
  expireOldOrders() {
    const threshold = this.orders - Math.round(this.lifetimeSeconds * FLOW_ORDERS_PER_SECOND);
    this.restingOrders = this.restingOrders.filter((order) => {
      if (!order.lots) return false;
      if (order.createdAt > threshold) return true;
      const lots = order.lots;
      this.removeResting(order, lots);
      this.expiredOrders++;
      this.expiredLots += lots;
      return false;
    });
  }
  setLifetime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) throw Error("Invalid lifetime");
    this.lifetimeSeconds = seconds;
    this.expireOldOrders();
    if (this.heatmap.length) this.heatmap[this.heatmap.length - 1] = this.snapshot();
  }
  submit(side, price, lots, options = {}) {
    if (!["buy", "sell"].includes(side) || !Number.isSafeInteger(price) || price < 100 || price > this.maxPrice || !Number.isSafeInteger(lots) || lots <= 0)
      throw Error("Invalid order");
    this.orders++;
    this.expireOldOrders();
    const candle = this.candle();
    const submitted = lots;
    const owner = options.owner ?? null;
    const orderId = ++this.nextOrderId;
    const restRemainder = options.restRemainder !== false;
    const oppositePrices = side === "buy" ? this.asks : this.bids;
    let matched = 0;
    while (lots > 0 && oppositePrices.length) {
      const best = side === "buy" ? oppositePrices[0] : oppositePrices.at(-1);
      if (side === "buy" ? best > price : best < price) break;
      const resting = this.restingOrders.find((order) => order.side !== side && order.price === best && order.lots > 0);
      if (owner && resting.owner === owner) {
        this.removeResting(resting, resting.lots);
        this.restingOrders = this.restingOrders.filter((order) => order.lots > 0);
        continue;
      }
      const fill = Math.min(lots, resting.lots);
      lots -= fill;
      matched += fill;
      this.removeResting(resting, fill);
      this.executedLots += fill;
      this.trades++;
      this.last = best; // Resting order sets the execution price.
      this.high = Math.max(this.high, best);
      this.low = Math.min(this.low, best);
      candle.high = Math.max(candle.high, best);
      candle.low = Math.min(candle.low, best);
      candle.close = best;
      candle.volume += fill;
      candle.trades++;
      if (side === "buy") candle.buyVolume += fill;
      else candle.sellVolume += fill;
      const signed = side === "buy" ? fill : -fill;
      candle.delta += signed;
      this.cvd += signed;
      candle.cvd = this.cvd;
      this.tradeLog.push({ time: this.simTime ?? 0, orderIndex: this.orders, bucket: candle.bucket, price: best, lots: fill, aggressorSide: side, makerOwner: resting.owner, takerOwner: owner });
    }
    if (matched) this.matchedOrders++;
    const unfilled = lots;
    if (lots && restRemainder) {
      const ownPrices = side === "buy" ? this.bids : this.asks;
      const ownLots = side === "buy" ? this.bidLots : this.askLots;
      if (!ownLots.has(price)) insertSorted(ownPrices, price);
      ownLots.set(price, (ownLots.get(price) ?? 0) + lots);
      this.restingLots += lots;
      this.restingOrders.push({ id: orderId, owner, tag: options.tag ?? null, side, price, lots, createdAt: this.orders });
    }
    this.restingOrders = this.restingOrders.filter((order) => order.lots > 0);
    this.heatmap[this.heatmap.length - 1] = this.snapshot();
    this.lastArrival = { id: orderId, owner, side, price, executionPrice: matched ? this.last : null, lots: submitted, matched, resting: restRemainder ? lots : 0, unfilled };
    return this.lastArrival;
  }
  cancel(id, owner) {
    const order = this.restingOrders.find((item) => item.id === id && item.owner === owner);
    if (!order) return false;
    this.removeResting(order, order.lots);
    this.restingOrders = this.restingOrders.filter((item) => item.lots > 0);
    if (this.heatmap.length) this.heatmap[this.heatmap.length - 1] = this.snapshot();
    return true;
  }
  cancelOwner(owner) {
    const ids = this.restingOrders.filter((order) => order.owner === owner).map((order) => order.id);
    for (const id of ids) this.cancel(id, owner);
    return ids.length;
  }
  step(options = {}) {
    const { min, max } = this.quoteBounds();
    const randomSide = this.rng.next() < 0.5 ? "buy" : "sell";
    const drawnPrice = this.rng.int(min, max);
    let price = drawnPrice;
    const bias = Math.max(-1, Math.min(1, options.bias ?? 0));
    if (bias && max > min) {
      const position = (drawnPrice - min) / (max - min);
      const shifted = bias > 0
        ? 1 - (1 - position) ** (1 + bias * 3)
        : position ** (1 - bias * 3);
      price = min + Math.round(shifted * (max - min));
    }
    const side = this.mode === FLOW_MODE_TARGET
      ? price < this.last ? "sell" : price > this.last ? "buy" : randomSide
      : randomSide;
    return this.submit(side, price, FLOW_ORDER_LOTS);
  }
  advance(count) {
    for (let i = 0; i < count; i++) this.step();
  }
}
