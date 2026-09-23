import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { round } from "../public/orderflow/engine.js";
import { bearPrice, bearSize } from "../public/orderflow/bear-market.js";
import {
  createWickStory,
  wickSnapshot,
  CONTEXT,
} from "../public/orderflow/wick-model.js";
import {
  createPrimerStory,
  primerSnapshot,
  candleAt,
  tradeTrace,
  scenePosition,
  sceneElapsedAt,
  SCENE_DURATIONS,
  formatPrimerClock,
} from "../public/orderflow/primer-model.js";
import {
  drawPrimer,
  transfersAt,
  pairingAt,
} from "../public/orderflow/primer-scene-view.js";
import { narrativeAt } from "../public/orderflow/primer-script.js";
const story = createPrimerStory(),
  at = (t) => primerSnapshot(story, t);
const depth = (s, side, price) =>
  s[side === "buy" ? "bids" : "asks"].find((r) => r.price === price)?.size ?? 0;
const render = (scene, time, elapsed = 0) =>
  drawPrimer({ state: at(time), ...scenePosition(scene, elapsed), time }).svg;
test("all public updates conserve depth, and submissions never become premature trades", () => {
  let previous = at(0);
  for (const f of story.frames.slice(1)) {
    const e = story.events.find((e) => e.at === f.at),
      s = f.state;
    assert.ok(e);
    if (s.bids.length && s.asks.length)
      assert.ok(s.bids[0].price < s.asks[0].price);
    for (const [key, side] of [
      ["bids", "buy"],
      ["asks", "sell"],
    ])
      for (const price of new Set(
        [...previous[key], ...s[key]].map((r) => r.price),
      )) {
        let change = 0;
        if (
          e.price === price &&
          (e.kind === "trade" ? e.side !== side : e.side === side)
        )
          change = e.size * (e.kind === "add" ? 1 : -1);
        assert.equal(
          round(depth(s, side, price) - depth(previous, side, price)),
          round(change),
          `${f.at} ${side} ${price}`,
        );
        assert.ok(depth(s, side, price) >= 0);
      }
    if (e.kind !== "trade") {
      assert.equal(s.price, previous.price);
      assert.deepEqual(s.trades, previous.trades);
    } else {
      assert.equal(s.trades.length, previous.trades.length + 1);
      assert.equal(s.price, e.price);
      assert.equal(
        s.order.filled,
        round(s.order.fills.reduce((v, t) => v + t.size, 0)),
      );
      assert.equal(round(s.order.filled + s.order.remaining), s.order.size);
    }
    assert.ok(s.trades.every((t) => t.at <= f.at));
    previous = s;
  }
});

test("new arbitrary quotes sort by price but leave the candle and last trade unchanged", () => {
  assert.deepEqual(at(9000).asks, [
    { price: 101, size: 2 },
    { price: 110, size: 1 },
  ]);
  assert.deepEqual(at(12000).asks, [
    { price: 101, size: 2 },
    { price: 103, size: 2 },
    { price: 110, size: 1 },
  ]);
  for (const t of [2000, 5000, 9000, 12000, 16000, 16005]) {
    assert.equal(at(t).price, 100);
    assert.equal(candleAt(at(t), t).high, 100);
    assert.equal(at(t).trades.length, 1);
  }
});
test("one five-unit limit order fills 101 then 103 then 110 with no invented intermediate trades", () => {
  const fills = at(16018).order.fills;
  assert.deepEqual(
    fills.map((t) => [t.at, t.price, t.size]),
    [
      [16006, 101, 2],
      [16012, 103, 2],
      [16018, 110, 1],
    ],
  );
  assert.equal(at(16018).order.limit, 110);
  assert.equal(at(16018).order.filled, 5);
  assert.equal(at(16018).order.remaining, 0);
  assert.ok(
    !story.events.some(
      (e) => e.kind === "trade" && e.price > 103 && e.price < 110,
    ),
  );
});
test("fill, resting depth, matched bear units and candle update at exactly the same boundary", () => {
  for (const [time, price, filled, remaining] of [
    [16005, 100, 0, 5],
    [16006, 101, 2, 3],
    [16011, 101, 2, 3],
    [16012, 103, 4, 1],
    [16017, 103, 4, 1],
    [16018, 110, 5, 0],
  ]) {
    const state = at(time),
      c = candleAt(state, time),
      svg = render(time <= 16006 ? 2 : 3, time, 8000);
    assert.equal(state.price, price);
    assert.equal(c.close, price);
    assert.equal(c.high, price);
    assert.equal(c.open, 100);
    assert.equal(state.order.filled, filled);
    assert.equal(state.order.remaining, remaining);
    assert.equal(
      state.asks.reduce((n, r) => n + r.size, 0),
      remaining,
    );
    assert.equal([...svg.matchAll(/data-unit="matched"/g)].length, filled);
    assert.ok(svg.includes('data-close="' + price + '"'));
  }
  assert.equal(depth(at(16012), "sell", 103), 0);
  assert.equal(candleAt(at(16017), 16017).close, 103);
});
test("a better bid does not move the candle until an aggressive sell actually executes", () => {
  assert.equal(at(25000).price, 110);
  assert.equal(at(32000).price, 110);
  assert.equal(at(32006).price, 103);
  assert.equal(depth(at(32006), "buy", 103), 3);
  assert.equal(depth(at(32006), "buy", 99), 5);
  const c = candleAt(at(32006), 32006);
  assert.deepEqual([c.open, c.high, c.low, c.close], [100, 110, 100, 103]);
  assert.match(render(4, 32006, 9000), /上影線/);
});
test("a rebound below the open retains the down color and earlier high and low", () => {
  const low = candleAt(at(40018), 40018),
    bounce = candleAt(at(49006), 49006);
  assert.equal(low.close, 98);
  assert.equal(bounce.close, 99);
  assert.deepEqual([bounce.open, bounce.high, bounce.low], [100, 110, 98]);
  assert.match(render(5, 49006, 14000), /fill="#d99c88"/);
});
test("candle boundaries use actual fills and a new minute waits for its first execution", () => {
  assert.equal(candleAt(at(59999), 59999).closed, false);
  assert.equal(candleAt(at(60000), 60000).closed, true);
  assert.equal(candleAt(at(60000), 60000, 60000), null);
  assert.equal(candleAt(at(60006), 60006, 60000).open, 99);
  for (const f of story.frames)
    for (const start of [0, 60000]) {
      const t = f.state.trades.filter(
        (t) => t.at >= start && t.at < start + 60000 && t.at <= f.at,
      );
      const c = candleAt(f.state, f.at, start);
      if (!t.length) {
        assert.equal(c, null);
        continue;
      }
      assert.deepEqual(
        [c.open, c.high, c.low, c.close],
        [
          t[0].price,
          Math.max(...t.map((t) => t.price)),
          Math.min(...t.map((t) => t.price)),
          t.at(-1).price,
        ],
      );
    }
});
test("the close label only appears after the minute ends, and old candles stay fixed", () => {
  const close = sceneElapsedAt(6, 60000);
  for (const elapsed of [0, close - 1, close, SCENE_DURATIONS[6]]) {
    const p = scenePosition(6, elapsed),
      svg = drawPrimer({ state: at(p.time), ...p }).svg;
    assert.equal(svg.includes("收盤 99"), p.time >= 60000);
  }
  assert.deepEqual(candleAt(at(60000), 60000), candleAt(at(120000), 120000));
  assert.equal(candleAt(at(120000), 120000, 120000), null);
});
test("all eight scenes advance one continuous market with no second-course rewind", () => {
  assert.equal(SCENE_DURATIONS.length, 8);
  for (let scene = 0; scene < 8; scene++) {
    assert.equal(scenePosition(scene, -1).elapsed, 0);
    assert.equal(scenePosition(scene, 999999).elapsed, SCENE_DURATIONS[scene]);
    if (scene)
      assert.equal(
        scenePosition(scene, 0).time,
        scenePosition(scene - 1, SCENE_DURATIONS[scene - 1]).time,
      );
    let last = -1;
    for (let e = 0; e <= SCENE_DURATIONS[scene]; e += 50) {
      const p = scenePosition(scene, e);
      assert.ok(p.time >= last);
      last = p.time;
    }
  }
});
test("backwards scrubbing cannot retain future candles, matched units, quotes or copy", () => {
  const final = at(120000);
  for (const time of [
    0, 9000, 16005, 16006, 16011, 16012, 16017, 16018, 25000, 32006, 40018,
    60000,
  ]) {
    assert.deepEqual(tradeTrace(final, time), tradeTrace(at(time), time));
    assert.deepEqual(candleAt(final, time), candleAt(at(time), time));
  }
  const copy = at(16006);
  copy.order.remaining = 999;
  assert.equal(at(16006).order.remaining, 3);
  assert.doesNotMatch(narrativeAt(3, 4000).question, /最後 1 隻在 110/);
  assert.doesNotMatch(render(3, 16017, 9000), /data-close="110"/);
  assert.equal(
    [...render(2, 16005, 7000).matchAll(/data-unit="matched"/g)].length,
    0,
  );
});
test("each visible travelling bear represents one whole unit in that submitted order", () => {
  for (const [time, side, size, price, scene] of [
    [1300, "buy", 5, 99, 0],
    [4300, "sell", 2, 101, 0],
    [8300, "sell", 1, 110, 1],
    [11300, "sell", 2, 103, 1],
    [15300, "buy", 5, undefined, 2],
    [31300, "sell", 2, undefined, 4],
    [39300, "sell", 9, undefined, 5],
    [48300, "buy", 1, undefined, 5],
  ]) {
    const op = transfersAt(time)[0];
    assert.equal(op.side, side);
    assert.equal(op.size, size);
    const svg = render(scene, time, 3000);
    assert.equal([...svg.matchAll(/data-unit="travelling"/g)].length, size);
    if (price) assert.equal(depth(at(time), side, price), 0);
  }
});

test("later active orders visibly pair with the opposite side before each actual fill", () => {
  for (const [scene, time, side, price, size, filled] of [
    [4, 32003, "buy", 103, 2, 0],
    [5, 40003, "buy", 103, 3, 0],
    [5, 40009, "buy", 99, 5, 3],
    [5, 40015, "buy", 98, 1, 8],
    [5, 49003, "sell", 99, 1, 0],
  ]) {
    const p = scenePosition(scene, sceneElapsedAt(scene, time));
    const state = at(p.time),
      pair = pairingAt(state, p);
    assert.equal(pair.side, side);
    assert.equal(pair.maker.price, price);
    assert.equal(pair.count, size);
    assert.equal(pair.order.filled, filled);
    assert.ok(pair.progress > 0 && pair.progress < 1);
    assert.ok(depth(state, side, price) >= size);
    const svg = drawPrimer({ state, ...p }).svg;
    assert.equal(
      [...svg.matchAll(new RegExp(`data-unit="matching-${side}"`, "g"))].length,
      size,
    );
    assert.equal([...svg.matchAll(/data-unit="matched"/g)].length, filled);
    assert.equal(
      [...svg.matchAll(/data-unit="pending"/g)].length,
      pair.order.remaining,
    );
    const completed = at(time + 3);
    assert.equal(completed.order.filled, filled + size);
    assert.equal(
      depth(completed, side, price),
      depth(state, side, price) - size,
    );
    assert.equal(candleAt(completed, time + 3).close, price);
  }
});

test("matching units move continuously into their slots and remain reversible", () => {
  for (const [scene, begin, count, side] of [
    [2, 16000, 2, "sell"],
    [3, 16006, 2, "sell"],
    [3, 16012, 1, "sell"],
    [4, 32000, 2, "buy"],
    [5, 40000, 3, "buy"],
    [5, 40006, 5, "buy"],
    [5, 40012, 1, "buy"],
    [5, 49000, 1, "sell"],
  ]) {
    const frames = [];
    for (const fraction of [0, 0.25, 0.5, 0.75, 0.999]) {
      const time = begin + 6 * fraction,
        elapsed = sceneElapsedAt(scene, time);
      const svg = render(scene, time, elapsed);
      const points = [
        ...svg.matchAll(
          new RegExp(
            `transform="translate\\(([^ ]+) ([^)]+)\\)" data-unit="matching-${side}"`,
            "g",
          ),
        ),
      ].map((m) => [Number(m[1]), Number(m[2])]);
      assert.equal(points.length, count);
      assert.ok(
        points.every(([x, y]) => Number.isFinite(x) && y >= 180 && y <= 389),
      );
      frames.push({ time, elapsed, svg, points });
    }
    for (let i = 1; i < frames.length; i++)
      assert.ok(frames[i].points[0][1] > frames[i - 1].points[0][1]);
    assert.ok(Math.abs(frames.at(-1).points[0][1] - 377) < 0.01);
    for (const frame of frames.reverse())
      assert.equal(render(scene, frame.time, frame.elapsed), frame.svg);
  }
});

test("the shorter edit keeps readable arrival and matching motion with brief ending holds", () => {
  assert.ok(
    SCENE_DURATIONS.reduce((sum, duration) => sum + duration, 0) < 75000,
  );
  for (const [scene, start, end] of [
    [2, 16000, 16006],
    [3, 16006, 16012],
    [3, 16012, 16018],
    [4, 32000, 32006],
    [5, 40000, 40006],
    [5, 40006, 40012],
    [5, 40012, 40018],
    [5, 49000, 49006],
  ]) {
    const motion = sceneElapsedAt(scene, end) - sceneElapsedAt(scene, start);
    assert.ok(motion >= 1500 && motion <= 3400);
  }
  for (const [scene, arrival] of [
    [2, 16000],
    [4, 32000],
    [5, 40000],
    [5, 49000],
  ])
    assert.ok(
      sceneElapsedAt(scene, arrival) - sceneElapsedAt(scene, arrival - 1400) >=
        1100,
    );
  for (const [scene, lastEvent] of [
    [2, 16006],
    [3, 16018],
    [4, 32006],
    [5, 49006],
    [6, 60000],
  ])
    assert.ok(
      SCENE_DURATIONS[scene] - sceneElapsedAt(scene, lastEvent) <= 1500,
    );
});
test("all prices and quantities remain integer bears and the bridge preserves the same book and candles", () => {
  for (const f of story.frames)
    for (const r of [...f.state.bids, ...f.state.asks, ...f.state.trades]) {
      assert.ok(Number.isInteger(r.price));
      assert.ok(Number.isInteger(r.size));
      assert.ok(r.size > 0);
    }
  const end = at(120000),
    target = wickSnapshot(createWickStory(), 0);
  for (const key of ["bids", "asks"])
    assert.deepEqual(
      end[key],
      target[key].map((r) => ({
        price: bearPrice(r.price),
        size: bearSize(r.size),
      })),
    );
  assert.equal(end.price, bearPrice(target.price));
  for (const [start, index] of [
    [0, 2],
    [60000, 3],
  ])
    for (const key of ["open", "high", "low", "close"])
      assert.equal(
        candleAt(end, 120000, start)[key],
        bearPrice(CONTEXT[index][key]),
      );
  assert.equal(formatPrimerClock(120000), "14:32:00.000");
  assert.equal(formatPrimerClock(16012), "14:30:16.012");
  assert.equal(formatPrimerClock(16018), "14:30:16.018");
});
test("candle bodies stay centered on their wicks in every scene and camera position", () => {
  for (let scene = 0; scene < 8; scene++)
    for (const fraction of [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1])
      for (const reduced of [false, true]) {
        const p = scenePosition(
            scene,
            SCENE_DURATIONS[scene] * fraction,
            reduced,
          ),
          svg = drawPrimer({ state: at(p.time), ...p }).svg;
        assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
        for (const [, body] of svg.matchAll(
          /<g data-candle="true"[^>]*>([\s\S]*?)<\/g>/g,
        )) {
          const wick = Number(/x1="([^"]+)"/.exec(body)[1]);
          const r =
            /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/.exec(
              body,
            );
          assert.ok(Math.abs(wick - Number(r[1]) - Number(r[3]) / 2) < 1e-8);
          assert.ok(Number(r[1]) >= 0 && Number(r[1]) + Number(r[3]) <= 1000);
          assert.ok(Number(r[2]) >= 0 && Number(r[2]) + Number(r[4]) <= 430);
        }
      }
});
test("the old K-line link leads to the unified story and the following story returns to scene eight", () => {
  const read = (f) =>
    readFileSync(new URL("../public/orderflow/" + f, import.meta.url), "utf8");
  assert.match(
    read("candles.html"),
    /http-equiv="refresh" content="0;url=\.\/matching.html"/,
  );
  assert.doesNotMatch(read("primer.js"), /candles.html|data.chapter/);
  assert.match(read("wick.js"), /matching.html#scene-8/);
  assert.equal([...read("matching.html").matchAll(/<li\b/g)].length, 8);
});
