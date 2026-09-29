import { scenePosition, TIMING } from "./delta-concept-model.js";
export const scenes = [
  {
    label: "同一分鐘，兩種主動成交",
    eyebrow: "名詞圖解 · DELTA / CVD",
    lens: "已完成的一分鐘足跡；左主動賣、右主動買",
  },
  {
    label: "買量減賣量，就是 Delta",
    eyebrow: "靠近 14:30",
    lens: "Delta = 主動買入量 − 主動賣出量",
  },
  {
    label: "每一分鐘，都有自己的差",
    eyebrow: "一段一個 Delta",
    lens: "單位為成交隻數，不是買賣方人數",
  },
  {
    label: "從同一起點，累加成 CVD",
    eyebrow: "CUMULATIVE VOLUME DELTA",
    lens: "本例 14:30 起歸零，累加每分鐘 Delta；折線取每分鐘收盤值",
  },
];
const cues = [
  [0, "先看每分鐘的主動買、賣量。"],
  [TIMING.zoomIn, "這分鐘：主動買 40、主動賣 15。"],
  [TIMING.formula, "買量減賣量，就是 Delta。"],
  [TIMING.firstDelta, "40 − 15，這分鐘 Delta 是 +25。"],
  [12500, "每一分鐘，都各自算一次。"],
  [13500, "10 − 20，這分鐘是 −10。"],
  [16000, "25 − 10，下一分鐘是 +15。"],
  [18000, "CVD，從指定起點累加 Delta。"],
  [19500, "本例 14:30 歸零，先加 25。"],
  [22500, "再加 −10，累計回到 15。"],
  [25000, "再加 15，累計成為 30。"],
  [27800, "Delta 看每段的差，CVD 把差累加。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
