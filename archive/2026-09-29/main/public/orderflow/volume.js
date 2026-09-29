import {
  createVolumeStory,
  volumeSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  TIMING,
} from "./volume-model.js";
import { scenes, narrativeAt } from "./volume-script.js";
import { drawVolume } from "./volume-view.js";
import { mountStory } from "./story-player.js";
const story = createVolumeStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = volumeSnapshot(story, p.playhead),
      panorama = state.preview || p.playhead >= TIMING.panorama;
    return {
      ...drawVolume({ story, state, ...p }),
      clock: panorama ? "14:27–14:31" : "14:30 · 一分鐘",
      price: panorama ? "101" : state.candle ? String(state.candle.close) : "—",
      playback: panorama ? "同長度量柱 · 對照讀圖" : "每筆成交 · 計入一次",
      description: `${scenes[p.scene].label}。每根代表一分鐘。14:30 已成交 ${state.volume} 隻，${state.trades.length} 筆；不是人數。掛單 80 隻不計入量柱。完成量柱依序為 24、30、36、60、15 隻。前三根平均30；60是其兩倍，15是其一半。配色跟隨每根開收漲跌，不代表主動買賣量。`,
    };
  },
});
