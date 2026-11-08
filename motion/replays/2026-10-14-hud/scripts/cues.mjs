// Film timing: Raya bars, one slot per trade, and the market-time cursor and camera that follow it.
// Everything here is derived from assets/data/day.json; scripts/build.mjs writes it into index.html.
export const BPM = 116.55;
export const BEAT = 60 / BPM;
export const BAR = 4 * BEAT;
export const OFF = 0.5; // film time of the first downbeat (song bar 14)
export const F = (k) => +(OFF + k * BAR).toFixed(4);
export const SONG_AT = +(0.5 + 14 * BAR - OFF).toFixed(4); // song seconds playing at film 0 (bar 20 lands on F(6))
export const END = F(28);
export const FADE_OUT = 1.5;
const MIN = 60_000;
// [first bar, bars] per trade, in order; the recap and the end card follow.
const SLOTS = [[1, 2], [3, 3], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2], [16, 2], [18, 2], [20, 2], [22, 2]];
export const RECAP = [F(24), F(26)];
export const ENDCARD = [F(26), END];
export const DROP = F(6);
const MOVE = 0.4; // camera flight at the start of each slot
export const SPAN = 75 * MIN; // the camera follows the newest bar with this much time on screen
export const LEAD = 0.3; // share of the width kept free to the right of the newest bar

export function cues(D) {
  const full = { x0: D.day0, x1: D.day0 + 24 * 60 * MIN, y0: 0, y1: 0 };
  const day = D.bars.filter((b) => b[0] >= full.x0 && b[0] < full.x1);
  full.y0 = Math.min(...day.map((b) => b[3])) - 120;
  full.y1 = Math.max(...day.map((b) => b[2])) + 160;
  const cursor = [[0, D.day0], [F(1), D.day0]]; // the hook shows the day as a ghost, nothing played yet
  const cam = [{ t0: 0, t1: 0, to: full }];
  let prevExit = D.day0;
  const trades = D.trades.map((x, k) => {
    const [b0, nb] = SLOTS[k];
    const S = F(b0), E = F(b0 + nb);
    // The trade before the drop lands its result half a beat early and clears before the hit.
    const early = F(b0 + nb) === DROP ? 0.5 : 0;
    const lock = S + BEAT, trig = S + 2.5 * BEAT, fire = S + 4 * BEAT, result = S + (4 * nb - 2 - early) * BEAT;
    const touch = x.touchT ?? x.signalT - 10 * MIN;
    // Start a little before the touch, but never before the previous trade closed (17:24 touch, 17:25 exit).
    const c0 = Math.max(touch - 18 * MIN, prevExit), c1 = x.signalT + (x.src === "B-hold" ? 5 : 1) * MIN;
    // The price range holds what is known at the entry: past bars, the level, the stop and the target.
    const past = D.bars.filter((b) => b[0] >= c0 - SPAN && b[0] < c1);
    const lo = Math.min(...past.map((b) => b[3]), x.stop, x.tp, x.level), hi = Math.max(...past.map((b) => b[2]), x.stop, x.tp, x.level);
    const pad = (hi - lo) * 0.14;
    cam.push({ t0: S, t1: S + MOVE, follow: true, y0: lo - pad, y1: hi + pad });
    cursor.push([S, prevExit], [S + MOVE, c0], [trig, c1], [fire, c1], [result, x.exitT]);
    prevExit = x.exitT;
    return { n: x.n, S, E, lock, trig, fire, result, c0, c1, hold: early ? 0 : 0.3 };
  });
  cam.push({ t0: RECAP[0], t1: RECAP[0] + 0.6, to: full });
  cursor.push([RECAP[0], prevExit], [RECAP[0] + 0.6, full.x1], [END, full.x1]);
  // Film time at which the cursor crosses 08:00, when the prior-day levels change.
  const sw = D.levelSets[1].from;
  let switchAt = null;
  for (let i = 1; i < cursor.length && switchAt == null; i++) {
    const [ta, ma] = cursor[i - 1], [tb, mb] = cursor[i];
    if (ma < sw && mb >= sw) switchAt = +(ta + ((sw - ma) / (mb - ma)) * (tb - ta)).toFixed(3);
  }
  return { span: SPAN, lead: LEAD, full, cursor, cam, trades, switchAt, end: END, recap: RECAP, endcard: ENDCARD, drop: DROP, beat: BEAT, hookEnd: F(1) };
}
