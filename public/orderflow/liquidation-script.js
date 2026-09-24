import { scenePosition, TIMING } from "./liquidation-model.js";
export const scenes = [
  {
    label: "100 元，開出 500 元部位",
    eyebrow: "名詞圖解 · 合約強平",
    lens: "教學用線性逐倉做多 · 100 元保證金 · 5 倍槓桿",
  },
  {
    label: "跌幅變成保證金損失",
    eyebrow: "放大看 · 保證金消耗",
    lens: "500 元部位 × 5% 跌幅 = 25 元損失",
  },
  {
    label: "虧損吃掉保證金",
    eyebrow: "接近強平",
    lens: "市場跌幅 × 5 倍 = 此例的保證金損失比例",
  },
  {
    label: "歸零以前，先被強平",
    eyebrow: "強平觸發瞬間",
    lens: "−20% 是忽略費用的理論耗盡點，實際強平門檻更早",
  },
];
const cues = [
  [0, "100 元保證金，開 5 倍槓桿。"],
  [2500, "承擔的部位，是 500 元。"],
  [TIMING.drop, "市場跌 5%，保證金就虧掉 25 元。"],
  [TIMING.half, "跌 10%，保證金已經少了一半。"],
  [TIMING.near, "跌幅繼續擴大，保證金越來越少。"],
  [TIMING.trigger, "還沒虧光，系統就先觸發強平。"],
  [TIMING.zoomOut, "20% 是理論歸零點，強平會更早到。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
