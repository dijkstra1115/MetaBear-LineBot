import { Market } from "./engine.js";
export const SCENE_DURATIONS = [6000, 13000, 11000, 10000];
export const SCENE_STARTS = [0, 6000, 19000, 30000];
export const TOTAL_DURATION = 40000;
export const TIMING = {
  zoomIn: 4000,
  focused: 6000,
  reset: 6000,
  deepBreak: 15500,
  resetB: 19000,
  thinBreak: 26500,
  zoomOut: 31000,
  panorama: 33500,
  compare: 35000,
  compared: 36200,
};
export const clamp = (value) => Math.max(0, Math.min(1, value));
export const ease = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
export function scenePosition(scene, elapsed, reduced = false) {
  const playhead =
    SCENE_STARTS[scene] +
    Math.min(SCENE_DURATIONS[scene], Math.max(0, elapsed));
  return {
    scene,
    elapsed,
    playhead,
    time: playhead,
    reduced,
    mode: ["overview", "deep", "thin", "compare"][scene],
  };
}
function makeMarket(id, depth, operations) {
  const market = new Market();
  Object.assign(market, {
    orders: [],
    trades: [],
    history: [],
    events: [],
    price: null,
    time: 0,
    id: 0,
  });
  market.add("buy", 100, 30);
  market.add("sell", 101, 1);
  market.add("sell", 102, depth);
  market.add("sell", 103, 20);
  // A shared, completed starting print establishes 101. It is context before
  // the measured comparison, not part of either displayed incoming buy total.
  const seed = market.execute({ side: "buy", size: 1, own: false }).fills[0];
  const fills = [],
    frames = [];
  const save = (at) =>
    frames.push({
      at,
      price: market.price,
      bids: market.book("buy"),
      asks: market.book("sell"),
    });
  save(0);
  for (const op of operations) {
    const result = market.execute({ side: "buy", size: op.size, own: false });
    if (result.filled !== op.size)
      throw Error("Breakout example has insufficient depth");
    fills.push(
      ...result.fills.map((fill) => ({
        at: op.at,
        price: fill.price,
        size: fill.size,
        side: fill.side,
      })),
    );
    save(op.at);
  }
  return {
    id,
    depth,
    seed: { price: seed.price, size: seed.size, side: seed.side },
    fills,
    frames,
  };
}
export function createBreakoutStory() {
  const targetIndex = 4;
  const contextPrices = [
    [97, 99, 96, 98],
    [98, 100, 97, 99],
    [99, 102, 98, 101],
    [101, 102, 100, 101],
    null,
    [103, 105, 102, 104],
    [104, 106, 103, 105],
    [105, 105, 103, 104],
    [104, 107, 103, 106],
  ];
  const context = contextPrices.map((prices, index) =>
    prices
      ? {
          index,
          label: `14:${26 + index}`,
          open: prices[0],
          high: Math.max(...prices),
          low: Math.min(...prices),
          close: prices.at(-1),
          rows: prices.map((price, tick) => ({
            price,
            size: [4, 6, 5, 5][tick],
          })),
        }
      : null,
  );
  const markets = [
    makeMarket("A", 60, [
      { at: 8000, size: 20 },
      { at: 10500, size: 20 },
      { at: 13000, size: 20 },
      { at: TIMING.deepBreak, size: 5 },
    ]),
    makeMarket("B", 10, [
      { at: 21500, size: 5 },
      { at: 24000, size: 5 },
      { at: TIMING.thinBreak, size: 5 },
    ]),
  ];
  for (const market of markets) {
    const completed = marketSnapshot(market, Infinity);
    market.completedBars = context.map((bar, index) =>
      index === targetIndex
        ? {
            ...completed.candle,
            index,
            label: "14:30",
            rows: [market.seed, ...market.fills],
          }
        : bar,
    );
  }
  return {
    level: 102,
    targetIndex,
    context,
    markets,
  };
}
export function marketSnapshot(market, time) {
  const trades = market.fills.filter((fill) => fill.at <= time);
  const frame =
    market.frames.findLast((frame) => frame.at <= time) ?? market.frames[0];
  const tape = [market.seed, ...trades];
  return {
    ...frame,
    id: market.id,
    depth: market.depth,
    trades,
    latest: trades.at(-1) ?? null,
    volume: trades.reduce((sum, fill) => sum + fill.size, 0),
    remaining102: frame.asks.find((row) => row.price === 102)?.size ?? 0,
    remaining103: frame.asks.find((row) => row.price === 103)?.size ?? 0,
    candle: {
      open: market.seed.price,
      high: Math.max(...tape.map((fill) => fill.price)),
      low: Math.min(...tape.map((fill) => fill.price)),
      close: frame.price,
    },
    broke: frame.price > 102,
  };
}
export function breakoutSnapshot(story, playhead) {
  const time = Math.max(0, Math.min(TOTAL_DURATION, playhead));
  const preview = time < TIMING.reset;
  const replay = !preview && time < TIMING.zoomOut;
  const markets = story.markets.map((market) =>
    marketSnapshot(market, preview ? Infinity : time),
  );
  const activeIndex = time < TIMING.resetB ? 0 : 1;
  const active = markets[activeIndex];
  const bars = replay
    ? story.context.map((bar, index) => {
        if (index < story.targetIndex) return bar;
        if (index > story.targetIndex) return null;
        return {
          ...active.candle,
          index,
          label: "14:30",
          rows: [story.markets[activeIndex].seed, ...active.trades],
        };
      })
    : story.markets[activeIndex].completedBars;
  return {
    playhead: time,
    preview,
    replay,
    activeIndex,
    active,
    markets,
    bars,
    comparing: time >= TIMING.compare,
  };
}
