import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Player, pnl, prepare, stepTime } from "../public/lab/orderflow/replay.js";

const M = 60_000;
const START = Date.UTC(2026, 8, 14, 12, 0); // 20:00 Taipei
// One second of trades: [seconds from start, o, h, l, c, [[bin, buy, sell]]]
const slice = (sec, price, buy = 1, sell = 0) => [sec, price, price, price, price, [[Math.floor(price / 10), buy, sell]]];
const data = {
  start: START,
  end: START + 5 * M,
  rows: [[START - M, 100, 100, 100, 100, [[10, 1, 1]]]],
  slices: [slice(0, 100), slice(30, 110, 2, 1), slice(59, 105), slice(60, 120), slice(130, 90, 0, 3), slice(200, 150)],
  prints: [[START + 10_000, "buy", 100, 12], [START + 70_000, "sell", 120, 30]],
  metrics: [[START - M, 1000], [START + 5 * M, 1010]],
};

test("the forming minute grows second by second and ends as the full minute", () => {
  const p = prepare(data);
  // Before the first second has finished, only history is there.
  assert.deepEqual(p.rowsUntil(START + 500).map((r) => r[0]), [START - M]);
  const partial = p.rowsUntil(START + 31_000).at(-1);
  assert.deepEqual(partial.slice(0, 5), [START, 100, 110, 100, 110]);
  assert.deepEqual(partial[5], [[10, 1, 0], [11, 2, 1]]);
  const full = p.rowsUntil(START + M).at(-1);
  assert.deepEqual(full.slice(0, 5), [START, 100, 110, 100, 105]);
  assert.deepEqual(p.rowsUntil(START + M + 30_000).at(-2), full);
  assert.equal(p.printsUntil(START + 9_999), 0);
  assert.equal(p.printsUntil(START + 10_000), 1);
  assert.equal(p.readingsUntil(START), 1);
});

test("script times read as Taipei wall clock on the script's date", () => {
  assert.equal(stepTime("20:00", { date: "2026-09-14" }), START);
  assert.equal(stepTime("20:00:30", { date: "2026-09-14", tz: "+08:00" }), START + 30_000);
  assert.equal(stepTime("2026-09-14T12:00:00Z", {}), START);
});

test("steps fire in order, holds freeze the clock, and seeking rebuilds the same state", () => {
  const script = {
    date: "2026-09-14",
    steps: [
      { at: "20:00", speed: 60, caption: "開場", line: { id: "lv", price: 100, label: "線" }, hold: 1000 },
      { at: "20:01", caption: "第二句", note: { id: "n", price: 120, text: "註" } },
      { at: "20:02", clear: ["note:n"], position: { side: "long", entry: 100, stop: 90, r: 3 } },
    ],
  };
  const player = new Player(script, prepare(data));
  // The first step shows at once, its hold still to come.
  assert.equal(player.state.caption, "開場");
  assert.equal(player.t, START);
  player.advance(600);
  assert.equal(player.t, START, "held");
  player.advance(600);
  player.advance(1000); // 60× → one minute of market time
  assert.equal(player.state.caption, "第二句");
  assert.ok(player.state.notes.has("n"));
  player.advance(2000);
  assert.equal(player.state.notes.has("n"), false);
  assert.equal(player.state.position.target, 130);
  const live = player.t;
  const again = new Player(script, prepare(data));
  again.seek(live);
  assert.equal(again.state.caption, player.state.caption);
  assert.deepEqual([...again.state.lines.keys()], ["lv"]);
});

test("a position closes at the first second that touches its target or stop", () => {
  const script = { date: "2026-09-14", steps: [{ at: "20:00:01", position: { side: "short", entry: 110, stop: 125, target: 95 } }] };
  const player = new Player(script, prepare(data));
  player.seek(START + 5 * M);
  // Second 60 trades 120 (below the stop); second 130 trades 90, through the short's target.
  assert.deepEqual(player.state.position.exit, { t: START + 131_000, price: 95, won: true });
  assert.deepEqual(pnl(player.state.position, 95), { r: 1, pct: (15 / 110) * 100 });
});

test("the recorded case script lines up with its data", async () => {
  const dir = new URL("../public/lab/orderflow/cases/", import.meta.url);
  const script = JSON.parse(await readFile(new URL("2026-09-14.json", dir), "utf8"));
  const raw = JSON.parse(await readFile(new URL(script.data, dir), "utf8"));
  const player = new Player(script, prepare(raw));
  for (const step of player.steps) assert.ok(step.t >= raw.start && step.t <= raw.end, `${step.at} inside the replay`);
  player.seek(raw.end);
  const { position } = player.state;
  assert.equal(position.exit?.won, true);
  assert.equal(position.exit.price, position.target);
});
