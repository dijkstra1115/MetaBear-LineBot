import { scenePosition } from "./footprint-model.js";

export const scenes = [
  {
    label: "先看整段成交足跡",
    eyebrow: "名詞圖解 · FOOTPRINT",
    lens: "五根一分鐘 K 線 · 完整成交足跡",
  },
  {
    label: "成交，留下數字",
    eyebrow: "一筆成交 → 一個格子",
    lens: "左：主動賣出成交量　右：主動買入成交量",
  },
  {
    label: "同一價位，兩邊的成交",
    eyebrow: "同一價位 · 不同筆成交",
    lens: "數字累加；只有成交，才留下紀錄",
  },
  {
    label: "讀懂一格，回到全景",
    eyebrow: "讀一格 · 101 元",
    lens: "每個價位，記下這分鐘的成交量",
  },
];

// Let the fills explain themselves. Each caption adds just one reading rule.
const cues = [
  [0, "每根 K 線，都有成交足跡。"],
  [2500, "靠近，回看成交。"],
  [4200, "主動買入在右，主動賣出在左。"],
  [6700, "同價、同方向，累加。"],
  [9100, "主動賣出，記在左邊。"],
  [11500, "同一價位，也能留下兩邊。"],
  [21000, "101 元：賣出 12 隻、買入 35 隻。"],
  [24000, "數字是成交量，每筆只記一次。"],
  [27000, "回到全景，每根都能這樣讀。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  const [, headline] = cues.findLast(([at]) => at <= playhead) ?? cues[0];
  return { headline, question: "" };
}
