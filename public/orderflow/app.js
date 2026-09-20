import { lessonMarket, PaperAccount, scenarioFrames } from "./engine.js";
import { lessons, scenarios } from "./lessons.js";
import { BybitSession, recordingFrame, parseRecording } from "./feed.js";
import { drawMarket, miniChart, fmt } from "./charts.js";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let saved = {};
try {
  saved = JSON.parse(
    localStorage.getItem("metabear-orderflow-progress") || "{}",
  );
} catch {
  /* storage is optional */
}
let completed = new Set(
  Array.isArray(saved.completed)
    ? saved.completed.filter((id) => lessons.some((l) => l.id === id))
    : [],
);
let lessonIndex = Math.max(
  0,
  lessons.findIndex(
    (l) => l.id === new URLSearchParams(location.search).get("lesson"),
  ),
);
let lesson = lessons[lessonIndex],
  market = lessonMarket(lesson.id),
  mode = "learn",
  zoom = lesson.focus,
  side = "buy",
  selected = null;
let performed = false,
  answered = false,
  lastExecution = null,
  toastTimer,
  playTimer;
let overviewLayer = lesson.id === "heatmap" ? "heatmap" : "price";
let practiceFrames = scenarioFrames("absorb"),
  replayIndex = 0,
  locked = false,
  recordedPractice = false;
let practiceAccount = new PaperAccount(),
  liveAccount = new PaperAccount(),
  lastPaperKey = { practice: null, live: null };
let liveFrame = null,
  liveState = "idle",
  lastSegment = null,
  recording = [],
  recordingActive = false,
  recordTime = 0;
const emptyFrame = () => ({
  price: 0,
  oi: null,
  cvd: 0,
  volume: 0,
  delta: 0,
  vwap: null,
  imbalance: 0,
  bids: [],
  asks: [],
  trades: [],
  profile: [],
  history: [],
  events: [],
  ownOrders: [],
  source: "等待行情",
  unit: $("live-symbol").value === "ETHUSDT" ? "ETH" : "BTC",
  funding: null,
  index: null,
  time: 0,
});
const current = () =>
  mode === "learn"
    ? market.frame()
    : mode === "practice"
      ? practiceFrames[replayIndex]
      : liveFrame || emptyFrame();
const account = () => (mode === "practice" ? practiceAccount : liveAccount);
function notify(s) {
  $("toast").textContent = s;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
}
function storeProgress() {
  try {
    localStorage.setItem(
      "metabear-orderflow-progress",
      JSON.stringify({ completed: [...completed] }),
    );
  } catch {
    notify("目前無法儲存進度；本次仍可繼續學習。");
  }
}
function navigation() {
  let group = "";
  $("lesson-list").innerHTML = lessons
    .map((l, i) => {
      const title =
        l.group !== group ? `<p class="course-group">${esc(l.group)}</p>` : "";
      group = l.group;
      return (
        title +
        `<button class="course-link ${i === lessonIndex && mode === "learn" ? "active" : ""}" data-lesson="${i}"${i === lessonIndex && mode === "learn" ? ' aria-current="step"' : ""}><span class="course-number">${String(i + 1).padStart(2, "0")}</span><span>${esc(l.short)}</span>${completed.has(l.id) ? '<span class="course-check" aria-label="已完成">✓</span>' : ""}</button>`
      );
    })
    .join("");
  $("course-select").innerHTML = lessons
    .map(
      (l, i) =>
        `<option value="${i}" ${i === lessonIndex ? "selected" : ""}>${String(i + 1).padStart(2, "0")} · ${esc(l.short)}${completed.has(l.id) ? " ✓" : ""}</option>`,
    )
    .join("");
  $("completion").textContent =
    `${String(completed.size).padStart(2, "0")} / ${lessons.length}`;
  $("progress").max = lessons.length;
  $("progress").value = completed.size;
}
function completeLesson() {
  if (performed && answered && !completed.has(lesson.id)) {
    completed.add(lesson.id);
    storeProgress();
    navigation();
    notify(`已完成「${lesson.short}」`);
  }
}
function lessonContent() {
  $("eyebrow").textContent =
    `${String(lessonIndex + 1).padStart(2, "0")} / ${lesson.en}`;
  $("lesson-title").textContent = lesson.title;
  $("lesson-summary").textContent = lesson.summary;
  $("chapter-mark").innerHTML =
    `${String(lessonIndex + 1).padStart(2, "0")}<span>/ ${lessons.length}</span>`;
  $("task-copy").textContent = lesson.task;
  $("lesson-action").innerHTML = `${esc(lesson.action)} <span>↗</span>`;
  $("mobile-action").innerHTML = `${esc(lesson.action)} <span>↗</span>`;
  $("action-hint").textContent =
    lesson.command === "practice" ? "帶著假設進入市場" : "執行實驗，觀察變化";
  $("explanation").textContent = lesson.explanation;
  $("pitfall").textContent = lesson.pitfall;
  $("quiz-question").textContent = lesson.question;
  $("quiz-options").innerHTML = lesson.options
    .map(
      (s, i) =>
        `<button class="quiz-option" data-answer="${i}"><span>${String.fromCharCode(65 + i)}</span>${esc(s)}</button>`,
    )
    .join("");
  $("quiz-feedback").textContent = "";
  $("action-result").textContent = "每次操作都會同步更新所有視圖。";
  $("next-lesson").innerHTML =
    lessonIndex === lessons.length - 1
      ? "前往情境實戰 <span>→</span>"
      : "下一個單元 <span>→</span>";
  $("order-price").value = market.book("buy")[0]?.price || 68410;
  $("reveal-hidden").checked = false;
  $("order-feedback").textContent = "成交價格取決於當時的對手掛單。";
}
function loadLesson(index, focus = false) {
  lessonIndex = Math.max(0, Math.min(lessons.length - 1, index));
  lesson = lessons[lessonIndex];
  market = lessonMarket(lesson.id);
  overviewLayer = lesson.id === "heatmap" ? "heatmap" : "price";
  zoom = lesson.focus;
  selected = null;
  performed = false;
  answered = false;
  lastExecution = null;
  if (mode !== "learn") changeMode("learn", false);
  lessonContent();
  navigation();
  render();
  const url = new URL(location.href);
  url.searchParams.set("lesson", lesson.id);
  history.replaceState({}, "", url);
  if (focus) {
    $("main").focus({ preventScroll: true });
    window.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
}
function stopPlayback() {
  clearInterval(playTimer);
  playTimer = null;
  $("replay-play").textContent = "自動播放";
}
function changeMode(next, refresh = true) {
  if (mode === "live" && next !== "live") {
    feed.stop();
    recordingActive = false;
    liveState = "idle";
    liveFrame = null;
    $("connect-live").textContent = "連接公開行情";
    $("live-status").textContent =
      "已離開即時模式。重新連線會建立新的觀察場次。";
    updateRecordUI();
  }
  stopPlayback();
  mode = next;
  selected = null;
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  });
  $("lesson-coach").hidden = mode !== "learn";
  $("practice-coach").hidden = mode !== "practice";
  $("live-coach").hidden = mode !== "live";
  $("quiz-card").hidden = mode !== "learn";
  $("mobile-lab-controls").hidden = mode !== "learn";
  document.querySelector(".mobile-course").hidden = mode !== "learn";
  $("sim-fields").hidden = mode !== "learn";
  $("disposition-field").hidden = mode !== "learn";
  $("paper-account").hidden = mode === "learn";
  $("order-size").max = mode === "learn" ? "100" : "1";
  $("order-size").value = mode === "learn" ? "3" : ".01";
  $("ticket-title").textContent = mode === "learn" ? "自由實驗" : "紙上交易";
  $("ticket-badge").textContent = mode === "learn" ? "SIM" : "PAPER";
  $("reveal-hidden").checked = false;
  $("event-tape").setAttribute("aria-live", mode === "live" ? "off" : "polite");
  $("order-feedback").textContent =
    mode === "learn"
      ? "成交價格取決於當時的對手掛單。"
      : "每個新盤面可操作一次，手續費假設 0.055%。";
  updateType();
  updateSide();
  if (mode === "learn") {
    zoom = lesson.focus;
    lessonContent();
  } else if (mode === "practice") {
    $("eyebrow").textContent = "PRACTICE / DECISION LAB";
    $("lesson-title").textContent = "先看盤，再讓市場揭曉。";
    $("lesson-summary").textContent =
      "把學到的觀念放進一段未知的行情。記錄證據、定義失效，再用紙上交易驗證你的過程。";
    $("chapter-mark").innerHTML = "LAB<span>/ 實戰</span>";
    zoom = 0;
    practiceContent();
  } else {
    $("eyebrow").textContent = "LIVE / MARKET OBSERVATORY";
    $("lesson-title").textContent = "這一次，是正在發生的市場。";
    $("lesson-summary").textContent =
      "接上 Bybit 公開行情，觀察真實成交與深度。錄製一段市場，變成你自己的實戰教材。";
    $("chapter-mark").innerHTML = "LIVE";
    zoom = 2;
    $("explanation").textContent =
      "公開串流重建前 50 檔訂單簿，並按主動方累計成交。CVD、VWAP 從每次連線開始，重連後重新起算。畫面每 300 ms 更新；OI 採單邊口徑。";
    $("pitfall").textContent =
      "單一交易所不是全市場。公開深度不包含 RPI 掛單，無法確認冰山身分；取樣回放不保留每次深度更新。";
  }
  navigation();
  if (refresh) render();
}
function setZoom(n) {
  const previous = zoom;
  zoom = Math.max(0, Math.min(2, Number(n)));
  render();
  if (
    previous !== zoom &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    $("market-viz").animate(
      [
        { opacity: 0.15, transform: `scale(${zoom > previous ? 0.9 : 1.08})` },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 420, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
}
function updateType() {
  const type = $("order-type").value,
    sim = mode === "learn";
  $("price-field").hidden = !sim || type === "market";
  $("peak-field").hidden = !sim || type !== "iceberg";
}
function updateSide() {
  document.querySelectorAll("[data-side]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.side === side);
    b.setAttribute("aria-pressed", String(b.dataset.side === side));
  });
  $("submit-order").classList.toggle("sell", side === "sell");
  $("submit-order").innerHTML =
    `送出${mode === "learn" ? "模擬" : "紙上"}${side === "buy" ? "買" : "賣"}單 <span>→</span>`;
}
function describeExecution(r, before, direction) {
  const best =
    direction === "buy" ? before.asks[0]?.price : before.bids[0]?.price;
  return r.filled
    ? `成交 ${fmt(r.filled, 3)} BTC · 均價 ${fmt(r.avg)} · 相對最佳報價滑價 ${fmt(Math.abs(r.avg - best))} USDT${r.remaining > 0.000001 ? ` · 餘量 ${fmt(r.remaining, 3)}${r.resting ? " 已掛入" : " 未成交"}` : ""}${r.replenished ? ` · 同價補量 ${r.replenished} 次` : ""}`
    : `尚未成交 · ${fmt(r.remaining, 3)} BTC ${r.resting ? "已掛入訂單簿。CVD 不變。" : "沒有可用對手深度。"}`;
}
function executeSim(options) {
  const before = market.frame(),
    r = market.execute(options);
  lastExecution = r;
  const description = describeExecution(r, before, options.side);
  $("order-feedback").textContent = description;
  $("action-result").textContent = description;
  performed = true;
  completeLesson();
  render();
  return r;
}
function paperKey() {
  return mode === "practice"
    ? `replay:${replayIndex}`
    : `live:${liveFrame?.bookVersion}`;
}
function canPaper() {
  return mode === "practice"
    ? locked && lastPaperKey.practice !== paperKey()
    : mode === "live" &&
        liveState === "live" &&
        liveFrame?.oi != null &&
        !liveFrame.stale &&
        lastPaperKey.live !== paperKey();
}
function render() {
  const f = current(),
    present = f.price > 0;
  $("mobile-action-result").textContent = $("action-result").textContent;
  document.querySelectorAll("[data-zoom]").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.zoom) === zoom);
    b.setAttribute("aria-pressed", String(Number(b.dataset.zoom) === zoom));
  });
  $("zoom-level").textContent = `${zoom + 1}×`;
  $("zoom-out").disabled = zoom === 0;
  $("zoom-in").disabled = zoom === 2;
  $("view-name").textContent = [
    "MARKET OVERVIEW",
    "TRADE FOOTPRINT",
    "INSIDE THE ORDER BOOK",
  ][zoom];
  $("overview-layer").hidden = zoom !== 0;
  document.querySelectorAll("[data-layer]").forEach((b) => {
    b.classList.toggle("active", b.dataset.layer === overviewLayer);
    b.setAttribute("aria-pressed", String(b.dataset.layer === overviewLayer));
  });
  $("view-hint").textContent =
    zoom === 0
      ? "同一段市場，從結果看起。"
      : zoom === 1
        ? `${f.unit === "ETH" ? "0.5" : "5"} USDT 價格箱 · 點價位深入`
        : "掛單等待成交；主動單取走流動性。";
  $("chart-legend").innerHTML =
    zoom === 0
      ? '<i class="buy-key"></i> 成交價格 <span class="muted">／ 虛線 VWAP</span>'
      : zoom === 1
        ? '<i class="sell-key"></i> 主動賣 <i class="buy-key"></i> 主動買'
        : '<i class="buy-key"></i> 買方 Bid <i class="sell-key"></i> 賣方 Ask';
  if (zoom === 0 && overviewLayer === "heatmap") {
    $("view-name").textContent = "LIQUIDITY HEATMAP";
    $("view-hint").textContent = "每側 12 檔取樣 · 白線為成交價";
    $("chart-legend").innerHTML =
      '<i class="buy-key"></i> 買方掛量 <i class="sell-key"></i> 賣方掛量';
  }
  $("market-price").textContent = present ? fmt(f.price, 1) : "—";
  const change = f.history.length ? f.price - f.history[0].price : 0;
  $("price-change").textContent = present
    ? `${change >= 0 ? "+" : ""}${fmt(change, 1)} / 本段`
    : "等待資料";
  $("price-change").className = change >= 0 ? "positive" : "negative";
  $("instrument-name").textContent = `${f.unit} / USDT`;
  document.querySelector(".coin-symbol").textContent =
    f.unit === "BTC" ? "₿" : "Ξ";
  $("spread").textContent =
    f.asks.length && f.bids.length
      ? fmt(f.asks[0].price - f.bids[0].price, 1)
      : "—";
  $("source-badge").textContent =
    mode === "learn"
      ? "合成教學數據"
      : mode === "practice"
        ? recordedPractice
          ? "Bybit 取樣回放"
          : "合成情境 · 未來隱藏"
        : liveState === "live"
          ? "BYBIT · LIVE"
          : liveState === "idle"
            ? "尚未連線"
            : liveState === "connecting"
              ? "連線中…"
              : "行情中斷／過期";
  $("source-badge").className =
    `source-badge ${mode === "live" ? (liveState === "live" ? "live" : "error") : ""}`;
  $("metric-cvd").textContent = present
    ? `${f.cvd >= 0 ? "+" : ""}${fmt(f.cvd, 2)}`
    : "—";
  $("metric-cvd").className = f.cvd >= 0 ? "positive" : "negative";
  $("metric-oi").textContent = fmt(f.oi, 2);
  $("metric-vwap").textContent = fmt(f.vwap, 1);
  $("metric-imbalance").textContent = present
    ? `${f.imbalance >= 0 ? "+" : ""}${fmt(f.imbalance * 100, 1)}%`
    : "—";
  $("cvd-note").textContent =
    `${mode === "live" ? "自本次連線" : "自情境起點"} · ${f.unit}`;
  $("oi-note").textContent = `單邊口徑 · ${f.unit}`;
  $("delta-label").textContent = f.unit;
  $("oi-unit").textContent = f.unit;
  $("size-label").textContent = `數量 ${f.unit}`;
  drawMarket(
    $("market-viz"),
    f,
    zoom,
    mode === "learn" && $("reveal-hidden").checked,
    selected,
    overviewLayer,
  );
  miniChart($("cvd-chart"), f.history, "cvd", "#71d9b2");
  miniChart($("oi-chart"), f.history, "oi", "#c5cdac");
  $("event-title").textContent =
    mode === "learn" ? "剛剛發生了什麼" : "最近成交";
  $("event-count").textContent =
    mode === "learn"
      ? `${f.events.length} 筆操作`
      : `${fmt(f.volume, 2)} ${f.unit} / 本段`;
  if (mode === "learn")
    $("event-tape").innerHTML = f.events.length
      ? f.events
          .slice(0, 3)
          .map(
            (e, i) =>
              `<div class="event-row ${i === 0 ? "new" : ""}"><span>${String(f.events.length - i).padStart(2, "0")}</span><span>${esc(e.text)}</span></div>`,
          )
          .join("")
      : '<span class="event-bullet"></span>市場準備好了。在右側送出一筆訂單，觀察接下來的變化。';
  else
    $("event-tape").innerHTML = f.trades.length
      ? f.trades
          .slice(-3)
          .reverse()
          .map(
            (t) =>
              `<div class="event-row"><span class="${t.side === "buy" ? "positive" : "negative"}">${t.side === "buy" ? "BUY" : "SELL"}</span><span>${fmt(t.size, 3)} ${f.unit} @ ${fmt(t.price, 1)}</span></div>`,
          )
          .join("")
      : "等待本次連線的第一筆公開成交。";
  $("trade-table").innerHTML = f.trades
    .slice(-10)
    .reverse()
    .map(
      (t) =>
        `<tr><td class="${t.side === "buy" ? "positive" : "negative"}">${t.side === "buy" ? "買 Buy" : "賣 Sell"}</td><td>${fmt(t.price, 1)}</td><td>${fmt(t.size, 3)} ${f.unit}</td></tr>`,
    )
    .join("");
  $("data-scope").textContent =
    mode === "learn"
      ? "所有行情均為可重現的合成教學。CVD、VWAP、Profile 從情境起點累計。Footprint 採 5 USDT 分箱，展示最多 11 個高成交量價位。OI 為已知開平倉假設下的單邊數量。"
      : mode === "practice"
        ? recordedPractice
          ? "這是使用者錄製的 Bybit 取樣快照，非完整逐筆 L2。CVD／VWAP 延用原連線累計值；足跡僅用每個快照附帶的最近 100 筆成交重建。尚未揭露的快照不參與圖表或紙上成交。"
          : "合成情境按照固定事件順序推進，圖表只使用已揭露資料。紙上成交採當時可見深度，費率假設 0.055%；未模擬延遲、排隊順位、資金費、槓桿或保證金。"
        : `Bybit USDT 永續，前 50 檔可見深度。CVD／VWAP 自本次連線累計；Footprint／Profile 為最近最多 5,000 筆成交，表格只列最近 10 筆。OI 使用 ${f.oiBasis || "等待資料"}。連線起點：${f.started ? new Date(f.started).toLocaleString("zh-TW") : "尚未連線"}。`;
  $("own-orders").innerHTML =
    mode === "learn"
      ? f.ownOrders
          .map(
            (o) =>
              `<div class="own-order"><div>${o.side === "buy" ? "買" : "賣"} ${fmt(o.remaining, 3)} @ ${fmt(o.price, 1)}<small>${o.peak ? `冰山 · 每批 ${fmt(o.peak, 3)}` : "限價委託"}</small></div><button data-cancel="${o.id}">撤單</button></div>`,
          )
          .join("")
      : "";
  $("submit-order").disabled = mode !== "learn" && !canPaper();
  if (mode !== "learn") renderAccount(f);
  document.querySelectorAll(".funding-box").forEach((e) => e.remove());
  if ((mode === "learn" && lesson.id === "funding") || mode === "live") {
    const b = document.createElement("div");
    b.className = "funding-box";
    b.textContent =
      f.funding == null
        ? "資金費率：等待資料"
        : `單次費率 ${fmt(f.funding * 100, 4)}% · 10,000 USDT 多單${f.funding >= 0 ? "支付" : "收取"} ${fmt(Math.abs(10000 * f.funding))} USDT。${f.index && f.mark ? ` Mark / Index 溢價 ${fmt(((f.mark - f.index) / f.index) * 100, 3)}%。` : ""}`;
    (mode === "live" ? $("live-coach") : $("lesson-coach")).appendChild(b);
    if (mode === "learn") {
      const label = document.createElement("label");
      label.htmlFor = "premium-slider";
      label.textContent = "調整模擬 Mark / Index 溢價";
      const input = document.createElement("input");
      input.type = "range";
      input.id = "premium-slider";
      input.min = "-0.5";
      input.max = "0.5";
      input.step = "0.01";
      input.value = String((market.mark / market.index - 1) * 100);
      input.addEventListener("change", () => {
        market.mark = market.index * (1 + Number(input.value) / 100);
        performed = true;
        completeLesson();
        render();
      });
      b.append(label, input);
    }
  }
  if (mode === "live" && f.liquidations?.length) {
    const l = f.liquidations[0];
    $("liquidation-feed").textContent =
      `最近清算：${l.side === "long" ? "多倉" : "空倉"} ${fmt(l.size, 3)} ${f.unit} · 破產價 ${fmt(l.bankruptcy, 1)}（非成交價）`;
  }
}
function renderAccount(f) {
  const a = account(),
    p = a.pnl(f.price || a.entry);
  $("paper-account").innerHTML =
    `<div class="account-grid"><div><span>淨部位 ${f.unit}</span><strong>${fmt(a.position, 3)}</strong></div><div><span>持倉均價 USDT</span><strong>${a.position ? fmt(a.entry, 1) : "—"}</strong></div><div><span>未實現 USDT</span><strong class="${p.unrealized >= 0 ? "positive" : "negative"}">${fmt(p.unrealized)}</strong></div><div><span>含費淨損益 USDT</span><strong class="${p.net >= 0 ? "positive" : "negative"}">${fmt(p.net)}</strong></div></div><p class="account-note">已實現 ${fmt(a.realized)} · 費用 ${fmt(a.fees, 4)} USDT<br>成交 ${a.fills.length} 筆 · 名義起始資金 10,000 USDT<br>最大名義部位 10,000 USDT；無槓桿／保證金模型。</p>${a.position ? '<button class="quiet full" id="flatten-position">以當前深度平倉</button>' : ""}`;
  $("flatten-position")?.addEventListener("click", () =>
    submitPaper(
      a.position > 0 ? "sell" : "buy",
      Math.min(1, Math.abs(a.position)),
    ),
  );
}
function submitPaper(direction, size) {
  try {
    if (!canPaper())
      throw Error(
        mode === "practice" && !locked
          ? "請先記錄判斷，再開始紙上交易。"
          : "請等待新的有效盤面再操作。",
      );
    const a = account(),
      f = current(),
      newPos = a.position + (direction === "buy" ? size : -size);
    if (
      Math.abs(newPos) * f.price > 10000 &&
      Math.abs(newPos) > Math.abs(a.position)
    )
      throw Error("此練習的最大名義部位為 10,000 USDT。請減少數量。");
    const fill = a.trade(direction, size, f);
    lastPaperKey[mode] = paperKey();
    $("order-feedback").textContent =
      `紙上${direction === "buy" ? "買入" : "賣出"} ${fmt(fill.size, 4)} ${f.unit} · 均價 ${fmt(fill.avg)} · 費用 ${fmt(fill.fee, 4)} USDT${fill.size + 0.000001 < size ? " · 深度不足，部分成交" : ""}`;
    render();
  } catch (e) {
    $("order-feedback").textContent = e.message;
  }
}
function practiceContent() {
  const s =
    scenarios.find((s) => s.id === $("scenario-select").value) || scenarios[0];
  $("scenario-prompt").textContent = recordedPractice
    ? "這是你錄製的真實市場。起點以後的快照先隱藏，寫下你的證據再逐步觀察。"
    : s.prompt;
  $("explanation").textContent =
    "先描述已發生的事，再提出對未來的假設。每次推進都會更新同一個訂單簿、價格與指標；紙上訂單只能使用當時已揭露的深度成交。";
  $("pitfall").textContent =
    "情境只是一條可能路徑。學習重點是是否事先定義證據與失效條件，不是用一次盈虧判斷策略有效。";
  $("replay-progress").max = practiceFrames.length - 1;
  $("replay-progress").value = replayIndex;
  $("replay-next").disabled =
    !locked || replayIndex >= practiceFrames.length - 1;
  $("replay-play").disabled = $("replay-next").disabled;
  $("lock-thesis").disabled = locked;
  for (const id of ["thesis", "evidence", "invalidation"])
    $(id).disabled = locked;
  $("replay-status").textContent = locked
    ? `已揭露 ${replayIndex + 1} / ${practiceFrames.length} 個盤面${recordedPractice ? " · 真實取樣" : " · 合成情境"}`
    : "後續行情尚未揭露。";
}
function resetPractice(frames = null) {
  stopPlayback();
  if (frames) practiceFrames = frames;
  else {
    recordedPractice = false;
    practiceFrames = scenarioFrames($("scenario-select").value);
  }
  replayIndex = 0;
  locked = false;
  practiceAccount = new PaperAccount();
  lastPaperKey.practice = null;
  $("review").hidden = true;
  $("review").textContent = "";
  $("evidence").value = "";
  $("invalidation").value = "";
  $("thesis").value = "wait";
  $("order-feedback").textContent = "先記錄判斷，才開放紙上交易。";
  practiceContent();
  render();
}
function stepReplay() {
  if (!locked || replayIndex >= practiceFrames.length - 1) return;
  replayIndex++;
  practiceContent();
  render();
  if (replayIndex === practiceFrames.length - 1) {
    stopPlayback();
    const f = current(),
      a = practiceAccount,
      s =
        scenarios.find((s) => s.id === $("scenario-select").value) ||
        scenarios[0];
    $("review").hidden = false;
    $("review").innerHTML =
      `<strong>回顧這一次的判斷</strong>${esc(recordedPractice ? "對照你的失效條件：它是否曾觸發？如果觸發，你有改變行動嗎？取樣資料不足以驗證每筆真實成交順位。" : s.review)}<br><br>你的證據：${esc($("evidence").value)}<br>失效條件：${esc($("invalidation").value)}<br><br>紙上成交 ${a.fills.length} 筆 · 含費淨損益 ${fmt(a.pnl(f.price).net)} USDT。${a.position ? "仍有未平倉部位，損益包含未實現值。" : "目前沒有部位。"}<br><br>完成：事前記錄 ✓ · 逐步驗證 ✓ · 請比對行動是否遵守原訂條件。`;
    try {
      const journal = JSON.parse(
        localStorage.getItem("metabear-orderflow-journal") || "[]",
      );
      journal.push({
        time: new Date().toISOString(),
        scenario: recordedPractice ? "Bybit recording" : s.id,
        thesis: $("thesis").value,
        evidence: $("evidence").value,
        invalidation: $("invalidation").value,
        fills: a.fills,
        net: a.pnl(f.price).net,
      });
      localStorage.setItem(
        "metabear-orderflow-journal",
        JSON.stringify(journal.slice(-20)),
      );
    } catch {
      /* optional local journal */
    }
    notify("演練完成。回顧你的證據、失效條件與實際行動。");
  }
}
function updateRecordUI() {
  $("record-live").textContent = recordingActive
    ? "停止錄製"
    : "開始錄製這段市場";
  $("record-live").disabled = liveState !== "live" && !recordingActive;
  $("replay-recording").disabled = recording.length < 2;
  $("export-recording").disabled = recording.length < 2;
  $("record-status").textContent =
    `${recordingActive ? "錄製中" : "已錄製"} ${recording.length} / 300 個快照 · 每秒取樣`;
}
const feed = new BybitSession(
  (f) => {
    if (lastSegment !== f.started) {
      if (recordingActive) {
        recordingActive = false;
        notify("連線區段已改變，錄製已停止，避免拼接不連續 CVD。");
      }
      lastSegment = f.started;
    }
    liveFrame = f;
    if (
      recordingActive &&
      !f.stale &&
      f.time - recordTime >= 1000 &&
      f.oi != null &&
      f.bids.length &&
      f.asks.length
    ) {
      recording.push(recordingFrame(f));
      recordTime = f.time;
      if (recording.length >= 300) {
        recordingActive = false;
        notify("已錄滿 300 個快照，可匯出或進入演練。");
      }
      updateRecordUI();
    }
    if (mode === "live") render();
  },
  (state, message) => {
    const changed = state !== liveState;
    liveState = state;
    $("live-status").textContent = message;
    $("connect-live").textContent = ["live", "connecting", "stale"].includes(
      state,
    )
      ? "中斷連線"
      : "重新連接行情";
    if (state === "connecting") {
      liveFrame = null;
      lastPaperKey.live = null;
    }
    if (state === "disconnected" && recordingActive) {
      recordingActive = false;
      notify("連線中斷，已停止錄製並保留目前資料。");
    }
    updateRecordUI();
    if (mode === "live" && changed) render();
  },
);
function startConnection() {
  liveFrame = null;
  recordingActive = false;
  liveAccount = new PaperAccount();
  lastPaperKey.live = null;
  feed.connect($("live-symbol").value);
  $("order-feedback").textContent = "新的觀察場次，紙上帳本已重設。";
}
function download(data, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function openRecording(frames) {
  recordedPractice = true;
  changeMode("practice", false);
  resetPractice(frames);
  $("scenario-select").value = "recording";
  $("scenario-prompt").textContent =
    "使用你的真實行情錄製。後續取樣快照尚未揭露。";
  notify("已載入真實取樣回放，請先記錄判斷。");
}

$("scenario-select").innerHTML =
  scenarios
    .map((s) => `<option value="${s.id}">${esc(s.name)}</option>`)
    .join("") + '<option value="recording" disabled>已匯入真實行情</option>';
document.addEventListener("click", (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  if (b.dataset.lesson !== undefined)
    loadLesson(Number(b.dataset.lesson), true);
  if (b.dataset.mode) changeMode(b.dataset.mode);
  if (b.dataset.zoom !== undefined) setZoom(b.dataset.zoom);
  if (b.dataset.layer) {
    overviewLayer = b.dataset.layer;
    render();
  }
  if (b.dataset.side) {
    side = b.dataset.side;
    updateSide();
  }
  if (b.dataset.cancel) {
    if (market.cancel(Number(b.dataset.cancel))) {
      performed = true;
      $("action-result").textContent = "委託已撤銷；成交量與 CVD 保持不變。";
      completeLesson();
      render();
    }
  }
  if (b.dataset.answer !== undefined) {
    const answer = Number(b.dataset.answer);
    document
      .querySelectorAll(".quiz-option")
      .forEach((x) => x.classList.remove("incorrect", "correct"));
    if (answer === lesson.answer) {
      b.classList.add("correct");
      answered = true;
      $("quiz-feedback").textContent =
        `答對了。${lesson.why}${performed ? "" : " 完成上方操作後，即可記錄本課進度。"}`;
      completeLesson();
    } else {
      b.classList.add("incorrect");
      $("quiz-feedback").textContent = `再觀察一次。${lesson.pitfall}`;
    }
  }
});
$("course-select").addEventListener("change", () =>
  loadLesson(Number($("course-select").value)),
);
$("order-type").addEventListener("change", updateType);
$("reveal-hidden").addEventListener("change", render);
$("zoom-in").addEventListener("click", () => setZoom(zoom + 1));
$("zoom-out").addEventListener("click", () => setZoom(zoom - 1));
function chartClick(event) {
  const e = event.target.closest("[data-price],[data-drill]");
  if (!e) return;
  if (e.dataset.price) {
    selected = Number(e.dataset.price);
    $("order-price").value = selected;
    if (mode === "learn") {
      $("order-type").value = "limit";
      updateType();
      $("order-feedback").textContent = `已帶入限價 ${fmt(selected, 1)} USDT。`;
    }
  }
  if (e.dataset.drill) setZoom(Number(e.dataset.drill));
  else render();
}
$("market-viz").addEventListener("click", chartClick);
$("market-viz").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    chartClick(e);
  }
});
$("order-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const size = Number($("order-size").value);
  if (mode !== "learn") {
    submitPaper(side, size);
    return;
  }
  try {
    executeSim({
      side,
      size,
      type: $("order-type").value,
      price: Number($("order-price").value),
      peak: Number($("order-peak").value),
      disposition: $("disposition").value,
    });
  } catch (error) {
    $("order-feedback").textContent = error.message;
  }
});
$("lesson-action").addEventListener("click", () => {
  try {
    const cmd = lesson.command;
    performed = true;
    if (cmd === "practice") {
      completeLesson();
      changeMode("practice");
      return;
    }
    if (cmd === "funding") {
      market.funding = -market.funding;
      $("action-result").textContent =
        market.funding > 0
          ? "費率轉正：多方支付空方。"
          : "費率轉負：空方支付多方。";
      completeLesson();
      render();
      return;
    }
    if (cmd === "cancel" || cmd === "heatmap") {
      const own = market.orders.find((o) => o.own);
      if (own) market.cancel(own.id);
      if (cmd === "heatmap") for (let i = 0; i < 5; i++) market.sample();
      $("action-result").textContent = own
        ? "賣牆已撤銷，CVD 不變。"
        : "賣牆已移除；重新開始可再比較。";
      completeLesson();
      render();
      return;
    }
    const f = market.frame();
    executeSim({
      side: cmd === "liquidation" ? "sell" : "buy",
      size: lesson.size,
      type: cmd === "limit" ? "limit" : "market",
      price: f.bids[0]?.price,
      disposition:
        cmd === "open" ? "open" : cmd === "liquidation" ? "close" : "transfer",
    });
  } catch (e) {
    $("action-result").textContent = e.message;
  }
});
$("mobile-action").addEventListener("click", () => $("lesson-action").click());
$("next-lesson").addEventListener("click", () =>
  lessonIndex === lessons.length - 1
    ? changeMode("practice")
    : loadLesson(lessonIndex + 1, true),
);
$("reset").addEventListener("click", () => {
  if (mode === "learn") {
    loadLesson(lessonIndex);
    notify("情境已重設；已完成的課程進度保留。");
  } else if (mode === "practice") {
    resetPractice(recordedPractice ? practiceFrames : null);
    notify("演練與紙上帳本已重新開始。");
  } else {
    startConnection();
  }
});
$("scenario-select").addEventListener("change", () => {
  if ($("scenario-select").value !== "recording") resetPractice();
});
$("lock-thesis").addEventListener("click", () => {
  if (
    $("evidence").value.trim().length < 4 ||
    $("invalidation").value.trim().length < 4
  ) {
    $("replay-status").textContent = "請先寫下至少 4 個字的證據與失效條件。";
    ($("evidence").value.trim().length < 4
      ? $("evidence")
      : $("invalidation")
    ).focus();
    return;
  }
  locked = true;
  practiceContent();
  render();
});
$("replay-next").addEventListener("click", stepReplay);
$("replay-play").addEventListener("click", () => {
  if (playTimer) stopPlayback();
  else {
    $("replay-play").textContent = "暫停";
    playTimer = setInterval(stepReplay, 1800);
  }
});
$("connect-live").addEventListener("click", () => {
  if (["live", "connecting", "stale"].includes(liveState)) {
    feed.stop();
    liveState = "idle";
    recordingActive = false;
    $("live-status").textContent = "已中斷連線，紙上成交已暫停。";
    $("connect-live").textContent = "連接公開行情";
    updateRecordUI();
    render();
  } else startConnection();
});
$("live-symbol").addEventListener("change", () => {
  feed.stop();
  recordingActive = false;
  liveFrame = null;
  liveState = "idle";
  liveAccount = new PaperAccount();
  $("connect-live").textContent = "連接公開行情";
  $("live-status").textContent = "商品已切換，請連接新的行情。";
  updateRecordUI();
  render();
});
$("record-live").addEventListener("click", () => {
  if (recordingActive) {
    recordingActive = false;
    updateRecordUI();
    return;
  }
  if (liveState !== "live" || !liveFrame || liveFrame.oi == null) {
    notify("等待完整有效行情後再錄製。");
    return;
  }
  recording = [];
  recordingActive = true;
  recordTime = 0;
  lastSegment = liveFrame.started;
  updateRecordUI();
});
$("export-recording").addEventListener("click", () =>
  download(
    {
      format: "metabear-orderflow-v1",
      source: "Bybit public linear; sampled, not full L2",
      frames: recording,
    },
    `bybit-orderflow-${Date.now()}.json`,
  ),
);
$("replay-recording").addEventListener("click", () => {
  try {
    const frames = parseRecording(
      JSON.stringify({ format: "metabear-orderflow-v1", frames: recording }),
    );
    openRecording(frames);
  } catch (e) {
    notify(e.message);
  }
});
$("import-button").addEventListener("click", () => $("recording-file").click());
$("recording-file").addEventListener("change", async () => {
  try {
    const file = $("recording-file").files[0];
    if (!file) return;
    if (file.size > 10000000) throw Error("請選擇 10 MB 以內的錄製檔。");
    openRecording(parseRecording(await file.text()));
  } catch (e) {
    notify(e.message);
  } finally {
    $("recording-file").value = "";
  }
});
$("help-button").addEventListener("click", () => $("help-dialog").showModal());
function toggleImmersive(force) {
  const active =
    typeof force === "boolean"
      ? force
      : !document.body.classList.contains("immersive");
  document.body.classList.toggle("immersive", active);
  $("immersive-toggle").setAttribute("aria-pressed", String(active));
  $("immersive-toggle").setAttribute(
    "aria-label",
    active ? "離開沉浸模式" : "切換沉浸模式",
  );
  $("immersive-toggle").textContent = active ? "⤡" : "⤢";
  requestAnimationFrame(render);
}
$("immersive-toggle").addEventListener("click", () => toggleImmersive());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("immersive"))
    toggleImmersive(false);
  if (
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) ||
    $("help-dialog").open
  )
    return;
  if (["1", "2", "3"].includes(e.key)) setZoom(Number(e.key) - 1);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPlayback();
});
window.addEventListener("pagehide", () => feed.stop());
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 120);
});
lessonContent();
navigation();
updateType();
render();
