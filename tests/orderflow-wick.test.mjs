import test from "node:test";
import assert from "node:assert/strict";
import {
  createWickStory,
  wickSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  OPEN,
  activeBuys,
  activeVolume,
  continuationCamera,
  RECAP_REWIND,
  RECAP_BEATS,
} from "../public/orderflow/wick-model.js";
import { drawWick } from "../public/orderflow/wick-view.js";
import { scenes, narrativeAt } from "../public/orderflow/wick-script.js";

test("the opening wick is made from the same executions replayed in close-up", () => {
  const story = createWickStory();
  const candle = wickSnapshot(story, 60000).candle;
  assert.deepEqual(
    [candle.open, candle.high, candle.low, candle.close],
    [68420, 68438, 68420, 68421.5],
  );
  for (const frame of story.frames) {
    assert.ok(frame.state.trades.every((t) => t.at <= frame.at));
    const prices = [OPEN, ...frame.state.trades.map((t) => t.price)];
    assert.equal(frame.state.candle.high, Math.max(...prices));
    assert.equal(frame.state.candle.low, Math.min(...prices));
    assert.equal(frame.state.price, frame.state.trades.at(-1)?.price ?? OPEN);
  }
});

test("replenishment, depletion and the first higher fill are one continuous market", () => {
  const story = createWickStory();
  for (let scene = 2; scene < SCENE_DURATIONS.length - 1; scene++) {
    if (scene > 2)
      assert.equal(
        scenePosition(scene - 1, SCENE_DURATIONS[scene - 1]).time,
        scenePosition(scene, 0).time,
      );
    let previous = -Infinity;
    for (let elapsed = 0; elapsed <= SCENE_DURATIONS[scene]; elapsed += 20) {
      const p = scenePosition(scene, elapsed);
      assert.ok(p.time >= previous);
      previous = p.time;
    }
  }
  assert.equal(wickSnapshot(story, 23000).asks[0].size, 0.05);
  assert.equal(wickSnapshot(story, 23500).price, 68421);
  assert.equal(wickSnapshot(story, 23500).asks[0].price, 68421.5);
  assert.equal(wickSnapshot(story, 23506).price, 68421.5);
  assert.equal(
    story.events.filter(
      (e) =>
        e.kind === "add" && e.side === "sell" && e.at >= 20000 && e.at <= 29000,
    ).length,
    0,
  );
  const atEnd = wickSnapshot(story, 29000);
  assert.equal(activeBuys(atEnd, 8000, 20000), 5.53);
  assert.ok(activeBuys(atEnd, 23000, 29000) < 1);
});

test("desktop continuation keeps exact boundaries, readable sparse depth, and causal counters", () => {
  const story = createWickStory();
  const render = (scene, elapsed, reduced = false) => {
    const p = scenePosition(scene, elapsed, reduced);
    const state = wickSnapshot(story, p.time);
    return drawWick({ story, state, ...p, reduced }).svg;
  };
  const start = continuationCamera(
    wickSnapshot(story, 8000),
    8000,
    0,
    "absorption",
  );
  assert.equal(start.min, OPEN - 0.3);
  assert.equal(start.max, OPEN + 1.2);
  const end = continuationCamera(
    wickSnapshot(story, 23000),
    23000,
    6500,
    "depletion",
  );
  const next = continuationCamera(
    wickSnapshot(story, 23000),
    23000,
    0,
    "ascent",
  );
  assert.equal(end.min, next.min);
  assert.equal(end.max, next.max);
  for (let scene = 3; scene < SCENE_DURATIONS.length; scene++) {
    for (const reduced of [false, true]) {
      for (let elapsed = 0; elapsed <= SCENE_DURATIONS[scene]; elapsed += 50) {
        assert.doesNotMatch(
          render(scene, elapsed, reduced),
          /NaN|Infinity|undefined/,
        );
      }
    }
  }
  assert.doesNotMatch(render(3, 3000), /這段主動買入/);
  assert.match(render(3, 14000), /1,106/);
  assert.match(render(4, 6500), /10 隻/);
  assert.doesNotMatch(render(5, 0), /136/);
  assert.match(render(5, 1800), /3 隻/);
  assert.match(render(5, 12500), /136/);
  // At most the nearest three asks are shown, never a whole ladder of numbers.
  assert.doesNotMatch(render(5, 1800), /108/);
});

test("every quote and execution conserves visible depth without crossing the book", () => {
  const story = createWickStory();
  for (let i = 1; i < story.frames.length; i++) {
    const before = story.frames[i - 1].state,
      after = story.frames[i].state,
      at = story.frames[i].at;
    assert.ok(after.bids[0].price < after.asks[0].price);
    for (const [side, key] of [
      ["buy", "bids"],
      ["sell", "asks"],
    ]) {
      const prices = new Set(
        [...before[key], ...after[key]].map((r) => r.price),
      );
      for (const price of prices) {
        let expected = before[key].find((r) => r.price === price)?.size || 0;
        for (const e of story.events.filter(
          (e) => e.at > story.frames[i - 1].at && e.at <= at,
        )) {
          if (e.price !== price) continue;
          if (e.kind === "trade" && e.side !== side) expected -= e.size;
          if (e.side === side && e.kind === "add") expected += e.size;
          if (e.side === side && e.kind === "remove") expected -= e.size;
        }
        assert.ok(
          Math.abs(
            (after[key].find((r) => r.price === price)?.size || 0) - expected,
          ) < 1e-6,
          `${at} ${side} ${price}`,
        );
      }
    }
    if (after.trades.length === before.trades.length)
      assert.deepEqual(after.candle, before.candle);
  }
});

test("substantial passive bids remain until large active selling consumes them", () => {
  const story = createWickStory();
  for (const at of [38500, 39200, 40300]) {
    const before = wickSnapshot(story, at - 1),
      after = wickSnapshot(story, at);
    assert.deepEqual(before.trades, after.trades);
    assert.deepEqual(before.candle, after.candle);
    const event = story.events.find((e) => e.at === at);
    assert.equal(event.kind, "add");
    assert.ok(
      after.bids.find((b) => b.price === event.price).size >
        before.bids.find((b) => b.price === event.price).size,
    );
  }
  const beforeSell = wickSnapshot(story, 41000);
  assert.ok(!story.events.some((e) => e.kind === "remove"));
  assert.deepEqual(
    beforeSell.bids.slice(0, 3).map((b) => b.size),
    [1.57, 1.62, 1.25],
  );
  assert.ok(
    beforeSell.bids
      .filter((b) => b.price > OPEN + 0.5)
      .every((b) => b.size >= 0.65),
  );
  const firstSell = wickSnapshot(story, 41500);
  assert.equal(beforeSell.price, 68438);
  assert.equal(firstSell.price, 68437.5);
  assert.equal(firstSell.bids[0].size, 1.07);
  assert.equal(wickSnapshot(story, 41526).bids[0].price, 68437);
  assert.equal(wickSnapshot(story, 41532).price, 68437);
  assert.equal(firstSell.trades.at(-1).side, "sell");
  const end = wickSnapshot(story, 50000);
  assert.equal(activeVolume(end, "sell", 41000, 50000), 24.9);
  assert.equal(activeBuys(end, 23000, 29000), 0.595);
  assert.ok(
    activeVolume(end, "sell", 41000, 50000) >
      40 * activeBuys(end, 23000, 29000),
  );
  assert.equal(end.price, 68420.5);
  assert.equal(end.candle.high, 68438);
  assert.ok(
    end.trades.some((t) => t.at > 41500 && t.at < 50000 && t.side === "buy"),
  );
});

test("the high-point, passive bids and descent cameras preserve boundaries and causal counters", () => {
  const story = createWickStory();
  const cameraAt = (scene, elapsed) => {
    const p = scenePosition(scene, elapsed);
    return continuationCamera(
      wickSnapshot(story, p.time),
      p.time,
      p.elapsed,
      p.mode,
    );
  };
  for (const scene of [6, 7, 8]) {
    const before = cameraAt(scene - 1, SCENE_DURATIONS[scene - 1]),
      after = cameraAt(scene, 0);
    for (const key of ["min", "max", "compact", "wide"])
      assert.ok(Math.abs(before[key] - after[key]) < 1e-6, `${scene} ${key}`);
  }
  const render = (scene, elapsed) => {
    const p = scenePosition(scene, elapsed);
    return drawWick({ story, state: wickSnapshot(story, p.time), ...p }).svg;
  };
  assert.doesNotMatch(render(7, 1000), /已離開/);
  assert.match(render(7, 1600), /314 隻/);
  assert.match(render(7, 1600), /被動買單/);
  assert.doesNotMatch(render(7, 1600), /最新主動賣出/);
  assert.match(render(8, 1200), /最新主動賣出/);
  assert.doesNotMatch(render(8, 0), /這段主動賣出|4980/);
  assert.match(render(8, 13000), /4,980/);
  assert.match(render(8, 6000), /↑ 高點 136/);
  assert.equal(scenePosition(8, SCENE_DURATIONS[8]).time, 50000);
});

test("lower bids replenish between sells while the final trades preserve the same minute", () => {
  const story = createWickStory();
  for (const at of [50500, 52400, 55500]) {
    const before = wickSnapshot(story, at - 1),
      after = wickSnapshot(story, at);
    assert.equal(after.bids[0].price, OPEN + 0.5);
    assert.ok(after.bids[0].size > before.bids[0].size);
    assert.deepEqual(after.candle, before.candle);
    assert.deepEqual(after.trades, before.trades);
  }
  for (const at of [52000, 53200, 55000, 56000]) {
    const before = wickSnapshot(story, at - 1),
      // An execution may fill two resting orders at this same price.
      after = wickSnapshot(story, at + 6);
    assert.ok(after.bids[0].size < before.bids[0].size);
    assert.equal(after.trades.at(-1).side, "sell");
    assert.equal(after.price, OPEN + 0.5);
  }
  const tail = wickSnapshot(story, 60000);
  assert.ok(tail.trades.some((t) => t.at >= 50000 && t.side === "buy"));
  assert.equal(tail.trades.at(-1).at, 59600);
  assert.equal(tail.price, OPEN + 1.5);
  assert.equal(tail.candle.high, OPEN + 18);
});

test("the closing camera starts at the same market and returns to the opening scale", () => {
  const story = createWickStory();
  const cameraAt = (scene, elapsed, reduced = false) => {
    const p = scenePosition(scene, elapsed, reduced);
    return continuationCamera(
      wickSnapshot(story, p.time),
      p.time,
      p.elapsed,
      p.mode,
      reduced,
    );
  };
  for (const reduced of [false, true]) {
    for (const scene of [9, 10]) {
      const before = cameraAt(scene - 1, SCENE_DURATIONS[scene - 1], reduced);
      const after = cameraAt(scene, 0, reduced);
      for (const key of ["min", "max", "compact", "wide"])
        assert.equal(after[key], before[key], `${scene} ${key}`);
    }
    const end = cameraAt(10, SCENE_DURATIONS[10], reduced);
    assert.equal(end.min, OPEN - 4);
    assert.equal(end.max, OPEN + 20);
    assert.equal(scenePosition(10, SCENE_DURATIONS[10], reduced).zoom, 0);
  }
  const render = (scene, elapsed) => {
    const p = scenePosition(scene, elapsed);
    return drawWick({ story, state: wickSnapshot(story, p.time), ...p }).svg;
  };
  assert.match(render(9, 3900), /補入/);
  // Quote cards are gone before the zoom out would squeeze them together.
  assert.doesNotMatch(render(10, 1900), /被動掛單 · 等待成交|隻  @/);
  assert.match(render(10, 5000), /↑ 高點 136/);
  assert.doesNotMatch(render(10, 8500), /這一分鐘收盤/);
  assert.match(render(10, 9000), /最高成交/);
  assert.match(render(10, 9000), /這一分鐘收盤/);
  assert.match(render(10, 9000), /103/);
});

test("the final replay explicitly rewinds and retells the same executions one clue at a time", () => {
  const story = createWickStory();
  assert.equal(scenePosition(11, 0).mode, "recap-rewind");
  assert.equal(scenePosition(11, 0).time, 60000);
  assert.equal(scenePosition(11, 600, true).time, 0);
  assert.equal(scenePosition(11, RECAP_REWIND).time, 0);
  assert.equal(scenePosition(11, SCENE_DURATIONS[11]).time, 60000);
  let previous = -Infinity;
  for (
    let elapsed = RECAP_REWIND;
    elapsed <= SCENE_DURATIONS[11];
    elapsed += 100
  ) {
    const p = scenePosition(11, elapsed);
    assert.ok(p.time >= previous);
    previous = p.time;
    assert.equal(p.zoom, 0);
    const state = wickSnapshot(story, p.time);
    const opening = scenePosition(0, p.time / 6);
    assert.deepEqual(state, wickSnapshot(story, opening.time));
    const svg = drawWick({ story, state, ...p }).svg;
    assert.doesNotMatch(svg, /被動掛單 · 等待成交|隻  @|Maker|Taker/);
    const clues = RECAP_BEATS.filter((b) => svg.includes(b.text));
    assert.ok(clues.length <= 1);
    for (const clue of clues)
      assert.ok(p.time >= clue.start && p.time < clue.end);
  }
});

test("the first highlighted buy consumes the visible ask and moves the candle together", () => {
  const story = createWickStory(),
    before = wickSnapshot(story, 3599),
    after = wickSnapshot(story, 3600);
  assert.equal(before.asks[0].size, 0.7);
  assert.equal(after.asks[0].size, 0.6);
  assert.equal(before.price, 68420);
  assert.equal(after.price, 68420.5);
  assert.equal(after.trades.at(-1).size, 0.1);
  assert.equal(wickSnapshot(story, 3000).candle.high, 68420);
});

test("the thin ascent uses fewer active buys than the earlier replenishment interval", () => {
  const story = createWickStory();
  const sum = (start, end) =>
    story.events
      .filter(
        (e) =>
          e.kind === "trade" && e.side === "buy" && e.at >= start && e.at < end,
      )
      .reduce((s, e) => s + e.size, 0);
  assert.ok(sum(23000, 29000) < sum(8000, 20000));
  assert.equal(wickSnapshot(story, 29000).price, 68438);
});

test("camera playback rewinds explicitly and restores exactly the same market boundaries", () => {
  const story = createWickStory();
  assert.equal(scenePosition(0, SCENE_DURATIONS[0]).time, 60000);
  assert.equal(scenePosition(1, 0).mode, "rewind");
  assert.equal(scenePosition(1, 1800).time, 0);
  assert.equal(scenePosition(1, SCENE_DURATIONS[1]).time, 3000);
  assert.equal(scenePosition(2, 0).time, 3000);
  assert.equal(scenePosition(2, SCENE_DURATIONS[2]).time, 8000);
  const restored = wickSnapshot(story, 3000);
  restored.trades.length = 0;
  assert.ok(wickSnapshot(story, 3000).trades.length > 0);
  assert.equal(scenePosition(1, 900, true).time, 0);
});

test("both screen layouts stay finite through camera moves and reveal only completed fills", () => {
  const story = createWickStory();
  for (const mobile of [false, true]) {
    for (let scene = 0; scene < 3; scene++) {
      for (let elapsed = 0; elapsed <= SCENE_DURATIONS[scene]; elapsed += 100) {
        const p = scenePosition(scene, elapsed);
        const output = drawWick({
          story,
          state: wickSnapshot(story, p.time),
          ...p,
          mobile,
        });
        assert.doesNotMatch(output.svg, /NaN|Infinity|undefined/);
        if (p.time < 3600) assert.doesNotMatch(output.svg, /Taker|已成交/);
      }
    }
    const render = (time) =>
      drawWick({
        story,
        state: wickSnapshot(story, time),
        time,
        zoom: 1,
        mode: "execution",
        mobile,
      }).svg;
    assert.match(render(4000), mobile ? /20 隻 × 101 元/ : /20 隻  @  101/);
    assert.doesNotMatch(render(4000), /14:32:05.50/);
    assert.match(render(5500), mobile ? /主動賣出/ : /最新主動賣出 · Taker/);
    assert.match(render(5500), mobile ? /16 隻 × 100 元/ : /16 隻  @  100/);
    assert.match(render(5500), mobile ? /data-trade-at="5500"/ : /14:32:05.50/);
    assert.match(
      render(5500),
      mobile ? /對手方：被動掛買/ : /被動掛買 · Maker/,
    );
  }
});

test("every fill has its own causal snapshot, even across makers at the same price", () => {
  const story = createWickStory();
  for (const trade of story.events.filter((e) => e.kind === "trade")) {
    const before = wickSnapshot(story, trade.at - 0.01);
    const after = wickSnapshot(story, trade.at);
    assert.equal(after.trades.length, before.trades.length + 1);
    assert.equal(after.trades.at(-1).at, trade.at);
    const side = trade.side === "buy" ? "asks" : "bids";
    const remaining = (rows) =>
      rows.find((r) => r.price === trade.price)?.size ?? 0;
    assert.ok(
      Math.abs(remaining(before[side]) - remaining(after[side]) - trade.size) <
        1e-6,
    );
  }
});

test("seeking backwards restores earlier copy, counters, quotes and the unfinished ending", () => {
  const story = createWickStory();
  const renderAt = (scene, elapsed) => {
    const p = scenePosition(scene, elapsed);
    return {
      copy: narrativeAt(scene, elapsed),
      view: drawWick({
        story,
        state: wickSnapshot(story, p.time),
        ...p,
        settled: p.progress === 1,
      }).svg,
    };
  };
  assert.equal(scenes.length, SCENE_DURATIONS.length);
  const earlier = renderAt(8, 1200);
  assert.match(renderAt(8, 12000).copy.question, /4,980/);
  assert.deepEqual(renderAt(8, 1200), earlier);
  assert.match(renderAt(8, 2690).copy.question, /已被吃完/);
  assert.doesNotMatch(renderAt(8, 0).copy.question, /4980|100/);
  assert.doesNotMatch(renderAt(8, 0).view, /這段主動賣出|4980/);
  assert.match(renderAt(2, 6000).copy.question, /主動賣出.*被動買單/);
  assert.match(renderAt(2, 1600).copy.question, /主動買入.*被動賣單/);
  assert.equal(renderAt(2, 0).copy.question, scenes[2].question);
  assert.match(
    renderAt(11, SCENE_DURATIONS[11]).copy.headline,
    /突然暴漲，不一定/,
  );
  assert.equal(renderAt(11, 10000).copy.headline, scenes[11].headline);
  assert.doesNotMatch(renderAt(11, 10000).copy.question, /開、高、低、收/);
});
