import { scenePosition } from "./imbalance-model.js";
export const scenes = [
  {
    label: "足跡上的亮格",
    eyebrow: "名詞圖解 · IMBALANCE",
    lens: "已完成足跡 · 本課只解讀買方對角比較",
  },
  {
    label: "比較相鄰價位的對角",
    eyebrow: "Ask 上一格 / Bid 下一格",
    lens: "本例買方：較高價的主動買量 ÷ 低一檔的主動賣量",
  },
  {
    label: "達到門檻，才標亮",
    eyebrow: "本例門檻 ≥ 3:1",
    lens: "3 倍＝300%；比較成交數量，不是同價兩側或交易者人數",
  },
  {
    label: "零量與平台設定",
    eyebrow: "本例零分母不計",
    lens: "門檻、零量處理及資料分類依平台設定",
  },
];
const cues = [
  [0, "足跡亮格，是怎麼比出來的？"],
  [4000, "靠近這兩格，沿對角線比較。"],
  [5500, "右上 30，對照左下 10。"],
  [8000, "30 ÷ 10＝3 倍，達到本例門檻。"],
  [13000, "換下一組，也沿對角線比較。"],
  [15000, "40 ÷ 10＝4 倍，這格也標亮。"],
  [19500, "15 ÷ 10＝1.5 倍，還沒達標。"],
  [23500, "分母是 0，本例不計入比較。"],
  [25500, "門檻與零量規則，依平台設定。"],
  [28000, "對角比例達 3 倍，右上格標亮。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
