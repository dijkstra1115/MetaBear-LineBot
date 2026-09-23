import { Market, metrics, aggregate, round } from "../engine.js";
import { candleFromTrades } from "./foundation-model.js";

export class GuidedLesson {
  constructor(course) {
    this.course = course;
    this.step = 0;
    this.comparisons = [];
    this.windows = [];
    this.intervalStart = 0;
    this.intervals = [];
    this.rate = 0;
    this.payment = null;
    this.nominal = 10000;
    this.premium = null;
    this.risk = false;
    this.markPrice = 100;
    this.positions = (course.liquidation || []).map((position) => ({
      ...position,
      status: "waiting",
      filled: 0,
    }));
    this.seed(course.init);
  }
  seed(init) {
    this.market = new Market();
    Object.assign(this.market, {
      orders: [],
      trades: [],
      history: [],
      events: [],
      time: 0,
      oi: init.oi || 0,
    });
    this.market.add("sell", 100, 1);
    this.market.execute({ side: "buy", size: 1, own: false });
    this.tags = new Map();
    for (const [side, rows] of [
      ["sell", init.asks],
      ["buy", init.bids],
    ]) {
      for (const [price, size, peak = 0, tag] of rows || []) {
        const order = this.market.add(side, price, size, true, peak);
        if (tag) this.tags.set(tag, order.id);
      }
    }
    this.lastExecution = null;
    this.tape = [];
    this.captureBook();
  }
  captureBook() {
    this.tape.push({
      price: this.market.price,
      asks: this.market.book("sell"),
      bids: this.market.book("buy"),
    });
  }
  trade(op) {
    let remaining = op.size;
    const fills = [];
    let replenished = 0;
    // Execute each currently visible slice through the existing engine so the
    // animation can show genuine intermediate fills, including replenishment.
    while (remaining > 1e-8) {
      const maker = this.market.orders
        .filter((order) => order.side !== op.side && order.remaining > 1e-8)
        .sort(
          (a, b) =>
            (op.side === "buy" ? a.price - b.price : b.price - a.price) ||
            a.priority - b.priority,
        )[0];
      if (!maker) break;
      const size = Math.min(remaining, maker.visible);
      const result = this.market.execute({
        side: op.side,
        size,
        disposition: op.disposition || "transfer",
      });
      if (!result.filled) break;
      remaining = round(remaining - result.filled);
      fills.push(...result.fills);
      replenished += result.replenished;
      if (op.liquidationId) {
        const position = this.positions.find((p) => p.id === op.liquidationId);
        position.filled = round(position.filled + result.filled);
        position.status =
          position.filled >= position.size ? "closed" : "liquidating";
      }
      this.captureBook();
      this.animationFrames?.push({
        snapshot: this.snapshot(),
        fill: {
          side: op.side,
          size: result.filled,
          price: result.fills.at(-1).price,
          liquidationId: op.liquidationId,
        },
      });
    }
    const filled = round(op.size - remaining);
    this.lastExecution = {
      side: op.side,
      size: op.size,
      filled,
      remaining,
      fills,
      replenished,
      avg: filled
        ? fills.reduce((sum, fill) => sum + fill.price * fill.size, 0) / filled
        : null,
    };
  }
  apply(op) {
    switch (op.type) {
      case "trade":
        this.trade(op);
        return;
      case "place": {
        const result = this.market.execute({
          side: op.side,
          price: op.price,
          size: op.size,
          type: "limit",
        });
        if (op.tag && result.resting) this.tags.set(op.tag, result.resting.id);
        break;
      }
      case "cancel": {
        if (!this.market.cancel(this.tags.get(op.tag)))
          throw new Error(`Missing resting order: ${op.tag}`);
        break;
      }
      case "cancel-price":
        for (const order of [...this.market.orders])
          if (order.side === op.side && order.price === op.price)
            this.market.cancel(order.id);
        break;
      case "compare":
        this.comparisons.push({
          label: op.label,
          ...structuredClone(this.lastExecution),
        });
        return;
      case "reset":
        this.seed(op.init);
        this.intervalStart = 0;
        this.intervals = [];
        return;
      case "interval":
        this.intervals.push(this.snapshot().stats.cvd - this.intervalStart);
        this.intervalStart = this.snapshot().stats.cvd;
        return;
      case "window": {
        const before = this.snapshot().stats.volume;
        if (op.size) this.trade({ side: "buy", size: op.size });
        this.windows.push(this.snapshot().stats.volume - before);
        return;
      }
      case "rate":
        this.rate = op.value;
        this.payment = null;
        return;
      case "settle":
        this.payment = round(this.nominal * this.rate);
        return;
      case "premium":
        this.premium = {
          ...op,
          percent: ((op.contract - op.reference) / op.reference) * 100,
        };
        return;
      case "risk":
        this.risk = true;
        return;
      case "mark":
        if (!Number.isFinite(op.value) || op.value <= 0)
          throw new Error("Invalid mark price");
        this.markPrice = op.value;
        for (const position of this.positions) {
          if (
            position.status === "waiting" &&
            this.markPrice <= position.threshold
          )
            position.status = "triggered";
        }
        return;
      case "liquidate": {
        const position = this.positions.find((p) => p.id === op.id);
        if (!position || position.status !== "triggered")
          throw new Error("Position has not reached its liquidation condition");
        position.status = "liquidating";
        this.trade({
          side: "sell",
          size: position.size - position.filled,
          liquidationId: position.id,
          disposition: "transfer",
        });
        // Unfilled quantity remains pending if the market cannot supply depth.
        if (position.status !== "closed") position.status = "triggered";
        return;
      }
      case "wait":
        break;
      default:
        throw new Error(`Unknown lesson operation: ${op.type}`);
    }
    this.captureBook();
  }
  advance() {
    if (this.step >= this.course.steps.length - 1) return this.snapshot();
    this.animationFrames = [];
    for (const op of this.course.steps[this.step].ops) this.apply(op);
    this.step++;
    return this.snapshot();
  }
  previewNext() {
    const preview = new GuidedLesson(this.course);
    for (let i = 0; i <= this.step; i++) preview.advance();
    return { snapshot: preview.snapshot(), frames: preview.animationFrames };
  }
  snapshot() {
    const allTrades = this.market.trades.map((trade) => ({ ...trade }));
    const trades = this.course.includeAnchor ? allTrades : allTrades.slice(1);
    return {
      step: this.step,
      price: this.market.price,
      asks: this.market.book("sell"),
      bids: this.market.book("buy"),
      trades,
      candle: candleFromTrades(allTrades),
      stats: metrics(trades),
      profile: aggregate(trades, 1),
      oi: this.market.oi,
      delta: metrics(trades).cvd - this.intervalStart,
      intervals: [...this.intervals],
      lastExecution: structuredClone(this.lastExecution),
      comparisons: structuredClone(this.comparisons),
      tape: structuredClone(this.tape),
      windows: [...this.windows],
      rate: this.rate,
      payment: this.payment,
      nominal: this.nominal,
      premium: this.premium,
      risk: this.risk,
      markPrice: this.markPrice,
      positions: structuredClone(this.positions),
    };
  }
}
