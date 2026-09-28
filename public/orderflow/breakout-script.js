import { scenePosition, TIMING } from "./breakout-model.js";
export const scenes = [
  {
    label: "先看這根突破 K",
    eyebrow: "市場故事 · BREAKOUT",
    lens: "已完成的模擬行情 · 選中 14:30，回看突破內部",
  },
  {
    label: "A：先穿過厚掛賣",
    eyebrow: "第一種情境 · 102 掛賣 60",
    lens: "A 先完整演完 · 同一根 K 與等待中的掛賣",
  },
  {
    label: "B：同一起點，換薄掛賣",
    eyebrow: "回到 101 · 只換 102 深度",
    lens: "另一種情境 B · 102 掛賣 10，103 仍掛賣 20",
  },
  {
    label: "回到同一個宏觀結果",
    eyebrow: "回到全景 · 再看兩種過程",
    lens: "同樣 101 → 103 · 本段主動買入 A 65、B 15",
  },
];
const cues = [
  [0, "同樣突破，真的都買很多？"],
  [TIMING.zoomIn, "靠近這根 K，看看成交走過什麼。"],
  [TIMING.reset, "先看 A：102 等著賣出 60 隻。"],
  [8000, "買入先成交在 102，掛賣逐筆變少。"],
  [13000, "買到 60，剛好用完這一檔。"],
  [TIMING.deepBreak, "再買 5 隻，才到 103 成交。"],
  [TIMING.resetB, "回到同一起點，只換 102 的深度。"],
  [20500, "換成 B，這裡只等著賣出 10 隻。"],
  [24000, "只買 10，就用完相同的價位。"],
  [TIMING.thinBreak, "再買 5，同樣到達 103。"],
  [TIMING.zoomOut, "回到原圖，突破的形狀一樣。"],
  [TIMING.compare, "同樣 101 到 103，買量卻是 65 對 15。"],
  [38000, "走過較厚的掛賣，需要更多買入量。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
