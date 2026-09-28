// Video-style player for motion lessons. The lesson is rendered live on a
// canvas from its timeline, so it behaves like a video (play, pause, scrub,
// chapters, sound, fullscreen) while staying crisp and tiny to download.
import { prefs, fontUsage } from "./core.js";
import { createCompositor, preloadLessonFonts } from "./compositor.js";
import { courses, isAvailable } from "../academy-catalog.js";

const $ = (root, sel) => root.querySelector(sel);
const clock = (s) => {
  const v = Math.max(0, s);
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`;
};
const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: preference lasts for this page only */
    }
  },
};

function el(tag, cls, attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  return e;
}

export async function mountMotionLesson(root, lesson) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  prefs.reduced = reduced.matches;
  const D = lesson.duration;
  const chapters = lesson.chapters;
  const chapterAt = (t) => chapters.findLastIndex((c) => t >= c.t - 1e-6);

  // ---------- DOM ----------
  const stage = el("div", "motion-stage");
  const canvas = el("canvas", "motion-canvas", {
    role: "img",
    "aria-label": lesson.description ?? lesson.title,
  });
  const loading = el("div", "motion-loading", { text: "載入動態課程…" });
  const bigPlay = el("button", "motion-bigplay", { type: "button", "aria-label": "播放課程" });
  bigPlay.innerHTML = '<span aria-hidden="true"></span>';
  const soundHint = el("button", "motion-soundhint", { type: "button", hidden: "" });
  soundHint.innerHTML = '<span aria-hidden="true">♪</span> 開啟聲音';
  const end = el("div", "motion-end", { hidden: "" });
  const hud = el("div", "motion-hud");
  const scrub = el("div", "motion-scrub");
  const track = el("div", "motion-track", { "aria-hidden": "true" });
  chapters.forEach((c, i) => {
    const next = chapters[i + 1]?.t ?? D;
    const seg = el("span", "motion-seg");
    seg.style.flexGrow = String(next - c.t);
    seg.append(el("i"));
    track.append(seg);
  });
  const range = el("input", "motion-range", {
    type: "range",
    min: "0",
    max: String(Math.round(D * 1000)),
    step: "10",
    value: "0",
    "aria-label": "課程播放進度",
  });
  const tip = el("span", "motion-tip", { "aria-hidden": "true" });
  scrub.append(track, range, tip);
  const bar = el("div", "motion-bar");
  const play = el("button", "motion-btn motion-play", { type: "button", "aria-label": "暫停" });
  const time = el("span", "motion-time", { text: `0:00 / ${clock(D)}` });
  const chapLabel = el("span", "motion-chapter");
  const spacer = el("span", "motion-spacer");
  const sound = el("button", "motion-btn motion-sound", { type: "button", "aria-label": "開啟聲音" });
  const full = el("button", "motion-btn motion-full", { type: "button", "aria-label": "全螢幕播放" });
  bar.append(play, time, chapLabel, spacer, sound, full);
  hud.append(scrub, bar);
  stage.append(canvas, loading, bigPlay, soundHint, end, hud);
  const caption = el("p", "motion-caption", { "aria-live": "polite" });
  root.append(stage, caption);

  const next = (() => {
    const list = courses.filter(isAvailable);
    const i = list.findIndex((c) => c.id === lesson.id);
    return i >= 0 ? list[i + 1] : null;
  })();
  end.innerHTML = "";
  const endBox = el("div", "motion-endbox");
  endBox.append(el("p", "motion-end-kicker", { text: "本課完成 ✓" }));
  const replay = el("button", "motion-endbtn", { type: "button", text: "↺ 從頭重播" });
  endBox.append(replay);
  if (next) {
    const a = el("a", "motion-endbtn motion-next", { href: next.href });
    a.innerHTML = `<small>下一課</small><strong></strong><span aria-hidden="true">→</span>`;
    a.querySelector("strong").textContent = next.title;
    endBox.append(a);
  } else {
    endBox.append(el("a", "motion-endbtn motion-next", { href: "./courses.html", text: "回到課程地圖 →" }));
  }
  end.append(endBox);

  // ---------- rendering ----------
  const comp = createCompositor(canvas, { width: 960 });
  let t = 0;
  let playing = false;
  let raf = 0;
  let last = 0;
  let lastChapter = -1;
  let lastCaption = null;
  const perf = [];

  function fitResolution() {
    const w = stage.clientWidth || 960;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = comp.quality === "low" ? 0.75 : 1;
    comp.resize(Math.min(1920, w * dpr * scale));
  }
  new ResizeObserver(() => {
    fitResolution();
    paint();
  }).observe(stage);

  function paint() {
    const t0 = performance.now();
    comp.render(lesson, t, Math.round(t * 60), { watermark: false });
    if (playing) {
      perf.push(performance.now() - t0);
      if (perf.length === 40) {
        const avg = perf.reduce((a, b) => a + b, 0) / perf.length;
        if (avg > 22 && comp.quality === "high") {
          comp.quality = "low";
          fitResolution();
        }
      }
    }
    syncUi();
  }

  function syncUi() {
    range.value = String(Math.round(t * 1000));
    range.setAttribute("aria-valuetext", `${clock(t)} / ${clock(D)}`);
    stage.style.setProperty("--progress", String(t / D));
    const segs = track.children;
    chapters.forEach((c, i) => {
      const e = chapters[i + 1]?.t ?? D;
      segs[i].style.setProperty("--fill", String(Math.max(0, Math.min(1, (t - c.t) / (e - c.t)))));
    });
    time.textContent = `${clock(t)} / ${clock(D)}`;
    const ci = chapterAt(t);
    if (ci !== lastChapter) {
      lastChapter = ci;
      chapLabel.textContent = `${String(ci + 1).padStart(2, "0")} · ${chapters[ci].label}`;
      document.querySelectorAll("[data-story-scene]").forEach((b) => {
        const i = Number(b.dataset.storyScene);
        b.classList.toggle("visited", i < ci);
        if (i === ci) b.setAttribute("aria-current", "step");
        else b.removeAttribute("aria-current");
      });
    }
    const cap = (lesson.captions ?? []).find((c) => t >= c.a && t < c.b + 0.35) ?? null;
    if (cap !== lastCaption) {
      lastCaption = cap;
      caption.classList.remove("is-in");
      caption.textContent = cap ? cap.text : "";
      if (cap) {
        void caption.offsetWidth;
        caption.classList.add("is-in");
      }
    }
    const done = t >= D - 1e-3;
    root.classList.toggle("is-playing", playing);
    root.classList.toggle("is-ended", done && !playing);
    end.hidden = !(done && !playing);
    bigPlay.hidden = playing || done;
    play.setAttribute("aria-label", playing ? "暫停" : done ? "重播" : "播放");
    play.dataset.state = playing ? "pause" : done ? "replay" : "play";
  }

  // ---------- audio ----------
  const audio = lesson.audio ? new Audio(lesson.audio) : null;
  if (audio) audio.preload = "auto";
  let muted = store.get("metabear-motion-sound") !== "on";
  function syncSound() {
    sound.dataset.state = muted ? "off" : "on";
    sound.setAttribute("aria-label", muted ? "開啟聲音" : "關閉聲音");
    soundHint.hidden = !muted || !audio;
    if (!audio) sound.hidden = true;
  }
  async function audioPlay() {
    if (!audio || muted || !playing) return;
    try {
      if (Math.abs(audio.currentTime - t) > 0.05) audio.currentTime = t;
      await audio.play();
    } catch {
      muted = true;
      syncSound();
    }
  }
  function audioPause() {
    audio?.pause();
  }
  function setMuted(next) {
    muted = next;
    store.set("metabear-motion-sound", muted ? "off" : "on");
    syncSound();
    if (muted) audioPause();
    else audioPlay();
  }

  // ---------- transport ----------
  function frame(now) {
    if (!playing) return;
    // rAF timestamps can predate performance.now() taken in start(): clamp.
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    t = Math.min(D, t + dt);
    if (audio && !muted && !audio.paused && Math.abs(audio.currentTime - t) > 0.12) audio.currentTime = t;
    if (t >= D) {
      playing = false;
      audioPause();
      store.set(`metabear-motion-done-${lesson.id}`, "1");
    }
    paint();
    if (playing) raf = requestAnimationFrame(frame);
  }
  function start() {
    if (t >= D - 1e-3) t = 0;
    playing = true;
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    audioPlay();
    paint();
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    audioPause();
    paint();
  }
  const toggle = () => (playing ? pause() : start());
  function seek(s, keepPlaying = playing) {
    t = Math.max(0, Math.min(D, s));
    if (audio) audio.currentTime = Math.min(t, audio.duration || t);
    if (!keepPlaying && playing) pause();
    paint();
  }

  // ---------- events ----------
  play.addEventListener("click", toggle);
  bigPlay.addEventListener("click", () => {
    if (store.get("metabear-motion-sound") === null && audio) setMuted(false);
    start();
  });
  // Mouse click toggles playback; a touch first reveals the controls.
  let pointerType = "mouse";
  let awakeBeforeTap = false;
  canvas.addEventListener("pointerdown", (e) => {
    pointerType = e.pointerType;
    awakeBeforeTap = root.classList.contains("hud-awake");
  });
  canvas.addEventListener("click", () => {
    if (pointerType !== "touch" || awakeBeforeTap || !playing) toggle();
  });
  sound.addEventListener("click", () => setMuted(!muted));
  soundHint.addEventListener("click", () => {
    setMuted(false);
    if (!playing) start();
  });
  replay.addEventListener("click", () => {
    seek(0, true);
    start();
  });
  let wasPlaying = false;
  range.addEventListener("pointerdown", () => {
    wasPlaying = playing;
    if (playing) pause();
  });
  range.addEventListener("input", () => seek(Number(range.value) / 1000, false));
  range.addEventListener("change", () => {
    if (wasPlaying && t < D) start();
    wasPlaying = false;
  });
  range.addEventListener("pointermove", (e) => {
    const r = range.getBoundingClientRect();
    const s = ((e.clientX - r.left) / r.width) * D;
    const ci = chapterAt(Math.max(0, Math.min(D - 1e-3, s)));
    tip.textContent = `${clock(s)} · ${chapters[ci].label}`;
    tip.style.left = `${Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100}%`;
  });
  document.querySelectorAll("[data-story-scene]").forEach((b) =>
    b.addEventListener("click", () => {
      const c = chapters[Number(b.dataset.storyScene)];
      if (!c) return;
      seek(c.t, true);
      if (!playing) start();
    }),
  );

  // Fullscreen. Touch devices get the CSS theatre (which rotates to landscape in
  // portrait) inside a document-level fullscreen, because a fullscreen element
  // itself cannot be transformed; iPhone Safari cannot fullscreen at all.
  let theaterFs = false;
  function setTheater(on) {
    document.body.classList.toggle("motion-theater", on);
    root.classList.toggle("is-theater", on);
    full.setAttribute("aria-label", on ? "離開全螢幕" : "全螢幕播放");
    if (!on && theaterFs) {
      theaterFs = false;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
    requestAnimationFrame(() => {
      fitResolution();
      paint();
    });
  }
  full.addEventListener("click", async () => {
    if (root.classList.contains("is-theater")) return setTheater(false);
    if (document.fullscreenElement) return document.exitFullscreen();
    const touch = matchMedia("(pointer: coarse)").matches;
    if (touch || !root.requestFullscreen) {
      setTheater(true);
      try {
        await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
        theaterFs = Boolean(document.fullscreenElement);
        await screen.orientation?.lock?.("landscape");
      } catch {
        /* fullscreen and orientation lock are optional here */
      }
      return;
    }
    try {
      await root.requestFullscreen({ navigationUI: "hide" });
    } catch {
      setTheater(true);
    }
  });
  document.addEventListener("fullscreenchange", () => {
    if (theaterFs && !document.fullscreenElement) return setTheater(false);
    root.classList.toggle("is-fullscreen", document.fullscreenElement === root);
    if (!root.classList.contains("is-theater"))
      full.setAttribute("aria-label", document.fullscreenElement ? "離開全螢幕" : "全螢幕播放");
  });

  root.tabIndex = -1;
  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input:not(.motion-range), textarea, select, [contenteditable]")) return;
    const ci = chapterAt(t);
    switch (e.key) {
      case " ":
      case "k":
        if (e.target.closest?.("button, a")) return;
        e.preventDefault();
        toggle();
        break;
      case "ArrowRight":
        if (e.target === range) return;
        seek(t + 3);
        break;
      case "ArrowLeft":
        if (e.target === range) return;
        seek(t - 3);
        break;
      case "PageDown":
        seek(chapters[ci + 1]?.t ?? D);
        break;
      case "PageUp":
        seek(t - chapters[ci].t > 1 ? chapters[ci].t : (chapters[ci - 1]?.t ?? 0));
        break;
      case "m":
        setMuted(!muted);
        break;
      case "f":
        full.click();
        break;
      case "Escape":
        if (root.classList.contains("is-theater")) setTheater(false);
        break;
      default:
        break;
    }
  });
  document.addEventListener("academy:pause", () => playing && pause());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && playing) pause();
  });
  reduced.addEventListener("change", () => {
    prefs.reduced = reduced.matches;
    paint();
  });
  let hudTimer = 0;
  const wake = () => {
    root.classList.add("hud-awake");
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => root.classList.remove("hud-awake"), 2200);
  };
  stage.addEventListener("pointermove", wake);
  stage.addEventListener("pointerdown", wake);

  // ---------- boot ----------
  syncSound();
  fitResolution();
  paint();
  await preloadLessonFonts(lesson, fontUsage);
  loading.remove();
  const hash = /^#scene-(\d+)$/.exec(location.hash);
  if (hash && chapters[Number(hash[1]) - 1]) t = chapters[Number(hash[1]) - 1].t;
  paint();
  window.addEventListener("hashchange", () => {
    const m = /^#scene-(\d+)$/.exec(location.hash);
    if (m && chapters[Number(m[1]) - 1]) seek(chapters[Number(m[1]) - 1].t, true);
  });
  // Autoplay like the rest of the academy; sound only if the viewer opted in.
  if (!document.hidden) start();
  return {
    seek,
    start,
    pause,
    get time() {
      return t;
    },
  };
}
