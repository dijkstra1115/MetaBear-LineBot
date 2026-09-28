import {
  createOpenInterestStory,
  openInterestSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  formatClock,
  positionLabel,
} from "./open-interest-model.js";
import { scenes, narrativeAt } from "./open-interest-script.js";
import { drawOpenInterest } from "./open-interest-view.js";
import { mountStory } from "./story-player.js";
const story = createOpenInterestStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = openInterestSnapshot(story, p.playhead),
      active = state.active;
    return {
      ...drawOpenInterest({ ...p, state }),
      clock: formatClock(p.playhead),
      price: `${state.oi} 口`,
      playback: state.replay ? "14:30 選段回看" : "已完成的模擬行情",
      description: state.replay
        ? `${scenes[p.scene].label}。第 ${active.index + 1} 筆：買方 ${active.buyer} ${active.buyerLabel}，賣方 ${active.seller} ${active.sellerLabel}。${state.executed ? `已成交 1 口，OI ${active.before.oi} 變為 ${active.after.oi}` : `尚未重播此筆成交，OI ${state.oi}`}。買方持倉${positionLabel(state.positions[active.buyer] ?? 0)}，賣方持倉${positionLabel(state.positions[active.seller] ?? 0)}。本段累計成交 ${state.volume} 口。`
        : "已完成的五根模擬 K 線及其下方 OI 折線。選中 14:30 的四筆成交，OI 依序 2 到 3、3 到 2、2 到 2、2 到 2。圖中成交價格、K 線與 OI 來自同一份可追溯歷史。",
    };
  },
});
