import { PRICE_TICK } from "./book.js";

// Near levels answer everyday flow; the backstop keeps a price for every exit. Sizes in BTC.
export const MAKER_LADDER = [
  [0.00005, 2], [0.00015, 4], [0.0003, 7], [0.0005, 14], [0.0008, 28], [0.0012, 55],
  [0.0018, 80], [0.0026, 105], [0.0036, 130], [0.005, 160], [0.007, 190], [0.0092, 220],
  [0.012, 300], [0.016, 450], [0.022, 650], [0.03, 900], [0.04, 1100], [0.052, 1400],
].map(([distance, btc]) => ({ distance, lots: btc * 100 }));

const REFILL = 0.3;
const TOLERANCE = 0.35;
const SKEW_PER_LOT = 0.000000008; // 1,000 BTC of inventory leans quotes about 0.08%.
const MAX_SKEW = 0.0012;
const MAX_INVENTORY = 600000; // 6,000 BTC
const TOXIC_LOTS = 30000; // 300 BTC of one-way taker flow, smoothed
const SWEEP_LOTS = 25000; // one order of 250 BTC or more moves the maker's reference at once
const FULL_SWEEP_LOTS = 150000; // from 1,500 BTC the reference jumps all the way to its average price

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

  // One large order is real money, not a stray print: the reference moves toward the order's
  // average price at once and the ladder is requoted there before anyone else trades. The swept
  // levels above the average stay a wick. Liquidations and stops are left to the usual smoothing,
  // as makers fade forced flow.
  afterSweep({ acct, matched, avgPrice }) {
    if (acct === "maker" || acct === "forced" || matched < SWEEP_LOTS || this.reference == null) return;
    const share = clamp(matched / FULL_SWEEP_LOTS, 0, 1);
    this.reference += (avgPrice - this.reference) * share;
    this.act();
  }

  toxicity() {
    return clamp(Math.abs(this.flow) / TOXIC_LOTS, 0, 2.5);
  }

  // newSecond: the first refresh of a simulated second, when the reference price steps forward.
  act(newSecond = false) {
    const sim = this.sim;
    const book = sim.book;
    // Quotes center on a reference that follows trades over a few seconds, so one print through a
    // thin book does not drag the whole ladder with it.
    if (this.reference == null) this.reference = book.last;
    if (newSecond) this.reference += (book.last - this.reference) * ANCHOR.makerFollow;
    const last = this.reference;
    const toxicity = this.toxicity();
    const calm = 1 - clamp(Math.abs(this.forced) / TOXIC_LOTS, 0, 1);
    const inventory = this.account.position;
    // Quotes lean toward the hidden fair value, and away from the side the inventory is on.
    const skew = clamp(inventory * SKEW_PER_LOT, -MAX_SKEW, MAX_SKEW);
    const center = last + (sim.fair.value - last) * ANCHOR.makerLean * calm - skew * last;
    const regimeWiden = sim.regime?.key === "panic" || sim.regime?.key === "euphoria" ? 1.4 : sim.regime?.key === "wild" ? 1.15 : 1;
    for (const side of ["buy", "sell"]) {
      const loaded = side === "buy" ? Math.max(0, inventory) : Math.max(0, -inventory);
      // A loaded maker quotes smaller and further away, but never leaves the book empty.
      const share = clamp(loaded / MAX_INVENTORY, 0, 1);
      const room = 1 - share * 0.55;
      const stretch = 1 + share * 1.5;
      const opposing = side === "buy" ? book.bestAsk() : book.bestBid();
      MAKER_LADDER.forEach((level, index) => {
        const key = `${side}:${index}`;
        let quote = this.quotes.get(key);
        if (!quote) {
          quote = { ids: [], price: null, jitter: 0.9 + sim.rng.next() * 0.2 };
          this.quotes.set(key, quote);
        }
        const near = level.distance < 0.01;
        const widen = (near ? 1 + toxicity * 0.9 : 1 + toxicity * 0.25) * regimeWiden * stretch;
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

// How firmly the market is tied to its fair value, and how that value moves. One place so the
// balance lab can try other settings.
export const ANCHOR = {
  makerLean: 0.12, // share of the gap to fair value the maker's quote center closes
  valueDeadZone: 0.002, // gap to fair value the value crowd ignores
  valueBoost: 2.5, // extra value-crowd activity per 1% of gap beyond the dead zone
  valueVol: 0.00005, // per-second noise of the fair value
  moodDrift: 0.0000025, // per-second drift at full mood
  adopt: 1 / 10800, // per-second pull of the fair value toward the price that holds (about three hours)
  trendChance: 0.5, // share of fair-value episodes that carry a direction
  trendPerHour: [0.006, 0.02], // size of a directional episode's move per hour
  trendMinutes: [30, 150],
  calmMinutes: [30, 180],
  makerFollow: 0.3, // share of the move to the last trade the maker's reference takes each second
  herd: 0, // typical lean of the noise crowd toward one side
  herdMinutes: 0.25, // how long that lean persists
};

// The hidden fair value: where the crowds believe the price belongs. It moves in episodes: calm
// stretches where it only wanders, and directional ones where it keeps moving one way (the mood picks
// the side more often than not). It also slowly adopts a price that holds, so a level the market
// defends for a while becomes the new value while a spike nobody follows does not. It never trades;
// it only steers the value crowd and the maker's quotes.
export class FairValue {
  constructor(sim, price) {
    this.sim = sim;
    this.value = price;
    this.trail = price;
    this.episode = { drift: 0, until: -Infinity };
    this.episodes = [];
  }
  step() {
    const sim = this.sim;
    const rng = sim.rng;
    if (sim.time >= this.episode.until) {
      const trending = rng.chance(ANCHOR.trendChance);
      const minutes = rng.int(...(trending ? ANCHOR.trendMinutes : ANCHOR.calmMinutes));
      const side = rng.chance(0.5 + sim.sentiment.value * 0.3) ? 1 : -1;
      const drift = trending ? side * rng.range(...ANCHOR.trendPerHour) / 3600 : 0;
      this.episode = { drift, until: sim.time + minutes * 60, start: sim.time };
      this.episodes.push(this.episode);
      if (this.episodes.length > 40) this.episodes.shift();
    }
    this.trail += (sim.last - this.trail) * 0.005;
    this.value *= Math.exp(this.episode.drift + sim.sentiment.value * ANCHOR.moodDrift + ANCHOR.valueVol * rng.normal());
    this.value += (this.trail - this.value) * ANCHOR.adopt;
  }
}
