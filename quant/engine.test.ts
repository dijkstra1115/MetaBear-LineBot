import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoFrame, createDemo } from "./demo.js";
import { DEFAULT_CONFIG, SYMBOLS, type Frame, type Position } from "./types.js";
import {
  initialState,
  features,
  decide,
  step,
  equity,
  walkBook,
} from "./engine.js";
import { OrderBook, TradeFlow } from "./market.js";
import { QuantStore } from "./store.js";
import { modelInput } from "./model-input.js";

const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const next = (f: Frame, ms = 10000): Frame => ({
  ...structuredClone(f),
  id: f.id + ":next:" + ms,
  time: f.time + ms,
  bookTime: f.time + ms - 100,
});
function prices(f: Frame, mid: number): Frame {
  return {
    ...f,
    mark: mid,
    bids: Array.from({ length: 100 }, (_, i) => [mid - 0.01 - i * 0.01, 10]),
    asks: Array.from({ length: 100 }, (_, i) => [mid + 0.01 + i * 0.01, 10]),
  };
}
function position(f: Frame, extra: Partial<Position> = {}): Position {
  return {
    id: "position-test",
    symbol: "BTCUSDT",
    side: "long",
    qty: 1,
    entry: 1000,
    stop: 950,
    target: 1100,
    openedAt: f.time - 1000,
    entryFee: 0.55,
    funding: 0,
    lastMark: 1000,
    markTime: f.time - 1000,
    fundingNext: null,
    fundingRate: 0.0001,
    fundingUncertain: false,
    ...extra,
  };
}

test("orderbook applies absolute deltas, deletions, ignores stale updates and resets on snapshots", () => {
  const b = new OrderBook();
  b.apply("delta", { u: 2, b: [["100", "1"]], a: [] }, 1000);
  assert.equal(b.ready, false);
  b.apply(
    "snapshot",
    {
      u: 3,
      b: [
        ["100", "2"],
        ["99", "3"],
      ],
      a: [["101", "4"]],
    },
    2000,
  );
  b.apply(
    "delta",
    {
      u: 4,
      b: [
        ["100", "5"],
        ["99", "0"],
      ],
      a: [],
    },
    3000,
  );
  assert.deepEqual(b.levels("bid"), [[100, 5]]);
  b.apply("delta", { u: 3, b: [["100", "90"]], a: [] }, 2500);
  assert.deepEqual(b.levels("bid"), [[100, 5]]);
  b.apply("snapshot", { u: 1, b: [["98", "2"]], a: [["99", "1"]] }, 4000);
  assert.deepEqual(b.levels("bid"), [[98, 2]]);
  assert.throws(
    () => b.apply("delta", { u: 2, b: [["98", "-1"]], a: [] }, 5000),
    /invalid_book_size/,
  );
});
test("trade flow uses taker side and quote notional; duplicate IDs cannot inflate delta", () => {
  const flow = new TradeFlow(),
    start = Date.UTC(2026, 8, 18);
  const trade = { i: "one", T: start + 10000, p: "100", v: "2", S: "Buy" };
  flow.add(trade, start + 10010);
  flow.add(trade, start + 10020);
  flow.add(
    { ...trade, i: "two", S: "Sell", v: "1", T: start + 11000 },
    start + 11010,
  );
  assert.deepEqual(flow.closed(start + 65000, start), [
    { time: start, buy: 200, sell: 100, trades: 2 },
  ]);
  // At +4 seconds a prior minute is not sealed; at +5 seconds it is.
  assert.equal(flow.closed(start + 64000, start).length, 0);
  flow.add({ ...trade, i: "late", T: start + 59000 }, start + 66000);
  assert.equal(flow.late, 1);
  assert.equal(flow.lastLossTime, start + 66000);
  assert.equal(flow.closed(start + 125000, flow.lastLossTime).length, 0);
});
test("features reject partial windows and do not read future or unfinished candles", () => {
  const f = demoFrame("BTCUSDT", 10),
    before = features(f);
  assert.equal(before.ready, true);
  const future = {
    ...f.candles.at(-1)!,
    time: before.windowEnd,
    high: 1e9,
    close: 1e9,
  };
  assert.deepEqual(features({ ...f, candles: [...f.candles, future] }), before);
  assert.equal(features({ ...f, perp: f.perp.slice(0, -1) }).ready, false);
  assert.equal(features({ ...f, coverageStart: f.time - 100000 }).ready, false);
  assert.equal(features({ ...f, bookTime: f.time - 6000 }).ready, false);
  assert.equal(features({ ...f, oiChangePct: null }).ready, false);
  assert.equal(
    features({ ...f, candles: f.candles.filter((_, i) => i !== 75) }).ready,
    false,
  );
});
test("all six confirmations are needed in either direction", () => {
  for (const [minute, action] of [
    [10, "long"],
    [35, "short"],
  ] as const) {
    const f = demoFrame("BTCUSDT", minute);
    assert.equal(decide(f, features(f), DEFAULT_CONFIG).action, action);
    const bad = { ...f, oiChangePct: -1 };
    assert.equal(decide(bad, features(bad), DEFAULT_CONFIG).action, "wait");
    const offline = { ...f, healthy: false };
    assert.equal(
      decide(offline, features(offline), DEFAULT_CONFIG).action,
      "wait",
    );
  }
});
test("entry must wait for a newer book and minimum latency; duplicate frames are idempotent", () => {
  const f = demoFrame("BTCUSDT", 10),
    first = step(initialState(), f);
  assert.equal(first.decision?.action, "long");
  assert.equal(first.fills.length, 0);
  assert.equal(first.state.pending.length, 1);
  const tooSoon = step(first.state, next(f, 100));
  assert.equal(tooSoon.fills.length, 0);
  const oldBook = step(first.state, { ...next(f), bookTime: f.time });
  assert.equal(oldBook.fills.length, 0);
  const second = step(first.state, next(f));
  assert.equal(second.fills[0].kind, "entry");
  assert.equal(second.state.positions.length, 1);
  assert.ok(second.fills[0].price > f.asks[0][0]);
  assert.ok(second.fills[0].fee > 0);
  assert.deepEqual(step(second.state, next(f)).state, second.state);
});
test("pending plans expire or are rejected on price deviation, spread, or insufficient depth", () => {
  const f = demoFrame("BTCUSDT", 10),
    s = step(initialState(), f).state;
  const expired = step(s, next(f, 30000));
  assert.equal(expired.state.pending.length, 0);
  assert.equal(expired.events[0].kind, "cancel");
  const gap = step(s, prices(next(f), f.mark * 1.01));
  assert.equal(gap.fills.length, 0);
  assert.equal(gap.events[0].kind, "reject");
  const shallow = {
    ...next(f),
    asks: f.asks.map(([p]) => [p, 0.000001] as [number, number]),
  };
  assert.equal(step(s, shallow).fills.length, 0);
  const wide = {
    ...next(f),
    asks: f.asks.map(([p, q]) => [p + 100, q] as [number, number]),
  };
  assert.equal(step(s, wide).fills.length, 0);
});
test("walking the book calculates VWAP and refuses partial fills", () => {
  near(
    walkBook(
      [
        [100, 1],
        [102, 2],
      ],
      2,
    )!,
    101,
  );
  assert.equal(walkBook([[100, 1]], 2), null);
});
test("stop gaps execute at available bid plus adverse slippage; net includes both fees", () => {
  const f = prices(demoFrame("BTCUSDT", 10), 900),
    s = initialState();
  s.cash -= 0.55;
  s.positions = [position(f)];
  const r = step(s, f),
    fill = r.fills[0];
  assert.equal(fill.reason, "停損");
  near(fill.price, 899.99 * 0.9999);
  const gross = fill.price - 1000,
    fee = fill.price * 0.00055;
  near(fill.netPnl!, gross - fee - 0.55);
  near(r.state.cash, 10000 + fill.netPnl!);
  assert.equal(r.state.completed, 1);
  assert.equal(r.state.positions.length, 0);
  assert.ok(fill.price < 950);
});
test("short exit buys asks; stale depth cannot close, while a spot outage does not block valid perp stops", () => {
  const f = prices(demoFrame("BTCUSDT", 10), 1100),
    s = initialState();
  s.cash -= 0.55;
  s.positions = [position(f, { side: "short", stop: 1050, target: 900 })];
  assert.equal(step(s, { ...f, bookTime: f.time - 6000 }).fills.length, 0);
  const r = step(s, { ...f, healthy: false, issues: ["現貨串流未連線"] });
  assert.equal(r.fills[0].reason, "停損");
  near(r.fills[0].price, 1100.01 * 1.0001);
  assert.ok(r.fills[0].netPnl! < 0);
});
test("portfolio gross exposure cannot exceed equity across symbols including entry costs", () => {
  let state = initialState();
  for (const offset of [10000, 20000])
    for (const symbol of SYMBOLS)
      state = step(state, demoFrame(symbol, 10, offset)).state;
  assert.ok(state.positions.length >= 1);
  assert.ok(
    state.positions.reduce((n, p) => n + p.qty * p.entry, 0) <=
      equity(state) * DEFAULT_CONFIG.maxExposure,
  );
});
test("loss limit latches for the UTC day and exit cooldown prevents instant reentry", () => {
  const f = prices(demoFrame("BTCUSDT", 10), 900),
    s = initialState();
  s.positions = [position(f, { qty: 3 })];
  s.day = new Date(f.time).toISOString().slice(0, 10);
  const r = step(s, f);
  assert.equal(r.state.haltedDay, s.day);
  assert.equal(r.state.pending.length, 0);
  assert.equal(r.decision?.action, "wait");
  assert.match(r.decision!.reasons[0], /單日虧損/);
  const tomorrow = next(f, 86400000);
  const resumed = step(r.state, tomorrow);
  assert.equal(resumed.state.haltedDay, null);
  const cold = initialState();
  cold.lastExit.BTCUSDT = f.time - 10000;
  const cooldown = step(cold, demoFrame("BTCUSDT", 10));
  assert.equal(cooldown.decision?.action, "wait");
  assert.match(cooldown.decision!.reasons[0], /冷卻/);
});
test("funding applies exactly once with opposite long/short signs and flags a settlement gap", () => {
  const f = prices(demoFrame("BTCUSDT", 10), 1000);
  for (const side of ["long", "short"] as const) {
    const s = initialState();
    s.positions = [
      position(f, {
        side,
        stop: side === "long" ? 900 : 1100,
        target: side === "long" ? 1200 : 800,
        fundingNext: f.time - 10,
      }),
    ];
    const r = step(s, f);
    near(r.state.totalFunding, side === "long" ? -0.1 : 0.1);
    near(step(r.state, next(f)).state.totalFunding, r.state.totalFunding);
  }
  const s = initialState();
  s.positions = [position(f, { fundingNext: f.time - 120000 })];
  assert.equal(step(s, f).state.positions[0].fundingUncertain, true);
});
test("a new entry is never charged for a funding settlement that preceded the entry", () => {
  const f = demoFrame("BTCUSDT", 10),
    s = step(initialState(), f).state;
  const fillFrame = { ...next(f), nextFundingTime: f.time - 1000 };
  const opened = step(s, fillFrame);
  assert.equal(opened.state.positions.length, 1);
  assert.equal(opened.state.positions[0].fundingNext, null);
  const later = step(opened.state, next(fillFrame));
  assert.equal(later.state.totalFunding, 0);
});
test("an experiment refuses to reuse a ledger with different risk settings", () => {
  const folder = mkdtempSync(join(tmpdir(), "metabear-quant-config-")),
    path = join(folder, "paper.sqlite");
  try {
    const store = new QuantStore(path);
    store.close();
    assert.throws(
      () => new QuantStore(path, { ...DEFAULT_CONFIG, riskFraction: 0.01 }),
      /不同策略設定/,
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
test("SQLite survives restart, rejects duplicate frames, preserves exact decision input and replays deterministically", () => {
  const folder = mkdtempSync(join(tmpdir(), "metabear-quant-test-")),
    path = join(folder, "paper.sqlite");
  try {
    let store = new QuantStore(path),
      count = 0;
    for (let minute = 0; minute < 45; minute++)
      for (const offset of [10000, 20000])
        for (const symbol of SYMBOLS) {
          store.process(demoFrame(symbol, minute, offset));
          count++;
        }
    const before = store.state();
    assert.ok(before.completed > 0);
    assert.equal(store.process(demoFrame("ETHUSDT", 44, 20000)), null);
    const latest = store.latest("BTCUSDT")!;
    assert.equal(latest.symbol, "BTCUSDT");
    const d = store.recent<{ id: string }>("decisions", 1)[0];
    const detail = store.detail(d.id)!;
    assert.equal(detail.decision.frameId, detail.input.id);
    store.close();
    store = new QuantStore(path);
    assert.deepEqual(store.state(), before);
    let replay = initialState(),
      seen = 0;
    for (const f of store.exportFrames()) {
      replay = step(replay, f).state;
      seen++;
    }
    assert.equal(seen, count);
    assert.deepEqual(replay, before);
    store.close();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
test("synthetic demo has trades but separate storage and is identified as synthetic in model draft", () => {
  const demo = createDemo(),
    live = new QuantStore(":memory:");
  try {
    assert.ok(demo.state().completed > 0);
    assert.equal(live.state().completed, 0);
    assert.equal(live.latest("BTCUSDT"), null);
    assert.ok(
      demo.state().completed > demo.state().wins,
      "demo should include losing trades",
    );
    const draft = modelInput(
        demo.latest("BTCUSDT")!,
        demo.state(),
        demo.config,
      ),
      input = draft.body.state;
    assert.equal(draft.status, "draft_not_sent");
    assert.equal(input.source, "synthetic");
    assert.equal(input.execution, "paper_only");
    assert.equal(input.market.top_20_bids.length, 20);
    assert.equal(draft.body.questions.proposed_action.type, "choice");
    assert.equal(draft.body.model, "jev-1.13.0");
    assert.ok(
      input.market.closed_1m_candles.every(
        (b: { time: number }) => b.time + 60000 <= input.quality.window_end,
      ),
    );
  } finally {
    demo.close();
    live.close();
  }
});
