import {
  createBreakoutStory,
  breakoutSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "./breakout-model.js";
import { scenes, narrativeAt } from "./breakout-script.js";
import { drawBreakout } from "./breakout-view.js";
import { mountStory } from "./story-player.js";
const story = createBreakoutStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = breakoutSnapshot(story, p.playhead);
    return {
      ...drawBreakout({ story, state, ...p }),
      clock: state.preview ? "A / B · 已完成行情" : "A / B · 同場對照",
      price: state.preview
        ? "103 / 103"
        : state.markets.map((m) => m.price).join(" / "),
      playback: "同樣突破 · 對照掛單與成交",
      description: `${scenes[p.scene].label}。A於102起初掛賣60，B只有10；兩邊103都掛賣20。${state.markets.map((m) => `${m.id}本段主動買入${m.volume}隻，最新成交${m.price}，102剩${m.remaining102}`).join("；")}。本段成交量不含兩個市場共同的起始101元成交。最後同樣從101到103，主動買入分別65及15。本例掛單只被實際成交消耗。`,
    };
  },
});
