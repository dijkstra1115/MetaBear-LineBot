import { Market } from "./engine.js";

export const SCENE_DURATIONS = [4000, 8000, 10000, 8000];
export const SCENE_STARTS = [0, 4000, 12000, 22000];
export const TOTAL_DURATION = 30000;
export const TIMING = {
  marketFirst: 6200,
  marketSecond: 8500,
  limitFill: 14400,
  rest: 17000,
  arrival: 19200,
  zoomOut: 22000,
  panorama: 23900,
};
export const clamp = (v) => Math.max(0, Math.min(1, v));
export function ease(v) {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
}
export function scenePosition(scene, elapsed, reduced = false) {
  const playhead =
    SCENE_STARTS[scene] +
    Math.max(0, Math.min(SCENE_DURATIONS[scene], elapsed));
  return {
    scene,
    elapsed,
    playhead,
    time: playhead,
    reduced,
    mode: ["compare", "market", "limit", "result"][scene],
  };
}
function marketWithBook() {
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
  market.add("buy", 100, 20);
  for (const [price, size] of [
    [101, 10],
    [102, 25],
    [103, 30],
  ])
    market.add("sell", price, size);
  return market;
}
export function createOrderTypesStory() {
  const market = marketWithBook(),
    limit = marketWithBook();
  const initial = market
    .book("sell")
    .map(({ price, size }) => ({ price, size }));
  const marketOrder = market.execute({ side: "buy", size: 30 });
  const limitOrder = limit.execute({
    side: "buy",
    type: "limit",
    price: 101,
    size: 30,
  });
  const incoming = limit.execute({ side: "sell", size: 8, own: false });
  return {
    quantity: 30,
    limit: 101,
    initial,
    marketFills: marketOrder.fills.map((fill, i) => ({
      ...fill,
      playedAt: [TIMING.marketFirst, TIMING.marketSecond][i],
    })),
    limitFills: [
      ...limitOrder.fills.map((fill) => ({
        ...fill,
        playedAt: TIMING.limitFill,
      })),
      ...incoming.fills
        .filter((fill) => fill.makerOwn)
        .map((fill) => ({ ...fill, playedAt: TIMING.arrival })),
    ],
    expected: {
      market: marketOrder,
      limit: {
        filled: limitOrder.filled,
        remaining: limitOrder.remaining,
        avg: limitOrder.avg,
      },
      incoming,
    },
  };
}
export function orderTypesSnapshot(story, playhead) {
  const snapshot = (kind, tape) => {
    const fills = tape.filter((f) => f.playedAt <= playhead);
    const filled = fills.reduce((n, f) => n + f.size, 0);
    const value = fills.reduce((n, f) => n + f.price * f.size, 0);
    const asks = story.initial.map((row) => ({
      ...row,
      remaining:
        row.size -
        fills
          .filter((f) => f.side === "buy" && f.price === row.price)
          .reduce((n, f) => n + f.size, 0),
    }));
    return {
      kind,
      fills,
      filled,
      remaining: story.quantity - filled,
      value,
      avg: filled ? value / filled : null,
      asks,
      resting:
        kind === "limit" && playhead >= TIMING.limitFill
          ? story.quantity - filled
          : 0,
      last: fills.at(-1) ?? null,
    };
  };
  return {
    market: snapshot("market", story.marketFills),
    limit: snapshot("limit", story.limitFills),
    quantity: story.quantity,
    limitPrice: story.limit,
  };
}
