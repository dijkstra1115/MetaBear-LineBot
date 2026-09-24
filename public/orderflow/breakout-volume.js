import {
  createBreakoutVolumeStory,
  breakoutVolumeSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "./breakout-volume-model.js";
import { scenes, narrativeAt } from "./breakout-volume-script.js";
import { drawBreakoutVolume } from "./breakout-volume-view.js";
import { mountStory } from "./story-player.js";
const story = createBreakoutVolumeStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = breakoutVolumeSnapshot(story, p.time),
      bar = state.currentBar;
    return {
      ...drawBreakoutVolume({ story, state, ...p }),
      clock: story.barRanges[state.activeBarIndex].label,
      price: state.price ?? "—",
      playback: state.preview
        ? "完整行情 · 準備回看"
        : state.replay
          ? "同一份成交 · 選段回看"
          : "同一段行情 · 完整結果",
      description: `${scenes[p.scene].label}。最新成交${state.price}元，CVD ${state.cvd}隻。本根成交${bar?.volume ?? 0}隻、Delta ${bar?.delta ?? 0}隻。足跡左側是主動賣出、右側是主動買入，量柱、K線與CVD來自同一份成交，熱力圖顯示等待的掛買與掛賣。`,
    };
  },
});
