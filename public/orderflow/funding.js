import {
  createFundingStory,
  fundingSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  formatClock,
  rateLabel,
  signed,
} from "./funding-model.js";
import { scenes, narrativeAt } from "./funding-script.js";
import { drawFunding } from "./funding-view.js";
import { mountStory } from "./story-player.js";
const story = createFundingStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = fundingSnapshot(story, p.playhead);
    return {
      ...drawFunding({ ...p, state }),
      clock: formatClock(p.playhead),
      price: rateLabel(state.rate),
      playback: state.settled ? "本次已結算" : "等待結算時點",
      description: `${scenes[p.scene].label}。多空各持有 10,000 USDT 部位，本次費率 ${rateLabel(state.rate)}。${state.settled ? `${state.payer === "long" ? "多方付空方" : "空方付多方"} ${state.amount} USDT。` : "尚未到本次結算時點，未記入本次收支。"}本段資金費收支：多方 ${signed(state.longNet)} USDT，空方 ${signed(state.shortNet)} USDT。數字不是保證金餘額，結算間隔依合約而異。`,
    };
  },
});
