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
    const state = absorptionSnapshot(story, p.time);
    return {
      ...drawAbsorption({ story, state, ...p }),
      clock: `第 ${state.trades.length} 筆成交`,
      price: state.price === null ? "—" : String(state.price),
      playback: "已知掛單 · 逐筆消耗",
      description: `${scenes[p.scene].label}。101 元掛賣剩 ${state.remaining101} 隻，102 元掛賣剩 ${state.remaining102} 隻。累積成交 ${state.volume} 隻；最新成交價 ${state.price ?? "尚無"}。全段只有主動買入，沒有補單或隱藏單。101 元成交 80 隻後，下一筆 8 隻才在 102 元成交。`,
    };
  },
});
