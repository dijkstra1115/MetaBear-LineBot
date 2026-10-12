// Narration timing. Raw times are word starts in assets/audio/vo-raw.wav (whisper word timestamps,
// scripts/.vo-words.json); the film plays the narration sped up by SPEED (pitch kept) after OFF.
export const SPEED = 1.1;
export const OFF = 0.6;
const at = (raw) => +(OFF + raw / SPEED).toFixed(3);

const RAW = {
  date: 0.0, clock: 2.98, slam: 4.36, s1end: 5.78,
  s2: 5.94, s2b: 9.7, drop: 11.48, s2end: 12.5,
  s3: 13.9, sell: 15.8, tenK: 18.14, s3b: 19.96, fiveX: 22.28, s3end: 22.74,
  s4: 23.86, sixty: 25.36, third: 26.42, pierce: 27.76, low: 28.46, band: 30.16, seller: 32.64, qty: 33.76, stuck: 35.82, s4end: 38.04,
  s5: 39.36, back: 40.24, oi: 43.08, oiQty: 45.34, gone: 46.72, s5end: 49.68,
  s6: 50.78, p1: 51.7, s6b: 53.82, p2: 54.82, s6end: 56.36,
  s7: 57.16, tested: 60.12, noEdge: 64.54, analyse: 68.82, s7end: 70.94,
  s8: 71.84, voEnd: 74.96,
};
export const C = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, at(v)]));
export const END = +(C.voEnd + 3.2).toFixed(2);

// Subtitles: the script text, timed to the narration (raw start, raw end).
export const CAPTIONS = [
  [0.0, 5.9, "2026 年 2 月 6 日，早上 8 點 19 分。"],
  [5.94, 9.5, "兩天前，比特幣還在 7 萬 7。"],
  [9.7, 13.2, "兩天之內，跌掉 22%。"],
  [13.9, 19.7, "最後 25 分鐘，賣方用市價單，砸出超過 1 萬顆比特幣。"],
  [19.96, 23.4, "每 5 分鐘的成交量，暴增 5 倍。"],
  [23.86, 29.8, "價格兩次碰到 6 萬。第三次，直接刺穿到 59,800。"],
  [30.16, 35.4, "在這 300 美元的區間裡，賣方又砸了 2,400 顆。"],
  [35.82, 38.9, "價格，卻再也跌不下去。"],
  [39.36, 42.4, "那根 K 棒，收回 6 萬之上。"],
  [43.08, 46.4, "這段下跌裡，未平倉量少了 3,000 顆。"],
  [46.72, 50.2, "該被洗出去的倉位，已經出場了。"],
  [50.78, 53.5, "30 分鐘後，63,800。"],
  [53.82, 56.9, "一個半小時後，65,700。"],
  [57.16, 59.9, "事後看，一切都很清楚。"],
  [60.12, 64.2, "但這些型態，我們用將近一年的資料回測過："],
  [64.54, 68.4, "單獨拿來交易，扣掉手續費，並沒有優勢。"],
  [68.82, 71.4, "所以我們分析，不喊單。"],
  // The last line is not subtitled: the end card already shows it.
].map(([a, b, text]) => [at(a), at(b), text]);

// The voice chain the user chose for academy-film (option B): half a semitone down with formants
// kept, chest resonance, mud and harshness cut, a little air, compression and a gentle soft clip.
export const VOICE_FX =
  `atempo=${SPEED},` +
  "rubberband=pitch=0.9715:formant=preserved:pitchq=quality," +
  "equalizer=f=110:t=q:w=0.9:g=5,equalizer=f=330:t=q:w=1.2:g=-2.5,equalizer=f=2800:t=q:w=1.4:g=-1.5,highshelf=f=9500:g=2," +
  "acompressor=threshold=-22dB:ratio=3:attack=8:release=160:makeup=2.5,asoftclip=type=tanh:threshold=0.8";
