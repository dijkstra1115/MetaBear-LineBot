import {
  createDeltaConceptStory,
  deltaConceptSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "./delta-concept-model.js";
import { scenes, narrativeAt } from "./delta-concept-script.js";
import { drawDeltaConcept } from "./delta-concept-view.js";
import { mountStory } from "./story-player.js";
const story = createDeltaConceptStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = deltaConceptSnapshot(story, p.playhead);
    return {
      ...drawDeltaConcept({ story, state, ...p }),
      clock: "14:30–14:33",
      price: "102",
      playback: "已完成成交 · 逐段計算",
      description: `${scenes[p.scene].label}。三個等長一分鐘，主動買賣量分別40與15、10與20、25與10；Delta分別+25、−10、+15。本例CVD於14:30由0起算，逐分鐘累計25、15、30。目前呈現 ${state.deltaCount} 段Delta及 ${state.cvdCount} 個CVD收盤點。統計單位為實際成交隻數。`,
    };
  },
});
