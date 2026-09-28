import { scenePosition, TIMING } from "./withdrawal-model.js";
export const scenes = [
  {
    label: "這根 K，中間少了什麼？",
    eyebrow: "全景 · THE MISSING TRADES",
    lens: "已完成行情 · 放大 14:30 的同一根 K 線",
  },
  {
    label: "掛賣撤了，卻沒有成交",
    eyebrow: "選段回看 · 掛單撤走",
    lens: "102、103 元掛賣撤走；最新成交價與成交量維持不變",
  },
  {
    label: "下一筆成交，才到 104",
    eyebrow: "下一筆主動買入",
    lens: "5 隻買單抵達，從還在簿上的 104 元掛賣成交",
  },
  {
    label: "回到同一段完整行情",
    eyebrow: "回到全景 · 同一根 K 線",
    lens: "102、103 元沒有成交；這根 K 只留下 101 與 104",
  },
];
const cues = [
  [0, "101 到 104，中間兩檔怎麼沒成交？"],
  [3500, "走進這根 K，回看當時的委託簿。"],
  [TIMING.reset, "回到起點：101 元先成交 5 隻。"],
  [TIMING.cancelFirst, "102 元掛賣撤了，沒有成交。"],
  [TIMING.cancelSecond, "103 也撤了，成交價仍是 101。"],
  [16000, "最近的掛賣在 104，成交仍停在 101。"],
  [18400, "現在，另一筆買入 5 隻抵達。"],
  [TIMING.buy, "104 元成交，K 線才跟著上漲。"],
  [25500, "中間沒有成交，K 線仍連起 101 與 104。"],
  [28000, "拉回剛才的全景，看這根 K 留下什麼。"],
  [TIMING.panorama, "55 隻撤單，沒有留下任何成交量。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
