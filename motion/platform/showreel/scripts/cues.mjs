// The film's clock. 120 BPM: a bar is 2 s. score.py reads the same section starts from
// assets/audio/cues.json, so a change here reaches the music too. Picture cuts from the target on
// sit on bars of the music: a cut between beats is heard as an edit, however smooth the music is.
export const S = {
  // One stretch of the market, on one chart, in one take: 9/14, four trades in a row off the same line.
  // Each signal pops up on the chart a beat before its position opens.
  t1Sig: 0.5, // 11:59: 3 layers of stacked buying at the line
  t1Fill: 1, // the long is filled at that bar's close
  t1Stop: 2.5, // it stops out
  t2Sig: 3, // 14:41: 3 layers
  t2Fill: 3.5,
  t2Tp: 6, // it reaches its target; then the quiet hours go by
  t3Sig: 7.75, // 20:57: 3 layers
  hero: 8, // the music starts its climb
  full: 8.25, // the third long is filled
  fpCut: 8.75, // into the footprint
  stop: 9.25, // that trade stops out
  t4Sig: 9.5, // 21:09: 6 layers on the same line
  entry: 10, // another trade
  zoomOut: 10.25, // back to 5-minute candles as it walks up
  tp: 12, // target: the drop, and the camera pulls back to the whole wall
  rail: 14, // 盤面旁白
  replayBtn: 16, // 一鍵覆盤
  feat: 18, // the views, faster and faster
  black: 22, // the film's one silence
  ring: 24, // the second drop, with no gap before it
  implode: 27.4,
  logo: 28,
  end: 30,
};

// The tile the take plays in: the last of those trades, in the middle of the wall.
export const HERO = { wall: 3, col: 3, row: 2 };

// The views, cut faster as they go. `from`/`to` are the camera on that screen; `on` is when the view
// switches on within its slot (0.5 s into its clip, less `media`).
export const FEATURES = [
  { id: "liq2", name: "清算熱力圖", sub: "估算", at: 18, d: 1, on: 0.5, media: 0, from: { rotationY: 15, rotationX: 4, scale: 1.14, x: 150, y: 0, rotation: 0 }, to: { rotationY: 3, rotationX: 1, scale: 1.05, x: -20, y: 0, rotation: 0 } },
  { id: "heat2", name: "掛單熱力圖", at: 19, d: 1, on: 0.5, media: 0, from: { rotationX: 26, rotationY: 0, scale: 1.3, x: 0, y: -70, rotation: 0 }, to: { rotationX: 0, rotationY: 0, scale: 1.04, x: 0, y: 0, rotation: 0 } },
  { id: "bubbles2", name: "大額成交", at: 20, d: 0.75, on: 0.25, media: 0.25, from: { rotation: -3.5, rotationX: 0, rotationY: 0, scale: 1.24, x: -70, y: 20 }, to: { rotation: 0, rotationX: 0, rotationY: 0, scale: 1.06, x: 0, y: 0 } },
  { id: "fp", name: "足跡圖", at: 20.75, d: 0.5, media: 2.2, from: { rotation: 0, rotationX: 0, rotationY: -8, scale: 1.08, x: 60, y: 30 }, to: { rotation: 0, rotationX: 0, rotationY: 0, scale: 1.24, x: 0, y: 60 } },
  { id: "zones", name: "連續失衡", at: 21.25, d: 0.5, media: 3, from: { rotation: 1.5, rotationX: 0, rotationY: 0, scale: 1.12, x: 60, y: 0 }, to: { rotation: 0, rotationX: 0, rotationY: 0, scale: 1.18, x: -30, y: 0 } },
  { id: "panes", at: 21.75, d: 0.25, media: 4.6, from: { rotation: 0, rotationX: 0, rotationY: 0, scale: 1.1, x: 0, y: 0 }, to: { rotation: 0, rotationX: 0, rotationY: 0, scale: 1.18, x: 0, y: 0 } },
];

// The ring: two tiers turning against each other. Every label is what its clip really shows.
export const RING = {
  top: [
    { id: "fp", name: "足跡圖", media: 0.9 },
    { id: "heat2", name: "掛單熱力圖", media: 1 },
    { id: "bubbles2", name: "大額成交", media: 1 },
    { id: "zones", name: "連續失衡", media: 0.5 },
    { id: "liq2", name: "清算熱力圖", media: 1 },
    { id: "panes", name: "副圖", media: 0 },
  ],
  bottom: [
    { id: "rail", name: "盤面旁白", media: 0.2 },
    { id: "tools", name: "K 棒卡片", media: 0.5 },
    { id: "ex-all", name: "全市場", still: 1 },
    { id: "rail", name: "一鍵覆盤", media: 7 },
    { id: "tools", name: "畫線", still: 5.5 },
    { id: "heat", name: "即時掛單", media: 1 },
  ],
};
