import { scenePosition, TIMING } from "./order-block-model.js";
export const scenes = [
  {
    label: "走進起漲前",
    eyebrow: "市場故事 · ORDER BLOCK",
    lens: "已完成的模擬行情 · 回看大買家 A 的執行過程",
  },
  {
    label: "掛買承接，控制成本",
    eyebrow: "選段回看 · 14:30",
    lens: "情境設定：A 想買 80 隻 · 先分批掛買，等待賣方成交",
  },
  {
    label: "加快買入，價格位移",
    eyebrow: "選段回看 · 14:31",
    lens: "情境設定：期限接近，A 主動買入剩餘 30 隻",
  },
  {
    label: "回看承接區",
    eyebrow: "同一份歷史 · 回到全景",
    lens: "本課取整根高低 · 合成成交回看",
  },
];
const cues = [
  [0, "大買家在買，為什麼先留下一根收跌 K？"],
  [TIMING.zoomIn, "靠近這兩根，回看成交過程。"],
  [TIMING.reset, "一次買太多，可能把成交成本推高。"],
  [TIMING.bids, "A 先分批掛買，等賣方來成交。"],
  [12000, "主動賣出，成交在 A 等待的買單。"],
  [15000, "A 買進了，成交價格卻向下走。"],
  [TIMING.originClose, "已承接 50 隻，這根 K 卻收跌。"],
  [TIMING.urgency, "期限接近，A 主動買進剩下 30 隻。"],
  [23800, "這檔賣單吃完，就往更高一檔成交。"],
  [TIMING.confirm, "收在 107，越過原本的前高 105。"],
  [TIMING.lookBack, "回頭看，剛才的承接發生在哪裡？"],
  [TIMING.zone, "本例取這根 K 的高低：101 到 104。"],
  [TIMING.zoomOut, "回到全景，保留這塊價格區域。"],
  [TIMING.panorama, "把承接到價格位移的起點，留在圖上。"],
];
export function narrativeAt(scene, elapsed) {
  const { playhead } = scenePosition(scene, elapsed);
  return {
    headline: (cues.findLast(([at]) => at <= playhead) ?? cues[0])[1],
    question: "",
  };
}
