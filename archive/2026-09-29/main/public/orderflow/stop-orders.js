import {
  createStopOrdersStory,
  stopOrdersSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "./stop-orders-model.js";
import { scenes, narrativeAt } from "./stop-orders-script.js";
import { drawStopOrders } from "./stop-orders-view.js";
import { mountStory } from "./story-player.js";
const story = createStopOrdersStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = stopOrdersSnapshot(story, p.playhead),
      current = state.current;
    return {
      ...drawStopOrders({ ...p, state }),
      clock: `00:${String(Math.floor(p.playhead / 1000)).padStart(2, "0")}`,
      price: current.price ?? "—",
      playback: state.rewinding
        ? "回到同一起點"
        : state.kind === "market"
          ? "市價止損 · 先完整演一次"
          : "限價止損 · 同一行情重演",
      description: `${scenes[p.scene].label}。目前為${state.kind === "market" ? "市價" : "限價"}止損情境。最新成交 ${current.price} 元，最佳掛買 ${current.bestBid} 元。${current.triggered ? "已觸發" : "未觸發"}，${current.submitted ? "已送單" : "尚未送單"}。已賣 ${current.filled} 隻，均價 ${current.avg?.toFixed(2) ?? "尚無"} 元，剩餘 ${current.remaining} 隻。觸發價 99 元不是保證成交價；限價情境的最低賣價是 ${state.limitPrice} 元，目前掛賣等待 ${current.resting} 隻。`,
    };
  },
});
