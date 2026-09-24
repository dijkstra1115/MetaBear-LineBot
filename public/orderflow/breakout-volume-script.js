import { scenePosition } from "./breakout-volume-model.js";
export const scenes = [
  {
    label: "放量，越過門檻",
    eyebrow: "市場故事 · VOLUME BREAKOUT",
    lens: "同一商品 · 每根一分鐘 · 前六根已完成",
  },
  {
    label: "量與位置，分開核對",
    eyebrow: "靠近看 · 同一個比較基準",
    lens: "前五根均量20；突破這根成交60、收盤106",
  },
  {
    label: "後續的量與價格",
    eyebrow: "時間向前 · 等待結果",
    lens: "觀察後續三根成交量，以及收盤相對104的位置",
  },
  {
    label: "突破區持續有成交",
    eyebrow: "回到全景 · 量與價格",
    lens: "後三根量54、58、56，均量56；收盤105、105、106",
  },
];
const cues = [
  [0, "放量突破了，這樣就算站穩？"],
  [4000, "先比同一週期：前五根均量20。"],
  [7500, "這根成交60，是基準的3倍。"],
  [10500, "收盤106，確實越過104。"],
  [13000, "再看後面，量與價格有沒有延續。"],
  [19000, "下一根成交54，仍高於原本均量。"],
  [22000, "盤中跌回103，這根還沒收盤。"],
  [24700, "收回105，這根又成交了58。"],
  [29600, "第三根成交56，收盤仍在104上方。"],
  [32000, "成交量維持，突破區持續有成交。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
