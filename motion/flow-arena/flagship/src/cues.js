// The single clock for picture and sound. Scenes and the score both read these times, so every
// hit, cut and wave lands on the same frame in the render and the same sample in the mix.
// 128 BPM, 4/4: one beat = 0.46875 s, one bar = 1.875 s, 32 bars = 60 s.

export const BPM = 128;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 32;
export const TOTAL = BARS * BAR;
export const FPS = 60;
export const W = 1920;
export const H = 1080;

/** Bar number (fractions allowed) → seconds. */
export const bar = (b) => b * BAR;

export const SCENES = [
  { id: "open", from: 0, to: 4 },
  { id: "fuel", from: 4, to: 8 },
  { id: "title", from: 8, to: 10 },
  { id: "read", from: 10, to: 12 },
  { id: "battle", from: 12, to: 24 },
  { id: "ledger", from: 24, to: 26 },
  { id: "ranked", from: 26, to: 28 },
  { id: "end", from: 28, to: 32 },
];

// Story beats inside the battle scene, in bars.
export const BATTLE = {
  push1Click: 12.5, // MARKET BUY 1,250 BTC
  push1Settle: 13.25,
  wallClick: 14.25, // MARKET BUY 1,250 BTC into a hidden iceberg
  freeze: 16, // PLAN: the market pauses
  reveal: 17, // R: violet scan shows the hidden liquidations
  queue: 17.5, // order queued while paused
  execute: 17.875, // EXECUTE pressed on the last eighth before the drop
  resume: 18,
  slowmo: 22,
  cash: 22.5,
  exit: 23.5,
};

// Cascade waves (bars). Two per bar at first, then on every beat, then sixteenths into the storm.
export const WAVES = [
  18.0, 18.5, 18.75, 19.0, 19.5, 19.75, 20.0, 20.25, 20.5, 20.75, 21.0, 21.125, 21.25, 21.375, 21.5, 21.5625,
  21.625, 21.6875, 21.75,
];
// Cascade level-ups (bars) → level 2..5, mirrored from the game's five-level cascade.
export const LEVELS = [
  { at: 18.5, level: 2, label: "連環強平", en: "LIQUIDATION CHAIN" },
  { at: 19.5, level: 3, label: "連環爆倉！", en: "CHAIN REACTION" },
  { at: 20.5, level: 4, label: "MEGA CASCADE", en: "" },
  { at: 21.25, level: 5, label: "LIQUIDATION STORM", en: "" },
];

// Sound-design cue sheet, derived from the same beats the scenes animate on.
export function soundCues() {
  const c = [];
  const at = (b, kind, extra = {}) => c.push({ t: bar(b), kind, ...extra });

  // Open: the price ignites, ticks as it draws, the crowd materialises.
  at(0.25, "ignite");
  for (let i = 0; i < 26; i++) at(0.5 + i * 0.125, "tick", { i });
  at(0.75, "textIn");
  at(1, "swell");
  at(2.5, "textIn");
  for (let i = 0; i < 8; i++) at(1.5 + i * 0.125, "tag", { i });

  // Fuel: three statements, then the run at the brightest band.
  at(4, "slam", { n: 0 });
  at(5, "slam", { n: 1 });
  at(6, "slam", { n: 2, big: true });
  at(5.5, "whooshLong");
  at(6, "riser", { to: 7.75 });
  at(7.75, "reverse", { to: 8 });

  // Title drop.
  at(8, "impact", { big: true });
  at(8.5, "gleam");
  at(9.5, "whooshIn", { to: 10 });

  // Read: each instrument lights on a beat.
  for (let i = 0; i < 4; i++) at(10 + i * 0.25, "panel", { i });
  at(11, "glitch");
  at(11.75, "whooshIn", { to: 12 });

  // Battle.
  at(12.25, "chip");
  at(BATTLE.push1Click, "push", { size: 1 });
  for (let i = 0; i < 16; i++) at(BATTLE.push1Click + 0.02 + i * 0.03, "eat", { i });
  at(14, "textIn");
  at(BATTLE.wallClick - 0.25, "chip");
  at(BATTLE.wallClick, "push", { size: 1 });
  at(BATTLE.wallClick + 0.12, "wall");
  at(BATTLE.freeze, "freeze");
  at(16.25, "ui");
  at(BATTLE.reveal, "scan");
  at(BATTLE.queue, "chip");
  at(17.5, "riser", { to: 18 });
  at(BATTLE.execute, "execute");
  at(BATTLE.resume, "impact", { big: false });
  WAVES.forEach((w, i) => at(w, "wave", { i }));
  LEVELS.forEach((l) => at(l.at, "levelUp", { level: l.level }));
  at(21.25, "storm");
  at(BATTLE.slowmo, "slowmo");
  at(BATTLE.cash, "cash");
  at(BATTLE.exit, "whooshDown", { to: 24 });

  // Ledger and ranked.
  for (let i = 0; i < 12; i++) at(24 + i * 0.0625, "row", { i });
  at(25, "zero");
  at(26, "whooshIn", { to: 26 });
  for (let i = 0; i < 5; i++) at(26.5 + i * 0.125, "row", { i: i + 3 });
  at(27.75, "reverse", { to: 28 });

  // End card.
  at(28, "impact", { big: true, final: true });
  at(28.5, "draw");
  at(29, "textIn");
  at(30, "sting");
  return c.sort((a, b) => a.t - b.t);
}
