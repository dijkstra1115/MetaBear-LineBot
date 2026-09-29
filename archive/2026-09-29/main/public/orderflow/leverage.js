import {
  createLeverageStory,
  leverageSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  formatClock,
} from "./leverage-model.js";
import { scenes, narrativeAt } from "./leverage-script.js";
import { drawLeverage } from "./leverage-view.js";
import { mountStory } from "./story-player.js";

const story = createLeverageStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = leverageSnapshot(story, p.playhead);
    return {
      ...drawLeverage({ ...p, state }),
      clock: formatClock(p.playhead),
      price: String(state.price),
      playback: "保證金與部位 · 同步比較",
      description: `${scenes[p.scene].label}。教學用線性做多合約，開倉價 100 元，目前價格 ${state.price} 元。${state.accounts.map((a, i) => `比較 ${i + 1}：保證金 ${a.margin} 元，槓桿 ${a.leverage} 倍，部位 ${a.quantity} 隻，未實現損益 ${a.pnl} 元`).join("。")}。不含費用。`,
    };
  },
});
