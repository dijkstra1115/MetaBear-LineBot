import { scenePosition, TIMING } from "./funding-model.js";
export const scenes = [
  {
    label: "持倉者之間的交換",
    eyebrow: "名詞圖解 · FUNDING",
    lens: "教學用 USDT 永續 · 多空各有 10,000 USDT 部位",
  },
  {
    label: "正費率，多方付空方",
    eyebrow: "第一次結算",
    lens: "10,000 USDT 部位 × 0.01% = 1 USDT",
  },
  {
    label: "負費率，交換方向反過來",
    eyebrow: "下一次結算",
    lens: "10,000 USDT 部位 × 0.02% = 2 USDT",
  },
  {
    label: "正負費率，兩種方向",
    eyebrow: "回到全景 · 資金費紀錄",
    lens: "本段資金費收支從 0 起算 · 與保證金、價差損益分開",
  },
];
const cues = [
  [0, "資金費，幫助永續價格貼近現貨。"],
  [3200, "結算時還有持倉，才交換資金費。"],
  [TIMING.zoomIn, "先看正費率：+0.01%。"],
  [TIMING.first, "多方付 1 USDT，空方收到 1 USDT。"],
  [TIMING.next, "下一次結算，換成負費率。"],
  [TIMING.second, "這次空方付 2 USDT，方向反過來。"],
  [TIMING.zoomOut, "正費率多付空，負費率空付多。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
