import { scenePosition, TIMING } from "./withdrawal-model.js";
export const scenes = [
  {
    label: "價格停在上一筆成交",
    eyebrow: "市場故事 · WITHDRAWAL",
    lens: "最新成交 101 元 · 眼前最低掛賣 102 元",
  },
  {
    label: "掛賣撤了，卻沒有成交",
    eyebrow: "掛單改變 · 成交未變",
    lens: "102、103 元掛賣撤走；最新成交價與成交量維持不變",
  },
  {
    label: "新買單，到另一個價位成交",
    eyebrow: "下一筆主動買入",
    lens: "5 隻買單抵達，從還在簿上的 104 元掛賣成交",
  },
  {
    label: "分開看撤單與成交",
    eyebrow: "回到完整因果",
    lens: "撤單改變可成交位置；下一筆成交才更新成交價",
  },
];
const cues = [
  [0, "最新成交 101，前方還有掛賣。"],
  [6000, "如果前方掛賣撤走，會怎樣？"],
  [TIMING.cancelFirst, "102 元掛賣撤了，沒有成交。"],
  [TIMING.cancelSecond, "103 也撤了，成交價仍是 101。"],
  [16000, "沒人下新單，成交量也不會增加。"],
  [18000, "現在，另一筆買入 5 隻抵達。"],
  [TIMING.buy, "104 元成交，K 線才跟著上漲。"],
  [27000, "撤單改變掛單，成交才更新成交價。"],
  [31000, "看見結果，也要看見中間發生什麼。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
