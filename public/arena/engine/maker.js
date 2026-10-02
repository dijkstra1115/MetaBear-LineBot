import { PRICE_TICK } from "./book.js";

// Near levels answer everyday flow; the backstop keeps a price for every exit. Sizes in BTC.
export const MAKER_LADDER = [
  [0.00005, 5], [0.00015, 10], [0.0003, 18], [0.0005, 30], [0.0008, 45], [0.0012, 60],
  [0.0018, 80], [0.0026, 105], [0.0036, 130], [0.005, 160], [0.007, 190], [0.0092, 220],
  [0.012, 300], [0.016, 450], [0.022, 650], [0.03, 900], [0.04, 1100], [0.052, 1400],
].map(([distance, btc]) => ({ distance, lots: btc * 100 }));

const REFILL = 0.3;
const TOLERANCE = 0.35;
const INDEX_LEAN = 0.15;
const SKEW_PER_LOT = 0.000000008; // 1,000 BTC of inventory leans quotes about 0.08%.
const MAX_SKEW = 0.0012;
const MAX_INVENTORY = 600000; // 6,000 BTC
const TOXIC_LOTS = 30000; // 300 BTC of one-way taker flow, smoothed

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class MarketMaker {
  constructor(sim) {
    this.sim = sim;
    this.account = sim.addAccount("maker", "maker");
    this.quotes = new Map();
    this.flow = 0;
    this.forced = 0;
    this.depthFactor = 1;
  }

  // Smoothed one-way taker flow; a big sweep pulls near quotes back for a while.
  observe(netFlow, forcedFlow) {
    this.flow = this.flow * 0.95 + netFlow;
    this.forced = this.forced * 0.9 + forcedFlow;
  }

  toxicity() {
    return clamp(Math.abs(this.flow) / TOXIC_LOTS, 0, 2.5);
  }

  act() {
    const sim = this.sim;
    const book = sim.book;
    const last = book.last;
    const toxicity = this.toxicity();
    const calm = 1 - clamp(Math.abs(this.forced) / TOXIC_LOTS, 0, 1);
    const inventory = this.account.position;
    // Quotes lean toward the index the market tracks, and away from the side the inventory is on.
    const skew = clamp(inventory * SKEW_PER_LOT, -MAX_SKEW, MAX_SKEW);
    const center = last + (sim.index.value - last) * INDEX_LEAN * calm - skew * last;
    const regimeWiden = sim.regime?.key === "panic" || sim.regime?.key === "euphoria" ? 1.4 : sim.regime?.key === "wild" ? 1.15 : 1;
    for (const side of ["buy", "sell"]) {
      const loaded = side === "buy" ? Math.max(0, inventory) : Math.max(0, -inventory);
      const room = clamp(1 - loaded / MAX_INVENTORY, 0.15, 1);
      const opposing = side === "buy" ? book.bestAsk() : book.bestBid();
      MAKER_LADDER.forEach((level, index) => {
        const key = `${side}:${index}`;
        let quote = this.quotes.get(key);
        if (!quote) {
          quote = { ids: [], price: null, jitter: 0.9 + sim.rng.next() * 0.2 };
          this.quotes.set(key, quote);
        }
        const near = level.distance < 0.01;
        const widen = (near ? 1 + toxicity * 0.9 : 1 + toxicity * 0.25) * regimeWiden;
        const offset = Math.max(PRICE_TICK, Math.round(center * level.distance * widen * quote.jitter / PRICE_TICK) * PRICE_TICK);
        let target = Math.round((side === "buy" ? center - offset : center + offset) / PRICE_TICK) * PRICE_TICK;
        if (opposing != null) target = side === "buy" ? Math.min(target, opposing - PRICE_TICK) : Math.max(target, opposing + PRICE_TICK);
        target = clamp(target, PRICE_TICK, book.maxPrice);
        const factor = (near ? this.depthFactor / (1 + toxicity * 0.3) : 1) * room;
        const size = Math.round(level.lots * factor);
        const alive = [];
        let resting = 0;
        for (const id of quote.ids) {
          const order = book.orders.get(id);
          if (order && order.lots > 0) {
            alive.push(order);
            resting += order.lots;
          }
        }
        const tolerance = Math.max(center * 0.00003, center * level.distance * TOLERANCE);
        const crossed = opposing != null && quote.price != null && (side === "buy" ? quote.price >= opposing : quote.price <= opposing);
        if (alive.length && Math.abs(quote.price - target) <= tolerance && !crossed && resting <= size * 1.6) {
          quote.ids = alive.map((order) => order.id);
          const refill = Math.min(size - resting, Math.round(size * REFILL));
          if (refill >= 10) this.post(quote, side, quote.price, refill);
          return;
        }
        for (const order of alive) book.cancel(order.id);
        quote.ids = [];
        quote.price = target;
        quote.jitter = 0.9 + sim.rng.next() * 0.2;
        const fresh = Math.round(size * (0.8 + sim.rng.next() * 0.4));
        if (fresh >= 10) this.post(quote, side, target, fresh);
      });
    }
  }

  post(quote, side, price, lots) {
    const arrival = this.sim.book.submit(side, price, lots, { owner: "maker", acct: "maker" });
    if (arrival.resting) quote.ids.push(arrival.id);
  }
}

// The spot index the perpetual tracks. It wanders on its own (the hidden mood tilts it) and slowly
// follows where the perpetual has been trading, so sustained pressure moves it while a spike does not.
const INDEX_VOL = 0.00006; // per second
const INDEX_DRIFT = 0.0000025; // per second at full mood
const PASS_THROUGH = 1 / 400;

export class IndexPrice {
  constructor(sim, price) {
    this.sim = sim;
    this.value = price;
    this.trail = price;
  }
  step() {
    const sim = this.sim;
    this.trail += (sim.last - this.trail) * 0.02;
    this.value *= Math.exp(sim.sentiment.value * INDEX_DRIFT + INDEX_VOL * sim.rng.normal());
    this.value += (this.trail - this.value) * PASS_THROUGH;
  }
}

// Basis arbitrage: trades the perpetual back toward the index with IOC orders once the gap passes a
// threshold, and unwinds the inventory when the gap closes. Its capacity is limited, so a big push
// holds for a while and fades over minutes.
const ARB_THRESHOLD = 0.0006;
const ARB_GAIN = 1_000_000; // lots per unit of basis beyond the threshold, per second
const ARB_MAX_TICK = 4000; // 40 BTC a second
const ARB_LIMIT = 300000; // 3,000 BTC
const ARB_UNWIND = 300; // 3 BTC a second

export class ArbDesk {
  constructor(sim) {
    this.sim = sim;
    this.account = sim.addAccount("arb", "arb");
  }
  act() {
    const sim = this.sim;
    const index = sim.index.value;
    const basis = sim.last / index - 1;
    const position = this.account.position;
    if (Math.abs(basis) > ARB_THRESHOLD) {
      const side = basis > 0 ? "sell" : "buy";
      const room = ARB_LIMIT - (side === "buy" ? position : -position);
      const lots = Math.min(ARB_MAX_TICK, room, Math.round((Math.abs(basis) - ARB_THRESHOLD) * ARB_GAIN));
      if (lots < 10) return;
      const limit = Math.round(index * (1 + (side === "sell" ? ARB_THRESHOLD : -ARB_THRESHOLD)) / PRICE_TICK) * PRICE_TICK;
      sim.book.submit(side, limit, lots, { owner: "arb", acct: "arb", rest: false });
    } else if (position && Math.abs(basis) < ARB_THRESHOLD / 3) {
      const side = position > 0 ? "sell" : "buy";
      const lots = Math.min(Math.abs(position), ARB_UNWIND);
      const limit = Math.round(index * (1 + (side === "sell" ? -ARB_THRESHOLD / 3 : ARB_THRESHOLD / 3)) / PRICE_TICK) * PRICE_TICK;
      sim.book.submit(side, limit, lots, { owner: "arb", acct: "arb", rest: false });
    }
  }
}
