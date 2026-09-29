import test from "node:test";
import assert from "node:assert/strict";
import { round } from "../public/orderflow/engine.js";
import {
  createWickStory,
  wickSnapshot,
} from "../public/orderflow/wick-model.js";
import {
  createRevisitStory,
  revisitSnapshot,
  footprint,
  passiveAt,
  depthHistory,
  priceTrace,
  scenePosition,
  SCENE_DURATIONS,
  LEVEL,
} from "../public/orderflow/revisit-model.js";
import { narrativeAt, scenes } from "../public/orderflow/revisit-script.js";
import { drawRevisit } from "../public/orderflow/revisit-view.js";

const story = createRevisitStory();

test("the second story preserves the first tape and seeds its exact final public book", () => {
  const previous = createWickStory();
  for (const frame of previous.frames)
    assert.deepEqual(revisitSnapshot(story, frame.at), frame.state);
  const before = wickSnapshot(previous, 60000),
    after = revisitSnapshot(story, 60000);
  for (const key of ["price", "bids", "asks", "trades"])
    assert.deepEqual(after[key], before[key]);
  assert.deepEqual(story.previousCandle, before.candle);
  assert.equal(after.candle.open, before.candle.close);
  assert.equal(after.candle.volume, 0);
});

test("every new fill and cancellation conserves depth; only executions move price", () => {
  let previous = revisitSnapshot(story, 60000);
  for (const frame of story.frames.filter((f) => f.at > 60000)) {
    const state = frame.state,
      event = story.events.find((e) => e.at === frame.at);
    assert.ok(event);
    assert.ok(state.bids[0].price < state.asks[0].price);
    for (const key of ["bids", "asks"]) {
      const side = key === "bids" ? "buy" : "sell";
      const prices = new Set(
        [...previous[key], ...state[key]].map((r) => r.price),
      );
      for (const price of prices) {
        const oldSize = previous[key].find((r) => r.price === price)?.size ?? 0;
        const newSize = state[key].find((r) => r.price === price)?.size ?? 0;
        const change =
          event.price === price &&
          (event.kind === "trade" ? event.side !== side : event.side === side)
            ? event.size * (event.kind === "add" ? 1 : -1)
            : 0;
        assert.equal(
          round(newSize - oldSize),
          round(change),
          `${frame.at} ${side} ${price}`,
        );
      }
    }
    if (event.kind !== "trade") {
      assert.equal(state.price, previous.price);
      assert.deepEqual(state.candle, previous.candle);
      assert.deepEqual(state.trades, previous.trades);
    } else {
      assert.equal(state.trades.length, previous.trades.length + 1);
      assert.equal(state.price, event.price);
      assert.equal(state.trades.at(-1).at, frame.at);
    }
    previous = state;
  }
});

test("new one-minute candle is derived from its own executions and remains unfinished at :30", () => {
  for (const frame of story.frames.filter((f) => f.at >= 60000)) {
    const trades = frame.state.trades.filter((t) => t.at >= 60000);
    const prices = [68421.5, ...trades.map((t) => t.price)];
    assert.equal(frame.state.candle.open, 68421.5);
    assert.equal(frame.state.candle.high, Math.max(...prices));
    assert.equal(frame.state.candle.low, Math.min(...prices));
    assert.equal(frame.state.candle.close, prices.at(-1));
    assert.equal(
      frame.state.candle.volume,
      round(trades.reduce((s, t) => s + t.size, 0)),
    );
    assert.ok(frame.state.trades.every((t) => t.at <= frame.at));
  }
  assert.equal(story.duration, 90000);
  assert.deepEqual(revisitSnapshot(story, 90000).candle, {
    open: 68421.5,
    high: 68424,
    low: 68419.5,
    close: 68420,
    volume: 2.7,
  });
});

test("footprint adds exact aggressor volume once per fill and the fixed profile never grows later", () => {
  assert.deepEqual(footprint(revisitSnapshot(story, 51199)), []);
  assert.deepEqual(footprint(revisitSnapshot(story, 51200)), [
    { price: 68421.5, buy: 0.1, sell: 0, volume: 0.1 },
  ]);
  assert.equal(
    footprint(revisitSnapshot(story, 52000)).find((r) => r.price === LEVEL)
      .sell,
    0.3,
  );
  const final = footprint(revisitSnapshot(story, 60000));
  assert.deepEqual(final, [
    { price: 68421.5, buy: 0.43, sell: 0, volume: 0.43 },
    { price: LEVEL, buy: 0, sell: 1, volume: 1 },
  ]);
  for (const at of [65000, 77000, 83006, 90000])
    assert.deepEqual(footprint(revisitSnapshot(story, at)), final);
  assert.equal(
    final.reduce((s, r) => round(s + r.volume), 0),
    1.43,
  );
});

test("cancellation thins the familiar level before a small sell crosses it over three fills", () => {
  for (const [at, quantity] of [
    [75000, 0.65],
    [77000, 0.2],
    [79000, 0.1],
    [81000, 0.06],
    [83000, 0],
  ])
    assert.equal(passiveAt(revisitSnapshot(story, at)), quantity);
  assert.equal(
    revisitSnapshot(story, 77000).price,
    revisitSnapshot(story, 76999).price,
  );
  assert.equal(revisitSnapshot(story, 83000).price, LEVEL);
  assert.equal(revisitSnapshot(story, 83005).price, LEVEL);
  assert.equal(revisitSnapshot(story, 83006).price, 68420);
  assert.equal(revisitSnapshot(story, 83012).price, 68419.5);
  assert.deepEqual(
    story.events
      .filter((e) => e.at >= 83000 && e.at < 84000)
      .map((e) => [e.price, e.size]),
    [
      [LEVEL, 0.06],
      [68420, 0.08],
      [68419.5, 0.16],
    ],
  );
});

test("heatmap records historical depth only up to the cursor and zero depth stays zero", () => {
  assert.deepEqual(depthHistory(story, 75000), []);
  assert.deepEqual(depthHistory(story, 77000), [
    { at: 75000, size: 0.65, end: 77000 },
    { at: 77000, size: 0.2, end: 77000 },
  ]);
  const history = depthHistory(story, 85000);
  assert.deepEqual(
    history.map((s) => s.size),
    [0.65, 0.2, 0.1, 0.06, 0],
  );
  for (let time = 75001; time <= 85000; time += 83) {
    const current = depthHistory(story, time);
    assert.ok(current.every((s) => s.at <= s.end && s.end <= time));
    assert.equal(current.at(-1).size, passiveAt(revisitSnapshot(story, time)));
    assert.equal(current.at(-1).end, time);
  }
});

test("story clocks are continuous between chapters except the two explicit rewinds", () => {
  assert.equal(scenes.length, SCENE_DURATIONS.length);
  for (let scene = 2; scene < 8; scene++) {
    assert.equal(
      scenePosition(scene - 1, SCENE_DURATIONS[scene - 1]).time,
      scenePosition(scene, 0).time,
    );
    let before = -Infinity;
    for (let elapsed = 0; elapsed <= SCENE_DURATIONS[scene]; elapsed += 20) {
      const p = scenePosition(scene, elapsed);
      assert.ok(p.time >= before);
      before = p.time;
    }
  }
  assert.equal(scenePosition(1, 0).mode, "rewind");
  assert.equal(scenePosition(8, 0).mode, "recap-rewind");
  assert.equal(scenePosition(3, 3200).time, 60000);
});

test("reverse seeks remove later revelations, restore quantities, and replay the exact same frame", () => {
  assert.match(narrativeAt(6, 5000).question, /16 隻/);
  assert.match(narrativeAt(6, 3200).question, /12 隻/);
  assert.match(narrativeAt(6, 0).question, /最後的 12/);
  assert.match(narrativeAt(8, SCENE_DURATIONS[8]).headline, /不代表現在/);
  assert.doesNotMatch(narrativeAt(8, 5000).headline, /不代表現在/);
  const p = scenePosition(6, 2500),
    state = revisitSnapshot(story, p.time);
  const before = drawRevisit({ story, state, ...p }).svg;
  drawRevisit({
    story,
    state: revisitSnapshot(story, 90000),
    ...scenePosition(8, SCENE_DURATIONS[8]),
  });
  assert.equal(drawRevisit({ story, state, ...p }).svg, before);
  const snapshot = revisitSnapshot(story, 77000);
  snapshot.bids[0].size = 900;
  assert.equal(passiveAt(revisitSnapshot(story, 77000)), 0.2);
});

test("all scenes render finite geometry, including reduced motion and a backwards review", () => {
  for (const reduced of [false, true])
    for (let scene = 0; scene < scenes.length; scene++) {
      for (const progress of [0, 0.17, 0.5, 0.9, 1, 0.5, 0]) {
        const p = scenePosition(
          scene,
          SCENE_DURATIONS[scene] * progress,
          reduced,
        );
        const svg = drawRevisit({
          story,
          state: revisitSnapshot(story, p.time),
          ...p,
        }).svg;
        assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
        assert.doesNotMatch(svg, /(?:width|height)="-/);
      }
    }
});

const attr = (tag, name) =>
  Number(new RegExp(`\\b${name}="([^"]+)"`).exec(tag)?.[1]);

test("the full candle body stays inside the price crop and centered on its wick", () => {
  for (const reduced of [false, true])
    for (let scene = 0; scene < scenes.length; scene++)
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        const p = scenePosition(
          scene,
          SCENE_DURATIONS[scene] * progress,
          reduced,
        );
        const svg = drawRevisit({
          story,
          state: revisitSnapshot(story, p.time),
          ...p,
        }).svg;
        const crop = /<clipPath id="price-clip">(<rect[^>]+>)/.exec(svg)[1];
        const left = attr(crop, "x"),
          right = left + attr(crop, "width");
        const candles = [
          ...svg.matchAll(
            /<g data-candle="true"[^>]*>(<line[^>]+>)(<rect[^>]+>)<\/g>/g,
          ),
        ];
        assert.ok(candles.length > 0);
        for (const [, wick, body] of candles) {
          const x = attr(body, "x"),
            width = attr(body, "width");
          assert.ok(Math.abs(x + width / 2 - attr(wick, "x1")) < 1e-8);
          assert.ok(
            x >= left && x + width <= right,
            `scene ${scene + 1}: crop must not cut either side of the body`,
          );
        }
      }
});

test("the heatmap price trace changes only on completed trades, including reverse seeks", () => {
  const full = revisitSnapshot(story, 90000);
  for (const at of [
    75000, 77000, 79000, 81000, 83000, 83006, 83012, 85000, 83000, 77000,
  ]) {
    const trace = priceTrace(full, at);
    assert.ok(trace.every((point) => point.at <= at));
    assert.equal(trace.at(-1).price, revisitSnapshot(story, at).price);
    for (const point of trace.slice(1, -1))
      assert.ok(
        full.trades.some((t) => t.at === point.at && t.price === point.price),
      );
  }
  assert.deepEqual(priceTrace(full, 77000), [
    { at: 75000, price: 68421.5 },
    { at: 77000, price: 68421.5 },
  ]);
  assert.equal(priceTrace(full, 83000).at(-1).price, LEVEL);
  assert.equal(priceTrace(full, 83006).at(-1).price, 68420);
});

test("heatmap depth and the executed price share the candle price axis", () => {
  for (const [elapsed, comparison] of [
    [0, -1],
    [2500, 0],
    [5000, 1],
  ]) {
    const p = scenePosition(6, elapsed);
    const svg = drawRevisit({
      story,
      state: revisitSnapshot(story, p.time),
      ...p,
    }).svg;
    const band = /<rect[^>]*data-depth-price="68420.5"[^>]*>/.exec(svg)[0];
    const point = /<circle data-latest-price="[^"]+"[^>]*>/.exec(svg)[0];
    const levelY = attr(band, "y") + attr(band, "height") / 2;
    assert.equal(Math.sign(attr(point, "cy") - levelY), comparison);
    if (comparison === 0) {
      const body = [
        ...svg.matchAll(
          /<g data-candle="true"[^>]*><line[^>]+>(<rect[^>]+>)<\/g>/g,
        ),
      ].at(-1)[1];
      assert.ok(
        Math.abs(attr(body, "y") + attr(body, "height") - levelY) < 1e-8,
      );
    }
    assert.ok(
      [...svg.matchAll(/data-until="([^"]+)"/g)].every(
        (m) => Number(m[1]) <= p.time,
      ),
    );
  }
});
