import test from "node:test";
import assert from "node:assert/strict";
import {
  createImbalanceStory,
  imbalanceSnapshot,
  compareBuyDiagonal,
  scenePosition,
  SCENE_STARTS,
  SCENE_DURATIONS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/imbalance-model.js";
import {
  drawImbalance,
  cameraAt,
  projectedTextBox,
} from "../public/orderflow/imbalance-view.js";
const story = createImbalanceStory();
function at(playhead, reduced = false) {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= playhead);
  const p = scenePosition(scene, playhead - SCENE_STARTS[scene], reduced);
  return { ...p, story, state: imbalanceSnapshot(story, p.time) };
}

test("buy-side comparisons pair upper ask volume with the adjacent lower bid", () => {
  assert.equal(story.threshold, 3);
  assert.equal(story.zeroPolicy, "skip");
  assert.deepEqual(
    story.pairs.map((pair) => [
      pair.upper.price,
      pair.upper.buy,
      pair.lower.price,
      pair.lower.sell,
      pair.ratio,
      pair.pass,
    ]),
    [
      [101, 30, 100, 10, 3, true],
      [102, 40, 101, 10, 4, true],
      [103, 15, 102, 10, 1.5, false],
      [104, 12, 103, 0, null, false],
    ],
  );
  assert.equal(
    compareBuyDiagonal({ price: 101, buy: 30 }, { price: 101, sell: 10 })
      .reason,
    "missing-adjacent-level",
  );
  assert.equal(
    compareBuyDiagonal({ price: 102, buy: 30 }, { price: 100, sell: 10 })
      .reason,
    "missing-adjacent-level",
  );
  assert.equal(
    compareBuyDiagonal(undefined, { price: 100, sell: 10 }).ratio,
    null,
  );
});

test("the inclusive three-to-one threshold excludes small ratios and explicitly skips zero denominators", () => {
  const lower = { price: 100, sell: 10 };
  assert.equal(compareBuyDiagonal({ price: 101, buy: 30 }, lower).pass, true);
  assert.equal(compareBuyDiagonal({ price: 101, buy: 29 }, lower).pass, false);
  assert.equal(compareBuyDiagonal({ price: 101, buy: 0 }, lower).ratio, 0);
  for (const buy of [0, 12, 100])
    assert.deepEqual(
      compareBuyDiagonal({ price: 101, buy }, { price: 100, sell: 0 }),
      { ratio: null, pass: false, reason: "zero-denominator" },
    );
});

test("annotations are revealed without changing any already-completed execution record", () => {
  assert.equal(story.context[1].volume, 140);
  for (const candle of story.context) {
    assert.equal(
      candle.volume,
      candle.rows.reduce((sum, row) => sum + row.buy + row.sell, 0),
    );
    assert.equal(
      candle.volume,
      candle.trades.reduce((sum, trade) => sum + trade.size, 0),
    );
  }
  for (const [index, pair] of story.pairs.entries()) {
    assert.equal(at(pair.revealAt - 1).state.visited.length, index);
    assert.equal(at(pair.revealAt).state.visited.length, index + 1);
    assert.equal(at(pair.revealAt).state.volume, 140);
    assert.equal(at(pair.revealAt).state.completed, true);
  }
  const final = at(TOTAL_DURATION);
  assert.deepEqual(final.state.highlightedPrices, [101, 102]);
  assert.deepEqual(
    [...drawImbalance(final).svg.matchAll(/data-imbalance-price="(\d+)"/g)].map(
      (match) => Number(match[1]),
    ),
    [101, 102],
  );
});

test("30-second scenes and reverse seeking are deterministic with finite geometry", () => {
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b),
    30000,
  );
  for (let scene = 0; scene < 3; scene++)
    assert.equal(
      scenePosition(scene, SCENE_DURATIONS[scene]).time,
      scenePosition(scene + 1, 0).time,
    );
  for (let time = TOTAL_DURATION; time >= 0; time -= 100) {
    const p = at(time);
    assert.deepEqual(p.state, imbalanceSnapshot(createImbalanceStory(), time));
    assert.deepEqual(p.state, at(time, true).state);
    for (const reduced of [false, true])
      assert.doesNotMatch(
        drawImbalance({ ...p, reduced }).svg,
        /NaN|Infinity|undefined|width="-|height="-/,
      );
  }
  for (const reduced of [false, true]) {
    assert.equal(cameraAt(0, reduced).scale, 0.66);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1.4);
    assert.equal(cameraAt(TOTAL_DURATION, reduced).scale, 0.66);
  }
});

test("macro labels and both compared cells remain complete within all four crop boundaries", () => {
  for (let time = 0; time <= TOTAL_DURATION; time += 100) {
    for (const reduced of [false, true]) {
      const p = at(time, reduced),
        svg = drawImbalance(p).svg,
        camera = cameraAt(time, reduced);
      const labels = [
        ...svg.matchAll(
          /<text x="([\d.-]+)" y="([\d.-]+)"[^>]*font-size="([\d.]+)"([^>]*data-window-label="1"[^>]*)>([^<]+)<\/text>/g,
        ),
      ];
      if (time === 0 || time === TOTAL_DURATION)
        assert.equal(labels.length, 48);
      for (const [, px, py, size, attrs, label] of labels) {
        const anchor = attrs.includes('text-anchor="middle"')
          ? "middle"
          : attrs.includes('text-anchor="end"')
            ? "end"
            : "start";
        const box = projectedTextBox(
          Number(px),
          Number(py),
          label,
          Number(size),
          anchor,
          camera,
        );
        assert.ok(
          box.left >= 60 &&
            box.right <= 940 &&
            box.top >= 82 &&
            box.bottom <= 319,
        );
      }
      if (p.state.showComparison) {
        assert.match(
          svg,
          new RegExp(
            `data-bid-price="${p.state.current.lower.price}" data-column="1"`,
          ),
        );
        assert.match(
          svg,
          new RegExp(
            `data-ask-price="${p.state.current.upper.price}" data-column="1"`,
          ),
        );
      }
    }
  }
});
