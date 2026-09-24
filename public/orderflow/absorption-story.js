import {
  createAbsorptionStory,
  absorptionSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "./absorption-story-model.js";
import { scenes, narrativeAt } from "./absorption-story-script.js";
import { drawAbsorption } from "./absorption-story-view.js";
import { mountStory } from "./story-player.js";
const story = createAbsorptionStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = absorptionSnapshot(story, p.time),
      bar = state.currentBar;
    return {
      ...drawAbsorption({ story, state, ...p }),
      clock: story.barRanges[state.activeBarIndex].label,
      price: String(state.price ?? "—"),
      playback:
        p.time < 7000
          ? "已完成測壓 · 準備回看"
          : p.time < 14000
            ? "第三次測壓 · 選段回看"
            : "同一段行情 · 逐筆成交",
      description: `${scenes[p.scene].label}。最新成交 ${state.price} 元，CVD ${state.cvd} 隻。本根成交 ${bar?.volume ?? 0} 隻，Delta ${bar?.delta ?? 0} 隻。足跡左側為主動賣出、右側為主動買入；量柱、K線與CVD皆來自同一份成交。熱力色帶記錄未成交掛單。`,
    };
  },
});
