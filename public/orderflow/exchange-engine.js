// All balances are integers: price = cents, size = 0.01 BEAR,
// cash = 0.0001 USDT. No wall clock or random source belongs in this module.
export const RULES = Object.freeze({
  version: 1,
  priceScale: 100,
  sizeScale: 100,
  cashScale: 10000,
  makerFeeBps: 2,
  takerFeeBps: 5,
  maxPrice: 100000000,
  maxSize: 100000000,
  maxNotional: 10000000000000,
  maxPlayerOrders: 100,
});
export const fee = (value, bps) => Math.ceil((value * bps) / 10000);
export const reservePerLot = (price) => price + fee(price, RULES.takerFeeBps);
const copy = (value) => structuredClone(value);

export class SpotExchange {
  constructor() {
    this.time = 0;
    this.sequence = 0;
    this.accounts = {};
    this.orders = [];
    this.trades = [];
    this.playerOrders = [];
    this.playerTrades = [];
    this.lastPrice = 10000;
    this.fees = 0;
    this.volume = 0;
    this.turnover = 0;
  }

  addAccount(id, cash, base) {
    if (
      this.accounts[id] ||
      !Number.isSafeInteger(cash) ||
      cash < 0 ||
      !Number.isSafeInteger(base) ||
      base < 0
    )
      throw Error("Invalid account");
    this.accounts[id] = { cash, base };
  }

  available(id) {
    const account = this.accounts[id];
    if (!account) throw Error("Unknown account");
    let cash = account.cash,
      base = account.base;
    for (const order of this.orders)
      if (order.owner === id) {
        if (order.side === "buy")
          cash -= reservePerLot(order.price) * order.remaining;
        else base -= order.remaining;
      }
    return {
      cash,
      base,
      lockedCash: account.cash - cash,
      lockedBase: account.base - base,
    };
  }

  book(side) {
    return this.orders
      .filter((o) => o.side === side && o.remaining > 0)
      .sort(
        (a, b) =>
          (side === "buy" ? b.price - a.price : a.price - b.price) ||
          a.id - b.id,
      );
  }

  levels(side, limit = Infinity) {
    const result = [];
    for (const order of this.book(side)) {
      let row = result[result.length - 1];
      if (!row || row.price !== order.price) {
        if (result.length >= limit) break;
        row = { price: order.price, size: 0, own: 0, count: 0 };
        result.push(row);
      }
      row.size += order.remaining;
      row.count++;
      if (order.owner === "player") row.own += order.remaining;
    }
    return result;
  }

  cancel(id, owner) {
    const index = this.orders.findIndex(
      (o) => o.id === id && o.owner === owner,
    );
    if (index === -1) return false;
    const [order] = this.orders.splice(index, 1);
    this.updateRecord(order, "cancelled", "已撤單");
    return true;
  }

  cancelAll(owner) {
    const ids = this.orders.filter((o) => o.owner === owner).map((o) => o.id);
    for (const id of ids) this.cancel(id, owner);
    return ids.length;
  }

  expire() {
    for (const order of [...this.orders]) {
      if (order.expires != null && order.expires <= this.time)
        this.cancel(order.id, order.owner);
    }
  }

  updateRecord(order, status, reason = "") {
    if (order.owner !== "player") return;
    const record = this.playerOrders.find((o) => o.id === order.id);
    if (record)
      Object.assign(record, {
        remaining: order.remaining,
        filled: order.size - order.remaining,
        value: order.value,
        fee: order.fee,
        status,
        reason,
        updated: this.time,
      });
  }

  validate(owner, command) {
    const { side, type, size, price } = command;
    if (!this.accounts[owner]) return "帳戶不存在";
    if (!["buy", "sell"].includes(side) || !["limit", "market"].includes(type))
      return "無效的委託類型";
    if (!Number.isSafeInteger(size) || size <= 0 || size > RULES.maxSize)
      return "數量需為 0.01 的倍數，且不超過 1,000,000 BEAR";
    if (
      type === "limit" &&
      (!Number.isSafeInteger(price) ||
        price <= 0 ||
        price > RULES.maxPrice ||
        price * size > RULES.maxNotional)
    )
      return "價格需介於 0.01 與 1,000,000 USDT，且委託金額不可超出上限";
    const available = this.available(owner);
    if (side === "sell" && size > available.base) return "可用 BEAR 不足";
    if (
      side === "buy" &&
      type === "limit" &&
      reservePerLot(price) * size > available.cash
    )
      return "可用 USDT 不足（含預留手續費）";
    if (side === "buy" && type === "market" && available.cash <= 0)
      return "可用 USDT 不足";
    if (
      owner === "player" &&
      type === "limit" &&
      this.orders.filter((o) => o.owner === owner).length >=
        RULES.maxPlayerOrders
    )
      return "最多同時保留 100 筆掛單";
    return null;
  }

  submit(owner, command) {
    const error = this.validate(owner, command);
    if (error) return { ok: false, error };
    const order = {
      id: ++this.sequence,
      owner,
      side: command.side,
      type: command.type,
      price: command.type === "limit" ? command.price : null,
      size: command.size,
      remaining: command.size,
      value: 0,
      fee: 0,
      time: this.time,
      expires: command.expires ?? null,
    };
    if (owner === "player")
      this.playerOrders.unshift({
        ...order,
        status: "open",
        filled: 0,
        reason: "",
        updated: this.time,
      });
    let reason = "";
    const makers = this.book(order.side === "buy" ? "sell" : "buy");
    for (const maker of makers) {
      if (!order.remaining) break;
      if (
        order.type === "limit" &&
        (order.side === "buy"
          ? maker.price > order.price
          : maker.price < order.price)
      )
        break;
      // Cancel the incoming remainder at the first self-cross. Never trade with yourself.
      if (maker.owner === owner) {
        reason = "自成交保護：剩餘委託已取消";
        break;
      }
      let size = Math.min(order.remaining, maker.remaining);
      if (order.side === "buy") {
        const cash = this.available(owner).cash;
        let affordable = Math.max(
          0,
          Math.floor(cash / (maker.price * (1 + RULES.takerFeeBps / 10000))),
        );
        while (
          affordable > 0 &&
          affordable * maker.price +
            fee(affordable * maker.price, RULES.takerFeeBps) >
            cash
        )
          affordable--;
        size = Math.min(size, affordable);
        if (!size) {
          reason = "可用 USDT 已用盡，剩餘委託已取消";
          break;
        }
      }
      const value = size * maker.price;
      const takerFee = fee(value, RULES.takerFeeBps);
      const makerFee = fee(value, RULES.makerFeeBps);
      const buyer = this.accounts[order.side === "buy" ? owner : maker.owner];
      const seller = this.accounts[order.side === "sell" ? owner : maker.owner];
      buyer.cash -= value + (order.side === "buy" ? takerFee : makerFee);
      buyer.base += size;
      seller.cash += value - (order.side === "sell" ? takerFee : makerFee);
      seller.base -= size;
      this.fees += takerFee + makerFee;
      order.remaining -= size;
      order.value += value;
      order.fee += takerFee;
      maker.remaining -= size;
      maker.value += value;
      maker.fee += makerFee;
      this.lastPrice = maker.price;
      this.volume += size;
      this.turnover += value;
      const trade = {
        id: ++this.sequence,
        time: this.time,
        price: maker.price,
        size,
        side: order.side,
        maker: maker.owner,
        taker: owner,
        makerOrder: maker.id,
        takerOrder: order.id,
        makerFee,
        takerFee,
      };
      this.trades.push(trade);
      if (trade.maker === "player" || trade.taker === "player")
        this.playerTrades.push({ ...trade });
      this.updateRecord(maker, maker.remaining ? "partial" : "filled");
    }
    this.orders = this.orders.filter((o) => o.remaining > 0);
    let status;
    if (!order.remaining) status = "filled";
    else if (order.type === "limit" && !reason) {
      this.orders.push(order);
      status = order.remaining === order.size ? "open" : "partial";
    } else {
      status = "cancelled";
      reason ||= "對手掛單不足，剩餘委託已取消";
    }
    this.updateRecord(order, status, reason);
    if (this.trades.length > 2000)
      this.trades.splice(0, this.trades.length - 2000);
    return {
      ok: true,
      ...copy(order),
      status,
      reason,
      filled: order.size - order.remaining,
    };
  }

  quote(side, size, owner = "player") {
    let remaining = size,
      value = 0,
      fees = 0;
    let cash = this.available(owner).cash;
    if (side === "sell") remaining = Math.min(size, this.available(owner).base);
    const desired = remaining;
    for (const maker of this.book(side === "buy" ? "sell" : "buy")) {
      if (maker.owner === owner || remaining <= 0) break;
      let take = Math.min(remaining, maker.remaining);
      if (side === "buy") {
        take = Math.min(
          take,
          Math.max(
            0,
            Math.floor(cash / (maker.price * (1 + RULES.takerFeeBps / 10000))),
          ),
        );
        while (
          take > 0 &&
          take * maker.price + fee(take * maker.price, RULES.takerFeeBps) > cash
        )
          take--;
      }
      if (!take) break;
      const amount = take * maker.price,
        cost = fee(amount, RULES.takerFeeBps);
      value += amount;
      fees += cost;
      cash -= amount + cost;
      remaining -= take;
    }
    return {
      filled: desired - remaining,
      remaining: size - (desired - remaining),
      value,
      fee: fees,
    };
  }

  snapshot() {
    return copy({
      time: this.time,
      sequence: this.sequence,
      accounts: this.accounts,
      orders: this.orders,
      trades: this.trades,
      playerOrders: this.playerOrders,
      playerTrades: this.playerTrades,
      lastPrice: this.lastPrice,
      fees: this.fees,
      volume: this.volume,
      turnover: this.turnover,
    });
  }

  restore(state) {
    Object.assign(this, copy(state));
  }
}
