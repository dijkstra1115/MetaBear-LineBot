// Entry for every motion lesson page: <section class="motion-player" data-lesson="id">.
import { mountMotionLesson } from "./player.js";

const root = document.querySelector(".motion-player[data-lesson]");
if (root) {
  const id = root.dataset.lesson;
  const { lesson } = await import(`./lessons/${id}.js`);
  // Exposed for debugging and automated visual checks.
  window.motionPlayer = await mountMotionLesson(root, lesson);
}
