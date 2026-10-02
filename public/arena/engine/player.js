import { roundPrice } from "./book.js";
import { MAINTENANCE, notional, unrealized } from "./ledger.js";

export const LEVERAGES = [1, 3, 5, 10, 20];
export const DEFAULT_LEVERAGE = 3;
const MAKER_FEE = 0.0002;
const TAKER_FEE = 0.0005;
const MARKET_BAND = 0.1;
const PUSH_LOTS = 5000; // 50 BTC or more counts as a push for liquidation credit

// The sandbox player: unlimited wallet with no size cap, isolated margin per position and real
// liquidation. Leverage only sets the margin, and with it how far away the liquidation price sits.
// Equity is the running PnL (realized − fees + unrealized).
export class Player {
  constructor(sim) {
    this.sim = sim;
    this.account = sim.addAccount("player", "player");
    sim.player = this;
    this.leverage = DEFAULT_LEVERAGE;
    this.margin = 0;
    this.fees = 0;
    this.protection = { stop: null, take: null };
    this.orderIds = new Set();
    this.reduceOnly = new Set();
    // Orders placed while the market is paused wait here and go out during the next run.
    this.queue = [];
    this.nextId = 1;
    this.takerOrder = 0;
    this.exitIntent = false;
    this.push = null;
    this.events = [];
    this.fills = [];
    this.stats = { ignited: 0, liquidations: 0, marginLost: 0, volume: 0, peak: 0, maxDrawdown: 0 };
    this.equityPath = [{ time: sim.time, equity: 0 }];
  }

  get position() {
    return this.account.position;
  }

  equity(mark = this.sim.markPrice()) {
    return this.account.realized - this.fees + unrealized(this.account, mark);
  }

  liquidationPrice() {
    const { position, entry } = this.account;
    if (!position) return null;
    const lots = Math.abs(position);
    const price = position > 0
      ? (lots * entry - this.margin * 10000) / (lots * (1 - MAINTENANCE))
      : (lots * entry + this.margin * 10000) / (lots * (1 + MAINTENANCE));
    return price > 0 ? Math.round(price) : null;
  }

  orders() {
    const out = [];
    for (const id of this.orderIds) {
      const order = this.sim.book.orders.get(id);
      if (order && order.lots > 0) out.push(order);
      else {
        this.orderIds.delete(id);
        this.reduceOnly.delete(id);
      }
    }
    return out;
  }

  restingByPrice() {
    const map = new Map();
    for (const order of this.orders()) map.set(order.price, (map.get(order.price) ?? 0) + order.lots);
    return map;
  }

  validate(side, lots, reduceOnly) {
    if (side !== "buy" && side !== "sell") return "方向無效";
    if (!Number.isSafeInteger(lots) || lots <= 0) return "請輸入有效數量";
    if (reduceOnly) return null;
    if (this.exitIntent && this.account.position && side === (this.account.position > 0 ? "buy" : "sell")) return "平倉等待流動性，暫不能加倉";
    return null;
  }

  clampReduce(side, lots) {
    const position = this.account.position;
    if (!position || (position > 0) === (side === "buy")) return 0;
    return Math.min(lots, Math.abs(position));
  }

  // Applied by the market after the ledger moved; keeps isolated margin and fees.
  // orderId is the resting order for maker fills; taker fills belong to the order being sent.
  onFill(signed, price, taker, orderId = null) {
    const position = this.account.position;
    const old = position - signed;
    const lots = Math.abs(signed);
    const closing = old && Math.sign(old) !== Math.sign(signed) ? Math.min(Math.abs(old), lots) : 0;
    const opening = lots - closing;
    if (closing) this.margin *= 1 - closing / Math.abs(old);
    if (!position) this.margin = 0;
    if (opening) this.margin += notional(price, opening) / this.leverage;
    const fee = notional(price, lots) * (taker ? TAKER_FEE : MAKER_FEE);
    this.fees += fee;
    this.stats.volume += lots;
    this.fills.push({ time: this.sim.time, side: signed > 0 ? "buy" : "sell", lots, price, taker, order: taker ? `t${this.takerOrder}` : `o${orderId}` });
    if (this.fills.length > 400) this.fills.shift();
    if (!taker) this.events.push({ kind: "fill", side: signed > 0 ? "buy" : "sell", lots, price });
  }

  afterOwnOrder(matched, side) {
    const sim = this.sim;
    sim.maintain();
    if (matched >= PUSH_LOTS) this.push = { side, at: sim.time, until: sim.time + 3 };
    const wave = matched ? sim.resolveTriggers() : null;
    this.pruneReduceOnly();
    this.trackRisk();
    return wave;
  }

  submitMarket(side, lots, { reduceOnly = false } = {}) {
    if (reduceOnly) lots = this.clampReduce(side, lots);
    if (reduceOnly && !lots) return { ok: false, error: "只減倉：目前沒有可以減少的部位" };
    const error = this.validate(side, lots, reduceOnly);
    if (error) return { ok: false, error };
    const sim = this.sim;
    const before = sim.last;
    const promised = sim.book.preview(side, lots, side === "buy" ? sim.book.maxPrice : 1, "player");
    const bound = roundPrice(before * (side === "buy" ? 1 + MARKET_BAND : 1 - MARKET_BAND));
    this.takerOrder++;
    const arrival = sim.book.submit(side, bound, lots, { owner: "player", acct: "player", rest: false });
    const wave = this.afterOwnOrder(arrival.matched, side);
    const reach = arrival.lastPrice ?? before;
    const promisedMove = promised.worstPrice ? promised.worstPrice / before - 1 : 0;
    // Absorbed: the visible book promised a real move and the order stopped well short of it.
    const stalled = arrival.matched > 0 && Math.abs(promisedMove) >= 0.0015 && Math.abs(reach / before - 1) < Math.abs(promisedMove) * 0.75;
    const result = { ok: true, side, matched: arrival.matched, unfilled: arrival.unfilled, avgPrice: arrival.avgPrice, lastPrice: arrival.lastPrice, from: before, to: reach, promised: promised.worstPrice, stalled, impact: sim.last / before - 1, wave, reduceOnly };
    this.events.push({ kind: "push", ...result });
    return result;
  }

  submitLimit(side, price, lots, { reduceOnly = false } = {}) {
    if (!Number.isSafeInteger(price) || price <= 0) return { ok: false, error: "請輸入有效價格" };
    price = roundPrice(price);
    if (reduceOnly) lots = this.clampReduce(side, lots);
    if (reduceOnly && !lots) return { ok: false, error: "只減倉：目前沒有可以減少的部位" };
    const error = this.validate(side, lots, reduceOnly);
    if (error) return { ok: false, error };
    this.takerOrder++;
    const arrival = this.sim.book.submit(side, price, lots, { owner: "player", acct: "player" });
    if (arrival.resting) {
      this.orderIds.add(arrival.id);
      if (reduceOnly) this.reduceOnly.add(arrival.id);
    }
    const wave = this.afterOwnOrder(arrival.matched, side);
    const result = { ok: true, side, id: arrival.id, price, lots, matched: arrival.matched, resting: arrival.resting, avgPrice: arrival.avgPrice, wave };
    this.events.push({ kind: "placed", ...result });
    return result;
  }

  // Planning-phase orders: { type: "market" | "limit" | "close", side, lots, price, fraction, reduceOnly }.
  // They are checked now but sent during the first second of the next run, at random points among
  // everyone else's orders, so a paused book is never yours alone.
  enqueue(order) {
    if (order.type === "close") {
      if (!this.account.position) return { ok: false, error: "目前沒有持倉" };
    } else {
      if (order.type === "limit" && !(order.price > 0)) return { ok: false, error: "請輸入有效價格" };
      if (order.reduceOnly && !this.clampReduce(order.side, order.lots)) return { ok: false, error: "只減倉：目前沒有可以減少的部位" };
      const error = this.validate(order.side, order.lots, order.reduceOnly);
      if (error) return { ok: false, error };
    }
    const queued = { ...order, id: `q${this.nextId++}` };
    this.queue.push(queued);
    return { ok: true, queued: true, id: queued.id };
  }

  takeQueue() {
    const queue = this.queue;
    this.queue = [];
    return queue;
  }

  execute(order) {
    const result = order.type === "close"
      ? (order.fraction >= 1 ? this.close() : this.closePart(order.fraction))
      : order.type === "limit"
        ? this.submitLimit(order.side, order.price, order.lots, { reduceOnly: order.reduceOnly })
        : this.submitMarket(order.side, order.lots, { reduceOnly: order.reduceOnly });
    if (!result.ok) this.events.push({ kind: "rejected", error: result.error, order });
    return result;
  }

  cancel(id) {
    if (typeof id === "string") {
      const before = this.queue.length;
      this.queue = this.queue.filter((item) => item.id !== id);
      return this.queue.length < before;
    }
    if (!this.orderIds.has(id)) return false;
    this.orderIds.delete(id);
    this.reduceOnly.delete(id);
    return this.sim.book.cancel(id);
  }

  cancelAll() {
    let count = this.queue.length;
    this.queue = [];
    for (const order of this.orders()) count += this.cancel(order.id) ? 1 : 0;
    return count;
  }

  setLeverage(leverage) {
    if (!LEVERAGES.includes(leverage)) return "不支援這個槓桿倍數";
    if (this.account.position || this.queue.length || this.orders().some((order) => !this.reduceOnly.has(order.id))) return "空倉且沒有開倉委託時才能調整槓桿";
    this.leverage = leverage;
    return null;
  }

  setProtection(stop, take) {
    const position = this.account.position;
    if (!position) return "先建立部位再設定止損止盈";
    const mark = this.sim.markPrice();
    const long = position > 0;
    if (stop != null && (long ? stop >= mark : stop <= mark)) return "止損價須在目前價格的不利方向";
    if (take != null && (long ? take <= mark : take >= mark)) return "止盈價須在目前價格的有利方向";
    this.protection = { stop, take };
    return null;
  }

  close() {
    const position = this.account.position;
    if (!position) return { ok: false, error: "目前沒有持倉" };
    for (const order of this.orders()) if (this.reduceOnly.has(order.id)) this.cancel(order.id);
    const result = this.submitMarket(position > 0 ? "sell" : "buy", Math.abs(position), { reduceOnly: true });
    this.exitIntent = Boolean(this.account.position);
    return { ...result, pending: this.exitIntent };
  }

  closePart(fraction) {
    const position = Math.abs(this.account.position);
    if (!position) return { ok: false, error: "目前沒有持倉" };
    const lots = Math.max(1, Math.round(position * fraction));
    if (lots >= position) return this.close();
    return this.submitMarket(this.account.position > 0 ? "sell" : "buy", lots, { reduceOnly: true });
  }

  pruneReduceOnly() {
    const position = this.account.position;
    let room = Math.abs(position);
    const orders = this.orders().filter((order) => this.reduceOnly.has(order.id)).sort((a, b) => a.id - b.id);
    for (const order of orders) {
      const opposite = position && (position > 0) !== (order.side === "buy");
      if (!opposite || room <= 0) { this.cancel(order.id); continue; }
      if (order.lots > room) this.sim.book.reduce(order.id, order.lots - room);
      room -= Math.min(room, order.lots);
    }
  }

  trackRisk() {
    const equity = this.equity();
    this.stats.peak = Math.max(this.stats.peak, equity);
    this.stats.maxDrawdown = Math.max(this.stats.maxDrawdown, this.stats.peak - equity);
  }

  // Isolated margin: the mark crossing the liquidation price closes the position at market. The
  // loss is capped at the position margin; the insurance fund takes anything the book cannot.
  checkLiquidation(mark) {
    const liq = this.liquidationPrice();
    if (!liq) return;
    const long = this.account.position > 0;
    if (long ? mark > liq : mark < liq) return;
    const sim = this.sim;
    const lots = Math.abs(this.account.position);
    const margin = this.margin;
    const before = this.account.realized - this.fees;
    this.cancelAll();
    this.protection = { stop: null, take: null };
    this.exitIntent = false;
    const side = long ? "sell" : "buy";
    this.takerOrder++;
    sim.book.submit(side, roundPrice(sim.last * (long ? 1 - MARKET_BAND : 1 + MARKET_BAND)), lots, { owner: "player", acct: "player", rest: false });
    if (this.account.position) {
      sim.settleAgainst(this.account, sim.insurance, liq);
      this.margin = 0;
    }
    const lost = before - (this.account.realized - this.fees);
    if (lost > margin) this.account.realized += lost - margin;
    const charged = Math.min(lost, margin);
    this.stats.liquidations++;
    this.stats.marginLost += charged;
    this.events.push({ kind: "liquidation", side: long ? "long" : "short", lots, price: liq, lost: charged });
    sim.maintain();
  }

  onTick() {
    const sim = this.sim;
    if (this.push && sim.time > this.push.until) this.push = null;
    const mark = sim.markPrice();
    this.checkLiquidation(mark);
    if (this.exitIntent) this.close();
    const position = this.account.position;
    if (!position) this.protection = { stop: null, take: null };
    const { stop, take } = this.protection;
    if (position && (stop != null || take != null)) {
      const long = position > 0;
      const stopHit = stop != null && (long ? mark <= stop : mark >= stop);
      const takeHit = take != null && (long ? mark >= take : mark <= take);
      if (stopHit || takeHit) {
        this.protection = { stop: null, take: null };
        this.events.push({ kind: stopHit ? "stop" : "take", price: mark });
        this.close();
      }
    }
    this.pruneReduceOnly();
    this.trackRisk();
    if (sim.time % 10 === 0) {
      this.equityPath.push({ time: sim.time, equity: this.equity(mark) });
      if (this.equityPath.length > 5000) this.equityPath.shift();
    }
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
