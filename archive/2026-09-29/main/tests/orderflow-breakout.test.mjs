import test from "node:test";
import assert from "node:assert/strict";
import {
  createBreakoutStory,
  breakoutSnapshot,
  marketSnapshot,
  scenePosition,
  SCENE_STARTS,
  SCENE_DURATIONS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/breakout-model.js";
import {
  drawBreakout,
  cameraAt,
  priceY,
  columnX,
  fillX,
  projectPoint,
  comparisonAt,
  panelCamera,
} from "../public/orderflow/breakout-view.js";
const story = createBreakoutStory();
function at(playhead, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= playhead);
  const p = scenePosition(scene, playhead - SCENE_STARTS[scene], reduced);
  return { ...p, story, state: breakoutSnapshot(story, p.time) };
}

test("different known depths produce equal final candles from different exact active buy volumes", () => {
  const final = at(TOTAL_DURATION).state.markets;
  assert.deepEqual(
    final.map((m) => m.volume),
    [65, 15],
  );
  assert.deepEqual(
    final.map((m) => m.price),
    [103, 103],
  );
  assert.deepEqual(
    final.map((m) => m.remaining102),
    [0, 0],
  );
  assert.deepEqual(
    final.map((m) => m.remaining103),
    [15, 15],
  );
  assert.deepEqual(final[0].candle, final[1].candle);
  assert.deepEqual(final[0].candle, {
    open: 101,
    high: 103,
    low: 101,
    close: 103,
  });
  assert.deepEqual(
    story.markets[0].fills.map((fill) => [fill.price, fill.size]),
    [
      [102, 20],
      [102, 20],
      [102, 20],
      [103, 5],
    ],
  );
  assert.deepEqual(
    story.markets[1].fills.map((fill) => [fill.price, fill.size]),
    [
      [102, 5],
      [102, 5],
      [103, 5],
    ],
  );
});

test("exhausting the crossed level is separate from the fill above it", () => {
  for (const [index, emptyAt, breakAt] of [
    [0, 13000, TIMING.deepBreak],
    [1, 24000, TIMING.thinBreak],
  ]) {
    const exhausted = at(emptyAt).state.markets[index],
      before = at(breakAt - 1).state.markets[index],
      after = at(breakAt).state.markets[index];
    assert.equal(exhausted.remaining102, 0);
    assert.equal(exhausted.price, 102);
    assert.equal(exhausted.broke, false);
    assert.deepEqual(exhausted, before);
    assert.equal(after.price, 103);
    assert.equal(after.broke, true);
    assert.equal(after.volume - before.volume, 5);
  }
  assert.equal(at(TIMING.deepBreak).state.markets[0].broke, true);
  assert.equal(at(TIMING.deepBreak).state.markets[1].broke, false);
  assert.equal(at(TIMING.thinBreak).state.markets[0].broke, true);
  assert.equal(at(TIMING.thinBreak).state.markets[1].broke, true);
});

test("the shared starting print is context and both markets conserve measured supply across fills", () => {
  for (const source of story.markets) {
    const start = marketSnapshot(source, 0);
    assert.equal(start.price, 101);
    assert.equal(start.volume, 0);
    assert.equal(source.seed.size, 1);
    for (const fill of source.fills) {
      const before = marketSnapshot(source, fill.at - 1),
        after = marketSnapshot(source, fill.at);
      assert.equal(after.volume - before.volume, fill.size);
      assert.equal(
        after.volume + after.remaining102 + after.remaining103,
        source.depth + 20,
      );
      assert.equal(
        before.remaining102 +
          before.remaining103 -
          after.remaining102 -
          after.remaining103,
        fill.size,
      );
      assert.ok(after.trades.every((t) => t.side === "buy" && t.at <= fill.at));
    }
    for (const frame of source.frames)
      assert.ok(frame.bids[0].price < frame.asks[0].price);
  }
  assert.equal(at(TIMING.reset - 1).state.preview, true);
  assert.equal(at(TIMING.reset).state.preview, false);
  assert.ok(at(TIMING.reset).state.markets.every((m) => m.volume === 0));
});

test("40-second chapters and reverse seeks preserve models and finite geometry", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b),
    40000,
  );
  for (let scene = 0; scene < 3; scene++)
    assert.equal(
      scenePosition(scene, SCENE_DURATIONS[scene]).time,
      scenePosition(scene + 1, 0).time,
    );
  for (let time = TOTAL_DURATION; time >= 0; time -= 125) {
    const p = at(time);
    assert.deepEqual(p.state, breakoutSnapshot(createBreakoutStory(), time));
    assert.deepEqual(p.state, at(time, true).state);
    for (const frame of [p, at(time, true)])
      assert.doesNotMatch(
        drawBreakout(frame).svg,
        /NaN|Infinity|undefined|width="-|height="-/,
      );
  }
  for (const reduced of [false, true]) {
    assert.equal(cameraAt(0, reduced).scale, 0.3);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 0.3);
  }
});

test("the opening and returned panoramas preserve all nine OHLC bars and share the same context", () => {
  const priceSignature = (bars) =>
    bars.map(({ index, open, high, low, close }) => [
      index,
      open,
      high,
      low,
      close,
    ]);
  const completed = story.markets.map((market) => market.completedBars);
  assert.equal(completed[0].length, 9);
  assert.deepEqual(priceSignature(completed[0]), priceSignature(completed[1]));
  for (const [index, market] of story.markets.entries())
    for (const bar of market.completedBars) {
      assert.equal(bar.open, bar.rows[0].price);
      assert.equal(bar.close, bar.rows.at(-1).price);
      assert.equal(bar.high, Math.max(...bar.rows.map((row) => row.price)));
      assert.equal(bar.low, Math.min(...bar.rows.map((row) => row.price)));
      if (bar.index === story.targetIndex)
        assert.deepEqual(bar.rows, [market.seed, ...market.fills]);
      else assert.deepEqual(bar, completed[1 - index][bar.index]);
    }
  assert.deepEqual(
    priceSignature(at(0).state.bars),
    priceSignature(at(TIMING.panorama).state.bars),
  );
  assert.deepEqual(at(TIMING.zoomOut).state.bars, completed[1]);
  for (const reduced of [false, true]) {
    assert.deepEqual(cameraAt(0, reduced), cameraAt(TIMING.panorama, reduced));
    assert.equal(comparisonAt(TIMING.panorama, reduced), 0);
  }
  assert.equal(
    [...drawBreakout(at(0)).svg.matchAll(/data-candle=/g)].length,
    9,
  );
  assert.equal(
    [...drawBreakout(at(TIMING.panorama)).svg.matchAll(/data-candle=/g)].length,
    9,
  );
  assert.equal(
    [...drawBreakout(at(TOTAL_DURATION)).svg.matchAll(/data-candle=/g)].length,
    18,
  );
});

test("A completes before B rewinds to the same seed, with no unplayed history entering either replay", () => {
  assert.equal(at(TIMING.reset).state.active.id, "A");
  assert.equal(at(TIMING.reset).state.active.volume, 0);
  assert.equal(at(TIMING.resetB - 1).state.active.id, "A");
  assert.equal(at(TIMING.resetB - 1).state.active.volume, 65);
  const reset = at(TIMING.resetB).state;
  assert.equal(reset.active.id, "B");
  assert.equal(reset.active.volume, 0);
  assert.equal(reset.active.price, 101);
  assert.equal(reset.active.remaining102, 10);
  assert.deepEqual(reset.active.candle, {
    open: 101,
    high: 101,
    low: 101,
    close: 101,
  });
  assert.equal(reset.markets[0].volume, 65);
  for (let time = TIMING.reset; time < TIMING.zoomOut; time += 100) {
    const state = at(time).state;
    assert.ok(
      state.bars.slice(story.targetIndex + 1).every((bar) => bar === null),
    );
    assert.ok(state.active.trades.every((trade) => trade.at <= time));
    assert.deepEqual(state.bars[story.targetIndex].rows, [
      story.markets[state.activeIndex].seed,
      ...state.active.trades,
    ]);
    const svg = drawBreakout(at(time)).svg;
    assert.equal([...svg.matchAll(/data-active-case=/g)].length, 1);
    assert.match(svg, new RegExp(`data-active-case="${state.active.id}"`));
    assert.doesNotMatch(svg, /data-comparison-history=/);
  }
});

test("each visible fill updates the selected K, remaining depth and exact active volume together", () => {
  for (const [index, market] of story.markets.entries())
    for (const trade of market.fills) {
      const before = at(trade.at - 1).state,
        after = at(trade.at).state;
      assert.equal(after.activeIndex, index);
      assert.equal(after.active.volume - before.active.volume, trade.size);
      assert.equal(after.bars[story.targetIndex].close, trade.price);
      assert.equal(after.active.price, trade.price);
      assert.equal(
        after.bars[story.targetIndex].rows.reduce((n, row) => n + row.size, 0),
        after.active.volume + market.seed.size,
      );
      const svg = drawBreakout(at(trade.at)).svg;
      assert.match(
        svg,
        new RegExp(`data-fill-at="${trade.at}" data-fill-size="${trade.size}"`),
      );
      assert.match(
        svg,
        new RegExp(`data-active-volume="${after.active.volume}"`),
      );
      assert.match(
        svg,
        new RegExp(`data-candle="4"[^>]+data-close="${trade.price}"`),
      );
      assert.deepEqual(after.active, at(trade.at + 1).state.active);
    }
});

test("detail labels, execution dots and depth outlines remain inside the moving crop", () => {
  for (const reduced of [false, true])
    for (let time = 0; time <= TIMING.panorama; time += 25) {
      const camera = cameraAt(time, reduced);
      for (const [left, top, right, bottom] of [
        [180, 92, 914, 357],
        [478, priceY(103) - 2, 522, priceY(101) + 2],
        [648, priceY(103) - 17.5, 845, priceY(102) + 17.5],
      ]) {
        const p = projectPoint(left, top, camera),
          q = projectPoint(right, bottom, camera);
        assert.ok(
          p.x >= 56 && q.x <= 944,
          `horizontal detail bounds at ${time}`,
        );
        assert.ok(p.y >= 85 && q.y <= 359, `vertical detail bounds at ${time}`);
      }
      for (const market of story.markets)
        for (const [index, fill] of market.fills.entries()) {
          const p = projectPoint(fillX(index), priceY(fill.price) + 29, camera);
          assert.ok(p.y <= 359);
        }
    }
});

test("late comparison waits for space, with separated histories, dates and volume labels", () => {
  for (const reduced of [false, true])
    for (let time = TIMING.compare; time <= TOTAL_DURATION; time += 25) {
      const comparison = comparisonAt(time, reduced),
        base = cameraAt(time, reduced);
      const left = panelCamera(base, comparison),
        right = panelCamera(base, comparison, true);
      const svg = drawBreakout(at(time, reduced)).svg;
      const alpha = Number(
        svg.match(/<g opacity="([\d.]+)" data-comparison-history=/)[1],
      );
      if (!alpha) continue;
      const leftMax = projectPoint(columnX(8) + 22, 0, left).x;
      const rightMin = projectPoint(columnX(0) - 22, 0, right).x;
      assert.ok(leftMax < 493 && rightMin > 560);
      assert.ok(rightMin - leftMax > 65);
      const lowest = projectPoint(0, priceY(96), left).y;
      const dateBaseline = 377 - 77 * comparison;
      assert.ok(
        dateBaseline - 10 > lowest + 5,
        `dates stay below history at ${time}`,
      );
      assert.ok(
        dateBaseline + 3 < 322,
        `dates stay above comparison label at ${time}`,
      );
    }
  for (let time = 0; time <= TOTAL_DURATION; time += 25) {
    const svg = drawBreakout(at(time)).svg;
    const detail = Number(
      svg.match(/<g opacity="([\d.]+)" data-footer="detail">/)[1],
    );
    const macro = Number(
      svg.match(/<g opacity="([\d.]+)" data-footer="macro">/)[1],
    );
    assert.equal(detail * macro, 0, `footer separation at ${time}`);
  }
});
