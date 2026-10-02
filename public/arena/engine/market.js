import { OrderBook, Random, roundPrice, PRICE_TICK } from "./book.js";
import { applyFill, liquidationPrice, newAccount } from "./ledger.js";
import { Indicators } from "./indicators.js";
import { readRegime, Sentiment } from "./regime.js";
import { FairValue, MarketMaker } from "./maker.js";
import { POOLS, POOL_MAP } from "./pools.js";
import { LiquidationEstimate } from "./estimate.js";

export const CANDLE_SECONDS = 60;
export const START_PRICE = 10_000_000; // $100,000 in cents
const SYNTH_CANDLES = 300; // five hours of quick history before the order book starts
const WARM_SECONDS = 3600; // one hour of full simulation before the player arrives
const MARKET_BAND = 0.006;
const EXIT_BAND = 0.008;
const CASCADE_BAND = 0.01;
const FOOTPRINT_BIN = 1000; // $10
const TAPE_KEEP = 4000;
const FOOTPRINT_KEEP = 240;
const VIRTUAL_NOISE_PER_MINUTE = 8;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// One simulated BTC perpetual market: the order book, the market maker, eight strategy crowds and
// whoever else trades in it. Every position is an account on one ledger, so open interest is real and
// every exit, forced or chosen, is an order that trades.
export class Sandbox {
  constructor(seed = 1, { synthCandles = SYNTH_CANDLES, warmSeconds = WARM_SECONDS } = {}) {
    if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff) throw Error("Invalid seed");
    this.seed = seed;
    this.rng = new Random((seed ^ 0x9e3779b9) >>> 0);
    this.book = new OrderBook({ maxPrice: 1_000_000_000, onTrade: (trade) => this.onTrade(trade) });
    this.book.last = START_PRICE;
    this.accounts = new Map();
    this.cohorts = new Map();
    this.byPool = Object.fromEntries(POOLS.map((pool) => [pool.key, []]));
    this.nextCohortId = 1;
    this.dirty = new Set();
    this.oi = 0;
    this.candles = [];
    this.live = null;
    this.cvd = 0;
    this.ind = new Indicators();
    this.regime = { key: "quiet", trend: 0, efficiency: 0, volatility: 0 };
    this.regimeLog = [];
    this.sentiment = new Sentiment(this.rng);
    this.estimate = new LiquidationEstimate();
    this.tape = [];
    this.liquidationFeed = [];
    this.feedId = 0;
    this.cascade = null;
    this.liqTicks = [];
    this.priceTrail = [];
    this.marketStats = { liquidatedLong: 0, liquidatedShort: 0, exits: {} };
    this.player = null;
    this.insurance = this.addAccount("insurance", "insurance");
    this.legacy = this.addAccount("legacy", "legacy");
    this.maker = new MarketMaker(this);
    this.fair = new FairValue(this, START_PRICE);
    this.virtual = [];
    this.virtualMode = false;
    this.time = -(synthCandles * CANDLE_SECONDS + warmSeconds);
    this.warming = true;
    this.resetTick();
    this.buildHistory(synthCandles);
    while (this.time < 0) this.tick();
    this.warming = false;
  }

  get last() {
    return this.book.last;
  }

  addAccount(id, kind, extra) {
    const account = newAccount(id, kind, extra);
    this.accounts.set(id, account);
    return account;
  }

  // ---- History -----------------------------------------------------------------------------------

  // A quick candle-level history: a regime-switching random walk that the crowds trade virtually.
  // Positions that survive it carry over into the order book with their stops, targets and
  // liquidation prices sitting around the swing points of that history.
  buildHistory(count) {
    const rng = this.rng;
    this.virtualMode = true;
    let price = START_PRICE;
    let drift = 0;
    let sigma = 0.0009;
    let segment = 0;
    this.live = null;
    for (let i = 0; i < count; i++) {
      if (segment-- <= 0) {
        segment = rng.int(20, 90);
        drift = rng.normal() * 0.00028;
        sigma = rng.range(0.0006, 0.0014);
      }
      const ret = drift + sigma * rng.normal();
      const open = price;
      const close = Math.round(open * Math.exp(ret));
      const high = Math.round(Math.max(open, close) * (1 + Math.abs(rng.normal()) * sigma * 0.6));
      const low = Math.round(Math.min(open, close) * (1 - Math.abs(rng.normal()) * sigma * 0.6));
      const volume = Math.round(rng.lognormal(130, 0.5) * (1 + Math.abs(ret) / sigma * 0.5) * 100);
      const delta = Math.round(volume * clamp(ret / sigma * 0.25, -0.6, 0.6));
      this.cvd += delta;
      const candle = { time: this.time, open, high, low, close, volume, buy: (volume + delta) / 2, sell: (volume - delta) / 2, delta, cvd: this.cvd, oi: 0, trades: 1, synthetic: true, liq: { long: 0, short: 0 } };
      price = close;
      this.book.last = close;
      this.fair.value = close;
      this.fair.trail = close;
      for (let s = 0; s < CANDLE_SECONDS; s++) this.sentiment.step(this.time + s);
      this.time += CANDLE_SECONDS;
      this.estimate.decay(CANDLE_SECONDS);
      this.estimate.clearCrossed(low, high);
      this.virtualCandle(candle);
      this.candles.push(candle);
      this.closeCandleReadings();
      this.estimate.addFlow(1, close, candle.buy);
      this.estimate.addFlow(-1, close, candle.sell);
      for (const pool of POOLS) {
        const rate = pool.key === "noise" ? VIRTUAL_NOISE_PER_MINUTE : pool.rate * this.activity(pool);
        const decisions = rng.poisson(rate);
        for (let d = 0; d < decisions; d++) pool.decide(this);
      }
      candle.oi = this.virtual.reduce((sum, item) => sum + (item.state === "open" && item.side > 0 ? item.lots : 0), 0);
      this.priceTrail.push(close);
    }
    this.virtualMode = false;
    this.priceTrail = [];
    this.live = this.newCandle();
    this.fair = new FairValue(this, this.last);
    this.maker.act();
    this.materialize();
  }

  // Fills and exits of the virtual crowd against one history candle (adverse side first).
  virtualCandle(candle) {
    const keep = [];
    for (const item of this.virtual) {
      if (item.state === "pending") {
        if (this.time > item.expireAt) continue;
        const hit = item.type === "limit"
          ? (item.side > 0 ? candle.low <= item.price : candle.high >= item.price)
          : (item.side > 0 ? candle.high >= item.price : candle.low <= item.price);
        if (!hit) { keep.push(item); continue; }
        this.virtualOpen(item, item.price);
      }
      const long = item.side > 0;
      const adverse = long ? candle.low : candle.high;
      const favorable = long ? candle.high : candle.low;
      const liq = liquidationPrice(item.side, item.entry, item.leverage);
      if (long ? adverse <= liq : adverse >= liq) {
        candle.liq[long ? "long" : "short"] += item.lots;
        this.liqTicks.push({ time: this.time, long: long ? item.lots : 0, short: long ? 0 : item.lots });
        continue;
      }
      if (item.stop != null && (long ? adverse <= item.stop : adverse >= item.stop)) continue;
      if (item.trail) {
        item.best = long ? Math.max(item.best, favorable) : Math.min(item.best, favorable);
        if (long ? adverse <= item.best * (1 - item.trail) : adverse >= item.best * (1 + item.trail)) continue;
      }
      if (item.take != null && (long ? favorable >= item.take : favorable <= item.take)) continue;
      if (this.time >= item.expireAt) continue;
      if (item.panic && -item.side * (candle.close - item.entry) / item.entry * item.leverage >= item.panic) continue;
      keep.push(item);
    }
    this.virtual = keep;
    this.liqTicks = this.liqTicks.filter((row) => row.time > this.time - 900);
  }

  virtualOpen(item, price) {
    item.state = "open";
    item.entry = price;
    item.best = price;
    item.expireAt = this.time + item.hold;
  }

  // Survivors of the history become real accounts. Whoever took the other side back then is folded
  // into one legacy account, so the ledger still sums to zero.
  materialize() {
    for (const item of this.virtual) {
      const pool = POOL_MAP.get(item.pool);
      const cohort = this.createCohort({ ...item.spec, lots: item.lots });
      if (item.state === "open") {
        const signed = item.side * item.lots;
        this.oi -= Math.max(0, this.legacy.position);
        applyFill(this.legacy, -signed, item.entry);
        this.oi += Math.max(0, this.legacy.position);
        this.oi += Math.max(0, signed);
        applyFill(cohort, signed, item.entry);
        cohort.filled = item.lots;
        cohort.state = "open";
        cohort.openedAt = this.time;
        cohort.legacy = true;
        cohort.best = item.best;
        cohort.expireAt = item.expireAt;
        this.dirty.add(cohort);
      } else if (item.type === "limit") {
        const arrival = this.book.submit(item.side > 0 ? "buy" : "sell", item.price, item.lots, { owner: cohort.id, acct: cohort.id });
        cohort.entryOrder = arrival.resting ? arrival.id : null;
        cohort.entryExpire = item.expireAt;
        this.dirty.add(cohort);
      } else {
        cohort.trigger = item.price;
        cohort.entryExpire = item.expireAt;
      }
      if (!pool) throw Error(`Unknown pool ${item.pool}`);
    }
    this.virtual = [];
    this.maintain();
  }

  // ---- Crowd cohorts -----------------------------------------------------------------------------

  activity(pool) {
    return (pool.weights[this.regime.key] ?? 1) * (1 + 0.25 * Math.abs(this.sentiment.value)) * (pool.boost?.(this) ?? 1);
  }

  leverageFor(pool) {
    const table = pool.leverage;
    if ((this.regime.key === "panic" || this.regime.key === "euphoria") && this.rng.chance(0.3)) return table.at(-1)[0];
    return this.rng.pick(table);
  }

  touch(side) {
    return (side === "buy" ? this.book.bestBid() : this.book.bestAsk()) ?? this.last;
  }

  moveOver(seconds) {
    if (this.virtualMode || this.priceTrail.length < 2) {
      const back = Math.max(1, Math.round(seconds / CANDLE_SECONDS));
      const past = this.candles.at(-1 - back);
      return past ? this.last / past.close - 1 : 0;
    }
    const past = this.priceTrail[Math.max(0, this.priceTrail.length - 1 - seconds)];
    return this.last / past - 1;
  }

  recentLiquidations(seconds) {
    const out = { long: 0, short: 0 };
    for (let i = this.liqTicks.length - 1; i >= 0 && this.liqTicks[i].time > this.time - seconds; i--) {
      out.long += this.liqTicks[i].long;
      out.short += this.liqTicks[i].short;
    }
    return out;
  }

  poolCount(key) {
    if (this.virtualMode) return this.virtual.reduce((sum, item) => sum + (item.pool === key ? 1 : 0), 0);
    return this.byPool[key].length;
  }

  createCohort(spec) {
    const cid = this.nextCohortId++;
    const cohort = this.addAccount(`c${cid}`, "cohort", {
      cid, pool: spec.pool, side: spec.side, target: spec.lots, filled: 0, leverage: spec.leverage,
      stop: spec.stop ?? null, take: spec.take ?? null, takeMode: spec.takeMode ?? "trigger",
      trail: spec.trail ?? null, hold: spec.hold ?? 3600, signal: spec.signal ?? null, panic: spec.panic ?? null,
      breakeven: Boolean(spec.breakeven), state: "pending", liq: null, best: null, peak: 0,
      entryOrder: null, entryExpire: null, trigger: null, takeOrder: null, exitOrder: null, exitDeadline: null,
      forced: null, openedAt: null, expireAt: null, legacy: false, spec,
    });
    this.cohorts.set(cohort.id, cohort);
    const list = this.byPool[spec.pool];
    cohort.poolIndex = list.length;
    list.push(cohort);
    return cohort;
  }

  removeCohort(cohort) {
    if (cohort.position) throw Error("A cohort with a position cannot be removed");
    for (const id of [cohort.entryOrder, cohort.takeOrder, cohort.exitOrder]) if (id != null) this.book.cancel(id);
    this.cohorts.delete(cohort.id);
    this.accounts.delete(cohort.id);
    this.dirty.delete(cohort);
    const list = this.byPool[cohort.pool];
    const tail = list.pop();
    if (tail !== cohort) {
      list[cohort.poolIndex] = tail;
      tail.poolIndex = cohort.poolIndex;
    }
    cohort.removed = true;
  }

  // A strategy decision. spec: { pool, side, lots, leverage, entry: { type, price, expireAt }, stop,
  // take, takeMode, trail, hold, signal, panic, breakeven }.
  openCohort(spec) {
    if (!(spec.lots > 0) || (spec.side !== 1 && spec.side !== -1)) return null;
    const entry = spec.entry;
    if (this.virtualMode) {
      const item = { pool: spec.pool, side: spec.side, lots: spec.lots, leverage: spec.leverage, stop: spec.stop ?? null, take: spec.take ?? null, trail: spec.trail ?? null, hold: spec.hold ?? 3600, panic: spec.panic ?? null, spec, state: "pending", type: entry.type, price: entry.price ?? null, expireAt: entry.expireAt ?? Infinity, entry: null, best: null };
      if (entry.type === "market") this.virtualOpen(item, this.last);
      this.virtual.push(item);
      return item;
    }
    const cohort = this.createCohort(spec);
    const side = spec.side > 0 ? "buy" : "sell";
    if (entry.type === "market") {
      const bound = roundPrice(this.last * (1 + spec.side * MARKET_BAND));
      this.book.submit(side, bound, spec.lots, { owner: cohort.id, acct: cohort.id, rest: false });
    } else if (entry.type === "limit") {
      const arrival = this.book.submit(side, entry.price, spec.lots, { owner: cohort.id, acct: cohort.id });
      cohort.entryOrder = arrival.resting ? arrival.id : null;
      cohort.entryExpire = entry.expireAt;
    } else {
      cohort.trigger = entry.price;
      cohort.entryExpire = entry.expireAt;
    }
    this.dirty.add(cohort);
    return cohort;
  }

  cohortFilled(cohort, signed) {
    if (Math.sign(signed) === cohort.side) cohort.filled += Math.abs(signed);
    if (cohort.position && cohort.state === "pending") {
      cohort.state = "open";
      cohort.openedAt = this.time;
      cohort.expireAt = this.time + cohort.hold;
      cohort.best = cohort.entry;
    }
    this.dirty.add(cohort);
  }

  // Housekeeping after fills: close out flat cohorts, keep each take-profit order sized to the position.
  maintain() {
    for (let pass = 0; pass < 6 && this.dirty.size; pass++) {
      const batch = [...this.dirty];
      this.dirty.clear();
      for (const cohort of batch) {
        if (cohort.removed) continue;
        if (cohort.entryOrder != null && !this.book.orders.has(cohort.entryOrder)) cohort.entryOrder = null;
        if (cohort.takeOrder != null && !this.book.orders.has(cohort.takeOrder)) cohort.takeOrder = null;
        if (cohort.exitOrder != null && !this.book.orders.has(cohort.exitOrder)) cohort.exitOrder = null;
        if (!cohort.position) {
          const waiting = cohort.state === "pending" && (cohort.entryOrder != null || cohort.trigger != null);
          if (!waiting) this.removeCohort(cohort);
          continue;
        }
        cohort.liq = liquidationPrice(Math.sign(cohort.position), cohort.entry, cohort.leverage);
        if (cohort.takeMode !== "limit" || cohort.take == null || cohort.forced || cohort.exitOrder != null) continue;
        const want = Math.abs(cohort.position);
        const order = cohort.takeOrder != null ? this.book.orders.get(cohort.takeOrder) : null;
        const have = order ? order.lots + (order.iceberg?.hidden ?? 0) : 0;
        if (have === want) continue;
        if (order && have > want) {
          this.book.reduce(order.id, have - want);
          continue;
        }
        if (order) this.book.cancel(order.id);
        const arrival = this.book.submit(cohort.position > 0 ? "sell" : "buy", cohort.take, want, { owner: cohort.id, acct: cohort.id });
        cohort.takeOrder = arrival.resting ? arrival.id : null;
      }
    }
  }

  // An active exit: at market (anything left keeps trying next second) or as a limit at the touch.
  exitCohort(cohort, mode = "market", reason = "exit") {
    if (!cohort.position || cohort.forced) return;
    for (const key of ["entryOrder", "takeOrder", "exitOrder"]) {
      if (cohort[key] != null) this.book.cancel(cohort[key]);
      cohort[key] = null;
    }
    cohort.trigger = null;
    const side = cohort.position > 0 ? "sell" : "buy";
    this.marketStats.exits[reason] = (this.marketStats.exits[reason] ?? 0) + Math.abs(cohort.position);
    if (mode === "limit") {
      const price = side === "sell" ? (this.book.bestAsk() ?? this.last) : (this.book.bestBid() ?? this.last);
      const arrival = this.book.submit(side, price, Math.abs(cohort.position), { owner: cohort.id, acct: cohort.id });
      cohort.exitOrder = arrival.resting ? arrival.id : null;
      cohort.exitDeadline = this.time + this.rng.int(30, 120);
    } else {
      const bound = roundPrice(this.last * (side === "sell" ? 1 - EXIT_BAND : 1 + EXIT_BAND));
      this.book.submit(side, bound, Math.abs(cohort.position), { owner: cohort.id, acct: cohort.id, rest: false });
      if (cohort.position) cohort.forced = "exit";
    }
    this.dirty.add(cohort);
  }

  closeRandom(pool, mode) {
    if (this.virtualMode) {
      const open = this.virtual.filter((item) => item.pool === pool && item.state === "open");
      if (open.length) this.virtual.splice(this.virtual.indexOf(open[this.rng.int(0, open.length - 1)]), 1);
      return;
    }
    const list = this.byPool[pool];
    for (let attempt = 0; attempt < 6 && list.length; attempt++) {
      const cohort = list[this.rng.int(0, list.length - 1)];
      if (!cohort.position || cohort.forced || cohort.exitOrder != null) continue;
      this.exitCohort(cohort, mode, "noise");
      return;
    }
  }

  // ---- Fills -------------------------------------------------------------------------------------

  onTrade(trade) {
    const signed = trade.side === "buy" ? trade.lots : -trade.lots;
    this.bookFill(trade.takerAcct, signed, trade.price, trade.takerMeta, true);
    this.bookFill(trade.maker.acct, -signed, trade.price, trade.maker.meta, false);
    const candle = this.live;
    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;
    candle.volume += trade.lots;
    candle.trades++;
    candle[trade.side] += trade.lots;
    candle.delta += signed;
    this.cvd += signed;
    candle.cvd = this.cvd;
    const bin = Math.round(trade.price / FOOTPRINT_BIN) * FOOTPRINT_BIN;
    const cell = candle.fp.get(bin) ?? { buy: 0, sell: 0 };
    cell[trade.side] += trade.lots;
    candle.fp.set(bin, cell);
    const kind = trade.takerAcct === "forced" ? trade.takerMeta.group.kind : null;
    const tag = trade.takerAcct === "player" ? "player" : trade.maker.acct === "player" ? "player-maker" : kind === "liquidation" ? "liquidation" : kind === "stop" ? "stop" : "npc";
    this.tape.push({ time: this.time, price: trade.price, lots: trade.lots, side: trade.side, tag });
    if (this.tape.length > TAPE_KEEP * 1.25) this.tape.splice(0, this.tape.length - TAPE_KEEP);
    if (kind !== "liquidation") this.estimate.addFlow(signed > 0 ? 1 : -1, trade.price, trade.lots);
    const tick = this.tickStats;
    tick.low = Math.min(tick.low, trade.price);
    tick.high = Math.max(tick.high, trade.price);
    tick.net += signed;
    if (kind === "liquidation" || kind === "stop") tick.forced += signed;
    if (trade.takerAcct === "player") tick.player[trade.side] += trade.lots;
    else tick.aggressive[trade.side] += trade.lots;
  }

  bookFill(acct, signed, price, meta, taker) {
    if (acct === "forced") {
      this.distribute(meta.group, signed, price);
      return;
    }
    const account = this.accounts.get(acct);
    if (!account) throw Error(`Fill for unknown account ${acct}`);
    this.oi -= Math.max(0, account.position);
    applyFill(account, signed, price);
    this.oi += Math.max(0, account.position);
    if (account.kind === "cohort") this.cohortFilled(account, signed);
    else if (account.kind === "player") this.player.onFill(signed, price, taker, meta);
  }

  // Hands an account's whole position to a counterparty at one price (liquidation remainder).
  settleAgainst(account, counter, price) {
    const signed = -account.position;
    if (!signed) return;
    for (const [target, amount] of [[account, signed], [counter, -signed]]) {
      this.oi -= Math.max(0, target.position);
      applyFill(target, amount, price);
      this.oi += Math.max(0, target.position);
    }
  }

  // A grouped forced order's fills go to its cohorts in turn.
  distribute(group, signed, price) {
    let remaining = Math.abs(signed);
    while (remaining > 0 && group.cursor < group.cohorts.length) {
      const cohort = group.cohorts[group.cursor];
      const room = group.entry ? Math.max(0, cohort.target - cohort.filled) : Math.abs(cohort.position);
      if (!room) { group.cursor++; continue; }
      const fill = Math.min(room, remaining);
      remaining -= fill;
      this.oi -= Math.max(0, cohort.position);
      applyFill(cohort, Math.sign(signed) * fill, price);
      this.oi += Math.max(0, cohort.position);
      this.cohortFilled(cohort, Math.sign(signed) * fill);
    }
    if (remaining > 0) {
      // Nothing left to close or open in the group: the insurance fund takes the rest.
      this.oi -= Math.max(0, this.insurance.position);
      applyFill(this.insurance, Math.sign(signed) * remaining, price);
      this.oi += Math.max(0, this.insurance.position);
    }
  }

  // ---- Triggers and waves ------------------------------------------------------------------------

  // Liquidations, stops, trailing stops, trigger take-profits and stop entries become market orders,
  // grouped by side and kind. One wave per call; a chain unfolds over several seconds.
  resolveTriggers() {
    const last = this.last;
    const groups = new Map();
    const add = (key, side, kind, entry, cohort) => {
      let group = groups.get(key);
      if (!group) groups.set(key, group = { side, kind, entry, cohorts: [], lots: 0, cursor: 0 });
      group.cohorts.push(cohort);
      group.lots += entry ? cohort.target - cohort.filled : Math.abs(cohort.position);
    };
    for (const cohort of this.cohorts.values()) {
      if (cohort.trigger != null && cohort.state === "pending") {
        if (cohort.side > 0 ? last >= cohort.trigger : last <= cohort.trigger) add(`${cohort.side > 0 ? "buy" : "sell"}:entry`, cohort.side > 0 ? "buy" : "sell", "entry", true, cohort);
        continue;
      }
      const position = cohort.position;
      if (!position) continue;
      const long = position > 0;
      let kind = cohort.forced;
      if (!kind) {
        if (cohort.trail) cohort.best = long ? Math.max(cohort.best ?? last, last) : Math.min(cohort.best ?? last, last);
        if (long ? last <= cohort.liq : last >= cohort.liq) kind = "liquidation";
        else if (cohort.stop != null && (long ? last <= cohort.stop : last >= cohort.stop)) kind = "stop";
        else if (cohort.trail && (long ? last <= cohort.best * (1 - cohort.trail) : last >= cohort.best * (1 + cohort.trail))) kind = "stop";
        else if (cohort.take != null && cohort.takeMode === "trigger" && (long ? last >= cohort.take : last <= cohort.take)) kind = "take";
      }
      if (kind) add(`${long ? "sell" : "buy"}:${kind}`, long ? "sell" : "buy", kind, false, cohort);
    }
    if (!groups.size) return null;
    const order = { liquidation: 0, stop: 1, exit: 2, take: 3, entry: 4 };
    let wave = null;
    for (const group of [...groups.values()].sort((a, b) => order[a.kind] - order[b.kind])) {
      for (const cohort of group.cohorts) {
        if (group.entry) {
          cohort.trigger = null;
          continue;
        }
        for (const key of ["entryOrder", "takeOrder", "exitOrder"]) {
          if (cohort[key] != null) this.book.cancel(cohort[key]);
          cohort[key] = null;
        }
        if (group.kind !== "take") cohort.forced = group.kind;
      }
      if (group.lots <= 0) continue;
      if (!group.entry && !this.warming) this.marketStats.exits[group.kind] = (this.marketStats.exits[group.kind] ?? 0) + group.lots;
      const before = this.last;
      const bound = roundPrice(before * (group.side === "sell" ? 1 - CASCADE_BAND : 1 + CASCADE_BAND));
      const arrival = this.book.submit(group.side, bound, group.lots, { owner: "forced", acct: "forced", rest: false, meta: { group } });
      for (const cohort of group.cohorts) this.dirty.add(cohort);
      if (group.kind === "liquidation" && arrival.matched) wave = this.recordWave(group, arrival, before) ?? wave;
    }
    this.maintain();
    return wave;
  }

  recordWave(group, arrival, before) {
    const side = group.side === "sell" ? "long" : "short";
    const cascade = this.cascade;
    const chained = cascade && cascade.side === side && this.time - cascade.time <= 1;
    if (chained) {
      cascade.chain++;
      cascade.lots += arrival.matched;
      cascade.time = this.time;
    } else this.cascade = { side, chain: 1, lots: arrival.matched, time: this.time, start: this.time };
    const push = this.player?.push;
    const by = push && this.time <= push.until && push.side === group.side ? "player" : null;
    if (by) push.until = Math.max(push.until, this.time + 1);
    const item = { id: ++this.feedId, time: this.time, side, lots: arrival.matched, value: arrival.value / 10000, from: before, to: this.last, chain: this.cascade.chain, by, warm: this.warming };
    this.liquidationFeed.push(item);
    if (this.liquidationFeed.length > 120) this.liquidationFeed.shift();
    this.liqTicks.push({ time: this.time, long: side === "long" ? arrival.matched : 0, short: side === "short" ? arrival.matched : 0 });
    this.live.liq[side] += arrival.matched;
    if (!this.warming) this.marketStats[side === "long" ? "liquidatedLong" : "liquidatedShort"] += arrival.matched;
    this.tickStats.waves.push(item);
    if (by && this.player) this.player.stats.ignited += arrival.matched;
    return item;
  }

  // ---- Active exits ------------------------------------------------------------------------------

  activeExits() {
    const last = this.last;
    for (const cohort of [...this.cohorts.values()]) {
      if (cohort.removed) continue;
      if (cohort.state === "pending") {
        if (cohort.entryExpire != null && this.time >= cohort.entryExpire) {
          if (cohort.entryOrder != null) this.book.cancel(cohort.entryOrder);
          cohort.entryOrder = null;
          cohort.trigger = null;
          this.dirty.add(cohort);
        }
        continue;
      }
      const position = cohort.position;
      if (!position || cohort.forced) continue;
      if (cohort.exitOrder != null) {
        if (this.time >= cohort.exitDeadline) {
          this.book.cancel(cohort.exitOrder);
          cohort.exitOrder = null;
          this.exitCohort(cohort, "market", "noise");
        }
        continue;
      }
      // Partly filled entries stop waiting once the position is managed.
      if (cohort.entryOrder != null && cohort.entryExpire != null && this.time >= cohort.entryExpire) {
        this.book.cancel(cohort.entryOrder);
        cohort.entryOrder = null;
      }
      const dir = Math.sign(position);
      const move = dir * (last / cohort.entry - 1);
      cohort.peak = Math.max(cohort.peak, move);
      if (this.time >= cohort.expireAt) {
        this.exitCohort(cohort, cohort.pool === "noise" && this.rng.chance(0.5) ? "limit" : "market", "time");
      } else if (cohort.panic && -move * cohort.leverage >= cohort.panic) {
        this.exitCohort(cohort, "market", "panic");
      } else if (cohort.breakeven && cohort.peak >= 0.003 && move <= 0.0002) {
        this.exitCohort(cohort, "market", "breakeven");
      }
    }
  }

  // Chart-signal exits, checked once a candle closes.
  signalExits() {
    const closed = this.candles.slice(-3);
    for (const cohort of [...this.cohorts.values()]) {
      if (!cohort.position || cohort.forced || !cohort.signal) continue;
      const dir = Math.sign(cohort.position);
      let out = false;
      if (cohort.signal.startsWith("macd:")) out = this.ind.macd[cohort.signal.slice(5)].cross === -dir;
      else if (cohort.signal === "reversal3") out = closed.length === 3 && closed.every((candle) => dir * (candle.close - candle.open) < 0) && cohort.openedAt < closed[0].time;
      if (out) this.exitCohort(cohort, "market", "signal");
    }
  }

  // ---- Time --------------------------------------------------------------------------------------

  newCandle() {
    const last = this.last;
    return { time: this.time, open: last, high: last, low: last, close: last, volume: 0, buy: 0, sell: 0, delta: 0, cvd: this.cvd, oi: this.oi, trades: 0, liq: { long: 0, short: 0 }, fp: new Map() };
  }

  closeCandleReadings() {
    this.ind.update(this.candles);
    const regime = readRegime(this.candles, this.recentLiquidations(600));
    if (regime.key !== this.regime.key) this.regimeLog.push({ time: this.time, key: regime.key });
    this.regime = regime;
  }

  resetTick() {
    this.tickStats = { net: 0, forced: 0, aggressive: { buy: 0, sell: 0 }, player: { buy: 0, sell: 0 }, low: Infinity, high: -Infinity, waves: [] };
  }

  tick() {
    this.resetTick();
    this.time++;
    this.book.time = this.time;
    if (this.time % CANDLE_SECONDS === 0) {
      this.live.oi = this.oi;
      this.live.book = { bids: this.book.depth("buy", 80), asks: this.book.depth("sell", 80) };
      this.candles.push(this.live);
      if (this.candles.length > FOOTPRINT_KEEP) {
        const old = this.candles[this.candles.length - FOOTPRINT_KEEP];
        old.fp = null;
        old.book = null;
      }
      this.closeCandleReadings();
      this.signalExits();
      this.live = this.newCandle();
    }
    this.sentiment.step(this.time);
    this.fair.step();
    this.maker.act();
    const noise = POOL_MAP.get("noise");
    const flow = this.rng.poisson(noise.rate / 60 * this.activity(noise));
    for (let i = 0; i < flow; i++) {
      if (i && i % 3 === 0) this.maker.act();
      noise.decide(this);
    }
    for (const pool of POOLS) {
      if (pool === noise) continue;
      const decisions = this.rng.poisson(pool.rate / 60 * this.activity(pool));
      for (let i = 0; i < decisions; i++) pool.decide(this);
    }
    this.maintain();
    this.resolveTriggers();
    this.activeExits();
    this.player?.onTick();
    this.maintain();
    this.maker.observe(this.tickStats.net, this.tickStats.forced);
    if (this.tickStats.low <= this.tickStats.high) this.estimate.clearCrossed(this.tickStats.low, this.tickStats.high);
    this.estimate.decay(1);
    this.priceTrail.push(this.last);
    if (this.priceTrail.length > 900) this.priceTrail.shift();
    this.liqTicks = this.liqTicks.filter((row) => row.time > this.time - 900);
    this.live.oi = this.oi;
    return this.tickStats;
  }

  // ---- Readings ----------------------------------------------------------------------------------

  // Mid of the best bid and ask that are not the player's own quotes.
  markPrice() {
    const own = this.player ? this.player.restingByPrice() : null;
    const best = (prices, fromTop) => {
      for (let i = 0; i < prices.length; i++) {
        const price = fromTop ? prices[prices.length - 1 - i] : prices[i];
        if (this.book.levels.get(price).lots - (own?.get(price) ?? 0) > 0) return price;
      }
      return null;
    };
    const bid = best(this.book.bids, true);
    const ask = best(this.book.asks, false);
    return bid == null || ask == null ? this.last : Math.round((bid + ask) / 2);
  }

  allCandles() {
    return this.live ? [...this.candles, this.live] : this.candles;
  }

  footprint(fromTime, bin = FOOTPRINT_BIN) {
    const rows = new Map();
    for (const candle of this.allCandles()) {
      if (candle.time < fromTime || !candle.fp) continue;
      for (const [price, cell] of candle.fp) {
        const key = Math.round(price / bin) * bin;
        const row = rows.get(key) ?? { price: key, buy: 0, sell: 0 };
        row.buy += cell.buy;
        row.sell += cell.sell;
        rows.set(key, row);
      }
    }
    return [...rows.values()].sort((a, b) => b.price - a.price);
  }

  // Public iceberg read: a price that traded far more passively than it ever showed, still resting.
  icebergSignals(seconds = 120, minLots = 4000) {
    const traded = new Map();
    for (let i = this.tape.length - 1; i >= 0 && this.tape[i].time > this.time - seconds; i--) {
      const trade = this.tape[i];
      if (trade.tag === "player-maker") continue;
      traded.set(trade.price, (traded.get(trade.price) ?? 0) + trade.lots);
    }
    const out = [];
    for (const [price, lots] of traded) {
      if (lots < minLots) continue;
      const level = this.book.levels.get(price);
      if (level && lots >= level.lots * 3) out.push({ price, side: level.side, traded: lots, shown: level.lots });
    }
    return out.sort((a, b) => b.traded - a.traded);
  }

  // The true crowd map, hidden while playing: liquidation, stop and take-profit sizes by price, and
  // the stop entries waiting above highs and below lows.
  reveal(bin = 10000) {
    const rows = new Map();
    const row = (price) => {
      const key = Math.round(price / bin) * bin;
      let item = rows.get(key);
      if (!item) rows.set(key, item = { price: key, liqLong: 0, liqShort: 0, stopLong: 0, stopShort: 0, takeLong: 0, takeShort: 0, entryBuy: 0, entrySell: 0, byPool: {} });
      return item;
    };
    const pools = Object.fromEntries(POOLS.map((pool) => [pool.key, { key: pool.key, name: pool.name, long: 0, short: 0, pending: 0, activity: this.activity(pool) }]));
    for (const cohort of this.cohorts.values()) {
      const stats = pools[cohort.pool];
      if (cohort.state === "pending" || !cohort.position) {
        stats.pending += cohort.target - cohort.filled;
        if (cohort.trigger != null) row(cohort.trigger)[cohort.side > 0 ? "entryBuy" : "entrySell"] += cohort.target - cohort.filled;
        continue;
      }
      const lots = Math.abs(cohort.position);
      const long = cohort.position > 0;
      stats[long ? "long" : "short"] += lots;
      const liqRow = row(cohort.liq);
      liqRow[long ? "liqLong" : "liqShort"] += lots;
      liqRow.byPool[cohort.pool] = (liqRow.byPool[cohort.pool] ?? 0) + lots;
      let stop = cohort.stop;
      if (cohort.trail && cohort.best) {
        const trail = Math.round(cohort.best * (long ? 1 - cohort.trail : 1 + cohort.trail));
        stop = stop == null ? trail : long ? Math.max(stop, trail) : Math.min(stop, trail);
      }
      if (stop != null) row(stop)[long ? "stopLong" : "stopShort"] += lots;
      if (cohort.take != null) row(cohort.take)[long ? "takeLong" : "takeShort"] += lots;
    }
    return {
      regime: this.regime,
      sentiment: this.sentiment.value,
      fairValue: Math.round(this.fair.value),
      pools: Object.values(pools),
      levels: [...rows.values()].sort((a, b) => b.price - a.price),
    };
  }

  // Sum of every signed position: zero while the ledger balances.
  ledgerBalance() {
    let sum = 0;
    for (const account of this.accounts.values()) sum += account.position;
    return sum;
  }

  recountOpenInterest() {
    let sum = 0;
    for (const account of this.accounts.values()) sum += Math.max(0, account.position);
    return sum;
  }
}

export { PRICE_TICK };
