import {
  courses,
  paths,
  courseById,
  isAvailable,
  statusLabel,
  durationLabel,
} from "./academy-catalog.js";

const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const conceptIcon = `<svg viewBox="0 0 48 32" aria-hidden="true"><path d="M8 7v19M24 2v26M40 6v24"/><path d="M5 12h6v8H5zM21 7h6v14h-6zM37 15h6v8h-6z" class="solid"/></svg>`;
const storyIcon = `<svg viewBox="0 0 48 32" aria-hidden="true"><path d="M2 25h9V15h10V6h11v14h14"/><circle cx="21" cy="15" r="4" class="solid"/></svg>`;

export function renderCard(course) {
  const available = isAvailable(course),
    href = available ? `href="${course.href}"` : "";
  const tag = available ? "a" : "article";
  const dependencies = course.prerequisites
    .map((id) => courseById(id)?.title)
    .filter(Boolean)
    .join("、");
  return `<${tag} ${href} class="lesson-card ${available ? "" : "planned"}" data-course-id="${course.id}">
    <div class="card-top"><span class="card-id">${course.kind === "concept" ? "C" : "S"} / ${course.number}</span><span class="course-status ${course.status}">${statusLabel(course)}</span></div>
    <div class="card-title"><h3>${escape(course.title)}</h3><span aria-hidden="true">${available ? "↗" : "·"}</span></div>
    <p>${escape(course.description)}</p>
    <div class="card-bottom"><span>${available ? durationLabel(course.duration) : "分鏡規劃中"}</span><span>${dependencies ? `先懂：${escape(dependencies)}` : "從這裡開始"}</span></div>
  </${tag}>`;
}

export function renderSections(selected) {
  if (!selected.length)
    return `<div class="empty-state"><p>這個範圍還沒有符合的課程。</p><button type="button" data-reset-filter>查看完整規劃</button></div>`;
  return ["concept", "story"]
    .map((kind) => {
      const group = selected.filter((c) => c.kind === kind);
      if (!group.length) return "";
      return `<section class="course-section" aria-labelledby="${kind}-title"><div class="section-heading"><div class="section-emblem">${kind === "concept" ? conceptIcon : storyIcon}</div><div><p>${kind === "concept" ? "01 / CONCEPTS" : "02 / MARKET STORIES"}</p><h2 id="${kind}-title">${kind === "concept" ? "名詞圖解" : "市場故事"}<span>${group.length}</span></h2></div><p class="section-description">${kind === "concept" ? "一次看懂一個名詞，隨時回來查。" : "帶著一個疑問，走進一段行情。"}</p></div><div class="course-grid">${group.map(renderCard).join("")}</div></section>`;
    })
    .join("");
}

export function renderPaths() {
  return paths
    .map(
      (path, i) =>
        `<button class="learning-path" type="button" data-learning-path="${path.id}" aria-pressed="false"><span class="path-index">0${i + 1}</span><span><strong>${path.label}</strong><small>${path.caption}</small></span><span class="path-arrow" aria-hidden="true">↗</span></button>`,
    )
    .join("");
}

export function renderLessonNavigation(id, chapters = "") {
  return ["concept", "story"]
    .map(
      (kind) =>
        `<h2 class="course-group">${kind === "concept" ? "名詞圖解" : "市場故事"}</h2>` +
        courses
          .filter((c) => c.kind === kind && isAvailable(c))
          .map(
            (c) =>
              `<a href="${c.href}"${c.id === id ? ' class="course-current" aria-current="page"' : ""}><span class="course-number">${c.number}</span><span><small>${escape(c.subtitle)}</small><strong>${escape(c.title)}</strong></span></a>${c.id === id ? chapters : ""}`,
          )
          .join(""),
    )
    .join("");
}

export function renderPrerequisites(id) {
  const course = courseById(id);
  if (!course?.prerequisites.length) return "";
  return `<div class="lesson-prerequisite"><span>先懂這些，會更好看</span>${course.prerequisites
    .map(courseById)
    .filter(isAvailable)
    .map((c) => `<a href="${c.href}"><strong>${escape(c.title)} ↗</strong></a>`)
    .join("")}</div>`;
}
