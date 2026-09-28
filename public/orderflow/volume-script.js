import { scenePosition, TIMING } from "./volume-model.js";
export const scenes = [
  {
    label: "K 線下方，另一種高低",
    eyebrow: "名詞圖解 · VOLUME",
    lens: "每根 K 線與量柱，都代表一分鐘",
  },
  {
    label: "成交一筆，量柱累加",
    eyebrow: "走進 14:30",
    lens: "成交量的單位是隻，不是人數",
  },
  {
    label: "放量、縮量，和誰比？",
    eyebrow: "同長度 · 同基準",
    lens: "本例比較基準：14:27–14:29 的平均成交量 30 隻",
  },
  {
    label: "量說多少，顏色看設定",
    eyebrow: "成交多少，看量柱",
    lens: "本例量柱配色跟隨 K 線漲跌；不代表主動買賣量",
  },
];
const cues = [
  [0, "K 線看價格，量柱看成交多少。"],
  [TIMING.zoomIn, "靠近這一分鐘，回看成交。"],
  [TIMING.first, "成交 20 隻，量柱就記 20。"],
  [TIMING.second, "主動賣出，也加入成交量。"],
  [TIMING.third, "20 ＋ 15 ＋ 25，合計 60 隻。"],
  [15000, "掛著還沒成交，就不計入。"],
  [19000, "同樣一分鐘，60 是基準的兩倍。"],
  [22000, "下一根 15，只有基準的一半。"],
  [25000, "紅綠依配色設定，不是買量、賣量。"],
  [27700, "相同時間，成交更多就是放量。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
