import {
  createVolumeProfileStory,
  volumeProfileSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "./volume-profile-model.js";
import { scenes, narrativeAt } from "./volume-profile-script.js";
import { drawVolumeProfile } from "./volume-profile-view.js";
import { mountStory } from "./story-player.js";
const story = createVolumeProfileStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = volumeProfileSnapshot(story, p.playhead);
    return {
      ...drawVolumeProfile({ story, state, ...p }),
      clock: story.range,
      price: "100",
      playback: "已成交資料 · 重新分組",
      description: `${scenes[p.scene].label}。選取14:30至14:33三分鐘，原量柱40、60、40，共140隻。待歸類${state.pending}、移動中${state.inTransit}、已歸類${state.classified}，各片段只計一次。按價位累加已成交量，最終100元20、101元60、102元40、103元20；101元的60隻最多，是本範圍POC。`,
    };
  },
});
