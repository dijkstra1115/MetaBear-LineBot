import {
  createOrderBlockStory,
  orderBlockSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  formatClock,
} from "./order-block-model.js";
import { scenes, narrativeAt } from "./order-block-script.js";
import { drawOrderBlock } from "./order-block-view.js";
import { mountStory } from "./story-player.js";
const story = createOrderBlockStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = orderBlockSnapshot(story, p.playhead);
    return {
      ...drawOrderBlock({ ...p, state }),
      clock: formatClock(p.playhead),
      price: `${state.lastPrice} 元`,
      playback: state.replay ? "選段成交回看" : "已完成的模擬行情",
      description: state.replay
        ? `${scenes[p.scene].label}。具名買家 A 目標買入 80 隻，目前被動承接 ${state.execution.passiveFilled}，主動買入 ${state.execution.aggressiveFilled}，剩餘 ${state.execution.remaining} 隻。14:30 成交量 ${state.originVolume}，14:31 成交量 ${state.impulseVolume}。最新成交 ${state.lastPrice} 元。${state.confirmed ? "14:31 收盤 107 越過既有前高 105。" : "回看成交中。"}${state.zoneVisible ? "訂單塊標示 101 至 104 元。" : ""}`
        : `已完成的 11 根模擬一分鐘 K 線全景，所有 K 由相同逐筆成交推導。${state.zoneVisible ? "保留 14:30 K 的 101 至 104 元區域；確認時刻是下一根 K 收盤越過既有前高 105。" : "定位 14:30 與 14:31，準備回看它們的成交過程。"}`,
    };
  },
});
