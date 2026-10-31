// The one take of the real lab, planned from the data: 9/14 from late morning, four longs in a row off
// the same line, ending with the 20:58 long that stops out and the 21:10 long that reaches its target.
// Footage second → data time is pinned at each event, so every event lands on its beat. Used by
// day-shot.mjs and build.mjs.
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
  // The stacked imbalance that triggers a long, from that minute's real trades: the rule's own test
  // (scripts/replay-cases/scan-case-rules.mjs), and it must match the layers the segment recorded.
  const stackOf = (t) => {
    const lv = new Map();
    for (const s of data.slices) {
      const at = data.start + s[0] * 1000;
      if (at < t.entryT || at >= t.entryT + 60000) continue;
      for (const [bin, buy, sell] of s[5]) {
        const x = lv.get(bin) ?? [0, 0];
        x[0] += buy;
        x[1] += sell;
        lv.set(bin, x);
      }
    }
    let run = 0, best = 0, top = 0;
    for (const bin of [...lv.keys()].sort((x, y) => x - y)) {
      const [buy] = lv.get(bin);
      run = buy >= 1 && buy >= 3 * (lv.get(bin - 1)?.[1] ?? 0) ? run + 1 : 0;
      if (run > best) (best = run), (top = bin);
    }
    const said = Number(t.alerts.find((a) => a.tone === "buy")?.text.match(/(\d+) 層/)?.[1]);
    if (best !== said) throw new Error(`stack at ${new Date(t.entryT).toISOString()}: the minute has ${best} layers, the segment says ${said}`);
    return { n: best, lo: (top - best + 1) * data.tick, hi: (top + 1) * data.tick, tick: data.tick };
  };
  // Fills are at the close of the signal bar, one minute after the wall's bar time. The signal shows
  // in that bar's last seconds, and the clock all but stops for it.
  const trades = seg.trades.map((t) => {
    const fill = t.entryT + 60000;
    const x = touchOf(fill, t.dir === "long" ? t.tp : t.stop, t.dir === "long" ? t.stop : t.tp);
    const won = (x.hit === "up") === (t.dir === "long");
    if (won !== (t.result === "tp")) throw new Error(`trade ${fill}: page says ${won}, wall says ${t.result}`);
    return { ...t, fill, sig: fill - 5000, stack: stackOf(t), touchAt: x.t };
  });
  const [t1, t2, t3, t4] = trades;
  // The footage starts before the film does, so the first frame is already moving.
  const ROLL = -0.5;
  const V = (film) => film - ROLL;
  const pins = [
    [V(ROLL), taipei("2026-09-14T11:22:00")],
    [V(S.t1Sig), t1.sig],
    [V(S.t1Fill), t1.fill],
    [V(S.t1Stop), t1.touchAt],
    [V(S.t2Sig), t2.sig],
    [V(S.t2Fill), t2.fill],
    [V(S.t2Tp), t2.touchAt],
    [V(S.t3Sig), t3.sig],
    [V(S.full), t3.fill],
    [V(S.fpCut), taipei("2026-09-14T21:05:00")],
    [V(S.stop), t3.touchAt],
    [V(S.t4Sig), t4.sig],
    [V(S.entry), t4.fill],
    [V(S.zoomOut), taipei("2026-09-14T21:12:00")],
    [V(S.tp - 0.75), taipei("2026-09-14T21:27:00")],
    [V(S.tp), t4.touchAt],
    [V(S.rail + 0.1), taipei("2026-09-14T21:44:00")],
  ];
  for (let k = 1; k < pins.length; k++) if (pins[k][1] <= pins[k - 1][1]) throw new Error(`pins out of order at ${k}`);
  // Data time → film second, for placing a sound on a real trade.
  const filmOf = (t) => {
    for (let k = 0; k + 1 < pins.length; k++) {
      const [a, ta] = pins[k], [b, tb] = pins[k + 1];
      if (t >= ta && t <= tb) return ROLL + a + ((t - ta) / (tb - ta)) * (b - a);
    }
    return null;
  };
  return { data, seg, trades, t1, t2, t3, t4, pins, filmOf };
}
