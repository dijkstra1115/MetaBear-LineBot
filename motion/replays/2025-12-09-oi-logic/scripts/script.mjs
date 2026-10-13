// The narration (zh-Hant, Gemini TTS Charon — the voice of the course film's preview v2), one entry
// per scene. `say` is what the voice reads (numbers spelled out); `caps` are the subtitles as
// [shown, spoken substring]; `marks` name spoken substrings whose start times drive animation beats.
// scripts/voice.py records the scenes in two chunks; scripts/split-vo.py cuts them back into scenes.
// Every number has a source in docs/REPLAY-2025-12-09-OI-LOGIC.md.
export const SCENES = [
  {
    id: "hook",
    say: "跌破前低，反而是做多的訊號？",
    // The hook's kinetic type already says it on screen, so it is not subtitled.
    caps: [],
    marks: { brk: "跌破", and: "反而", long: "做多的訊號" },
    pauses: [],
  },
  {
    id: "setup",
    say: "十二月九日中午，CVD 往下砸，OI 同時多了一千零四十顆：主動賣、倉位增加，是新空單在追進場。",
    caps: [
      ["12 月 9 日中午，CVD 往下砸，", "十二月九日中午，CVD 往下砸，"],
      ["OI 同時多了 1,040 顆：", "OI 同時多了一千零四十顆："],
      ["主動賣、倉位增加，是新空單在追進場。", "主動賣、倉位增加，是新空單在追進場。"],
    ],
    marks: { date: "十二月九日", cvd: "CVD 往下砸", oi: "OI 同時多了", num: "一千零四十", rule: "主動賣、倉位增加", shorts: "新空單" },
    pauses: [],
  },
  {
    id: "sweep",
    say: "一點十七分，跌破前低，一分鐘淨賣出近八百顆。接著 CVD 繼續創新低，價格卻沒有再回到低點：賣單，被掛單吸收了。",
    caps: [
      ["13:17，跌破前低，一分鐘淨賣出近 800 顆。", "一點十七分，跌破前低，一分鐘淨賣出近八百顆。"],
      ["接著 CVD 繼續創新低，價格卻沒有再回到低點：", "接著 CVD 繼續創新低，價格卻沒有再回到低點："],
      ["賣單，被掛單吸收了。", "賣單，被掛單吸收了。"],
    ],
    marks: { time: "一點十七分", brk: "跌破前低", minute: "淨賣出", then: "接著", lows: "創新低", never: "價格卻沒有", absorb: "賣單，被掛單" },
    pauses: [],
  },
  {
    id: "turn",
    say: "一點半，CVD 翻頭向上，OI 一口氣少了九百顆。主動買、倉位減少，是空單在回補：剛才追空的人，很可能正在買回來。",
    caps: [
      ["13:30，CVD 翻頭向上，OI 一口氣少了 900 顆。", "一點半，CVD 翻頭向上，OI 一口氣少了九百顆。"],
      ["主動買、倉位減少，是空單在回補：", "主動買、倉位減少，是空單在回補："],
      ["剛才追空的人，很可能正在買回來。", "剛才追空的人，很可能正在買回來。"],
    ],
    marks: { time: "一點半", up: "CVD 翻頭向上", oi: "OI 一口氣", rule: "主動買、倉位減少", cover: "空單在回補", chasers: "剛才追空的人", back: "買回來" },
    pauses: [],
  },
  {
    id: "reclaim",
    say: "三點十五分，價格收回價值區，這次跌破失敗了。回測的這根 K，連續六個價位，主動買都在二十顆以上。等下一根 K 回到它成交最多的價位，九萬零三百一十，進場做多。",
    pauses: [],
    caps: [
      ["15:15，價格收回價值區，這次跌破失敗了。", "三點十五分，價格收回價值區，這次跌破失敗了。"],
      ["回測的這根 K，連續 6 個價位，主動買都在 20 顆以上。", "回測的這根 K，連續六個價位，主動買都在二十顆以上。"],
      ["等下一根 K 回到它成交最多的價位，", "等下一根 K 回到它成交最多的價位，"],
      ["90,310，進場做多。", "九萬零三百一十，進場做多。"],
    ],
    marks: { time: "三點十五分", reclaim: "收回價值區", failed: "跌破失敗", retest: "回測的這根", stack: "連續六個價位", wait: "等下一根", busiest: "成交最多", entry: "九萬零三百一十" },
  },
  {
    id: "result",
    say: "八小時後，兩個目標，七分鐘內先後到達。",
    caps: [["8 小時後，兩個目標，7 分鐘內先後到達。", "八小時後，兩個目標，七分鐘內先後到達。"]],
    marks: { later: "八小時後", targets: "兩個目標", apart: "七分鐘內" },
    pauses: [],
  },
  {
    id: "close",
    say: "完整課程，在 MetaBear 學院。",
    pauses: [],
    caps: [["完整課程，在 MetaBear 學院。", "完整課程，在 MetaBear 學院。"]],
    marks: { academy: "完整課程" },
  },
];
// Two recording chunks (Gemini's free tier allows about five calls a day).
export const CHUNKS = [
  ["hook", "setup", "sweep"],
  ["turn", "reclaim", "result", "close"],
];
