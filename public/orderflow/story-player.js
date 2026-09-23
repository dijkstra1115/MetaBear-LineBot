// A scene is a pure function of elapsed time. Pausing and scrubbing therefore
// seek the market, camera, annotations and narration together in either direction.
export function mountStory({
  scenes,
  durations,
  position,
  narrative,
  render,
  previousStory = null,
  nextStory = null,
}) {
  const $ = (s) => document.querySelector(s);
  const reduced = matchMedia("(prefers-reduced-motion:reduce)");
  const mobile = matchMedia("(max-width:650px)");
  let scene = 0,
    elapsed = 0,
    paused = false,
    raf = 0,
    last = 0;
  const complete = () => elapsed >= durations[scene];
  const elapsedText = (ms) => `00:${(ms / 1000).toFixed(1).padStart(4, "0")}`;

  function draw() {
    const p = {
      ...position(scene, elapsed, reduced.matches),
      mobile: mobile.matches,
    };
    const result = render(p);
    $("#market").setAttribute("viewBox", result.viewBox ?? "0 0 1000 430");
    $("#clip-rect").setAttribute("width", result.width ?? 1000);
    $("#clip-rect").setAttribute("height", result.height ?? 430);
    $("#market").style.aspectRatio =
      `${result.width ?? 1000} / ${result.height ?? 430}`;
    $("#world").innerHTML = result.svg;
    $("#market-clock").textContent = result.clock;
    $("#last-price").textContent = result.price;
    $("#lens-label").textContent = result.mobileLens ?? scenes[scene].lens;
    $("#playback-label").textContent = complete()
      ? "本幕已播完"
      : paused
        ? "已暫停"
        : result.playback;
    $("#chart-description").textContent = result.description;
    const current = narrative(scene, elapsed, reduced.matches);
    for (const key of ["headline", "question"]) {
      if ($(`#${key}`).textContent !== current[key])
        $(`#${key}`).textContent = current[key];
    }
    const scrubber = $("#scene-progress");
    scrubber.max = durations[scene];
    scrubber.value = elapsed;
    scrubber.style.setProperty("--progress", `${p.progress * 100}%`);
    const label = `${elapsedText(elapsed)} / ${elapsedText(durations[scene])}`;
    $("#elapsed-label").textContent = label;
    scrubber.setAttribute("aria-valuetext", `本幕 ${label}`);
    document.body.dataset.scene = String(scene + 1);
    document.body.dataset.mode = p.mode;
    document.body.dataset.running = String(!complete());
    document.body.dataset.paused = String(paused);
  }
  function controls() {
    $("#back").disabled = scene === 0 && !previousStory;
    $("#back").textContent =
      scene === 0 && previousStory ? "← 上一個故事" : "← 上一幕";
    $("#pause").disabled = complete();
    $("#pause").textContent = paused ? "繼續" : "暫停";
    $("#pause").setAttribute("aria-pressed", String(paused));
    const final = scene === scenes.length - 1;
    $("#next").disabled = !complete() || (final && !nextStory);
    $("#next").innerHTML =
      (complete()
        ? final
          ? nextStory
            ? "下一個故事"
            : "故事完成"
          : "下一幕"
        : paused
          ? "本幕未完"
          : "播放中") +
      `<span aria-hidden="true">${complete() && final && !nextStory ? "✓" : "↗"}</span>`;
  }
  function tick(now) {
    if (paused || complete()) return;
    elapsed = Math.min(durations[scene], elapsed + Math.min(100, now - last));
    last = now;
    draw();
    if (complete()) controls();
    else raf = requestAnimationFrame(tick);
  }
  function openScene(next) {
    cancelAnimationFrame(raf);
    scene = next;
    elapsed = 0;
    paused = false;
    $("#scene-label").textContent =
      `${String(scene + 1).padStart(2, "0")} — ${scenes[scene].label}`;
    $("#eyebrow").textContent = scenes[scene].eyebrow;
    document.querySelectorAll(".scene-route li").forEach((item, i) => {
      item.classList.toggle("visited", i < scene);
      if (i === scene) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    draw();
    controls();
    if (mobile.matches && window.scrollY > 80)
      $(".scene-meta").scrollIntoView({ block: "start" });
    last = performance.now();
    raf = requestAnimationFrame(tick);
    if (document.hidden) togglePause();
  }
  function togglePause() {
    if (complete()) return;
    paused = !paused;
    cancelAnimationFrame(raf);
    if (!paused) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    draw();
    controls();
  }
  function seekTo(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    cancelAnimationFrame(raf);
    elapsed = Math.max(0, Math.min(durations[scene], next));
    paused = !complete();
    draw();
    controls();
  }
  $("#scene-progress").addEventListener("pointerdown", () => {
    if (!complete() && !paused) togglePause();
  });
  $("#scene-progress").addEventListener("input", (event) =>
    seekTo(event.currentTarget.value),
  );
  $("#pause").addEventListener("click", togglePause);
  $("#back").addEventListener("click", () => {
    if (scene > 0) openScene(scene - 1);
    else if (previousStory) location.href = previousStory;
  });
  $("#next").addEventListener("click", () => {
    if (complete() && scene < scenes.length - 1) openScene(scene + 1);
    else if (complete() && nextStory) location.href = nextStory;
  });
  reduced.addEventListener("change", draw);
  mobile.addEventListener("change", draw);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && !complete() && !paused) togglePause();
  });
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(raf);
    if (!complete()) paused = true;
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      draw();
      controls();
    }
  });
  function linkedScene() {
    const match = /^#scene-(\d+)$/.exec(location.hash);
    const index = match ? Number(match[1]) - 1 : -1;
    return Number.isInteger(index) && index >= 0 && index < scenes.length
      ? index
      : null;
  }
  window.addEventListener("hashchange", () => {
    const n = linkedScene();
    if (n !== null) openScene(n);
  });
  openScene(linkedScene() ?? 0);
}
