import { scenePosition, TIMING } from "./absorption-story-model.js";
export const scenes = [
  {
    label: "有人買，卻還沒漲",
    eyebrow: "市場故事 · ABSORPTION",
    lens: "這一段，只有主動買入與已知的被動掛賣",
  },
  {
    label: "一筆一筆，被同價位接住",
    eyebrow: "靠近 101 元",
    lens: "掛賣被消耗；成交量增加；最新價維持 101",
  },
  {
    label: "成交增加，價格停留",
    eyebrow: "看見吸收",
    lens: "本例掛賣有限，沒有補單，也沒有隱藏單",
  },
  {
    label: "下一筆，才走到上一檔",
    eyebrow: "同一組掛單 · 不同結果",
    lens: "101 掛賣用完後，新的主動買入才成交於 102",
  },
];
const cues = [
  [0, "一直有人買，為什麼漲不動？"],
  [TIMING.zoomIn, "101 元，還有 70 隻掛賣等待。"],
  [6500, "買入接著來，掛賣一筆筆減少。"],
  [TIMING.absorbed, "成交累積 60，最新價還是 101。"],
  [14000, "被動掛賣承接主動買入：吸收。"],
  [TIMING.empty, "掛賣用完，最新成交仍是 101。"],
  [TIMING.higher, "下一筆買入，才在 102 成交。"],
  [31000, "主動買入多，價格不一定立刻漲。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
