// Word cues (seconds in vo-raw.wav) from scripts/align.py, with sentence onsets taken from silence detection
// where whisper smeared the first word. Film time = narration time + OFF.
export const OFF = 0.4;
const VO = {
  reading: 0.39, the: 0.78, market: 0.94, was: 1.32, never: 1.94, meant: 2.36, to: 2.62, feel: 2.92, like: 3.22, guesswork: 3.5, l1end: 4.12,
  too1: 5.03, indicators: 5.48, too2: 6.8, opinions: 7.2, l2end: 7.91,
  so: 8.86, built: 9.22, l3pause: 9.62, metabear: 10.45, academy: 11.12, l3end: 11.91,
  pick: 12.89, question: 13.14, l4end: 13.5,
  watch: 14.49, trades: 14.7, become1: 15.26, candles1: 15.62, candles2: 16.91, become2: 17.24, levels1: 17.66,
  and: 18.95, levels2: 19.1, become3: 19.46, decisions: 19.94, l5end: 20.72,
  every: 21.81, move: 22.1, explained: 22.48, voEnd: 23.72,
};
export const C = Object.fromEntries(Object.entries(VO).map(([k, v]) => [k, +(v + OFF).toFixed(3)]));
export const END = 26.8;
