import { legacySize as formatSize } from "./bear-market.js";
import {
  createDeltaStory,
  deltaSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  totals,
  passiveSell,
} from "./delta-model.js";
import { scenes, narrativeAt } from "./delta-script.js";
import { drawDelta } from "./delta-view.js";
import { formatClock } from "./revisit-model.js";
import { formatPrice } from "./wick-view.js";
import { mountStory } from "./story-player.js";

const story = createDeltaStory();
let stateTime = -1,
  state;
const labels = {
  preview: "後續行情 · 快轉",
  rewind: "時間倒回 · 14:33:30",
  count: "逐筆成交 · 慢放",
  build: "成交與累計差額 · 同步回放",
  diverge: "價格與 CVD · 同步回放",
  "depth-rewind": "回看補量 · 時間倒回",
  depth: "同一段行情 · 被動賣單補入",
  fall: "接續行情 · 主動賣出",
  positive: "成交繼續 · 統計起點不變",
  "recap-rewind": "回看同一段 · 時間倒回",
  recap: "回看同一段 · 2×",
};
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  previousStory: "./revisit.html#scene-9",
  render(p) {
    if (stateTime !== p.time) {
      state = deltaSnapshot(story, p.time);
      stateTime = p.time;
    }
    const count = totals(state, p.time);
    return {
      ...drawDelta({ story, state, ...p }),
      clock: formatClock(p.time),
      price: formatPrice(state.price),
      playback: labels[p.mode],
      description: `${scenes[p.scene].label}。${formatClock(p.time)}，最新成交 ${formatPrice(state.price)}。14:33 的一分鐘 K 線尚未收盤；成交價圖放大最近的走勢。${p.scene > 0 ? `自 14:33:30 累計主動買入 ${formatSize(count.buy)}、主動賣出 ${formatSize(count.sell)} 隻，差額 ${formatSize(count.delta)} 隻。` : ""}${p.mode === "depth" ? `101 可見被動掛賣 ${formatSize(passiveSell(state))} 隻。` : ""}`,
    };
  },
});
