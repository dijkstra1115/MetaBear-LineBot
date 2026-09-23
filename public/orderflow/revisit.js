import {
  createRevisitStory,
  revisitSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  formatClock,
  footprint,
  passiveAt,
} from "./revisit-model.js";
import { scenes, narrativeAt } from "./revisit-script.js";
import { drawRevisit, formatQuantity as formatSize } from "./revisit-view.js";
import { formatPrice } from "./wick-view.js";
import { mountStory } from "./story-player.js";

const story = createRevisitStory();
let stateTime = -1,
  state;
const labels = {
  preview: "後續半分鐘 · 快轉",
  rewind: "時間倒回",
  approach: "靠近上次承接",
  "first-print": "逐筆回看 · 慢放",
  footprint: "成交逐筆累積 · 慢放",
  profile: "整理同一批成交 · 行情暫停",
  return: "後續行情 · 14:33",
  heatmap: "掛單與成交 · 同步慢放",
  break: "逐筆慢放 · 跨過價位",
  after: "雙向成交繼續 · 退回全景",
  "recap-rewind": "回看同一段 · 時間倒回",
  recap: "回看同一段 · 2×",
};
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  previousStory: "./wick.html#scene-12",
  nextStory: "./delta.html",
  render(p) {
    if (p.time !== stateTime) {
      state = revisitSnapshot(story, p.time);
      stateTime = p.time;
    }
    const chart = drawRevisit({ story, state, ...p });
    const historical = footprint(state).find((r) => r.price === 68420.5);
    return {
      ...chart,
      clock: formatClock(p.time),
      price: formatPrice(state.price),
      playback: labels[p.mode],
      description: `${scenes[p.scene].label}。${formatClock(p.time)}，最新成交 ${formatPrice(state.price)}。${p.time >= 60000 && ![1, 2, 3].includes(p.scene) ? "14:33 的一分鐘 K 線仍在形成。" : "回看 14:32 的 K 線。"}${p.scene >= 2 ? `選定 14:32:50–14:33:00，101 已成交 ${formatSize(historical?.volume ?? 0)} 隻。` : ""}${p.scene >= 4 && p.scene <= 6 ? `此刻 101 可見被動買量 ${formatSize(passiveAt(state))} 隻。` : ""}`,
    };
  },
});
