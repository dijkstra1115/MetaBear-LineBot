// The case wall: the 30 trades of the replay segments, and where each one hangs. The take's tile is
// in the middle, where the camera ends up; the rest fill the other cells in order.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HERO } from "./cues.mjs";
import { REPO } from "./lab-rig.mjs";

const SEG = ["2026-09-14", "2026-09-24", "2026-08-21", "2026-08-27", "2026-08-31", "2026-08-24"];
const COLS = 6;
const ROWS = 5;
const when = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const centreOf = (col, row) => ({ cx: (col - 2.5) * 850, cy: (row - 2) * 500 });

export function loadWall() {
  const wall = [];
  for (const id of SEG) {
    const d = JSON.parse(readFileSync(join(REPO, `motion/replays/segments/assets/data/${id}.json`), "utf8"));
    for (const t of d.trades) {
      const a = Math.max(0, t.signal - 22);
      wall.push({ at: when.format(t.entryT).replace(/\s+/g, " "), entryT: t.entryT, dir: t.dir, entry: t.entry, stop: t.stop, tp: t.tp, r: t.r, result: t.result, i0: t.signal - a, i1: t.exit - a, bars: d.bars.slice(a, Math.min(d.bars.length, t.exit + 8)).map((x) => x.slice(1, 5)) });
    }
  }
  const taken = new Set([HERO.row * COLS + HERO.col]);
  let free = 0;
  wall.forEach((w, i) => {
    if (i === HERO.wall) {
      w.col = HERO.col;
      w.row = HERO.row;
      return;
    }
    while (taken.has(free)) free++;
    taken.add(free);
    w.col = free % COLS;
    w.row = Math.floor(free / COLS);
  });
  if (wall.length !== COLS * ROWS) throw new Error(`the wall has ${wall.length} trades, not ${COLS * ROWS}`);
  return wall;
}
