import { scenePosition, TIMING } from "./slippage-model.js";
export const scenes = [
  {
    label: "同樣買入，不同深度",
    eyebrow: "名詞圖解 · SLIPPAGE",
    lens: "相同市價買入 30 隻 · 起始最優掛賣都是 101 元",
  },
  {
    label: "一層就接得住",
    eyebrow: "較深的委託簿",
    lens: "101 元有足夠掛賣，30 隻都在這裡成交",
  },
  {
    label: "一筆訂單，走過多層",
    eyebrow: "較淺的委託簿",
    lens: "低價數量不夠，就依序吃到較高掛賣",
  },
  {
    label: "均價，偏離了預期",
    eyebrow: "回到成交結果",
    lens: "本例滑價＝成交均價－送單前最優賣價 · 不含手續費",
  },
];
const cues = [
  [0, "同樣買 30 隻，價格會一樣嗎？"],
  [5000, "這裡，101 元就有 40 隻。"],
  [TIMING.deepFill, "30 隻，都在 101 元成交。"],
  [11000, "換到淺一點的委託簿。"],
  [TIMING.shallowFirst, "101 元只有 5 隻，不夠買。"],
  [TIMING.shallowSecond, "剩下的，繼續往上成交。"],
  [TIMING.shallowThird, "103 元沒掛單，接著買到 104。"],
  [23000, "均價 102.50，比預期多 1.50。"],
  [27000, "這段成交價差，就是本例的滑價。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
