import { curriculum } from "./curriculum.js";

export const matchingQuiz = {
  question: "這根 K 線有很長的上影線，能證明剛才有很多人買入嗎？",
  options: ["不能，少量成交也可能跳過空價位", "能，漲得越高就代表越多人買"],
  answer: 0,
  why: "這裡只多買了 1 單位就從 101 跳到 110。K 線記錄成交價格的範圍，不能告訴你有多少人買入。",
};
export function completedCourses() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("metabear-orderflow-progress") || "{}",
    );
    return new Set(
      Array.isArray(saved?.completed)
        ? saved.completed.filter((id) =>
            curriculum.some((course) => course.id === id),
          )
        : [],
    );
  } catch {
    return new Set();
  }
}
export function recordCompletion(id, complete = true) {
  const completed = completedCourses();
  if (complete) completed.add(id);
  else completed.delete(id);
  try {
    localStorage.setItem(
      "metabear-orderflow-progress",
      JSON.stringify({ completed: [...completed] }),
    );
  } catch {
    /* Storage is optional. */
  }
  return completed;
}
const sources = {
  oi: [
    "CME：未平倉量",
    "https://www.cmegroup.com/education/lessons/open-interest",
  ],
  footprint: [
    "Sierra Chart：逐價成交與對角比較",
    "https://www.sierrachart.com/index.php?l=doc%2FNumbersBars.php",
  ],
  funding: [
    "Bybit：資金費用",
    "https://www.bybit.com/en/learn/bybit-guide/what-is-the-funding-fee",
  ],
  liquidation: [
    "Bybit：訂單執行與清算",
    "https://www.bybit.com/en/help-center/article/FAQ-Order-Execution-and-Liquidation",
  ],
};
const matchingNotes =
  "這裡指最新成交價，K 線以本段成交的開、高、低、收畫成。單純掛單或撤單會改變報價與深度，但沒有成交，就不會新增 K 線價格。Taker 也可能在相同價位成交，所以主動下單不一定讓價格改變。";
export function lessonShell(course, matching) {
  const quiz = course.quiz || matchingQuiz;
  const chapters = matching
    ? ["Maker 掛單", "Taker 成交", "價格跳動", "形成上影線"]
    : ["先觀察", "親手做", "看懂變化", "再回顧"];
  const next = curriculum[course.number];
  const previous = curriculum[course.number - 2];
  const source = sources[course.id] || [
    "Coinbase：訂單類型",
    "https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/order-types",
  ];
  return `
    <a class="f-skip" href="#f-main">跳到互動教學</a>
    <header class="f-header">
      <a class="f-brand" href="/" aria-label="MetaBear 首頁"><span class="f-mark" aria-hidden="true"><img src="/logo.webp" alt="" width="96" height="96" /></span><b>MetaBear</b><span>訂單流學院</span></a>
      <button type="button" class="f-route-button" id="f-open-map" aria-haspopup="dialog">課程路徑 <span id="f-completed-count"></span><span aria-hidden="true">↗</span></button>
    </header>
    <main class="f-main" id="f-main" tabindex="-1">
      <section class="f-intro" aria-labelledby="f-title">
        <div><p class="f-kicker">${course.phase} <span>／ 第 ${String(course.number).padStart(2, "0")} 課</span></p><h1 id="f-title">${course.title}</h1><p class="f-deck">${course.deck}</p></div>
        <ol class="f-progress" aria-label="本課學習步驟">${chapters.map((name, i) => `<li data-chapter="${i}"><span>${i + 1}</span>${name}</li>`).join("")}</ol>
      </section>
      <section class="f-theater" aria-label="${course.short}互動場景">
        <div class="f-stage-top"><div class="f-market-label"><span class="f-dot"></span>${matching ? "一個很小的市場" : course.short}<span>${matching ? "示意價格・每張單 1 單位" : "教學模擬・逐步揭露"}</span></div><button type="button" class="f-text-button" id="f-reset">重新開始</button></div>
        <div class="f-scene" id="f-scene"><div class="f-book-panel">
          <div class="f-book-heading"><span id="f-camera-label"></span><div class="f-view-controls"><span class="f-pause-slot"><button type="button" id="f-pause" class="f-text-button" hidden>暫停動畫</button></span><span class="f-zoom-badge" id="f-zoom-badge">1×</span></div></div>
          <svg id="f-book" viewBox="0 0 640 370" role="img" aria-labelledby="f-book-title f-book-desc"><title id="f-book-title">${course.short}：本步驟的市場與成交</title><desc id="f-book-desc"></desc><g id="f-book-world"></g><g id="f-candle" role="img" aria-label="目前 K 線"></g><g id="f-traveler" aria-hidden="true"></g></svg>
          <div class="f-book-key"><span><i class="f-candle-key"></i>K 線</span><span><i class="f-maker-key"></i>Maker：掛單等待</span><span id="f-taker-key" hidden><i class="f-taker-key"></i>Taker：主動成交</span></div>
        </div></div>
        <div class="f-scene-caption"><span class="f-current-price"><span id="f-price-label">最新成交</span><b id="f-price">100</b></span><p id="f-caption"></p></div>
        <div class="f-story" aria-live="polite" aria-atomic="true"><span class="f-step-count" id="f-step-count"></span><div><h2 id="f-story-title"></h2><p id="f-story-copy"></p></div></div>
          <div class="f-reflection" id="f-reflection" hidden>${course.prediction ? `<fieldset class="f-prediction"><legend>${course.prediction.question}</legend>${course.prediction.options.map((option, i) => `<button type="button" data-prediction="${i}" aria-pressed="false">${option}</button>`).join("")}<p id="f-prediction-status" role="status">先選一個想法。接下來的成交會幫你檢驗它。</p></fieldset>` : ""}</div>
        <div class="f-controls"><button type="button" class="f-back" id="f-back" aria-label="回到上一步">← <span>上一步</span></button><div class="f-action-hint"><strong id="f-role"></strong><span id="f-hint"></span></div><button type="button" class="f-action" id="f-action"></button></div>
      </section>
      <section class="f-recap" id="f-recap" hidden aria-labelledby="f-recap-title">
        <div class="f-recap-main"><h2 id="f-recap-title" tabindex="-1">演示完成，換你判讀。</h2><p>${quiz.question}</p><div class="f-answers">${quiz.options.map((option, i) => `<button type="button" data-answer="${i}">${option}</button>`).join("")}</div><p class="f-feedback" id="f-feedback" role="status"></p><a class="f-next" id="f-next" href="${next ? `./?lesson=${next.id}` : "./?workspace=practice"}" hidden>${next ? `下一課・${next.short}` : "完成這段旅程，進入情境實戰"}<span aria-hidden="true">→</span></a></div>
        <div class="f-trade-path"><p>${matching ? "剛才真正發生的成交" : "把這件事帶走"}</p><ol id="f-trade-list"></ol><p id="f-takeaway">${course.takeaway}</p><small>${matching ? "整段視為同一根 K 線；100 是起始成交。" : "數值只描述本課已揭露的情境。"}</small><div id="f-reflection-review" hidden></div></div>
      </section>
      <div class="f-footnotes"><details><summary>${matching ? "這裡的「價格」指什麼？" : "想多理解一點：本課的設定與範圍"}</summary><p>${course.notes || matchingNotes}</p>${matching ? "<p>本課用市價單示範 Taker；能立即成交的限價單也可能是 Taker。每筆成交都需要買方與賣方，不能從 K 線形狀推算買方人數。本例是簡化的連續撮合市場。</p>" : ""}${sources[course.id] || matching || course.phase === "訂單如何成交" ? `<a href="${source[1]}" target="_blank" rel="noopener noreferrer">${source[0]}</a>` : ""}</details><span>由你決定每一步</span></div>
      <footer class="f-footer"><a href="${previous ? `./?lesson=${previous.id}` : "/"}">${previous ? `← 上一課・${previous.short}` : "MetaBear 首頁"}</a><button type="button" class="f-text-button" id="f-footer-map">查看完整學習路徑</button></footer>
    </main>
    <dialog class="f-map" id="f-map" aria-labelledby="f-map-title"><div class="f-map-head"><div><p class="f-kicker">一步一步，把市場看清楚</p><h2 id="f-map-title">你的學習路徑</h2></div><button type="button" id="f-close-map" aria-label="關閉課程路徑">✕</button></div><p class="f-map-copy">從一筆訂單，到有根據的判讀。每一課只多理解一件事，也可以自由回看。</p>
      <div class="f-map-grid">${[...new Set(curriculum.map((c) => c.phase))]
        .map(
          (phase, i) =>
            `<section><h3><span>0${i + 1}</span>${phase}</h3><ol>${curriculum
              .filter((c) => c.phase === phase)
              .map(
                (c) =>
                  `<li><a href="./?lesson=${c.id}" data-course="${c.id}" ${c.id === course.id ? 'aria-current="page"' : ""}><span class="f-course-num">${String(c.number).padStart(2, "0")}</span><span>${c.short}</span><span class="f-course-status" aria-label="尚未完成"></span></a><button type="button" class="f-uncomplete" data-uncomplete="${c.id}" aria-label="移除${c.short}的完成標記" title="移除完成標記，留待複習" hidden>✓</button></li>`,
              )
              .join("")}</ol></section>`,
        )
        .join("")}</div>
      <div class="f-map-lab"><div><strong>學完之後，再放進完整市場</strong><p>情境實戰與即時行情保留完整工具，供你自由練習。</p></div><a href="./?workspace=practice">情境實戰 →</a><a href="./?workspace=live">即時市場 →</a></div>
    </dialog>`;
}
