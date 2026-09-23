import test from "node:test";
import assert from "node:assert/strict";
import { curriculum, courseById } from "../public/orderflow/legacy/curriculum.js";
import { GuidedLesson } from "../public/orderflow/legacy/guided-model.js";

function at(id, step = Infinity) {
  const lesson = new GuidedLesson(courseById(id));
  while (lesson.step < Math.min(step, lesson.course.steps.length - 1))
    lesson.advance();
  return lesson;
}
test("all guided courses replay deterministically, with coherent OHLC and volume", () => {
  assert.equal(curriculum.length, 15);
  assert.equal(new Set(curriculum.map((course) => course.id)).size, 15);
  for (const course of curriculum.slice(1)) {
    const lesson = new GuidedLesson(course);
    for (let step = 0; step < course.steps.length - 1; step++) {
      const before = lesson.snapshot();
      const preview = lesson.previewNext();
      assert.deepEqual(
        lesson.snapshot(),
        before,
        `${course.id}: preview must not reveal or mutate`,
      );
      assert.deepEqual(
        lesson.advance(),
        preview.snapshot,
        `${course.id}: real operation matches preview`,
      );
      const s = lesson.snapshot();
      assert.equal(s.stats.volume, s.stats.buy + s.stats.sell);
      assert.equal(s.candle.close, s.price);
      assert.ok(s.candle.high >= Math.max(s.candle.open, s.candle.close));
      assert.ok(s.candle.low <= Math.min(s.candle.open, s.candle.close));
    }
    assert.deepEqual(lesson.snapshot(), at(course.id).snapshot());
    assert.ok(
      course.quiz.answer >= 0 &&
        course.quiz.answer < course.quiz.options.length,
    );
  }
});
test("placing and cancelling changes depth without fabricating a trade", () => {
  const m = at("limit", 0),
    original = m.snapshot();
  const placed = m.advance();
  assert.equal(
    placed.bids.find((r) => r.price === 98).size,
    original.bids.find((r) => r.price === 98).size + 3,
  );
  assert.equal(placed.stats.volume, 0);
  assert.equal(placed.price, 100);
  const cancelled = m.advance();
  assert.deepEqual(cancelled.bids, original.bids);
  assert.deepEqual(cancelled.candle, original.candle);
  assert.equal(m.advance().stats.volume, 1);
});
test("equal orders cost more in thin depth; frames reveal each fill in order", () => {
  const m = at("slippage", 2);
  const preview = m.previewNext();
  assert.deepEqual(
    preview.frames.map((f) => [f.fill.price, f.snapshot.stats.volume]),
    [
      [101, 1],
      [102, 2],
      [104, 3],
    ],
  );
  assert.equal(m.snapshot().stats.volume, 0);
  const s = at("slippage").snapshot();
  assert.deepEqual(
    s.comparisons.map((r) => r.filled),
    [3, 3],
  );
  assert.equal(s.comparisons[0].avg, 101);
  assert.equal(s.comparisons[1].avg, 307 / 3);
});
test("a wall cancellation changes the next quote, not the last trade or volume", () => {
  const m = at("wall", 1),
    before = m.snapshot();
  const s = m.advance();
  assert.equal(s.asks[0].price, 104);
  assert.deepEqual(s.stats, before.stats);
  assert.equal(s.price, 101);
  assert.equal(m.advance().price, 104);
});
test("Delta resets at interval boundaries while CVD carries forward", () => {
  const m = at("cvd", 2);
  assert.equal(m.snapshot().delta, 2);
  assert.equal(m.advance().delta, 0);
  const s = m.advance();
  assert.deepEqual(s.intervals, [2]);
  assert.equal(s.delta, -1);
  assert.equal(s.stats.cvd, 1);
  assert.equal(s.stats.volume, 7);
});
test("footprint separates traded sides and supplies actual adjacent-price comparison", () => {
  const s = at("footprint").snapshot();
  assert.deepEqual(s.profile, [
    { price: 102, buy: 3, sell: 0, volume: 3 },
    { price: 101, buy: 2, sell: 1, volume: 3 },
  ]);
  assert.equal(s.profile[0].buy / s.profile[1].sell, 3);
});
test("POC and VWAP use executed volume, including the explicit VWAP anchor", () => {
  const profile = at("profile").snapshot().profile;
  assert.equal(
    profile.reduce((a, b) => (a.volume > b.volume ? a : b)).price,
    102,
  );
  assert.equal(
    profile.reduce((sum, r) => sum + r.volume, 0),
    6,
  );
  const s = at("vwap").snapshot();
  assert.equal(s.stats.volume, 4);
  assert.equal(s.stats.vwap, 103);
  assert.equal(s.price, 104);
});
test("iceberg slices replenish but conserve the known reserve", () => {
  const m = at("iceberg", 3);
  assert.equal(m.snapshot().asks[0].size, 1);
  assert.equal(m.snapshot().asks[0].hidden, 3);
  const frames = m.previewNext().frames;
  assert.deepEqual(
    frames.map((f) => f.fill.size),
    [1, 1, 1],
  );
  const s = m.advance();
  assert.equal(s.stats.volume, 5);
  assert.equal(s.asks[0].size + s.asks[0].hidden + s.stats.volume, 6);
  assert.equal(s.price, 101);
});
test("repeated aggressive buying raises CVD while resting supply absorbs at one price", () => {
  const m = at("absorption", 0);
  for (const volume of [3, 6, 9]) {
    const s = m.advance();
    assert.equal(s.stats.volume, volume);
    assert.equal(s.stats.cvd, volume);
    assert.equal(s.price, 101);
    assert.equal(s.candle.high, 101);
    assert.equal(s.asks.find((r) => r.price === 101).size, 12 - volume);
  }
});
test("heatmap retains earlier depth and cancelled volume is never a trade", () => {
  const s = at("heatmap").snapshot();
  assert.equal(s.tape[0].asks.find((r) => r.price === 101).size, 8);
  assert.ok(
    s.tape.some((frame) =>
      frame.asks.some((r) => r.price === 101 && r.size === 12),
    ),
  );
  assert.ok(!s.tape.at(-1).asks.some((r) => r.price === 101));
  assert.equal(s.stats.volume, 0);
  assert.equal(s.stats.cvd, 0);
  assert.equal(s.price, 100);
});
test("OI counts one side of each open contract, while transfers still trade", () => {
  const m = at("oi", 0);
  assert.equal(m.advance().oi, 2);
  assert.equal(m.advance().oi, 2);
  const s = m.advance();
  assert.equal(s.oi, 1);
  assert.equal(s.stats.volume, 4);
});
test("funding settles in opposite directions without adding price or trade events", () => {
  const m = at("funding", 2);
  assert.equal(m.snapshot().payment, 1);
  assert.equal(m.advance().payment, null);
  assert.equal(m.advance().payment, -1);
  const s = m.advance();
  assert.equal(s.premium.percent, 2);
  assert.equal(s.stats.volume, 0);
  assert.deepEqual(s.candle, {
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1,
  });
});
test("risk trigger itself is not a trade; forced trades count once and consume depth", () => {
  const m = at("liquidation", 1);
  assert.equal(m.snapshot().price, 100);
  assert.equal(m.snapshot().stats.volume, 0);
  assert.equal(m.snapshot().markPrice, 99);
  assert.deepEqual(
    m.snapshot().positions.map((p) => p.status),
    ["triggered", "waiting"],
  );
  assert.deepEqual(
    m.previewNext().frames.map((f) => f.fill.price),
    [99, 98, 97],
  );
  const first = m.advance();
  assert.equal(first.price, 97);
  assert.equal(first.markPrice, 99);
  assert.deepEqual(
    first.positions.map((p) => p.status),
    ["closed", "waiting"],
  );
  assert.equal(first.bids.find((r) => r.price === 97).size, 1);
  const secondTrigger = m.advance();
  assert.equal(secondTrigger.markPrice, 97);
  assert.deepEqual(secondTrigger.trades, first.trades);
  assert.deepEqual(
    secondTrigger.positions.map((p) => p.status),
    ["closed", "triggered"],
  );
  assert.deepEqual(
    m
      .previewNext()
      .frames.map((f) => [f.fill.liquidationId, f.fill.price, f.fill.size]),
    [
      ["B", 97, 1],
      ["B", 96, 2],
    ],
  );
  const s = m.advance();
  assert.equal(s.stats.volume, 6);
  assert.equal(s.stats.cvd, -6);
  assert.equal(s.oi, 6);
  assert.deepEqual(
    s.positions.map((p) => [p.status, p.filled]),
    [
      ["closed", 3],
      ["closed", 3],
    ],
  );
  assert.equal(s.price, 96);
});

test("untriggered or already-closed positions cannot produce forced fills", () => {
  const m = at("liquidation", 0);
  const original = m.snapshot();
  assert.throws(() => m.apply({ type: "liquidate", id: "A" }));
  assert.deepEqual(m.snapshot(), original);
  m.advance();
  m.advance();
  const closed = m.snapshot();
  assert.throws(() => m.apply({ type: "liquidate", id: "A" }));
  assert.deepEqual(m.snapshot(), closed);
});
test("confluence preserves the pre-reveal evidence until the next operation", () => {
  const m = at("confluence", 2),
    before = m.snapshot();
  assert.ok(m.course.steps[m.step].prediction);
  assert.equal(before.price, 101);
  assert.equal(before.stats.cvd, 5);
  assert.equal(before.asks.find((r) => r.price === 101).size, 1);
  assert.ok(before.trades.every((t) => t.side === "buy"));
  const after = m.advance();
  assert.equal(after.price, 102);
  assert.equal(after.stats.cvd, 7);
  assert.ok(!after.asks.some((r) => r.price === 101));
  assert.deepEqual(
    after.trades.slice(-2).map((t) => [t.price, t.size]),
    [
      [101, 1],
      [102, 1],
    ],
  );
});
