import test from "node:test";
import assert from "node:assert/strict";
import {
  projectLiquidity,
  liquidityForFrame,
  buildHeatmap,
} from "./liquidity.js";
import { demoFrame } from "./demo.js";
import { QuantStore } from "./store.js";
import { step, initialState } from "./engine.js";
import type { Frame } from "./types.js";

function fixture(time = 1789690210000): Frame {
  const f = demoFrame("BTCUSDT", 10);
  delete f.liquidity;
  return {
    ...f,
    id: `heat:${time}`,
    time,
    bookTime: time - 100,
    bids: [
      [100, 2],
      [99, 3],
      [96, 5],
    ],
    asks: [
      [101, 1],
      [102, 2],
      [105, 4],
    ],
    mark: 100.5,
  };
}
test("absolute price buckets conserve resting USDT and keep bid/ask sides separate", () => {
  const f = fixture(),
    book = liquidityForFrame(f)!;
  assert.equal(
    book.cells.reduce((n, r) => n + r[1], 0),
    977,
  );
  assert.equal(
    book.cells.reduce((n, r) => n + r[2], 0),
    725,
  );
  assert.deepEqual(
    book.cells.find((r) => r[0] === 100),
    [100, 200, 305],
  );
  assert.equal(book.low, 96);
  assert.equal(book.high, 105);
});
test("deep snapshots older than 15 seconds fall back to known WS coverage; invalid WS stays missing", () => {
  const f = fixture();
  f.liquidity = projectLiquidity(
    "BTCUSDT",
    [
      [100, 1],
      [90, 100],
    ],
    [
      [101, 1],
      [110, 100],
    ],
    f.time - 100,
    "bybit-full-rest",
  );
  assert.ok(f.liquidity);
  assert.equal(liquidityForFrame(f)!.source, "bybit-full-rest");
  f.liquidity!.time = f.time - 15001;
  assert.equal(liquidityForFrame(f)!.bidLevels, 3);
  f.bookTime = f.time - 6000;
  assert.equal(liquidityForFrame(f), undefined);
  f.liquidity.time = f.time + 2001;
  assert.equal(liquidityForFrame(f), undefined);
});
test("heatmap takes one last snapshot per time column, never adds time observations or fills gaps", () => {
  const start = 1789690200000,
    f1 = fixture(start + 1000),
    f2 = fixture(start + 5000),
    f3 = fixture(start + 25000);
  f2.bids[0][1] = 4;
  const h = buildHeatmap([f1, f2, f3], {
    start,
    end: start + 40000,
    interval: 10000,
    range: 0.05,
  });
  assert.equal(h.columns.length, 4);
  assert.equal(h.columns[0]!.time, f2.time);
  assert.equal(h.columns[1], null);
  assert.equal(h.columns[3], null);
  assert.equal(
    h.columns[0]!.cells.reduce((n, r) => n + r[1], 0),
    1177,
  );
  assert.equal(
    h.columns[2]!.cells.reduce((n, r) => n + r[1], 0),
    977,
  );
  assert.equal(h.observedColumns, 2);
});
test("empty view is bounded and does not invent observations", () => {
  const h = buildHeatmap([], {
    start: 1000,
    end: 61000,
    interval: 10000,
    range: 0.01,
  });
  assert.equal(h.latest, null);
  assert.equal(h.observedColumns, 0);
  assert.ok(h.columns.every((c) => c === null));
  assert.ok(Number.isFinite(h.binSize));
});
test("database sampling chooses each bucket last frame and keeps symbols and requested range isolated", () => {
  const store = new QuantStore(":memory:"),
    start = 1789690200000;
  try {
    const f1 = fixture(start + 1000),
      f2 = fixture(start + 5000),
      f3 = fixture(start + 25000);
    store.process(f1);
    store.process(f2);
    store.process({ ...fixture(start + 8000), symbol: "ETHUSDT" });
    store.process(f3);
    const frames = store.heatmapFrames("BTCUSDT", start, start + 30000, 10000);
    assert.deepEqual(
      frames.map((f) => f.time),
      [f2.time, f3.time],
    );
    assert.equal(
      store.heatmapFrames("BTCUSDT", start + 30000, start + 60000, 10000)
        .length,
      0,
    );
  } finally {
    store.close();
  }
});
test("deep heatmap metadata does not alter the baseline strategy or fills", () => {
  const f = demoFrame("BTCUSDT", 10),
    clean = structuredClone(f);
  delete clean.liquidity;
  assert.deepEqual(step(initialState(), f), step(initialState(), clean));
});
