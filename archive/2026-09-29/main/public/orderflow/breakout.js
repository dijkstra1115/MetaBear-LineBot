import {
  createBreakoutStory,
  breakoutSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "./breakout-model.js";
import { scenes, narrativeAt } from "./breakout-script.js";
import { drawBreakout } from "./breakout-view.js";
import { mountStory } from "./story-player.js";
const story = createBreakoutStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = breakoutSnapshot(story, p.playhead);
    return {
      ...drawBreakout({ story, state, ...p }),
      clock: `00:${String(Math.floor(p.playhead / 1000)).padStart(2, "0")}`,
      price: state.comparing
        ? "103 / 103"
        : state.replay
          ? `${state.active.price} 元`
          : `${state.bars.at(-1).close} 元`,
      playback: state.comparing
        ? "同一段歷史 · 兩種重演"
        : state.replay
          ? `情境 ${state.active.id} · 成交回看`
          : "已完成的模擬行情",
      description: state.replay
        ? `${scenes[p.scene].label}。目前只重演情境 ${state.active.id}，102 起初掛賣 ${state.active.depth} 隻。本段主動買入 ${state.active.volume} 隻，最新成交 ${state.active.price} 元，102 剩 ${state.active.remaining102} 隻。目標 K 從共同的 101 元起始成交及目前已播放成交生成；後續 K 尚未回到全景。`
        : `相同的九根已完成模擬 K 線，目標 14:30 從 101 越過 102，到 103。${state.comparing ? "兩種條件依序重演：A 掛賣60，買入65；B掛賣10，買入15。兩種成交量不含共同101元的起始1隻。" : "先定位突破，再沿同一場景回看。"}`,
    };
  },
});
