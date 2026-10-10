// Word cues in the narration (seconds in vo-raw.wav), from scripts/align.py; paragraph onsets taken from
// silence detection where whisper smeared the first word. Film time = narration time + OFF.
// Regenerating the narration means re-reading these from assets/audio/words.json.
export const OFF = 0.6;
const VO = {
  every: 0.0, decisions: 2.52,
  p2: 3.82, apart: 5.96, down: 7.16, trades: 7.9, behind: 8.3,
  p3: 10.15, lessons: 10.85, about: 11.68, thirty: 11.86, each: 12.66, one: 13.78, idea: 14.02, time: 15.28,
  pause: 16.53, scrub: 17.62, back: 17.92, watch: 19.1, wall: 19.6, absorb: 20.0, buyers: 21.02, then: 22.18, give: 22.34, way: 22.56,
  real: 23.82, replayed: 24.96, second: 25.5, bysecond: 26.6, until: 27.48, evidence: 28.02, lines: 28.46, up: 29.06,
  and: 30.27, test: 31.22, learned: 31.94, step: 33.1, flow: 33.5, arena: 33.98,
  mb: 35.42, academy: 35.9, see: 37.2, process: 37.44, then2: 38.78, read: 38.84, market: 39.58,
  voEnd: 40.32,
};
export const C = Object.fromEntries(Object.entries(VO).map(([k, v]) => [k, +(v + OFF).toFixed(3)]));
export const END = +(C.voEnd + 2.6).toFixed(3);
