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
      playback: "掛單變化 · 成交紀錄",
      description: `${scenes[p.scene].label}。最新成交 ${state.price} 元，本段成交量 ${state.volume} 隻。K 線開 ${state.candle.open}、高 ${state.candle.high}、低 ${state.candle.low}、目前收 ${state.candle.close}。最低可見掛賣 ${state.bestAsk} 元，已撤回 ${state.cancellations.reduce((n, e) => n + e.size, 0)} 隻掛賣。撤單只減少等待中的掛單；下一筆 5 隻在 104 元成交時，成交價與量才更新。`,
    };
  },
});
