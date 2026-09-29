import test from "node:test";
import assert from "node:assert/strict";
import {
  createAbsorptionStory, absorptionSnapshot, applyLedgerEvent, footprintOf,
  SCENE_DURATIONS, SCENE_STARTS, TOTAL_DURATION, TIMING, BAR_RANGES,
  scenePosition, timePosition,
} from "../public/orderflow/absorption-story-model.js";
const story = createAbsorptionStory();
const at = time => absorptionSnapshot(story, time);
const sum = (rows, field = "size") => rows.reduce((total, row) => total + row[field], 0);
const qty = (state, side, price) => state[side === "buy" ? "bids" : "asks"].find(row => row.price === price)?.size ?? 0;
const ohlcv = bar => bar && [bar.open, bar.high, bar.low, bar.close, bar.volume, bar.delta];
function bookAt(time) {
  let book = new Map();
  for (const event of story.events.filter(event => event.at <= time)) book = applyLedgerEvent(book, event).book;
  return book;
}

test("one ordered ledger produces all nine specified OHLCV bars, deltas and CVD totals", () => {
  assert.deepEqual(createAbsorptionStory(), story);
  assert.deepEqual(story.bars.map(ohlcv), [
    [98,99,98,99,20,10], [99,100,99,100,20,10], [100,102,100,102,20,10],
    [102,104,102,103,100,60], [103,104,102,103,120,80], [103,104,103,104,150,110],
    [104,106,104,106,110,90], [106,106,105,106,280,240], [106,106,102,102,320,-240],
  ]);
  let cvd = 0;
  for (const bar of story.bars) {
    assert.equal(bar.open, bar.rows[0].price);
    assert.equal(bar.high, Math.max(...bar.rows.map(row => row.price)));
    assert.equal(bar.low, Math.min(...bar.rows.map(row => row.price)));
    assert.equal(bar.close, bar.rows.at(-1).price);
    assert.equal(bar.volume, sum(bar.rows));
    assert.equal(bar.delta, sum(bar.rows, "delta"));
    assert.equal(sum(bar.footprint, "volume"), bar.volume);
    assert.equal(sum(bar.footprint, "ask") - sum(bar.footprint, "bid"), bar.delta);
    cvd += bar.delta;
    assert.equal(bar.cvd, cvd);
  }
  const final = at(TOTAL_DURATION);
  assert.equal(final.volume, 1140);
  assert.equal(sum(final.trades.filter(row => row.side === "buy")), 755);
  assert.equal(sum(final.trades.filter(row => row.side === "sell")), 385);
  assert.equal(final.cvd, 370);
  assert.equal(Math.max(...final.cvdPoints.map(point => point.cvd)), 620);
  assert.equal(final.price, 102);
});

test("every execution consumes the current best opposing quote and quantity is conserved by side and price", () => {
  let book = new Map();
  const accounts = new Map();
  for (const event of story.events) {
    const result = applyLedgerEvent(book, event), key = result.restingSide + ":" + event.price;
    const balance = (accounts.get(key) ?? 0) + (event.kind === "add" ? event.size : -event.size);
    accounts.set(key, balance);
    assert.equal(balance, result.afterSize);
    assert.equal(event.beforeSize, result.beforeSize);
    assert.equal(event.afterSize, result.afterSize);
    assert.equal(result.beforeSize + (event.kind === "add" ? event.size : -event.size), result.afterSize);
    assert.ok(result.afterSize >= 0);
    book = result.book;
    const bids = [...book.values()].filter(row => row.side === "buy");
    const asks = [...book.values()].filter(row => row.side === "sell");
    if (bids.length && asks.length) assert.ok(Math.max(...bids.map(row => row.price)) < Math.min(...asks.map(row => row.price)));
  }
  assert.deepEqual([...book.values()], [{ side: "sell", bookSide: "ask", price: 106, size: 70 }]);
  for (const [key, balance] of accounts) assert.equal(book.get(key)?.size ?? 0, balance);
  assert.throws(() => applyLedgerEvent(new Map(), { kind: "trade", side: "buy", price: 104, size: 1 }), RangeError);
  const quoted = applyLedgerEvent(new Map(), { kind: "add", side: "sell", price: 104, size: 10 }).book;
  assert.throws(() => applyLedgerEvent(quoted, { kind: "cancel", side: "sell", price: 104, size: 11 }), RangeError);
  assert.throws(() => applyLedgerEvent(quoted, { kind: "trade", side: "buy", price: 105, size: 1 }), RangeError);
  assert.throws(() => applyLedgerEvent(quoted, { kind: "add", side: "buy", price: 104, size: 1 }), RangeError);
});

test("preview contains six completed bars only, and explicit replay resets only the final pressure test", () => {
  for (const time of [0, 4000, 6000, 6999]) {
    const state = at(time);
    assert.equal(state.preview, true);
    assert.equal(state.replay, false);
    assert.equal(state.bars.filter(Boolean).length, 6);
    assert.ok(state.bars.slice(6).every(bar => bar === null));
    assert.ok(state.trades.every(row => row.barIndex <= 5));
    assert.deepEqual(state.bars.slice(0, 6), story.bars.slice(0, 6));
    assert.equal(state.cvd, 280);
  }
  const reset = at(TIMING.reset);
  assert.equal(reset.replay, true);
  assert.equal(reset.preview, false);
  assert.deepEqual(reset.bars.slice(0, 5), story.bars.slice(0, 5));
  assert.ok(reset.bars.slice(5).every(bar => bar === null));
  assert.equal(reset.cvd, 170);
  assert.equal(reset.price, 103);
  assert.equal(qty(reset, "sell", 104), 180);
  for (let time = TIMING.reset; time <= TOTAL_DURATION; time += 83) {
    const state = at(time);
    assert.ok(state.trades.every(row => row.at <= state.effectiveTime));
    assert.ok(state.events.every(row => row.at <= state.effectiveTime));
    assert.ok(state.bars.filter(Boolean).every(bar => bar.rows.every(row => row.at <= state.effectiveTime)));
  }
});

test("trade event boundaries update OHLC, footprint, CVD and book together", () => {
  for (const trade of story.trades.filter(row => row.barIndex >= 5)) {
    const before = at(trade.at - 1), after = at(trade.at);
    assert.equal(after.volume - before.volume, trade.size);
    assert.equal(after.cvd - before.cvd, trade.delta);
    assert.equal(after.price, trade.price);
    assert.equal(after.trades.length, before.trades.length + 1);
    assert.equal(after.latestTrade.id, trade.id);
    assert.equal(after.cvdPoints.at(-1).cvd, after.cvd);
    const bar = after.bars[trade.barIndex], row = bar.footprint.find(row => row.price === trade.price);
    assert.equal(bar.close, trade.price);
    assert.equal(row[trade.side === "buy" ? "ask" : "bid"], sum(bar.rows.filter(row => row.price === trade.price && row.side === trade.side)));
    assert.equal(qty(before, trade.restingSide, trade.price) - qty(after, trade.restingSide, trade.price), trade.size);
  }
});

test("quote adds and cancellations alter depth without inventing a print or changing CVD or OHLC", () => {
  for (const event of story.quoteEvents.filter(row => row.at > TIMING.reset)) {
    const before = at(event.at - 1), after = at(event.at);
    assert.deepEqual(after.trades, before.trades);
    assert.deepEqual(after.bars.map(ohlcv), before.bars.map(ohlcv));
    assert.equal(after.cvd, before.cvd);
    assert.equal(after.price, before.price);
    assert.equal(after.volume, before.volume);
    assert.equal(qty(after, event.side, event.price) - qty(before, event.side, event.price), event.size * (event.kind === "add" ? 1 : -1));
  }
  const before = at(TIMING.withdrawal - 1), after = at(TIMING.withdrawal);
  assert.equal(qty(before, "sell", 104), 60);
  assert.equal(qty(after, "sell", 104), 10);
  assert.equal(before.price, 104);
  assert.equal(after.price, 104);
  assert.equal(before.cvd, 280);
  assert.equal(after.cvd, 280);
  assert.equal(at(14800).price, 104);
  assert.equal(qty(at(14800), "sell", 104), 0);
  assert.equal(at(15999).price, 104);
  assert.equal(at(16000).price, 105);
});

test("three pressure tests are high volume and positive delta, followed by a breakout and high positive delta without further price progress", () => {
  const baseline = sum(story.bars.slice(0, 3), "volume") / 3;
  assert.equal(baseline, 20);
  for (const bar of story.bars.slice(3, 6)) {
    assert.ok(bar.volume >= baseline * 5);
    assert.ok(bar.delta > 0);
    assert.equal(bar.high, 104);
    assert.ok(bar.close <= 104);
  }
  const breakout = at(22000).bars[6];
  assert.equal(breakout.close, 106);
  assert.equal(breakout.delta, 90);
  const high = at(32000).bars[7];
  assert.deepEqual([high.open, high.high, high.close, high.volume, high.delta], [106,106,106,280,240]);
  assert.equal(high.buy, 260);
  assert.equal(high.sell, 20);
  assert.ok(high.rows.filter(row => row.side === "buy").every(row => row.price === 106));
  assert.equal(at(32000).cvd - at(22000).cvd, 240);
  assert.deepEqual(story.quoteEvents.filter(row => row.barIndex === 7 && row.side === "sell").map(row => row.size), [120,100,80]);
  const falling = at(42000).bars[8];
  assert.deepEqual([falling.open, falling.close, falling.volume, falling.delta], [106,102,320,-240]);
  assert.equal(falling.sell, 280);
  assert.equal(falling.buy, 40);
  assert.equal(at(42000).cvd - at(32000).cvd, -240);
});

test("diagonal imbalances use three times a nonzero opposing adjacent-price cell", () => {
  const high = story.bars[7].footprint.find(row => row.price === 106);
  assert.equal(high.ask, 260);
  assert.equal(high.buyComparison, 20);
  assert.equal(high.buyRatio, 13);
  assert.equal(high.buyImbalance, true);
  const falling = story.bars[8].footprint;
  for (const [price, ratio] of [[105,5],[104,6],[103,7],[102,10]]) {
    const row = falling.find(row => row.price === price);
    assert.equal(row.sellRatio, ratio);
    assert.equal(row.sellImbalance, true);
    assert.ok(row.sellComparison > 0);
  }
  const missing = footprintOf([{ price: 106, side: "buy", size: 100 }])[0];
  assert.equal(missing.buyImbalance, false);
  assert.equal(missing.buyRatio, null);
  const exact = footprintOf([{ price: 106, side: "buy", size: 9 }, { price: 105, side: "sell", size: 3 }]);
  assert.equal(exact[0].buyImbalance, true);
  assert.equal(exact[0].buyRatio, 3);
  const below = footprintOf([{ price: 106, side: "buy", size: 8 }, { price: 105, side: "sell", size: 3 }]);
  assert.equal(below[0].buyImbalance, false);
});

test("heat segments carry exactly the resting quantity between ledger changes on the common bar axis", () => {
  const final = at(TOTAL_DURATION);
  assert.ok(final.heatSegments.length > 0);
  for (const segment of final.heatSegments) {
    assert.ok(segment.size > 0 && segment.x0 < segment.x1);
    assert.ok(segment.x0 >= 0 && segment.x1 <= 9);
    assert.ok(segment.startAt < segment.endAt);
    const middleTime = (segment.startAt + segment.endAt) / 2;
    const book = bookAt(middleTime);
    assert.equal(book.get(segment.side + ":" + segment.price)?.size ?? 0, segment.size);
  }
  const beforeCancel = final.heatSegments.find(segment => segment.side === "sell" && segment.price === 104 && segment.startAt === 12800);
  const afterCancel = final.heatSegments.find(segment => segment.side === "sell" && segment.price === 104 && segment.startAt === 13500);
  assert.equal(beforeCancel.size, 60);
  assert.equal(afterCancel.size, 10);
  const afterRefill = final.heatSegments.find(segment => segment.side === "sell" && segment.price === 106 && segment.startAt === 23300);
  assert.equal(afterRefill.size, 120);
  for (let time = TIMING.reset; time <= 42000; time += 193) {
    const state = at(time);
    assert.ok(state.heatSegments.every(segment => segment.x1 <= state.cursorX + 1e-10 && segment.endAt <= state.effectiveTime));
  }
});

test("every trade, CVD point and bar range uses a finite shared horizontal coordinate", () => {
  for (const trade of story.trades) {
    const range = BAR_RANGES[trade.barIndex];
    assert.equal(trade.x, trade.barIndex + trade.fraction);
    assert.ok(trade.fraction > 0 && trade.fraction < 1);
    assert.equal(trade.fraction, (trade.at - range.startAt) / (range.endAt - range.startAt));
    const point = at(TOTAL_DURATION).cvdPoints.find(row => row.id === trade.id);
    assert.equal(point.x, trade.x);
    assert.equal(point.cvd, trade.cvd);
  }
  assert.equal(timePosition(7000), 5);
  assert.equal(timePosition(14000), 6);
  assert.equal(timePosition(22000), 7);
  assert.equal(timePosition(32000), 8);
  assert.equal(timePosition(42000), 9);
});

test("reverse seeking is deterministic, preserves the story and reaches all six scene boundaries", () => {
  assert.equal(sum(SCENE_DURATIONS.map(size => ({ size }))), TOTAL_DURATION);
  assert.equal(TOTAL_DURATION, 48000);
  for (let scene = 0; scene < SCENE_DURATIONS.length; scene++) {
    assert.equal(scenePosition(scene, -100).time, SCENE_STARTS[scene]);
    assert.equal(scenePosition(scene, 1e9).time, SCENE_STARTS[scene] + SCENE_DURATIONS[scene]);
    if (scene < SCENE_DURATIONS.length - 1) assert.equal(scenePosition(scene, SCENE_DURATIONS[scene]).time, scenePosition(scene + 1, 0).time);
  }
  const source = JSON.stringify(story);
  const checkpoints = [0,6999,7000,7800,13500,14000,17000,22000,23300,28000,32000,33500,38000,42000,46000,48000];
  const snapshots = checkpoints.map(at);
  for (let i = checkpoints.length - 1; i >= 0; i--) assert.deepEqual(at(checkpoints[i]), snapshots[i]);
  assert.equal(JSON.stringify(story), source);
  assert.deepEqual(at(42000).bars, at(48000).bars);
  assert.deepEqual(at(42000).bars, story.bars);
});
