import {
  createPrimerStory,
  primerSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  formatPrimerClock,
  candleAt,
} from "./primer-model.js";
import { scenes, narrativeAt } from "./primer-script.js";
import { drawPrimer } from "./primer-view.js";
import { mountStory } from "./story-player.js";
const story = createPrimerStory();
let stateTime = -1,
  state;
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  nextStory: "./wick.html",
  render(p) {
    if (p.time !== stateTime) {
      state = primerSnapshot(story, p.time);
      stateTime = p.time;
    }
    const c = candleAt(state, p.time, p.mode === "next-minute" ? 60000 : 0);
    const quotes = ["bids", "asks"]
      .map((key) =>
        state[key]
          .slice(0, 3)
          .map(
            (r) =>
              r.price +
              " 元掛" +
              (key === "bids" ? "買" : "賣") +
              " " +
              r.size +
              " 隻",
          )
          .join("；"),
      )
      .filter(Boolean)
      .join("。");
    const k = c
      ? "這分鐘開盤 " +
        c.open +
        "、最高 " +
        c.high +
        "、最低 " +
        c.low +
        "、" +
        (c.closed ? "收盤 " : "目前 ") +
        c.close +
        "。"
      : "下一分鐘尚未有成交。";
    const playback =
      p.mode === "close"
        ? p.time < 60000
          ? "最後 1 秒 · 慢放"
          : "這根已收盤"
        : p.mode === "next-minute" && p.time >= 64000
          ? "下一分鐘 · 快轉"
          : ["first-fill", "gap"].includes(p.mode) ||
              (p.scene < 6 &&
                state.order?.remaining > 0 &&
                p.time >= state.order.at)
            ? "撮合瞬間 · 毫秒級慢放"
            : "同一段行情 · 逐步回看";
    return {
      ...drawPrimer({ story, state, ...p }),
      clock: formatPrimerClock(p.time),
      price: String(state.price),
      playback,
      description:
        scenes[p.scene].label +
        "。最新成交 " +
        state.price +
        " 元。" +
        k +
        (p.scene < 6 ? quotes : "") +
        (p.scene < 6 && state.order
          ? "。這張委託已成交 " +
            state.order.filled +
            " 隻，剩餘 " +
            state.order.remaining +
            " 隻。"
          : ""),
    };
  },
});
