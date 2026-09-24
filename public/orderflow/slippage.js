import {
  createSlippageStory,
  slippageSnapshot,
  scenePosition,
  SCENE_DURATIONS,
} from "./slippage-model.js";
import { scenes, narrativeAt } from "./slippage-script.js";
import { drawSlippage } from "./slippage-view.js";
import { mountStory } from "./story-player.js";
const story = createSlippageStory();
mountStory({
  scenes,
  durations: SCENE_DURATIONS,
  position: scenePosition,
  narrative: narrativeAt,
  continuousDesktop: true,
  completionLabel: "本課完成",
  render(p) {
    const state = slippageSnapshot(story, p.playhead);
    return {
      ...drawSlippage({ ...p, state }),
      clock: `00:${String(Math.floor(p.playhead / 1000)).padStart(2, "0")}`,
      price: state.shallow.last?.price ?? state.deep.last?.price ?? "—",
      playback: "相同買入 · 深度對照",
      description: `${scenes[p.scene].label}。兩次各買入 30 隻，送單前最優賣價均為 101 元。深簿已成交 ${state.deep.filled} 隻，均價 ${state.deep.avg?.toFixed(2) ?? "尚無"} 元；淺簿已成交 ${state.shallow.filled} 隻，均價 ${state.shallow.avg?.toFixed(2) ?? "尚無"} 元。本例滑價相對送單前 101 元，不含手續費，無其他新增或撤單。`,
    };
  },
});
