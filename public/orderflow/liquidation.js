import {
  createLiquidationStory,
  liquidationSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  formatClock,
  money,
  percent,
} from "./liquidation-model.js";
import { scenes, narrativeAt } from "./liquidation-script.js";
import { drawLiquidation } from "./liquidation-view.js";
import { mountStory } from "./story-player.js";
const story = createLiquidationStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = liquidationSnapshot(story, p.playhead);
    return {
      ...drawLiquidation({ ...p, state }),
      clock: formatClock(p.playhead),
      price: money(state.mark),
      playback: state.triggered ? "強平觸發瞬間" : "5 倍部位 · 保證金消耗",
      description: `${scenes[p.scene].label}。100 元保證金、5 倍槓桿、500 元開倉部位。市場跌 ${percent(state.marketDrop)}%，損失 ${money(state.loss)} 元，剩餘 ${money(state.equity)} 元。${state.triggered ? "已觸發強平，部位不再繼續演算；畫面並非結算餘額。" : "尚未觸發強平。"}教學用線性逐倉合約，假設維持率 0.5%，忽略費用；以標記價格判定。跌 20% 僅是沒有提早強平時的理論保證金耗盡點。`,
    };
  },
});
