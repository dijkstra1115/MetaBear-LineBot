import { Market } from "./engine.js";
export const SCENE_DURATIONS = [7000, 9000, 12000, 4000];
export const SCENE_STARTS = [0, 7000, 16000, 28000];
export const TOTAL_DURATION = 32000;
export const PRICES = [101, 100, 99, 98, 97];
export const TIMING = {
  lower: 3000,
  trigger: 5500,
  submit: 7000,
  firstFill: 9200,
  secondFill: 11800,
  reset: 16000,
  limitLower: 19000,
  limitTrigger: 21500,
  limitSubmit: 23000,
  limitFill: 24500,
  summary: 28000,
  panorama: 29500,
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
    mode: ["market-trigger", "market-execution", "limit-replay", "result"][
      scene
    ],
  };
}
function experiment(kind, offset) {
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
  const initial = [
    [101, 2],
    [100, 3],
    [99, 5],
    [98, 10],
    [97, 20],
  ].map(([price, size]) => ({ price, size }));
  for (const row of initial) market.add("buy", row.price, row.size);
  market.add("sell", 102, 30);
  const reference = [];
  for (const [at, size] of [
    [0, 2],
    [TIMING.lower, 3],
    [TIMING.trigger, 5],
  ]) {
    const result = market.execute({ side: "sell", size, own: false });
    reference.push(
      ...result.fills.map((fill) => ({ ...fill, playedAt: offset + at })),
    );
  }
  const order = market.execute({
    side: "sell",
    size: 20,
    type: kind,
    price: 98,
  });
  return {
    kind,
    offset,
    initial,
    reference,
    submitAt: offset + TIMING.submit,
    fills: order.fills.map((fill, i) => ({
      ...fill,
      playedAt:
        kind === "limit"
          ? TIMING.limitFill
          : [TIMING.firstFill, TIMING.secondFill][i],
    })),
    expected: {
      filled: order.filled,
      remaining: order.remaining,
      avg: order.avg,
      restingPrice: order.resting?.price ?? null,
    },
  };
}
export function createStopOrdersStory() {
  return {
    quantity: 20,
    triggerPrice: 99,
    limitPrice: 98,
    market: experiment("market", 0),
    limit: experiment("limit", TIMING.reset),
  };
}
function branchSnapshot(story, branch, t) {
  const reference = branch.reference.filter((fill) => fill.playedAt <= t),
    triggered = reference.some((fill) => fill.price <= story.triggerPrice),
    submitted = triggered && t >= branch.submitAt;
  const fills = submitted
    ? branch.fills.filter((fill) => fill.playedAt <= t)
    : [];
  const filled = fills.reduce((n, f) => n + f.size, 0),
    value = fills.reduce((n, f) => n + f.price * f.size, 0);
  const bids = branch.initial.map((row) => ({
    ...row,
    remaining:
      row.size -
      [...reference, ...fills]
        .filter((f) => f.price === row.price)
        .reduce((n, f) => n + f.size, 0),
  }));
  return {
    kind: branch.kind,
    reference,
    referencePrice: reference.at(-1)?.price ?? null,
    triggered,
    submitted,
    fills,
    filled,
    remaining: story.quantity - filled,
    value,
    avg: filled ? value / filled : null,
    bids,
    bestBid: bids.find((row) => row.remaining > 0)?.price ?? null,
    price: fills.at(-1)?.price ?? reference.at(-1)?.price ?? null,
    resting:
      branch.kind === "limit" && submitted && t >= TIMING.limitFill
        ? story.quantity - filled
        : 0,
  };
}
export function stopOrdersSnapshot(story, t) {
  const market = branchSnapshot(story, story.market, t),
    limit = branchSnapshot(story, story.limit, t),
    kind = t < TIMING.reset ? "market" : "limit",
    current = kind === "market" ? market : limit;
  return {
    kind,
    current,
    market,
    limit,
    quantity: story.quantity,
    triggerPrice: story.triggerPrice,
    limitPrice: story.limitPrice,
    summary: t >= TIMING.summary,
    rewinding: t >= TIMING.reset && t < TIMING.reset + 2000,
  };
}
