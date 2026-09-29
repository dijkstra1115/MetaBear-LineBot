import { scenePosition, TIMING } from "./stop-orders-model.js";
export const scenes = [
  {
    label: "先看市價止損",
    eyebrow: "名詞圖解 · 停損單",
    lens: "已持有 20 隻 · 最新成交價跌至 99 元觸發市價賣出",
  },
  {
    label: "從最佳掛買開始賣",
    eyebrow: "市價止損 · 優先成交",
    lens: "先賣給最高掛買；這一層用完，再往下一層",
  },
  {
    label: "回到起點，改用限價",
    eyebrow: "限價止損 · 99 觸發，最低賣 98",
    lens: "99 元觸發 → 最低賣 98 元 · 能成交的先成交，剩餘等待",
  },
  {
    label: "最後看兩種結果",
    eyebrow: "優先成交 · 限定價格",
    lens: "市價依序賣完20隻；限價先賣10隻，剩餘留在98元",
  },
];
const cues = [
  [0, "先看市價止損：跌到 99，賣出 20 隻。"],
  [TIMING.trigger, "99 元觸發，接著送出市價賣單。"],
  [TIMING.submit, "現在最高有人出 98 元，先賣這裡。"],
  [TIMING.firstFill, "98 元成交 10 隻，接著輪到 97。"],
  [TIMING.secondFill, "再賣 10 隻，最後均價是 97.50。"],
  [13800, "市價優先成交，成交價可能滑落。"],
  [TIMING.reset, "回到同一起點，這次改用限價止損。"],
  [18000, "同樣 99 元觸發，最低接受 98 元。"],
  [TIMING.limitTrigger, "再次觸發，這次送出限價賣單。"],
  [TIMING.limitSubmit, "98 元有人買，但只夠 10 隻。"],
  [TIMING.limitFill, "先賣出 10 隻，剩下 10 隻等在 98。"],
  [26300, "買方只出 97，限價單就不往下賣。"],
  [TIMING.summary, "一個優先成交，一個守住最低賣價。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
