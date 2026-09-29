// Course map, live layer: a hero reel that cycles through lesson highlights,
// poster frames stamped into every card, and a silent preview on hover.
// All frames come from the lessons' own draw(ctx, t).
import { courses } from "./academy-catalog.js";
import { createPreview, loadLesson, stampPoster, posterTime } from "./motion/preview.js";
import { initAll, motionOff } from "/mb.js";

initAll();
const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
const kicker = (c) =>
  `${c.kind === "concept" ? "CONCEPT" : "STORY"} ${c.number} · ${c.kind === "concept" ? "名詞圖解" : "市場故事"}`;

// ---------------- hero reel ----------------
const REEL = [
  ["btc-wall", 18.8, 27.6],
  ["wick", 8.2, 16.4],
  ["footprint", 5.2, 13.6],
  ["absorption-story", 21.5, 30.5],
  ["heatmap", 3.2, 11.5],
  ["order-block", 20.2, 29.4],
  ["open-interest", 6.5, 14.8],
];
const reel = document.querySelector("[data-reel]");
if (reel) {
  const canvas = reel.querySelector("[data-reel-canvas]");
  const bar = reel.querySelector("[data-reel-progress]");
  const preview = createPreview(canvas, {
    width: Math.min(1280, canvas.clientWidth * Math.min(devicePixelRatio || 1, 2)),
  });
  let i = 0;
  let visible = true;
  let running = false;
  const label = ([id]) => {
    const c = byId[id];
    reel.querySelector("[data-reel-title]").textContent = c.title;
    reel.querySelector("[data-reel-kicker]").textContent = kicker(c);
    reel.querySelector("[data-reel-link]").href = c.href;
  };
  async function run() {
    if (running) return;
    running = true;
    while (visible && !motionOff()) {
      const item = REEL[i];
      label(item);
      const done = await preview.play(item[0], item[1], item[2], {
        onTick: (p) => {
          bar.style.transform = `scaleX(${p})`;
          reel.classList.add("ready");
        },
      });
      if (!done) break;
      i = (i + 1) % REEL.length;
    }
    running = false;
  }
  async function still() {
    label(REEL[0]);
    const lesson = await preview.show(REEL[0][0], 0);
    await preview.show(REEL[0][0], posterTime(lesson));
    reel.classList.add("ready");
  }
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (!visible) preview.stop();
    else motionOff() ? still() : run();
  }).observe(reel);
  document.addEventListener("visibilitychange", () =>
    document.hidden ? preview.stop() : visible && !motionOff() && run(),
  );
}

// ---------------- card posters ----------------
const queue = [];
let busy = false;
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const canvas = queue.shift();
    if (!canvas.isConnected || canvas.classList.contains("is-ready")) continue;
    try {
      await stampPoster(canvas, canvas.dataset.poster);
      canvas.classList.add("is-ready");
    } catch {
      /* a missing lesson simply keeps the placeholder */
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  busy = false;
}
const posterIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries)
      if (e.isIntersecting) {
        posterIO.unobserve(e.target);
        queue.push(e.target);
      }
    pump();
  },
  { rootMargin: "300px 0px" },
);
const hydrate = () =>
  document.querySelectorAll("canvas[data-poster]:not(.is-ready)").forEach((c) => posterIO.observe(c));
const list = document.querySelector("#course-sections");
if (list) new MutationObserver(hydrate).observe(list, { childList: true });
hydrate();

// ---------------- hover preview ----------------
if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const scratch = document.createElement("canvas");
  const live = createPreview(scratch, { width: 640 });
  let current = null;
  const end = () => {
    if (!current) return;
    live.stop();
    const { card, canvas } = current;
    card.classList.remove("is-live");
    stampPoster(canvas, canvas.dataset.poster);
    current = null;
  };
  document.addEventListener("pointerover", async (e) => {
    const card = e.target.closest?.("a.lesson-card");
    if (!card || current?.card === card || motionOff()) return;
    end();
    const canvas = card.querySelector("canvas[data-poster]");
    if (!canvas?.classList.contains("is-ready")) return;
    current = { card, canvas };
    const token = current;
    const lesson = await loadLesson(canvas.dataset.poster);
    if (current !== token) return;
    card.classList.add("is-live");
    const t = posterTime(lesson);
    const from = Math.max(0.5, t - 4);
    const to = Math.min(lesson.duration - 0.2, t + 5);
    const ctx = canvas.getContext("2d");
    live.play(lesson.id, from, to, {
      loop: true,
      onTick: () => {
        if (current === token) ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
      },
    });
  });
  document.addEventListener("pointerout", (e) => {
    if (!current) return;
    const to = e.relatedTarget;
    if (!to || !current.card.contains(to)) end();
  });
}
