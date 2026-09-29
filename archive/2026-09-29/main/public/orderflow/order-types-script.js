import { scenePosition, TIMING } from "./order-types-model.js";
export const scenes = [
  {
    label: "同一筆買入，兩種選擇",
    eyebrow: "名詞圖解 · ORDER TYPES",
    lens: "相同掛單、各自獨立的兩次模擬",
  },
  {
    label: "市價，沿著掛賣成交",
    eyebrow: "市價買入",
    lens: "從最低掛賣開始，依序成交",
  },
  {
    label: "限價，先成交再等待",
    eyebrow: "限價買入 · 最高 101 元",
    lens: "能成交的先成交，剩餘留在 101 元等待",
  },
  {
    label: "回到兩種結果",
    eyebrow: "成交優先 · 價格上限",
    lens: "市價沿掛賣成交；本例限價最多付101元，剩餘留在簿上",
  },
];
const cues = [
  [0, "同樣買 30 隻，你想怎麼買？"],
  [4000, "市價，從最低掛賣開始買。"],
  [TIMING.marketSecond, "這一層不夠，就往上一層。"],
  [12000, "限價買入：最多付 101 元。"],
  [TIMING.limitFill, "有合適價格，限價也能立即成交。"],
  [TIMING.rest, "剩下 20 隻，留在 101 元等。"],
  [TIMING.arrival, "有人願意賣，再成交 8 隻。"],
  [22000, "市價沿掛賣成交，限價把最高買價定住。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
