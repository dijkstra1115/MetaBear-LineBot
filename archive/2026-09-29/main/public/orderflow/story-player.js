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
  continuousDesktop = false,
  desktopSceneHold = 0,
  completionLabel = "故事完成",
}) {
  const $ = (s) => document.querySelector(s);
  const reduced = matchMedia("(prefers-reduced-motion:reduce)");
  const mobile = matchMedia("(max-width:650px)");
  let scene = 0,
    elapsed = 0,
    paused = false,
    raf = 0,
    last = 0;
  // The historic option name is retained for existing lessons. The same
  // timeline now runs on phones, so rotating never changes its duration.
  const continuous = () => continuousDesktop;
  const offsets = durations.map((_, i) =>
    durations.slice(0, i).reduce((a, b) => a + b, 0),
  );
  const baseTotal = durations.reduce((a, b) => a + b, 0);
  const hold = () => (continuous() ? desktopSceneHold : 0);
  const durationAt = (index) => durations[index] + hold();
  const offsetAt = (index) => offsets[index] + index * hold();
  const totalDuration = () => baseTotal + durations.length * hold();
  const complete = () => elapsed >= durationAt(scene);
  const elapsedText = (ms) =>
    `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${((ms % 60000) / 1000).toFixed(1).padStart(4, "0")}`;

  function draw() {
    const p = {
      ...position(scene, elapsed, reduced.matches),
      // Continuous lessons share one camera and market history across layouts.
      mobile: mobile.matches && !continuous(),
    };
    const result = render(p);
    for (const [id, value] of [
      ["eyebrow", result.eyebrow ?? scenes[scene].eyebrow],
      [
        "scene-label",
        `${String(scene + 1).padStart(2, "0")} — ${result.sceneLabel ?? scenes[scene].label}`,
      ],
    ]) {
      if ($(`#${id}`).textContent !== value) $(`#${id}`).textContent = value;
    }
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
      ? continuous() && scene === scenes.length - 1
        ? "本課已播完"
        : "本幕已播完"
      : paused
        ? "已暫停"
        : result.playback;
    $("#chart-description").textContent = result.description;
    const current = narrative(scene, elapsed, reduced.matches, p.mobile);
    for (const key of ["headline", "question"]) {
      if ($(`#${key}`).textContent !== current[key])
        $(`#${key}`).textContent = current[key];
    }
    const scrubber = $("#scene-progress");
    const duration = continuous() ? totalDuration() : durations[scene];
    const currentTime = continuous() ? offsetAt(scene) + elapsed : elapsed;
    scrubber.max = duration;
    scrubber.value = currentTime;
    scrubber.style.setProperty(
      "--progress",
      `${(currentTime / duration) * 100}%`,
    );
    const label = `${elapsedText(currentTime)} / ${elapsedText(duration)}`;
    $("#elapsed-label").textContent = label;
    scrubber.setAttribute(
      "aria-label",
      continuous() ? "整課播放進度" : "本幕播放進度",
    );
    scrubber.setAttribute(
      "aria-valuetext",
      `${continuous() ? "整課" : "本幕"} ${label}`,
    );
    $("#seek-hint").textContent =
      `拖曳或用方向鍵調整${continuous() ? "整課" : "本幕"}進度。調整後暫停，按繼續播放。`;
    document.body.dataset.scene = String(scene + 1);
    document.body.dataset.mode = p.mode;
    document.body.dataset.running = String(!complete());
    document.body.dataset.paused = String(paused);
  }
  function controls() {
    $("#back").disabled = scene === 0 && !previousStory;
    $("#back").textContent =
      scene === 0 && previousStory ? "← 上一個故事" : "← 上一幕";
    $("#pause").disabled = complete() && !continuous();
    $("#pause").textContent =
      complete() && continuous() ? "重播本課" : paused ? "繼續" : "暫停";
    $("#pause").setAttribute("aria-pressed", String(paused));
    const final = scene === scenes.length - 1;
    $("#next").disabled =
      (!complete() && (!continuous() || final)) || (final && !nextStory);
    $("#next").innerHTML =
      (continuous() && !final
        ? "下一幕"
        : complete()
          ? final
            ? nextStory
              ? "下一個故事"
              : completionLabel
            : "下一幕"
          : paused
            ? "本幕未完"
            : "播放中") +
      `<span aria-hidden="true">${complete() && final && !nextStory ? "✓" : "↗"}</span>`;
  }
  function tick(now) {
    if (paused || complete()) return;
    elapsed = Math.min(durationAt(scene), elapsed + Math.min(100, now - last));
    last = now;
    draw();
    if (complete() && continuous() && scene < scenes.length - 1)
      openScene(scene + 1);
    else if (complete()) controls();
    else raf = requestAnimationFrame(tick);
  }
  function sceneLabels() {
    $("#scene-label").textContent =
      `${String(scene + 1).padStart(2, "0")} — ${scenes[scene].label}`;
    $("#eyebrow").textContent = scenes[scene].eyebrow;
    document.querySelectorAll(".scene-route li").forEach((item, i) => {
      item.classList.toggle("visited", i < scene);
      if (i === scene) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-story-scene]").forEach((item) => {
      const index = Number(item.dataset.storyScene);
      item.classList.toggle("visited", index < scene);
      if (index === scene) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
  }
  function openScene(next) {
    cancelAnimationFrame(raf);
    scene = next;
    elapsed = 0;
    paused = false;
    sceneLabels();
    draw();
    controls();
    last = performance.now();
    raf = requestAnimationFrame(tick);
    if (document.hidden) togglePause();
  }
  function togglePause() {
    if (complete()) {
      if (continuous()) openScene(scene === scenes.length - 1 ? 0 : scene + 1);
      return;
    }
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
    if (continuous()) {
      const time = Math.max(0, Math.min(totalDuration(), next));
      scene = offsets.findLastIndex((_, index) => time >= offsetAt(index));
      elapsed = time - offsetAt(scene);
      sceneLabels();
    } else elapsed = Math.max(0, Math.min(durations[scene], next));
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
    if ((complete() || continuous()) && scene < scenes.length - 1)
      openScene(scene + 1);
    else if (complete() && nextStory) location.href = nextStory;
  });
  $("#replay")?.addEventListener("click", () => openScene(0));
  document.querySelectorAll("[data-story-scene]").forEach((button) => {
    button.addEventListener("click", () =>
      openScene(Number(button.dataset.storyScene)),
    );
  });
  reduced.addEventListener("change", draw);
  document.addEventListener("academy:theater", draw);
  document.addEventListener("academy:pause", () => {
    if (!complete() && !paused) togglePause();
  });
  mobile.addEventListener("change", () => {
    draw();
    controls();
  });
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
