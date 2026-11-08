import { test } from "node:test";
import assert from "node:assert/strict";
import { updateSql, verifyScores } from "../scripts/arena-verify-scores";

// Stored scores from before the server replayed uploads: what the backfill does with each.
const row = (id: number, seed: number, pnl: number, stats: Record<string, unknown> = { settled: true, position: 0 }) => ({
  id, name: `player-${id}`, pnl, seed, turns: 24, stats: JSON.stringify(stats), actions: "[]",
});
const replay = ({ seed }: { seed: number }) => {
  if (seed === 3) throw new Error("平倉仍在等待流動性，尚無最終成績");
  return { pnl: seed === 1 ? 120.5 : -40, volume: 200, liquidations: 1, ignited: 0, settled: true, position: 0 } as any;
};

test("old scores are sorted by their replay, keeping an admin recalculation's source", () => {
  const report = verifyScores([row(1, 1, 120.5), row(2, 2, 99_999_999, { settled: true, position: 0, recalculatedFrom: 7 }), row(4, 3, 10)], replay as any);
  assert.deepEqual(report.matched.map((r) => r.id), [1]);
  assert.deepEqual(report.matched[0].stats, { settled: true, position: 0, volume: 200, liquidations: 1, ignited: 0 });
  assert.deepEqual(report.corrected.map((r) => [r.id, r.stored, r.pnl]), [[2, 99_999_999, -40]]);
  assert.equal(report.corrected[0].stats.recalculatedFrom, 7, "the board keeps labelling it 舊賽季重算");
  assert.deepEqual(report.failed.map((r) => r.id), [4]);
  assert.match(report.failed[0].reason, /尚無最終成績/);
});

test("updates apply only to scores that are still unverified, with quoted text escaped", () => {
  const sql = updateSql([
    { id: 1, name: "a", stored: 1, pnl: -64044.13, stats: { settled: true } },
    { id: 2, name: "b", stored: 1, pnl: 5, stats: { note: "it's" } },
  ]).split("\n");
  assert.equal(sql[0], `UPDATE arena_scores SET pnl = -64044.13, stats = '{"settled":true}', verified = 1 WHERE id = 1 AND verified = 0;`);
  assert.match(sql[1], /stats = '\{"note":"it''s"\}'/);
  assert.throws(() => updateSql([{ id: 3, name: "c", stored: 1, pnl: NaN, stats: {} }]), /no usable result/);
});
