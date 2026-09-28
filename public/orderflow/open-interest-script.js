import { scenePosition, TIMING } from "./open-interest-model.js";
export const scenes = [
  {
    label: "K 線下方的未平倉量",
    eyebrow: "名詞圖解 · OPEN INTEREST",
    lens: "已完成的模擬行情 · 選中 14:30，回看其中四筆成交",
  },
  {
    label: "雙方開倉與雙方平倉",
    eyebrow: "選段回看 · 前兩筆",
    lens: "買方開多／平空 · 賣方開空／平多",
  },
  {
    label: "多方換手與空方換手",
    eyebrow: "選段回看 · 後兩筆",
    lens: "一邊新開、一邊平倉，未平倉量不變",
  },
  {
    label: "回到同一段 K 線與 OI",
    eyebrow: "同一份歷史 · 回到全景",
    lens: "本段四筆各成交 1 口 · OI 變化依序 +1、−1、0、0",
  },
];
const cues = [
  [0, "K 線下方，還有一條未平倉量。"],
  [TIMING.zoomIn, "靠近這根 K 線，回看四筆成交。"],
  [6000, "買方開多、賣方開空。"],
  [TIMING.open, "兩邊都新開，OI 只增加一口。"],
  [12000, "買方平空、賣方平多。"],
  [TIMING.close, "兩邊都平倉，OI 減少一口。"],
  [18000, "買方開多、賣方平多。"],
  [TIMING.longTransfer, "多方換人持有，OI 不變。"],
  [24000, "買方平空、賣方開空。"],
  [TIMING.shortTransfer, "空方換人持有，OI 也不變。"],
  [TIMING.zoomOut, "四筆都有成交，OI 卻不一定增加。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
