import test from "node:test";
import assert from "node:assert/strict";
import {
  applyContractTrade,
  createOpenInterestStory,
  openInterestSnapshot,
  positionTotals,
  scenePosition,
  SCENE_DURATIONS,
  SCENE_STARTS,
  TOTAL_DURATION,
  TIMING,
} from "../public/orderflow/open-interest-model.js";
import {
  drawOpenInterest,
  cameraAt,
  tradeX,
  oiY,
} from "../public/orderflow/open-interest-view.js";
const story = createOpenInterestStory();
const at = (time, reduced = false) => {
  const scene = SCENE_STARTS.findLastIndex((start) => start <= time);
  const p = scenePosition(scene, time - SCENE_STARTS[scene], reduced);
  return { ...p, state: openInterestSnapshot(story, p.time) };
};

test("all four explicitly directed trade types produce +1/-1/0/0 OI with one contract of volume each", () => {
  assert.equal(story.initialOi, 2);
  assert.deepEqual(
    story.trades.map((t) => [t.buyerLabel, t.sellerLabel]),
    [
      ["開多", "開空"],
      ["平空", "平多"],
      ["開多", "平多"],
      ["平空", "開空"],
    ],
  );
  assert.deepEqual(
    story.trades.map((t) => t.delta),
    [1, -1, 0, 0],
  );
  assert.deepEqual(
    story.trades.map((t) => t.before.oi),
    [2, 3, 2, 2],
  );
  assert.deepEqual(
    story.trades.map((t) => t.after.oi),
    [3, 2, 2, 2],
  );
  assert.deepEqual(
    story.trades.map((t) => at(t.at).state.volume),
    [1, 2, 3, 4],
  );
  for (const t of story.trades) {
    const after = applyContractTrade(t.before.positions, t);
    assert.deepEqual(after.positions, t.after.positions);
    assert.equal(after.oi, t.after.oi);
    assert.equal(after.volumeAdded, 1);
  }
});

test("all five K bars and the OI curve derive from the same 20-trade balanced history", () => {
  assert.equal(story.history.length, 20);
  assert.equal(story.bars.length, 5);
  let positions = {},
    volume = 0;
  for (const row of story.history) {
    assert.deepEqual(row.before.positions, positions);
    const result = applyContractTrade(positions, row);
    positions = result.positions;
    volume += result.volumeAdded;
    const totals = positionTotals(positions);
    assert.equal(totals.long, totals.short);
    assert.equal(totals.oi, row.after.oi);
    assert.equal(row.cumulativeVolume, volume);
  }
  for (const bar of story.bars) {
    assert.equal(bar.open, bar.rows[0].price);
    assert.equal(bar.close, bar.rows.at(-1).price);
    assert.equal(bar.high, Math.max(...bar.rows.map((r) => r.price)));
    assert.equal(bar.low, Math.min(...bar.rows.map((r) => r.price)));
    assert.equal(bar.oi, bar.rows.at(-1).after.oi);
  }
  assert.deepEqual(
    [
      story.bars[2].open,
      story.bars[2].high,
      story.bars[2].low,
      story.bars[2].close,
    ],
    [104, 104, 101, 101],
  );
  assert.equal(volume, 20);
});

test("the overview is completed history and the selected replay rewinds without showing unplayed fills", () => {
  assert.equal(at(0).state.replay, false);
  assert.equal(at(0).state.volume, 4);
  const start = at(TIMING.reset).state;
  assert.equal(start.replay, true);
  assert.equal(start.volume, 0);
  assert.equal(start.oi, 2);
  assert.deepEqual(start.positions, story.initial);
  for (const trade of story.trades) {
    assert.equal(at(trade.at).state.volume, at(trade.at - 1).state.volume + 1);
    assert.equal(at(trade.at).state.oi, trade.after.oi);
  }
  for (let time = TIMING.reset; time < TIMING.panorama; time += 100)
    assert.ok(at(time).state.trades.every((t) => t.at <= time));
  assert.equal(at(TOTAL_DURATION).state.replay, false);
});

test("the selected OI line updates at the same event as the positions and the count", () => {
  for (const trade of story.trades) {
    const before = drawOpenInterest(at(trade.at - 1)).svg,
      after = drawOpenInterest(at(trade.at)).svg;
    assert.doesNotMatch(before, new RegExp(`data-replay-tick="${trade.tick}"`));
    assert.match(
      after,
      new RegExp(
        `data-replay-tick="${trade.tick}" data-oi="${trade.after.oi}"`,
      ),
    );
    assert.match(after, new RegExp(`data-open-contracts="${trade.after.oi}"`));
    assert.match(
      after,
      new RegExp(`H${tradeX(trade)} V${oiY(trade.after.oi, 1)}`),
    );
    assert.match(after, new RegExp(`買方 · ${trade.buyer}`));
    assert.match(after, new RegExp(`賣方 · ${trade.seller}`));
    assert.match(after, new RegExp(`>${trade.buyerLabel}<`));
    assert.match(after, new RegExp(`>${trade.sellerLabel}<`));
  }
});

test("a replay line stops after the latest fill without inventing future OI, and moving positions stay beneath the count", () => {
  const endpoint = (time) => {
    const path = drawOpenInterest(at(time)).svg.match(
      /data-selected-oi="true" d="([^"]+)"/,
    )[1];
    return Number(path.match(/H([\d.]+)$/)[1]);
  };
  assert.equal(endpoint(TIMING.reset), 300);
  assert.ok(endpoint(TIMING.reset) < tradeX(story.trades[0]));
  for (const [index, trade] of story.trades.entries()) {
    const expected = index < 3 ? tradeX(trade) + 20 : 760;
    assert.equal(endpoint(trade.at), expected);
    if (index < 3) {
      assert.equal(endpoint(story.trades[index + 1].at - 1), expected);
      assert.ok(expected < tradeX(story.trades[index + 1]));
    }
    const frame = drawOpenInterest(at(trade.at + 500)).svg;
    const motion = frame.indexOf('data-position-motion="true"');
    const card = frame.indexOf('data-oi-card="true"');
    const count = frame.indexOf("data-open-contracts=");
    assert.ok(motion >= 0 && motion < card && card < count);
  }
  assert.equal(endpoint(0), 760);
  assert.equal(endpoint(TOTAL_DURATION), 760);
});

test("larger quantities, both mixed cases, and invalid closing preserve the original contract counting rules", () => {
  let p = applyContractTrade(
    {},
    {
      buyer: "A",
      seller: "B",
      buyerAction: "open",
      sellerAction: "open",
      size: 3,
    },
  );
  assert.equal(p.oi, 3);
  assert.equal(p.volumeAdded, 3);
  p = applyContractTrade(p.positions, {
    buyer: "C",
    seller: "A",
    buyerAction: "open",
    sellerAction: "close",
    size: 2,
  });
  assert.equal(p.oi, 3);
  p = applyContractTrade(p.positions, {
    buyer: "B",
    seller: "D",
    buyerAction: "close",
    sellerAction: "open",
    size: 2,
  });
  assert.equal(p.oi, 3);
  p = applyContractTrade(p.positions, {
    buyer: "D",
    seller: "C",
    buyerAction: "close",
    sellerAction: "close",
    size: 2,
  });
  assert.equal(p.oi, 1);
  assert.throws(
    () =>
      applyContractTrade(
        {},
        {
          buyer: "A",
          seller: "B",
          buyerAction: "close",
          sellerAction: "open",
          size: 1,
        },
      ),
    RangeError,
  );
});

test("36-second chapters, reverse seeking and reduced motion preserve the full trace and finite geometry", () => {
  assert.equal(TOTAL_DURATION, 36000);
  assert.equal(
    SCENE_DURATIONS.reduce((a, b) => a + b),
    TOTAL_DURATION,
  );
  for (let i = 0; i < 3; i++)
    assert.equal(
      scenePosition(i, SCENE_DURATIONS[i]).time,
      scenePosition(i + 1, 0).time,
    );
  const original = structuredClone(story);
  for (let time = TOTAL_DURATION; time >= 0; time -= 125) {
    const p = at(time);
    assert.deepEqual(
      p.state,
      openInterestSnapshot(createOpenInterestStory(), time),
    );
    for (const reduced of [false, true]) {
      assert.deepEqual(at(time, reduced).state, p.state);
      assert.doesNotMatch(
        drawOpenInterest(at(time, reduced)).svg,
        /NaN|Infinity|undefined|(?:width|height|r)="-/,
      );
    }
  }
  assert.deepEqual(story, original);
});

test("the camera returns to the identical historical chart, and detail labels include safe glyph bounds", () => {
  for (const reduced of [false, true]) {
    assert.deepEqual(cameraAt(0, reduced), cameraAt(TOTAL_DURATION, reduced));
    assert.equal(cameraAt(0, reduced).scale, 0.25);
    assert.equal(cameraAt(TIMING.focused, reduced).scale, 1);
    const first = drawOpenInterest(at(0, reduced)).svg,
      final = drawOpenInterest(at(TOTAL_DURATION, reduced)).svg;
    assert.equal(
      first.match(/data-history-oi="true" d="([^"]+)"/)[1],
      final.match(/data-history-oi="true" d="([^"]+)"/)[1],
    );
    assert.equal([...first.matchAll(/data-candle=/g)].length, 5);
    assert.deepEqual(
      [
        ...first.matchAll(/data-candle="\d" data-open="\d+" data-close="\d+"/g),
      ].map((m) => m[0]),
      [
        ...final.matchAll(/data-candle="\d" data-open="\d+" data-close="\d+"/g),
      ].map((m) => m[0]),
    );
    for (let time = TIMING.zoomIn; time <= TIMING.panorama; time += 25) {
      const camera = cameraAt(time, reduced);
      const screenY = (worldY) =>
        camera.y + (worldY - camera.originY) * camera.scale;
      assert.ok(
        screenY(504 - 13) >= 52,
        `heading glyph top stays inside clip throughout zoom at ${time}`,
      );
      assert.ok(
        screenY(810 + 12 * 0.3) <= 394,
        `event label descenders stay inside clip throughout zoom at ${time}`,
      );
    }
  }
  const c = cameraAt(TIMING.focused),
    sy = (y) => c.y + (y - c.originY) * c.scale;
  assert.ok(
    sy(504 - 13) >= 52,
    "detail chapter heading fits including glyph height",
  );
  assert.ok(
    sy(810 + 12 * 0.3) <= 394,
    "OI event labels fit including descenders",
  );
  for (const trade of story.trades) {
    const frame = drawOpenInterest(at(trade.at + 200)).svg;
    for (const label of [trade.buyerLabel, trade.sellerLabel]) {
      const match = frame.match(
        new RegExp(
          `<text x="(240|760)" y="([\\d.]+)"[^>]*font-size="([\\d.]+)"[^>]*>${label}<`,
        ),
      );
      assert.ok(match);
      assert.ok(sy(Number(match[2]) - Number(match[3])) >= 52);
    }
  }
});

test("zoom transitions never overlap footer copy or lift a price tick into the header", () => {
  for (const reduced of [false, true]) {
    for (let time = 0; time <= TOTAL_DURATION; time += 25) {
      const frame = drawOpenInterest(at(time, reduced)).svg;
      const detailOpacity = Number(
        frame.match(/<g opacity="([\d.]+)" data-footer="detail">/)[1],
      );
      const macroOpacity = Number(
        frame.match(/<g opacity="([\d.]+)" data-footer="macro">/)[1],
      );
      assert.equal(
        detailOpacity * macroOpacity,
        0,
        `footer overlap at ${time}`,
      );
      for (const tick of frame.matchAll(
        /<text x="918" y="([\d.]+)"[^>]*data-price-tick="true"/g,
      )) {
        const baseline = Number(tick[1]);
        assert.ok(baseline - 10 >= 84, `price tick glyph top at ${time}`);
        assert.ok(baseline + 3 <= 260, `price tick descender at ${time}`);
      }
    }
  }
});
