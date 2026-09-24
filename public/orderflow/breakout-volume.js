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
    const state = breakoutVolumeSnapshot(story, p.playhead);
    const active = state.bars[state.activeIndex];
    return {
      ...drawBreakoutVolume({ story, state, ...p }),
      clock: `${active.label} · ${active.complete ? "已收盤" : "形成中"}`,
      price: active.candle.close,
      playback: "同一行情 · 逐步向前",
      description: `${scenes[p.scene].label}。前五根一分鐘成交量為16、24、18、22、20，平均20；突破K線成交60、收盤106，為均量3倍並高於104。現在後續已收盤${state.observed.length}根，成交量依序${state.observed.map((bar) => bar.volume).join("、") || "尚未完成"}，收盤依序${state.observed.map((bar) => bar.candle.close).join("、") || "尚未完成"}。${state.followAverage === null ? "" : `這些已完成K線的平均成交量為${state.followAverage}。`}成交量與價格逐筆更新，完成後才計入本段平均。`,
    };
  },
});
