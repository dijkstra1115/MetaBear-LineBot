import { scenePosition, TIMING } from "./breakout-model.js";
export const scenes = [
  {
    label: "同樣越過 102",
    eyebrow: "市場故事 · BREAKOUT",
    lens: "兩個合成市場，同樣從101越過102，到103成交",
  },
  {
    label: "靠近門檻，看見厚薄",
    eyebrow: "重看突破之前",
    lens: "只改102的掛賣深度：A有60隻，B有10隻；上方103都掛20隻",
  },
  {
    label: "少量買入，也能越過",
    eyebrow: "兩種深度 · 分別成交",
    lens: "本例沒有補單或撤單，掛賣只被實際成交消耗",
  },
  {
    label: "相同突破，不同成交量",
    eyebrow: "拉回同一個結果",
    lens: "比較本段主動買量，不含共同起始101元那筆成交",
  },
];
const cues = [
  [0, "同樣突破 102，買盤一樣強嗎？"],
  [TIMING.zoomIn, "退回成交前，看看掛賣有多厚。"],
  [TIMING.reset, "A 掛賣 60，B 只有 10。"],
  [8500, "兩邊的買入，都在消耗掛賣。"],
  [TIMING.thinBreak, "B 只買 15，就已在 103 成交。"],
  [17000, "A 買了 60，才剛用完 102。"],
  [TIMING.deepBreak, "A 再買 5，才到同樣的 103。"],
  [TIMING.compare, "同樣越過門檻，卻是 65 對 15。"],
  [30000, "同樣到103，厚掛單需要更多買入量。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
