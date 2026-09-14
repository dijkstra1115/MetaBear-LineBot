const $ = (s) => document.querySelector(s);
const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
let data,
  gallery = [],
  picture = 0;
function paragraphs(text) {
  const root = $("#guide-copy");
  root.replaceChildren();
  for (const part of text.split("\n\n")) {
    const p = node("p");
    for (const chunk of part.split(/(https:\/\/[^\s]+)/g)) {
      if (chunk.startsWith("https://")) {
        const a = node(
          "a",
          chunk.includes("youtu") ? "觀看 KYC 影片 ↗" : chunk,
        );
        a.href = chunk;
        a.target = "_blank";
        a.rel = "noreferrer";
        p.append(a);
      } else p.append(document.createTextNode(chunk));
    }
    root.append(p);
  }
}
function showImage(i) {
  $("#image-scroll").classList.remove("zoomed");
  $("#zoom-image").setAttribute("aria-pressed", "false");
  $("#zoom-image").textContent = "放大看細節";
  picture = i;
  $("#full-image").src = gallery[i].src;
  $("#full-image").alt = gallery[i].caption;
  $("#image-caption").textContent = gallery[i].caption;
  $("#image-position").textContent = `${i + 1} / ${gallery.length}`;
  $("#previous-image").disabled = i === 0;
  $("#next-image").disabled = i === gallery.length - 1;
  if (!$("#image-dialog").open) $("#image-dialog").showModal();
}
function renderQuestions(params, questions, key, isLesson = false) {
  $("#question-nav").setAttribute(
    "aria-label",
    isLesson
      ? marketLessonKeys.includes(key)
        ? "盤面教學問題"
        : "合約操作問題"
      : "入金問題",
  );
  const selected =
    questions.find((q) => q.id === params.get("question")) ?? questions[0];
  $("#question-nav").replaceChildren();
  for (const question of questions) {
    const a = node("a", question.title);
    a.href = `/learn?${isLesson ? "lesson" : "step"}=${encodeURIComponent(key)}&question=${question.id}`;
    a.setAttribute("aria-current", question === selected ? "page" : "false");
    $("#question-nav").append(a);
  }
  $("#question-title").textContent = selected.title;
  $("#question-intro").textContent = selected.intro;
  if (isLesson) {
    const source = node("a", selected.sourceLabel ?? "BingX 官方原圖 ↗");
    source.href = selected.source ?? futuresSource;
    source.target = "_blank";
    source.rel = "noreferrer";
    $("#question-intro").append(
      node("br"),
      source,
      document.createTextNode(
        selected.note ?? " · 網頁版，介面可能隨更新調整；圖中數值為示例。",
      ),
    );
  }
  $("#question-rows").replaceChildren();
  for (const row of selected.rows) {
    const article = node("article");
    article.className = "question-row";
    if (row.src) {
      const index = gallery.findIndex((img) => img.src === row.src);
      const b = node("button");
      b.className = "question-image";
      b.setAttribute("aria-label", `放大圖片：${row.title}`);
      const img = node("img");
      img.src = row.src;
      img.alt = gallery[index]?.caption ?? row.title;
      img.loading = "lazy";
      b.append(img, node("span", "點圖放大"));
      b.onclick = () => showImage(index);
      article.append(b);
    } else article.classList.add("question-row-text");
    const copy = node("div");
    copy.className = "question-copy";
    const appName = row.app ?? selected.app;
    const app = node("p");
    app.className = "question-app";
    for (const part of appName.split(/(BitoPro|BingX)/g)) {
      if (part === "BitoPro" || part === "BingX") {
        const platform = part.toLowerCase();
        const logo = document.createElement("img");
        logo.src = `/brands/${platform}.svg`;
        logo.alt = part;
        logo.className = `exchange-logo ${platform}-logo`;
        app.append(logo);
      } else if (part.trim()) {
        app.append(node("span", part.trim()));
      }
    }
    const reason = node("p", row.reason);
    reason.className = "question-reason";
    copy.append(app, node("h4", row.title), node("p", row.action), reason);
    if (
      marketLessonKeys.includes(key) &&
      row.src?.startsWith("/guides/futures/")
    ) {
      const imageSource = node("a", "圖片來源：BingX ↗");
      imageSource.href = futuresSource;
      imageSource.target = "_blank";
      imageSource.rel = "noreferrer";
      imageSource.className = "sr-source";
      copy.append(imageSource);
    }
    article.append(copy);
    $("#question-rows").append(article);
  }
  $("#question-check").replaceChildren(
    node("strong", "確認一下"),
    document.createTextNode(selected.check),
  );
}
function render(focus = false) {
  const params = new URLSearchParams(location.search);
  const lesson = params.get("lesson");
  const isLesson = Object.hasOwn(data.lessons, lesson);
  $(".learn-heading h1").replaceChildren(
    document.createTextNode(isLesson ? "看盤與合約，" : "註冊入金，"),
    node("em", isLesson ? "圖解教學。" : "圖文教學。"),
  );
  $(".learn-heading > p:last-child").textContent = isLesson
    ? "選一個問題，搭配圖例看說明。"
    : "選你遇到的問題，查看操作步驟。";
  const key = Object.hasOwn(data.steps, params.get("step"))
    ? params.get("step")
    : "register";
  const item = isLesson
    ? { title: lesson, text: data.lessons[lesson] }
    : data.steps[key];
  document.title = `${item.title}｜MetaBear 學習中心`;
  $("#guide-title").textContent = marketLabels[lesson] ?? item.title;
  $("#guide-category").textContent = isLesson
    ? marketLessonKeys.includes(lesson)
      ? "盤面教學"
      : "合約操作教學"
    : "GETTING STARTED / BINGX";
  paragraphs(item.text);
  const isFutures = isLesson && Object.hasOwn(futuresQuestions, lesson);
  const isMarket = isLesson && Object.hasOwn(marketQuestions, lesson);
  const questions = isMarket
    ? marketQuestions[lesson]
    : isFutures
      ? futuresQuestions[lesson]
      : key === "deposit_card"
        ? cardQuestions
        : bitoproQuestions;
  const isQuestionGuide =
    isMarket ||
    isFutures ||
    (!isLesson && ["deposit_bitopro", "deposit_card"].includes(key));
  const isDeposit = !isLesson && key === "deposit";
  setCalculatorVisible(isDeposit);
  const isSupport = isLesson && lesson === supportLessonTitle;
  $("#support-lesson").hidden = !isSupport;
  if (isSupport) renderSupportLesson(params);
  renderLessonNotes(isLesson ? lesson : null);
  $("#guide-copy").hidden = isQuestionGuide || isDeposit || isSupport;
  $("#question-guide").hidden = !isQuestionGuide;
  $("#method-options").hidden = isLesson || key !== "deposit";
  $("#register-link").hidden = isLesson || !["register", "code"].includes(key);
  const selectedQuestion = isQuestionGuide
    ? questions.findIndex((q) => q.id === params.get("question"))
    : -1;
  const relatedQuestion = isQuestionGuide
    ? questions[Math.max(0, selectedQuestion) + 1]
    : undefined;
  const lessonGroup = Object.keys(data.lessons).filter(
    (k) => marketLessonKeys.includes(k) === marketLessonKeys.includes(lesson),
  );
  const next = isLesson
    ? lessonGroup[lessonGroup.indexOf(lesson) + 1]
    : isQuestionGuide
      ? "uid"
      : item.related[0];
  $("#next-step").hidden = (!next && !relatedQuestion) || isSupport;
  $("#next-step").href = relatedQuestion
    ? `/learn?${isLesson ? "lesson" : "step"}=${encodeURIComponent(isLesson ? lesson : key)}&question=${relatedQuestion.id}`
    : next
      ? `/learn?${isLesson ? "lesson" : "step"}=${encodeURIComponent(next)}`
      : "/learn";
  $("#next-step").textContent = relatedQuestion
    ? relatedQuestion.title
    : next
      ? (isLesson
          ? (marketQuestions[next]?.[0].title ?? marketLabels[next] ?? next)
          : data.steps[next].title) + " →"
      : "";
  for (const a of document.querySelectorAll(".learn-sidebar nav a"))
    a.setAttribute(
      "aria-current",
      (isLesson ? a.dataset.lesson === lesson : a.dataset.step === key)
        ? "page"
        : "false",
    );
  gallery = isQuestionGuide
    ? questions.flatMap((q) =>
        q.rows
          .filter((row) => row.src)
          .map((row) => ({ src: row.src, caption: row.title })),
      )
    : (item.images ??
      (item.image ? [{ src: item.image, caption: item.title }] : []));
  $("#gallery-section").hidden = isQuestionGuide || !gallery.length;
  $("#question-guide").classList.toggle("futures-guide", isFutures || isMarket);
  if (isQuestionGuide)
    renderQuestions(params, questions, isLesson ? lesson : key, isLesson);
  $("#gallery-count").textContent = `${gallery.length} IMAGES`;
  $("#guide-media").replaceChildren();
  if (!isQuestionGuide)
    gallery.forEach((img, i) => {
      const fig = node("figure");
      const b = node("button");
      b.setAttribute("aria-label", `放大第 ${i + 1} 張：${img.caption}`);
      const image = node("img");
      image.src = img.src;
      image.alt = img.caption;
      image.loading = "lazy";
      b.append(image);
      b.onclick = () => showImage(i);
      fig.append(
        b,
        node(
          "figcaption",
          `${String(i + 1).padStart(2, "0")} / ${img.caption}`,
        ),
      );
      $("#guide-media").append(fig);
    });
  if (focus)
    $(isQuestionGuide ? "#question-title" : "#guide-title").focus({
      preventScroll: true,
    });
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (
    !data ||
    !a ||
    e.ctrlKey ||
    e.metaKey ||
    e.shiftKey ||
    e.altKey ||
    e.button !== 0 ||
    a.target
  )
    return;
  const u = new URL(a.href);
  if (u.origin !== location.origin || u.pathname != "/learn") return;
  e.preventDefault();
  history.pushState(null, "", u);
  render(true);
  $(
    ["deposit_bitopro", "deposit_card"].includes(u.searchParams.get("step"))
      ? "#question-nav"
      : "#guide-title",
  ).scrollIntoView({ block: "start", behavior: "instant" });
});
addEventListener("popstate", () => data && render());
$("#close-image").onclick = () => $("#image-dialog").close();
$("#zoom-image").onclick = () => {
  const zoomed = $("#image-scroll").classList.toggle("zoomed");
  $("#zoom-image").setAttribute("aria-pressed", String(zoomed));
  $("#zoom-image").textContent = zoomed ? "縮回全圖" : "放大看細節";
};
$("#previous-image").onclick = () => picture > 0 && showImage(picture - 1);
$("#next-image").onclick = () =>
  picture + 1 < gallery.length && showImage(picture + 1);
$("#image-dialog").addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" && picture + 1 < gallery.length) {
    e.preventDefault();
    showImage(picture + 1);
  }
  if (e.key === "ArrowLeft" && picture > 0) {
    e.preventDefault();
    showImage(picture - 1);
  }
});
fetch("/content.json")
  .then((r) => {
    if (!r.ok) throw Error();
    return r.json();
  })
  .then((d) => {
    data = d;
    data.lessons = { [supportLessonTitle]: supportLessonSummary, ...d.lessons };
    for (const [key, questions] of Object.entries(marketQuestions)) {
      if (!Object.hasOwn(data.lessons, key))
        data.lessons[key] = questions[0].intro;
    }
    for (const [key, s] of Object.entries(data.steps)) {
      const a = node("a", s.title);
      a.href = "/learn?step=" + key;
      a.dataset.step = key;
      if (s.parent) a.dataset.child = "true";
      $("#guide-tabs").append(a);
    }
    for (const key of Object.keys(data.lessons)) {
      const a = node("a", marketLabels[key] ?? key);
      a.href = "/learn?lesson=" + encodeURIComponent(key);
      a.dataset.lesson = key;
      $(
        marketLessonKeys.includes(key) ? "#market-tabs" : "#lesson-tabs",
      ).append(a);
    }
    render();
  })
  .catch(() => {
    $("#guide-title").textContent = "教學暫時無法載入";
    $("#guide-error").textContent = "請重新整理，或聯繫 LINE 小幫手。";
  });
import { bitoproQuestions } from "./guide-bitopro.js";

import { cardQuestions } from "./guide-card.js";
import { futuresQuestions, futuresSource } from "./lesson-futures.js";
import {
  marketQuestions,
  marketLessonKeys,
  marketLabels,
} from "./lesson-market.js";
import { setCalculatorVisible } from "./rate-calculator.js";
import { renderLessonNotes } from "./lesson-notes.js";
import {
  supportLessonTitle,
  supportLessonSummary,
  renderSupportLesson,
} from "./lesson-support.js";
