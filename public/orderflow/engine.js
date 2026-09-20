export const round = (n, d = 6) => Number(n.toFixed(d));
export function aggregate(trades, tick = 5) {
  const map = new Map();
  for (const t of trades) {
    const p = round(Math.floor(t.price / tick) * tick, 2);
    const row = map.get(p) || { price: p, buy: 0, sell: 0, volume: 0 };
    row[t.side === "buy" ? "buy" : "sell"] += t.size;
    row.volume += t.size;
    map.set(p, row);
  }
  return [...map.values()].sort((a, b) => b.price - a.price);
}
export function metrics(trades) {
  let buy = 0,
    sell = 0,
    value = 0;
  for (const t of trades) {
    if (t.side === "buy") buy += t.size;
    else sell += t.size;
    value += t.price * t.size;
  }
  const volume = buy + sell;
  return {
    buy,
    sell,
    volume,
    cvd: round(buy - sell),
    vwap: volume ? value / volume : null,
  };
}
export class Market {
  constructor(seed = 7) {
    this.seed = seed;
    this.orders = [];
    this.trades = [];
    this.history = [];
    this.events = [];
    this.oi = 32000;
    this.price = 68420;
    this.id = 0;
    this.time = 0;
    this.lastDelta = 0;
    this.funding = 0.0001;
    this.index = 68415;
    this.mark = 68420;
    for (let i = 0; i < 20; i++) {
      this.add("buy", 68415 - i * 5, round(0.8 + this.random() * 4), false);
      this.add("sell", 68420 + i * 5, round(0.8 + this.random() * 4), false);
    }
    this.sample();
  }
  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  add(side, price, size, own = false, peak = 0) {
    const order = {
      id: ++this.id,
      side,
      price,
      remaining: size,
      visible: peak ? Math.min(peak, size) : size,
      peak,
      own,
      priority: this.id,
    };
    this.orders.push(order);
    return order;
  }
  book(side) {
    const map = new Map();
    for (const o of this.orders.filter(
      (o) => o.side === side && o.remaining > 1e-8,
    )) {
      const r = map.get(o.price) || {
        price: o.price,
        size: 0,
        own: 0,
        hidden: 0,
      };
      r.size += o.visible;
      r.hidden += o.remaining - o.visible;
      if (o.own) r.own += o.visible;
      map.set(o.price, r);
    }
    return [...map.values()].sort((a, b) =>
      side === "buy" ? b.price - a.price : a.price - b.price,
    );
  }
  execute({
    side,
    size,
    type = "market",
    price,
    peak = 0,
    own = true,
    disposition = "transfer",
  }) {
    if (
      !["buy", "sell"].includes(side) ||
      !["market", "limit", "iceberg"].includes(type) ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > 100
    )
      throw Error("數量需介於 0 與 100 之間。");
    if (type !== "market" && (!Number.isFinite(price) || price <= 0))
      throw Error("請輸入有效的限價。");
    if (
      type === "iceberg" &&
      (!Number.isFinite(peak) || peak <= 0 || peak > size)
    )
      throw Error("冰山顯示量需大於 0，且不超過總量。");
    let remaining = size,
      fills = [],
      replenished = 0;
    while (remaining > 1e-8) {
      const queue = this.orders
        .filter((o) => o.side !== side && o.remaining > 1e-8)
        .sort(
          (a, b) =>
            (side === "buy" ? a.price - b.price : b.price - a.price) ||
            a.priority - b.priority,
        );
      const maker = queue[0];
      if (
        !maker ||
        (type !== "market" &&
          (side === "buy" ? maker.price > price : maker.price < price))
      )
        break;
      const qty = round(Math.min(remaining, maker.visible));
      if (!qty) break;
      remaining = round(remaining - qty);
      maker.remaining = round(maker.remaining - qty);
      maker.visible = round(maker.visible - qty);
      const fill = {
        id: ++this.id,
        side,
        price: maker.price,
        size: qty,
        time: ++this.time,
        own,
        makerOwn: maker.own,
      };
      fills.push(fill);
      this.trades.push(fill);
      this.price = maker.price;
      if (maker.remaining > 1e-8 && maker.visible <= 1e-8) {
        maker.visible = Math.min(
          maker.peak || maker.remaining,
          maker.remaining,
        );
        maker.priority = ++this.id;
        replenished++;
      }
    }
    const filled = round(size - remaining);
    if (disposition === "open") this.oi += filled;
    if (disposition === "close") this.oi = Math.max(0, this.oi - filled);
    this.lastDelta = (side === "buy" ? 1 : -1) * filled;
    let resting = null;
    if (type !== "market" && remaining > 1e-8)
      resting = this.add(
        side,
        price,
        remaining,
        own,
        type === "iceberg" ? peak : 0,
      );
    const avg = filled
      ? fills.reduce((s, t) => s + t.price * t.size, 0) / filled
      : null;
    this.orders = this.orders.filter((o) => o.remaining > 1e-8);
    const event = {
      id: ++this.id,
      text: `${side === "buy" ? "買入" : "賣出"} ${size} BTC · 成交 ${round(filled, 3)}${resting ? ` · 掛入 ${round(remaining, 3)}` : remaining > 0 ? ` · 未成交 ${round(remaining, 3)}` : ""}${replenished ? ` · 冰山補量 ${replenished} 次` : ""}`,
      side,
      avg,
      filled,
      replenished,
    };
    this.events.unshift(event);
    this.events.length = Math.min(this.events.length, 40);
    this.sample();
    return { filled, remaining, avg, fills, resting, replenished };
  }
  cancel(id) {
    const o = this.orders.find((o) => o.id === id && o.own);
    if (!o) return false;
    this.orders = this.orders.filter((x) => x !== o);
    this.lastDelta = 0;
    this.events.unshift({
      id: ++this.id,
      text: `撤銷 ${o.price.toFixed(1)} 的 ${round(o.remaining, 3)} BTC 掛單 · CVD 不變`,
      side: o.side,
    });
    this.sample();
    return true;
  }
  sample() {
    const m = metrics(this.trades);
    this.history.push({
      time: this.time,
      price: this.price,
      cvd: m.cvd,
      oi: this.oi,
      volume: m.volume,
      bids: this.book("buy").slice(0, 12),
      asks: this.book("sell").slice(0, 12),
    });
    if (this.history.length > 120) this.history.shift();
  }
  frame() {
    const m = metrics(this.trades),
      bids = this.book("buy"),
      asks = this.book("sell");
    const bid = bids.slice(0, 10).reduce((s, r) => s + r.size, 0),
      ask = asks.slice(0, 10).reduce((s, r) => s + r.size, 0);
    return {
      ...m,
      price: this.price,
      oi: this.oi,
      bids,
      asks,
      trades: this.trades.slice(-600),
      profile: aggregate(this.trades),
      history: this.history,
      events: this.events,
      delta: this.lastDelta,
      funding: this.funding,
      index: this.index,
      mark: this.mark,
      imbalance: bid + ask ? (bid - ask) / (bid + ask) : 0,
      source: "合成教學",
      unit: "BTC",
      time: this.time,
      ownOrders: this.orders.filter((o) => o.own),
    };
  }
}
export function lessonMarket(kind = "matching") {
  const m = new Market();
  // A reproducible, explicitly synthetic prelude gives the shared chart context.
  for (let i = 0; i < 26; i++) {
    const side = i < 10 ? "sell" : i < 18 ? "buy" : i % 3 ? "buy" : "sell";
    m.execute({
      side,
      size: round(0.15 + m.random() * 0.8, 3),
      own: false,
      disposition: i % 3 ? "open" : "close",
    });
  }
  m.events = [];
  m.lastDelta = 0;
  if (["iceberg", "absorption"].includes(kind)) {
    const p = m.book("sell")[0].price;
    m.orders = m.orders.filter((o) => o.side !== "sell" || o.price !== p);
    m.add("sell", p, 24, false, 1.5);
  }
  if (kind === "slippage")
    for (const o of m.orders) {
      o.remaining *= 0.22;
      o.visible *= 0.22;
    }
  if (kind === "wall") m.add("sell", m.book("sell")[2].price, 30, true);
  if (kind === "heatmap") {
    m.add("sell", m.book("sell")[2].price, 30, true);
    for (let i = 0; i < 8; i++) m.sample();
  }
  m.sample();
  return m;
}
export class PaperAccount {
  constructor() {
    this.position = 0;
    this.entry = 0;
    this.realized = 0;
    this.fees = 0;
    this.fills = [];
  }
  trade(side, size, frame) {
    if (
      !["buy", "sell"].includes(side) ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > 1
    )
      throw Error("紙上交易數量需介於 0 與 1 之間。");
    const levels = side === "buy" ? frame.asks : frame.bids;
    let left = size,
      value = 0;
    for (const r of levels) {
      const qty = Math.min(left, r.size);
      value += qty * r.price;
      left -= qty;
      if (left < 1e-8) break;
    }
    const filled = size - left;
    if (filled < 1e-8) throw Error("目前沒有可用深度。");
    const avg = value / filled,
      signed = side === "buy" ? filled : -filled,
      old = this.position;
    if (!old || Math.sign(old) === Math.sign(signed))
      this.entry =
        (Math.abs(old) * this.entry + value) / (Math.abs(old) + filled);
    else {
      this.realized +=
        Math.min(Math.abs(old), filled) * (avg - this.entry) * Math.sign(old);
      if (filled > Math.abs(old)) this.entry = avg;
    }
    this.position = round(old + signed);
    if (!this.position) this.entry = 0;
    const fee = value * 0.00055;
    this.fees += fee;
    const fill = { side, size: filled, avg, fee };
    this.fills.unshift(fill);
    return fill;
  }
  pnl(price) {
    return {
      unrealized: this.position * (price - this.entry),
      net: this.realized + this.position * (price - this.entry) - this.fees,
    };
  }
}
export function scenarioFrames(kind) {
  const m = lessonMarket(
    kind === "absorb"
      ? "absorption"
      : kind === "vacuum"
        ? "slippage"
        : "matching",
  );
  const frames = [structuredClone(m.frame())];
  for (let i = 0; i < 16; i++) {
    const side =
      kind === "absorb"
        ? i < 7
          ? "buy"
          : "sell"
        : kind === "vacuum"
          ? "buy"
          : i < 6
            ? "buy"
            : "sell";
    m.execute({
      side,
      size: kind === "vacuum" ? 0.65 : i < 7 ? 2 : 3.1,
      own: false,
      disposition: i < 7 ? "open" : "close",
    });
    frames.push(structuredClone(m.frame()));
  }
  return frames;
}
