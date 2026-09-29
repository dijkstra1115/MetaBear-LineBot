import { scenePosition } from "./volume-profile-model.js";
export const scenes = [
  {
    label: "先選一段成交",
    eyebrow: "名詞圖解 · VOLUME PROFILE",
    lens: "已完成成交範圍：14:30–14:33，共三個一分鐘",
  },
  {
    label: "從時間，移到價位",
    eyebrow: "同一批資料 · 換個分組",
    lens: "每個片段只屬於待歸類、移動中、已歸類其中一處",
  },
  {
    label: "相同價位，累加在一起",
    eyebrow: "每列 1 元",
    lens: "橫向長度代表這段期間、這個價位的已成交量",
  },
  {
    label: "成交最多的位置",
    eyebrow: "POINT OF CONTROL",
    lens: "POC 是選定範圍內成交量最大的價位，不是等待掛單",
  },
];
const cues = [
  [0, "同一批成交，也能換個方式看。"],
  [4000, "先選 14:30 到 14:33 這一段。"],
  [6000, "不按時間，改按成交價歸類。"],
  [9600, "每個片段，只放進一個價位。"],
  [13000, "其他分鐘，也歸到相同價位。"],
  [21300, "分組換了，總成交還是 140。"],
  [23000, "101 元成交最多，這裡是 POC。"],
  [27000, "這是已成交量，不是等待掛單。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
