import { scenePosition, TIMING } from "./leverage-model.js";

export const scenes = [
  {
    label: "同樣的保證金",
    eyebrow: "名詞圖解 · LEVERAGE",
    lens: "教學用線性做多合約 · 開倉價 100 元 · 忽略費用",
  },
  {
    label: "部位放大，損益也放大",
    eyebrow: "看部位 · 相同價差",
    lens: "每格代表 1 隻合約曝險 · 每隻漲跌 1 元",
  },
  {
    label: "換成同樣的部位",
    eyebrow: "換個比較 · 部位相同",
    lens: "比較兩種開倉設定 · 部位價值為開倉時名目金額",
  },
  {
    label: "損益跟著部位走",
    eyebrow: "回到全景 · 相同價差",
    lens: "未實現損益 = 部位數量 × 價差 · 此例不含費用",
  },
];
const cues = [
  [0, "同樣 100 元，能承擔多大的部位？"],
  [2500, "5 倍槓桿，對應 500 元的部位。"],
  [TIMING.zoomIn, "靠近看，每一格都是一隻的曝險。"],
  [TIMING.rise, "每隻漲 1 元，五隻就賺 5 元。"],
  [TIMING.fall, "下跌時，虧損也跟著部位放大。"],
  [TIMING.zoomOut, "再比較：如果部位一樣大呢？"],
  [TIMING.compare, "同樣五隻，保證金可以不同。"],
  [TIMING.recover, "同部位、同價差，損益就相同。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
