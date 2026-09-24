import { scenes, narrativeAt } from "./wick-script.js";
import { chapters, desktopNarrativeAt } from "./wick-desktop-script.js";
import {
  createWickStory,
  wickSnapshot,
  scenePosition,
  desktopScenePosition,
  SCENE_DURATIONS,
  continuationCamera,
} from "./wick-model.js";
import { drawWick, formatPrice, formatSize } from "./wick-view.js";
import { drawWickDesktop } from "./wick-desktop-view.js";
import { mountStory } from "./story-player.js";

const story = createWickStory();
let stateTime = -1,
  state;
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position(scene, elapsed, reduced) {
    return {
      ...scenePosition(scene, elapsed, reduced),
      scene,
      elapsed,
      reduced,
    };
  },
  narrative: (scene, elapsed, reduced, mobile) =>
    mobile
      ? narrativeAt(scene, elapsed, reduced)
      : desktopNarrativeAt(scene, elapsed, reduced),
  continuousDesktop: true,
  desktopSceneHold: 1200,
  previousStory: "./matching.html#scene-8",
  completionLabel: "本課完成",
  render(p) {
    if (!p.mobile)
      p = { ...p, ...desktopScenePosition(p.scene, p.elapsed, p.reduced) };
    if (p.time !== stateTime) {
      state = wickSnapshot(story, p.time);
      stateTime = p.time;
    }
    const { scene, elapsed, reduced } = p;
    const labels = {
      overview: p.mobile ? "一分鐘快轉 · 10×" : "已完成行情 · 選段回看",
      rewind: "時間倒回",
      approach: "靠近起點",
      quotes: "回看掛單 · 慢放",
      execution: "回看成交 · 0.5×",
      absorption: "回看補量 · 慢放",
      depletion: "沿著同一價位 · 慢放",
      ascent: elapsed < 4200 ? "逐筆慢放 · 變速回看" : "跟隨成交 · 變速回看",
      "high-absorption": elapsed < 1600 ? "靠近高點" : "回看高處補量 · 慢放",
      "bid-depth": "回看被動買單 · 慢放",
      descent:
        elapsed < 4700 ? "逐筆慢放 · 變速回看" : "跟隨主動賣出 · 變速回看",
      support: "回看下方承接 · 慢放",
      closing: elapsed < 1800 ? "最後幾筆成交 · 慢放" : "退回全景 · 慢放",
      "recap-rewind": "回看同一分鐘 · 時間倒回",
      recap: "回看同一分鐘 · 3⅓×",
    };
    const lens =
      scene >= 9
        ? scene === 9
          ? "主動賣出與被動買單補入，交錯發生。"
          : scene === 10
            ? "最高成交留下影線，最後成交決定收盤。"
            : p.mode === "recap-rewind"
              ? "同一段行情，回到起點再看一次。"
              : "同一份成交，同一根 K 線。"
        : scene >= 6
          ? scene === 6
            ? "被動賣單補回，在高處再次出現。"
            : scene === 7
              ? "被動買單在等待，主動賣出才會和它成交。"
              : "當段主動賣出累計，對照上衝時的主動買入。"
          : scene >= 3
            ? scene === 3
              ? "主動買入與被動賣單補入，交錯發生。"
              : scene === 4
                ? "同一個價位，等待成交的被動賣單逐漸減少。"
                : elapsed < 10500
                  ? "鏡頭跟隨已發生的成交，向上移動。"
                  : "退開一點，看見這一段上漲。"
            : p.mode === "rewind"
              ? "先回到這一分鐘的起點"
              : p.zoom < 0.5
                ? "一根 K 線 · 一分鐘"
                : scene === 1
                  ? "被動掛單更新，尚未把價格往上推。"
                  : "Taker 主動成交 ↔ Maker 先掛單等待";
    const quotesVisible =
      p.zoom >= 0.95 &&
      (p.mode !== "closing" || elapsed < (reduced ? 1800 : 900)) &&
      (!["ascent", "high-absorption"].includes(p.mode) ||
        continuationCamera(state, p.time, elapsed, p.mode, reduced).wide < 0.5);
    const seconds = Math.min(60000, p.time);
    const clock =
      seconds >= 60000
        ? "14:33:00.00"
        : "14:32:" + (seconds / 1000).toFixed(2).padStart(5, "0");
    return {
      ...(p.mobile
        ? drawWick({ story, state, ...p, settled: p.progress === 1 })
        : drawWickDesktop({ story, state, ...p })),
      clock,
      price: formatPrice(state.price),
      playback: labels[p.mode],
      mobileLens: lens,
      description:
        `${p.mobile ? scenes[scene].label : chapters[scene]}。${clock}，最新成交 ${formatPrice(state.price)}。K 線開 ${formatPrice(state.candle.open)}、高 ${formatPrice(state.candle.high)}、低 ${formatPrice(state.candle.low)}、目前收 ${formatPrice(state.candle.close)}。` +
        (quotesVisible
          ? `最近被動賣單 ${formatPrice(state.asks[0].price)}，可見數量 ${formatSize(state.asks[0].size)} 隻；最近被動買單 ${formatPrice(state.bids[0].price)}，可見數量 ${formatSize(state.bids[0].size)} 隻。`
          : ""),
    };
  },
});
