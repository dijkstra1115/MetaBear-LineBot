import {
  createOrderTypesStory,
  orderTypesSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "./order-types-model.js";
import { scenes, narrativeAt } from "./order-types-script.js";
import { drawOrderTypes } from "./order-types-view.js";
import { mountStory } from "./story-player.js";
const story = createOrderTypesStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = orderTypesSnapshot(story, p.playhead);
    return {
      ...drawOrderTypes({ ...p, state }),
      clock: `00:${String(Math.floor(p.playhead / 1000)).padStart(2, "0")}`,
      price: state.limit.last?.price ?? state.market.last?.price ?? "—",
      playback: "同一需求 · 兩種執行方式",
      description: `${scenes[p.scene].label}。兩組相同起始掛賣，分別模擬買入 30 隻。市價成交 ${state.market.filled} 隻，均價 ${state.market.avg?.toFixed(2) ?? "尚無"} 元。101 元限價成交 ${state.limit.filled} 隻，掛買等待 ${state.limit.resting} 隻。此為慢放教學；限價可立即成交，也可能部分成交或等待。`,
    };
  },
});
