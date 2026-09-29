import test from "node:test";
import assert from "node:assert/strict";
import {
  createBreakoutVolumeStory,
  breakoutVolumeSnapshot,
  applyLedgerEvent,
  footprintOf,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
  BAR_RANGES,
  scenePosition,
  timePosition,
} from "../public/orderflow/breakout-volume-model.js";
const story = createBreakoutVolumeStory();
const at = (time) => breakoutVolumeSnapshot(story, time);
const sum = (rows, field = "size") =>
  rows.reduce((total, row) => total + row[field], 0);
const qty = (state, side, price) =>
  state[side === "buy" ? "bids" : "asks"].find((row) => row.price === price)
    ?.size ?? 0;
const ohlcv = (bar) =>
  bar && [bar.open, bar.high, bar.low, bar.close, bar.volume, bar.delta];
function bookAt(time) {
  let book = new Map();
  for (const event of story.events.filter((event) => event.at <= time))
    book = applyLedgerEvent(book, event).book;
  return book;
}

test("one local ledger produces all ten exact OHLCV bars, deltas and CVD", () => {
  assert.deepEqual(createBreakoutVolumeStory(), story);
  assert.deepEqual(story.bars.map(ohlcv), [
    [99, 101, 98, 100, 20, 10],
    [100, 102, 99, 101, 20, 10],
    [101, 103, 100, 102, 20, 10],
    [102, 104, 101, 103, 20, 10],
    [103, 104, 102, 103, 20, 10],
    [103, 106, 103, 106, 120, 100],
    [106, 107, 105, 107, 120, 80],
    [107, 107, 104, 104, 100, -80],
    [104, 105, 104, 104, 260, -220],
    [105, 109, 105, 109, 180, 160],
  ]);
  let cvd = 0;
  for (const bar of story.bars) {
    assert.equal(bar.open, bar.rows[0].price);
    assert.equal(bar.high, Math.max(...bar.rows.map((row) => row.price)));
    assert.equal(bar.low, Math.min(...bar.rows.map((row) => row.price)));
    assert.equal(bar.close, bar.rows.at(-1).price);
    assert.equal(bar.volume, sum(bar.rows));
    assert.equal(bar.delta, sum(bar.rows, "delta"));
    assert.equal(sum(bar.footprint, "volume"), bar.volume);
    assert.equal(
      sum(bar.footprint, "ask") - sum(bar.footprint, "bid"),
      bar.delta,
    );
    assert.equal(bar.duration, 60000);
    cvd += bar.delta;
    assert.equal(bar.cvd, cvd);
  }
  const final = at(TOTAL_DURATION);
  assert.equal(final.volume, 880);
  assert.equal(sum(final.trades.filter((row) => row.side === "buy")), 485);
  assert.equal(sum(final.trades.filter((row) => row.side === "sell")), 395);
  assert.equal(final.cvd, 90);
  assert.equal(Math.max(...final.cvdPoints.map((point) => point.cvd)), 240);
  assert.equal(Math.min(...final.cvdPoints.map((point) => point.cvd)), -70);
  assert.equal(final.price, 109);
});

test("five equal-time background bars alone set the breakout volume baseline", () => {
  assert.deepEqual(
    story.bars.slice(0, 5).map((bar) => bar.volume),
    [20, 20, 20, 20, 20],
  );
  assert.equal(story.baseline, 20);
  assert.equal(story.bars[5].volume, 120);
  assert.equal(at(0).ratio, 6);
  assert.equal(at(40000).ratio, 6);
  assert.equal(at(7000).ratio, 0);
  assert.ok(story.bars.slice(0, 5).every((bar) => bar.high <= story.level));
  assert.equal(story.bars[6].volume, story.bars[5].volume);
  assert.ok(story.bars[6].rows.every((row) => row.price > story.level));
});

test("all fills execute against the best opposing quote and conserve resting units", () => {
  let book = new Map();
  const balances = new Map();
  for (const event of story.events) {
    const result = applyLedgerEvent(book, event),
      key = result.restingSide + ":" + event.price;
    const balance =
      (balances.get(key) ?? 0) +
      (event.kind === "add" ? event.size : -event.size);
    balances.set(key, balance);
    assert.equal(balance, result.afterSize);
    assert.equal(event.beforeSize, result.beforeSize);
    assert.equal(event.afterSize, result.afterSize);
    assert.ok(result.afterSize >= 0);
    book = result.book;
    const bids = [...book.values()].filter((row) => row.side === "buy"),
      asks = [...book.values()].filter((row) => row.side === "sell");
    if (bids.length && asks.length)
      assert.ok(
        Math.max(...bids.map((row) => row.price)) <
          Math.min(...asks.map((row) => row.price)),
      );
  }
  for (const [key, balance] of balances)
    assert.equal(book.get(key)?.size ?? 0, balance);
  assert.equal(book.get("buy:104").size, 40);
  assert.equal(book.get("buy:102").size, 60);
  const quote = applyLedgerEvent(new Map(), {
    kind: "add",
    side: "sell",
    price: 105,
    size: 10,
  }).book;
  assert.throws(
    () =>
      applyLedgerEvent(quote, {
        kind: "trade",
        side: "buy",
        price: 106,
        size: 1,
      }),
    RangeError,
  );
  assert.throws(
    () =>
      applyLedgerEvent(quote, {
        kind: "trade",
        side: "buy",
        price: 105,
        size: 11,
      }),
    RangeError,
  );
  assert.throws(
    () =>
      applyLedgerEvent(quote, {
        kind: "cancel",
        side: "sell",
        price: 105,
        size: 11,
      }),
    RangeError,
  );
  assert.throws(
    () =>
      applyLedgerEvent(quote, {
        kind: "add",
        side: "buy",
        price: 105,
        size: 1,
      }),
    RangeError,
  );
});

test("the full opening panorama is restored exactly after replay, with later fills hidden during replay", () => {
  for (const time of [0, 4000, 6999]) {
    const state = at(time);
    assert.equal(state.preview, true);
    assert.equal(state.replay, false);
    assert.deepEqual(state.bars, story.bars);
    assert.equal(state.bars.length, 10);
    assert.equal(state.price, 109);
  }
  const reset = at(TIMING.reset);
  assert.equal(reset.replay, true);
  assert.equal(reset.preview, false);
  assert.deepEqual(reset.bars.slice(0, 5), story.bars.slice(0, 5));
  assert.ok(reset.bars.slice(5).every((bar) => bar === null));
  assert.equal(reset.cvd, 50);
  assert.equal(reset.price, 103);
  for (let time = TIMING.reset; time <= TIMING.zoomOut; time += 97) {
    const state = at(time);
    assert.ok(state.trades.every((row) => row.at <= state.effectiveTime));
    assert.ok(state.events.every((row) => row.at <= state.effectiveTime));
    assert.ok(
      state.bars
        .filter(Boolean)
        .every((bar) => bar.rows.every((row) => row.at <= state.effectiveTime)),
    );
  }
  assert.deepEqual(at(0).bars, at(40000).bars);
  assert.deepEqual(at(0).trades, at(40000).trades);
  assert.deepEqual(at(0).cvdPoints, at(40000).cvdPoints);
  assert.deepEqual(at(0).heatSegments, at(40000).heatSegments);
});

test("each fill updates latest price, candle, footprint, volume and CVD at the same instant", () => {
  for (const trade of story.trades.filter((row) => row.barIndex >= 5)) {
    const before = at(trade.at - 1),
      after = at(trade.at);
    assert.equal(after.volume - before.volume, trade.size);
    assert.equal(after.cvd - before.cvd, trade.delta);
    assert.equal(after.price, trade.price);
    assert.equal(after.trades.length, before.trades.length + 1);
    assert.equal(after.latestTrade.id, trade.id);
    assert.equal(after.cvdPoints.at(-1).cvd, after.cvd);
    const bar = after.bars[trade.barIndex],
      row = bar.footprint.find((row) => row.price === trade.price);
    assert.equal(bar.close, trade.price);
    assert.equal(
      row[trade.side === "buy" ? "ask" : "bid"],
      sum(
        bar.rows.filter(
          (row) => row.price === trade.price && row.side === trade.side,
        ),
      ),
    );
    assert.equal(
      qty(before, trade.restingSide, trade.price) -
        qty(after, trade.restingSide, trade.price),
      trade.size,
    );
  }
});

test("new limit orders and cancellation operations change depth without generating a trade", () => {
  for (const event of story.quoteEvents.filter(
    (row) => row.at > TIMING.reset,
  )) {
    const before = at(event.at - 1),
      after = at(event.at);
    assert.deepEqual(after.trades, before.trades);
    assert.deepEqual(after.bars.map(ohlcv), before.bars.map(ohlcv));
    assert.equal(after.cvd, before.cvd);
    assert.equal(after.price, before.price);
    assert.equal(after.volume, before.volume);
    assert.equal(
      qty(after, event.side, event.price) -
        qty(before, event.side, event.price),
      event.size,
    );
  }
  const initial = new Map([
    ["buy:104", { side: "buy", bookSide: "bid", price: 104, size: 80 }],
  ]);
  const canceled = applyLedgerEvent(initial, {
    kind: "cancel",
    side: "buy",
    price: 104,
    size: 20,
  });
  assert.equal(initial.get("buy:104").size, 80);
  assert.equal(canceled.book.get("buy:104").size, 60);
  assert.equal(canceled.beforeSize - canceled.afterSize, 20);
  const cancelEvent = {
    id: "test-cancel",
    kind: "cancel",
    type: "cancel",
    side: "buy",
    price: 104,
    size: 10,
    at: 28900,
    barIndex: 8,
    fraction: 0.8625,
    x: 8.8625,
    delta: 0,
    cvd: -70,
  };
  const canceledStory = {
    ...story,
    events: [...story.events, cancelEvent].sort((a, b) => a.at - b.at),
  };
  const baseline = at(28900),
    modified = breakoutVolumeSnapshot(canceledStory, 28900);
  assert.deepEqual(modified.trades, baseline.trades);
  assert.deepEqual(modified.bars, baseline.bars);
  assert.equal(modified.price, baseline.price);
  assert.equal(modified.cvd, baseline.cvd);
  assert.equal(modified.volume, baseline.volume);
  assert.equal(modified.supportRemaining, baseline.supportRemaining - 10);
});

test("the retest reaches exactly 104 and repeated bids absorb selling while CVD declines", () => {
  const retest = at(22000).bars[7];
  assert.deepEqual(
    [retest.open, retest.close, retest.low, retest.delta],
    [107, 104, 104, -80],
  );
  assert.equal(qty(at(22000), "buy", 104), 40);
  const absorption = at(30000).bars[8];
  assert.deepEqual(
    [absorption.open, absorption.high, absorption.low, absorption.close],
    [104, 105, 104, 104],
  );
  assert.equal(absorption.sell, 240);
  assert.equal(absorption.buy, 20);
  assert.equal(absorption.delta, -220);
  assert.ok(
    absorption.rows
      .filter((row) => row.side === "sell")
      .every((row) => row.price === 104),
  );
  assert.deepEqual(
    story.quoteEvents
      .filter(
        (row) => row.barIndex === 8 && row.side === "buy" && row.price === 104,
      )
      .map((row) => [row.at, row.size]),
    [
      [23000, 100],
      [25500, 80],
      [27400, 60],
    ],
  );
  assert.equal(at(30000).cvd - at(22000).cvd, -220);
  assert.equal(at(30000).cvd, -70);
  assert.equal(qty(at(30000), "buy", 104), 40);
  for (let time = 22600; time < 30000; time += 71)
    assert.equal(at(time).bars[8].low, 104);
});

test("only subsequent aggressive buying lifts the final bar from 105 to 109", () => {
  const push = at(36000).bars[9];
  assert.deepEqual(
    [push.open, push.high, push.low, push.close, push.volume, push.delta],
    [105, 109, 105, 109, 180, 160],
  );
  assert.deepEqual(
    push.rows.filter((row) => row.side === "buy").map((row) => row.price),
    [105, 106, 107, 108, 109],
  );
  assert.equal(at(30099).price, 104);
  assert.equal(at(30100).price, 104);
  assert.equal(at(30599).price, 104);
  assert.equal(at(30600).price, 105);
  assert.equal(at(34800).price, 109);
  assert.equal(at(36000).cvd - at(30000).cvd, 160);
});

test("diagonal imbalances compare adjacent nonzero opposite cells, including selling absorbed at 104", () => {
  const floor = story.bars[8].footprint.find((row) => row.price === 104);
  assert.equal(floor.bid, 240);
  assert.equal(floor.sellComparison, 20);
  assert.equal(floor.sellRatio, 12);
  assert.equal(floor.sellImbalance, true);
  const recovery = story.bars[9].footprint.find((row) => row.price === 107);
  assert.equal(recovery.ask, 30);
  assert.equal(recovery.buyComparison, 10);
  assert.equal(recovery.buyRatio, 3);
  assert.equal(recovery.buyImbalance, true);
  const alone = footprintOf([{ price: 104, side: "sell", size: 240 }])[0];
  assert.equal(alone.sellImbalance, false);
  assert.equal(alone.sellRatio, null);
  const below = footprintOf([
    { price: 104, side: "sell", size: 59 },
    { price: 105, side: "buy", size: 20 },
  ]).find((row) => row.price === 104);
  assert.equal(below.sellImbalance, false);
});

test("heat history is exact resting quantity and stops at the common visible time cursor", () => {
  const final = at(40000);
  for (const segment of final.heatSegments) {
    assert.ok(segment.size > 0 && segment.x0 < segment.x1);
    assert.ok(segment.x0 >= 0 && segment.x1 <= 10);
    assert.ok(segment.startAt < segment.endAt);
    const book = bookAt((segment.startAt + segment.endAt) / 2);
    assert.equal(
      book.get(segment.side + ":" + segment.price)?.size ?? 0,
      segment.size,
    );
  }
  for (const [atTime, size] of [
    [23000, 100],
    [25500, 80],
    [27400, 60],
    [28200, 40],
  ]) {
    const segment = final.heatSegments.find(
      (row) =>
        row.side === "buy" && row.price === 104 && row.startAt === atTime,
    );
    assert.equal(segment.size, size);
  }
  for (let time = 7000; time <= 36000; time += 173) {
    const state = at(time);
    assert.ok(
      state.heatSegments.every(
        (segment) =>
          segment.x1 <= state.cursorX + 1e-10 &&
          segment.endAt <= state.effectiveTime,
      ),
    );
  }
});

test("all prints, CVD points and phase boundaries share a finite barIndex-plus-fraction axis", () => {
  const final = at(40000);
  for (const trade of story.trades) {
    const range = BAR_RANGES[trade.barIndex],
      point = final.cvdPoints.find((row) => row.id === trade.id);
    assert.equal(trade.x, trade.barIndex + trade.fraction);
    assert.ok(trade.fraction > 0 && trade.fraction < 1);
    assert.equal(
      trade.fraction,
      (trade.at - range.startAt) / (range.endAt - range.startAt),
    );
    assert.equal(point.x, trade.x);
    assert.equal(point.cvd, trade.cvd);
  }
  for (const [time, x] of [
    [7000, 5],
    [13000, 6],
    [19000, 7],
    [22000, 8],
    [30000, 9],
    [36000, 10],
  ])
    assert.equal(timePosition(time), x);
});

test("forty-second reverse seeking and all six scene boundaries are deterministic", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b, 0),
    40000,
  );
  assert.equal(TOTAL_DURATION, 40000);
  for (let scene = 0; scene < SCENE_DURATIONS.length; scene++) {
    assert.equal(scenePosition(scene, -100).time, SCENE_STARTS[scene]);
    assert.equal(
      scenePosition(scene, 1e9).time,
      SCENE_STARTS[scene] + SCENE_DURATIONS[scene],
    );
    if (scene < 5)
      assert.equal(
        scenePosition(scene, SCENE_DURATIONS[scene]).time,
        scenePosition(scene + 1, 0).time,
      );
  }
  const source = JSON.stringify(story),
    checkpoints = [
      0, 4000, 6999, 7000, 7600, 13000, 19000, 21300, 22000, 23000, 25500,
      27400, 30000, 34800, 36000, 39000, 40000,
    ];
  const snapshots = checkpoints.map(at);
  for (let i = checkpoints.length - 1; i >= 0; i--)
    assert.deepEqual(at(checkpoints[i]), snapshots[i]);
  assert.equal(JSON.stringify(story), source);
  assert.deepEqual(at(36000).bars, at(40000).bars);
});
