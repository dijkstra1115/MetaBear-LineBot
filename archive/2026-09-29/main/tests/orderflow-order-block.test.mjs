import test from "node:test";
import assert from "node:assert/strict";
import {
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
  scenePosition,
  createOrderBlockStory,
  orderBlockSnapshot,
  candleFromTrades,
  detectOrderBlock,
} from "../public/orderflow/order-block-model.js";
import {
  drawOrderBlock,
  cameraAt,
  projectPoint,
  columnX,
  priceY,
} from "../public/orderflow/order-block-view.js";
const story = createOrderBlockStory();
const at = (time, reduced = false) => {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= time);
  const p = scenePosition(scene, time - SCENE_STARTS[scene], reduced);
  return { ...p, state: orderBlockSnapshot(story, time) };
};
test("all eleven candles derive from their own fills and the reference high predates the replay", () => {
  assert.equal(story.bars.length, 11);
  for (const bar of story.bars)
    assert.deepEqual(candleFromTrades(bar.rows, bar.index), bar);
  assert.equal(story.referenceHigh, 105);
  assert.equal(
    story.referenceHigh,
    Math.max(...story.bars.slice(0, 4).map((b) => b.high)),
  );
  for (const [index, expected] of [
    [4, [103, 104, 101, 102, 60]],
    [5, [102, 107, 102, 107, 30]],
  ]) {
    const b = story.bars[index];
    assert.deepEqual([b.open, b.high, b.low, b.close, b.volume], expected);
  }
});
test("the marked origin is the last down candle, and boundaries include both wicks", () => {
  const zone = detectOrderBlock(story.bars, 5, story.referenceHigh);
  assert.deepEqual(zone, {
    originIndex: 4,
    confirmationIndex: 5,
    low: 101,
    high: 104,
    referenceHigh: 105,
  });
  assert.ok(zone.low < story.bars[4].close);
  assert.ok(zone.high > story.bars[4].open);
  const unfinished = story.bars.map((b) =>
    b.index === 5 ? { ...b, closed: false } : b,
  );
  assert.equal(detectOrderBlock(unfinished, 5, 105), null);
  const wickOnly = story.bars.map((b) =>
    b.index === 5 ? { ...b, close: 105 } : b,
  );
  assert.equal(detectOrderBlock(wickOnly, 5, 105), null);
});
test("completed opening history is explicitly separate from replay without revealing unplayed bars", () => {
  assert.equal(at(0).state.replay, false);
  assert.equal(at(0).state.bars.filter(Boolean).length, 11);
  assert.equal(at(0).state.zone, null);
  assert.equal(at(TIMING.reset).state.bars.filter(Boolean).length, 4);
  assert.equal(at(TIMING.reset).state.lastPrice, 103);
  for (let time = TIMING.reset; time < TIMING.zoomOut; time += 100) {
    const state = at(time).state;
    assert.ok(state.trades.every((t) => t.at <= time));
    assert.ok(state.bars.slice(6).every((b) => b === null));
    for (const b of state.bars.slice(4).filter(Boolean))
      assert.ok(b.rows.every((t) => t.at <= time));
  }
  assert.deepEqual(at(TIMING.zoomOut).state.bars, story.bars);
  assert.deepEqual(at(TOTAL_DURATION).state.bars, story.bars);
});
test("intrabar prints above the prior high never confirm before the actual close", () => {
  const intrabar = at(26200).state;
  assert.equal(intrabar.impulse.close, 106);
  assert.equal(intrabar.impulse.closed, false);
  assert.equal(intrabar.zone, null);
  assert.equal(at(TIMING.confirm - 1).state.confirmed, false);
  assert.equal(at(TIMING.confirm).state.confirmed, true);
  assert.equal(at(TIMING.confirm).state.impulse.close, 107);
  assert.deepEqual(
    at(TIMING.confirm).state.zone,
    detectOrderBlock(story.bars, 5, 105),
  );
  for (const time of [0, 5000, 14000, 23000, TIMING.confirm - 1])
    assert.doesNotMatch(drawOrderBlock(at(time)).svg, /data-ob-zone=/);
  assert.match(
    drawOrderBlock(at(TIMING.zone)).svg,
    /data-ob-zone="true" data-zone-high="104" data-zone-low="101"/,
  );
});
test("each fill changes K, volume and the corresponding remaining depth at precisely the same playhead", () => {
  for (const trade of story.trades) {
    const before = at(trade.at - 1).state,
      after = at(trade.at).state;
    assert.equal(after.trades.length, before.trades.length + 1);
    const key = trade.barIndex === 4 ? "originVolume" : "impulseVolume";
    assert.equal(after[key] - before[key], trade.size);
    assert.equal(after.lastPrice, trade.price);
    assert.equal(after.bars[trade.barIndex].close, trade.price);
    if (trade.barIndex === 5) {
      const askBefore = before.asks.find((a) => a.price === trade.price),
        askAfter = after.asks.find((a) => a.price === trade.price);
      assert.equal(askBefore.remaining - askAfter.remaining, trade.size);
      assert.equal(askAfter.remaining, 0);
      assert.match(
        drawOrderBlock(at(trade.at)).svg,
        new RegExp(`data-ask-price="${trade.price}" data-remaining="0"`),
      );
    } else {
      if (trade.passive) {
        const bidBefore = before.bids.find((b) => b.price === trade.price),
          bidAfter = after.bids.find((b) => b.price === trade.price);
        assert.equal(bidBefore.remaining - bidAfter.remaining, trade.size);
        assert.equal(bidAfter.remaining, 0);
        assert.match(
          drawOrderBlock(at(trade.at)).svg,
          new RegExp(`data-bid-price="${trade.price}" data-remaining="0"`),
        );
      } else assert.deepEqual(after.bids, before.bids);
    }
    assert.match(
      drawOrderBlock(at(trade.at)).svg,
      new RegExp(`data-a-filled="${after.execution.filled}"`),
    );
    assert.match(
      drawOrderBlock(at(trade.at)).svg,
      new RegExp(`data-a-remaining="${after.execution.remaining}"`),
    );
    assert.match(
      drawOrderBlock(at(trade.at)).svg,
      new RegExp(
        `data-candle="${trade.barIndex}"[^>]+data-close="${trade.price}"[^>]+data-volume="${after[key]}"`,
      ),
    );
  }
  for (let time = TIMING.book; time <= TIMING.confirm; time += 100) {
    const state = at(time).state;
    assert.ok(state.asks.every((a) => a.remaining >= 0));
    assert.equal(
      state.impulseVolume +
        state.asks.reduce((sum, ask) => sum + ask.remaining, 0),
      30,
    );
  }
  assert.equal(
    at(TIMING.book).state.lastPrice,
    at(TIMING.book - 1).state.lastPrice,
  );
  assert.equal(at(TIMING.book).state.impulseVolume, 0);
  assert.equal(
    at(TIMING.bids).state.lastPrice,
    at(TIMING.bids - 1).state.lastPrice,
  );
  assert.equal(at(TIMING.bids).state.execution.filled, 0);
  for (let time = TIMING.bids; time <= TIMING.originClose; time += 100) {
    const state = at(time).state;
    assert.ok(state.bids.every((b) => b.remaining >= 0));
    assert.equal(
      state.execution.passiveFilled +
        state.bids.reduce((sum, bid) => sum + bid.remaining, 0),
      50,
    );
  }
});
test("A only buys: 50 passive and 30 aggressive fills meet the 80-unit target without counting unrelated trades", () => {
  const aTrades = story.trades.filter((trade) => trade.buyer === "A");
  assert.equal(aTrades.length, 9);
  assert.equal(story.history.filter((trade) => trade.seller === "A").length, 0);
  const passive = aTrades.filter((trade) => trade.passive);
  const aggressive = aTrades.filter((trade) => !trade.passive);
  assert.deepEqual(
    passive.map((trade) => [trade.price, trade.size, trade.side]),
    [
      [103, 12, "sell"],
      [102, 18, "sell"],
      [101, 20, "sell"],
    ],
  );
  assert.deepEqual(
    aggressive.map((trade) => [trade.price, trade.size, trade.side]),
    [102, 103, 104, 105, 106, 107].map((price) => [price, 5, "buy"]),
  );
  const origin = at(TIMING.originClose).state;
  assert.equal(origin.origin.close, 102);
  assert.ok(origin.origin.close < origin.origin.open);
  assert.equal(origin.originVolume, 60);
  assert.deepEqual(origin.execution, {
    target: 80,
    passiveFilled: 50,
    aggressiveFilled: 0,
    filled: 50,
    remaining: 30,
    phase: "passive",
    cost: 5092,
    averagePrice: 101.84,
  });
  const result = at(TIMING.confirm).state;
  assert.equal(result.originVolume + result.impulseVolume, 90);
  assert.deepEqual(result.execution, {
    target: 80,
    passiveFilled: 50,
    aggressiveFilled: 30,
    filled: 80,
    remaining: 0,
    phase: "aggressive",
    cost: 8227,
    averagePrice: 102.8375,
  });
});
test("A's cost and execution totals change only on its own fills, while urgency changes no prices or volumes", () => {
  assert.equal(at(TIMING.reset).state.execution.averagePrice, null);
  for (const trade of story.trades) {
    const before = at(trade.at - 1).state.execution,
      after = at(trade.at).state.execution;
    const aSize = trade.buyer === "A" ? trade.size : 0;
    assert.equal(after.filled - before.filled, aSize);
    assert.equal(after.remaining, after.target - after.filled);
    assert.equal(after.cost - before.cost, trade.price * aSize);
    assert.equal(
      after.passiveFilled - before.passiveFilled,
      trade.passive ? aSize : 0,
    );
    assert.equal(
      after.aggressiveFilled - before.aggressiveFilled,
      trade.passive ? 0 : aSize,
    );
    assert.equal(
      after.averagePrice,
      after.filled ? after.cost / after.filled : null,
    );
    assert.deepEqual(at(trade.at + 1).state.execution, after);
  }
  const before = at(TIMING.urgency - 1).state,
    after = at(TIMING.urgency).state;
  assert.equal(before.execution.phase, "passive");
  assert.equal(after.execution.phase, "aggressive");
  assert.deepEqual({ ...after.execution, phase: "passive" }, before.execution);
  assert.deepEqual(after.trades, before.trades);
  assert.deepEqual(after.bids, before.bids);
  assert.deepEqual(after.asks, before.asks);
  assert.equal(after.lastPrice, before.lastPrice);
  assert.equal(after.originVolume, before.originVolume);
  assert.equal(after.impulseVolume, before.impulseVolume);
});
test("every selected fill consumes an existing opposite-side quote at the same price without exceeding available quantity", () => {
  assert.equal(
    new Set(story.quoteEvents.map((quote) => quote.id)).size,
    story.quoteEvents.length,
  );
  assert.equal(story.quoteEvents.length, 12);
  assert.equal(
    story.quoteEvents.reduce((sum, quote) => sum + quote.size, 0),
    90,
  );
  assert.equal(
    story.trades.reduce((sum, trade) => sum + trade.size, 0),
    90,
  );
  for (const trade of story.trades) {
    const quote = story.quoteEvents.find((q) => q.id === trade.quoteId);
    assert.ok(quote, `missing quote for ${trade.id}`);
    assert.ok(quote.at < trade.at);
    assert.equal(quote.price, trade.price);
    assert.equal(quote.side, trade.side === "buy" ? "ask" : "bid");
    assert.equal(quote.owner, trade.passive ? "A" : "other");
    const before = at(trade.at - 1).state.quotes.find(
      (q) => q.id === trade.quoteId,
    );
    const after = at(trade.at).state.quotes.find((q) => q.id === trade.quoteId);
    assert.equal(before.active, true);
    assert.ok(before.remaining >= trade.size);
    assert.equal(after.remaining, before.remaining - trade.size);
    assert.equal(after.active, after.remaining > 0);
    const book = at(trade.at - 1).state.quotes.filter(
      (q) => q.active && q.side === quote.side,
    );
    const bestPrice =
      quote.side === "ask"
        ? Math.min(...book.map((q) => q.price))
        : Math.max(...book.map((q) => q.price));
    assert.equal(trade.price, bestPrice);
  }
  assert.ok(
    at(TIMING.confirm).state.quotes.every(
      (quote) => quote.posted && !quote.active && quote.remaining === 0,
    ),
  );
});
test("quote arrivals do not change K, last price, market volume or A's execution progress", () => {
  for (const time of new Set(story.quoteEvents.map((quote) => quote.at))) {
    const before = at(time - 1).state,
      after = at(time).state;
    assert.deepEqual(after.bars, before.bars);
    assert.deepEqual(after.trades, before.trades);
    assert.equal(after.lastPrice, before.lastPrice);
    assert.equal(after.originVolume, before.originVolume);
    assert.equal(after.impulseVolume, before.impulseVolume);
    assert.deepEqual(after.execution, before.execution);
    for (const quote of after.quotes.filter((quote) => quote.at === time)) {
      const old = before.quotes.find((q) => q.id === quote.id);
      assert.equal(old.remaining, 0);
      assert.equal(old.active, false);
      assert.equal(old.posted, false);
      assert.equal(quote.remaining, quote.size);
      assert.equal(quote.active, true);
      assert.equal(quote.posted, true);
    }
  }
  const new102 = story.quoteEvents.filter(
    (quote) => quote.side === "ask" && quote.price === 102,
  );
  assert.deepEqual(
    new102.map((quote) => [quote.at, quote.size, quote.owner]),
    [
      [16200, 3, "other"],
      [19500, 5, "other"],
    ],
  );
  assert.ok(
    new102.every(
      (quote) =>
        quote.id !==
        story.quoteEvents.find((q) => q.price === 104 && q.at === 8600).id,
    ),
  );
});
test("the selected quote ledger never crosses and preserves posted quantity through forward and reverse replay", () => {
  const times = new Set([
    TIMING.reset,
    TIMING.confirm,
    ...story.quoteEvents.map((quote) => quote.at),
    ...story.trades.map((trade) => trade.at),
  ]);
  for (const time of [...times].sort((a, b) => b - a))
    for (const offset of [-1, 0, 1]) {
      if (time + offset < TIMING.reset) continue;
      const state = at(time + offset).state;
      const active = state.quotes.filter((quote) => quote.active);
      const bids = active.filter((quote) => quote.side === "bid"),
        asks = active.filter((quote) => quote.side === "ask");
      if (bids.length && asks.length)
        assert.ok(
          Math.max(...bids.map((quote) => quote.price)) <
            Math.min(...asks.map((quote) => quote.price)),
        );
      assert.ok(
        state.quotes.every(
          (quote) => quote.remaining >= 0 && quote.remaining <= quote.size,
        ),
      );
      assert.ok(
        state.quotes
          .filter((quote) => !quote.posted)
          .every((quote) => quote.remaining === 0 && !quote.active),
      );
      const postedVolume = state.quotes
        .filter((quote) => quote.posted)
        .reduce((sum, quote) => sum + quote.size, 0);
      assert.equal(
        state.quotes.reduce((sum, quote) => sum + quote.remaining, 0) +
          state.originVolume +
          state.impulseVolume,
        postedVolume,
      );
    }
});
test("40 seconds of deterministic replay and reverse seeking preserve numbers in reduced motion", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b, 0),
    TOTAL_DURATION,
  );
  assert.equal(TOTAL_DURATION, 40000);
  for (let i = 0; i < 3; i++)
    assert.equal(
      scenePosition(i, SCENE_DURATIONS[i]).time,
      scenePosition(i + 1, 0).time,
    );
  const original = structuredClone(story);
  for (let time = TOTAL_DURATION; time >= 0; time -= 125) {
    assert.deepEqual(
      at(time).state,
      orderBlockSnapshot(createOrderBlockStory(), time),
    );
    for (const reduced of [false, true]) {
      assert.deepEqual(at(time, reduced).state, at(time).state);
      assert.doesNotMatch(
        drawOrderBlock(at(time, reduced)).svg,
        /NaN|Infinity|undefined|(?:width|height|r)="-/,
      );
    }
  }
  assert.deepEqual(story, original);
});
test("the camera returns to the original panorama, keeping all selected prices and fills inside the crop", () => {
  for (const reduced of [false, true]) {
    assert.deepEqual(cameraAt(0, reduced), cameraAt(TOTAL_DURATION, reduced));
    assert.equal(cameraAt(0, reduced).scale, 0.24);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1);
    for (let time = 0; time <= TOTAL_DURATION; time += 25) {
      const camera = cameraAt(time, reduced);
      for (const index of [4, 5])
        for (const price of [101, 104, 107]) {
          const point = projectPoint(columnX(index), priceY(price), camera);
          assert.ok(
            point.x - 22 * camera.scale >= 56 &&
              point.x + 22 * camera.scale <= 944,
            `candle bounds at ${time}`,
          );
          assert.ok(
            point.y - 5 * camera.scale >= 85 &&
              point.y + 5 * camera.scale <= 358,
            `candle price bounds at ${time}`,
          );
        }
      for (const price of story.bids.map((bid) => bid.price)) {
        const top = projectPoint(109.5, priceY(price) - 14.5, camera);
        const bottom = projectPoint(232.5, priceY(price) + 14.5, camera);
        assert.ok(top.x >= 56 && bottom.x <= 944);
        assert.ok(
          top.y >= 80 && bottom.y <= 358,
          `active bid outline at ${time}`,
        );
      }
      for (const price of story.asks.map((ask) => ask.price)) {
        const top = projectPoint(723, priceY(price) - 13.5, camera);
        const bottom = projectPoint(837, priceY(price) + 13.5, camera);
        assert.ok(top.x >= 56 && bottom.x <= 944);
        assert.ok(
          top.y >= 80 && bottom.y <= 358,
          `active ask outline at ${time}`,
        );
      }
    }
    const opening = drawOrderBlock(at(0, reduced)).svg,
      ending = drawOrderBlock(at(TOTAL_DURATION, reduced)).svg;
    const candles = (svg) =>
      [
        ...svg.matchAll(
          /data-candle="\d+" data-open="\d+" data-high="\d+" data-low="\d+" data-close="\d+"/g,
        ),
      ].map((m) => m[0]);
    assert.deepEqual(candles(opening), candles(ending));
    assert.equal(candles(opening).length, 11);
  }
});
test("macro and detail footers do not overlap during either zoom", () => {
  for (let time = 0; time <= TOTAL_DURATION; time += 25) {
    const svg = drawOrderBlock(at(time)).svg;
    const detail = Number(
      svg.match(/<g opacity="([\d.]+)" data-footer="detail">/)[1],
    );
    const macro = Number(
      svg.match(/<g opacity="([\d.]+)" data-footer="macro">/)[1],
    );
    assert.equal(detail * macro, 0, `footer collision at ${time}`);
    for (const match of svg.matchAll(
      /<text x="938" y="([\d.]+)"[^>]+data-price-tick="true"/g,
    )) {
      const y = Number(match[1]);
      assert.ok(y - 10 >= 80 && y + 3 <= 347);
    }
  }
});
