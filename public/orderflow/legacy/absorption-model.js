import { Market, metrics, round } from "../engine.js";
import { candleFromTrades } from "./foundation-model.js";

export const BASE_PRICE = 68420;
export const CHAPTER_ENDS = [0, 5200, 10000, 14000, 18000];
export const STORY_DURATION = 18000;
export const CANDLE_INTERVAL = 3000;

// Aggregate only executions already present in the snapshot. The price anchor
// belongs to the first candle but contributes no story trading volume.
export function candlesFromTrades(trades) {
  const candles = [
    {
      start: 0,
      open: BASE_PRICE,
      high: BASE_PRICE,
      low: BASE_PRICE,
      close: BASE_PRICE,
      volume: 0,
    },
  ];
  for (const trade of trades) {
    const start = Math.floor(trade.at / CANDLE_INTERVAL) * CANDLE_INTERVAL;
    let candle = candles.at(-1);
    if (candle.start !== start) {
      candle = {
        start,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: 0,
      };
      candles.push(candle);
    }
    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;
    candle.volume = round(candle.volume + trade.size);
  }
  return candles;
}

// Authored public order-book updates and executions, not a historical feed.
// New limit orders arrive between trades. No hidden reserves or maker identity.
export function createAbsorptionStory() {
  const market = new Market();
  Object.assign(market, {
    orders: [],
    trades: [],
    history: [],
    events: [],
    time: 0,
    oi: 0,
  });
  market.add("sell", BASE_PRICE, 0.01);
  market.execute({ side: "buy", size: 0.01, own: false });
  for (const [offset, size] of [
    [0.5, 2.8],
    [1, 1.2],
    [1.5, 1.7],
    [2, 0.8],
    [2.5, 1.8],
    [3, 2.4],
  ])
    market.add("sell", BASE_PRICE + offset, size);
  for (const [offset, size] of [
    [0, 3.5],
    [-0.5, 2.6],
    [-1, 4.1],
  ])
    market.add("buy", BASE_PRICE + offset, size);

  const trades = [];
  const events = [];
  function snapshot() {
    const totals = metrics(trades);
    const book = (side) =>
      market
        .book(side)
        .map(({ price, size }) => ({ price, size: round(size) }));
    return {
      price: market.price,
      asks: book("sell"),
      bids: book("buy"),
      trades: trades.map((trade) => ({ ...trade })),
      candle: candleFromTrades(market.trades),
      candles: candlesFromTrades(trades),
      cvd: round(totals.cvd),
      buy: round(totals.buy),
      sell: round(totals.sell),
      volume: round(totals.volume),
    };
  }
  const frames = [{ at: 0, state: snapshot() }];
  const buy = (at, size) => ({ at, kind: "trade", side: "buy", size });
  const sell = (at, size) => ({ at, kind: "trade", side: "sell", size });
  const ask = (at, size) => ({
    at,
    kind: "add",
    side: "sell",
    price: BASE_PRICE + 0.5,
    size,
  });
  const bid = (at, offset, size) => ({
    at,
    kind: "add",
    side: "buy",
    price: BASE_PRICE + offset,
    size,
  });
  const schedule = [
    buy(700, 0.65),
    ask(1040, 0.55),
    buy(1400, 1.1),
    ask(1660, 0.8),
    sell(2150, 0.25),
    buy(2500, 0.9),
    bid(2670, 0, 0.2),
    ask(2880, 1.05),
    buy(3450, 1.3),
    ask(3730, 1),
    buy(4020, 0.45),
    ask(4320, 0.9),
    buy(4700, 0.8),
    ask(4950, 0.5),
    buy(5480, 0.7),
    ask(5680, 0.6),
    buy(5980, 1.2),
    ask(6350, 1.3),
    sell(6600, 0.35),
    buy(7000, 1.05),
    ask(7180, 0.85),
    buy(7480, 0.9),
    ask(7760, 1),
    buy(8140, 1.35),
    ask(8300, 1.15),
    buy(8700, 0.6),
    ask(8930, 0.9),
    buy(9300, 0.85),
    ask(9630, 0.85),
    buy(10400, 0.55),
    sell(11180, 0.2),
    buy(11720, 0.7),
    buy(12660, 0.5),
    buy(13560, 0.35),
    buy(14550, 1.1),
    buy(15350, 1.3),
    bid(15900, 0.5, 0.6),
    buy(16180, 1.1),
    bid(16680, 1, 0.5),
    buy(16950, 1.2),
    bid(17400, 1.5, 0.8),
    buy(17600, 0.6),
  ];
  schedule.forEach((operation, order) => {
    if (operation.kind === "add") {
      market.add(operation.side, operation.price, operation.size);
      events.push({ ...operation, id: "add-" + order });
      frames.push({ at: operation.at, state: snapshot() });
      return;
    }
    let remaining = operation.size;
    let slice = 0;
    while (remaining > 0) {
      const maker = market.book(operation.side === "buy" ? "sell" : "buy")[0];
      if (!maker) throw new Error("Insufficient authored depth");
      const result = market.execute({
        side: operation.side,
        size: Math.min(remaining, maker.size),
        own: false,
      });
      if (!result.filled) throw new Error("Expected an execution");
      const at = operation.at + slice++ * 28;
      for (const fill of result.fills) {
        const trade = {
          id: "trade-" + trades.length,
          at,
          side: fill.side,
          price: fill.price,
          size: fill.size,
        };
        trades.push(trade);
        events.push({ ...trade, kind: "trade", order });
      }
      frames.push({ at, state: snapshot() });
      remaining = round(remaining - result.filled);
    }
  });
  return { frames, events, duration: STORY_DURATION };
}

export function snapshotAt(story, time) {
  const at = Number.isFinite(time)
    ? Math.max(0, Math.min(time, story.duration))
    : 0;
  let low = 0;
  let high = story.frames.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (story.frames[middle].at <= at) low = middle;
    else high = middle - 1;
  }
  return structuredClone(story.frames[low].state);
}
