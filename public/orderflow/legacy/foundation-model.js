import { Market } from "../engine.js";

// One candle, one small book. All prices come from actual engine fills,
// including the opening trade; camera movement never changes market state.
export function candleFromTrades(trades) {
  if (!trades.length) return null;
  return {
    open: trades[0].price,
    high: Math.max(...trades.map((trade) => trade.price)),
    low: Math.min(...trades.map((trade) => trade.price)),
    close: trades.at(-1).price,
    volume: trades.reduce((sum, trade) => sum + trade.size, 0),
  };
}

export class FoundationLesson {
  constructor() {
    this.market = new Market();
    this.market.orders = [];
    this.market.trades = [];
    this.market.history = [];
    this.market.events = [];
    this.market.time = 0;
    this.market.add("sell", 100, 1);
    this.market.execute({ side: "buy", size: 1, own: false });
    this.market.add("sell", 110, 1);
    this.market.add("buy", 99, 1);
    this.step = 0;
  }

  advance() {
    if (this.step >= 6) return this.snapshot();
    if (this.step === 0)
      this.market.execute({ side: "sell", type: "limit", price: 101, size: 1 });
    if (this.step === 1 || this.step === 2)
      this.market.execute({ side: "buy", size: 1 });
    if (this.step === 4) this.market.execute({ side: "sell", size: 1 });
    this.step++;
    return this.snapshot();
  }

  snapshot() {
    return {
      step: this.step,
      price: this.market.price,
      asks: this.market.book("sell"),
      bids: this.market.book("buy"),
      trades: this.market.trades.map((trade) => ({ ...trade })),
      candle: candleFromTrades(this.market.trades),
    };
  }
}
