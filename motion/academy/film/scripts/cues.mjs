// Word cues in film time. The opening sentence is take 3 of scripts/voice-line.py ("…feel… fragmented.", timings
// from silence detection + whisper), spliced in front of the original take from 4.12 s on (SPLICE, applied in
// mix.mjs); every later cue is the original whisper/silence time shifted by the difference. Film = narration + OFF.
export const OFF = 0.1;
// cut: a slice of the take's pause before "fragmented" (3.04–3.60 s) is removed, leaving ~0.3 s
export const SPLICE = { take: "takes/line1-3.wav", takeEnd: 4.5, takeGainDb: -4.1, from: 4.12, cut: [3.2, 3.47] };
const CUT = SPLICE.cut[1] - SPLICE.cut[0];
const SHIFT = SPLICE.takeEnd - CUT - SPLICE.from;
const LINE1_TAKE = { reading: 0.27, the: 0.5, market: 0.76, was: 1.1, never: 1.42, meant: 1.72, to: 2.06, feel: 2.5, fragmented: 3.6, l1end: 4.45 };
const LINE1 = Object.fromEntries(Object.entries(LINE1_TAKE).map(([k, v]) => [k, v > SPLICE.cut[1] ? v - CUT : v]));
const VO = {
  too1: 5.03, indicators: 5.48, too2: 6.8, opinions: 7.2, l2end: 7.91,
  so: 8.86, built: 9.22, l3pause: 9.62, metabear: 10.45, academy: 11.12, l3end: 11.91,
  pick: 12.89, question: 13.14, l4end: 13.5,
  watch: 14.49, trades: 14.7, become1: 15.26, candles1: 15.62, candles2: 16.91, become2: 17.24, levels1: 17.66,
  and: 18.95, levels2: 19.1, become3: 19.46, decisions: 19.94, l5end: 20.72,
  every: 21.81, move: 22.1, explained: 22.48, voEnd: 23.72,
};
export const C = {
  ...Object.fromEntries(Object.entries(LINE1).map(([k, v]) => [k, +(v + OFF).toFixed(3)])),
  ...Object.fromEntries(Object.entries(VO).map(([k, v]) => [k, +(v + SHIFT + OFF).toFixed(3)])),
};
export const END = +(26.6 + SHIFT).toFixed(2);

// The voice chain applied after the splice (ffmpeg filters): half a semitone down (formants kept), chest
// resonance around 110 Hz, mud cut at 330 Hz, softened 2.8 kHz, a little air, compression and a gentle soft
// clip — option B of scripts/voice-lab.sh, chosen by the user.
export const VOICE_FX =
  "rubberband=pitch=0.9715:formant=preserved:pitchq=quality," +
  "equalizer=f=110:t=q:w=0.9:g=5,equalizer=f=330:t=q:w=1.2:g=-2.5,equalizer=f=2800:t=q:w=1.4:g=-1.5,highshelf=f=9500:g=2," +
  "acompressor=threshold=-22dB:ratio=3:attack=8:release=160:makeup=2.5,asoftclip=type=tanh:threshold=0.8";
