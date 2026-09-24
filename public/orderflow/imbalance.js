import {
  createImbalanceStory,
  imbalanceSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "./imbalance-model.js";
import { scenes, narrativeAt } from "./imbalance-script.js";
import { drawImbalance } from "./imbalance-view.js";
import { mountStory } from "./story-player.js";
const story = createImbalanceStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = imbalanceSnapshot(story, p.playhead);
    return {
      ...drawImbalance({ story, state, ...p }),
      clock: "14:30 · 已完成足跡",
      price: "104",
      playback: "已成交數據 · 解讀標記",
      description: `${scenes[p.scene].label}。本例比較買方對角：較高價Ask成交量除以低一檔Bid成交量，門檻至少3倍，零分母不計。四組為30除以10等於3、40除以10等於4、15除以10等於1.5、12除以0不計；最後只標記101與102的買方格。所有足跡已完成，本課逐組解讀成交數量的比例。門檻、零量處理及資料分類依平台設定。`,
    };
  },
});
