import { SpotExchange, reservePerLot } from "./exchange-engine.js";

export const STEP_MS = 250;
export const CANDLE_TICKS = 40;
export const WARMUP_TICKS = 2400;
export const MAX_CANDLES = 4320;
export const DEPTH_LEVELS = 40;
export const INITIAL = Object.freeze({
  cash: 250000000,
  base: 25000,
  price: 10000,
});
const clone = (value) => structuredClone(value);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

// Independent streams: player actions cannot consume another participant's randomness.
export class Random {
  constructor(seed) {
    this.state = seed >>> 0 || 1;
  }
  next() {
    let n = this.state;
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    this.state = n >>> 0;
    return this.state / 4294967296;
  }
  between(low, high) {
    return low + Math.floor(this.next() * (high - low + 1));
  }
}

export class MarketWorld {
  constructor(seed = 78432, warmup = true) {
    this.seed = seed >>> 0 || 1;
    this.exchange = new SpotExchange();
    this.tick = -WARMUP_TICKS;
    this.reference = INITIAL.price;
    this.drift = 0;
    this.pressure = 0;
    this.volatility = 1;
    this.env = new Random(this.seed);
    this.candles = [];
    this.cvd = 0;
    this.cvdAnchor = -WARMUP_TICKS;
    this.stats = { high: INITIAL.price, low: INITIAL.price, volume: 0 };
    this.agents = [];
    this.exchange.addAccount("player", INITIAL.cash, INITIAL.base);
    for (let i = 0; i < 24; i++) {
      const kind =
        i < 3 ? "maker" : i < 16 ? "retail" : i < 21 ? "momentum" : "large";
      const id = `participant-${i}`;
      const cash =
        kind === "maker"
          ? 12000000000
          : kind === "large"
            ? 5000000000
            : 800000000;
      const base =
        kind === "maker" ? 1200000 : kind === "large" ? 500000 : 80000;
      this.exchange.addAccount(id, cash, base);
      this.agents.push({
        id,
        kind,
        rng: new Random(this.seed ^ Math.imul(i + 1, 2654435761)),
        next: -WARMUP_TICKS + i,
        initialBase: base,
        anchor: INITIAL.price,
        bias: (i % 3) - 1,
      });
    }
    if (warmup) {
      while (this.tick < -1) this.step();
    }
    this.tick = 0;
    this.exchange.time = 0;
    this.stats = {
      high: this.exchange.lastPrice,
      low: this.exchange.lastPrice,
      volume: 0,
    };
    this.recordTrades([]);
    this.captureDepth();
  }

  safeOrder(agent, side, type, size, price, duration = 80) {
    const available = this.exchange.available(agent.id);
    if (side === "sell") size = Math.min(size, available.base);
    else if (type === "limit")
      size = Math.min(size, Math.floor(available.cash / reservePerLot(price)));
    if (size > 0)
      this.exchange.submit(agent.id, {
        side,
        type,
        size,
        price,
        expires: this.tick + duration,
      });
  }

  act(agent) {
    const { rng, kind, id } = agent;
    const x = this.exchange;
    const bids = x.book("buy"),
      asks = x.book("sell");
    const midpoint =
      bids.length && asks.length
        ? (bids[0].price + asks[0].price) / 2
        : x.lastPrice;
    if (kind === "maker") {
      x.cancelAll(id);
      const inventory = (x.accounts[id].base - agent.initialBase) / 100;
      // Fair value anchors long horizons; quotes also respond to order flow and inventory.
      const center = Math.round(
        this.reference * 0.66 +
          midpoint * 0.24 +
          x.lastPrice * 0.1 -
          inventory * 0.012 +
          agent.bias * 3,
      );
      const spread = Math.round(
        3 +
          this.volatility * 2 +
          Math.abs(this.pressure) * 0.8 +
          rng.between(0, 4),
      );
      const depth = rng.next() < 0.08 ? 6 : 14;
      for (let level = 0; level < depth; level++) {
        const distance = spread + level * (4 + Math.floor(this.volatility));
        const size = rng.between(300, 1300) + level * 95;
        for (const side of ["buy", "sell"]) {
          const price = Math.max(
            1,
            center + (side === "buy" ? -distance : distance),
          );
          this.safeOrder(agent, side, "limit", size, price, 60);
        }
      }
      agent.next = this.tick + rng.between(6, 17);
    } else if (kind === "retail") {
      if (rng.next() < 0.45) x.cancelAll(id);
      const side =
        rng.next() <
        clamp(0.5 + this.pressure * 0.015 + agent.bias * 0.07, 0.15, 0.85)
          ? "buy"
          : "sell";
      const size = rng.between(30, 550);
      if (rng.next() < 0.58) this.safeOrder(agent, side, "market", size);
      else {
        const price = Math.max(
          1,
          Math.round(midpoint + (side === "buy" ? -1 : 1) * rng.between(2, 85)),
        );
        this.safeOrder(agent, side, "limit", size, price, rng.between(20, 160));
      }
      agent.next = this.tick + rng.between(3, 20);
    } else if (kind === "momentum") {
      const change = x.lastPrice - agent.anchor;
      const inventory = x.accounts[id].base - agent.initialBase;
      let side = change > 0 ? "buy" : "sell";
      if (Math.abs(inventory) > 17000 && rng.next() < 0.7)
        side = inventory > 0 ? "sell" : "buy";
      if (Math.abs(change) > rng.between(4, 18) || rng.next() < 0.18)
        this.safeOrder(agent, side, "market", rng.between(200, 1500));
      agent.anchor = Math.round(agent.anchor * 0.55 + x.lastPrice * 0.45);
      agent.next = this.tick + rng.between(9, 30);
    } else {
      const probability = clamp(
        0.5 + (this.reference - x.lastPrice) / 180 + this.pressure * 0.025,
        0.1,
        0.9,
      );
      this.safeOrder(
        agent,
        rng.next() < probability ? "buy" : "sell",
        "market",
        rng.between(4500, 17000),
      );
      agent.next = this.tick + rng.between(100, 280);
    }
  }

  step() {
    this.tick++;
    const x = this.exchange;
    x.time = this.tick;
    const sequence = x.sequence;
    if (this.tick % 160 === 0) {
      this.drift = this.env.between(-5, 5);
      this.volatility = this.env.between(1, 4);
      this.pressure = this.env.between(-8, 8);
    }
    if (this.tick % 4 === 0) {
      this.reference = clamp(
        this.reference +
          this.env.between(-this.volatility * 2, this.volatility * 2) +
          this.drift,
        1000,
        1000000,
      );
      this.pressure *= 0.994;
    }
    if (this.env.next() < 0.0018) {
      const shock = this.env.between(-95, 95);
      this.reference = clamp(this.reference + shock, 1000, 1000000);
      this.pressure = Math.sign(shock) * 8;
    }
    x.expire();
    for (const agent of this.agents)
      if (agent.next <= this.tick) this.act(agent);
    this.recordTrades(x.trades.filter((t) => t.id > sequence));
    if (this.tick % 4 === 0 || !this.candles.at(-1).depth) this.captureDepth();
    return this;
  }

  recordTrades(trades) {
    const start = Math.floor(this.tick / CANDLE_TICKS) * CANDLE_TICKS;
    let candle = this.candles[this.candles.length - 1];
    if (!candle || candle.time !== start) {
      const price = candle?.close ?? INITIAL.price;
      candle = {
        time: start,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        buy: 0,
        cvdOpen: this.cvd,
        cvdClose: this.cvd,
        footprint: {},
        footprintComplete: true,
        depth: null,
      };
      this.candles.push(candle);
      if (this.candles.length > MAX_CANDLES) this.candles.shift();
    }
    for (const trade of trades) {
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price;
      candle.volume += trade.size;
      if (trade.side === "buy") candle.buy += trade.size;
      const row = (candle.footprint[trade.price] ||= [0, 0]);
      row[trade.side === "buy" ? 1 : 0] += trade.size;
      this.cvd += trade.side === "buy" ? trade.size : -trade.size;
      candle.cvdClose = this.cvd;
      if (this.tick >= 0) {
        this.stats.high = Math.max(this.stats.high, trade.price);
        this.stats.low = Math.min(this.stats.low, trade.price);
        this.stats.volume += trade.size;
      }
    }
  }

  captureDepth() {
    // One end-of-interval snapshot per 10-second bar, refreshed every second.
    // It is resting liquidity at a known instant, never traded volume or an average.
    const candle = this.candles.at(-1);
    candle.depth = {
      time: this.tick,
      bids: this.exchange
        .levels("buy", DEPTH_LEVELS)
        .map((r) => [r.price, r.size]),
      asks: this.exchange
        .levels("sell", DEPTH_LEVELS)
        .map((r) => [r.price, r.size]),
    };
  }

  command(command) {
    const sequence = this.exchange.sequence;
    let result;
    if (command.action === "cancel")
      result = { ok: this.exchange.cancel(command.id, "player") };
    else if (command.action === "cancelAll")
      result = { ok: true, count: this.exchange.cancelAll("player") };
    else result = this.exchange.submit("player", command);
    this.recordTrades(this.exchange.trades.filter((t) => t.id > sequence));
    this.captureDepth();
    return result;
  }

  snapshot(shareHistory = false) {
    const state = clone({
      seed: this.seed,
      tick: this.tick,
      reference: this.reference,
      drift: this.drift,
      pressure: this.pressure,
      volatility: this.volatility,
      env: this.env.state,
      agents: this.agents.map((a) => ({ ...a, rng: a.rng.state })),
      exchange: this.exchange.snapshot(),
      cvd: this.cvd,
      cvdAnchor: this.cvdAnchor,
      stats: this.stats,
    });
    // Completed bars are immutable. Runtime checkpoints share them instead of
    // copying twelve hours of profiles forty times. Only the active bar is mutable.
    state.candles = shareHistory
      ? [...this.candles.slice(0, -1), clone(this.candles.at(-1))]
      : clone(this.candles);
    return state;
  }

  restore(state) {
    const { candles, ...core } = state;
    const data = clone(core);
    for (const key of [
      "seed",
      "tick",
      "reference",
      "drift",
      "pressure",
      "volatility",
      "stats",
    ])
      this[key] = data[key];
    this.candles = [...candles.slice(0, -1), clone(candles.at(-1))];
    this.cvdAnchor = data.cvdAnchor ?? candles[0]?.time ?? this.tick;
    this.cvd = data.cvd;
    if (this.cvd === undefined) {
      // Upgrade v2 without inventing old per-price executions or book history.
      this.cvd = 0;
      this.candles = candles.map((bar) => {
        const cvdOpen = this.cvd;
        this.cvd += 2 * bar.buy - bar.volume;
        return {
          ...bar,
          cvdOpen,
          cvdClose: this.cvd,
          footprint: {},
          footprintComplete: false,
          depth: null,
        };
      });
    }
    this.env = new Random(data.env);
    this.agents = data.agents.map((a) => ({ ...a, rng: new Random(a.rng) }));
    this.exchange.restore(data.exchange);
  }
}
