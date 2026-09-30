import * as cold from "./scenes/coldopen.js";
import * as title from "./scenes/title.js";
import * as matching from "./scenes/matching.js";
import * as wick from "./scenes/wick.js";
import * as revisit from "./scenes/revisit.js";
import * as delta from "./scenes/delta.js";
import * as outro from "./scenes/outro.js";

// 120 BPM: one bar = 2 s. Every cut lands on a downbeat.
export const SCENES = [
  { id: "cold", start: 0, dur: 6, ...cold },
  { id: "title", start: 6, dur: 6, ...title },
  { id: "matching", start: 12, dur: 18, ...matching },
  { id: "wick", start: 30, dur: 18, ...wick },
  { id: "revisit", start: 48, dur: 14, ...revisit },
  { id: "delta", start: 62, dur: 14, ...delta },
  { id: "outro", start: 76, dur: 10, ...outro },
];

export const TOTAL = 86;

export const CHAPTERS = [
  { n: "01", label: "撮合與 K 線", a: 12, b: 30 },
  { n: "02", label: "影線", a: 30, b: 48 },
  { n: "03", label: "足跡・熱圖", a: 48, b: 62 },
  { n: "04", label: "CVD", a: 62, b: 76 },
];

/** Full-frame light flashes on the big cuts. */
export const FLASHES = [
  { t: 6, amt: 0.7, pre: 0.15, decay: 9 },
  { t: 12, amt: 0.6, pre: 0.12, decay: 10 },
  { t: 30, amt: 0.75, pre: 0.15, decay: 9 },
  { t: 48, amt: 0.55, pre: 0.12, decay: 10 },
  { t: 62, amt: 0.55, pre: 0.12, decay: 10 },
  { t: 76, amt: 0.65, pre: 0.15, decay: 9 },
];

/** Score settings for motion/tools/synth.mjs (level 0 pads · 1 light · 2 full · 3 intense). */
export const MUSIC = {
  palette: "deep",
  padLevel: 0.5,
  arps: [
    [6.5, 11.8, 0.22],
    [76.3, 85, 0.2],
  ],
  sections: [
    { t: 0, level: 0 },
    { t: 12, level: 1 },
    { t: 14, level: 2 },
    { t: 29.5, level: 0 },
    { t: 30, level: 1 },
    { t: 32, level: 2 },
    { t: 41, level: 3 },
    { t: 44, level: 2 },
    { t: 47.5, level: 0 },
    { t: 48, level: 1 },
    { t: 50, level: 2 },
    { t: 61.5, level: 0 },
    { t: 62, level: 1 },
    { t: 64, level: 2 },
    { t: 75.5, level: 0 },
  ],
  fadeOut: 86,
};

/** Global audio cue sheet derived from the scenes' own event times. */
export const CUES = SCENES.flatMap((s) =>
  (s.cues ?? []).map((c) => ({ ...c, t: c.t + s.start, scene: s.id })),
);
