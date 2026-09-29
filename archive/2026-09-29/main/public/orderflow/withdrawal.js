import {
  createWithdrawalStory,
  withdrawalSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "./withdrawal-model.js";
import { scenes, narrativeAt } from "./withdrawal-script.js";
import { drawWithdrawal } from "./withdrawal-view.js";
import { mountStory } from "./story-player.js";
const story = createWithdrawalStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = withdrawalSnapshot(story, p.playhead);
    return {
      ...drawWithdrawal({ ...p, state }),
      clock: `00:${String(Math.floor(p.playhead / 1000)).padStart(2, "0")}`,
      price: state.price,
      playback: state.replay ? "14:30 選段回看" : "已完成行情 · 全景",
      description: `${scenes[p.scene].label}。${state.replay ? "回看 14:30 當時事件" : "已完成的 11 根一分 K 歷史"}。最新成交 ${state.price} 元；選中 14:30 的 K 線成交量 ${state.volume} 隻，開 ${state.candle.open}、高 ${state.candle.high}、低 ${state.candle.low}、收 ${state.candle.close}。${state.replay ? `最低可見掛賣 ${state.bestAsk} 元，已撤回 ${state.cancellations.reduce((n, e) => n + e.size, 0)} 隻掛賣。` : "起始與結尾展示相同完整行情。"}撤單只減少等待中的掛單；下一筆 5 隻在 104 元成交時，選中 K 線才從 101 延伸到 104，量從 5 變成 10。`,
    };
  },
});
