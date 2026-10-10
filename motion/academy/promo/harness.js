// Promo harness: ?fmt=wide (1920×1080) | tall (1080×1920). Exposes the same
// window.TOTAL / renderFrame / ready contract motion/tools/render.mjs expects;
// ?preview plays it in real time with the soundtrack and a scrubber.
import { fontUsage } from "../../../public/orderflow/motion/core.js";
import { preloadLessonFonts } from "../../../public/orderflow/motion/compositor.js";
import { courses, isAvailable } from "../../../public/orderflow/academy-catalog.js";
import { makePromo, DURATION } from "./promo.js";
import { createPromoCompositor } from "./compose.js";

const params = new URLSearchParams(location.search);
const tall = params.get("fmt") === "tall";
const [w, h] = tall ? [1080, 1920] : [1920, 1080];
const canvas = document.getElementById("stage");
const list = courses.filter(isAvailable);
const lessons = Object.fromEntries(
  await Promise.all(
    list.map(async (c) => [c.id, (await import(`../../../public/orderflow/motion/lessons/${c.id}.js`)).lesson]),
  ),
);
const film = makePromo({ w, h, lessons, courses: list });
const comp = createPromoCompositor(canvas, w, h);

window.TOTAL = DURATION;
window.renderFrame = (t, frame) => comp.render(film, t, frame);
window.ready = (async () => {
  for (const l of Object.values(lessons)) await preloadLessonFonts(l, fontUsage, 0.5);
  // Discover the film's own glyphs on a scratch canvas, then load those subsets.
  const scratch = document.createElement("canvas");
  scratch.width = scratch.height = 8;
  const sctx = scratch.getContext("2d");
  for (let t = 0; t <= DURATION; t += 0.25) {
    sctx.save();
    film.draw(sctx, t);
    sctx.restore();
  }
  await Promise.allSettled([...fontUsage].map(([font, chars]) => document.fonts.load(font, [...chars].join(""))));
  await document.fonts.ready;
  window.renderFrame(0, 0);
  return true;
})();

if (params.has("preview")) {
  await window.ready;
  const hud = document.getElementById("hud");
  const scrub = document.getElementById("scrub");
  const time = document.getElementById("time");
  hud.hidden = false;
  const audio = new Audio("./out/promo.wav");
  let playing = false;
  let t = 0;
  let last = 0;
  const loop = (now) => {
    if (playing) {
      t = Math.min(DURATION, t + (now - last) / 1000);
      if (t >= DURATION) playing = false;
    }
    last = now;
    comp.render(film, t, Math.round(t * 60));
    scrub.value = t;
    time.textContent = t.toFixed(2);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const toggle = () => {
    playing = !playing;
    if (playing) {
      audio.currentTime = t;
      audio.play().catch(() => {});
    } else audio.pause();
  };
  canvas.addEventListener("click", toggle);
  addEventListener("keydown", (e) => e.key === " " && (e.preventDefault(), toggle()));
  scrub.addEventListener("input", () => {
    t = Number(scrub.value);
    audio.currentTime = t;
  });
}
