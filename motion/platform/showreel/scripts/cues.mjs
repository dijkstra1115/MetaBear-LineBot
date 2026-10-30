// The film's clock. 120 BPM: a bar is 2 s. score.py reads the same section starts from
// assets/audio/cues.json, so a change here reaches the music too. Picture cuts from the target on
// sit on bars of the music: a cut between beats is heard as an edit, however smooth the music is.
export const S = {
  wall: 0, // the case wall builds
  quiet: 3, // sudden silence: one tile comes alive
  full: 5, // that tile fills the frame: the real screen, a trade already open
  fpCut: 7, // into the footprint
  stop: 7.5, // that trade stops out
  entry: 9, // the same line, another trade
  zoomOut: 9.4, // back to 5-minute candles as it walks up
  breath: 10.75, // everything holds its breath
  tp: 11, // target: the first explosion
  rail: 12, // 盤面旁白
  replayBtn: 14, // 一鍵覆盤
  feat: 16, // the views, faster and faster
  black: 21, // second silence
  ring: 23, // the second explosion, with no gap before it
  implode: 27.4,
  logo: 28,
  end: 30,
};

// Footage second of dive.mp4 → film second is footage + S.quiet + TAKE_OFFSET (measured at the cut).
export const TAKE_OFFSET = 0;

// The views, cut faster as they go. `from`/`to` are the camera on that screen.
export const FEATURES = [
  { id: "liq2", name: "清算熱力圖", sub: "估算", at: 16, d: 1.5, media: 0, from: { rotationY: 15, rotationX: 4, scale: 1.14, x: 150, y: 0, rotation: 0 }, to: { rotationY: 3, rotationX: 1, scale: 1.05, x: -20, y: 0, rotation: 0 } },
  { id: "heat2", name: "掛單熱力圖", at: 17.5, d: 1, media: 0, from: { rotationX: 26, rotationY: 0, scale: 1.3, x: 0, y: -70, rotation: 0 }, to: { rotationX: 0, rotationY: 0, scale: 1.04, x: 0, y: 0, rotation: 0 } },
  { id: "bubbles2", name: "大額成交", at: 18.5, d: 1, media: 0, from: { rotation: -3.5, rotationX: 0, rotationY: 0, scale: 1.24, x: -70, y: 20 }, to: { rotation: 0, rotationX: 0, rotationY: 0, scale: 1.06, x: 0, y: 0 } },
  { id: "fp", name: "足跡圖", at: 19.5, d: 0.75, media: 2.2, from: { rotation: 0, rotationX: 0, rotationY: -8, scale: 1.08, x: 60, y: 30 }, to: { rotation: 0, rotationX: 0, rotationY: 0, scale: 1.24, x: 0, y: 60 } },
  { id: "zones", name: "連續失衡", at: 20.25, d: 0.5, media: 3, from: { rotation: 1.5, rotationX: 0, rotationY: 0, scale: 1.12, x: 60, y: 0 }, to: { rotation: 0, rotationX: 0, rotationY: 0, scale: 1.18, x: -30, y: 0 } },
  { id: "panes", at: 20.75, d: 0.25, media: 4.6, from: { rotation: 0, rotationX: 0, rotationY: 0, scale: 1.1, x: 0, y: 0 }, to: { rotation: 0, rotationX: 0, rotationY: 0, scale: 1.18, x: 0, y: 0 } },
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
