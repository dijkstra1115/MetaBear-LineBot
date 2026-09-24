import { scenePosition } from "./breakout-volume-model.js";
export const scenes = [
  {
    label: "突破、回踩，接著再上",
    eyebrow: "一段行情 · 另一種吸收",
    lens: "完整模擬行情，接著走進同一組成交",
  },
  {
    label: "放量買入，穿過壓力",
    eyebrow: "突破 104",
    lens: "前五根均量20；主動買單逐價成交",
  },
  {
    label: "上方仍持續成交",
    eyebrow: "量與位置",
    lens: "成交量延續，價格留在突破區上方",
  },
  {
    label: "回踩，賣單被接住",
    eyebrow: "回到原壓力",
    lens: "掛買補入承接；主動賣量增加，價格卻不再向下",
  },
  {
    label: "買單再往上成交",
    eyebrow: "承接之後",
    lens: "後續買入穿過掛賣，價格再次抬高",
  },
  {
    label: "原壓力，留下承接",
    eyebrow: "回到同一份結果",
    lens: "兩種吸收的對照：本課被接住的是賣單",
  },
];
const cues = [
  [0, "放量突破後，這次回踩又往上了。"],
  [4000, "走進回踩之前，看這次誰接住誰。"],
  [7000, "買單逐檔成交，越過 104 壓力。"],
  [10500, "成交量放大，價格也推到上方。"],
  [13000, "突破以後，上方仍持續有成交。"],
  [19000, "主動賣出增加，價格回踩 104。"],
  [23000, "賣單打下來，104 的掛買接住。"],
  [26500, "掛買補進來，賣得更多卻跌不下去。"],
  [30000, "賣單被接住後，新的買單開始接手。"],
  [33000, "買單吃掉上方掛賣，再往上成交。"],
  [36500, "原壓力承接了回踩，價格再次推高。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
