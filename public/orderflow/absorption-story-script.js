import { scenePosition } from "./absorption-story-model.js";
export const scenes = [
  {
    label: "三次測壓，量大卻過不去",
    eyebrow: "一段行情，四種線索",
    lens: "先看三次已完成測壓，再走進同一組成交",
  },
  {
    label: "放大：買單被壓力位接住",
    eyebrow: "Footprint × Heatmap",
    lens: "選段回看；亮格為對角三倍成交失衡",
  },
  {
    label: "掛賣變薄，後續買單穿過",
    eyebrow: "掛單與成交",
    lens: "成交消耗與撤單分開；撤單不改 CVD",
  },
  {
    label: "CVD 向上，價格卻停住",
    eyebrow: "高位吸收",
    lens: "106 持續補入掛賣，承接主動買單",
  },
  {
    label: "主動賣出開始接手",
    eyebrow: "成交方向轉換",
    lens: "左側成交增加；同一筆成交讓 CVD 下彎",
  },
  {
    label: "帶著成交，回看完整結果",
    eyebrow: "回到同一段行情",
    lens: "高位吸收之後，主動賣出接手",
  },
];
const cues = [
  [0, "三次往上試，量很大，卻過不了 104。"],
  [4000, "靠近最後幾根，看買單去了哪裡。"],
  [7000, "右邊買入多，104 卻一直有人接著賣。"],
  [10500, "買單逐筆成交，上方掛賣逐漸變薄。"],
  [13500, "又撤走 50 隻，價格還沒變。"],
  [15500, "後續買單穿過 104，成交往上走。"],
  [20000, "買入累積，CVD 也跟著抬高。"],
  [23500, "買單更多了，卻再也越不過 106。"],
  [27000, "106 的掛賣補進來，持續接住買單。"],
  [30500, "有人主動追買，也有人在高位賣給他。"],
  [33500, "換左邊變亮：主動賣出開始占上風。"],
  [36500, "賣單打向下方買價，CVD 隨之轉下。"],
  [40000, "價格跌回 104 下方，突破被收回。"],
  [44000, "高位買入被吸收，接著由賣出接手。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
