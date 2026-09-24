import test from "node:test";
import assert from "node:assert/strict";
import {
  createWickStory,
  wickSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "../public/orderflow/wick-model.js";
import {
  drawWickDesktop,
  desktopCamera,
  desktopEventAge,
} from "../public/orderflow/wick-desktop-view.js";
import { desktopNarrativeAt } from "../public/orderflow/wick-desktop-script.js";

const story = createWickStory();
function frame(scene, elapsed, reduced = false) {
  const p = {
    ...scenePosition(scene, elapsed, reduced),
    scene,
    elapsed,
    reduced,
  };
  const state = wickSnapshot(story, p.time);
  return { p, state, ...drawWickDesktop({ story, state, ...p }) };
}
function elapsedAt(scene, time) {
  let low = 0,
    high = SCENE_DURATIONS[scene];
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (scenePosition(scene, middle).time < time) low = middle;
    else high = middle;
  }
  return high;
}

test("desktop seeks restore exact candle and book values with no future feedback", () => {
  for (const reduced of [false, true]) {
    for (let scene = 0; scene < SCENE_DURATIONS.length; scene++) {
      const seen = new Map();
      for (const fraction of [0, 0.15, 0.35, 0.65, 1, 1.05, 0.65, 0.15, 0]) {
        const f = frame(scene, SCENE_DURATIONS[scene] * fraction, reduced);
        assert.doesNotMatch(
          f.svg,
          /NaN|Infinity|undefined|(?:width|height)="-/,
        );
        assert.match(f.svg, new RegExp(`data-close="${f.state.candle.close}"`));
        assert.match(f.svg, new RegExp(`data-high="${f.state.candle.high}"`));
        for (const [, at] of f.svg.matchAll(
          /data-(?:trade-at|execution-at|fill-pulse|consumed-at)="([\d.]+)"/g,
        ))
          assert.ok(+at <= f.p.time, `future event at scene ${scene}`);
        for (const [, side, price, quantity] of f.svg.matchAll(
          /data-book-side="(buy|sell)" data-price="([\d.]+)" data-book-size="([\d.]+)"/g,
        )) {
          const rows = f.state[side === "buy" ? "bids" : "asks"];
          assert.equal(
            +quantity,
            rows.find((r) => r.price === +price)?.size ?? 0,
          );
        }
        if (seen.has(fraction)) assert.equal(f.svg, seen.get(fraction));
        seen.set(fraction, f.svg);
      }
    }
  }
});

test("a fill consumes its price level and moves the candle on the same boundary", () => {
  for (const [scene, at] of [
    [2, 3600],
    [5, 23506],
    [8, 41532],
    [8, 49006],
  ]) {
    const elapsed = elapsedAt(scene, at);
    const before = frame(scene, elapsed - 0.001),
      after = frame(scene, elapsed);
    const trade = after.state.trades.at(-1);
    assert.equal(trade.at, at);
    assert.doesNotMatch(before.svg, new RegExp(`data-execution-at="${at}"`));
    assert.match(after.svg, new RegExp(`data-execution-at="${at}"`));
    assert.equal(after.state.price, trade.price);
    assert.equal(after.state.trades.length, before.state.trades.length + 1);
    const camera = desktopCamera(after.state, after.p);
    assert.match(after.svg, new RegExp(`cy="${camera.y(trade.price)}"`));
    const side = trade.side === "buy" ? "sell" : "buy";
    const row = after.svg.match(
      new RegExp(
        `<g[^>]*data-book-side="${side}" data-price="${trade.price}"[^>]*><rect x="(?:140|640)" y="([\\d.-]+)"`,
      ),
    );
    assert.ok(row, `missing matched row at ${at}`);
    assert.ok(Math.abs(+row[1] + 12 - camera.y(trade.price)) < 1e-6);
  }
});

test("replenishment changes waiting quantity without moving the candle", () => {
  for (const [scene, at] of [
    [3, 10000],
    [6, 30500],
    [7, 38500],
    [9, 52400],
  ]) {
    const elapsed = elapsedAt(scene, at);
    const before = frame(scene, elapsed - 0.001),
      after = frame(scene, elapsed);
    assert.deepEqual(before.state.candle, after.state.candle);
    assert.equal(before.state.trades.length, after.state.trades.length);
    assert.match(after.svg, /補入/);
    assert.doesNotMatch(before.svg, /NaN/);
  }
});

test("consumed rows leave, old events stay quiet across chapters, and reduced motion removes pulses", () => {
  const elapsed = elapsedAt(5, 23506);
  assert.match(frame(5, elapsed).svg, /data-consumed-at="23506"/);
  assert.doesNotMatch(frame(5, elapsed + 601).svg, /data-consumed-at="23506"/);
  for (let scene = 2; scene <= 10; scene++) {
    const f = frame(scene, 0);
    assert.doesNotMatch(
      f.svg,
      /data-execution-at|data-fill-pulse|data-consumed-at/,
    );
    const latest = f.state.trades.at(-1);
    if (latest) assert.equal(desktopEventAge(f.p, latest.at), Infinity);
  }
  assert.doesNotMatch(
    frame(5, elapsed, true).svg,
    /data-execution-at|data-fill-pulse|data-consumed-at/,
  );
});

test("comparison and ending retain the actual 119 / 1106 / 4980 volumes and 136 / 103 candle", () => {
  const rise = frame(5, SCENE_DURATIONS[5]);
  assert.match(rise.svg, />1,106</);
  assert.match(rise.svg, />119</);
  const fall = frame(8, SCENE_DURATIONS[8]);
  assert.match(fall.svg, /4,980 隻/);
  const end = frame(10, SCENE_DURATIONS[10]);
  assert.match(end.svg, /最高成交/);
  assert.match(end.svg, />136</);
  assert.match(end.svg, /收盤 103/);
  assert.match(end.svg, /上影線/);
  assert.doesNotMatch(end.svg, /data-book-side/);
  assert.match(
    desktopNarrativeAt(11, SCENE_DURATIONS[11]).headline,
    /掛單與成交/,
  );
  assert.doesNotMatch(desktopNarrativeAt(11, 1400).headline, /掛單與成交/);
});
