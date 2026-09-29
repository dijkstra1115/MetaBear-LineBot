import {
  createFootprintStory,
  footprintSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  formatClock,
  TIMING,
} from "./footprint-model.js";
import { scenes, narrativeAt } from "./footprint-script.js";
import { drawFootprint, cameraAt } from "./footprint-view.js";
import { mountStory } from "./story-player.js";

const story = createFootprintStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = footprintSnapshot(story, p.time);
    const { preview } = cameraAt(p.playhead, p.reduced);
    const panorama = p.scene === 0 || p.playhead >= TIMING.panorama;
    const rows = state.rows
      .map((r) => `${r.price} 元：主動賣出 ${r.sell} 隻、主動買入 ${r.buy} 隻`)
      .join("；");
    return {
      ...drawFootprint({ story, state, ...p }),
      eyebrow:
        p.playhead >= TIMING.zoomOut
          ? "回到全景 · 同樣的讀法"
          : scenes[p.scene].eyebrow,
      clock: panorama
        ? "14:28–14:32"
        : preview
          ? "14:30 · 已收盤"
          : formatClock(p.time),
      price: panorama
        ? String(story.context.at(-1).price)
        : preview
          ? String(story.context[2].price)
          : state.price === null
            ? "—"
            : String(state.price),
      playback: panorama
        ? "完整足跡 · 行情全景"
        : preview
          ? "靠近後，回看形成過程"
          : p.time >= 60000
            ? "這分鐘的成交已記錄"
            : "逐筆成交 · 同步累加",
      description: preview
        ? "14:28 至 14:32 五根已完成的一分鐘足跡圖。選中 14:30 這一根，接著回看它的成交形成過程。"
        : `${scenes[p.scene].label}。${formatClock(p.time)}。${rows || "這分鐘尚未成交"}。數字代表已成交隻數。${p.playhead >= TIMING.zoomOut ? "鏡頭退回原來五根足跡圖的全景，14:30 的成交紀錄保留。" : ""}`,
    };
  },
});
