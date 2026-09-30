// Headless export harness: renders a motion lesson at 1920×1080 with captions
// burned in, for MP4 export by motion/tools/render.mjs.
import { fontUsage } from "../../public/orderflow/motion/core.js";
import { createCompositor, preloadLessonFonts } from "../../public/orderflow/motion/compositor.js";

const params = new URLSearchParams(location.search);
const id = params.get("lesson");
const canvas = document.getElementById("stage");
const comp = createCompositor(canvas, { width: 1920 });
const { lesson } = await import(`../../public/orderflow/motion/lessons/${id}.js`);

window.TOTAL = lesson.duration;
window.renderFrame = (t, frame) => comp.render(lesson, t, frame, { captions: params.get("captions") !== "0" });
window.ready = (async () => {
  await preloadLessonFonts(lesson, fontUsage, 0.25);
  await document.fonts.ready;
  window.renderFrame(0, 0);
  return true;
})();
