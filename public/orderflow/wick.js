import { scenes, narrativeAt } from "./wick-script.js";
import {
  createWickStory,
  wickSnapshot,
  scenePosition,
  SCENE_DURATIONS,
  continuationCamera,
} from "./wick-model.js";
import { drawWick, formatPrice, formatSize } from "./wick-view.js";

const story = createWickStory();
const $ = (selector) => document.querySelector(selector);
const mobile = matchMedia("(max-width:650px)");
const reduced = matchMedia("(prefers-reduced-motion:reduce)");

let scene = 0,
  elapsed = 0,
  running = false,
  paused = false,
  raf = 0,
  last = 0;
let state = wickSnapshot(story, 0),
  stateTime = -1;

function draw() {
  const p = scenePosition(scene, elapsed, reduced.matches);
  if (p.time !== stateTime) {
    state = wickSnapshot(story, p.time);
    stateTime = p.time;
  }
  const chart = drawWick({
    story,
    state,
    ...p,
    mobile: mobile.matches,
    reduced: reduced.matches,
    settled: p.progress === 1,
  });
  $("#market").setAttribute("viewBox", chart.viewBox);
  $("#market").style.aspectRatio = `${chart.width} / ${chart.height}`;
  $("#clip-rect").setAttribute("width", chart.width);
  $("#clip-rect").setAttribute("height", chart.height);
  $("#world").innerHTML = chart.svg;
  const seconds = Math.min(60000, p.time);
  $("#market-clock").textContent =
    seconds >= 60000
      ? "14:33:00.00"
      : "14:32:" + (seconds / 1000).toFixed(2).padStart(5, "0");
  $("#last-price").textContent = formatPrice(state.price);
  const scrubber = $("#scene-progress");
  scrubber.max = SCENE_DURATIONS[scene];
  scrubber.value = elapsed;
  scrubber.style.setProperty("--progress", `${p.progress * 100}%`);
  const position = `${formatElapsed(elapsed)} / ${formatElapsed(SCENE_DURATIONS[scene])}`;
  $("#elapsed-label").textContent = position;
  scrubber.setAttribute("aria-valuetext", `本幕 ${position}`);
  const labels = {
    overview: "一分鐘快轉 · 6×",
    rewind: "時間倒回",
    approach: "靠近起點",
    quotes: "回看掛單 · 慢放",
    execution: "回看成交 · 0.5×",
    absorption: "回看補量 · 慢放",
    depletion: "沿著同一價位 · 慢放",
    ascent: elapsed < 4200 ? "逐筆慢放 · 變速回看" : "跟隨成交 · 變速回看",
    "high-absorption": elapsed < 1600 ? "靠近高點" : "回看高處補量 · 慢放",
    "bid-depth": "回看被動買單 · 慢放",
    descent: elapsed < 4700 ? "逐筆慢放 · 變速回看" : "跟隨主動賣出 · 變速回看",
    support: "回看下方承接 · 慢放",
    closing: elapsed < 1800 ? "最後幾筆成交 · 慢放" : "退回全景 · 慢放",
    "recap-rewind": "回看同一分鐘 · 時間倒回",
    recap: "回看同一分鐘 · 3⅓×",
  };
  $("#playback-label").textContent = paused
    ? "已暫停"
    : running
      ? labels[p.mode]
      : "本幕已播完";
  $("#lens-label").textContent =
    scene >= 9
      ? scene === 9
        ? "主動賣出與被動買單補入，交錯發生。"
        : scene === 10
          ? "最高成交留下影線，最後成交決定收盤。"
          : p.mode === "recap-rewind"
            ? "同一段行情，回到起點再看一次。"
            : "同一份成交，同一根 K 線。"
      : scene >= 6
        ? scene === 6
          ? "被動賣單補回，在高處再次出現。"
          : scene === 7
            ? "被動買單在等待，主動賣出才會和它成交。"
            : "當段主動賣出累計，對照上衝時的主動買入。"
        : scene >= 3
          ? scene === 3
            ? "主動買入與被動賣單補入，交錯發生。"
            : scene === 4
              ? "同一個價位，等待成交的被動賣單逐漸減少。"
              : elapsed < 10500
                ? "鏡頭跟隨已發生的成交，向上移動。"
                : "退開一點，看見這一段上漲。"
          : p.mode === "rewind"
            ? "先回到這一分鐘的起點"
            : p.zoom < 0.5
              ? "一根 K 線 · 一分鐘"
              : scene === 1
                ? "被動掛單更新，尚未把價格往上推。"
                : "Taker 主動成交 ↔ Maker 先掛單等待";
  document.body.dataset.scene = String(scene + 1);
  document.body.dataset.mode = p.mode;
  document.body.dataset.running = String(running);
  document.body.dataset.paused = String(paused);
}
function describe() {
  const p = scenePosition(scene, elapsed, reduced.matches);
  const quotesVisible =
    p.zoom >= 0.95 &&
    (p.mode !== "closing" || elapsed < (reduced.matches ? 1800 : 900)) &&
    (!["ascent", "high-absorption"].includes(p.mode) ||
      continuationCamera(state, p.time, p.elapsed, p.mode, reduced.matches)
        .wide < 0.5);
  $("#chart-description").textContent =
    `${scenes[scene].label}。${$("#market-clock").textContent}，最新成交 ${formatPrice(state.price)}。K 線開 ${formatPrice(state.candle.open)}、高 ${formatPrice(state.candle.high)}、低 ${formatPrice(state.candle.low)}、目前收 ${formatPrice(state.candle.close)}。` +
    (quotesVisible
      ? `最近被動賣單 ${formatPrice(state.asks[0].price)}，可見數量 ${formatSize(state.asks[0].size)} 隻；最近被動買單 ${formatPrice(state.bids[0].price)}，可見數量 ${formatSize(state.bids[0].size)} 隻。`
      : "");
}
function controls() {
  $("#back").disabled = false;
  $("#back").textContent = scene === 0 ? "← 上一個故事" : "← 上一幕";
  $("#pause").disabled = !running;
  $("#pause").textContent = paused ? "繼續" : "暫停";
  $("#pause").setAttribute("aria-pressed", String(paused));
  const final = scene === scenes.length - 1;
  $("#next").disabled = running;
  $("#next").innerHTML =
    (running
      ? paused
        ? "本幕未完"
        : "播放中"
      : final
        ? "下一個故事"
        : "下一幕") +
    '<span aria-hidden="true">' +
    "↗" +
    "</span>";
}
function copy() {
  const s = scenes[scene];
  $("#scene-label").textContent =
    String(scene + 1).padStart(2, "0") + " — " + s.label;
  $("#eyebrow").textContent = s.eyebrow;
  narrate();
  document.querySelectorAll(".scene-route li").forEach((item, index) => {
    item.classList.toggle("visited", index < scene);
    if (index === scene) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
}
function formatElapsed(ms) {
  return `00:${(ms / 1000).toFixed(1).padStart(4, "0")}`;
}
function narrate() {
  const current = narrativeAt(scene, elapsed, reduced.matches);
  let changed = false;
  for (const key of ["headline", "question"]) {
    if ($(`#${key}`).textContent !== current[key]) {
      $(`#${key}`).textContent = current[key];
      changed = true;
    }
  }
  return changed;
}
function tick(now) {
  if (!running || paused) return;
  elapsed = Math.min(
    SCENE_DURATIONS[scene],
    elapsed + Math.min(100, now - last),
  );
  last = now;
  if (elapsed === SCENE_DURATIONS[scene]) {
    running = false;
    paused = false;
  }
  draw();
  // Derive copy from the current time, so backwards seeks remove later revelations.
  if (narrate()) describe();
  if (!running) {
    controls();
    copy();
    describe();
  } else raf = requestAnimationFrame(tick);
}
function cancel() {
  cancelAnimationFrame(raf);
  running = false;
  paused = false;
}
function openScene(next, { play = true } = {}) {
  cancel();
  scene = next;
  elapsed = play ? 0 : SCENE_DURATIONS[scene];
  running = play;
  copy();
  controls();
  draw();
  describe();
  if (play) {
    if (mobile.matches && window.scrollY > 80)
      $(".scene-meta").scrollIntoView({ block: "start" });
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}
function togglePause() {
  if (!running) return;
  paused = !paused;
  cancelAnimationFrame(raf);
  if (!paused) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  controls();
  draw();
  describe();
}
function seekTo(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return;
  cancel();
  elapsed = Math.max(0, Math.min(SCENE_DURATIONS[scene], next));
  running = elapsed < SCENE_DURATIONS[scene];
  paused = running;
  draw();
  narrate();
  controls();
  describe();
}
$("#scene-progress").addEventListener("pointerdown", () => {
  if (running && !paused) togglePause();
});
$("#scene-progress").addEventListener("input", (event) =>
  seekTo(event.currentTarget.value),
);
$("#next").addEventListener("click", () => {
  if (!running && scene < scenes.length - 1) openScene(scene + 1);
  else if (!running) location.href = "./revisit.html";
});
$("#back").addEventListener("click", () => {
  if (scene > 0) openScene(scene - 1);
  else location.href = "./matching.html#scene-8";
});
$("#pause").addEventListener("click", togglePause);
mobile.addEventListener("change", draw);
reduced.addEventListener("change", draw);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && running && !paused) togglePause();
});
window.addEventListener("pagehide", () => {
  cancelAnimationFrame(raf);
  if (running) {
    paused = true;
    controls();
  }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    controls();
    draw();
    describe();
  }
});
// Review links can resume at a known scene without adding a lesson-selection UI.
function linkedScene() {
  const match = /^#scene-(\d+)$/.exec(location.hash);
  const index = match ? Number(match[1]) - 1 : -1;
  return Number.isInteger(index) && index >= 0 && index < scenes.length
    ? index
    : null;
}
window.addEventListener("hashchange", () => {
  const next = linkedScene();
  if (next !== null) openScene(next);
});
openScene(linkedScene() ?? 0);
if (document.hidden && running && !paused) togglePause();
