import { Market, metrics, aggregate, round } from "./engine.js";
import {
  BASE_PRICE,
  createAbsorptionStory,
  candlesFromTrades,
} from "./absorption-model.js";
export { snapshotAt } from "./absorption-model.js";

export const JOURNEY_DURATION = 80000;
const p = (offset) => BASE_PRICE + offset;
const buy = (at, size, disposition = "transfer") => ({
  at,
  kind: "trade",
  side: "buy",
  size,
  disposition,
});
const sell = (at, size, disposition = "transfer", liquidation = false) => ({
  at,
  kind: "trade",
  side: "sell",
  size,
  disposition,
  liquidation,
});
const add = (at, side, offset, size) => ({
  at,
  kind: "add",
  side,
  price: p(offset),
  size,
});
const ticker = (at, values) => ({ at, kind: "ticker", ...values });
const extras = [
  // A visible wall builds while trades keep arriving, then disappears without a fill.
  add(18400, "sell", 2.5, 8),
  buy(19000, 0.7),
  sell(19700, 0.2),
  add(20400, "sell", 2.5, 2),
  buy(21000, 1.2),
  sell(21600, 0.15),
  buy(21850, 0.25),
  { at: 23000, kind: "remove", side: "sell", price: p(2.5) },
  add(23200, "sell", 3.5, 0.7),
  add(23600, "sell", 4, 0.8),
  add(24000, "sell", 5, 3),
  add(24200, "sell", 5.5, 2.5),
  add(24400, "buy", 2.5, 0.5),
  buy(25600, 1.2),
  sell(26200, 0.2),
  buy(26800, 0.9),
  buy(27400, 1.1),
  add(28500, "buy", 3.5, 0.9),
  buy(29000, 0.8),
  sell(30000, 0.4),
  buy(30700, 0.6),
  add(31400, "buy", 4, 0.7),
  buy(31800, 0.3),
  // The very same tape progressively becomes footprint, profile and VWAP.
  add(32400, "sell", 4.5, 1.6),
  buy(33000, 0.8),
  sell(33800, 0.35),
  buy(34500, 0.5),
  buy(35400, 0.6),
  add(36200, "buy", 4.5, 1.2),
  sell(37000, 0.4),
  buy(37700, 1.4),
  add(38300, "sell", 5, 1.1),
  sell(39200, 0.3),
  buy(39900, 0.8),
  add(40600, "sell", 5, 0.9),
  buy(41200, 0.7),
  sell(41700, 0.2),
  buy(42500, 0.5),
  add(43300, "buy", 4.5, 0.8),
  sell(44000, 0.4),
  buy(44800, 0.3),
  add(45200, "sell", 5, 0.9),
  buy(45600, 0.35),
  // OI is a separate public aggregate, never an inferred identity from a fill.
  buy(46600, 0.2, "open"),
  add(47200, "sell", 5, 0.8),
  buy(47800, 0.65, "open"),
  sell(49200, 0.3, "open"),
  buy(50500, 0.3),
  sell(51200, 0.2),
  add(52000, "sell", 5, 0.7),
  buy(53000, 0.4),
  ticker(54400, { rate: 0.0001, index: p(4), mark: p(4.8) }),
  buy(55000, 0.25),
  sell(56000, 0.1),
  ticker(57200, { mark: p(4.6), index: p(4.3) }),
  buy(57700, 0.2),
  { at: 58500, kind: "settlement", nominal: 10000 },
  add(58800, "sell", 5, 0.8),
  buy(59000, 0.2),
  sell(60200, 0.15),
  buy(60800, 0.25),
  add(61400, "buy", 4.5, 0.5),
  // Mark updates and public liquidation reports are distinct from executions.
  sell(62400, 0.45),
  ticker(63200, { mark: p(4.2), index: p(4.1) }),
  sell(64000, 0.2),
  ticker(65000, { mark: p(3.8), index: p(3.9) }),
  buy(65400, 0.1),
  sell(66400, 0.5, "close", true),
  ticker(67500, { mark: p(3), index: p(3.2) }),
  sell(68000, 0.8, "close", true),
  ticker(69400, { mark: p(1.6), index: p(2) }),
  sell(70600, 1, "close", true),
  ticker(71200, { mark: p(0.7), index: p(1) }),
  add(72000, "buy", 0, 1.6),
  add(72100, "sell", 1, 1.4),
  sell(72800, 0.9),
  add(73400, "buy", 0, 2),
  buy(74000, 0.3),
  sell(74600, 0.4),
  sell(75600, 0.7),
  add(76200, "buy", 0, 1.1),
  buy(77000, 0.5),
  sell(77800, 0.3),
  buy(78400, 0.3),
  sell(79000, 0.25),
  ticker(79500, { mark: p(0.3), index: p(0.4) }),
  buy(79700, 0.15),
];

export function createJourneyStory() {
  const original = createAbsorptionStory();
  const initialTicker = {
    oi: 1200,
    mark: BASE_PRICE,
    index: BASE_PRICE,
    rate: null,
    settlement: null,
    liquidations: [],
  };
  const enrich = (state, fields) => ({
    ...state,
    ...structuredClone(fields),
    vwap: metrics(state.trades).vwap,
    profile: aggregate(state.trades, 0.5).map((row) => ({
      ...row,
      buy: round(row.buy),
      sell: round(row.sell),
      volume: round(row.volume),
    })),
  });
  const frames = original.frames.map((frame) => ({
    at: frame.at,
    state: enrich(frame.state, initialTicker),
  }));
  const events = original.events.map((event) => ({ ...event }));
  const before = frames.at(-1).state;
  const market = new Market();
  Object.assign(market, {
    orders: [],
    trades: [],
    history: [],
    events: [],
    time: 0,
    oi: 1200,
    price: before.price,
  });
  for (const [side, rows] of [
    ["sell", before.asks],
    ["buy", before.bids],
  ])
    for (const row of rows) market.add(side, row.price, row.size, true);
  const trades = before.trades.map((trade) => ({ ...trade }));
  const fields = structuredClone(initialTicker);
  function snapshot(at) {
    const totals = metrics(trades);
    fields.oi = round(market.oi);
    const prices = [BASE_PRICE, ...trades.map((trade) => trade.price)];
    const state = enrich(
      {
        price: market.price,
        asks: market
          .book("sell")
          .map(({ price, size }) => ({ price, size: round(size) })),
        bids: market
          .book("buy")
          .map(({ price, size }) => ({ price, size: round(size) })),
        trades: trades.map((trade) => ({ ...trade })),
        candle: {
          open: BASE_PRICE,
          high: Math.max(...prices),
          low: Math.min(...prices),
          close: market.price,
          volume: round(totals.volume + 0.01),
        },
        candles: candlesFromTrades(trades),
        buy: round(totals.buy),
        sell: round(totals.sell),
        volume: round(totals.volume),
        cvd: round(totals.cvd),
      },
      fields,
    );
    frames.push({ at, state });
  }
  extras.forEach((op, index) => {
    if (op.kind === "trade") {
      let remaining = op.size,
        slice = 0;
      const fills = [];
      while (remaining > 1e-8) {
        const level = market.book(op.side === "buy" ? "sell" : "buy")[0];
        if (!level) throw new Error("Missing depth at " + op.at);
        const result = market.execute({
          side: op.side,
          size: Math.min(remaining, level.size),
          disposition: op.disposition,
          own: false,
        });
        if (!result.filled)
          throw new Error("Unfilled authored trade at " + op.at);
        const at = op.at + slice++ * 28;
        for (const fill of result.fills) {
          const trade = {
            id: "journey-fill-" + trades.length,
            at,
            side: op.side,
            price: fill.price,
            size: fill.size,
          };
          trades.push(trade);
          fills.push(trade);
          events.push({ ...trade, kind: "trade", order: "journey-" + index });
        }
        remaining = round(remaining - result.filled);
        snapshot(at);
      }
      if (op.liquidation) {
        const at = fills.at(-1).at + 80;
        const report = {
          at,
          side: op.side,
          size: op.size,
          price:
            fills.reduce((total, fill) => total + fill.price * fill.size, 0) /
            op.size,
        };
        fields.liquidations.push(report);
        events.push({ ...report, kind: "liquidation" });
        snapshot(at);
      }
      return;
    }
    if (op.kind === "add") market.add(op.side, op.price, op.size, true);
    if (op.kind === "remove") {
      op = {
        ...op,
        size: round(
          market.book(op.side).find((row) => row.price === op.price)?.size || 0,
        ),
      };
      for (const order of [...market.orders])
        if (order.side === op.side && order.price === op.price)
          market.cancel(order.id);
    }
    if (op.kind === "ticker") {
      for (const key of ["mark", "index", "rate"])
        if (op[key] !== undefined) fields[key] = op[key];
    }
    if (op.kind === "settlement")
      fields.settlement = {
        at: op.at,
        nominal: op.nominal,
        rate: fields.rate,
        payment: round(op.nominal * fields.rate),
      };
    events.push({ ...op, id: "journey-event-" + index });
    snapshot(op.at);
  });
  return { frames, events, duration: JOURNEY_DURATION };
}
