import { scenePosition, TIMING } from "./heatmap-model.js";

export const scenes = [
  {
    label: "掛單，留下時間軌跡",
    eyebrow: "名詞圖解 · HEATMAP",
    lens: "橫向時間 · 縱向價格 · 亮度代表掛單量",
  },
  {
    label: "越亮，掛單越多",
    eyebrow: "看一列 · 102 元",
    lens: "新增掛賣，讓這個價位的色帶變亮",
  },
  {
    label: "變暗的兩種原因",
    eyebrow: "成交與撤單",
    lens: "成交留下圓點；撤單只減少掛單",
  },
  {
    label: "回到整張熱力圖",
    eyebrow: "同一張圖 · 兩種紀錄",
    lens: "色帶記錄掛單，圓點記錄成交",
  },
];
const cues = [
  [0, "每一刻的掛單，都能留下來。"],
  [2000, "橫向是時間，縱向是價格。"],
  [TIMING.zoomIn, "靠近 102 元，看這條色帶。"],
  [TIMING.add, "掛單越多，色帶越亮。"],
  [TIMING.fill, "成交 25，掛單剩 55。"],
  [TIMING.cancel, "撤單 40，變暗卻沒有成交。"],
  [TIMING.zoomOut, "色帶是掛單，圓點是成交。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
