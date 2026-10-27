// The case wall's stretches (docs/REPLAY-CASES-2026Q3.md, "案例牆"): each one films every trade its
// rule took between `from` and `to` (Taipei), one position at a time, at a fixed 2R. The trades
// come from scripts/replay-cases/scan-case-rules.mjs --json; only the framing is written here.
export const SEGMENTS = {
  "2026-09-14": {
    rule: "flip",
    from: "2026-09-14 11:59",
    to: "2026-09-14 21:30",
    title: "9/14 · 9/12 高點",
    range: "9/14",
    cases: [9],
  },
  "2026-09-24": {
    rule: "reject",
    from: "2026-09-24 21:40",
    to: "2026-09-25 15:08",
    title: "9/24–25 · 前日關鍵位",
    range: "9/24–9/25",
    cases: [4],
  },
  "2026-08-27": {
    rule: "reject",
    from: "2026-08-27 21:50",
    to: "2026-08-28 10:30",
    title: "8/27–28 · 前日關鍵位與週高",
    range: "8/27–8/28",
    cases: [2, 3],
  },
  "2026-08-24": {
    rule: "flip",
    from: "2026-08-24 21:43",
    to: "2026-08-26 05:01",
    title: "8/24–26 · 前日高轉支撐",
    range: "8/24–8/26",
    cases: [1],
  },
  // 08-21 → 09-16 (the liquidation-cluster rule, five trades in a month) needs its own pacing.
};

export const RULES = {
  flip: "突破後回測",
  reject: "關鍵位拒絕",
  liq: "爆倉叢集",
};
