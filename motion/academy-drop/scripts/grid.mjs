// The beat grid every cut, word and sound hangs off.
// The song runs at 100.06 BPM with its first downbeat at 0.065 s. The film keeps song bars 0–1, jumps to
// song bar 5 (the last intro bar, which rises into the groove), then plays song bars 6–15 untouched, so
// film bar 11 lands on the song's heaviest 808 and film beat 43 on the song's own silent beat before it.
export const BPM = 100.06;
export const P = 60 / BPM; // one beat
export const B = 4 * P; // one bar
export const T0 = 0.065;
export const beat = (n) => T0 + n * P;
export const bar = (k) => beat(4 * k);
export const SPLICE = { film: bar(2), skip: 3 * B }; // song time = film time + skip after the splice
export const SILENT = beat(43);
export const DROP = beat(44);
export const END = beat(52);
export const songTime = (t) => (t < SPLICE.film ? t : t + SPLICE.skip);
