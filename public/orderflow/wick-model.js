import { Market, round } from "./engine.js";

export const OPEN = 68420;
export const DURATION = 60000;
export const FIRST_BUY_AT = 3600;
export const SCENE_DURATIONS = [
  10000, 8100, 10000, 14000, 6500, 12500, 12000, 8000, 13000, 11000, 9000,
  19200,
];
export const RECAP_REWIND = 1200;
export const RECAP_BEATS = [
  {
    start: 10000,
    end: 20000,
    label: "08–20 秒",
    text: "主動買入持續，被動賣單補回",
  },
  {
    start: 23506,
    end: 29000,
    label: "23–29 秒",
    text: "被動賣單很薄，少量主動買入也能推高",
  },
  {
    start: 41500,
    end: 50000,
    label: "41–50 秒",
    text: "大量主動賣出，逐檔消耗被動買單",
  },
  {
    start: 50500,
    end: 60000,
    label: "50–60 秒",
    text: "被動買單補回，暫時接住主動賣出",
  },
];
// Playback slows the first cross-price fills, then accelerates along the same tape.
export const ASCENT_TIMING = [
  [0, 23000],
  [800, 23500],
  [1800, 23506],
  [4200, 23548],
  [4800, 24400],
  [5100, 25000],
  [6800, 25060],
  [7300, 26000],
  [7600, 26600],
  [8800, 26660],
  [9300, 27600],
  [9600, 28300],
  [10500, 28336],
  [12500, 29000],
];
export const DESCENT_TIMING = [
  [0, 41000],
  [1100, 41500],
  [2200, 41526],
  [3000, 41532],
  [4700, 41616],
  [5100, 42500],
  [5400, 44000],
  [7500, 44078],
  [8000, 45300],
  [8300, 47000],
  [10100, 47066],
  [10600, 48000],
  [10900, 49000],
  [11600, 49006],
  [13000, 50000],
];
const price = (offset) => OPEN + offset;

// Context candles are derived from recorded synthetic price samples, not animation paths.
const contextSamples = [
  [18.5, 19.5, 17.5, 19],
  [19, 20.5, 18.5, 20],
  [20, 25, 19, 19.5],
  [19.5, 20.5, 19, 20],
];
export const CONTEXT = contextSamples.map((samples, index) => ({
  start: (index - 4) * DURATION,
  open: 68400 + samples[0],
  high: 68400 + Math.max(...samples),
  low: 68400 + Math.min(...samples),
  close: 68400 + samples.at(-1),
}));

const add = (at, side, offset, size) => ({
  at,
  kind: "add",
  side,
  price: price(offset),
  size,
});
const trade = (at, side, size) => ({ at, kind: "trade", side, size });
const sweep = (at, side, offset, lastSize = 0.01) => ({
  at,
  kind: "sweep",
  side,
  price: price(offset),
  lastSize,
});
const schedule = [
  trade(850, "sell", 0.05),
  add(1700, "sell", 0.5, 0.3),
  trade(2400, "sell", 0.04),
  trade(FIRST_BUY_AT, "buy", 0.1),
  trade(4800, "buy", 0.12),
  trade(5500, "sell", 0.08),
  trade(6300, "buy", 0.15),
  trade(7000, "sell", 0.06),
  trade(7700, "buy", 0.1),
  trade(8400, "buy", 0.23),
  add(8600, "buy", 0.5, 0.8),
  trade(9000, "buy", 0.6),
  add(10000, "sell", 1, 0.6),
  trade(10600, "buy", 0.8),
  add(11300, "sell", 1, 0.7),
  trade(12000, "buy", 0.75),
  trade(12400, "sell", 0.1),
  add(13100, "sell", 1, 0.65),
  trade(14000, "buy", 0.8),
  add(14800, "sell", 1, 0.8),
  trade(15500, "buy", 0.7),
  add(16200, "sell", 1, 0.75),
  trade(17100, "buy", 0.85),
  trade(17600, "sell", 0.1),
  add(18000, "sell", 1, 1.1),
  trade(18700, "buy", 0.8),
  add(19600, "sell", 1, 0.8),
  trade(20200, "buy", 0.6),
  trade(21300, "buy", 0.6),
  trade(22500, "buy", 0.35),
  sweep(23500, "buy", 5, 0.005),
  add(24200, "buy", 4.5, 0.09),
  trade(24400, "sell", 0.03),
  sweep(25000, "buy", 10, 0.005),
  add(25800, "buy", 9.5, 0.1),
  trade(26000, "sell", 0.03),
  sweep(26600, "buy", 15, 0.005),
  add(27400, "buy", 14.5, 0.12),
  trade(27600, "sell", 0.04),
  sweep(28300, "buy", 18, 0.05),
  add(28800, "buy", 17.5, 0.95),
  ...Array.from({ length: 33 }, (_, i) =>
    add(29300 + i, "buy", 1 + i * 0.5, 0.65),
  ),
  add(29400, "buy", 17, 0.47),
  trade(30000, "buy", 0.5),
  add(30500, "sell", 18, 0.6),
  trade(31000, "sell", 0.07),
  trade(31800, "buy", 0.6),
  add(32500, "sell", 18, 0.7),
  trade(33500, "buy", 0.7),
  trade(34500, "sell", 0.07),
  add(35200, "sell", 18, 0.5),
  trade(36000, "buy", 0.5),
  trade(37000, "sell", 0.04),
  add(37500, "sell", 18, 0.7),
  trade(37800, "buy", 0.15),
  add(38500, "buy", 17.5, 0.8),
  add(39200, "buy", 17, 0.5),
  trade(39700, "buy", 0.08),
  add(40300, "buy", 16.5, 0.6),
  // Explicit sell quantities meet the standing bids. Prices come from matching.
  trade(41500, "sell", 0.5),
  trade(41520, "sell", 9.23),
  add(42100, "sell", 12.5, 0.12),
  trade(42500, "buy", 0.05),
  trade(44000, "sell", 7.87),
  add(45000, "sell", 6.5, 0.15),
  trade(45300, "buy", 0.07),
  trade(47000, "sell", 6.56),
  add(47700, "sell", 1.5, 0.4),
  trade(48000, "buy", 0.12),
  trade(49000, "sell", 0.74),
  add(50500, "buy", 0.5, 0.5),
  trade(51200, "buy", 0.1),
  trade(52000, "sell", 0.3),
  add(52400, "buy", 0.5, 0.35),
  trade(53200, "sell", 0.25),
  trade(54000, "buy", 0.08),
  trade(55000, "sell", 0.2),
  add(55500, "buy", 0.5, 0.3),
  trade(56000, "sell", 0.15),
  add(57000, "sell", 1.5, 0.3),
  trade(57700, "buy", 0.1),
  trade(58300, "sell", 0.1),
  trade(59600, "buy", 0.15),
];

export function createWickStory() {
  const market = new Market();
  Object.assign(market, {
    orders: [],
    trades: [],
    history: [],
    events: [],
    price: OPEN,
    time: 0,
  });
  market.add("buy", OPEN, 1.8, true);
  market.add("buy", price(-0.5), 2, true);
  market.add("sell", price(0.5), 0.4, true);
  market.add("sell", price(1), 1.5, true);
  for (let offset = 1.5; offset < 18; offset += 0.5)
    market.add("sell", price(offset), 0.015, true);
  market.add("sell", price(18), 1.2, true);
  market.add("sell", price(18.5), 2, true);
  const frames = [],
    events = [],
    trades = [];
  function save(at) {
    const prices = [OPEN, ...trades.map((t) => t.price)];
    frames.push({
      at,
      state: {
        price: market.price,
        bids: market
          .book("buy")
          .map(({ price, size }) => ({ price, size: round(size) })),
        asks: market
          .book("sell")
          .map(({ price, size }) => ({ price, size: round(size) })),
        trades: trades.map((t) => ({ ...t })),
        candle: {
          open: OPEN,
          high: Math.max(...prices),
          low: Math.min(...prices),
          close: market.price,
          volume: round(trades.reduce((sum, t) => sum + t.size, 0)),
        },
      },
    });
  }
  save(0);
  for (const op of schedule) {
    if (op.kind === "add") {
      const opposite = market.book(op.side === "buy" ? "sell" : "buy")[0];
      if (
        op.side === "buy"
          ? op.price >= opposite.price
          : op.price <= opposite.price
      )
        throw new Error("Crossed quote at " + op.at);
      market.add(op.side, op.price, op.size, true);
      events.push({ ...op });
      save(op.at);
      continue;
    }
    const bookSide = op.side === "buy" ? "sell" : "buy";
    let remaining =
      op.kind === "sweep"
        ? round(
            market
              .book(bookSide)
              .filter((row) =>
                op.side === "buy" ? row.price < op.price : row.price > op.price,
              )
              .reduce((sum, row) => sum + row.size, op.lastSize),
          )
        : op.size;
    let slice = 0;
    while (remaining > 1e-8) {
      const level = market.book(bookSide)[0];
      if (!level) throw new Error("Missing depth at " + op.at);
      // Save every fill, including fills against multiple makers at one price.
      // This keeps a seek between two fills consistent with the visible depth.
      const maker = market.orders
        .filter(
          (order) =>
            order.side === bookSide &&
            order.price === level.price &&
            order.visible > 1e-8,
        )
        .sort((a, b) => a.priority - b.priority)[0];
      const result = market.execute({
        side: op.side,
        size: Math.min(remaining, maker.visible),
        own: false,
      });
      if (!result.filled) throw new Error("Missing execution at " + op.at);
      for (const fill of result.fills) {
        const t = {
          at: op.at + slice++ * 6,
          side: op.side,
          price: fill.price,
          size: fill.size,
        };
        trades.push(t);
        events.push({ ...t, kind: "trade" });
      }
      remaining = round(remaining - result.filled);
      save(trades.at(-1).at);
    }
  }
  return { frames, events, duration: DURATION };
}

export function wickSnapshot(story, at) {
  let low = 0,
    high = story.frames.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (story.frames[mid].at <= at) low = mid;
    else high = mid - 1;
  }
  return structuredClone(story.frames[low].state);
}

const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

function mappedTime(value, reverse = false, timing = ASCENT_TIMING) {
  const a = reverse ? 1 : 0,
    b = reverse ? 0 : 1;
  for (let i = 1; i < timing.length; i++) {
    const previous = timing[i - 1],
      next = timing[i];
    if (value <= next[a]) {
      const t = clamp((value - previous[a]) / (next[a] - previous[a]));
      return previous[b] + (next[b] - previous[b]) * t;
    }
  }
  return timing.at(-1)[b];
}

export function activeBuys(state, start, end) {
  return activeVolume(state, "buy", start, end);
}

export function activeVolume(state, side, start, end) {
  return round(
    state.trades
      .filter((t) => t.side === side && t.at >= start && t.at < end)
      .reduce((sum, t) => sum + t.size, 0),
  );
}

// The camera follows completed trades. Its only interpolation is visual;
// trade prices and the candle always come straight from the public snapshot.
export function continuationCamera(
  state,
  time,
  elapsed,
  mode,
  reduced = false,
) {
  if (mode === "support" || mode === "closing") {
    const previous = continuationCamera(
      state,
      50000,
      SCENE_DURATIONS[8],
      "descent",
      reduced,
    );
    const retreat = mode === "closing" ? closingRetreat(elapsed, reduced) : 0;
    return {
      min: previous.min + (OPEN - 4 - previous.min) * retreat,
      max: previous.max + (OPEN + 20 - previous.max) * retreat,
      compact:
        mode === "support"
          ? 1 - (reduced ? Number(elapsed > 0) : ease(elapsed / 800))
          : 0,
      wide: 0,
    };
  }
  if (mode === "high-absorption") {
    const wide = reduced ? Number(elapsed === 0) : 1 - ease(elapsed / 1600);
    return {
      min: OPEN + 16.7 + (OPEN - 2 - (OPEN + 16.7)) * wide,
      max: OPEN + 18.7 + (state.candle.high + 3 - (OPEN + 18.7)) * wide,
      wide,
      compact: wide,
    };
  }
  if (mode === "bid-depth") {
    const compact = reduced ? 1 : ease(elapsed / 800);
    return {
      min: OPEN + 16.7 - 1.9 * compact,
      max: OPEN + 18.7 + 0.1 * compact,
      compact,
      wide: 0,
    };
  }
  if (mode === "descent") {
    let focus = OPEN + 16.8,
      target = focus,
      lastAt = 0;
    for (const trade of state.trades) {
      if (trade.at < 41000 || trade.at > time || trade.price + 0.7 >= target)
        continue;
      const at = mappedTime(trade.at, true, DESCENT_TIMING);
      focus = target + (focus - target) * Math.exp(-(at - lastAt) / 130);
      target = trade.price + 0.7;
      lastAt = at;
    }
    focus = reduced
      ? target
      : target + (focus - target) * Math.exp(-(elapsed - lastAt) / 130);
    return { min: focus - 2, max: focus + 2, compact: 1, wide: 0 };
  }
  const shift = ease((time - 8400) / 600);
  if (mode !== "ascent")
    return {
      min: OPEN - 0.3,
      max: OPEN + 1.2 + shift * 0.5,
      compact: 0,
      wide: 0,
    };
  let focus = OPEN + 1,
    target = focus,
    lastAt = 0;
  for (const trade of state.trades) {
    if (trade.at < 23000 || trade.price <= target) continue;
    const at = mappedTime(trade.at, true);
    focus = target + (focus - target) * Math.exp(-(at - lastAt) / 130);
    target = trade.price;
    lastAt = at;
  }
  focus = reduced
    ? target
    : target + (focus - target) * Math.exp(-(elapsed - lastAt) / 130);
  const compact = reduced ? 1 : ease(elapsed / 800);
  const wide = reduced
    ? Number(elapsed >= 10500)
    : ease((elapsed - 10500) / 2000);
  const closeMin = OPEN - 0.3 + (focus - 2 - (OPEN - 0.3)) * compact;
  const closeMax = OPEN + 1.7 + (focus + 2 - (OPEN + 1.7)) * compact;
  return {
    min: closeMin + (OPEN - 2 - closeMin) * wide,
    max: closeMax + (state.candle.high + 3 - closeMax) * wide,
    compact,
    wide,
  };
}

function closingRetreat(elapsed, reduced) {
  return reduced ? Number(elapsed >= 1800) : ease((elapsed - 1800) / 6200);
}

// One clock drives the overview, the explicit rewind and the close-up replay.
export function scenePosition(scene, elapsed, reduced = false) {
  const duration = SCENE_DURATIONS[scene];
  const at = Math.max(0, Math.min(duration, elapsed));
  if (scene === 0)
    return { time: at * 6, zoom: 0, mode: "overview", progress: at / duration };
  if (scene === 1) {
    if (at < 1800)
      return {
        time: reduced ? 0 : DURATION * (1 - ease(at / 1800)),
        zoom: 0,
        mode: "rewind",
        progress: at / duration,
      };
    if (at < 3600)
      return {
        time: 0,
        zoom: reduced ? 1 : ease((at - 1800) / 1800),
        mode: "approach",
        progress: at / duration,
      };
    return {
      time: (at - 3600) * (2 / 3),
      zoom: 1,
      mode: "quotes",
      progress: at / duration,
    };
  }
  if (scene === 2)
    return {
      time: 3000 + at / 2,
      zoom: 1,
      mode: "execution",
      progress: at / duration,
    };
  if (scene === 3)
    return {
      time: 8000 + at * (12000 / duration),
      zoom: 1,
      mode: "absorption",
      elapsed: at,
      progress: at / duration,
    };
  if (scene === 4)
    return {
      time: 20000 + at * (3000 / duration),
      zoom: 1,
      mode: "depletion",
      elapsed: at,
      progress: at / duration,
    };
  if (scene === 5)
    return {
      time: mappedTime(at),
      zoom: 1,
      mode: "ascent",
      elapsed: at,
      progress: at / duration,
    };
  if (scene === 6)
    return {
      time: 29000 + at * (9000 / duration),
      zoom: 1,
      mode: "high-absorption",
      elapsed: at,
      progress: at / duration,
    };
  if (scene === 7)
    return {
      time: 38000 + at * (3000 / duration),
      zoom: 1,
      mode: "bid-depth",
      elapsed: at,
      progress: at / duration,
    };
  if (scene === 8)
    return {
      time: mappedTime(at, false, DESCENT_TIMING),
      zoom: 1,
      mode: "descent",
      elapsed: at,
      progress: at / duration,
    };
  if (scene === 9)
    return {
      time: 50000 + at * (7000 / duration),
      zoom: 1,
      mode: "support",
      elapsed: at,
      progress: at / duration,
    };
  if (scene === 10)
    return {
      time: 57000 + at / 3,
      zoom: 1 - closingRetreat(at, reduced),
      mode: "closing",
      elapsed: at,
      progress: at / duration,
    };
  if (at < RECAP_REWIND)
    return {
      time: reduced ? 0 : DURATION * (1 - ease(at / RECAP_REWIND)),
      zoom: 0,
      mode: "recap-rewind",
      elapsed: at,
      progress: at / duration,
    };
  return {
    time: ((at - RECAP_REWIND) * DURATION) / (duration - RECAP_REWIND),
    zoom: 0,
    mode: "recap",
    elapsed: at,
    progress: at / duration,
  };
}
