import test from "node:test";
import assert from "node:assert/strict";
import * as primer from "../public/orderflow/primer-model.js";
import * as wick from "../public/orderflow/wick-model.js";
import * as revisit from "../public/orderflow/revisit-model.js";
import * as delta from "../public/orderflow/delta-model.js";
import { drawPrimer } from "../public/orderflow/primer-view.js";
import { drawWick } from "../public/orderflow/wick-view.js";
import { drawRevisit } from "../public/orderflow/revisit-view.js";
import { drawDelta } from "../public/orderflow/delta-view.js";

for (const [name, model, create, snapshot, draw] of [
  [
    "primer",
    primer,
    primer.createPrimerStory,
    primer.primerSnapshot,
    drawPrimer,
  ],
  ["wick", wick, wick.createWickStory, wick.wickSnapshot, drawWick],
  [
    "revisit",
    revisit,
    revisit.createRevisitStory,
    revisit.revisitSnapshot,
    drawRevisit,
  ],
  ["delta", delta, delta.createDeltaStory, delta.deltaSnapshot, drawDelta],
]) {
  test(`${name}: every mobile scene can seek backwards, without future fills or invalid geometry`, () => {
    const story = create();
    for (const reduced of [false, true]) {
      for (let scene = 0; scene < model.SCENE_DURATIONS.length; scene++) {
        const rendered = new Map();
        for (const progress of [0, 0.2, 0.5, 0.8, 1, 0.5, 0.2, 0]) {
          const p = model.scenePosition(
            scene,
            model.SCENE_DURATIONS[scene] * progress,
            reduced,
          );
          const result = draw({
            story,
            state: snapshot(story, p.time),
            ...p,
            mobile: true,
          });
          assert.equal(result.width, 360);
          assert.doesNotMatch(
            result.svg,
            /NaN|Infinity|undefined|(?:width|height)="-/,
          );
          for (const [, at] of result.svg.matchAll(
            /data-(?:trade-at|until)="([\d.]+)"/g,
          ))
            assert.ok(+at <= p.time, `${name} exposes a future event`);
          if (rendered.has(progress))
            assert.equal(result.svg, rendered.get(progress));
          rendered.set(progress, result.svg);
          for (const [, x, w] of result.svg.matchAll(
            /<rect x="([\d.-]+)" y="[\d.-]+" width="([\d.]+)"[^>]*data-depth-price/g,
          ))
            assert.ok(+x >= 0 && +x + +w <= 360);
        }
      }
    }
  });
}

test("mobile matching animates both sides, and only confirmed fills move the candle", () => {
  const story = primer.createPrimerStory();
  const draw = (scene, time) =>
    drawPrimer({
      state: primer.primerSnapshot(story, time),
      ...primer.scenePosition(scene, 0),
      time,
      mobile: true,
    }).svg;
  for (const [scene, start, amount, side] of [
    [4, 32000, 2, "buy"],
    [5, 40000, 9, "buy"],
    [5, 49000, 1, "sell"],
  ]) {
    const before = draw(scene, start + 3);
    assert.equal([...before.matchAll(/data-unit="pending"/g)].length, amount);
    assert.match(before, new RegExp(`data-unit="matching-${side}"`));
    const expected = primer.candleAt(
      primer.primerSnapshot(story, start + 3),
      start + 3,
    );
    assert.match(before, new RegExp(`data-close="${expected.close}"`));
    const after = draw(scene, start + (amount === 9 ? 18 : 6));
    assert.equal([...after.matchAll(/data-unit="matched"/g)].length, amount);
  }
});

test("mobile heatmap erases exhausted depth and keeps K body centered on its wick", () => {
  const story = revisit.createRevisitStory();
  const svg = drawRevisit({
    story,
    state: revisit.revisitSnapshot(story, 85000),
    ...revisit.scenePosition(6, 0),
    time: 85000,
    mode: "break",
    mobile: true,
  }).svg;
  assert.match(svg, /data-depth-price="68420.5"[^>]*fill-opacity="0"/);
  for (const [, x, bodyX, width] of svg.matchAll(
    /<g data-candle[^>]*><line x1="([\d.-]+)"[^>]*\/><rect x="([\d.-]+)" y="[\d.-]+" width="([\d.]+)"/g,
  ))
    assert.equal(+bodyX + +width / 2, +x);
});

test("mobile price and CVD share the same current-time cursor", () => {
  const story = delta.createDeltaStory();
  for (const time of [100000, 105000, 110000, 119000]) {
    const state = delta.deltaSnapshot(story, time);
    const svg = drawDelta({
      story,
      state,
      ...delta.scenePosition(4, 0),
      time,
      mode: "stall",
      mobile: true,
    }).svg;
    const price = svg.match(/data-latest-price="[\d.]+" cx="([\d.]+)"/);
    const cvd = svg.match(/data-cvd-value="([\d.-]+)" cx="([\d.]+)"/);
    assert.ok(price && cvd);
    assert.equal(+price[1], +cvd[2]);
    assert.equal(+cvd[1], delta.totals(state, time).delta);
  }
});
