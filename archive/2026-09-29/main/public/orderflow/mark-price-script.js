import { scenePosition, TIMING } from "./mark-price-model.js";
export const scenes = [
  {
    label: "同一刻，兩種價格",
    eyebrow: "名詞圖解 · 標記價格",
    lens: "最後成交價：最近一筆撮合的價格",
  },
  {
    label: "成交價，短暫偏離",
    eyebrow: "靠近看 · 兩條價格",
    lens: "合成情境 · 兩條價格可以暫時分開",
  },
  {
    label: "標記價，作為風險估值",
    eyebrow: "風險估值的參考",
    lens: "以 Bybit 永續合約機制為例 · 標記價參考指數等資料",
  },
  {
    label: "風險估值，並非成交保證",
    eyebrow: "回到全景",
    lens: "估值與撮合各有用途 · 標記價格也會變動",
  },
];
const cues = [
  [0, "同一刻，合約可能有兩種價格。"],
  [2600, "成交價，來自最近一筆撮合。"],
  [TIMING.divergence, "一筆低價成交，讓兩條線分開了。"],
  [TIMING.reference, "標記價參考指數等資料，估算部位價值。"],
  [TIMING.return, "成交價回來，兩條線又靠近了。"],
  [18500, "此平台用標記價判定強平。"],
  [TIMING.zoomOut, "風險估值的尺，不是保證成交價。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
