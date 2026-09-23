import { mountFoundation } from "./foundation.js";
import { journey, journeyIndex } from "./journey-curriculum.js";
import { createJourneyStory, snapshotAt } from "./journey-model.js";
import {
  drawJourneyChart,
  formatPrice,
  formatQty,
  formatDelta,
} from "./journey-charts.js";

export function mountJourney(root) {
  root.className = "journey-root";
  document.documentElement.classList.add("journey-page");
  root.innerHTML = `
    <a class="skip" href="#journey-content">跳到市場旅程</a>
    <header class="header"><a class="brand" href="/"><img src="/logo.webp" alt="" width="32" height="32"><b>MetaBear</b><span>交易學院</span></a><span class="edition">一筆成交之後 <b id="j-number">01 / 06</b></span></header>
    <div class="journey-main" id="journey-content">
      <div class="introduction"><p class="eyebrow" id="j-eyebrow">從 K 線走進市場</p><h1 id="j-title"></h1><p id="j-lead"></p></div>
      <ol class="journey-route" aria-label="市場旅程進度">${journey.map((part) => '<li data-part="' + part.number + '"><span>' + String(part.number).padStart(2, "0") + "</span>" + ["價格的形成", "買入被吸收", "流動性變薄", "成交的足跡", "合約與成本", "急跌與承接"][part.number - 1] + "</li>").join("")}</ol>
      <div id="j-origin"></div>
      <main id="j-market" hidden>
        <section class="theater" aria-label="連續市場故事">
          <div class="stage-toolbar"><div class="instrument"><strong>BTC <span>/ USDT 永續</span></strong><span class="source">合成行情・非即時</span></div><div class="playback"><span id="j-clock">00:00.00</span><button id="j-pause" type="button" disabled>暫停</button></div></div>
          <div class="market-heading"><div><span class="metric-label">最新成交</span><strong id="j-price"></strong></div><p id="j-camera"></p><div class="delta-metric"><span class="metric-label" id="j-metric-label">累計主動買賣差 BTC</span><strong id="j-metric"></strong></div></div>
          <div class="canvas-wrap"><svg id="j-chart" viewBox="0 0 940 390" role="img" aria-labelledby="j-chart-title j-chart-desc"><title id="j-chart-title">同一段行情的 K 線、掛單與成交</title><desc id="j-chart-desc"></desc><g id="j-world"></g></svg></div>
          <div class="market-caption"><span id="j-caption"></span><span id="j-recent"></span></div>
          <div class="timeline"><progress id="j-progress" value="0" max="1" aria-label="本段行情進度"></progress></div>
          <div class="story-bottom"><div class="narrative" aria-live="polite" aria-atomic="true"><p class="scene-index" id="j-scene-count"></p><h2 id="j-scene-title"></h2><p id="j-copy"></p></div><div class="controls"><button id="j-back" class="quiet" type="button">← 上一幕</button><button id="j-next" class="primary" type="button">下一幕 →</button></div></div>
        </section>
        <section id="j-closing" class="journey-closing" hidden><p class="eyebrow">把剛才的經過連起來</p><p id="j-takeaway"></p><p id="j-bridge"></p></section>
      </main>
      <footer><a href="/">MetaBear 首頁</a><span>情境依撮合規則編排；第 02 段起為同一條合成行情。</span></footer>
    </div>`;
  const $ = (selector) => root.querySelector(selector);
  const story = createJourneyStory();
  const mobile = matchMedia("(max-width: 720px)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let chapter = 0,
    stage = 0,
    time = 0,
    busy = false,
    paused = false,
    raf = 0,
    playback = null,
    last = 0;
  let view = "book",
    previousView = "book",
    blend = 1;
  let state = snapshotAt(story, 0),
    stateTime = -1;
  let originReady = false;
  const foundation = mountFoundation($("#j-origin"), "matching", {
    journey: true,
    onComplete: () => openChapter(1, 1, { animate: true, push: true }),
  });
  originReady = true;

  function remember(push = false) {
    const url = new URL(location.href);
    url.searchParams.delete("lesson");
    url.searchParams.delete("classic");
    url.searchParams.set("chapter", journey[chapter].id);
    if (chapter > 0)
      url.searchParams.set(
        "scene",
        String(busy ? Math.max(0, stage - 1) : stage),
      );
    else url.searchParams.delete("scene");
    if (url.href !== location.href)
      history[push ? "pushState" : "replaceState"]({ journey: true }, "", url);
  }
  function heading() {
    const part = journey[chapter];
    document.title = part.title + " · MetaBear 市場旅程";
    $("#j-title").textContent = part.title;
    $("#j-lead").textContent = part.lead;
    $("#j-number").textContent = String(part.number).padStart(2, "0") + " / 06";
    $("#j-eyebrow").textContent =
      chapter === 0
        ? "從 K 線走進市場"
        : "第 " + String(part.number).padStart(2, "0") + " 段 · 同一條因果線";
    root.querySelectorAll("[data-part]").forEach((item) => {
      const active = Number(item.dataset.part) === part.number;
      if (active) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
      item.classList.toggle("visited", Number(item.dataset.part) < part.number);
    });
  }
  function describe() {
    const candle = state.candles.at(-1);
    $("#j-chart-desc").textContent =
      "回放 " +
      (time / 1000).toFixed(2) +
      " 秒；最新成交 " +
      formatPrice(state.price) +
      "；成交量 " +
      formatQty(state.volume) +
      " BTC；CVD " +
      formatDelta(state.cvd) +
      "。K 線開 " +
      formatPrice(candle.open) +
      "、高 " +
      formatPrice(candle.high) +
      "、低 " +
      formatPrice(candle.low) +
      "、收 " +
      formatPrice(candle.close) +
      "。";
  }
  function draw() {
    if (chapter === 0) return;
    if (stateTime !== time) {
      state = snapshotAt(story, time);
      stateTime = time;
    }
    const chart = drawJourneyChart({
      story,
      state,
      time,
      view,
      previousView,
      blend,
      mobile: mobile.matches,
      chapter,
      reduced: reduced.matches,
    });
    $("#j-chart").setAttribute("viewBox", chart.viewBox);
    $("#j-world").innerHTML = chart.svg;
    $("#j-price").textContent = formatPrice(state.price);
    $("#j-metric-label").textContent =
      view === "oi" ? "未平倉量 OI · BTC" : "累計主動買賣差 · BTC";
    $("#j-metric").textContent =
      view === "oi" ? formatQty(state.oi) : formatDelta(state.cvd);
    $("#j-clock").textContent =
      String(Math.floor(time / 60000)).padStart(2, "0") +
      ":" +
      ((time % 60000) / 1000).toFixed(2).padStart(5, "0");
    $("#j-progress").value =
      (time - journey[chapter].start) /
      (journey[chapter].end - journey[chapter].start);
    const latest = state.trades.at(-1);
    $("#j-recent").textContent = latest
      ? (latest.side === "buy" ? "買 " : "賣 ") +
        formatQty(latest.size) +
        " @ " +
        formatPrice(latest.price)
      : "等待成交";
    const isStats = ["footprint", "imbalance", "profile", "vwap"].includes(
      view,
    );
    $("#j-caption").textContent = isStats
      ? "自 00:00 起累計 · 同一批已成交紀錄"
      : view === "heatmap"
        ? "掛單更新留下亮帶；成交另外核對"
        : view === "risk"
          ? "標記價、成交、強平回報各自更新"
          : view === "funding"
            ? "單次結算示例 · 非逐秒收費"
            : "新掛單與買賣成交，在同一條時間軸上交錯發生。";
    $("#j-camera").textContent = {
      book: "K 線與盤面一起走。",
      heatmap: "把等待中的量，留在時間裡。",
      footprint: "走進 K 線，看見逐價成交。",
      imbalance: "同一份成交，再靠近一點。",
      profile: "把同一價位的交換，加在一起。",
      vwap: "最新價與整段平均，都留在同一張圖上。",
      oi: "交換多少，與留下多少。",
      funding: "行情仍在走，持有也有成本。",
      risk: "追蹤三種不同的公開資訊。",
    }[view];
  }
  function controls() {
    root.dataset.chapter = journey[chapter].id;
    root.dataset.stage = String(stage);
    root.dataset.busy = String(busy);
    root.dataset.paused = String(paused);
    if (chapter === 0) return;
    const part = journey[chapter],
      complete = stage === part.scenes.length && !busy;
    $("#j-next").disabled =
      busy || (complete && chapter === journey.length - 1);
    $("#j-next").textContent = busy
      ? "播放中"
      : complete
        ? chapter === journey.length - 1
          ? "旅程完成"
          : "繼續旅程 →"
        : stage === 0
          ? "開始這一段 →"
          : "下一幕 →";
    $("#j-pause").disabled = !busy;
    $("#j-pause").textContent = paused ? "繼續" : "暫停";
    $("#j-closing").hidden = !complete;
  }
  function narrative() {
    const part = journey[chapter],
      scene = part.scenes[Math.max(0, stage - 1)];
    $("#j-scene-count").textContent =
      stage === 0
        ? "接著上一段"
        : String(stage).padStart(2, "0") +
          " / " +
          String(part.scenes.length).padStart(2, "0");
    $("#j-scene-title").textContent = stage === 0 ? part.title : scene.title;
    $("#j-copy").textContent = stage === 0 ? part.lead : scene.copy;
    $("#j-takeaway").textContent = part.takeaway;
    $("#j-bridge").textContent = part.bridge;
  }
  function cancel() {
    cancelAnimationFrame(raf);
    playback = null;
    busy = false;
    paused = false;
    if (originReady) foundation.cancel();
  }
  function tick(now) {
    if (!playback || paused) return;
    playback.elapsed += Math.min(100, now - last);
    last = now;
    const progress = Math.min(1, playback.elapsed / playback.duration);
    time = playback.from + (playback.to - playback.from) * progress;
    blend = reduced.matches ? 1 : Math.min(1, playback.elapsed / 900);
    draw();
    if (progress === 1) {
      busy = false;
      playback = null;
      blend = 1;
      describe();
      controls();
      remember();
    } else raf = requestAnimationFrame(tick);
  }
  function playNextScene() {
    const part = journey[chapter],
      scene = part.scenes[stage - 1];
    previousView = view;
    view = scene.view;
    blend = previousView === view ? 1 : 0;
    busy = true;
    paused = false;
    playback = {
      from: time,
      to: scene.end,
      duration: (scene.end - time) / 0.8,
      elapsed: 0,
    };
    narrative();
    controls();
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function openChapter(
    index,
    nextStage = 0,
    { animate = false, push = false, originEnd = false } = {},
  ) {
    cancel();
    chapter = index;
    stage = nextStage;
    $("#j-origin").hidden = chapter !== 0;
    $("#j-market").hidden = chapter === 0;
    heading();
    if (chapter === 0) {
      foundation.goTo(originEnd ? 6 : 0);
      heading();
      controls();
      remember(push);
      return;
    }
    const part = journey[chapter];
    stage = Math.max(0, Math.min(part.scenes.length, stage));
    time = animate
      ? stage <= 1
        ? part.start
        : part.scenes[stage - 2].end
      : stage
        ? part.scenes[stage - 1].end
        : part.start;
    view = stage > 1 ? part.scenes[stage - 2].view : "book";
    previousView = view;
    blend = 1;
    if (animate) playNextScene();
    else {
      view = stage ? part.scenes[stage - 1].view : "book";
      previousView = view;
      narrative();
      draw();
      describe();
      controls();
    }
    remember(push);
  }
  $("#j-next").addEventListener("click", () => {
    if (busy) return;
    const part = journey[chapter];
    if (stage === part.scenes.length) {
      if (chapter < journey.length - 1)
        openChapter(chapter + 1, 1, { animate: true, push: true });
    } else {
      stage++;
      playNextScene();
    }
  });
  $("#j-back").addEventListener("click", () => {
    if (stage > 1) openChapter(chapter, stage - 1);
    else if (chapter > 1)
      openChapter(chapter - 1, journey[chapter - 1].scenes.length, {
        push: true,
      });
    else openChapter(0, 0, { push: true, originEnd: true });
  });
  function togglePause() {
    if (!busy) return;
    paused = !paused;
    cancelAnimationFrame(raf);
    if (!paused) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    describe();
    controls();
  }
  $("#j-pause").addEventListener("click", togglePause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && busy && !paused) togglePause();
  });
  window.addEventListener("pagehide", cancel);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) readUrl();
  });
  window.addEventListener("popstate", () => readUrl());
  mobile.addEventListener("change", draw);
  reduced.addEventListener("change", draw);
  function readUrl() {
    const params = new URLSearchParams(location.search);
    const index = journeyIndex(params.get("chapter") || params.get("lesson"));
    const requested = Number(params.get("scene") || 0);
    openChapter(
      index,
      Number.isInteger(requested) ? Math.max(0, Math.min(4, requested)) : 0,
    );
  }
  readUrl();
}
