import test from "node:test";
import assert from "node:assert/strict";
import { round } from "../public/orderflow/engine.js";
import {
  createRevisitStory,
  revisitSnapshot,
  priceTrace,
} from "../public/orderflow/revisit-model.js";
import {
  createDeltaStory,
  deltaSnapshot,
  totals,
  deltaTrace,
  passiveSell,
  scenePosition,
  SCENE_DURATIONS,
  START,
  END,
  LEVEL,
} from "../public/orderflow/delta-model.js";
import { drawDelta } from "../public/orderflow/delta-view.js";
import { narrativeAt } from "../public/orderflow/delta-script.js";

const story = createDeltaStory();
const at = (time) => deltaSnapshot(story, time);

test("third story preserves the complete prior tape, book and unfinished candle", () => {
  const previous = createRevisitStory();
  for (const f of previous.frames) assert.deepEqual(at(f.at), f.state);
  assert.deepEqual(at(START), revisitSnapshot(previous, START));
  assert.equal(passiveSell(at(START)), 0);
  assert.equal(passiveSell(at(90500)), 0.6);
});

test("all new fills conserve depth and only executions move price or CVD", () => {
  let previous = at(START);
  for (const f of story.frames.filter((f) => f.at > START)) {
    const state = f.state,
      event = story.events.find((e) => e.at === f.at);
    assert.ok(event);
    assert.ok(state.bids[0].price < state.asks[0].price);
    for (const [key, side] of [
      ["bids", "buy"],
      ["asks", "sell"],
    ]) {
      const prices = new Set(
        [...previous[key], ...state[key]].map((r) => r.price),
      );
      for (const price of prices) {
        const before = previous[key].find((r) => r.price === price)?.size ?? 0;
        const after = state[key].find((r) => r.price === price)?.size ?? 0;
        const change =
          price === event.price &&
          (event.kind === "add" ? side === event.side : side !== event.side)
            ? event.size * (event.kind === "add" ? 1 : -1)
            : 0;
        assert.equal(
          round(after - before),
          round(change),
          `${f.at} ${side} ${price}`,
        );
        assert.ok(after >= 0);
      }
    }
    const before = totals(previous, f.at),
      after = totals(state, f.at);
    if (event.kind === "add") {
      assert.equal(state.price, previous.price);
      assert.deepEqual(after, before);
      assert.deepEqual(state.candle, previous.candle);
    } else {
      assert.equal(state.trades.length, previous.trades.length + 1);
      assert.equal(state.price, event.price);
      assert.equal(
        round(after.delta - before.delta),
        event.side === "buy" ? event.size : -event.size,
      );
    }
    assert.ok(state.trades.every((t) => t.at <= f.at));
    previous = state;
  }
});

test("CVD uses exact taker fills once, with a fixed :30 anchor across every scene", () => {
  for (const [time, buy, sell, delta] of [
    [90000, 0, 0, 0],
    [91500, 0.2, 0, 0.2],
    [93000, 0.2, 0.05, 0.15],
    [94500, 0.41, 0.05, 0.36],
    [101000, 1.26, 0.11, 1.15],
    [108000, 2.31, 0.29, 2.02],
    [112000, 2.31, 1.16, 1.15],
    [119000, 2.51, 1.41, 1.1],
  ])
    assert.deepEqual(totals(at(time), time), { buy, sell, delta });
  for (let scene = 0; scene < SCENE_DURATIONS.length; scene++) {
    const p = scenePosition(scene, SCENE_DURATIONS[scene]);
    assert.deepEqual(totals(at(p.time), p.time), totals(at(END), p.time));
  }
});

test("rising CVD coexists with a capped price and positive CVD with the later fall", () => {
  const early = at(101000),
    capped = at(108000),
    down = at(112000);
  assert.equal(early.price, LEVEL);
  assert.equal(capped.price, LEVEL);
  assert.ok(totals(capped, 108000).delta > totals(early, 101000).delta);
  assert.ok(
    capped.trades.filter((t) => t.at >= START).every((t) => t.price <= LEVEL),
  );
  assert.equal(passiveSell(early), 0.1);
  assert.equal(passiveSell(at(102000)), 0.6);
  assert.equal(passiveSell(capped), 0.3);
  assert.ok(down.price < at(START).price);
  assert.ok(totals(down, 112000).delta > 0);
  assert.ok(totals(down, 112000).delta < totals(capped, 108000).delta);
});

test("the original one-minute candle keeps its open and earlier high", () => {
  for (const f of story.frames.filter((f) => f.at > START)) {
    const trades = f.state.trades.filter((t) => t.at >= 60000);
    const prices = [68421.5, ...trades.map((t) => t.price)];
    assert.deepEqual(f.state.candle, {
      open: 68421.5,
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices.at(-1),
      volume: round(trades.reduce((s, t) => s + t.size, 0)),
    });
  }
  assert.equal(at(END).candle.high, 68424);
  assert.equal(at(END).candle.low, 68418.5);
});

test("backward seeking never leaks later fills, points, quote sizes or totals", () => {
  const final = at(END);
  for (const time of [
    START,
    93000,
    99000,
    99005,
    99006,
    102000,
    107000,
    107006,
    END,
    93000,
  ]) {
    const live = at(time);
    const d = deltaTrace(final, time),
      p = priceTrace(final, time, START);
    assert.deepEqual(d, deltaTrace(live, time));
    assert.deepEqual(p, priceTrace(live, time, START));
    assert.ok(d.every((p) => p.at <= time));
    assert.equal(d.at(-1).delta, totals(live, time).delta);
    assert.equal(p.at(-1).price, live.price);
  }
  const copy = at(102000);
  copy.asks[0].size = 999;
  assert.equal(passiveSell(at(102000)), 0.6);
  assert.deepEqual(deltaTrace(final, START - 1), []);
});

test("scene boundaries continue time except for the three labelled rewinds", () => {
  for (let scene = 0; scene < SCENE_DURATIONS.length; scene++) {
    const duration = SCENE_DURATIONS[scene];
    assert.equal(scenePosition(scene, -10).elapsed, 0);
    assert.equal(scenePosition(scene, duration + 10).elapsed, duration);
    if (scene > 0 && ![1, 4, 7].includes(scene))
      assert.equal(
        scenePosition(scene, 0).time,
        scenePosition(scene - 1, SCENE_DURATIONS[scene - 1]).time,
      );
  }
  for (const scene of [1, 4, 7])
    assert.match(scenePosition(scene, 0).mode, /rewind/);
  const p = scenePosition(3, 0);
  assert.doesNotMatch(narrativeAt(3, 0).question, /2\.02/);
  assert.equal(p.time, 101000);
  assert.match(narrativeAt(5, 9000).question, /230/);
});

test("price and CVD share one time cursor; candle body and wick stay centered", () => {
  for (let scene = 0; scene < 8; scene++)
    for (const fraction of [0, 0.1, 0.3, 0.5, 0.8, 1])
      for (const reduced of [false, true]) {
        const p = scenePosition(
          scene,
          SCENE_DURATIONS[scene] * fraction,
          reduced,
        );
        const { svg } = drawDelta({ story, state: at(p.time), ...p });
        assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
        const candles = [
          ...svg.matchAll(/<g data-candle="true">([\s\S]*?)<\/g>/g),
        ];
        assert.equal(candles.length, 1);
        for (const [, body] of candles) {
          const wick = Number(/<line x1="([^"]+)"/.exec(body)[1]);
          const rect = /<rect x="([^"]+)" y="[^"]+" width="([^"]+)"/.exec(body);
          assert.equal(wick, Number(rect[1]) + Number(rect[2]) / 2);
          assert.ok(wick >= 30 && wick <= 970);
        }
        const price = /<circle data-latest-price="[^"]+" cx="([^"]+)"/.exec(
          svg,
        );
        const delta = /<circle data-cvd-value="[^"]+" cx="([^"]+)"/.exec(svg);
        if (price && delta) assert.equal(price[1], delta[1]);
      }
});
