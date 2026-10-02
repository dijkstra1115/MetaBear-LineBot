// Continuous limit order book with one FIFO queue per price. Prices are integer cents, sizes are
// integer lots (1 lot = 0.01 BTC). Every fill is reported to the trade listener; the book itself keeps
// no positions.
export const LOT_BTC = 0.01;
export const PRICE_TICK = 100; // $1

export class Random {
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
  range(min, max) {
    return min + this.next() * (max - min);
  }
  chance(p) {
    return this.next() < p;
  }
  // Log-normal with the given median; spread is the sigma of the underlying normal.
  lognormal(median, spread) {
    return median * Math.exp(this.normal() * spread);
  }
  normal() {
    const u = Math.max(1e-12, this.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }
  poisson(mean) {
    if (mean <= 0) return 0;
    if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * this.normal()));
    const limit = Math.exp(-mean);
    let k = 0;
    let p = this.next();
    while (p > limit) {
      k++;
      p *= this.next();
    }
    return k;
  }
  pick(table) {
    let total = 0;
    for (const [, weight] of table) total += weight;
    let roll = this.next() * total;
    for (const [value, weight] of table) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return table.at(-1)[0];
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

function removeSorted(values, price) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] < price) low = middle + 1;
    else high = middle;
  }
  if (values[low] === price) values.splice(low, 1);
}

export const roundPrice = (price) => Math.max(PRICE_TICK, Math.round(price / PRICE_TICK) * PRICE_TICK);

// order: { id, side, price, lots, owner, acct, iceberg: { display, hidden } | null, born, meta }
// owner is the self-trade identity (null for anonymous flow); acct is who the fill is booked to.
export class OrderBook {
  constructor({ maxPrice = 1_000_000_000, onTrade = () => {} } = {}) {
    this.maxPrice = maxPrice;
    this.onTrade = onTrade;
    this.levels = new Map(); // price -> { side, lots, queue, head }
    this.bids = []; // ascending
    this.asks = []; // ascending
    this.orders = new Map();
    this.nextId = 1;
    this.last = null;
    this.time = 0;
  }

  bestBid() { return this.bids.at(-1) ?? null; }
  bestAsk() { return this.asks[0] ?? null; }

  level(price) { return this.levels.get(price) ?? null; }

  lotsAt(price) { return this.levels.get(price)?.lots ?? 0; }

  addResting(order) {
    let level = this.levels.get(order.price);
    if (!level) {
      level = { side: order.side, lots: 0, queue: [], head: 0 };
      this.levels.set(order.price, level);
      insertSorted(order.side === "buy" ? this.bids : this.asks, order.price);
    }
    level.queue.push(order);
    level.lots += order.lots;
    this.orders.set(order.id, order);
  }

  dropLevelIfEmpty(price, level) {
    if (level.lots > 0) return;
    this.levels.delete(price);
    removeSorted(level.side === "buy" ? this.bids : this.asks, price);
  }

  // Removes an order's shown lots (and its hidden iceberg size) from the book.
  cancel(id) {
    const order = this.orders.get(id);
    if (!order) return false;
    this.orders.delete(id);
    if (order.iceberg) order.iceberg.hidden = 0;
    const level = this.levels.get(order.price);
    if (level) {
      level.lots -= order.lots;
      this.dropLevelIfEmpty(order.price, level);
    }
    order.lots = 0;
    return true;
  }

  // Shrinks a resting order without losing its queue place.
  reduce(id, lots) {
    const order = this.orders.get(id);
    if (!order) return 0;
    const cut = Math.min(order.lots, lots);
    if (cut >= order.lots && !(order.iceberg?.hidden > 0)) {
      this.cancel(id);
      return cut;
    }
    const level = this.levels.get(order.price);
    order.lots -= cut;
    level.lots -= cut;
    return cut;
  }

  headOf(level) {
    while (level.head < level.queue.length && !(level.queue[level.head].lots > 0 && this.orders.has(level.queue[level.head].id))) level.head++;
    if (level.head > 64 && level.head * 2 > level.queue.length) {
      level.queue = level.queue.slice(level.head);
      level.head = 0;
    }
    return level.queue[level.head] ?? null;
  }

  // limit: worst acceptable price (maxPrice / 1 for a market order). rest: leave the remainder on the book.
  submit(side, limit, lots, { owner = null, acct = null, rest = true, iceberg = null, meta = null } = {}) {
    if ((side !== "buy" && side !== "sell") || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(lots) || lots <= 0) throw Error("Invalid order");
    const id = this.nextId++;
    const opposite = side === "buy" ? this.asks : this.bids;
    let remaining = lots;
    let matched = 0;
    let value = 0;
    let lastPrice = null;
    while (remaining > 0 && opposite.length) {
      const best = side === "buy" ? opposite[0] : opposite.at(-1);
      if (side === "buy" ? best > limit : best < limit) break;
      const level = this.levels.get(best);
      const resting = this.headOf(level);
      if (!resting) {
        level.lots = 0;
        this.dropLevelIfEmpty(best, level);
        continue;
      }
      // Self-trade prevention, expire maker: the incoming order cancels its owner's resting order.
      if (owner != null && resting.owner === owner) {
        this.cancel(resting.id);
        continue;
      }
      const fill = Math.min(remaining, resting.lots);
      remaining -= fill;
      matched += fill;
      value += fill * best;
      lastPrice = best;
      resting.lots -= fill;
      level.lots -= fill;
      this.last = best;
      this.onTrade({ time: this.time, price: best, lots: fill, side, takerAcct: acct, takerMeta: meta, maker: resting });
      if (resting.lots <= 0) {
        const ice = resting.iceberg;
        if (ice && ice.hidden > 0) {
          // A refill joins the back of the queue, as on most venues.
          const refill = Math.min(ice.display, ice.hidden);
          ice.hidden -= refill;
          ice.refills = (ice.refills ?? 0) + 1;
          resting.lots = refill;
          level.lots += refill;
          level.queue.push(resting);
          level.queue[level.head] = { lots: 0, id: -1 };
        } else {
          this.orders.delete(resting.id);
        }
      }
      if (level.lots <= 0) this.dropLevelIfEmpty(best, level);
    }
    let restingLots = 0;
    if (remaining > 0 && rest) {
      const order = { id, side, price: limit, lots: remaining, owner, acct, iceberg: null, born: this.time, meta };
      if (iceberg && iceberg.display > 0 && iceberg.display < remaining) {
        order.iceberg = { display: iceberg.display, hidden: remaining - iceberg.display, refills: 0 };
        order.lots = iceberg.display;
      }
      this.addResting(order);
      restingLots = remaining;
    }
    return { id, matched, value, avgPrice: matched ? Math.round(value / matched) : null, lastPrice, resting: restingLots, unfilled: rest ? 0 : remaining };
  }

  // What a market or limit order would fill against the visible book, skipping one owner's orders.
  preview(side, lots, limit = side === "buy" ? this.maxPrice : 1, skipOwner = null) {
    const prices = side === "buy" ? this.asks : this.bids;
    let remaining = lots;
    let value = 0;
    let worst = null;
    for (let i = 0; i < prices.length && remaining > 0; i++) {
      const price = side === "buy" ? prices[i] : prices[prices.length - 1 - i];
      if (side === "buy" ? price > limit : price < limit) break;
      const level = this.levels.get(price);
      let available = level.lots;
      if (skipOwner != null) for (let j = level.head; j < level.queue.length; j++) if (level.queue[j].owner === skipOwner) available -= Math.max(0, level.queue[j].lots);
      if (available <= 0) continue;
      const fill = Math.min(available, remaining);
      remaining -= fill;
      value += fill * price;
      worst = price;
    }
    const matched = lots - remaining;
    return { matched, remaining, avgPrice: matched ? Math.round(value / matched) : null, worstPrice: worst };
  }

  // Visible depth: [{ price, lots }] from the touch outward.
  depth(side, count = 50) {
    const prices = side === "buy" ? this.bids : this.asks;
    const out = [];
    for (let i = 0; i < prices.length && out.length < count; i++) {
      const price = side === "buy" ? prices[prices.length - 1 - i] : prices[i];
      out.push({ price, lots: this.levels.get(price).lots });
    }
    return out;
  }

  // Shown lots within a fraction of a reference price on one side.
  depthWithin(side, reference, fraction) {
    const prices = side === "buy" ? this.bids : this.asks;
    let total = 0;
    if (side === "buy") {
      const floor = reference * (1 - fraction);
      for (let i = prices.length - 1; i >= 0 && prices[i] >= floor; i--) total += this.levels.get(prices[i]).lots;
    } else {
      const cap = reference * (1 + fraction);
      for (let i = 0; i < prices.length && prices[i] <= cap; i++) total += this.levels.get(prices[i]).lots;
    }
    return total;
  }
}
