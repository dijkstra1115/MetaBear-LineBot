// The one take of the real lab, planned from the data: 9/14, the 20:58 long that stops out, then the
// 21:10 long off the same line that reaches its target. Footage second → data time is pinned at
// each event, so every event lands on its beat. Used by day-shot.mjs and build.mjs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { S } from "./cues.mjs";
import { REPO, TAPE } from "./lab-rig.mjs";

const taipei = (s) => Date.parse(`${s}+08:00`);

export function loadPlan() {
  const data = JSON.parse(readFileSync(join(TAPE, "day.data.json"), "utf8"));
  const seg = JSON.parse(readFileSync(join(REPO, "motion/replays/segments/assets/data/2026-09-14.json"), "utf8"));
  const touchOf = (from, up, down) => {
    for (const s of data.slices) {
      const t = data.start + s[0] * 1000;
      if (t < from) continue;
      if (s[2] >= up) return { t: t + 1000, hit: "up" };
      if (s[3] <= down) return { t: t + 1000, hit: "down" };
    }
    throw new Error("no touch");
  };
  // Fills are at the close of the signal bar, one minute after the wall's bar time.
  const trades = seg.trades.map((t) => {
    const fill = t.entryT + 60000;
    const x = touchOf(fill, t.dir === "long" ? t.tp : t.stop, t.dir === "long" ? t.stop : t.tp);
    const won = (x.hit === "up") === (t.dir === "long");
    if (won !== (t.result === "tp")) throw new Error(`trade ${fill}: page says ${won}, wall says ${t.result}`);
    return { ...t, fill, touchAt: x.t };
  });
  const [t1, t2, t3, t4] = trades;
  const V = (film) => film - S.quiet;
  const pins = [
    [V(S.quiet), taipei("2026-09-14T20:46:00")],
    [V(S.full), t3.fill],
    [V(S.fpCut), taipei("2026-09-14T21:05:00")],
    [V(S.stop), t3.touchAt],
    [V(S.entry), t4.fill],
    [V(S.zoomOut), taipei("2026-09-14T21:12:00")],
    [V(S.tp - 0.75), taipei("2026-09-14T21:27:00")],
    [V(S.tp), t4.touchAt],
    [V(S.tp + 0.85), taipei("2026-09-14T21:33:00")],
  ];
  for (let k = 1; k < pins.length; k++) if (pins[k][1] <= pins[k - 1][1]) throw new Error(`pins out of order at ${k}`);
  // Data time → film second, for placing a sound on a real trade.
  const filmOf = (t) => {
    for (let k = 0; k + 1 < pins.length; k++) {
      const [a, ta] = pins[k], [b, tb] = pins[k + 1];
      if (t >= ta && t <= tb) return S.quiet + a + ((t - ta) / (tb - ta)) * (b - a);
    }
    return null;
  };
  return { data, seg, trades, t1, t2, t3, t4, pins, filmOf };
}
