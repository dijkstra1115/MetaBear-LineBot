// The case wall's stretches (docs/REPLAY-CASES-2026Q3.md, "案例牆"): each one films every trade its
// rule took between `from` and `to` (Taipei), one position at a time, at a fixed 2R. The trades
// come from scripts/replay-cases/scan-case-rules.mjs --json; only the framing is written here.
// The case wall shows them in this order.
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
  // Five trades in a month: each trade's few hours are shown and the days between are jumped.
  "2026-08-21": {
    rule: "liq",
    from: "2026-08-21 09:00",
    to: "2026-09-16 03:00",
    title: "8/21–9/16 · 5 次衝進爆倉叢集",
    range: "8/21–9/16",
    cases: [7, 6],
    window: { pre: 150, post: 20 },
  },
  "2026-08-27": {
    rule: "reject",
    from: "2026-08-27 21:50",
    to: "2026-08-28 10:30",
    title: "8/27–28 · 前日關鍵位與週高",
    range: "8/27–8/28",
    cases: [2, 3],
  },
  // The 08-31 short again: the course strategies over a day and a half (motion/replays/2026-08-31-short).
  "2026-08-31": {
    source: "strategies",
    from: "2026-08-31 15:10",
    range: "8/31–9/1",
    title: "8/31–9/1 · 02 守住或翻轉、03 回調縮量",
  },
  "2026-08-24": {
    rule: "flip",
    from: "2026-08-24 21:43",
    to: "2026-08-26 05:01",
    title: "8/24–26 · 前日高轉支撐",
    range: "8/24–8/26",
    cases: [1],
  },
};

export const RULES = {
  flip: "突破後回測",
  reject: "關鍵位拒絕",
  liq: "爆倉叢集",
  // The course strategies (scripts/replay-cases/strategies.mjs), named as their lessons.
  A: "01 失敗拍賣",
  B: "02 守住或翻轉",
  C: "03 回調縮量",
};
