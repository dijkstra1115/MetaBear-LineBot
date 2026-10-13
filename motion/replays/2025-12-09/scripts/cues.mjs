// Narration timing. The narration is three chunks (scripts/voice.py, voice Charon). Raw
// times are word starts inside each chunk (whisper, scripts/.vo-words.json); the film plays
// the chunks back to back, GAP apart, sped up by SPEED (pitch kept), starting at OFF.
export const SPEED = 1.1;
export const OFF = 0.15;
export const GAP = 0.35;
export const CHUNKS = [
  { file: "assets/audio/vo/1.wav", dur: 32.32 },
  { file: "assets/audio/vo/2.wav", dur: 38.6 },
  { file: "assets/audio/vo/3.wav", dur: 29.8 },
];
export const CHUNK_START = [];
{
  let t = OFF;
  for (const c of CHUNKS) {
    CHUNK_START.push(+t.toFixed(3));
    t += c.dur / SPEED + GAP;
  }
}
const at = (chunk, raw) => +(CHUNK_START[chunk - 1] + raw / SPEED).toFixed(3);

const RAW = {
  // chunk 1: hook, location, event
  hook: [1, 0.0], hook2: [1, 1.14], four: [1, 3.22],
  s2: [1, 5.96], low: [1, 8.6], val: [1, 11.46], near: [1, 14.98], newOi: [1, 17.0],
  s3: [1, 20.68], brk: [1, 21.84], minute: [1, 23.62], lowest: [1, 26.76], back: [1, 30.0],
  // chunk 2: the four confirmations
  s4: [2, 0.0], oiDrop: [2, 6.1], flushed: [2, 9.14],
  s5: [2, 13.88], sold: [2, 15.74], buyers: [2, 18.66], held: [2, 19.94], absorbed: [2, 22.5],
  s6: [2, 24.82], lessSell: [2, 28.94],
  s7: [2, 31.96], reclaim: [2, 34.92], allFour: [2, 36.62],
  // chunk 3: execution, wait, close
  s8: [3, 0.0], imb: [3, 2.66], entry: [3, 4.74], stop: [3, 7.58], targets: [3, 9.28],
  s9: [3, 13.46], dip: [3, 16.58], night: [3, 19.86], surge: [3, 20.82], t1: [3, 22.26], t2: [3, 23.48],
  s10: [3, 26.1], voEnd: [3, 29.75],
};
export const C = Object.fromEntries(Object.entries(RAW).map(([k, [c, v]]) => [k, at(c, v)]));
export const END = +(C.voEnd + 3.4).toFixed(2);

// Subtitles: the script text, timed to the narration ([chunk, raw start], [chunk, raw end]).
const cap = (c, a, b, text) => [at(c, a), at(c, b), text];
export const CAPTIONS = [
  // The opening line is not subtitled: the hook's kinetic type already says it on screen.
  cap(1, 3.22, 5.3, "四個條件，一個一個看。"),
  cap(1, 5.96, 10.9, "12 月 9 日。地點：前一天的低點，89,554；"),
  cap(1, 11.46, 14.4, "價值區下緣，90,195。"),
  cap(1, 14.98, 20.1, "價格一路往下靠近，途中新倉一口氣多了一千多顆。"),
  cap(1, 20.68, 23.1, "下午 1 點 17 分，跌破前低。"),
  cap(1, 23.62, 29.3, "一分鐘內，淨賣出將近 800 顆，最低打到 89,369。"),
  cap(1, 30.0, 32.3, "下一分鐘，價格就彈了回來。"),
  cap(2, 0.0, 4.4, "確認一：跌破前低，觸發停損和強平。"),
  cap(2, 4.7, 8.7, "15 分鐘內，未平倉量少了 1,071 顆；"),
  cap(2, 9.14, 13.4, "主動賣的同時倉位減少，被洗出去的，是多單。"),
  cap(2, 13.88, 19.85, "確認二：低點附近，主動賣出 310 顆，買方只有 67 顆，"),
  cap(2, 19.94, 24.4, "價格卻沒有再往下。賣單，被吸收了。"),
  cap(2, 24.82, 31.6, "確認三：之後幾次回落，都停在更高的位置，賣壓也遠比跌破時小。"),
  cap(2, 31.96, 38.3, "確認四：下午 3 點 15 分，收回價值區。四項確認，到齊。"),
  cap(3, 0.0, 4.6, "不追。等它回測價值區，買方連續兩格壓過賣方，"),
  cap(3, 4.74, 7.3, "90,345 進場。"),
  cap(3, 7.58, 12.9, "停損放在吸收低點之外，目標是前一天的 POC，和價值區上緣。"),
  cap(3, 13.46, 19.5, "接下來八個小時，價格在進場價附近來回，最低回到 89,868。"),
  cap(3, 19.86, 22.1, "晚上十一點半，一口氣衝上去："),
  cap(3, 22.26, 25.9, "目標一、目標二，七分鐘內先後到達。"),
  cap(3, 26.1, 29.8, "完整的策略，在 MetaBear 學院，策略實戰第一課。"),
];

// Evidence cards: each lifts off at t0 and lands in its checklist slot EV_DUR later.
export const EV_DUR = 2.5;
export const EV_T0 = [C.oiDrop + 0.4, C.held - 0.3, C.lessSell - 0.2, C.reclaim + 0.4].map((v) => +v.toFixed(3));

// The user chose Charon for this genre and no pitch-down: only a light clean-up.
export const VOICE_FX = `atempo=${SPEED},highpass=f=70,equalizer=f=3200:t=q:w=1.2:g=1.5,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=160:makeup=2`;
