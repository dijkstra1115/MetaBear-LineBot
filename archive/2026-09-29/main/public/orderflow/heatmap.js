import {
  createHeatmapStory,
  heatmapSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  formatClock,
} from "./heatmap-model.js";
import { scenes, narrativeAt } from "./heatmap-script.js";
import { drawHeatmap } from "./heatmap-view.js";
import { mountStory } from "./story-player.js";

const story = createHeatmapStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = heatmapSnapshot(story, p.time);
    const quantity = state.rows.find((r) => r.price === 102).size;
    return {
      ...drawHeatmap({ ...p, state }),
      clock: formatClock(p.time),
      price: state.price === null ? "—" : String(state.price),
      playback: p.time >= 60000 ? "完整紀錄 · 一分鐘" : "掛單與成交 · 同步回看",
      description: `${scenes[p.scene].label}。${formatClock(p.time)}。102 元可見掛賣 ${quantity} 隻。共 ${state.trades.length} 筆成交、${state.volume} 隻。${state.price === null ? "尚未成交" : `最新成交價 ${state.price} 元`}。色帶亮度代表當時的可見掛單量；圓點代表已成交量。`,
    };
  },
});
